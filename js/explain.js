/* 점수의 '산출 근거' 문장을 만든다. 평가서와 화면이 함께 쓴다 (계산은 model.js, 문장만 여기서). */
import { D, formatNumber as fmt } from './decimal.js';
import { josa } from './korean.js';
import { AGGREGATION_LABELS, DIRECTION_LABELS, countReasons, exclusionReason } from './model.js';
import { COMPETENCY_SCALE, LOWER, MAX_ACHIEVEMENT } from './scoring.js';

const pct = (dec) => dec.toFixed(1) + '%';
const pts = (dec) => dec.toFixed(2);
const unitOf = (kpi) => kpi.unit || '';
const inexact = (dec, places) => dec.decimals() > places;

function terms(records) {
  const values = records.map((record) => fmt(record.value));
  if (values.length <= 6) return values.join(' + ');
  return `${values.slice(0, 3).join(' + ')} + … + ${values[values.length - 1]} (${values.length}건)`;
}

/** 실적(집계) 근거 */
export function explainActual(result) {
  const { kpi, evidenced, excluded, actual, sum, latest } = result;
  const unit = unitOf(kpi);
  const lines = [];
  if (kpi.aggregation === 'COUNT') {
    lines.push(`실적 = 근거 있는 기록 ${evidenced.length}건 → ${evidenced.length}${unit}`);
  } else if (actual === null) {
    lines.push('근거 있는 실적 기록이 없어 실적을 계산하지 않았습니다.');
  } else if (kpi.aggregation === 'LATEST') {
    lines.push(`실적 = 날짜가 가장 늦은 근거 있는 기록(${latest.date})의 수치 = ${fmt(actual)}${unit}`);
  } else if (kpi.aggregation === 'AVG') {
    const exact = sum.div(BigInt(evidenced.length));
    lines.push(`실적 = 근거 있는 기록 ${evidenced.length}건의 평균 = (${terms(evidenced)}) ÷ ${evidenced.length} = ${fmt(actual)}${unit}`
      + (inexact(exact, 2) ? ' (소수 둘째 자리 반올림)' : ''));
  } else {
    lines.push(`실적 = 근거 있는 기록 ${evidenced.length}건의 합계 = ${terms(evidenced)} = ${fmt(actual)}${unit}`);
  }
  if (excluded.length) {
    const reasons = countReasons([result]);
    const kinds = Object.keys(reasons);
    lines.push(kinds.length === 1 && kinds[0] === '근거 없음'
      ? `근거 없는 기록 ${excluded.length}건은 점수에서 뺐습니다.`
      : `점수에서 뺀 기록 ${excluded.length}건: ` + kinds.map((kind) => `${kind} ${reasons[kind]}건`).join(', '));
  }
  return lines;
}

/** 달성률과 KPI 점수 근거 */
export function explainScore(result, period) {
  const { kpi, actual, achievement, score } = result;
  if (actual === null || achievement === null) return [];
  const unit = unitOf(kpi);
  const target = D(kpi.target);
  const lines = [];
  if (target.cmp(0) <= 0) {
    const met = kpi.direction === LOWER ? actual.cmp(target) <= 0 : actual.cmp(target) >= 0;
    lines.push(`달성률: 목표가 ${fmt(target)}${unit}인 ${kpi.direction === LOWER ? '하향' : '상향'} 지표이므로, ${josa(`실적 ${fmt(actual)}${unit}`, '은')} `
      + (met ? '목표를 지켜 100%' : '목표를 못 지켜 0%'));
  } else {
    const ratio = actual.div(target);
    const raw = kpi.direction === LOWER ? D(2).sub(ratio).mul(100) : ratio.mul(100);
    const formula = kpi.direction === LOWER
      ? `(2 − 실적 ÷ 목표) × 100 = (2 − ${fmt(actual)} ÷ ${fmt(target)}) × 100`
      : `실적 ÷ 목표 × 100 = ${fmt(actual)} ÷ ${fmt(target)} × 100`;
    if (raw.sign() < 0) {
      lines.push(`달성률 = ${formula} = ${raw.toFixed(1)}% → 0% 아래는 0%로 봅니다`);
    } else if (raw.cmp(MAX_ACHIEVEMENT) > 0) {
      lines.push(`달성률 = ${formula} = ${fmt(raw, 1)}% → 계산 한도 ${fmt(MAX_ACHIEVEMENT, 1)}%로 봅니다`);
    } else {
      lines.push(`달성률 = ${formula} = ${pct(achievement)}` + (inexact(raw, 1) ? ' (소수 첫째 자리 반올림)' : ''));
    }
  }
  const cap = D(period.cap);
  if (achievement.cmp(cap) > 0) lines.push(`KPI 점수 = 달성률 ${josa(pct(achievement), '이')} 상한 ${period.cap}%를 넘어 ${pts(score)}점`);
  else lines.push(`KPI 점수 = 달성률 그대로 ${pts(score)}점 (상한 ${period.cap}%)`);
  return lines;
}

/** 정량 점수 근거 */
export function explainKpiTotal(sheet) {
  if (!sheet.kpis.length) return ['KPI가 없습니다.'];
  if (sheet.kpiScore === null) return ['점수가 나오지 않은 KPI가 있어 정량 점수를 계산하지 않았습니다.'];
  const parts = sheet.kpis.map((result) => `${pts(result.score)} × ${result.kpi.weight}`).join(' + ');
  const exact = sheet.kpis.reduce((acc, result) => acc.add(result.score.mul(BigInt(result.kpi.weight))), D(0)).div(BigInt(sheet.weightTotal));
  return [`정량 점수 = Σ(KPI 점수 × 가중치) ÷ 가중치 합계 = (${parts}) ÷ ${sheet.weightTotal} = ${pts(sheet.kpiScore)}`
    + (inexact(exact, 2) ? ' (소수 둘째 자리 반올림)' : '')];
}

export const COMPETENCY_LEGEND = '환산표: ' + COMPETENCY_SCALE.map(([value, label, points]) => `${value} ${label} ${points}점`).join(' · ');

/** 역량 점수 근거 */
export function explainCompetency(sheet) {
  if (!sheet.usesCompetency) return [];
  if (sheet.competencyScore === null) return ['역량 평가가 남은 항목이 있어 역량 점수를 계산하지 않았습니다.'];
  const values = sheet.competencies.map((c) => c.points.toPlain(2));
  const exact = sheet.competencies.reduce((acc, c) => acc.add(c.points), D(0)).div(BigInt(values.length));
  return [`역량 점수 = 항목별 환산 점수의 평균 = (${values.join(' + ')}) ÷ ${values.length} = ${pts(sheet.competencyScore)}`
    + (inexact(exact, 2) ? ' (소수 둘째 자리 반올림)' : ''), COMPETENCY_LEGEND];
}

/** 종합 점수 근거 */
export function explainTotal(sheet) {
  const weight = Number(sheet.period.quantWeight);
  if (sheet.total === null) return ['아직 계산하지 못했습니다. ' + sheet.missing.join(' / ')];
  if (weight === 100) return [`종합 점수 = 정량 점수 = ${pts(sheet.total)} (정량 비중 100%)`];
  if (weight === 0) return [`종합 점수 = 역량 점수 = ${pts(sheet.total)} (역량 비중 100%)`];
  const quant = sheet.kpiScore.mul(BigInt(weight)).div(100);
  const qual = sheet.competencyScore.mul(BigInt(100 - weight)).div(100);
  const exact = quant.add(qual);
  return [`종합 점수 = 정량 ${pts(sheet.kpiScore)} × ${weight}% + 역량 ${pts(sheet.competencyScore)} × ${100 - weight}% = `
    + `${quant.toPlain(4)} + ${qual.toPlain(4)} = ${exact.toPlain(4)}`
    + (inexact(exact, 2) ? ` → ${pts(sheet.total)} (소수 둘째 자리 반올림)` : '')];
}

/** 등급 근거 */
export function explainGrade(sheet, periodResult) {
  const { period } = periodResult;
  if (sheet.total === null) return ['종합 점수가 나와야 등급을 정합니다.'];
  const rules = period.grades;
  if (period.gradingMethod === 'RELATIVE') {
    const bounds = periodResult.bounds;
    const counts = bounds.map((bound, i) => bound - (i ? bounds[i - 1] : 0));
    const quota = rules.map((rule, i) => `${rule.grade} ${counts[i]}명`).join(' · ');
    const tied = periodResult.sheets.filter((other) => other.rank === sheet.rank).length > 1;
    const gi = rules.findIndex((rule) => rule.grade === sheet.grade);
    const from = (gi ? bounds[gi - 1] : 0) + 1;
    return [
      `상대평가: 점수가 다 나온 ${periodResult.completeCount}명 중 ${sheet.rank}위` + (tied ? ' (동점자가 있어 같은 순위, 같은 등급)' : ''),
      `등급별 인원 (${periodResult.completeCount}명 × 누적 비율을 반올림해 나눔): ${quota}`,
      `${sheet.rank}위는 ${sheet.grade} 구간(${from === bounds[gi] ? `${from}위` : `${from}~${bounds[gi]}위`})이라 ${sheet.grade} 등급. 다른 사람의 평가가 끝나면 바뀔 수 있습니다.`,
    ];
  }
  const index = rules.findIndex((rule) => rule.grade === sheet.grade);
  const rule = rules[index];
  const lines = [];
  if (index === rules.length - 1 && D(sheet.total).cmp(rule.min) < 0) {
    lines.push(`절대평가: 종합 ${pts(sheet.total)}점이 모든 등급의 최저 점수보다 낮아 가장 낮은 ${sheet.grade} 등급`);
  } else {
    lines.push(`절대평가: 종합 ${pts(sheet.total)}점 ≥ ${rule.grade} 최저 ${fmt(rule.min)}점 → ${sheet.grade} 등급`);
  }
  if (index > 0) lines.push(`(한 단계 위 ${josa(rules[index - 1].grade, '은')} ${fmt(rules[index - 1].min)}점 이상)`);
  return lines;
}

/** 등급 기준표 한 줄 요약 */
export function gradeRuleSummary(period) {
  if (period.gradingMethod === 'RELATIVE') {
    return '상대평가 · ' + period.grades.map((rule) => `${rule.grade} ${fmt(rule.ratio)}%`).join(' · ');
  }
  return '절대평가 · ' + period.grades.map((rule) => `${rule.grade} ${fmt(rule.min)}점 이상`).join(' · ');
}

/** KPI 정의 한 줄. 예) 목표 50,000만원 · 상향 (높을수록 좋음) · 집계: 합계 */
export function kpiDefinition(kpi) {
  return `목표 ${fmt(kpi.target)}${unitOf(kpi)} · ${DIRECTION_LABELS[kpi.direction]} · 집계: ${AGGREGATION_LABELS[kpi.aggregation]}`;
}

/** 기록의 수치 (건수 지표는 빈칸). */
export function recordValue(kpi, record) {
  if (kpi.aggregation === 'COUNT' || record.value === '' || record.value === undefined || record.value === null) return '';
  return fmt(record.value) + unitOf(kpi);
}

/** 기록 한 줄 (텍스트 평가서용). */
export function recordLine(kpi, record) {
  const value = recordValue(kpi, record);
  const evidence = record.evidence && record.evidence.trim();
  return [record.date, value, record.content || ''].filter(Boolean).join(' ') + (evidence ? ` [근거: ${evidence}]` : '');
}

export function personLine(person) {
  const parts = [person?.dept, person?.position, person?.code && `사번 ${person.code}`].filter(Boolean);
  return (person?.name || '(이름 없음)') + (parts.length ? ` (${parts.join(' · ')})` : '');
}

export function periodLine(period) {
  const dates = period.start || period.end ? ` (${period.start || '?'} ~ ${period.end || '?'})` : '';
  return period.name + dates;
}

/** 평가 결과 한 줄. 예) 종합 106.31점 · A 등급 (2명 중 1위) */
export function resultLine(sheet, periodResult) {
  if (sheet.total === null) return '미완료 — ' + sheet.missing.join(' / ');
  return `종합 ${pts(sheet.total)}점 · ${sheet.grade} 등급 (${periodResult.completeCount}명 중 ${sheet.rank}위)`;
}

export const competencyLabel = (score) => (COMPETENCY_SCALE.find(([value]) => value === Number(score)) || [])[1] || '';

/** 메신저·메일에 붙여 넣을 텍스트 평가서. */
export function reportText(sheet, periodResult, today) {
  const { period } = sheet;
  const weight = Number(period.quantWeight);
  const out = [];
  out.push(`[인사고과 평가서] ${periodLine(period)}`);
  out.push(`대상: ${personLine(sheet.person)}`);
  out.push(resultLine(sheet, periodResult));
  const scores = [];
  if (weight > 0) scores.push(`정량 ${sheet.kpiScore ? pts(sheet.kpiScore) : '-'} (비중 ${weight}%)`);
  if (sheet.usesCompetency) scores.push(`역량 ${sheet.competencyScore ? pts(sheet.competencyScore) : '-'} (비중 ${100 - weight}%)`);
  out.push(scores.join(' · '));
  if (weight > 0) {
    out.push('', '■ 정량 평가 (KPI)');
    sheet.kpis.forEach((result, index) => {
      const { kpi } = result;
      out.push(`${index + 1}. ${kpi.title} — 가중치 ${kpi.weight}%`);
      out.push(`  ${kpiDefinition(kpi)}`);
      if (kpi.method) out.push(`  측정 방법·인정 근거: ${kpi.method}`);
      for (const line of [...explainActual(result), ...explainScore(result, period)]) out.push(`  ${line}`);
      if (result.evidenced.length) out.push('  점수에 넣은 기록:', ...result.evidenced.map((record) => `  - ${recordLine(kpi, record)}`));
      if (result.excluded.length) {
        out.push('  점수에서 뺀 기록:', ...result.excluded.map((record) => `  - ${recordLine(kpi, record)} (${exclusionReason(kpi, record)})`));
      }
    });
    out.push(...explainKpiTotal(sheet));
  }
  if (sheet.usesCompetency) {
    out.push('', '■ 역량 평가 (사례 근거)');
    for (const { item, rating, points } of sheet.competencies) {
      if (!rating) {
        out.push(`- ${item.name}: 평가 전`);
        continue;
      }
      out.push(`- ${item.name}: ${rating.score} ${competencyLabel(rating.score)} (${points.toPlain(2)}점)`);
      for (const c of rating.cases.filter((x) => x.date && x.content && x.content.trim())) out.push(`  · ${c.date} ${c.content.trim()}`);
    }
    out.push(...explainCompetency(sheet));
  }
  out.push('', '■ 종합', ...explainTotal(sheet), ...explainGrade(sheet, periodResult), `등급 기준: ${gradeRuleSummary(period)}`);
  if (sheet.sheet.comment && sheet.sheet.comment.trim()) out.push('', '■ 평가 의견', sheet.sheet.comment.trim());
  out.push('', `(이 기기의 '인사고과 개인용' 앱에 입력한 자료로 계산 · 작성일 ${today})`);
  return out.join('\n');
}
