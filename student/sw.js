const CACHE_NAME = 'oca-student-395';
const ASSETS_TO_CACHE = [
  './',
  './manifest.json',
  '../student-icon-192.png',
  '../student-icon-512.png',
  '../student-favicon.png',
  '../oca_logo.png',
  '../js/oca-slip-guard.js',
  '../js/oca-student-ai-photo.js',
  '../js/oca-notice-board.js',
  '../js/oca-student-portal.js',
  '../assets/data/thai_address_compact.json',
  '../assets/images/oca_welcome_bg.jpg',
  '../assets/images/oca_mob_scene.jpg',
  '../assets/images/oca_student_card_front.jpg',
  '../assets/images/oca_student_card_back.jpg',
  '../assets/images/oca_bank_payment_qr.png'
];

self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res.ok || res.type === 'opaque') return cache.put(url, res);
            })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key.startsWith('oca-student-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url || '';
  if (!url.startsWith(self.location.origin)) return;
  if (url.includes('supabase.co') || url.includes('script.google.com')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'reload' })
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request) || await caches.match('./', { ignoreSearch: true });
          return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request) || await caches.match(event.request, { ignoreSearch: true });
        return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'OCA Student',
    body: 'New update from Oriental Culture Academy',
    url: './?tab=finance'
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && parsed.title) payload = Object.assign(payload, parsed);
    }
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '../student-icon-192.png',
      badge: '../student-favicon.png',
      data: { url: payload.url || './?tab=finance' },
      vibrate: [150, 80, 150]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './?tab=finance';
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url && client.url.includes('/student') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
