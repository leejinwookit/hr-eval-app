/* 인사고과 체험판 — 서비스 워커: 앱 파일을 기기에 받아 두어 두 번째부터는 인터넷 없이 열리게 한다.
   VERSION·FILES 는 offline/build.py 가 채운다. 새 버전은 화면의 [지금 반영]을 누르거나 앱을 다시 열 때 반영된다. */
'use strict';

var VERSION = "9c531c090e8c";
var FILES = [
 "./",
 "version.json",
 "app.zip",
 "icons/apple-touch-icon.png",
 "icons/favicon-32.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "index.html",
 "manifest.webmanifest",
 "pyodide/pyodide-lock.json",
 "pyodide/pyodide.asm.mjs",
 "pyodide/pyodide.asm.wasm",
 "pyodide/pyodide.mjs",
 "pyodide/python_stdlib.zip",
 "seed.sqlite3",
 "shell.js",
 "static/admin/css/autocomplete.css",
 "static/admin/css/base.css",
 "static/admin/css/changelists.css",
 "static/admin/css/dark_mode.css",
 "static/admin/css/dashboard.css",
 "static/admin/css/forms.css",
 "static/admin/css/login.css",
 "static/admin/css/nav_sidebar.css",
 "static/admin/css/responsive.css",
 "static/admin/css/responsive_rtl.css",
 "static/admin/css/rtl.css",
 "static/admin/css/unusable_password_field.css",
 "static/admin/css/vendor/select2/LICENSE-SELECT2.md",
 "static/admin/css/vendor/select2/select2.css",
 "static/admin/css/vendor/select2/select2.min.css",
 "static/admin/css/widgets.css",
 "static/admin/img/calendar-icons.svg",
 "static/admin/img/icon-addlink.svg",
 "static/admin/img/icon-alert-dark.svg",
 "static/admin/img/icon-alert.svg",
 "static/admin/img/icon-calendar.svg",
 "static/admin/img/icon-changelink.svg",
 "static/admin/img/icon-clock.svg",
 "static/admin/img/icon-debug-dark.svg",
 "static/admin/img/icon-debug.svg",
 "static/admin/img/icon-deletelink.svg",
 "static/admin/img/icon-hidelink.svg",
 "static/admin/img/icon-info-dark.svg",
 "static/admin/img/icon-info.svg",
 "static/admin/img/icon-no-dark.svg",
 "static/admin/img/icon-no.svg",
 "static/admin/img/icon-unknown-alt.svg",
 "static/admin/img/icon-unknown.svg",
 "static/admin/img/icon-viewlink.svg",
 "static/admin/img/icon-yes-dark.svg",
 "static/admin/img/icon-yes.svg",
 "static/admin/img/inline-delete.svg",
 "static/admin/img/search.svg",
 "static/admin/img/selector-icons.svg",
 "static/admin/img/sorting-icons.svg",
 "static/admin/img/tooltag-add.svg",
 "static/admin/img/tooltag-arrowright.svg",
 "static/admin/js/SelectBox.js",
 "static/admin/js/SelectFilter2.js",
 "static/admin/js/actions.js",
 "static/admin/js/admin/DateTimeShortcuts.js",
 "static/admin/js/admin/RelatedObjectLookups.js",
 "static/admin/js/autocomplete.js",
 "static/admin/js/calendar.js",
 "static/admin/js/cancel.js",
 "static/admin/js/change_form.js",
 "static/admin/js/core.js",
 "static/admin/js/filters.js",
 "static/admin/js/inlines.js",
 "static/admin/js/jquery.init.js",
 "static/admin/js/nav_sidebar.js",
 "static/admin/js/popup_response.js",
 "static/admin/js/prepopulate.js",
 "static/admin/js/prepopulate_init.js",
 "static/admin/js/theme.js",
 "static/admin/js/urlify.js",
 "static/admin/js/vendor/jquery/LICENSE.txt",
 "static/admin/js/vendor/jquery/jquery.js",
 "static/admin/js/vendor/jquery/jquery.min.js",
 "static/admin/js/vendor/select2/LICENSE.md",
 "static/admin/js/vendor/select2/i18n/af.js",
 "static/admin/js/vendor/select2/i18n/ar.js",
 "static/admin/js/vendor/select2/i18n/az.js",
 "static/admin/js/vendor/select2/i18n/bg.js",
 "static/admin/js/vendor/select2/i18n/bn.js",
 "static/admin/js/vendor/select2/i18n/bs.js",
 "static/admin/js/vendor/select2/i18n/ca.js",
 "static/admin/js/vendor/select2/i18n/cs.js",
 "static/admin/js/vendor/select2/i18n/da.js",
 "static/admin/js/vendor/select2/i18n/de.js",
 "static/admin/js/vendor/select2/i18n/dsb.js",
 "static/admin/js/vendor/select2/i18n/el.js",
 "static/admin/js/vendor/select2/i18n/en.js",
 "static/admin/js/vendor/select2/i18n/es.js",
 "static/admin/js/vendor/select2/i18n/et.js",
 "static/admin/js/vendor/select2/i18n/eu.js",
 "static/admin/js/vendor/select2/i18n/fa.js",
 "static/admin/js/vendor/select2/i18n/fi.js",
 "static/admin/js/vendor/select2/i18n/fr.js",
 "static/admin/js/vendor/select2/i18n/gl.js",
 "static/admin/js/vendor/select2/i18n/he.js",
 "static/admin/js/vendor/select2/i18n/hi.js",
 "static/admin/js/vendor/select2/i18n/hr.js",
 "static/admin/js/vendor/select2/i18n/hsb.js",
 "static/admin/js/vendor/select2/i18n/hu.js",
 "static/admin/js/vendor/select2/i18n/hy.js",
 "static/admin/js/vendor/select2/i18n/id.js",
 "static/admin/js/vendor/select2/i18n/is.js",
 "static/admin/js/vendor/select2/i18n/it.js",
 "static/admin/js/vendor/select2/i18n/ja.js",
 "static/admin/js/vendor/select2/i18n/ka.js",
 "static/admin/js/vendor/select2/i18n/km.js",
 "static/admin/js/vendor/select2/i18n/ko.js",
 "static/admin/js/vendor/select2/i18n/lt.js",
 "static/admin/js/vendor/select2/i18n/lv.js",
 "static/admin/js/vendor/select2/i18n/mk.js",
 "static/admin/js/vendor/select2/i18n/ms.js",
 "static/admin/js/vendor/select2/i18n/nb.js",
 "static/admin/js/vendor/select2/i18n/ne.js",
 "static/admin/js/vendor/select2/i18n/nl.js",
 "static/admin/js/vendor/select2/i18n/pl.js",
 "static/admin/js/vendor/select2/i18n/ps.js",
 "static/admin/js/vendor/select2/i18n/pt-BR.js",
 "static/admin/js/vendor/select2/i18n/pt.js",
 "static/admin/js/vendor/select2/i18n/ro.js",
 "static/admin/js/vendor/select2/i18n/ru.js",
 "static/admin/js/vendor/select2/i18n/sk.js",
 "static/admin/js/vendor/select2/i18n/sl.js",
 "static/admin/js/vendor/select2/i18n/sq.js",
 "static/admin/js/vendor/select2/i18n/sr-Cyrl.js",
 "static/admin/js/vendor/select2/i18n/sr.js",
 "static/admin/js/vendor/select2/i18n/sv.js",
 "static/admin/js/vendor/select2/i18n/th.js",
 "static/admin/js/vendor/select2/i18n/tk.js",
 "static/admin/js/vendor/select2/i18n/tr.js",
 "static/admin/js/vendor/select2/i18n/uk.js",
 "static/admin/js/vendor/select2/i18n/vi.js",
 "static/admin/js/vendor/select2/i18n/zh-CN.js",
 "static/admin/js/vendor/select2/i18n/zh-TW.js",
 "static/admin/js/vendor/select2/select2.full.js",
 "static/admin/js/vendor/select2/select2.full.min.js",
 "static/admin/js/vendor/xregexp/LICENSE.txt",
 "static/admin/js/vendor/xregexp/xregexp.js",
 "static/admin/js/vendor/xregexp/xregexp.min.js",
 "static/css/app.css",
 "static/icons/apple-touch-icon.png",
 "static/icons/favicon-32.png",
 "static/icons/icon-192.png",
 "static/icons/icon-512.png",
 "static/icons/icon-maskable-512.png",
 "static/js/app.js",
 "static/manifest.webmanifest",
 "worker.js"
];
var PREFIX = 'hr-eval-app-';
var CACHE = PREFIX + VERSION;

function report(done, total) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage({ type: 'precache', done: done, total: total });
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    var queue = FILES.slice();
    var done = 0;
    async function work() {
      while (queue.length) {
        var file = queue.shift();
        var response = await fetch(new Request(file, { cache: 'reload' }));
        if (!response.ok) throw new Error(file + ' (' + response.status + ')');
        await cache.put(file, response);
        report(++done, FILES.length);
      }
    }
    await Promise.all([work(), work(), work(), work()]);
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
