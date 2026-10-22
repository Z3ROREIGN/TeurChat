const CACHE = 'teurchat-shell-v55';
const SHELL = ['/', '/index.html', '/entrar.html', '/pesquisar.html', '/manifest.json', '/favicon.svg', '/assets/teurchat-logo.svg', '/assets/teurchat-banner.svg', '/assets/teurchat-test-post.webp', '/app.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Always check the network first for the app shell and public Supabase config.
  // This prevents installed PWAs from staying stuck on an old, cached release.
  const alwaysFresh = event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/config.js' ||
    url.pathname.endsWith('.js');

  if (alwaysFresh) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('/index.html'))));
});