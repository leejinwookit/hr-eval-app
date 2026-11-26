/* 평가 화면: 회차 요약, 회차 설정, 평가 대상 추가, 평가표, KPI, 실적 기록, 역량 평가. */
import { formatNumber as fmt } from '../decimal.js';
import * as E from '../explain.js';
import { josa } from '../korean.js';
import * as M from '../model.js';
import { COMPETENCY_LABELS, COMPETENCY_POINTS, COMPETENCY_SCALE } from '../scoring.js';
import { back, backTo, refresh, replaceTo, save, state } from '../state.js';
import {
  actions, badge, button, card, choices, explainList, field, h, linkButton, linkRow, list, meter, notice,
  readForm, safeFileName, saveFile, sectionTitle, showErrors, take, toast, todayText,
} from '../ui.js';

const pts = (dec) => (dec ? dec.toFixed(2) : '-');
const unitOf = (kpi) => kpi.unit || '';
const dt = (text) => h('dt', null, text);
const dd = (...children) => h('dd', null, ...children);
const personSub = (person) => [person?.dept, person?.position].filter(Boolean).join(' · ');
const aggregationHelp = (code) => (M.AGGREGATIONS.find(([key]) => key === code) || [])[2] || '';
const SCALE_TEXT = { 5: '기대를 크게 넘음', 4: '기대를 넘음', 3: '기대한 만큼', 2: '기대에 조금 못 미침', 1: '기대에 크게 못 미침' };

export function currentPeriod(doc) {
  return M.byId(doc.periods, doc.meta.currentPeriodId) || doc.periods[doc.periods.length - 1] || null;
}

export function notFound(what) {
  return {
    title: '찾을 수 없음', back: '#/', tab: 'eval',
    body: card(h('p', null, `${josa(what, '을')} 찾을 수 없습니다. 지워졌을 수 있습니다.`), actions(linkButton('처음으로', '#/', 'primary'))),
  };
}

export async function exportCsv(period) {
  const outcome = await saveFile(`인사고과-${safeFileName(period.name)}-${todayText()}.csv`, M.periodCsv(state.doc, period), 'text/csv');
  if (outcome === 'downloaded') toast('결과 표를 내려받았습니다.');
}

function ruleLine(period) {
  const weight = Number(period.quantWeight);
  const mix = weight === 100 ? '정량 100% (역량 평가 없음)' : weight === 0 ? '역량 100% (KPI 미반영)' : `정량 ${weight}% · 역량 ${100 - weight}%`;
  return `${mix} · KPI 점수 상한 ${period.cap}%`;
}

const periodDates = (period) => (period.start || period.end ? `${period.start || '?'} ~ ${period.end || '?'}` : '기간 미정');

// ------------------------------------------------------------ 처음 화면 · 회차 요약
export function home() {
  const { doc } = state;
  const period = currentPeriod(doc);
  if (!period) return welcome();
  const result = M.periodResult(doc, period);
  const body = [];

  if (doc.periods.length > 1) {
    body.push(h('div', { class: 'period-switch' },
      h('label', { for: 'period-select' }, '평가 회차'),
      h('select', {
        id: 'period-select', value: period.id,
        onchange: async (event) => {
          if (event.target.value === '__new') {
            location.hash = '#/period/new';
            return;
          }
          doc.meta.currentPeriodId = event.target.value;
          if (await save(null, { touch: false })) refresh();
        },
      }, [...doc.periods].reverse().map((p) => h('option', { value: p.id }, p.name)), h('option', { value: '__new' }, '+ 새 회차 만들기'))));
  }

  body.push(card(
    h('div', { class: 'card-head' },
      h('div', null, h('h2', { class: 'card-title' }, period.name), h('p', { class: 'muted small' }, periodDates(period))),
      linkButton('회차 설정', `#/period/${period.id}/settings`, 'small')),
    h('p', { class: 'small' }, ruleLine(period)),
    h('p', { class: 'small muted' }, E.gradeRuleSummary(period))));

  if (period.sample) body.push(notice('info', '예시 회차입니다. 둘러본 뒤 ', h('a', { href: '#/data' }, '[자료] 탭'), '에서 한 번에 지울 수 있습니다.'));
  if (M.backupDue(doc)) body.push(notice('warn', '마지막 백업 뒤로 자료가 바뀌었습니다. ', h('a', { href: '#/data' }, '백업 파일 만들기')));
  const problems = M.gradeRuleProblems(period);
  if (problems.length) {
    body.push(notice('warn', `등급 기준을 확인하세요: ${problems.join(' ')} `, h('a', { href: `#/period/${period.id}/settings` }, '회차 설정')));
  }

  const counts = {};
  for (const sheet of result.sheets) if (sheet.grade) counts[sheet.grade] = (counts[sheet.grade] || 0) + 1;
  const distribution = period.grades.filter((rule) => counts[rule.grade]).map((rule) => `${rule.grade} ${counts[rule.grade]}명`).join(' · ');
  body.push(sectionTitle(`평가 대상 ${result.sheets.length}명`,
    h('span', { class: 'muted small' }, `점수 완료 ${result.completeCount}명` + (distribution ? ` · ${distribution}` : ''))));

  body.push(list(result.sheets.map((sheet) => linkRow({
    href: `#/sheet/${sheet.sheet.id}`,
    title: sheet.person ? sheet.person.name : '(지워진 사람)',
    sub: [personSub(sheet.person),
      sheet.total !== null ? `정량 ${pts(sheet.kpiScore)}${sheet.usesCompetency ? ` · 역량 ${pts(sheet.competencyScore)}` : ''}` : null,
    ].filter(Boolean).join(' · ') || null,
    extra: sheet.total === null
      ? h('div', { class: 'row-warn' }, sheet.missing[0] || '입력 중')
      : (sheet.excludedCount ? h('div', { class: 'row-note' }, `점수에서 뺀 기록 ${sheet.excludedCount}건 (근거 없음 등)`) : null),
    right: sheet.total !== null
      ? h('div', { class: 'row-score' }, h('strong', null, pts(sheet.total)), h('span', { class: 'grade small' }, sheet.grade))
      : badge('입력 중', 'warn'),
  })), '아직 평가 대상이 없습니다. 아래 버튼으로 추가하세요.'));

  body.push(actions(linkButton('+ 평가 대상 추가', `#/period/${period.id}/add`, 'primary block')));
  if (result.sheets.length) body.push(actions(button('결과 표 내보내기 (CSV)', () => exportCsv(period), 'block')));
  return { title: '평가', tab: 'eval', body: h('div', null, body) };
}

function welcome() {
  const steps = [
    ['평가 회차 만들기', '기간, 정량·역량 비중, 등급 기준을 정합니다.'],
    ['평가 대상 넣기', '팀원·직원을 회차에 넣습니다.'],
    ['KPI 목표 정하기', '지표마다 목표, 가중치, 실적 집계 방식을 정합니다.'],
    ['실적과 근거 기록', '근거(문서 번호 등)를 적은 기록만 점수에 들어갑니다.'],
    ['역량 평가', '5점 척도로 평가하고, 날짜와 내용이 있는 사례를 꼭 적습니다.'],
    ['평가서 확인', '점수·등급과 계산식, 근거 목록이 평가서로 정리됩니다.'],
  ];
  return {
    title: '인사고과', tab: 'eval',
    body: h('div', null,
      card(
        h('h2', { class: 'card-title' }, '근거로 평가하는 인사고과'),
        h('p', null, '실적을 근거와 함께 적어 두면 달성률, 점수, 등급과 그 산출 근거가 평가서로 정리됩니다.'),
        h('ol', { class: 'steps' }, steps.map(([title, text]) => h('li', null, h('strong', null, title), h('span', null, text)))),
        notice('info', '자료는 이 기기 안에만 저장됩니다. 서버로 보내지 않고, 인터넷 없이도 동작합니다.')),
      actions(linkButton('첫 평가 회차 만들기', '#/period/new', 'primary block')),
      actions(button('예시로 둘러보기', async () => {
        M.addSample(state.doc);
        if (await save('예시 회차를 넣었습니다.', { touch: false })) state.render({ scroll: 0 });
      }, 'block')),
      h('p', { class: 'center small' }, h('a', { href: '#/data' }, '백업 파일에서 되돌리기'))),
  };
}

// ------------------------------------------------------------ 회차 만들기 · 설정
export function periodForm({ id }) {
  const { doc } = state;
  const existing = id ? M.byId(doc.periods, id) : null;
  if (id && !existing) return notFound('평가 회차');
  const period = existing ? JSON.parse(JSON.stringify(existing)) : M.newPeriod();

  const gradeRows = h('div', { class: 'grade-rows' });
  const addGradeRow = (rule = { grade: '', ratio: '', min: '' }) => gradeRows.append(h('div', { class: 'grade-row' },
    h('input', { name: 'g-grade', value: rule.grade, 'aria-label': '등급 이름', autocomplete: 'off' }),
    h('input', { name: 'g-ratio', value: rule.ratio, inputmode: 'decimal', 'aria-label': '비율 (%)', class: 'col-ratio', autocomplete: 'off' }),
    h('input', { name: 'g-min', value: rule.min, inputmode: 'decimal', 'aria-label': '최저 점수', class: 'col-min', autocomplete: 'off' }),
    button('삭제', (event) => event.currentTarget.closest('.grade-row').remove(), 'small ghost')));
  period.grades.forEach((rule) => addGradeRow(rule));

  const compRows = h('div', { class: 'comp-rows' });
  const addCompRow = (item = { id: '', name: '', description: '' }) => compRows.append(h('div', { class: 'comp-row', dataset: { id: item.id } },
    h('input', { name: 'c-name', value: item.name, placeholder: '항목 이름 (예: 협업)', 'aria-label': '역량 항목 이름', autocomplete: 'off' }),
    h('textarea', { name: 'c-desc', rows: 2, value: item.description, placeholder: '평가 기준 (어떤 행동을 보면 되는지)', 'aria-label': '평가 기준' }),
    button('삭제', (event) => event.currentTarget.closest('.comp-row').remove(), 'small ghost')));
  period.competencies.forEach((item) => addCompRow(item));

  const form = h('form', { class: 'form', novalidate: true, dataset: { method: period.gradingMethod }, onsubmit: submit },
    card(
      field({ label: '회차 이름', name: 'name', value: period.name, required: true, placeholder: '예) 2026년 하반기' }),
      h('div', { class: 'two' },
        field({ label: '시작일', name: 'start', type: 'date', value: period.start }),
        field({ label: '종료일', name: 'end', type: 'date', value: period.end })),
      field({
        label: '정량(KPI) 비중', name: 'quantWeight', value: String(period.quantWeight), required: true, inputmode: 'numeric', suffix: '%',
        help: '종합 점수 = 정량 점수 × 비중 + 역량 점수 × (100 − 비중). 100이면 역량 평가 없이 KPI만으로 계산합니다.',
      }),
      field({
        label: 'KPI 점수 상한', name: 'cap', value: String(period.cap), required: true, inputmode: 'numeric', suffix: '%',
        help: '달성률이 이 값을 넘어도 KPI 점수는 이 값까지만 인정합니다 (보통 120%).',
      })),
    sectionTitle('등급 기준'),
    card(
      choices({
        label: '등급 방식', name: 'gradingMethod', value: period.gradingMethod,
        options: [
          ['ABSOLUTE', '절대평가', '종합 점수가 등급별 최저 점수 이상이면 그 등급 (인원 제한 없음)'],
          ['RELATIVE', '상대평가', '점수가 다 나온 사람끼리 순위를 매겨 등급 비율만큼 나눔 (동점자는 같은 등급)'],
        ],
        onchange: (event) => { form.dataset.method = event.target.value; },
      }),
      h('div', { class: 'field', dataset: { field: 'grades' } },
        h('div', { class: 'grade-row head', 'aria-hidden': 'true' },
          h('span', null, '등급'), h('span', { class: 'col-ratio' }, '비율 (%)'), h('span', { class: 'col-min' }, '최저 점수'), h('span')),
        gradeRows,
        h('div', { class: 'error' }),
        button('+ 등급 추가', () => addGradeRow(), 'small'),
        h('p', { class: 'help' }, '위에서부터 높은 등급입니다. 상대평가 비율의 합은 100%여야 하고, 절대평가 최저 점수는 위 등급일수록 높아야 합니다.'))),
    sectionTitle('역량 평가 항목'),
    card(
      h('div', { class: 'field', dataset: { field: 'competencies' } },
        h('p', { class: 'help' }, '정량 비중이 100%가 아니면 항목마다 5점 척도로 평가합니다. 평가 기준을 적어 두면 평가서에 함께 나옵니다.'),
        compRows,
        h('div', { class: 'error' }),
        button('+ 항목 추가', () => addCompRow(), 'small'))),
    h('p', { class: 'form-error', role: 'alert' }),
    actions(h('button', { type: 'submit', class: 'btn primary block' }, existing ? '저장' : '회차 만들기')),
    existing ? actions(button('이 회차 지우기', removePeriod, 'danger block')) : null);

  async function submit(event) {
    event.preventDefault();
    const values = readForm(form);
    const errors = {};
    if (!values.name) errors.name = '회차 이름을 넣어 주세요.';
    const start = take(errors, 'start', M.parseDate(values.start, { required: false, label: '시작일' }));
    const end = take(errors, 'end', M.parseDate(values.end, { required: false, label: '종료일' }));
    if (start && end && end < start) errors.end = '종료일이 시작일보다 빠릅니다.';
    const quantWeight = take(errors, 'quantWeight', M.parseNumber(values.quantWeight, { integer: true, min: 0, max: 100, label: '정량 비중' }));
    const cap = take(errors, 'cap', M.parseNumber(values.cap, { integer: true, min: 100, max: 300, label: 'KPI 점수 상한' }));
    const gradingMethod = values.gradingMethod === 'RELATIVE' ? 'RELATIVE' : 'ABSOLUTE';

    const grades = [];
    const gradeErrors = [];
    for (const row of gradeRows.querySelectorAll('.grade-row')) {
      const grade = row.querySelector('[name=g-grade]').value.trim();
      const ratioText = row.querySelector('[name=g-ratio]').value;
      const minText = row.querySelector('[name=g-min]').value;
      if (!grade && !ratioText.trim() && !minText.trim()) continue;
      const ratio = M.parseNumber(ratioText, { required: gradingMethod === 'RELATIVE', min: 0, max: 100, label: `${grade || '등급'} 비율` });
      const min = M.parseNumber(minText, { required: gradingMethod === 'ABSOLUTE', min: 0, max: 999, label: `${grade || '등급'} 최저 점수` });
      for (const result of [ratio, min]) if (result.error) gradeErrors.push(result.error);
      grades.push({ grade, ratio: ratio.value ?? '', min: min.value ?? '' });
    }
    if (!gradeErrors.length) gradeErrors.push(...M.gradeRuleProblems({ gradingMethod, grades }));
    if (gradeErrors.length) errors.grades = gradeErrors.join(' ');

    const competencies = [];
    for (const row of compRows.querySelectorAll('.comp-row')) {
      const name = row.querySelector('[name=c-name]').value.trim();
      const description = row.querySelector('[name=c-desc]').value.trim();
      if (!name && !description) continue;
      if (!name) {
        errors.competencies = '이름이 빈 역량 항목이 있습니다.';
        continue;
      }
      competencies.push({ id: row.dataset.id || M.newId(), name, description });
    }
    if (!errors.competencies && Number(quantWeight) < 100 && !competencies.length) {
      errors.competencies = '정량 비중이 100%가 아니면 역량 항목이 하나 이상 있어야 합니다.';
    }
    if (showErrors(form, errors)) return;

    const fields = { name: values.name, start, end, quantWeight: Number(quantWeight), cap: Number(cap), gradingMethod, grades, competencies };
    if (existing) {
      const keep = new Set(competencies.map((item) => item.id));
      const sheetIds = new Set(M.sheetsOf(doc, existing.id).map((sheet) => sheet.id));
      const orphans = doc.ratings.filter((rating) => sheetIds.has(rating.sheetId) && !keep.has(rating.itemId));
      if (orphans.length && !confirm(`지운 역량 항목의 평가 ${orphans.length}건도 함께 지웁니다. 계속할까요?`)) return;
      doc.ratings = doc.ratings.filter((rating) => !orphans.includes(rating));
      Object.assign(existing, fields);
      if (await save('회차 설정을 저장했습니다.')) back('#/');
    } else {
      const created = M.newPeriod(fields);
      doc.periods.push(created);
      doc.meta.currentPeriodId = created.id;
      if (await save('회차를 만들었습니다. 평가 대상을 넣으세요.')) replaceTo(`#/period/${created.id}/add`);
    }
  }

  async function removePeriod() {
    const sheets = M.sheetsOf(doc, existing.id);
    if (!confirm(`'${existing.name}' 회차와 평가표 ${sheets.length}장(KPI·실적 기록·역량 평가 포함)을 지웁니다. 되돌릴 수 없습니다. 지울까요?`)) return;
    M.deletePeriod(doc, existing.id);
    if (await save('회차를 지웠습니다.')) backTo('#/');
  }

  return { title: existing ? '회차 설정' : '새 평가 회차', back: '#/', tab: 'eval', body: form };
}

// ------------------------------------------------------------ 평가 대상 넣기
export function addPeople({ id }) {
  const { doc } = state;
  const period = M.byId(doc.periods, id);
  if (!period) return notFound('평가 회차');
  const inPeriod = new Set(M.sheetsOf(doc, id).map((sheet) => sheet.personId));
  const candidates = doc.people.filter((person) => !inPeriod.has(person.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const sources = M.sheetsOf(doc, id)
    .map((sheet) => ({ sheet, person: M.byId(doc.people, sheet.personId), count: M.kpisOf(doc, sheet.id).length }))
    .filter((source) => source.count);

  const form = h('form', { class: 'form', novalidate: true, onsubmit: submit },
    candidates.length ? [
      sectionTitle('등록된 사람에서 고르기'),
      h('div', { class: 'list checks' }, candidates.map((person) => h('label', { class: 'row check' },
        h('input', { type: 'checkbox', name: 'person', value: person.id }),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, person.name), personSub(person) ? h('div', { class: 'row-sub' }, personSub(person)) : null)))),
    ] : null,
    sectionTitle(candidates.length ? '새로 등록해서 넣기' : '평가 대상 등록'),
    card(
      field({ label: '이름', name: 'name', placeholder: '예) 김하늘' }),
      h('div', { class: 'two' }, field({ label: '부서', name: 'dept' }), field({ label: '직급', name: 'position' }))),
    sources.length ? [
      sectionTitle('KPI 가져오기'),
      card(field({
        label: '같은 KPI를 쓰는 사람의 목표·가중치를 복사 (실적은 복사하지 않음)', name: 'copyFrom', type: 'select', value: '',
        options: [['', '복사하지 않음'], ...sources.map((source) => [source.sheet.id, `${source.person?.name ?? ''}의 KPI ${source.count}개`])],
      })),
    ] : null,
    h('p', { class: 'form-error', role: 'alert' }),
    actions(h('button', { type: 'submit', class: 'btn primary block' }, '넣기')));

  async function submit(event) {
    event.preventDefault();
    const values = readForm(form);
    const chosen = [...form.querySelectorAll('input[name=person]:checked')].map((input) => input.value);
    if (showErrors(form, !chosen.length && !values.name ? { _form: '넣을 사람을 고르거나 새 이름을 적어 주세요.' } : {})) return;
    const now = new Date().toISOString();
    if (values.name) {
      const person = { id: M.newId(), name: values.name, dept: values.dept, position: values.position, code: '', memo: '', createdAt: now };
      doc.people.push(person);
      chosen.push(person.id);
    }
    const created = chosen.map((personId) => {
      const sheet = { id: M.newId(), periodId: id, personId, comment: '', createdAt: now, updatedAt: now };
      doc.sheets.push(sheet);
      if (values.copyFrom) M.copyKpis(doc, values.copyFrom, sheet.id);
      return sheet;
    });
    doc.meta.currentPeriodId = id;
    if (!(await save(`${created.length}명을 평가 대상에 넣었습니다.`))) return;
    if (created.length === 1) replaceTo(`#/sheet/${created[0].id}`);
    else backTo('#/');
  }

  return { title: '평가 대상 넣기', back: '#/', tab: 'eval', body: h('div', null, h('p', { class: 'lead' }, period.name), form) };
}

// ------------------------------------------------------------ 평가표 (한 사람)
export function sheetView({ id }) {
  const { doc } = state;
  const sheet = M.byId(doc.sheets, id);
  if (!sheet) return notFound('평가표');
  const period = M.byId(doc.periods, sheet.periodId);
  const periodResult = M.periodResult(doc, period);
  const r = periodResult.sheets.find((item) => item.sheet.id === id);
  const weight = Number(period.quantWeight);
  const name = r.person ? r.person.name : '(지워진 사람)';
  const body = [];

  body.push(card(
    h('div', { class: 'person-head' },
      h('div', null, h('h2', { class: 'card-title' }, name), h('p', { class: 'muted small' }, [personSub(r.person), period.name].filter(Boolean).join(' · '))),
      r.total !== null ? h('div', { class: 'score-box' }, h('span', { class: 'score' }, pts(r.total)), h('span', { class: 'grade' }, r.grade)) : null),
    r.total !== null
      ? h('p', { class: 'small' }, [
        weight > 0 ? `정량 ${pts(r.kpiScore)} × ${weight}%` : null,
        r.usesCompetency ? `역량 ${pts(r.competencyScore)} × ${100 - weight}%` : null,
      ].filter(Boolean).join(' + ') + ` · ${periodResult.completeCount}명 중 ${r.rank}위`)
      : notice('warn', h('strong', null, '아직 점수가 나오지 않았습니다.'), h('ul', null, r.missing.map((text) => h('li', null, text)))),
    r.notes.length ? h('ul', { class: 'notes' }, r.notes.map((text) => h('li', null, text))) : null,
    actions(linkButton('평가서 보기 · 산출 근거', `#/sheet/${id}/report`, 'primary block'))));

  body.push(sectionTitle('정량 평가 (KPI)',
    h('span', { class: `small ${r.kpis.length && r.weightTotal !== 100 ? 'warn-text' : 'muted'}` }, `가중치 합계 ${r.weightTotal}%`)));
  if (weight === 0) body.push(notice('info', '이 회차는 정량 비중이 0%라 KPI가 종합 점수에 들어가지 않습니다.'));
  body.push(list(r.kpis.map((result) => kpiRow(result, period)), 'KPI가 없습니다. 평가할 목표를 먼저 정하세요.'));
  body.push(actions(linkButton('+ KPI 추가', `#/sheet/${id}/kpi/new`, ''), ...copyKpiControl(doc, sheet)));

  if (r.usesCompetency) {
    const done = r.competencies.filter((item) => item.rating).length;
    body.push(sectionTitle('역량 평가 (사례 근거 필수)', h('span', { class: 'muted small' }, `${done}/${r.competencies.length} 완료`)));
    body.push(list(r.competencies.map(({ item, rating, points }) => {
      const cases = rating ? M.validCases(rating.cases) : [];
      return linkRow({
        href: `#/sheet/${id}/rating/${item.id}`,
        title: item.name,
        sub: rating ? `${rating.score} ${COMPETENCY_LABELS[rating.score]} · ${points.toPlain(2)}점` : '평가 전',
        extra: rating ? h('div', { class: 'row-note clamp' }, `${cases[0].date} ${cases[0].content}`) : (item.description ? h('div', { class: 'row-note clamp' }, item.description) : null),
        right: rating ? badge(`사례 ${cases.length}건`, 'good') : badge('평가 전', 'warn'),
      });
    }), '회차에 역량 항목이 없습니다. 회차 설정에서 넣으세요.'));
    body.push(h('p', { class: 'help pad' }, E.COMPETENCY_LEGEND));
  }

  const comment = h('form', {
    class: 'form', novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      sheet.comment = comment.elements.comment.value.trim();
      sheet.updatedAt = new Date().toISOString();
      await save('평가 의견을 저장했습니다.');
    },
  }, card(
    field({ label: '평가서에 실을 의견', name: 'comment', type: 'textarea', rows: 4, value: sheet.comment || '', placeholder: '강점, 보완할 점, 다음 회차에 기대하는 점' }),
    h('button', { type: 'submit', class: 'btn small' }, '의견 저장')));
  body.push(sectionTitle('평가 의견'), comment);

  body.push(actions(button('이 평가표 지우기', async () => {
    const kpis = M.kpisOf(doc, id);
    const records = doc.records.filter((record) => kpis.some((kpi) => kpi.id === record.kpiId)).length;
    const ratings = doc.ratings.filter((rating) => rating.sheetId === id).length;
    if (!confirm(`${name}의 '${period.name}' 평가표를 지웁니다 (KPI ${kpis.length}개, 실적 기록 ${records}건, 역량 평가 ${ratings}건). 되돌릴 수 없습니다. 지울까요?`)) return;
    M.deleteSheet(doc, id);
    if (await save('평가표를 지웠습니다.')) backTo('#/');
  }, 'danger block')));

  return { title: name, back: '#/', tab: 'eval', body: h('div', null, body) };
}

function kpiRow(result, period) {
  const { kpi } = result;
  const unit = unitOf(kpi);
  return linkRow({
    href: `#/kpi/${kpi.id}`,
    title: kpi.title,
    sub: `목표 ${fmt(kpi.target)}${unit} · ${kpi.direction === 'LOWER' ? '하향' : '상향'} · 가중치 ${kpi.weight}% · ${M.AGGREGATION_LABELS[kpi.aggregation]}`,
    extra: h('div', null,
      result.actual === null
        ? h('div', { class: 'row-warn' }, '근거 있는 실적 없음')
        : h('div', { class: 'row-line' }, `실적 ${fmt(result.actual)}${unit} → 달성률 ${result.achievement.toFixed(1)}% → ${pts(result.score)}점`),
      meter(result.achievement, period.cap),
      h('div', { class: 'badges' },
        badge(`근거 ${result.evidenced.length}건`, result.evidenced.length ? 'good' : 'muted'),
        result.excluded.length ? badge(`점수 제외 ${result.excluded.length}건`, 'warn') : null,
        result.outside.length ? badge(`기간 밖 ${result.outside.length}건`, 'info') : null)),
  });
}

function copyKpiControl(doc, sheet) {
  const sources = doc.sheets
    .filter((other) => other.id !== sheet.id)
    .map((other) => ({ other, count: M.kpisOf(doc, other.id).length }))
    .filter((source) => source.count);
  if (!sources.length) return [];
  const select = h('select', { 'aria-label': 'KPI를 가져올 평가표' }, sources.map(({ other, count }) => h('option', { value: other.id },
    `${M.byId(doc.people, other.personId)?.name ?? ''} · ${M.byId(doc.periods, other.periodId)?.name ?? ''} (KPI ${count}개)`)));
  const box = h('div', { class: 'copy-box', hidden: true },
    h('p', { class: 'help' }, '목표·가중치·방향·집계 방식만 복사합니다. 실적 기록은 복사하지 않습니다.'),
    select,
    button('복사', async () => {
      const count = M.copyKpis(doc, select.value, sheet.id);
      if (await save(`KPI ${count}개를 복사했습니다.`)) refresh();
    }, 'primary small'));
  return [button('다른 평가표에서 KPI 복사', () => { box.hidden = !box.hidden; }), box];
}

// ------------------------------------------------------------ KPI
export function kpiView({ id }) {
  const { doc } = state;
  const kpi = M.byId(doc.kpis, id);
  if (!kpi) return notFound('KPI');
  const sheet = M.byId(doc.sheets, kpi.sheetId);
  const period = M.byId(doc.periods, sheet.periodId);
  const person = M.byId(doc.people, sheet.personId);
  const result = M.kpiResult(doc, kpi, period);

  const body = h('div', null,
    h('p', { class: 'lead' }, `${person?.name ?? ''} · ${period.name}`),
    card(h('dl', { class: 'kv' },
      dt('목표'), dd(`${fmt(kpi.target)}${unitOf(kpi)}`),
      dt('방향'), dd(M.DIRECTION_LABELS[kpi.direction]),
      dt('가중치'), dd(`${kpi.weight}%`),
      dt('실적 집계'), dd(`${M.AGGREGATION_LABELS[kpi.aggregation]} — ${aggregationHelp(kpi.aggregation)}`),
      kpi.method ? [dt('측정 방법·인정 근거'), dd(kpi.method)] : null)),
    sectionTitle('산출 근거'),
    card(
      result.actual !== null ? h('div', { class: 'kpi-result' },
        h('div', null, h('span', { class: 'muted small' }, '실적'), h('strong', null, `${fmt(result.actual)}${unitOf(kpi)}`)),
        h('div', null, h('span', { class: 'muted small' }, '달성률'), h('strong', null, `${result.achievement.toFixed(1)}%`)),
        h('div', null, h('span', { class: 'muted small' }, 'KPI 점수'), h('strong', null, pts(result.score)))) : null,
      meter(result.achievement, period.cap),
      explainList([...E.explainActual(result), ...E.explainScore(result, period)]),
      result.actual === null ? h('p', { class: 'help' }, '근거를 적은 실적 기록을 넣으면 점수가 계산됩니다.') : null),
    sectionTitle(`실적 기록 ${result.records.length}건`, linkButton('+ 기록', `#/kpi/${id}/record/new`, 'small primary')),
    list(result.records.map((record) => recordRow(kpi, record, period)), '아직 기록이 없습니다. [+ 기록]으로 실적과 근거를 넣으세요.'),
    actions(linkButton('+ 실적 기록', `#/kpi/${id}/record/new`, 'primary block')));

  return { title: kpi.title, back: `#/sheet/${sheet.id}`, tab: 'eval', action: linkButton('고치기', `#/kpi/${id}/edit`, 'small'), body };
}

function recordRow(kpi, record, period) {
  const reason = M.exclusionReason(kpi, record);
  const value = E.recordValue(kpi, record);
  const evidence = record.evidence && record.evidence.trim();
  return linkRow({
    href: `#/record/${record.id}/edit`,
    title: record.content || '(내용 없음)',
    sub: record.date,
    extra: h('div', null,
      evidence ? h('div', { class: 'row-evidence' }, `근거: ${evidence}`) : null,
      h('div', { class: 'badges' },
        reason ? badge(`${reason} · 점수 제외`, 'warn') : null,
        M.outsidePeriod(period, record) ? badge('회차 기간 밖', 'info') : null)),
    right: value ? h('span', { class: 'num' }, value) : null,
    className: reason ? 'excluded' : '',
  });
}

export function kpiForm({ id, sheetId }) {
  const { doc } = state;
  const existing = id ? M.byId(doc.kpis, id) : null;
  if (id && !existing) return notFound('KPI');
  const sheet = M.byId(doc.sheets, existing ? existing.sheetId : sheetId);
  if (!sheet) return notFound('평가표');
  const others = M.kpisOf(doc, sheet.id).filter((kpi) => kpi.id !== id).reduce((sum, kpi) => sum + Number(kpi.weight), 0);
  const kpi = existing || {
    title: '', unit: '', direction: 'HIGHER', target: '', weight: others < 100 ? String(100 - others) : '', aggregation: 'SUM', method: '',
  };

  const form = h('form', { class: 'form', novalidate: true, onsubmit: submit },
    card(
      field({ label: 'KPI 이름', name: 'title', value: kpi.title, required: true, placeholder: '예) 신규 계약 금액' }),
      h('div', { class: 'two' },
        field({ label: '목표', name: 'target', value: kpi.target, required: true, inputmode: 'decimal', placeholder: '예) 50000' }),
        field({ label: '단위', name: 'unit', value: kpi.unit, placeholder: '예) 만원, 건, %' })),
      field({
        label: '가중치', name: 'weight', value: String(kpi.weight), required: true, inputmode: 'numeric', suffix: '%',
        help: `이 평가표의 다른 KPI 가중치 합계: ${others}%. 모두 합쳐 100%가 되게 맞추세요.`,
      }),
      choices({
        label: '방향', name: 'direction', value: kpi.direction,
        options: [
          ['HIGHER', '상향 — 높을수록 좋음', '달성률 = 실적 ÷ 목표 × 100'],
          ['LOWER', '하향 — 낮을수록 좋음', '달성률 = (2 − 실적 ÷ 목표) × 100. 예) 목표 5건, 실적 4건 → 120%'],
        ],
      }),
      choices({ label: '실적 집계 방식', name: 'aggregation', value: kpi.aggregation, options: M.AGGREGATIONS }),
      field({
        label: '측정 방법 · 인정 근거', name: 'method', type: 'textarea', rows: 3, value: kpi.method,
        placeholder: '예) 계약서 금액 합계(부가세 제외). 계약서 번호를 근거로 적는다.',
        help: '무엇을 근거로 인정하는지 적어 두면 평가서에 함께 나옵니다. 목표가 0이면 지켰을 때 100%, 못 지키면 0%입니다 (예: 안전사고 0건).',
      })),
    h('p', { class: 'form-error', role: 'alert' }),
    actions(h('button', { type: 'submit', class: 'btn primary block' }, existing ? '저장' : 'KPI 추가')),
    existing ? actions(button('이 KPI 지우기', remove, 'danger block')) : null);

  async function submit(event) {
    event.preventDefault();
    const values = readForm(form);
    const errors = {};
    if (!values.title) errors.title = 'KPI 이름을 넣어 주세요.';
    const target = take(errors, 'target', M.parseNumber(values.target, { label: '목표', min: -1e12, max: 1e12 }));
    const weight = take(errors, 'weight', M.parseNumber(values.weight, { label: '가중치', integer: true, min: 1, max: 100 }));
    if (!values.direction) errors.direction = '방향을 고르세요.';
    if (!values.aggregation) errors.aggregation = '집계 방식을 고르세요.';
    if (showErrors(form, errors)) return;
    const now = new Date().toISOString();
    const fields = {
      title: values.title, unit: values.unit, target, weight: Number(weight), direction: values.direction,
      aggregation: values.aggregation, method: values.method, updatedAt: now,
    };
    if (existing) {
      Object.assign(existing, fields);
      if (await save('KPI를 저장했습니다.')) back(`#/kpi/${existing.id}`);
    } else {
      const created = { id: M.newId(), sheetId: sheet.id, order: M.kpisOf(doc, sheet.id).length, createdAt: now, ...fields };
      doc.kpis.push(created);
      if (await save('KPI를 추가했습니다. 이제 실적을 기록하세요.')) replaceTo(`#/kpi/${created.id}`);
    }
  }

  async function remove() {
    const count = M.recordsOf(doc, existing.id).length;
    if (!confirm(`KPI '${existing.title}'와 실적 기록 ${count}건을 지웁니다. 되돌릴 수 없습니다. 지울까요?`)) return;
    M.deleteKpi(doc, existing.id);
    if (await save('KPI를 지웠습니다.')) backTo(`#/sheet/${sheet.id}`);
  }

  const person = M.byId(doc.people, sheet.personId);
  return {
    title: existing ? 'KPI 고치기' : 'KPI 추가', back: existing ? `#/kpi/${existing.id}` : `#/sheet/${sheet.id}`, tab: 'eval',
    body: h('div', null, h('p', { class: 'lead' }, person?.name ?? ''), form),
  };
}

// ------------------------------------------------------------ 실적 기록
let lastDate = null;  // [저장하고 하나 더] 때 날짜를 이어 쓴다

export function recordForm({ id, kpiId }) {
  const { doc } = state;
  const existing = id ? M.byId(doc.records, id) : null;
  if (id && !existing) return notFound('실적 기록');
  const kpi = M.byId(doc.kpis, existing ? existing.kpiId : kpiId);
  if (!kpi) return notFound('KPI');
  const sheet = M.byId(doc.sheets, kpi.sheetId);
  const period = M.byId(doc.periods, sheet.periodId);
  const needsValue = kpi.aggregation !== 'COUNT';
  const record = existing || { date: lastDate || todayText(), value: '', content: '', evidence: '' };

  const evidenceWarning = notice('warn', '근거를 비워 두면 이 기록은 점수에 들어가지 않고 \'근거 없음\'으로 따로 표시됩니다.');
  const dateNote = h('p', { class: 'help warn-text' });
  const form = h('form', { class: 'form', novalidate: true, onsubmit: submit, oninput: updateHints, onchange: updateHints },
    card(
      h('p', { class: 'context' }, h('strong', null, kpi.title), ` · ${E.kpiDefinition(kpi)}`),
      needsValue ? null : h('p', { class: 'help' }, '이 KPI는 건수로 집계합니다. 근거를 적은 기록 1건이 1건으로 셉니다.'),
      field({ label: '날짜', name: 'date', type: 'date', value: record.date, required: true }),
      dateNote,
      needsValue ? field({
        label: `수치${kpi.unit ? ` (${kpi.unit})` : ''}`, name: 'value', value: record.value, required: true, inputmode: 'decimal',
        help: aggregationHelp(kpi.aggregation),
      }) : null,
      field({ label: '내용', name: 'content', type: 'textarea', rows: 2, value: record.content, required: true, placeholder: '무엇을 했는지 (예: 한빛상사 연간 공급 계약)' }),
      field({
        label: '근거', name: 'evidence', type: 'textarea', rows: 2, value: record.evidence,
        placeholder: '예) 계약서 2026-071, 결재 문서 번호, 시스템 화면, 메일 날짜',
        help: '나중에 누구라도 확인할 수 있는 자료를 적으세요.',
      }),
      evidenceWarning),
    h('p', { class: 'form-error', role: 'alert' }),
    actions(h('button', { type: 'submit', class: 'btn primary block', value: 'save' }, '저장')),
    existing ? null : actions(h('button', { type: 'submit', class: 'btn block', value: 'again' }, '저장하고 하나 더')),
    existing ? actions(button('이 기록 지우기', remove, 'danger block')) : null);

  function updateHints() {
    evidenceWarning.hidden = Boolean(form.elements.evidence.value.trim());
    const date = form.elements.date.value;
    dateNote.textContent = date && M.outsidePeriod(period, { date }) ? `회차 기간(${periodDates(period)}) 밖의 날짜입니다. 점수에는 들어갑니다.` : '';
  }
  updateHints();

  async function submit(event) {
    event.preventDefault();
    const again = event.submitter && event.submitter.value === 'again';
    const values = readForm(form);
    const errors = {};
    const date = take(errors, 'date', M.parseDate(values.date));
    const value = needsValue ? take(errors, 'value', M.parseNumber(values.value, { label: '수치', min: -1e12, max: 1e12 })) : (existing?.value ?? '');
    if (!values.content) errors.content = '내용을 넣어 주세요.';
    if (showErrors(form, errors)) return;
    const now = new Date().toISOString();
    const fields = { date, value, content: values.content, evidence: values.evidence, updatedAt: now };
    const message = values.evidence ? '기록을 저장했습니다.' : '저장했습니다. 근거가 없어 점수에는 넣지 않습니다.';
    lastDate = date;
    if (existing) {
      Object.assign(existing, fields);
      if (await save(message)) back(`#/kpi/${kpi.id}`);
      return;
    }
    doc.records.push({ id: M.newId(), kpiId: kpi.id, createdAt: now, ...fields });
    if (!(await save(message))) return;
    if (again) state.render({ scroll: 0 });
    else back(`#/kpi/${kpi.id}`);
  }

  async function remove() {
    if (!confirm('이 실적 기록을 지웁니다. 지울까요?')) return;
    doc.records = doc.records.filter((item) => item.id !== existing.id);
    if (await save('기록을 지웠습니다.')) back(`#/kpi/${kpi.id}`);
  }

  return { title: existing ? '기록 고치기' : '실적 기록', back: `#/kpi/${kpi.id}`, tab: 'eval', body: form };
}

// ------------------------------------------------------------ 역량 평가
export function ratingForm({ id, itemId }) {
  const { doc } = state;
  const sheet = M.byId(doc.sheets, id);
  if (!sheet) return notFound('평가표');
  const period = M.byId(doc.periods, sheet.periodId);
  const item = period.competencies.find((competency) => competency.id === itemId);
  if (!item) return notFound('역량 항목');
  const person = M.byId(doc.people, sheet.personId);
  const existing = doc.ratings.find((rating) => rating.sheetId === id && rating.itemId === itemId) || null;

  const caseRows = h('div', { class: 'case-rows' });
  const addCase = (c = { date: todayText(), content: '' }) => caseRows.append(h('div', { class: 'case-row' },
    h('input', { type: 'date', name: 'case-date', value: c.date, 'aria-label': '사례 날짜' }),
    h('textarea', {
      name: 'case-content', rows: 3, value: c.content, 'aria-label': '사례 내용',
      placeholder: '언제, 무엇을 했는지 구체적으로 (예: 분기 마감 3일 전 계약 서류를 모두 갖춰 일정을 지킴)',
    }),
    button('삭제', (event) => event.currentTarget.closest('.case-row').remove(), 'small ghost')));
  (existing && existing.cases && existing.cases.length ? existing.cases : [undefined]).forEach((c) => addCase(c));

  const form = h('form', { class: 'form', novalidate: true, onsubmit: submit },
    card(
      h('p', { class: 'context' }, h('strong', null, item.name), item.description ? ` — ${item.description}` : ''),
      choices({
        label: '평가', name: 'score', value: existing ? existing.score : '',
        options: COMPETENCY_SCALE.map(([value, label, points]) => [value, `${value} ${label} · ${points}점`, SCALE_TEXT[value]]),
      })),
    sectionTitle('사례 (근거)'),
    card(h('div', { class: 'field', dataset: { field: 'cases' } },
      h('p', { class: 'help' }, '평가의 근거가 되는 구체적인 사례를 적으세요. 날짜와 내용이 있는 사례가 하나 이상 있어야 저장할 수 있습니다.'),
      caseRows,
      h('div', { class: 'error' }),
      button('+ 사례 추가', () => addCase(), 'small'))),
    h('p', { class: 'form-error', role: 'alert' }),
    actions(h('button', { type: 'submit', class: 'btn primary block' }, '저장')),
    existing ? actions(button('이 평가 지우기', remove, 'danger block')) : null);

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    const score = Number(readForm(form).score);
    if (!(score in COMPETENCY_POINTS)) errors.score = '1~5점 중에서 고르세요.';
    const cases = [];
    for (const row of caseRows.querySelectorAll('.case-row')) {
      const content = row.querySelector('[name=case-content]').value.trim();
      if (!content) continue;  // 내용이 빈 줄은 없는 것으로 본다
      const date = M.parseDate(row.querySelector('[name=case-date]').value, { label: '사례 날짜' });
      if (date.error) {
        errors.cases = `사례마다 날짜를 넣어 주세요 (${content.slice(0, 14)}…).`;
        continue;
      }
      cases.push({ date: date.value, content });
    }
    if (!errors.cases && !cases.length) errors.cases = '날짜와 내용을 적은 사례가 하나 이상 있어야 저장할 수 있습니다.';
    if (showErrors(form, errors)) return;
    cases.sort((a, b) => a.date.localeCompare(b.date));
    const now = new Date().toISOString();
    if (existing) Object.assign(existing, { score, cases, updatedAt: now });
    else doc.ratings.push({ id: M.newId(), sheetId: id, itemId, score, cases, updatedAt: now });
    if (await save(`${item.name} 평가를 저장했습니다.`)) back(`#/sheet/${id}`);
  }

  async function remove() {
    if (!confirm(`${item.name} 평가(사례 ${existing.cases.length}건)를 지웁니다. 지울까요?`)) return;
    doc.ratings = doc.ratings.filter((rating) => rating !== existing);
    if (await save('평가를 지웠습니다.')) back(`#/sheet/${id}`);
  }

  return { title: item.name, back: `#/sheet/${id}`, tab: 'eval', body: h('div', null, h('p', { class: 'lead' }, `${person?.name ?? ''} · 역량 평가`), form) };
}
