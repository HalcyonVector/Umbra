// Minimal app-shell service worker: stale-while-revalidate for same-origin
// GET requests, and it deliberately never touches /api/* — ISS position,
// crew census, and presets must always hit the network, never a stale cache.
//
// Cache name bumped so returning visitors evict whatever the old
// stale-while-revalidate-for-everything worker (v1) had cached — under that
// version, index.html itself was served stale, and since it references a
// content-hashed JS/CSS bundle filename that changes on every deploy, a
// cached index.html kept pointing at old, still-cached bundle files. A
// visitor could stay stuck on a build from several deploys ago indefinitely.
const CACHE_NAME = 'umbra-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navigations (the HTML shell) go network-first: it's the one resource
  // whose content decides which hashed bundle filenames get requested next,
  // so serving it stale is what let visitors get stuck on old deploys. Only
  // fall back to whatever shell was last cached if the network is actually
  // unreachable (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
