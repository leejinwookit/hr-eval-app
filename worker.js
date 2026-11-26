/* 인사고과 체험판 — 작업자 (Web Worker, 모듈)
   브라우저 안의 파이썬(Pyodide)으로 Django 앱을 돌리고, 화면(shell.js)의 요청에 답한다.
   자료(DB·로그인 쿠키)는 이 기기 브라우저의 IndexedDB 에만 저장한다. 어디로도 보내지 않는다. */
import { loadPyodide } from './pyodide/pyodide.mjs';

const DATA_DIR = '/hr-eval-data';  // 이 폴더가 IndexedDB 에 저장된다 (config/offline_runtime.py 의 data_dir)

let py = null;
let runtime = null;
let base = '';
let queue = Promise.resolve();

function progress(text, ratio) {
  postMessage({ type: 'progress', text, ratio });
}

function syncfs(populate) {
  return new Promise((resolve, reject) => {
    py.FS.syncfs(populate, (error) => (error ? reject(error) : resolve()));
  });
}

function exists(path) {
  try {
    py.FS.stat(path);
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchBytes(name) {
  const response = await fetch(base + name);
  if (!response.ok) throw new Error(`${name} 파일을 받지 못했습니다 (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

function bytesOf(proxy) {
  const buffer = proxy.getBuffer('u8');
  try {
    return buffer.data.slice();
  } finally {
    buffer.release();
  }
}

async function boot(options) {
  base = options.base;
  progress('파이썬 준비 중', 0.1);
  py = await loadPyodide({ indexURL: base + 'pyodide/' });
  progress('저장된 자료 불러오는 중', 0.45);
  py.FS.mkdirTree(DATA_DIR);
  py.FS.mount(py.FS.filesystems.IDBFS, {}, DATA_DIR);
  await syncfs(true);
  progress('앱 불러오는 중', 0.6);
  py.unpackArchive(await fetchBytes('app.zip'), 'zip', { extractDir: '/app' });
  const fresh = !exists(`${DATA_DIR}/db.sqlite3`);
  if (fresh) py.FS.writeFile(`${DATA_DIR}/db.sqlite3`, await fetchBytes('seed.sqlite3'));
  progress('앱 시작 중', 0.75);
  py.runPython('import sys\nif "/app" not in sys.path: sys.path.insert(0, "/app")');
  runtime = py.pyimport('config.offline_runtime');
  runtime.setup(options.staticUrl, DATA_DIR, options.version || '', fresh);
  await syncfs(false);
  return { fresh };
}

function request(payload) {
  const body = payload.body ? new Uint8Array(payload.body) : undefined;  // undefined → 파이썬 None
  const result = runtime.handle(payload.method, payload.url, payload.contentType || '', body);
  const headersProxy = result.get('headers');
  const bodyProxy = result.get('body');
  try {
    return { status: result.get('status'), headers: headersProxy.toJs(), body: bytesOf(bodyProxy) };
  } finally {
    headersProxy.destroy();
    bodyProxy.destroy();
    result.destroy();
  }
}

async function reset() {
  runtime.reset(await fetchBytes('seed.sqlite3'));
  return true;
}

const handlers = { boot, request, reset };

self.onmessage = (event) => {
  const message = event.data;
  const job = queue.then(async () => {
    const result = await handlers[message.type](message.payload);
    if (message.type !== 'boot') await syncfs(false);  // 바뀐 자료를 기기 저장소에 기록
    return result;
  });
  queue = job.catch(() => {});
  job.then(
    (result) => {
      const transfer = result && result.body instanceof Uint8Array ? [result.body.buffer] : [];
      postMessage({ id: message.id, result }, transfer);
    },
    (error) => {
      console.error(error);
      postMessage({ id: message.id, error: String((error && error.message) || error) });
    },
  );
};
