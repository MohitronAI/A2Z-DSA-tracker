const CACHE_NAME = 'striver-a2z-static-v17';
const ASSETS = ['./', './index.html', './styles.css?v=mohit-os-20261002', './styles-build.css?v=build-20261003-5', './config.js?v=supabase-20260930', './curriculum.js?v=sync-20260930', './src/qr.js?v=pair-20261001', './src/app.js?v=mohit-os-20261002', './src/foundation/repository.mjs?v=foundation-20261003-5', './src/foundation/bootstrap.mjs?v=foundation-20261003-5', './src/build/app.mjs?v=build-20261003-5', './manifest.webmanifest?v=mohit-os-20261002', './icons/icon-192.svg', './icons/icon-512.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('striver-a2z-static-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)); return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
