/* 인사고과 개인용 — 서비스 워커: 앱 파일을 기기에 받아 두어 인터넷 없이 열리게 한다.
   VERSION·FILES 는 personal/build.py 가 채운다. 새 버전은 화면의 [지금 반영]을 누르거나 앱을 다시 열 때 반영된다.
   예전 체험판과 같은 이름 규칙(hr-eval-app-*)을 써서, 새 버전이 켜질 때 체험판이 받아 둔 파일(약 24 MB)도 지운다. */
'use strict';

var VERSION = "56d048a757df";
var FILES = [
 "./",
 "version.json",
 "app.css",
 "icons/apple-touch-icon.png",
 "icons/favicon-32.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "index.html",
 "js/app.js",
 "js/decimal.js",
 "js/explain.js",
 "js/korean.js",
 "js/model.js",
 "js/scoring.js",
 "js/state.js",
 "js/store.js",
 "js/ui.js",
 "js/views/data.js",
 "js/views/evaluate.js",
 "js/views/people.js",
 "js/views/report.js",
 "manifest.webmanifest"
];
var PREFIX = 'hr-eval-app-';
var CACHE = PREFIX + VERSION;

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async function (file) {
      var response = await fetch(new Request(file, { cache: 'reload' }));
      if (!response.ok) throw new Error(file + ' (' + response.status + ')');
      await cache.put(file, response);
    }));
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.filter(function (name) {
      return name.indexOf(PREFIX) === 0 && name !== CACHE;
    }).map(function (name) {
      return caches.delete(name);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async function () {
    var cache = await caches.open(CACHE);
    var hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      var shell = await cache.match('./');
      if (shell) return shell;
    }
    return fetch(request);
  })());
});
