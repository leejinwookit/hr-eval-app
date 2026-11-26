/* 자료: 백업 파일 만들기·되돌리기, 결과 표(CSV), 예시 자료, 저장 상태, 아이폰 안내, 모두 지우기. */
import * as M from '../model.js';
import { refresh, replaceTo, save, state } from '../state.js';
import * as store from '../store.js';
import {
  actions, button, card, dateTimeText, h, isStandalone, notice, saveFile, sectionTitle, toast, todayText,
} from '../ui.js';
import { exportCsv } from './evaluate.js';

const dt = (text) => h('dt', null, text);
const dd = (...children) => h('dd', null, ...children);
const counts = (doc) => `회차 ${doc.periods.length}개 · 사람 ${doc.people.length}명 · 실적 기록 ${doc.records.length}건 · 역량 평가 ${doc.ratings.length}건`;

async function makeBackupFile() {
  const now = new Date().toISOString();
  const outcome = await saveFile(`인사고과-백업-${todayText()}.json`, M.makeBackup(state.doc, now), 'application/json');
  if (outcome === 'cancelled') return;
  state.doc.meta.lastBackupAt = now;
  if (await save(outcome === 'shared' ? '백업 파일을 보냈습니다.' : '백업 파일을 내려받았습니다.', { touch: false })) refresh();
}

async function restoreFrom(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  let restored;
  try {
    restored = M.readBackup(await file.text());
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  if (!confirm(`지금 자료(${counts(state.doc)})를 백업 파일의 자료(${counts(restored)})로 바꿉니다.\n\n지금 자료가 필요하면 [취소]를 누르고 먼저 백업 파일을 만드세요.`)) return;
  state.doc = restored;
  if (await save('백업 파일의 자료로 되돌렸습니다.')) replaceTo('#/');
}

export function dataView() {
  const { doc } = state;
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: restoreFrom });
  const body = [];

  body.push(sectionTitle('백업'), card(
    h('p', null, '자료는 이 기기 안에만 있습니다. 홈 화면 아이콘을 지우거나 휴대폰을 바꾸면 사라지므로, 백업 파일을 \'파일\' 앱이나 메일에 보관해 두세요.'),
    h('dl', { class: 'kv' },
      dt('마지막 백업'), dd(doc.meta.lastBackupAt ? dateTimeText(doc.meta.lastBackupAt) : '아직 없음'),
      dt('마지막 변경'), dd(doc.meta.changedAt ? dateTimeText(doc.meta.changedAt) : '-')),
    M.backupDue(doc) ? notice('warn', '마지막 백업 뒤로 바뀐 자료가 있습니다.') : null,
    actions(button('백업 파일 만들기', makeBackupFile, 'primary block')),
    actions(button('백업 파일에서 되돌리기', () => fileInput.click(), 'block')),
    fileInput));

  if (doc.periods.length) {
    const select = h('select', { 'aria-label': '내보낼 회차' }, [...doc.periods].reverse().map((period) => h('option', { value: period.id }, period.name)));
    body.push(sectionTitle('결과 표 (CSV)'), card(
      h('p', null, '회차별 순위·점수·등급 표입니다. 엑셀에서 열 수 있습니다.'),
      select,
      actions(button('결과 표 내보내기', () => exportCsv(M.byId(doc.periods, select.value)), 'block'))));
  }

  body.push(sectionTitle('예시 자료'), card(M.hasSample(doc)
    ? [
      h('p', null, '예시 회차와 예시 인물(김하늘·이준호·박서연)이 들어 있습니다.'),
      actions(button('예시 지우기', async () => {
        if (!confirm('예시 회차와 예시 인물을 지웁니다. 직접 넣은 자료는 그대로 둡니다. 지울까요?')) return;
        M.removeSample(state.doc);
        if (await save('예시를 지웠습니다.', { touch: false })) refresh();
      }, 'block')),
    ]
    : [
      h('p', null, '어떻게 쓰는지 보려면 예시 회차를 넣어 보세요. 나중에 한 번에 지울 수 있습니다.'),
      actions(button('예시 넣기', async () => {
        M.addSample(state.doc);
        if (await save('예시 회차를 넣었습니다.', { touch: false })) replaceTo('#/');
      }, 'block')),
    ]));

  const protection = h('dd', null, '확인 중…');
  store.protectedState().then((value) => {
    protection.textContent = value === true ? '보호됨 (공간이 모자라도 브라우저가 임의로 지우지 않음)'
      : value === false ? '보호 요청이 받아들여지지 않음 — 백업을 자주 하세요' : '확인할 수 없음 — 백업을 자주 하세요';
  });
  const bytes = new Blob([JSON.stringify(doc)]).size;
  body.push(sectionTitle('이 기기 저장 상태'), card(h('dl', { class: 'kv' },
    dt('저장 위치'), dd(`이 기기의 브라우저 저장소 (${store.info.engine})`),
    dt('자료 크기'), dd(`${(bytes / 1024).toFixed(1)} KB`),
    dt('들어 있는 자료'), dd(`${counts(doc)} · 평가표 ${doc.sheets.length}장 · KPI ${doc.kpis.length}개`),
    dt('보호 상태'), protection)));

  body.push(sectionTitle('아이폰에서 쓰기'), card(
    h('p', null, isStandalone() ? '지금 홈 화면 앱으로 열려 있습니다.' : '지금 브라우저에서 열려 있습니다. 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.'),
    h('ol', { class: 'steps compact' },
      h('li', null, 'Safari로 이 주소를 엽니다.'),
      h('li', null, '[공유] 버튼을 누릅니다. 안 보이면 [⋯]을 먼저 누르세요.'),
      h('li', null, '목록을 내려 [홈 화면에 추가] → [추가].'),
      h('li', null, '홈 화면의 [인사고과] 아이콘으로 엽니다. 인터넷 없이도 열립니다.')),
    notice('info', '홈 화면 앱과 Safari는 저장 공간이 따로입니다. Safari에서 넣은 자료를 옮기려면 Safari에서 백업 파일을 만들고, 홈 화면 앱에서 [백업 파일에서 되돌리기]를 하세요.')));

  body.push(sectionTitle('모든 자료 지우기'), card(
    h('p', null, '이 기기에 저장된 회차, 사람, 기록, 평가를 모두 지웁니다. 백업 파일이 없으면 되돌릴 수 없습니다.'),
    actions(button('모든 자료 지우기', async () => {
      if (!confirm(`모든 자료(${counts(state.doc)})를 지웁니다. 백업 파일이 없으면 되돌릴 수 없습니다. 지울까요?`)) return;
      if (!confirm('정말 모두 지울까요?')) return;
      state.doc = M.emptyDoc();
      if (await save('모든 자료를 지웠습니다.')) replaceTo('#/');
    }, 'danger block'))));

  const version = h('dd', null, '-');
  fetch('version.json').then((response) => (response.ok ? response.json() : null)).then((info) => {
    if (info && info.version) version.textContent = info.version;
  }).catch(() => {});
  body.push(sectionTitle('앱 정보'), card(h('dl', { class: 'kv' },
    dt('판'), version,
    dt('동작 방식'), dd('서버 없음 · 자료는 이 기기에만 저장 · 인터넷 없이 동작'))));

  return { title: '자료', tab: 'data', body: h('div', null, body) };
}
