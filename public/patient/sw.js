/* ─────────────────────────────────────────────
   JADOMI Patient — Service Worker v1
   ───────────────────────────────────────────── */
const CACHE_NAME = 'jadomi-patient-v1';

const APP_SHELL = [
  '/patient/',
  '/patient/index.html',
  '/patient/css/main.css',
  '/patient/js/router.js',
  '/patient/js/api.js',
  '/patient/js/pages/login.js',
  '/patient/js/pages/mes-rdv.js',
  '/patient/js/pages/chat.js',
  '/patient/js/pages/chat-ia.js',
  '/patient/js/pages/documents.js',
  '/patient/js/pages/mon-equipe.js',
  '/patient/js/pages/profil.js',
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
  let data = { title: 'JADOMI', body: 'Nouvelle notification', icon: '/assets/icons/icon-192.png' };
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
  let target = '/patient/#/mes-rdv';

  if (data.type === 'chat') target = '/patient/#/chat';
  else if (data.type === 'chat-ia') target = '/patient/#/chat-ia';
  else if (data.type === 'document') target = '/patient/#/documents';
  else if (data.type === 'rdv') target = '/patient/#/mes-rdv';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/patient/') && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});

/* ── Background Sync (offline message queue) */
self.addEventListener('sync', (e) => {
  if (e.tag === 'send-messages') {
    e.waitUntil(flushMessageQueue());
  }
});

async function flushMessageQueue() {
  // Stub: read queued messages from IndexedDB and POST them
  // Implementation will be connected when the chat API is live
  try {
    const cache = await caches.open(CACHE_NAME);
    // Future: iterate offline queue and send
  } catch (_) {}
}
