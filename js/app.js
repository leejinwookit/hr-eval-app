/* 인사고과 개인용 — 시작, 화면 고르기(#/주소), 머리글·아래 메뉴, 오프라인 저장(서비스 워커), 아이폰 안내. */
import * as M from './model.js';
import { back, correctHash, currentHash, startNavigation, state } from './state.js';
import * as store from './store.js';
import { actions, button, card, h, icon, isAppleMobile, isStandalone, linkButton, notice } from './ui.js';
import * as Ev from './views/evaluate.js';
import { dataView } from './views/data.js';
import { peopleView, personForm } from './views/people.js';
import { reportView } from './views/report.js';

const ROUTES = [
  [/^\/$/, () => Ev.home()],
  [/^\/period\/new$/, () => Ev.periodForm({})],
  [/^\/period\/([\w-]+)\/settings$/, (id) => Ev.periodForm({ id })],
  [/^\/period\/([\w-]+)\/add$/, (id) => Ev.addPeople({ id })],
  [/^\/sheet\/([\w-]+)$/, (id) => Ev.sheetView({ id })],
  [/^\/sheet\/([\w-]+)\/kpi\/new$/, (sheetId) => Ev.kpiForm({ sheetId })],
  [/^\/sheet\/([\w-]+)\/rating\/([\w-]+)$/, (id, itemId) => Ev.ratingForm({ id, itemId })],
  [/^\/sheet\/([\w-]+)\/report$/, (id) => reportView({ id })],
  [/^\/kpi\/([\w-]+)$/, (id) => Ev.kpiView({ id })],
  [/^\/kpi\/([\w-]+)\/edit$/, (id) => Ev.kpiForm({ id })],
  [/^\/kpi\/([\w-]+)\/record\/new$/, (kpiId) => Ev.recordForm({ kpiId })],
  [/^\/record\/([\w-]+)\/edit$/, (id) => Ev.recordForm({ id })],
  [/^\/people$/, () => peopleView()],
  [/^\/person\/new$/, () => personForm({})],
  [/^\/person\/([\w-]+)\/edit$/, (id) => personForm({ id })],
  [/^\/data$/, () => dataView()],
];

const TABS = [['eval', '#/', '평가'], ['people', '#/people', '사람'], ['data', '#/data', '자료']];

function resolve() {
  const path = currentHash().slice(1) || '/';
  for (const [pattern, view] of ROUTES) {
    const match = path.match(pattern);
    if (match) return view(...match.slice(1));
  }
  correctHash('#/');  // 모르는 주소 (예전 체험판의 #/login/ 등) → 처음 화면
  return Ev.home();
}

function errorView(error) {
  return {
    title: '오류', back: '#/', tab: 'eval',
    body: card(
      h('p', null, '화면을 그리다 문제가 생겼습니다. 자료는 그대로 있습니다.'),
      h('pre', { class: 'small' }, String((error && error.stack) || error)),
      actions(linkButton('처음으로', '#/', 'primary'))),
  };
}

function render({ scroll = 0 } = {}) {
  let view;
  try {
    view = resolve();
  } catch (error) {
    console.error(error);
    view = errorView(error);
  }
  document.getElementById('topbar').replaceChildren(
    view.back
      ? h('button', { type: 'button', class: 'back', onclick: () => back(view.back) }, icon('back', 22), h('span', null, '뒤로'))
      : h('span', { class: 'side' }),
    h('h1', null, view.title || '인사고과'),
    view.action ? h('span', { class: 'side right' }, view.action) : h('span', { class: 'side' }));
  document.getElementById('tabbar').replaceChildren(...TABS.map(([key, href, label]) => h('a', {
    href, class: `tab${view.tab === key ? ' on' : ''}`, 'aria-current': view.tab === key ? 'page' : null,
  }, icon(key), h('span', null, label))));
  document.getElementById('view').replaceChildren(view.body);
  document.title = view.title && view.title !== '인사고과' ? `${view.title} · 인사고과` : '인사고과 · 개인용';
  window.scrollTo(0, scroll);
}

// ------------------------------------------------------------ 예전 체험판(같은 주소)이 남긴 것 치우기
function cleanupOldTrial() {
  try {
    if (localStorage.getItem('hr-eval-personal-cleaned')) return;
    localStorage.removeItem('hr-eval-stay-in-browser');
    if ('indexedDB' in window) indexedDB.deleteDatabase('/hr-eval-data');  // 체험판의 예시 자료 (약 1 MB)
    localStorage.setItem('hr-eval-personal-cleaned', '1');
  } catch (error) {
    // 사생활 보호 모드 등에서는 건너뛴다
  }
}

// ------------------------------------------------------------ 아이폰: 처음 Safari로 열면 홈 화면 추가 안내
const STAY_KEY = 'hr-eval-personal-stay';

function needsGuide(doc) {
  if (!isAppleMobile() || isStandalone()) return false;
  try {
    if (localStorage.getItem(STAY_KEY)) return false;
  } catch (error) {
    return false;
  }
  return !doc.people.length && !doc.periods.length;
}

function showGuide() {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'guide', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title' },
      h('div', { class: 'guide-inner' },
        h('img', { src: 'icons/icon-192.png', alt: '', width: 64, height: 64, class: 'guide-icon' }),
        h('h1', { id: 'guide-title' }, '홈 화면에 추가해서 쓰세요'),
        h('ol', { class: 'steps' },
          h('li', null, h('strong', null, '[공유] 버튼을 누르세요'), h('span', null, '네모에서 위로 화살표가 나온 모양입니다. 안 보이면 [⋯]을 먼저 누르세요.')),
          h('li', null, h('strong', null, '[홈 화면에 추가] → [추가]'), h('span', null, '목록을 아래로 내리면 있습니다.')),
          h('li', null, h('strong', null, '홈 화면의 [인사고과] 아이콘으로 여세요'), h('span', null, '앱처럼 전체 화면으로 열리고, 인터넷 없이도 됩니다.'))),
        notice('info', '홈 화면 앱과 Safari는 저장 공간이 따로입니다. 여기(Safari)서 넣은 자료는 홈 화면 앱에 보이지 않습니다.'),
        notice('info', '자료는 이 휴대폰 안에만 저장됩니다. 앱을 지우기 전에 [자료] 탭에서 백업 파일을 만들어 두세요.'),
        button('여기서 그냥 쓰기', () => {
          try {
            localStorage.setItem(STAY_KEY, '1');
          } catch (error) {
            // 저장 못 해도 이번에는 넘어간다
          }
          overlay.remove();
          resolve();
        }, 'block')));
    document.body.append(overlay);
  });
}

// ------------------------------------------------------------ 오프라인 저장 (서비스 워커)
async function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;  // http 주소에서는 저장 없이 그냥 쓴다
  const hadController = Boolean(navigator.serviceWorker.controller);
  let registration;
  try {
    registration = await navigator.serviceWorker.register('sw.js');
  } catch (error) {
    console.warn('오프라인 저장을 쓸 수 없습니다', error);
    return;
  }
  const box = document.getElementById('update');
  const offer = (next) => {
    if (!next || !navigator.serviceWorker.controller) return;
    box.hidden = false;
    box.querySelector('button').onclick = () => {
      box.hidden = true;
      next.postMessage('skipWaiting');
    };
  };
  if (registration.waiting) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const next = registration.installing;
    if (next) next.addEventListener('statechange', () => { if (next.state === 'installed') offer(next); });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;  // 처음 설치 때는 다시 열 필요 없다
    reloading = true;
    location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
}

// ------------------------------------------------------------ 시작
function fatal(error) {
  document.getElementById('view').replaceChildren(card(
    h('h2', { class: 'card-title' }, '자료를 불러오지 못했습니다'),
    h('p', null, String((error && error.message) || error)),
    h('p', { class: 'help' }, '앱을 완전히 닫았다가 다시 열어 보세요.')));
}

async function boot() {
  cleanupOldTrial();
  let doc;
  try {
    doc = await store.load();
    if (doc) M.normalizeDoc(doc);
  } catch (error) {
    fatal(error);
    return;
  }
  if (!doc) {
    doc = M.emptyDoc();
    store.save(doc).catch((error) => console.warn(error));
  }
  state.doc = doc;
  state.render = render;
  store.protect();
  if (needsGuide(doc)) await showGuide();
  startNavigation();
  render();
  registerWorker();
}

boot();
