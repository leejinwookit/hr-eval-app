/* 앱 상태(자료 문서)와 저장, 화면 이동. 모든 화면이 함께 쓴다. */
import * as store from './store.js';
import { toast } from './ui.js';

export const state = { doc: null, render: () => {} };

/** 바꾼 자료를 저장한다. 실패하면 알리고 false.
    touch: false 는 '자료가 바뀐 것'으로 치지 않는다 (보던 회차 바꾸기, 백업 날짜 기록 등). */
export async function save(message, { touch = true } = {}) {
  if (touch) state.doc.meta.changedAt = new Date().toISOString();
  try {
    await store.save(state.doc);
    if (message) toast(message);
    return true;
  } catch (error) {
    console.error(error);
    toast('저장하지 못했습니다: ' + (error && error.message ? error.message : error), 'error');
    return false;
  }
}

// ------------------------------------------------------------ 화면 이동 (#/주소)
// 앱 안에서 지나온 주소. [뒤로]가 앱 밖으로 나가지 않게 한다 (홈 화면 앱에는 브라우저 뒤로 버튼이 없다).
const trail = [];
let replacing = false;
let rewindTo = null;
const scrollMemory = new Map();

export function currentHash() {
  return location.hash || '#/';
}

export function startNavigation() {
  trail.push(currentHash());
  window.addEventListener('hashchange', () => {
    const here = currentHash();
    let isBack = false;
    if (rewindTo !== null) {
      trail.length = rewindTo;
      rewindTo = null;
      isBack = true;
    } else if (replacing) {
      trail[trail.length - 1] = here;
      replacing = false;
    } else if (trail.length >= 2 && trail[trail.length - 2] === here) {
      trail.pop();
      isBack = true;
    } else {
      trail.push(here);
    }
    state.render({ scroll: isBack ? scrollMemory.get(here) || 0 : 0 });
  });
  window.addEventListener('scroll', () => scrollMemory.set(currentHash(), window.scrollY), { passive: true });
}

/** 지금 화면을 다른 주소로 바꾼다 (저장 뒤 폼 화면을 기록에 남기지 않을 때). */
export function replaceTo(hash) {
  if (currentHash() === hash) {
    state.render({ scroll: 0 });
    return;
  }
  replacing = true;
  location.replace(hash);
}

/** 이전 화면으로. 앱 안에서 지나온 화면이 없으면 fallback 으로. */
export function back(fallback) {
  if (trail.length >= 2) history.back();
  else replaceTo(fallback);
}

/** 지나온 화면 중 hash 까지 되돌아간다 (지운 자료의 화면을 건너뛸 때). 없으면 그 주소로 바꾼다. */
export function backTo(hash) {
  const index = trail.lastIndexOf(hash);
  if (index >= 0 && index < trail.length - 1) {
    rewindTo = index + 1;
    history.go(index - (trail.length - 1));
  } else {
    replaceTo(hash);
  }
}

/** 주소창의 주소만 바꾼다 (화면 이동 없이). 예) 모르는 주소 → '#/' */
export function correctHash(hash) {
  history.replaceState(null, '', hash);
  if (trail.length) trail[trail.length - 1] = hash;
}

/** 지금 화면을 다시 그린다 (스크롤 유지). */
export function refresh() {
  state.render({ scroll: window.scrollY });
}
