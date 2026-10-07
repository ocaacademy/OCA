/**
 * =========================================================================
 * Oriental Culture Academy (東方文化書院)
 * Enterprise Service Worker — PWA 100% Full Spec (v2.2)
 * =========================================================================
 */

const CACHE_NAME = 'oca-pwa-v2.2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        CORE_ASSETS.map((url) => {
          return fetch(url).then((res) => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {});
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

  // Realtime Google Apps Script / Drive requests: bypass cache
  if (reqUrl.hostname.includes('script.google.com') ||
      reqUrl.hostname.includes('googleusercontent.com') ||
      reqUrl.hostname.includes('drive.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation: Network-First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets: Cache-First with Network Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => {});
    })
  );
});
