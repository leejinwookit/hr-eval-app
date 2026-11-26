/* 사람(평가 대상) 목록과 등록·고치기. */
import { josa } from '../korean.js';
import * as M from '../model.js';
import { back, backTo, save, state } from '../state.js';
import { actions, button, card, field, h, linkButton, linkRow, list, readForm, sectionTitle, showErrors } from '../ui.js';
import { notFound } from './evaluate.js';

const personSub = (person) => [person.dept, person.position, person.code && `사번 ${person.code}`].filter(Boolean).join(' · ');

export function peopleView() {
  const { doc } = state;
  const people = [...doc.people].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const rows = people.map((person) => linkRow({
    href: `#/person/${person.id}/edit`,
    title: person.name,
    sub: personSub(person) || null,
    right: h('span', { class: 'muted small' }, `평가표 ${doc.sheets.filter((sheet) => sheet.personId === person.id).length}장`),
  }));
  return {
    title: '사람', tab: 'people', action: linkButton('+ 추가', '#/person/new', 'small primary'),
    body: h('div', null,
      h('p', { class: 'lead' }, `등록된 사람 ${people.length}명`),
      list(rows, '평가할 사람을 추가하세요.'),
      actions(linkButton('+ 사람 추가', '#/person/new', 'primary block'))),
  };
}

export function personForm({ id }) {
  const { doc } = state;
  const existing = id ? M.byId(doc.people, id) : null;
  if (id && !existing) return notFound('사람');
  const person = existing || { name: '', dept: '', position: '', code: '', memo: '' };
  const sheets = existing ? doc.sheets.filter((sheet) => sheet.personId === id) : [];

  const form = h('form', { class: 'form', novalidate: true, onsubmit: submit },
    card(
      field({ label: '이름', name: 'name', value: person.name, required: true }),
      h('div', { class: 'two' }, field({ label: '부서', name: 'dept', value: person.dept }), field({ label: '직급', name: 'position', value: person.position })),
      field({ label: '사번', name: 'code', value: person.code, help: '평가서에 함께 나옵니다 (선택).' }),
      field({ label: '메모', name: 'memo', type: 'textarea', rows: 3, value: person.memo })),
    h('p', { class: 'form-error', role: 'alert' }),
    actions(h('button', { type: 'submit', class: 'btn primary block' }, existing ? '저장' : '추가')),
    sheets.length ? [
      sectionTitle('평가표'),
      list(sheets.map((sheet) => linkRow({ href: `#/sheet/${sheet.id}`, title: M.byId(doc.periods, sheet.periodId)?.name ?? '' })), ''),
    ] : null,
    existing ? actions(button('이 사람 지우기', remove, 'danger block')) : null);

  async function submit(event) {
    event.preventDefault();
    const values = readForm(form);
    if (showErrors(form, values.name ? {} : { name: '이름을 넣어 주세요.' })) return;
    const fields = { name: values.name, dept: values.dept, position: values.position, code: values.code, memo: values.memo };
    if (existing) {
      Object.assign(existing, fields);
      if (await save('저장했습니다.')) back('#/people');
    } else {
      doc.people.push({ id: M.newId(), createdAt: new Date().toISOString(), ...fields });
      if (await save(`${josa(values.name, '을')} 추가했습니다.`)) back('#/people');
    }
  }

  async function remove() {
    if (!confirm(`${existing.name}과(와) 평가표 ${sheets.length}장(KPI·실적 기록·역량 평가 포함)을 지웁니다. 되돌릴 수 없습니다. 지울까요?`)) return;
    M.deletePerson(doc, existing.id);
    if (await save('지웠습니다.')) backTo('#/people');
  }

  return { title: existing ? existing.name : '사람 추가', back: '#/people', tab: 'people', body: form };
}
