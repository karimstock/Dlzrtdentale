/* ─────────────────────────────────────────────
   JADOMI Labo — Service Worker v1
   ───────────────────────────────────────────── */
const CACHE_NAME = 'jadomi-labo-v1';

const APP_SHELL = [
  '/labo-pro/',
  '/labo-pro/index.html',
  '/labo-pro/css/main.css',
  '/labo-pro/js/router.js',
  '/labo-pro/js/api.js',
  '/labo-pro/js/pages/login.js',
  '/labo-pro/js/pages/mes-cas.js',
  '/labo-pro/js/pages/case-detail.js',
  '/labo-pro/js/pages/profil.js',
];

/* ── Install ─────────────────────────────── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* ── Activate ────────────────────────────── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch ───────────────────────────────── */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

/* ── Push Notifications ──────────────────── */
self.addEventListener('push', (e) => {
  let data = { title: 'JADOMI Labo', body: 'Nouvelle notification', icon: '/assets/icons/icon-192.png' };
  try {
    data = Object.assign(data, e.data.json());
  } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      vibrate: [100, 50, 100],
      data: data,
    })
  );
});

/* ── Notification Click ──────────────────── */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  let target = '/labo-pro/#/mes-cas';

  if (data.type === 'photo') target = '/labo-pro/#/cas/' + (data.caseId || '');
  else if (data.type === 'message') target = '/labo-pro/#/cas/' + (data.caseId || '');

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/labo-pro/') && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});

/* ── Background Sync (offline photo queue) */
self.addEventListener('sync', (e) => {
  if (e.tag === 'upload-photos') {
    e.waitUntil(flushPhotoQueue());
  }
});

async function flushPhotoQueue() {
  try {
    const cache = await caches.open(CACHE_NAME);
    // Future: iterate offline queue and upload
  } catch (_) {}
}
