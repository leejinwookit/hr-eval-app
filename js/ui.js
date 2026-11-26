/* 화면 조각을 만드는 도우미. 사용자가 넣은 글자는 textContent 로만 넣는다 (innerHTML 을 쓰지 않는다). */

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  const props = attrs || {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false || key === 'value') continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  if ('value' in props && props.value !== null && props.value !== undefined) el.value = props.value;
  return el;
}

export function append(el, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// ------------------------------------------------------------ 아이콘 (선 하나짜리 단순한 모양)
const ICONS = {
  eval: 'M9 4h6M9 4a2 2 0 0 0-2 2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1a2 2 0 0 0-2-2M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M8.5 13.5l2.5 2.5 4.5-5',
  people: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  data: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
};

export function icon(name, size = 24) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

// ------------------------------------------------------------ 화면 조각
export const card = (...children) => h('section', { class: 'card' }, ...children);

export function sectionTitle(text, extra) {
  return h('div', { class: 'section-title' }, h('h2', null, text), extra || null);
}

export function notice(kind, ...children) {
  return h('div', { class: `notice ${kind}`, role: kind === 'warn' ? 'note' : null }, ...children);
}

export const badge = (text, kind = 'muted') => h('span', { class: `badge ${kind}` }, text);

export function explainList(lines, className = 'explain') {
  if (!lines.length) return null;
  return h('ul', { class: className }, lines.map((line) => h('li', null, line)));
}

/** 목록 한 줄 (누르면 이동). */
export function linkRow({ href, title, sub, extra, right, className = '' }) {
  return h('a', { class: `row ${className}`.trim(), href },
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, title),
      sub ? h('div', { class: 'row-sub' }, sub) : null,
      extra || null),
    right ? h('div', { class: 'row-right' }, right) : null,
    icon('chevron', 18));
}

export function list(rows, emptyText) {
  if (!rows.length) return h('p', { class: 'empty' }, emptyText);
  return h('div', { class: 'list' }, rows);
}

export function button(text, onclick, kind = '', attrs = {}) {
  return h('button', { type: 'button', class: `btn ${kind}`.trim(), onclick, ...attrs }, text);
}

export function linkButton(text, href, kind = '') {
  return h('a', { class: `btn ${kind}`.trim(), href }, text);
}

export const actions = (...children) => h('div', { class: 'actions' }, ...children);

/** 달성률 막대: 상한까지를 전체 길이로, 100% 위치에 눈금. */
export function meter(achievement, cap) {
  const capNumber = Number(cap) || 100;
  const value = achievement === null ? 0 : Math.max(0, Math.min(Number(achievement.toFixed(1)), capNumber));
  const bar = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter-fill' }), h('span', { class: 'meter-mark' }));
  bar.style.setProperty('--fill', `${(value / capNumber) * 100}%`);
  bar.style.setProperty('--mark', `${(100 / capNumber) * 100}%`);
  return bar;
}

// ------------------------------------------------------------ 입력 칸
let fieldSeq = 0;

/** 입력 칸 하나. type: text·date·textarea·select. 오류 문구는 showErrors 가 채운다. */
export function field({ label, name, value = '', type = 'text', help, placeholder, inputmode, rows = 3, options, required, suffix, enterkeyhint }) {
  const id = `f-${name}-${(fieldSeq += 1)}`;
  const common = {
    id, name, placeholder, inputmode, required, 'aria-describedby': `${id}-help ${id}-error`, autocomplete: 'off', enterkeyhint,
  };
  let control;
  if (type === 'textarea') control = h('textarea', { ...common, rows, value });
  else if (type === 'select') control = h('select', { ...common, value }, options.map(([optionValue, text]) => h('option', { value: optionValue }, text)));
  else control = h('input', { ...common, type, value });
  return h('div', { class: 'field', dataset: { field: name } },
    h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    suffix ? h('div', { class: 'with-suffix' }, control, h('span', { class: 'suffix' }, suffix)) : control,
    help ? h('div', { class: 'help', id: `${id}-help` }, help) : null,
    h('div', { class: 'error', id: `${id}-error` }));
}

/** 하나를 고르는 선택지. options: [[값, 제목, 설명]] */
export function choices({ label, name, value, options, onchange }) {
  return h('fieldset', { class: 'field choices', dataset: { field: name } },
    h('legend', null, label),
    options.map(([optionValue, title, description]) => h('label', { class: 'choice' },
      h('input', { type: 'radio', name, value: String(optionValue), checked: String(optionValue) === String(value), onchange }),
      h('span', null, h('strong', null, title), description ? h('small', null, description) : null))),
    h('div', { class: 'error' }));
}

/** 폼의 값을 { 이름: 글자 } 로 (앞뒤 공백 제거). */
export function readForm(form) {
  const values = {};
  for (const [key, value] of new FormData(form)) values[key] = typeof value === 'string' ? value.trim() : value;
  return values;
}

/** errors: { 이름: 문구 }. 첫 오류 칸으로 이동한다. 오류가 없으면 false. */
export function showErrors(form, errors) {
  for (const box of form.querySelectorAll('[data-field]')) {
    const message = errors[box.dataset.field] || '';
    const error = box.querySelector(':scope > .error');
    if (error) error.textContent = message;
    for (const control of box.querySelectorAll('input, textarea, select')) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
  }
  const formError = form.querySelector('.form-error');
  if (formError) formError.textContent = errors._form || '';
  const first = Object.keys(errors).find((key) => errors[key]);
  if (!first) return false;
  const target = first === '_form' ? formError : form.querySelector(`[data-field="${first}"]`);
  if (target) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const control = target.querySelector('input:not([type=radio]), textarea, select');
    if (control) control.focus({ preventScroll: true });
  }
  return true;
}

/** 숫자 확인 결과({value}|{error})를 모아 오류 목록에 넣는다. */
export function take(errors, name, result) {
  if (result.error) errors[name] = result.error;
  return result.value;
}

// ------------------------------------------------------------ 알림
let toastTimer = null;
export function toast(message, kind = 'ok') {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = 'toast'; }, kind === 'error' ? 5000 : 2400);
}

// ------------------------------------------------------------ 날짜·기기
const pad = (n) => String(n).padStart(2, '0');
export function todayText(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateTimeText(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${todayText(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isAppleMobile() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isMobile() {
  return isAppleMobile() || /Android/.test(navigator.userAgent || '');
}

export function isStandalone() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function safeFileName(text) {
  return String(text).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || '자료';
}

/** 휴대폰은 [공유] 창(파일 앱 저장·메일·메신저), PC는 내려받기. 반환: 'shared' | 'downloaded' | 'cancelled' */
export async function saveFile(fileName, text, type) {
  const blob = new Blob([text], { type });
  if (isMobile() && navigator.canShare && typeof File === 'function') {
    const file = new File([blob], fileName, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      } catch (error) {
        if (error && error.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: fileName, class: 'hidden' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

/** 글을 [공유] 창으로 보내거나 (휴대폰), 클립보드에 복사한다. */
export async function shareText(title, text) {
  if (isMobile() && navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (error) {
    return 'failed';
  }
}
