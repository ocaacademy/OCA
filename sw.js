const CACHE_NAME = '77';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './modnet_quantized.onnx',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './favicon.ico',
  './oca_logo.png',
  './assets/images/oca_gold_card_template.jpg',
  './assets/images/oca_gold_card_template.png',
  './assets/data/thai_address_compact.json',
  'https://lh3.googleusercontent.com/d/1fcU0PER7rsamfGUrIpI-kJVDLKednw7P',
  'https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js'
];

// Handle direct skipWaiting message from client
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});

// Install Event - Resilient Individual Caching (Prevents 404 from aborting installation)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => {
          return fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res.ok || res.type === 'opaque') {
                return cache.put(url, res);
              }
            })
            .catch((err) => {
              console.warn('[SW Precache Skip]', url, err);
            });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network First with Cache Fallback; navigate requests force cache: 'no-cache')
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Bypass third-party, API, and cloud services (Supabase, Google Scripts, WorldTimeAPI, etc.)
  const isSameOrigin = event.request.url.startsWith(self.location.origin);
  if (!isSameOrigin && !ASSETS_TO_CACHE.includes(event.request.url)) {
    return;
  }
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('script.google.com') ||
    event.request.url.includes('worldtimeapi.org')
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'reload' })
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('./index.html') || await caches.match('./');
          if (fallback) return fallback;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('', { status: 408, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});
