/* 인사고과 체험판 — 화면 쪽 (서버 없이 폰 브라우저 안에서 도는 판)
   worker.js 가 브라우저 안의 파이썬으로 Django 앱을 돌리고, 이 파일은 그 결과(HTML)를 화면에 보여 준다.
   - 화면마다 새 iframe 을 만들어 그린다 (페이지마다 깨끗한 자바스크립트 환경).
   - 링크·양식 제출을 가로채 작업자에게 보내고, 지금 화면의 경로는 주소의 #/경로 로 남긴다 (뒤로 가기·새로 고침).
   - 서비스 워커(sw.js)가 모든 파일을 기기에 받아 두어 두 번째부터는 인터넷 없이 열린다. */
(function () {
  'use strict';

  var BASE = new URL('./', location.href);
  var STATIC_PREFIX = BASE.pathname + 'static/';  // Django의 STATIC_URL (진짜 파일)
  var APP_ORIGIN = 'http://hr-eval.offline';      // Django가 보는 가상 주소 (config/offline_runtime.py)
  var RESET_PATH = '/__offline__/reset';          // 체험판 전용: 데모 데이터로 되돌리기
  var BRIDGE = '<script>parent.hrBridge(window)<\/script>';

  var views = document.getElementById('views');
  var splash = document.getElementById('splash');
  var statusText = document.getElementById('status');
  var progressBar = document.getElementById('progress');
  var busyBar = document.getElementById('busy');
  var retryButton = document.getElementById('retry');
  var updateBox = document.getElementById('update');
  var installGuide = document.getElementById('install-guide');
  var stayButton = document.getElementById('stay');

  var worker = null;
  var sequence = 0;
  var waiting = {};
  var booted = false;
  var currentPath = '/';
  var currentFrame = null;
  var renderToken = 0;
  var busyCount = 0;
  var busyTimer = null;

  // ------------------------------------------------------------ 시작 화면
  function setStatus(text, ratio) {
    if (text) statusText.textContent = text;
    if (typeof ratio === 'number') progressBar.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
  }

  function showError(message) {
    splash.hidden = false;
    splash.classList.add('error');
    setStatus(message);
    retryButton.hidden = false;
  }

  retryButton.addEventListener('click', function () { location.reload(); });

  // ------------------------------------------------------------ 작업자 (브라우저 안의 파이썬)
  function call(type, payload, transfer) {
    return new Promise(function (resolve, reject) {
      var id = ++sequence;
      waiting[id] = { resolve: resolve, reject: reject };
      worker.postMessage({ id: id, type: type, payload: payload }, transfer || []);
    });
  }

  function startWorker(version) {
    worker = new Worker('worker.js', { type: 'module' });
    worker.onmessage = function (event) {
      var message = event.data;
      if (message.type === 'progress') {
        if (!booted) setStatus(message.text + '…', message.ratio);
        return;
      }
      var job = waiting[message.id];
      if (!job) return;
      delete waiting[message.id];
      if (message.error) job.reject(new Error(message.error));
      else job.resolve(message.result);
    };
    worker.onerror = function (event) {
      showError('실행 중 문제가 생겼습니다. ' + (event.message || ''));
    };
    return call('boot', { base: BASE.href, staticUrl: STATIC_PREFIX, version: version });
  }

  // ------------------------------------------------------------ 요청 · 응답
  function header(response, name) {
    name = name.toLowerCase();
    for (var i = 0; i < response.headers.length; i++) {
      if (response.headers[i][0].toLowerCase() === name) return response.headers[i][1];
    }
    return '';
  }

  function busy(on) {
    busyCount += on ? 1 : -1;
    clearTimeout(busyTimer);
    if (busyCount > 0) busyTimer = setTimeout(function () { busyBar.className = 'on'; }, 150);
    else busyBar.className = '';
  }

  // href → { kind: 'app', path } (Django 화면) | { kind: 'file' | 'external', url }
  function classify(href, from) {
    var url = new URL(href, APP_ORIGIN + (from || currentPath));
    if (url.origin === APP_ORIGIN) {
      if (url.pathname.indexOf(STATIC_PREFIX) === 0) return { kind: 'file', url: BASE.origin + url.pathname + url.search };
      return { kind: 'app', path: url.pathname + url.search, hash: url.hash };
    }
    return { kind: url.origin === location.origin ? 'file' : 'external', url: url.href };
  }

  async function go(method, path, body, contentType, options) {
    options = options || {};
    if (path.split('?')[0] === RESET_PATH) return resetData();
    busy(true);
    try {
      for (var hops = 0; hops < 10; hops++) {
        var response = await call(
          'request', { method: method, url: path, body: body || null, contentType: contentType || '' },
          body ? [body] : [],
        );
        var next = header(response, 'location');
        if (response.status >= 300 && response.status < 400 && next) {
          path = classify(next, path).path || '/';
          method = 'GET';
          body = null;
          contentType = '';
          continue;
        }
        await show(response, path, options);
        return;
      }
      throw new Error('다른 화면으로 너무 여러 번 이동했습니다.');
    } catch (error) {
      console.error(error);
      enableButtons();
      if (!currentFrame) showError('화면을 열지 못했습니다: ' + error.message);
      else window.alert('처리하지 못했습니다.\n' + error.message);
    } finally {
      busy(false);
    }
  }

  async function show(response, path, options) {
    var type = header(response, 'content-type');
    var disposition = header(response, 'content-disposition');
    if (/attachment/i.test(disposition)) {
      download(response.body, disposition, type);
      enableButtons();
      return;
    }
    if (!type || /text\/html/i.test(type)) {
      render(await withAppScripts(new TextDecoder().decode(response.body), path), path, options);
      return;
    }
    window.open(URL.createObjectURL(new Blob([response.body], { type: type })), '_blank');
    enableButtons();
  }

  // Django가 만들어 주는 스크립트(관리자 화면의 /admin/jsi18n/ 등)는 진짜 파일이 아니다:
  // 작업자에게 받아 이 기기 안의 blob 주소로 바꿔 둔다. 같은 주소는 다시 받지 않는다.
  var SCRIPT_SRC = /(<script\b[^>]*?\ssrc=")([^"]+)(")/gi;
  var appScripts = {};

  async function withAppScripts(html, path) {
    function target(src) {
      var found = classify(src.replace(/&amp;/g, '&'), path);
      return found.kind === 'app' ? found.path : null;
    }
    var missing = [];
    html.replace(SCRIPT_SRC, function (all, before, src) {
      var key = target(src);
      if (key && !appScripts[key] && missing.indexOf(key) < 0) missing.push(key);
      return all;
    });
    for (var i = 0; i < missing.length; i++) {
      var response = await call('request', { method: 'GET', url: missing[i], body: null, contentType: '' });
      if (response.status !== 200) continue;
      var type = header(response, 'content-type') || 'text/javascript';
      appScripts[missing[i]] = URL.createObjectURL(new Blob([response.body], { type: type }));
    }
    return html.replace(SCRIPT_SRC, function (all, before, src, after) {
      var key = target(src);
      return key && appScripts[key] ? before + appScripts[key] + after : all;
    });
  }

  function withBridge(html) {
    var head = /<head[^>]*>/i.exec(html);
    if (!head) return BRIDGE + html;
    var at = head.index + head[0].length;
    return html.slice(0, at) + BRIDGE + html.slice(at);
  }

  function render(html, path, options) {
    var token = ++renderToken;
    var frame = document.createElement('iframe');
    frame.className = 'pending';
    frame.title = '인사고과 체험판';
    frame.addEventListener('load', function () {
      if (token !== renderToken) { frame.remove(); return; }
      frame.className = '';
      if (currentFrame && currentFrame !== frame) currentFrame.remove();
      currentFrame = frame;
      var doc = frame.contentDocument;
      document.title = (doc && doc.title) || '인사고과 체험판';
      if (options.hash && doc) {
        var target = doc.getElementById(decodeURIComponent(options.hash.slice(1)));
        if (target) target.scrollIntoView();
      }
      splash.hidden = true;
    });
    frame.srcdoc = withBridge(html);
    views.appendChild(frame);

    var same = path === currentPath;
    currentPath = path;
    if (options.fromHistory) return;
    if (options.replace || same) history.replaceState({ path: path }, '', '#' + path);
    else history.pushState({ path: path }, '', '#' + path);
  }

  function enableButtons() {
    setTimeout(function () {  // app.js 가 제출 직후 버튼을 잠그므로 그다음에 푼다
      var doc = currentFrame && currentFrame.contentDocument;
      if (!doc) return;
      doc.querySelectorAll('button[disabled]').forEach(function (button) {
        if (!button.hasAttribute('data-keep-disabled')) button.disabled = false;
      });
    }, 60);
  }

  function download(body, disposition, type) {
    var name = 'download';
    var encoded = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(disposition);
    var plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
    if (encoded) name = decodeURIComponent(encoded[1]);
    else if (plain) name = plain[1];
    var url = URL.createObjectURL(new Blob([body], { type: type || 'application/octet-stream' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function submitForm(form, submitter) {
    var attr = function (name) { return (submitter && submitter.getAttribute('form' + name)) || form.getAttribute(name) || ''; };
    var method = (attr('method') || 'get').toUpperCase();
    var target = classify(attr('action') || currentPath);
    if (target.kind !== 'app') return;
    var data;
    try {
      data = new FormData(form, submitter || undefined);
    } catch (error) {  // submitter 를 모르는 옛 브라우저
      data = new FormData(form);
      if (submitter && submitter.name) data.append(submitter.name, submitter.value);
    }
    if (method === 'GET') {
      var query = new URLSearchParams();
      data.forEach(function (value, key) { if (typeof value === 'string') query.append(key, value); });
      var search = query.toString();
      go('GET', target.path.split('?')[0] + (search ? '?' + search : ''));
      return;
    }
    if ((attr('enctype') || '').toLowerCase() === 'multipart/form-data') {
      var request = new Request(BASE.href, { method: 'POST', body: data });
      request.arrayBuffer().then(function (buffer) {
        go('POST', target.path, buffer, request.headers.get('content-type'));
      });
      return;
    }
    var fields = new URLSearchParams();
    data.forEach(function (value, key) { fields.append(key, typeof value === 'string' ? value : value.name); });
    go('POST', target.path, new TextEncoder().encode(fields.toString()).buffer, 'application/x-www-form-urlencoded');
  }

  // 각 화면(iframe)의 <head> 맨 앞에서 부른다: 링크·양식·팝업을 작업자 쪽으로 돌린다.
  window.hrBridge = function (win) {
    win.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('download')) return;
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
      event.preventDefault();
      var target = classify(href);
      if (target.kind === 'app') go('GET', target.path, null, '', { hash: target.hash });
      else window.open(target.url, '_blank', 'noopener');
    });
    win.addEventListener('submit', function (event) {
      if (event.defaultPrevented) return;  // app.js 의 확인 창에서 [취소]
      event.preventDefault();
      submitForm(event.target, event.submitter);
    });
    win.HTMLFormElement.prototype.submit = function () { submitForm(this, null); };  // submit 이벤트 없이 제출
    win.open = function (url) {  // 관리자 화면의 + 팝업 등은 같은 화면에서 연다
      if (url) {
        var target = classify(String(url));
        if (target.kind === 'app') go('GET', target.path);
        else window.open(target.url, '_blank', 'noopener');
      }
      return { closed: true, focus: function () {}, close: function () {} };
    };
  };

  // ------------------------------------------------------------ 체험판 전용 기능
  async function resetData() {
    var ok = window.confirm('데모 데이터로 되돌릴까요?\n이 기기에 저장된 평가 자료가 모두 지워지고 처음 상태로 돌아갑니다.');
    if (!ok) return;
    busy(true);
    try {
      await call('reset', null);
    } finally {
      busy(false);
    }
    go('GET', '/', null, '', { replace: true });
  }

  function routeFromHash() {
    var hash = decodeURI(location.hash.slice(1));
    return hash.charAt(0) === '/' ? hash : '/';
  }

  window.addEventListener('popstate', function () {
    var path = routeFromHash();
    if (booted && path !== currentPath) go('GET', path, null, '', { fromHistory: true });
  });

  // ------------------------------------------------------------ 오프라인 저장 (서비스 워커)
  function watchUpdates(registration) {
    function offer(next) {
      if (!next || !navigator.serviceWorker.controller) return;
      updateBox.hidden = false;
      updateBox.querySelector('button').onclick = function () {
        updateBox.hidden = true;
        next.postMessage('skipWaiting');
      };
    }
    if (registration.waiting) offer(registration.waiting);
    registration.addEventListener('updatefound', function () {
      var next = registration.installing;
      if (next) next.addEventListener('statechange', function () { if (next.state === 'installed') offer(next); });
    });
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  async function prepareOffline() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;  // http 주소: 저장 없이 바로 실행
    var registration;
    try {
      registration = await navigator.serviceWorker.register('sw.js');
    } catch (error) {
      console.warn('오프라인 저장을 쓸 수 없습니다', error);
      return;
    }
    navigator.serviceWorker.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type === 'precache' && !booted) {
        setStatus('처음 설치: 앱 파일 받는 중 (' + data.done + '/' + data.total + ')', data.done / data.total);
      }
    });
    var installing = registration.installing;
    if (!navigator.serviceWorker.controller && installing && !registration.active) {
      setStatus('처음 설치 준비 중…', 0);
      await new Promise(function (resolve) {  // 모든 파일을 받아 둘 때까지 (실패하면 그냥 진행)
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        installing.addEventListener('statechange', function () { if (installing.state === 'redundant') resolve(); });
      });
    }
    watchUpdates(registration);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }

  // ------------------------------------------------------------ 아이폰: 홈 화면에 먼저 추가
  // 아이폰·아이패드는 홈 화면 아이콘으로 연 앱과 Safari가 저장 공간을 따로 쓴다.
  // Safari에서 앱 파일을 받아도 아이콘으로 열면 다시 받아야 하고, 입력한 자료도 따로 남는다.
  // 그래서 Safari로 처음 열면 파일을 받기 전에 홈 화면에 추가하라는 안내부터 보여 준다.
  var STAY_KEY = 'hr-eval-stay-in-browser';

  function isAppleMobile() {
    var agent = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);  // 아이패드는 맥처럼 보인다
  }

  function isHomeScreenApp() {
    return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  function needsHomeScreenFirst() {
    if (!isAppleMobile() || isHomeScreenApp()) return false;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) return false;  // 이 브라우저에 이미 설치했다
    try {
      return localStorage.getItem(STAY_KEY) !== 'yes';  // [여기서 그냥 쓰기]를 고른 적이 있으면 다시 묻지 않는다
    } catch (error) {
      return true;
    }
  }

  function showHomeScreenGuide() {
    splash.classList.add('guide');
    installGuide.hidden = false;
    return new Promise(function (resolve) {
      stayButton.addEventListener('click', function () {
        try { localStorage.setItem(STAY_KEY, 'yes'); } catch (error) { /* 저장하지 못해도 이번에는 진행한다 */ }
        installGuide.hidden = true;
        splash.classList.remove('guide');
        resolve();
      }, { once: true });
    });
  }

  async function start() {
    try {
      if (needsHomeScreenFirst()) await showHomeScreenGuide();
      await prepareOffline();
      setStatus('준비 중…', 0);
      var version = '';
      try {
        version = (await (await fetch('version.json')).json()).version || '';
      } catch (error) { /* 버전 정보가 없어도 실행한다 */ }
      await startWorker(version);
      booted = true;
      setStatus('화면 여는 중…', 1);
      await go('GET', routeFromHash(), null, '', { replace: true });
    } catch (error) {
      console.error(error);
      showError(navigator.onLine
        ? '시작하지 못했습니다: ' + error.message
        : '처음 설치할 때는 인터넷 연결이 필요합니다. 연결한 뒤 다시 시도하세요.');
    }
  }

  start();
})();
