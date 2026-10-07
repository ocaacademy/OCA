/**
 * =========================================================================
 * Oriental Culture Academy (東方文化書院)
 * Enterprise Service Worker — PWA 100% Full Spec (v2.0)
 * Strategy:
 *  - Network-First for Navigation / HTML (Instant updates from GitHub Pages!)
 *  - Stale-While-Revalidate for Static Assets (Images, Icons, Fonts)
 *  - Network-Only for Google Apps Script Realtime API
 * =========================================================================
 */

const CACHE_NAME = 'oca-pwa-v2.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './icons/favicon.ico',
  './favicon.ico',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

// 1. Install Event — Pre-cache App Shell & Force Activate
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets v2.0');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Cache addAll warning:', err);
      });
    })
  );
});

// 2. Activate Event — Clean ALL Old Caches & Claim Clients Immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[ServiceWorker] Purging old cache version:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // A. Google Apps Script API or Drive: Bypass cache, always live realtime
  if (requestUrl.hostname.includes('script.google.com') ||
      requestUrl.hostname.includes('googleusercontent.com') ||
      requestUrl.hostname.includes('drive.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // B. Navigation / HTML Document: NETWORK-FIRST (Always fetch fresh updates from GitHub Pages!)
  if (event.request.mode === 'navigate' ||
      event.request.destination === 'document' ||
      requestUrl.pathname.endsWith('.html') ||
      requestUrl.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // C. Static Assets (Icons, Images): Cache First with Background Update
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
