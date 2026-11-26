const CACHE_NAME = '398';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './portal.html',
  './student.html',
  './manifest.json',
  './js/oca-slip-guard.js',
  './js/oca-hover-popover.js',
  './js/oca-student-ai-photo.js',
  './js/oca-student-portal.js',
  './js/oca-student-notify.js',
  './js/oca-notice-board.js',
  './js/oca-email-admin.js',
  './css/oca-modular-v261.css',
  './css/oca-core-part1.css',
  './css/oca-core-part2.css',
  './js/oca-watchdog.js',
  './js/oca-offline-queue.js',
  './js/oca-rls-guard.js',
  './js/oca-backup-ops.js',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js',
  './icon-192.png',
  './icon-512.png',
  './student-icon-192.png',
  './student-icon-512.png',
  './student-favicon.png',
  './apple-touch-icon.png',
  './favicon.png',
  './favicon.ico',
  './oca_logo.png',
  './assets/images/oca_bamboo_cranes.jpg',
  './assets/images/oca_login_showcase.jpg',
  './assets/images/oca_welcome_bg.jpg',
  './assets/images/oca_mob_scene.jpg',
  './assets/images/oca_student_card_front.jpg',
  './assets/images/oca_student_card_back.jpg',
  './assets/images/oca_gold_card_template.jpg',
  './assets/images/oca_gold_card_template.png',
  './assets/images/kiosk_cat_kids.jpg',
  './assets/images/kiosk_cat_adult.jpg',
  './assets/images/kiosk_cat_convo.jpg',
  './assets/images/kiosk_cat_hsk.jpg',
  './assets/images/kiosk_cat_music.jpg',
  './assets/images/kiosk_cat_art.jpg',
  './assets/data/thai_address_compact.json',
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
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== 'oca-ai-models-v1' && !key.startsWith('oca-student-')) {
            console.log('[SW] Deleting stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network First with Cache Fallback; navigate requests force cache: 'no-cache')
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  if (event.request.url.includes('/student/')) {
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
          const isStudentNav = event.request.url.toLowerCase().includes('student.html');
          const cached = await caches.match(event.request) || await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          const fallback = isStudentNav
            ? (await caches.match('./student.html', { ignoreSearch: true }) || await caches.match('./index.html'))
            : (await caches.match('./index.html') || await caches.match('./'));
          if (fallback) return fallback;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  const reqPath = event.request.url.split('?')[0].toLowerCase();
  if (isSameOrigin && reqPath.endsWith('.onnx')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return res;
          })
          .catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
      })
    );
    return;
  }
  const isFreshAsset = isSameOrigin && (reqPath.endsWith('.html') || reqPath.endsWith('.js') || reqPath.endsWith('.css') || reqPath.endsWith('.json') || reqPath.endsWith('/'));
  const fetchTarget = isFreshAsset ? new Request(event.request, { cache: 'no-cache' }) : event.request;

  event.respondWith(
    fetch(fetchTarget)
      .then(async (res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        }
        if (!res || res.status >= 500) {
          const cached = await caches.match(event.request) || await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request) || await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        return new Response('', { status: 408, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});

// Background Web Push Notification (Android & iOS 16.4+ Home Screen PWA)
self.addEventListener('push', (event) => {
  let payload = { title: 'OCA Student', body: 'มีการอัปเดตใบเสร็จรับเงินของคุณ', url: './student.html?tab=finance' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') payload = { ...payload, ...parsed };
    }
  } catch (_) {
    try { if (event.data) payload.body = event.data.text(); } catch (__) {}
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './student-icon-192.png',
      badge: './student-favicon.png',
      data: { url: payload.url || './student.html?tab=finance' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || './student.html?tab=finance';
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes('student.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
