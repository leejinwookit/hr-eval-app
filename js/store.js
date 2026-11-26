/* 이 기기에 자료 저장 — IndexedDB 에 JSON 문서 하나를 통째로 넣는다.
   IndexedDB 를 못 쓰는 브라우저(일부 사생활 보호 모드)는 localStorage 로 대신한다. */

const DB_NAME = 'hr-eval-personal';
const STORE = 'doc';
const KEY = 'main';
const FALLBACK_KEY = 'hr-eval-personal-doc';

let dbPromise = null;
export const info = { engine: 'IndexedDB' };

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB 를 쓸 수 없습니다'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('다른 창이 저장소를 쓰고 있습니다. 다른 창을 닫고 다시 여세요.'));
    });
  }
  return dbPromise;
}

function run(mode, action) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || new Error('저장이 취소되었습니다'));
  }));
}

/** 저장된 자료 (없으면 null). */
export async function load() {
  let text;
  try {
    text = await run('readonly', (store) => store.get(KEY));
  } catch (error) {
    console.warn('IndexedDB 대신 localStorage 를 씁니다', error);
    info.engine = 'localStorage';
    text = localStorage.getItem(FALLBACK_KEY);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('저장된 자료가 손상되어 읽지 못했습니다.');
  }
}

let queue = Promise.resolve();

/** 순서대로 저장한다 (먼저 부른 저장이 끝난 뒤 다음 저장). */
export function save(doc) {
  const text = JSON.stringify(doc);
  const job = queue.then(() => (info.engine === 'IndexedDB'
    ? run('readwrite', (store) => store.put(text, KEY))
    : localStorage.setItem(FALLBACK_KEY, text)));
  queue = job.catch(() => {});
  return job;
}

/** 브라우저가 공간이 모자랄 때 이 앱 자료를 임의로 지우지 않게 요청한다. */
export async function protect() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (error) {
    return null;
  }
}

export async function protectedState() {
  try {
    return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  } catch (error) {
    return null;
  }
}
