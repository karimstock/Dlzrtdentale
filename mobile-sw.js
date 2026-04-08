/* ============================================================
   JADOMI mobile SW — minimal, non-intrusif
   ============================================================
   Servi à la racine pour permettre l'install PWA depuis /m.
   Stratégie : ne touche QUE les ressources mobiles connues.
   Pour tout le reste (legacy index.html, /api/, etc), passthrough
   total → ne casse pas l'app desktop existante.
   ============================================================ */

const CACHE = 'jadomi-mobile-v1';

const MOBILE_ASSETS = [
  '/m',
  '/mobile.html',
  '/mobile-manifest.json',
  '/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(MOBILE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Hors origine ou non-GET → passthrough
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  // API + Supabase + tout ce qui n'est pas mobile-related → passthrough total
  // (laisse le navigateur gérer normalement, ne brise PAS l'app legacy)
  const isMobileAsset =
    url.pathname === '/m' ||
    url.pathname === '/mobile.html' ||
    url.pathname === '/mobile-manifest.json' ||
    url.pathname === '/mobile-sw.js' ||
    url.pathname === '/icon.svg';

  if (!isMobileAsset) return;

  // Cache-first sur les assets mobile
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/m'))
    )
  );
});
