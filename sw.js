/* Actionables service worker
   - Precaches the app shell for offline use.
   - Navigation: network-first, falling back to the cached shell when offline.
   - Static assets: stale-while-revalidate (fast load, refreshes in background).
   - Auto-activates new versions so an OTA web deploy takes effect on next launch.
   Bump CACHE_VERSION whenever the shell asset list changes. The ?v= query in
   index.html already versions the individual files, so normal deploys are fine. */
var CACHE_VERSION = 'actionables-v6_24_2';
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './sync.js',
  './seed.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-64.png',
  './icons/apple-touch-icon.png'
];
/* Export libs (xlsx/jspdf) are intentionally NOT precached — they load lazily
   on first export and get cached on demand by the fetch handler below. */

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // addAll fails the whole install if any file 404s; add individually and ignore misses.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Only handle same-origin requests; let Firebase/AI/CDN calls pass straight through.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first so users get the latest deploy, offline falls back to shell.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // Static assets: serve from cache immediately, refresh in the background.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

// Allow the page to trigger an immediate update if it wants to.
self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
