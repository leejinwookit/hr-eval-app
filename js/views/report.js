/* 평가서: 점수·등급, 계산식, 점수에 넣은 기록과 뺀 기록, 역량 사례, 산정 규칙을 한 장에. 인쇄(PDF)와 글 보내기. */
import { formatNumber as fmt } from '../decimal.js';
import * as E from '../explain.js';
import * as M from '../model.js';
import { state } from '../state.js';
import { button, explainList, h, notice, shareText, toast, todayText } from '../ui.js';
import { notFound } from './evaluate.js';

const pts = (dec) => (dec ? dec.toFixed(2) : '-');

export function reportView({ id }) {
  const { doc } = state;
  const sheet = M.byId(doc.sheets, id);
  if (!sheet) return notFound('평가표');
  const period = M.byId(doc.periods, sheet.periodId);
  const periodResult = M.periodResult(doc, period);
  const r = periodResult.sheets.find((item) => item.sheet.id === id);
  const weight = Number(period.quantWeight);
  const today = todayText();
  const name = r.person ? r.person.name : '(지워진 사람)';

  const toolbar = h('div', { class: 'toolbar no-print' },
    button('인쇄 · PDF 저장', () => window.print(), 'primary'),
    button('글로 보내기', async () => {
      const outcome = await shareText(`${name} 평가서`, E.reportText(r, periodResult, today));
      if (outcome === 'copied') toast('평가서 글을 복사했습니다. 메일·메신저에 붙여 넣으세요.');
      else if (outcome === 'failed') toast('복사하지 못했습니다.', 'error');
    }));

  let n = 0;
  const sections = [];
  if (weight > 0) sections.push(quantSection(r, period, (n += 1)));
  if (r.usesCompetency) sections.push(competencySection(r, weight, (n += 1)));
  sections.push(h('section', null,
    h('h2', null, `${(n += 1)}. 종합 점수와 등급`),
    explainList([...E.explainTotal(r), ...E.explainGrade(r, periodResult)]),
    h('p', { class: 'small' }, `등급 기준: ${E.gradeRuleSummary(period)}`)));
  sections.push(h('section', null,
    h('h2', null, `${(n += 1)}. 평가 의견`),
    h('p', { class: 'comment' }, (sheet.comment || '').trim() || '(적은 의견 없음)')));
  sections.push(rulesSection(period, (n += 1)));

  const article = h('article', { class: 'report' },
    h('header', null,
      h('h1', null, '인사고과 평가서'),
      h('table', { class: 'meta' }, h('tbody', null,
        row2('회차', E.periodLine(period)),
        row2('평가 대상', E.personLine(r.person)),
        row2('작성일', today),
        row2('계산', '이 기기에 입력한 자료로 자동 계산 (근거를 적은 기록만 반영)')))),
    summary(r, periodResult, weight),
    sections,
    h('footer', { class: 'report-foot' }, '인사고과 개인용 · 서버 없이 이 기기에서 계산했습니다.'));

  return { title: '평가서', back: `#/sheet/${id}`, tab: 'eval', body: h('div', null, toolbar, article) };
}

const row2 = (label, value) => h('tr', null, h('th', null, label), h('td', null, value));

function summary(r, periodResult, weight) {
  const cell = (label, value, strong = false, sub = null) => h('div', { class: `score-cell${strong ? ' strong' : ''}` },
    h('span', null, label), h('strong', null, value), sub ? h('span', null, sub) : null);
  return h('section', { class: 'summary' },
    h('div', { class: 'score-grid' },
      weight > 0 ? cell(`정량 점수 (${weight}%)`, pts(r.kpiScore)) : null,
      r.usesCompetency ? cell(`역량 점수 (${100 - weight}%)`, pts(r.competencyScore)) : null,
      cell('종합 점수', pts(r.total), true),
      cell('등급', r.total === null ? '미정' : r.grade, true, r.total === null ? null : `${periodResult.completeCount}명 중 ${r.rank}위`)),
    r.total === null ? notice('warn', h('strong', null, '미완료: '), r.missing.join(' / ')) : null,
    h('p', { class: 'small muted' }, `점수에 넣은 기록 ${r.evidencedCount}건 · 점수에서 뺀 기록 ${r.excludedCount}건`));
}

function quantSection(r, period, n) {
  return h('section', null,
    h('h2', null, `${n}. 정량 평가 (KPI) — 비중 ${period.quantWeight}%`),
    r.kpis.length ? r.kpis.map((result, i) => kpiBlock(result, period, `${n}-${i + 1}`)) : h('p', null, 'KPI가 없습니다.'),
    h('div', { class: 'subtotal' }, explainList(E.explainKpiTotal(r))),
    r.notes.length ? explainList(r.notes, 'notes') : null);
}

function kpiBlock(result, period, label) {
  const { kpi } = result;
  return h('div', { class: 'kpi-block' },
    h('h3', null, `${label}. ${kpi.title} (가중치 ${kpi.weight}%)`),
    h('p', { class: 'def' }, E.kpiDefinition(kpi)),
    kpi.method ? h('p', { class: 'def' }, `측정 방법·인정 근거: ${kpi.method}`) : null,
    explainList([...E.explainActual(result), ...E.explainScore(result, period)]),
    result.evidenced.length
      ? recordTable('점수에 넣은 기록', kpi, result.evidenced, period, false)
      : h('p', { class: 'small muted' }, '점수에 넣은 기록이 없습니다.'),
    result.excluded.length ? recordTable('점수에서 뺀 기록', kpi, result.excluded, period, true) : null);
}

function recordTable(caption, kpi, records, period, excluded) {
  const count = kpi.aggregation === 'COUNT';
  return h('table', { class: `records${excluded ? ' excluded' : ''}` },
    h('caption', null, `${caption} ${records.length}건`),
    h('thead', null, h('tr', null,
      h('th', null, '날짜'), h('th', null, '내용'), count ? null : h('th', { class: 'num' }, '수치'), h('th', null, excluded ? '근거 · 뺀 이유' : '근거'))),
    h('tbody', null, records.map((record) => h('tr', null,
      h('td', { class: 'nowrap', dataset: { label: '날짜' } }, record.date, M.outsidePeriod(period, record) ? h('span', { class: 'flag' }, ' 기간 밖') : null),
      h('td', { dataset: { label: '내용' } }, record.content || ''),
      count ? null : h('td', { class: 'num', dataset: { label: '수치' } }, E.recordValue(kpi, record)),
      h('td', { dataset: { label: excluded ? '근거 · 뺀 이유' : '근거' } }, excluded
        ? `${(record.evidence || '').trim() || '-'} · ${M.exclusionReason(kpi, record)}`
        : record.evidence.trim())))));
}

function competencySection(r, weight, n) {
  return h('section', null,
    h('h2', null, `${n}. 역량 평가 (사례 근거) — 비중 ${100 - weight}%`),
    h('table', { class: 'records' },
      h('thead', null, h('tr', null, h('th', null, '항목'), h('th', null, '평가'), h('th', null, '사례 (근거)'))),
      h('tbody', null, r.competencies.map(({ item, rating, points }) => h('tr', null,
        h('td', { dataset: { label: '항목' } }, h('strong', null, item.name), item.description ? h('div', { class: 'small muted' }, item.description) : null),
        h('td', { class: 'nowrap', dataset: { label: '평가' } }, rating ? `${rating.score} ${E.competencyLabel(rating.score)} (${points.toPlain(2)}점)` : '평가 전'),
        h('td', { dataset: { label: '사례' } }, rating
          ? h('ul', { class: 'cases' }, M.validCases(rating.cases).map((c) => h('li', null, `${c.date} ${c.content.trim()}`)))
          : '-'))))),
    explainList(E.explainCompetency(r)));
}

function rulesSection(period, n) {
  const weight = Number(period.quantWeight);
  const rules = [
    '근거(누구나 확인할 수 있는 자료)를 적은 실적 기록만 점수에 넣습니다. 근거가 없거나 필요한 수치가 없는 기록은 \'점수에서 뺀 기록\'으로 따로 적습니다.',
    '실적 = 점수에 넣는 기록을 KPI의 집계 방식(합계·건수·평균·최근 값)으로 모은 값.',
    '달성률: 상향 지표는 실적 ÷ 목표 × 100, 하향 지표는 (2 − 실적 ÷ 목표) × 100. 목표가 0 이하이면 지켰을 때 100%, 못 지키면 0%. 0% 아래는 0%. 소수 첫째 자리 반올림.',
    `KPI 점수 = 달성률 (상한 ${period.cap}%까지).`,
    '정량 점수 = KPI 점수를 가중치로 가중 평균 (소수 둘째 자리 반올림).',
    weight < 100 ? `역량 점수 = 항목별 5점 척도 환산 점수의 평균 (${E.COMPETENCY_LEGEND.replace('환산표: ', '')}, 소수 둘째 자리 반올림). 평가마다 날짜와 내용이 있는 사례가 하나 이상 있어야 인정.` : null,
    weight === 100 ? '종합 점수 = 정량 점수 (정량 비중 100%).'
      : weight === 0 ? '종합 점수 = 역량 점수 (역량 비중 100%).'
        : `종합 점수 = 정량 점수 × ${weight}% + 역량 점수 × ${100 - weight}% (소수 둘째 자리 반올림).`,
    period.gradingMethod === 'RELATIVE'
      ? `등급 (상대평가): 점수가 다 나온 사람을 종합 → 정량 → 역량 점수 순으로 줄 세우고, 등급 비율(${period.grades.map((g) => `${g.grade} ${fmt(g.ratio)}%`).join(' · ')})의 누적 인원을 반올림해 나눔. 동점자는 같은 순위·같은 등급.`
      : `등급 (절대평가): 종합 점수가 최저 점수 이상인 가장 높은 등급 (${period.grades.map((g) => `${g.grade} ${fmt(g.min)}점`).join(' · ')}).`,
    '반올림은 모두 0.5에서 올립니다.',
  ].filter(Boolean);
  return h('section', { class: 'rules' }, h('h2', null, `${n}. 산정 규칙`), h('ol', null, rules.map((rule) => h('li', null, rule))));
}
