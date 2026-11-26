/* 점수 산정 규칙 — 서버판 evaluation/scoring.py 와 같은 규칙을 그대로 옮겼다.
   (personal/tests 의 scoring_cases.json 으로 두 쪽 결과가 같은지 확인한다.)

   1. KPI 달성률
      - 상향 지표(높을수록 좋음): 실적 ÷ 목표 × 100
      - 하향 지표(낮을수록 좋음): (2 − 실적 ÷ 목표) × 100   예) 목표 5건, 실적 4건 → 120%
      - 목표가 0인 지표: 목표를 지켰으면 100%, 못 지켰으면 0% (예: 안전사고 0건)
      - 0% 아래로는 내려가지 않는다. 소수 첫째 자리까지 (반올림).
   2. KPI 점수 = 달성률을 0 ~ 상한(회차 설정, 기본 120) 사이로 자른 값
   3. 정량 점수 = KPI 점수의 가중 평균
   4. 역량 점수 = 5점 척도를 환산표로 바꾼 값의 평균 (보통 = 100점)
   5. 종합 점수 = 정량 점수 × 정량 비중 + 역량 점수 × (100 − 정량 비중)
   6. 등급
      - 절대평가: 종합 점수가 등급별 최저 점수 이상인 가장 높은 등급
      - 상대평가: 종합 점수 순위대로 등급 비율만큼 배분. 등급별 누적 인원은 반올림한다.
        동점자는 같은 순위이고, 그중 가장 높은 순위가 받는 등급을 함께 받는다.
        순위는 종합 점수 → 정량 점수 → 역량 점수 순으로 비교한다. */
import { D, HUNDRED, ZERO, decMax, decMin } from './decimal.js';

export const HIGHER = 'HIGHER';
export const LOWER = 'LOWER';
export const MAX_ACHIEVEMENT = D('99999.9');  // 목표가 아주 작을 때 터무니없이 커지지 않게

// [척도, 라벨, 환산 점수]
export const COMPETENCY_SCALE = [
  [5, '탁월', '120'],
  [4, '우수', '110'],
  [3, '보통', '100'],
  [2, '미흡', '80'],
  [1, '부진', '60'],
];
export const COMPETENCY_POINTS = Object.fromEntries(COMPETENCY_SCALE.map(([value, , points]) => [value, D(points)]));
export const COMPETENCY_LABELS = Object.fromEntries(COMPETENCY_SCALE.map(([value, label]) => [value, label]));

const isMissing = (value) => value === null || value === undefined || value === '';

/** KPI 달성률(%) — 소수 1자리 Dec. 실적이나 목표가 없으면 null. */
export function achievementRate(direction, target, actual) {
  if (isMissing(target) || isMissing(actual)) return null;
  target = D(target);
  actual = D(actual);
  if (target.cmp(ZERO) <= 0) {
    const met = direction === LOWER ? actual.cmp(target) <= 0 : actual.cmp(target) >= 0;
    return (met ? HUNDRED : ZERO).round(1);
  }
  const ratio = actual.div(target);
  const rate = direction === LOWER ? D(2).sub(ratio).mul(HUNDRED) : ratio.mul(HUNDRED);
  return decMin(decMax(rate, ZERO), MAX_ACHIEVEMENT).round(1);
}

/** 달성률을 0 ~ 상한 사이로 자른 KPI 점수 — 소수 2자리 Dec. */
export function goalScore(achievement, cap) {
  if (isMissing(achievement)) return null;
  return decMin(decMax(D(achievement), ZERO), D(cap)).round(2);
}

/** [가중치, 점수] 목록의 가중 평균. 점수가 하나라도 없으면 null. */
export function weightedKpiScore(items) {
  if (!items.length || items.some(([, score]) => isMissing(score))) return null;
  const totalWeight = items.reduce((sum, [weight]) => sum + Number(weight), 0);
  if (totalWeight <= 0) return null;
  const sum = items.reduce((acc, [weight, score]) => acc.add(D(score).mul(BigInt(weight))), ZERO);
  return sum.div(BigInt(totalWeight)).round(2);
}

/** 5점 척도 평가 목록의 환산 점수 평균. 빠진 항목이 있으면 null. */
export function competencyScore(ratings) {
  if (!ratings.length || ratings.some((rating) => !(rating in COMPETENCY_POINTS))) return null;
  const sum = ratings.reduce((acc, rating) => acc.add(COMPETENCY_POINTS[rating]), ZERO);
  return sum.div(BigInt(ratings.length)).round(2);
}

/** 정량 비중(%)으로 섞은 종합 점수. 필요한 점수가 없으면 null. */
export function totalScore(kpi, competency, quantWeight) {
  quantWeight = Number(quantWeight);
  if (quantWeight > 0 && isMissing(kpi)) return null;
  if (quantWeight < 100 && isMissing(competency)) return null;
  let total = ZERO;
  if (quantWeight > 0) total = total.add(D(kpi).mul(BigInt(quantWeight)));
  if (quantWeight < 100) total = total.add(D(competency).mul(BigInt(100 - quantWeight)));
  return total.div(HUNDRED).round(2);
}

function sortKey(entry) {
  return [D(entry.total), isMissing(entry.kpi) ? ZERO : D(entry.kpi), isMissing(entry.competency) ? ZERO : D(entry.competency)];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    const c = a[i].cmp(b[i]);
    if (c) return c;
  }
  return 0;
}

/** 점수 높은 순으로 정렬하고 순위를 매긴다. 완전 동점은 같은 순위 (1, 2, 2, 4). */
export function rankEntries(entries) {
  const keyed = entries.map((entry) => ({ entry, key: sortKey(entry) }));
  keyed.sort((a, b) => compareKeys(b.key, a.key));  // 안정 정렬: 동점은 원래 순서
  const ranks = new Map();
  let previousKey = null;
  let previousRank = 0;
  keyed.forEach(({ entry, key }, index) => {
    const position = index + 1;
    const rank = previousKey && compareKeys(key, previousKey) === 0 ? previousRank : position;
    ranks.set(entry.key, rank);
    previousKey = key;
    previousRank = rank;
  });
  return { ordered: keyed.map(({ entry }) => entry), ranks };
}

/** 등급별 누적 정원. 누적 비율 × 인원을 반올림하고, 마지막 등급은 항상 전체 인원. */
export function cumulativeQuota(count, ratios) {
  const bounds = [];
  let cumulative = ZERO;
  for (const ratio of ratios) {
    cumulative = cumulative.add(D(ratio));
    const bound = Number(D(count).mul(cumulative).div(HUNDRED).round(0).toFixed(0));
    bounds.push(Math.min(bound, count));
  }
  if (bounds.length) bounds[bounds.length - 1] = count;
  return bounds;
}

/** 등급별 목표 인원 (누적 정원의 차이). */
export function quotaCounts(count, ratios) {
  const bounds = cumulativeQuota(count, ratios);
  return bounds.map((bound, i) => bound - (i ? bounds[i - 1] : 0));
}

/** 상대평가. rules: [[등급, 비율%]] 높은 등급부터. 반환: Map(key → [순위, 등급]). */
export function allocateRelative(entries, rules) {
  const { ordered, ranks } = rankEntries(entries);
  const result = new Map();
  if (!rules.length) return result;
  const grades = rules.map(([grade]) => grade);
  const bounds = cumulativeQuota(ordered.length, rules.map(([, ratio]) => ratio));
  for (const entry of ordered) {
    const position = ranks.get(entry.key) - 1;  // 동점자는 그중 가장 높은 순위의 자리로 등급을 받는다
    const index = bounds.findIndex((bound) => position < bound);
    result.set(entry.key, [ranks.get(entry.key), grades[index]]);
  }
  return result;
}

/** 절대평가. rules: [[등급, 최저 점수]] 높은 등급부터. 반환: Map(key → [순위, 등급]). */
export function allocateAbsolute(entries, rules) {
  const { ordered, ranks } = rankEntries(entries);
  const result = new Map();
  if (!rules.length) return result;
  for (const entry of ordered) {
    let grade = rules[rules.length - 1][0];
    for (const [candidate, minScore] of rules) {
      if (D(entry.total).cmp(minScore) >= 0) {
        grade = candidate;
        break;
      }
    }
    result.set(entry.key, [ranks.get(entry.key), grade]);
  }
  return result;
}
