const CACHE = 'habits-v2-57';
const FILES = ['.', 'index.html', 'unbounded.ttf', 'fraunces.ttf', 'spacegrotesk.ttf', 'bricolage.ttf', 'xlsx.min.js', 'firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  // only handle same-origin GET requests from the cache; let everything else
  // (Firebase CDN scripts, Realtime Database API, POST/streaming) go straight to network
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(r => r || fetch(e.request)));
});
