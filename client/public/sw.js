// Service Worker — minimal, network-first with cache fallback
const CACHE_NAME = 'tfl-v3';
const SHELL_URLS = ['/'];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET, API requests, and external URLs (CDN images, fonts, analytics, etc.)
  if (request.method !== 'GET' || request.url.includes('/api/')) return;
  const isSameOrigin = new URL(request.url).origin === self.location.origin;
  if (!isSameOrigin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful same-origin responses for navigation and static assets
        const isSameOrigin = new URL(request.url).origin === self.location.origin;
        if (response.ok && isSameOrigin && (request.mode === 'navigate' || request.url.match(/\.(js|css|png|svg|woff2?)$/))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            (request.mode === 'navigate'
              ? caches.match('/')
              : new Response('Offline', { status: 503, statusText: 'Offline' }))
        )
      )
  );
});
