/* 자료 구조와 계산. 화면(app.js)과 테스트가 함께 쓴다. 브라우저 기능은 쓰지 않는다.

   자료는 JSON 문서 하나다 (이 기기의 IndexedDB 에 통째로 저장하고, 백업 파일도 같은 모양이다).
     people   평가 대상 (이름·부서·직급)
     periods  평가 회차 (기간, 정량 비중, 점수 상한, 등급 기준, 역량 항목)
     sheets   회차 × 사람 한 장의 평가표 (평가 의견)
     kpis     평가표의 KPI (목표·가중치·방향·실적 집계 방식)
     records  KPI 실적 기록 (날짜·수치·내용·근거) — 근거가 비어 있으면 점수에 넣지 않는다
     ratings  역량 평가 (1~5점 + 사례 근거) — 사례(날짜·내용)가 하나도 없으면 저장하지 않는다
   숫자는 모두 문자열로 저장한다 ('1250.5'). 계산은 decimal.js 로 정확하게 한다. */
import { D, Dec, ZERO, formatNumber } from './decimal.js';
import { josa } from './korean.js';
import * as S from './scoring.js';

export const APP_ID = 'hr-eval-personal';
export const SCHEMA = 1;

export const AGGREGATIONS = [
  ['SUM', '합계', '근거 있는 기록의 수치를 모두 더합니다. 예) 매출액, 처리량'],
  ['COUNT', '건수', '근거 있는 기록 1건을 1건으로 셉니다. 예) 신규 계약 건수, 고객 불만 건수'],
  ['AVG', '평균', '근거 있는 기록 수치의 평균입니다. 예) 고객 만족도 점수'],
  ['LATEST', '최근 값', '날짜가 가장 늦은 근거 있는 기록의 수치입니다. 예) 기말 기준 불량률'],
];
export const AGGREGATION_LABELS = Object.fromEntries(AGGREGATIONS.map(([code, label]) => [code, label]));
export const DIRECTION_LABELS = { HIGHER: '상향 (높을수록 좋음)', LOWER: '하향 (낮을수록 좋음)' };

export const DEFAULT_GRADES = [
  { grade: 'S', ratio: '10', min: '115' },
  { grade: 'A', ratio: '20', min: '105' },
  { grade: 'B', ratio: '40', min: '95' },
  { grade: 'C', ratio: '20', min: '80' },
  { grade: 'D', ratio: '10', min: '0' },
];
export const DEFAULT_COMPETENCIES = [
  ['책임감', '맡은 업무를 기한과 품질 기준에 맞게 끝까지 완수한다.'],
  ['협업', '동료·다른 부서와 정보를 나누고 공동 목표에 기여한다.'],
  ['전문성', '직무 지식과 기술을 갖추고 꾸준히 높인다.'],
  ['문제 해결', '원인을 분석해 실행할 수 있는 대안을 내고 실행한다.'],
];

// ---------------------------------------------------------------- 문서
export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyDoc(now = new Date().toISOString()) {
  return {
    schema: SCHEMA, people: [], periods: [], sheets: [], kpis: [], records: [], ratings: [],
    meta: { createdAt: now, lastBackupAt: null, currentPeriodId: null },
  };
}

export function newPeriod(fields = {}) {
  return {
    id: newId(), name: '', start: '', end: '', quantWeight: 80, cap: 120, gradingMethod: 'ABSOLUTE',
    grades: DEFAULT_GRADES.map((rule) => ({ ...rule })),
    competencies: DEFAULT_COMPETENCIES.map(([name, description]) => ({ id: newId(), name, description })),
    createdAt: new Date().toISOString(),
    ...fields,
  };
}

export const byId = (list, id) => list.find((item) => item.id === id) || null;

/** 문서 모양을 확인하고 빠진 칸을 채운다 (백업 되돌리기·앱 시작 때). */
export function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('자료 형식이 아닙니다.');
  if (doc.schema !== SCHEMA) throw new Error(`이 앱이 읽을 수 없는 자료 판(${doc.schema})입니다.`);
  const fresh = emptyDoc();
  for (const key of ['people', 'periods', 'sheets', 'kpis', 'records', 'ratings']) {
    if (doc[key] === undefined) doc[key] = [];
    if (!Array.isArray(doc[key])) throw new Error(`'${key}' 자료가 목록이 아닙니다.`);
  }
  doc.meta = { ...fresh.meta, ...(doc.meta || {}) };
  return doc;
}

// ---------------------------------------------------------------- 입력값 확인
/** 숫자 칸을 확인해 문자열('1250.5')로 돌려준다. 잘못되면 { error }. */
export function parseNumber(text, { required = true, min = null, max = null, integer = false, places = 2, label = '값' } = {}) {
  const raw = String(text ?? '').trim();
  if (!raw) return required ? { error: `${josa(label, '을')} 넣어 주세요.` } : { value: '' };
  const dec = Dec.parse(raw);
  const topic = josa(label, '은');
  if (!dec) return { error: `${topic} 숫자로 넣어 주세요.` };
  if (integer && dec.decimals() !== 0) return { error: `${topic} 정수로 넣어 주세요.` };
  if (dec.decimals() > places) return { error: `${topic} 소수 ${places}자리까지 넣을 수 있습니다.` };
  if (min !== null && dec.cmp(min) < 0) return { error: `${topic} ${formatNumber(min)} 이상이어야 합니다.` };
  if (max !== null && dec.cmp(max) > 0) return { error: `${topic} ${formatNumber(max)} 이하여야 합니다.` };
  return { value: dec.toPlain(places) };
}

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;
export function parseDate(text, { required = true, label = '날짜' } = {}) {
  const raw = String(text ?? '').trim();
  if (!raw) return required ? { error: `${josa(label, '을')} 넣어 주세요.` } : { value: '' };
  const parsed = new Date(raw + 'T00:00:00Z');
  if (!DATE_TEXT.test(raw) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    return { error: `${josa(label, '이')} 올바르지 않습니다 (예: 2026-07-15).` };
  }
  return { value: raw };
}

// ---------------------------------------------------------------- 실적과 점수
export const hasEvidence = (record) => Boolean(record.evidence && record.evidence.trim());

/** 점수에 넣지 않는 이유. 넣는 기록이면 null.
    근거가 없거나, 수치가 필요한 집계(합계·평균·최근 값)인데 수치가 없으면 뺀다. */
export function exclusionReason(kpi, record) {
  if (!hasEvidence(record)) return '근거 없음';
  if (kpi.aggregation !== 'COUNT' && Dec.parse(record.value ?? '') === null) return '수치 없음';
  return null;
}

/** 회차 기간 밖 날짜인지 (기간을 정한 경우만). 점수에는 들어가고 화면에 표시만 한다. */
export function outsidePeriod(period, record) {
  return Boolean(record.date && ((period.start && record.date < period.start) || (period.end && record.date > period.end)));
}

function byDate(a, b) {
  return (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '');
}

export function recordsOf(doc, kpiId) {
  return doc.records.filter((record) => record.kpiId === kpiId).sort(byDate);
}

/** 근거 있는 기록으로 실적을 집계한다. 기록이 없으면 실적 없음(null) — 건수만 0건이 된다. */
export function aggregate(kpi, evidenced) {
  if (kpi.aggregation === 'COUNT') return { actual: D(evidenced.length) };
  if (!evidenced.length) return { actual: null };
  if (kpi.aggregation === 'LATEST') {
    const latest = evidenced[evidenced.length - 1];
    return { actual: D(latest.value), latest };
  }
  const sum = evidenced.reduce((acc, record) => acc.add(D(record.value)), ZERO);
  if (kpi.aggregation === 'AVG') return { actual: sum.div(BigInt(evidenced.length)).round(2), sum };
  return { actual: sum.round(2), sum };
}

export function kpiResult(doc, kpi, period) {
  const records = recordsOf(doc, kpi.id);
  const evidenced = records.filter((record) => !exclusionReason(kpi, record));  // 점수에 넣는 기록
  const excluded = records.filter((record) => exclusionReason(kpi, record));
  const outside = records.filter((record) => outsidePeriod(period, record));
  const { actual, sum, latest } = aggregate(kpi, evidenced);
  const achievement = actual === null ? null : S.achievementRate(kpi.direction, kpi.target, actual);
  const score = achievement === null ? null : S.goalScore(achievement, period.cap);
  return { kpi, records, evidenced, excluded, outside, actual, sum, latest, achievement, score };
}

/** 역량 평가가 저장 조건을 채웠는지: 1~5점이고 날짜·내용이 있는 사례가 하나 이상. */
export function validCases(cases) {
  return (cases || []).filter((item) => item && item.date && item.content && item.content.trim());
}

export function ratingIsValid(rating) {
  return Boolean(rating && rating.score in S.COMPETENCY_POINTS && validCases(rating.cases).length);
}

export function kpisOf(doc, sheetId) {
  return doc.kpis.filter((kpi) => kpi.sheetId === sheetId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function sheetResult(doc, sheet) {
  const period = byId(doc.periods, sheet.periodId);
  const person = byId(doc.people, sheet.personId);
  const kpis = kpisOf(doc, sheet.id).map((kpi) => kpiResult(doc, kpi, period));
  const weightTotal = kpis.reduce((sum, result) => sum + Number(result.kpi.weight), 0);
  const kpiScore = kpis.length ? S.weightedKpiScore(kpis.map((result) => [result.kpi.weight, result.score])) : null;
  const usesCompetency = Number(period.quantWeight) < 100;
  const competencies = usesCompetency ? period.competencies.map((item) => {
    const rating = doc.ratings.find((r) => r.sheetId === sheet.id && r.itemId === item.id) || null;
    const valid = ratingIsValid(rating);
    return { item, rating: valid ? rating : null, points: valid ? S.COMPETENCY_POINTS[rating.score] : null };
  }) : [];
  const competencyScore = usesCompetency ? S.competencyScore(competencies.map((c) => (c.rating ? c.rating.score : null))) : null;
  const total = S.totalScore(kpiScore, competencyScore, period.quantWeight);

  const missing = [];
  const notes = [];
  if (Number(period.quantWeight) > 0) {
    if (!kpis.length) missing.push('KPI가 없습니다.');
    const noActual = kpis.filter((result) => result.actual === null).map((result) => result.kpi.title);
    if (noActual.length) missing.push(`근거 있는 실적이 없는 KPI: ${noActual.join(', ')}`);
    if (kpis.length && weightTotal <= 0) missing.push('KPI 가중치 합계가 0입니다.');
    else if (kpis.length && weightTotal !== 100) {
      notes.push(`KPI 가중치 합계가 ${weightTotal}%입니다. 100%가 되게 맞추는 것이 좋습니다 (점수는 가중치 합계로 나눠 계산합니다).`);
    }
  }
  if (usesCompetency) {
    if (!period.competencies.length) missing.push('회차에 역량 항목이 없습니다. 회차 설정에서 항목을 넣거나 정량 비중을 100%로 하세요.');
    const unrated = competencies.filter((c) => !c.rating).map((c) => c.item.name);
    if (unrated.length) missing.push(`역량 평가가 남은 항목: ${unrated.join(', ')}`);
  }
  const excludedCount = kpis.reduce((sum, result) => sum + result.excluded.length, 0);
  const evidencedCount = kpis.reduce((sum, result) => sum + result.evidenced.length, 0);
  const reasons = countReasons(kpis);
  if (reasons['근거 없음']) notes.push(`근거 없는 기록 ${reasons['근거 없음']}건은 점수에서 빠졌습니다. 근거를 채우면 점수에 들어갑니다.`);
  if (reasons['수치 없음']) notes.push(`수치가 없는 기록 ${reasons['수치 없음']}건은 점수에서 빠졌습니다 (집계 방식이 합계·평균·최근 값인 KPI).`);
  const outsideCount = kpis.reduce((sum, result) => sum + result.outside.length, 0);
  if (outsideCount) notes.push(`회차 기간 밖 날짜의 기록이 ${outsideCount}건 있습니다. 날짜를 확인하세요 (점수에는 들어갑니다).`);

  return {
    sheet, period, person, kpis, weightTotal, kpiScore, usesCompetency, competencies, competencyScore, total,
    missing, notes, excludedCount, evidencedCount, rank: null, grade: null,
  };
}

/** 뺀 기록을 이유별로 센다. 예) { '근거 없음': 2, '수치 없음': 1 } */
export function countReasons(kpiResults) {
  const counts = {};
  for (const result of kpiResults) {
    for (const record of result.excluded) {
      const reason = exclusionReason(result.kpi, record);
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return counts;
}

export function sheetsOf(doc, periodId) {
  return doc.sheets.filter((sheet) => sheet.periodId === periodId);
}

export function gradeRules(period) {
  return period.grades.map((rule) => (period.gradingMethod === 'RELATIVE' ? [rule.grade, rule.ratio] : [rule.grade, rule.min]));
}

/** 회차 전체: 평가표마다 점수를 내고, 점수가 다 나온 평가표끼리 등급을 매긴다. */
export function periodResult(doc, period) {
  const sheets = sheetsOf(doc, period.id).map((sheet) => sheetResult(doc, sheet));
  const complete = sheets.filter((result) => result.total !== null);
  const entries = complete.map((result) => ({
    key: result.sheet.id, total: result.total, kpi: result.kpiScore, competency: result.competencyScore,
  }));
  const rules = gradeRules(period);
  const allocation = period.gradingMethod === 'RELATIVE' ? S.allocateRelative(entries, rules) : S.allocateAbsolute(entries, rules);
  for (const result of complete) {
    const [rank, grade] = allocation.get(result.sheet.id) || [null, null];
    result.rank = rank;
    result.grade = grade;
  }
  const bounds = period.gradingMethod === 'RELATIVE' ? S.cumulativeQuota(complete.length, rules.map(([, ratio]) => ratio)) : null;
  const order = (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.person?.name || '').localeCompare(b.person?.name || '', 'ko');
  sheets.sort(order);
  return { period, sheets, completeCount: complete.length, bounds };
}

/** 등급 기준이 말이 되는지 확인한다. 반환: 문제 설명 목록. */
export function gradeRuleProblems(period) {
  const problems = [];
  if (!period.grades.length) problems.push('등급이 하나도 없습니다.');
  const names = period.grades.map((rule) => rule.grade.trim());
  if (names.some((name) => !name)) problems.push('이름이 빈 등급이 있습니다.');
  if (new Set(names).size !== names.length) problems.push('같은 이름의 등급이 있습니다.');
  if (period.gradingMethod === 'RELATIVE') {
    const total = period.grades.reduce((sum, rule) => sum.add(D(rule.ratio || 0)), ZERO);
    if (total.cmp(100) !== 0) problems.push(`상대평가 비율의 합이 ${total.toPlain(2)}%입니다. 100%가 되어야 합니다.`);
  } else {
    for (let i = 1; i < period.grades.length; i += 1) {
      if (D(period.grades[i].min || 0).cmp(D(period.grades[i - 1].min || 0)) > 0) {
        problems.push('절대평가 최저 점수는 위 등급일수록 높아야 합니다.');
        break;
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------- 고치기 (지우면 딸린 자료도 지운다)
export function deleteKpi(doc, kpiId) {
  doc.records = doc.records.filter((record) => record.kpiId !== kpiId);
  doc.kpis = doc.kpis.filter((kpi) => kpi.id !== kpiId);
}

export function deleteSheet(doc, sheetId) {
  for (const kpi of doc.kpis.filter((k) => k.sheetId === sheetId)) deleteKpi(doc, kpi.id);
  doc.ratings = doc.ratings.filter((rating) => rating.sheetId !== sheetId);
  doc.sheets = doc.sheets.filter((sheet) => sheet.id !== sheetId);
}

export function deletePeriod(doc, periodId) {
  for (const sheet of sheetsOf(doc, periodId)) deleteSheet(doc, sheet.id);
  doc.periods = doc.periods.filter((period) => period.id !== periodId);
  if (doc.meta.currentPeriodId === periodId) doc.meta.currentPeriodId = null;
}

export function deletePerson(doc, personId) {
  for (const sheet of doc.sheets.filter((s) => s.personId === personId)) deleteSheet(doc, sheet.id);
  doc.people = doc.people.filter((person) => person.id !== personId);
}

/** 다른 평가표의 KPI 정의(목표·가중치 등)만 복사한다. 실적 기록은 복사하지 않는다. */
export function copyKpis(doc, fromSheetId, toSheetId) {
  const now = new Date().toISOString();
  const start = kpisOf(doc, toSheetId).length;
  const copies = kpisOf(doc, fromSheetId).map((kpi, index) => ({
    ...kpi, id: newId(), sheetId: toSheetId, order: start + index, createdAt: now,
  }));
  doc.kpis.push(...copies);
  return copies.length;
}

// ---------------------------------------------------------------- 백업 · 내보내기
const BACKUP_REMINDER_DAYS = 7;

/** 백업을 권할 때인지: 직접 넣은 자료가 있고, 마지막 백업(없으면 처음 쓴 날) 뒤로 바뀌었고, 7일이 지났으면. */
export function backupDue(doc, now = Date.now()) {
  const own = doc.people.some((person) => !person.sample) || doc.periods.some((period) => !period.sample);
  if (!own) return false;
  const { changedAt, lastBackupAt, createdAt } = doc.meta;
  if (lastBackupAt && (!changedAt || changedAt <= lastBackupAt)) return false;
  const since = Date.parse(lastBackupAt || createdAt || changedAt || '');
  return Number.isNaN(since) || now - since >= BACKUP_REMINDER_DAYS * 86400000;
}

export function makeBackup(doc, now = new Date().toISOString()) {
  return JSON.stringify({ app: APP_ID, schema: SCHEMA, exportedAt: now, data: doc });
}

export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('백업 파일을 읽지 못했습니다 (JSON 형식이 아닙니다).');
  }
  if (!parsed || parsed.app !== APP_ID) throw new Error('이 앱에서 만든 백업 파일이 아닙니다.');
  return normalizeDoc(parsed.data);
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** 회차 결과 표 (엑셀에서 한글이 깨지지 않게 BOM을 붙인다). */
export function periodCsv(doc, period) {
  const result = periodResult(doc, period);
  const rows = [['순위', '이름', '부서', '직급', '정량 점수', '역량 점수', '종합 점수', '등급', '점수에 넣은 기록', '점수에서 뺀 기록(근거 없음 등)', '계산 상태']];
  for (const sheet of result.sheets) {
    rows.push([
      sheet.rank ?? '', sheet.person?.name ?? '', sheet.person?.dept ?? '', sheet.person?.position ?? '',
      sheet.kpiScore ? sheet.kpiScore.toFixed(2) : '', sheet.competencyScore ? sheet.competencyScore.toFixed(2) : '',
      sheet.total ? sheet.total.toFixed(2) : '', sheet.grade ?? '', sheet.evidencedCount, sheet.excludedCount,
      sheet.total ? '완료' : sheet.missing.join(' / '),
    ]);
  }
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- 예시 자료
/** 처음 써 보는 사람을 위한 예시 회차 (sample: true 표시 — [예시 지우기]로 한꺼번에 지운다). */
export function addSample(doc) {
  const now = new Date().toISOString();
  const period = newPeriod({ name: '예시 · 2026년 하반기', start: '2026-07-01', end: '2026-12-31', sample: true });
  doc.periods.push(period);
  const [responsibility, collaboration, expertise, solving] = period.competencies.map((item) => item.id);
  const people = [
    { name: '김하늘', dept: '영업1팀', position: '대리' },
    { name: '이준호', dept: '영업1팀', position: '과장' },
    { name: '박서연', dept: '영업1팀', position: '사원' },
  ].map((fields) => ({ id: newId(), code: '', memo: '예시 인물입니다.', sample: true, createdAt: now, ...fields }));
  doc.people.push(...people);

  const kpiDefs = [
    { title: '신규 계약 금액', unit: '만원', direction: 'HIGHER', weight: 40, target: '50000', aggregation: 'SUM', method: '계약서 금액 합계 (부가세 제외)' },
    { title: '신규 거래처', unit: '곳', direction: 'HIGHER', weight: 30, target: '6', aggregation: 'COUNT', method: '첫 거래를 시작한 거래처 수' },
    { title: '고객 불만', unit: '건', direction: 'LOWER', weight: 30, target: '3', aggregation: 'COUNT', method: '고객센터에 접수된 담당 고객 불만' },
  ];
  const plans = [
    { // 김하늘: 모두 근거 있음, 역량까지 완료
      records: [
        [0, '2026-07-15', '18000', '한빛상사 연간 공급 계약', '계약서 2026-071 (영업관리 시스템)'],
        [0, '2026-09-03', '21500', '대성물산 설비 계약', '계약서 2026-118'],
        [0, '2026-11-20', '16000', '세움유통 추가 계약', '계약서 2026-203'],
        [1, '2026-07-15', '', '한빛상사', '거래처 등록 7/15 (거래처 번호 C-3301)'],
        [1, '2026-08-11', '', '미래테크', '거래처 등록 8/11 (C-3355)'],
        [1, '2026-09-03', '', '대성물산', '거래처 등록 9/3 (C-3402)'],
        [1, '2026-10-27', '', '온누리식품', '거래처 등록 10/27 (C-3460)'],
        [1, '2026-11-20', '', '세움유통', '거래처 등록 11/20 (C-3517)'],
        [2, '2026-08-19', '', '납기 지연 문의', '고객센터 접수 VOC-8812'],
      ],
      ratings: [
        [responsibility, 4, '2026-09-30', '분기 마감 3일 전 대성물산 계약 서류를 모두 갖춰 마감 일정을 지킴'],
        [collaboration, 5, '2026-10-14', '물류팀과 납기 조정 회의를 먼저 열어 지연 건 2건을 해결'],
        [expertise, 3, '2026-08-25', '신제품 교육 이수 (교육 이수증), 제안서에 반영은 아직'],
        [solving, 4, '2026-11-05', '납기 지연 원인을 분석해 주문 마감 시각을 바꾸자고 제안, 채택'],
      ],
      comment: '신규 거래처 발굴이 좋았고, 고객 불만도 목표보다 적었다.',
    },
    { // 이준호: 근거 없는 기록 1건 (점수 제외), 역량 완료
      records: [
        [0, '2026-07-28', '30000', '그린에너지 1차 계약', '계약서 2026-089'],
        [0, '2026-10-02', '12000', '그린에너지 2차 계약', '계약서 2026-160'],
        [0, '2026-11-25', '6000', '그린에너지 유지보수 계약', '계약서 2026-211'],
        [0, '2026-12-10', '9000', '예정 계약 (구두 합의)', ''],
        [1, '2026-07-28', '', '그린에너지', '거래처 등록 7/28 (C-3378)'],
        [1, '2026-09-16', '', '하나정밀', '거래처 등록 9/16 (C-3421)'],
        [1, '2026-10-20', '', '동해기계', '거래처 등록 10/20 (C-3450)'],
        [1, '2026-12-03', '', '서진전자', '거래처 등록 12/3 (C-3528)'],
        [2, '2026-08-02', '', '견적 오류', '고객센터 접수 VOC-8790'],
        [2, '2026-09-21', '', '담당자 연락 지연', '고객센터 접수 VOC-8901'],
        [2, '2026-11-12', '', '계약 조건 문의 응대 지연', '고객센터 접수 VOC-9033'],
        [2, '2026-12-01', '', '설치 일정 변경 불만', '고객센터 접수 VOC-9102'],
      ],
      ratings: [
        [responsibility, 3, '2026-10-02', '2차 계약 서류 보완 요청을 받고 하루 늦게 제출'],
        [collaboration, 4, '2026-09-16', '하나정밀 건에서 기술팀과 함께 현장 방문'],
        [expertise, 4, '2026-08-30', '에너지 설비 인증 교육 수료 (수료증 E-2207)'],
        [solving, 3, '2026-11-12', '응대 지연 원인을 정리했으나 개선안은 다음 회차로 미룸'],
      ],
      comment: '큰 계약을 따냈으나 고객 불만이 목표(3건)를 넘었다.',
    },
    { // 박서연: 아직 입력 중 — 역량 평가 없음, 신규 계약 실적에 근거 없음
      records: [
        [0, '2026-11-03', '5000', '소규모 납품 계약', ''],
        [1, '2026-10-08', '', '새봄상회', '거래처 등록 10/8 (C-3444)'],
      ],
      ratings: [],
      comment: '',
    },
  ];

  people.forEach((person, index) => {
    const plan = plans[index];
    const sheet = { id: newId(), periodId: period.id, personId: person.id, comment: plan.comment, createdAt: now, updatedAt: now };
    doc.sheets.push(sheet);
    const kpis = kpiDefs.map((def, order) => ({ id: newId(), sheetId: sheet.id, order, createdAt: now, ...def }));
    doc.kpis.push(...kpis);
    for (const [kpiIndex, date, value, content, evidence] of plan.records) {
      doc.records.push({ id: newId(), kpiId: kpis[kpiIndex].id, date, value, content, evidence, createdAt: now, updatedAt: now });
    }
    for (const [itemId, score, date, content] of plan.ratings) {
      doc.ratings.push({ id: newId(), sheetId: sheet.id, itemId, score, cases: [{ date, content }], updatedAt: now });
    }
  });
  doc.meta.currentPeriodId = period.id;
  return period;
}

export function hasSample(doc) {
  return doc.periods.some((period) => period.sample) || doc.people.some((person) => person.sample);
}

export function removeSample(doc) {
  for (const period of doc.periods.filter((p) => p.sample)) deletePeriod(doc, period.id);
  for (const person of doc.people.filter((p) => p.sample)) {
    if (!doc.sheets.some((sheet) => sheet.personId === person.id)) deletePerson(doc, person.id);
  }
}
