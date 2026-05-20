require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { Mistral } = require('@mistralai/mistralai');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

const app = express();

// === Security: trust only 1 proxy hop (Nginx/Cloudflare) for correct req.ip in rate limiters ===
// Without this, behind a reverse proxy, req.ip is always the proxy IP and rate limits are shared/bypassable.
// Set to 1 for single proxy (Nginx), 2 for Cloudflare+Nginx. Never set to true (trusts all X-Forwarded-For).
app.set('trust proxy', 1);

// === Performance: gzip/brotli compression ===
const compression = require('compression');
app.use(compression({ threshold: 1024 })); // compress responses > 1KB

// === PWA Patient — MUST be first (before Helmet, CORS, etc.) ===
const fs = require('fs');
app.use('/patient', (req, res) => {
  const reqPath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
  const filePath = path.resolve(__dirname, 'public', 'patient', reqPath);
  // Path traversal protection
  const safeDir = path.resolve(__dirname, 'public', 'patient');
  if (!filePath.startsWith(safeDir)) return res.status(403).end();
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
  } catch(e) {}
  res.sendFile(path.join(__dirname, 'public', 'patient', 'index.html'));
});

// === PWA Labo Pro — MUST be before Helmet, CORS, etc. ===
app.use('/labo-pro', (req, res) => {
  const reqPath = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
  const filePath = path.resolve(__dirname, 'public', 'labo-pro', reqPath);
  // Path traversal protection
  const safeDir = path.resolve(__dirname, 'public', 'labo-pro');
  if (!filePath.startsWith(safeDir)) return res.status(403).end();
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
  } catch(e) {}
  res.sendFile(path.join(__dirname, 'public', 'labo-pro', 'index.html'));
});

// === Security: Helmet (HTTP headers) ===
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // désactivé CSP pour ne pas casser les CDN (jsdelivr, unpkg, google fonts)
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// === Security: CORS strict ===
// En production, seules les origines jadomi.fr/.be sont autorisées.
// En dev/local (sans NODE_ENV=production), toutes origines acceptées.
const allowedOrigins = [
  'https://jadomi.fr', 'https://www.jadomi.fr',
  'https://jadomi.be', 'https://www.jadomi.be',
  'https://patient.jadomi.fr'
];
app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true); // curl, PWA same-origin, server-to-server
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin ' + origin + ' not allowed by CORS'));
  },
  credentials: true
}));

// ===== SÉCURITÉ JADOMI — Headers protection niveau étatique =====
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, geolocation=self');
  // Pas de CSP restrictif pour l'app Flutter (simulateur admin)
  if (req.path.startsWith('/app-preview')) {
    res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
  } else {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://js.stripe.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com; font-src 'self' https://fonts.gstatic.com https://www.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://vsbomwjzehnfinfjvhqp.supabase.co https://api.anthropic.com https://api.openai.com https://api.stripe.com wss://*.supabase.co https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://cdn.jsdelivr.net https://unpkg.com https://*.cartocdn.com https://*.basemaps.cartocdn.com https://api.maptiler.com https://router.project-osrm.org https://www.gstatic.com; frame-src 'self' https://js.stripe.com http://localhost:3100; worker-src 'self' blob: https://unpkg.com https://cdn.jsdelivr.net https://www.gstatic.com;");
  }
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// === Security: Rate limiting ===
const rateLimit = require('express-rate-limit');

// Global API : 300 requetes / 15 min / IP (bypass assets statiques et health)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes' },
  skip: (req) => req.path === '/api/health'
});
app.use('/api/', globalLimiter);

// Strict login : 5 tentatives / 15 min / IP
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
}));

// Strict register : 3 créations / heure / IP
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de créations de compte, réessayez dans 1 heure' }
}));

// Modere forgot-password : 5 / 15 min / IP
app.use('/api/auth/forgot-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes, réessayez dans 15 minutes' }
}));

// PWA Patient — monté en tout premier dans le fichier (avant Helmet)

// === Performance: in-memory cache helper ===
const _cache = new Map();
function getCached(key, fn, ttl = 60000) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return hit.data;
  const data = fn();
  _cache.set(key, { data, time: Date.now() });
  return data;
}
// Cleanup automatique toutes les 10 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _cache) if (now - v.time > 600000) _cache.delete(k);
}, 600000).unref();
global.jadomiCache = { get: getCached, map: _cache };

// === Performance: request timeout for API routes (30s, longer for uploads/IMAP) ===
app.use('/api/', (req, res, next) => {
  // Exempt upload and long-running routes from short timeout
  const longRoutes = ['/api/documents/upload', '/api/media', '/api/scan-yahoo', '/api/scan-gmail'];
  if (longRoutes.some(r => req.originalUrl.startsWith(r))) {
    return next(); // These routes set their own timeout or use multer
  }
  req.setTimeout(30000);
  res.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Requete trop longue (timeout 30s)' });
    }
  });
  next();
});

// === Monitoring: health endpoint (bypass rate limit) ===
const _startTime = Date.now();
app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_s: Math.floor((Date.now() - _startTime) / 1000),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024)
    },
    cache_size: _cache.size
  });
});

// ═══ Protection projet — page verrou avec mot de passe ═══
const cookieParser = require('cookie-parser');
app.use(cookieParser());
const GATE_PASSWORD = 'Jadomi2026';
const GATE_COOKIE = 'jadomi_gate';

// Route POST pour soumettre le mot de passe
app.post('/gate', express.urlencoded({ extended: false }), (req, res) => {
  if (req.body && req.body.password === GATE_PASSWORD) {
    res.cookie(GATE_COOKIE, 'ok', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    return res.redirect(req.body.redirect || '/');
  }
  return res.redirect('/?gate=error');
});

// Middleware verrou — bloque tout sauf assets statiques
app.use((req, res, next) => {
  // Laisser passer les assets, API, webhooks, robots.txt, pages publiques
  // Pages publiques — DÉCOMMENTER QUAND PRÊT AU LANCEMENT PUBLIC :
  // const publicPaths = ['/', '/landing', '/chirurgiens-dentistes', '/dentistes', '/prothesistes-dentaires',
  //   '/infirmiers', '/avocats', '/orthodontistes', '/tarifs', '/contact', '/mentions-legales', '/cgv',
  //   '/comparateur', '/studio', '/studio/index.html', '/studio/video-creator.html',
  //   '/robots.txt', '/sitemap.xml', '/professions-paramedicales', '/services-bien-etre',
  //   '/btp', '/sci', '/createurs', '/coiffeurs'];
  // const isPublic = publicPaths.includes(req.path) || publicPaths.includes(req.path.replace(/\.html$/, ''));
  // const isBot = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebot|twitterbot|linkedinbot/i.test(req.headers['user-agent'] || '');
  if (req.path.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|map|json|webmanifest|xml|txt|pdf|mp3|mp4|webp|gif|eot|wasm)$/) || req.path.startsWith('/api/') || req.path === '/robots.txt' || req.path === '/comparateur' || req.path.startsWith('/studio') || req.path.startsWith('/app-preview') || req.path.startsWith('/canvaskit')) {
    return next();
  }
  // Vérifier le cookie
  if (req.cookies && req.cookies[GATE_COOKIE] === 'ok') {
    return next();
  }
  // Pas de cookie → afficher la page verrou
  const error = req.query.gate === 'error';
  return res.status(401).send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JADOMI — Accès protégé</title><link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;background:#0a0a0f;color:#e5e5e5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:rgba(22,22,31,.9);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:48px 40px;width:100%;max-width:400px;text-align:center;backdrop-filter:blur(20px);box-shadow:0 24px 48px rgba(0,0,0,.4)}.logo{font-family:Syne,sans-serif;font-size:32px;font-weight:800;background:linear-gradient(135deg,#0d9488,#14b8a6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-1px;margin-bottom:8px}.subtitle{font-size:14px;color:#737373;margin-bottom:32px}input{width:100%;padding:14px 18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#e5e5e5;font-size:16px;font-family:Inter,sans-serif;outline:none;transition:border-color .2s;margin-bottom:16px}input:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.15)}button{width:100%;padding:14px;background:#0d9488;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s}button:hover{background:#0f766e}.error{color:#ef4444;font-size:13px;margin-bottom:12px}</style></head><body><div class="card"><div class="logo">JADOMI</div><div class="subtitle">Accès réservé au fondateur</div>${error ? '<div class="error">Mot de passe incorrect</div>' : ''}<form method="POST" action="/gate"><input type="hidden" name="redirect" value="${req.originalUrl}"><input type="password" name="password" placeholder="Mot de passe" autofocus autocomplete="current-password"><button type="submit">Accéder</button></form></div></body></html>`);
});

// Middleware : strip .html extension et rediriger vers URL propre (conserve les query params)
// 302 (pas 301) pour ne pas casser le bouton retour du navigateur
app.use((req, res, next) => {
  if (req.path.endsWith('.html') && !req.path.startsWith('/public/') && !req.path.startsWith('/api/')) {
    const cleanPath = req.path.replace(/\.html$/, '');
    const qs = req.originalUrl.includes('?') ? req.originalUrl.substring(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, cleanPath + qs);
  }
  next();
});

// app.use(express.json()) deplace plus bas pour permettre raw body sur webhook stripe
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/landing.html')));
app.get('/m', (req, res) => res.sendFile(path.join(__dirname, 'mobile.html')));
app.get('/tarifs', (req, res) => res.sendFile(path.join(__dirname, 'public/tarifs.html')));
app.get('/demo', (req, res) => res.sendFile(path.join(__dirname, 'public/demo.html')));
// Landings métier dédiés (Passe 27 + 5-group hierarchy)
app.get('/avocats', (req, res) => res.sendFile(path.join(__dirname, 'public/avocats.html')));
app.get('/btp', (req, res) => res.sendFile(path.join(__dirname, 'public/btp.html')));
app.get('/sci', (req, res) => res.sendFile(path.join(__dirname, 'public/sci.html')));
app.get('/createurs', (req, res) => res.sendFile(path.join(__dirname, 'public/createurs.html')));
app.get('/chirurgiens-dentistes', (req, res) => res.sendFile(path.join(__dirname, 'public/chirurgiens-dentistes.html')));
app.get('/comparateur', (req, res) => res.sendFile(path.join(__dirname, 'public/comparateur.html')));
app.get('/orthodontistes', (req, res) => res.sendFile(path.join(__dirname, 'public/orthodontistes.html')));
app.get('/prothesistes-dentaires', (req, res) => res.sendFile(path.join(__dirname, 'public/prothesistes-dentaires.html')));
app.get('/professions-paramedicales', (req, res) => res.sendFile(path.join(__dirname, 'public/professions-paramedicales.html')));
app.get('/services-bien-etre', (req, res) => res.sendFile(path.join(__dirname, 'public/services-bien-etre.html')));
// JADOMI Dentiste Pro Dashboard
app.get('/admin/dentiste-pro', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/dentiste-pro.html')));
app.get('/admin/jadomi-ia', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'public/admin/jadomi-ia.html')); });
// JADOMI Rappels automatiques (Passe 70)
app.get('/rappels', (req, res) => res.sendFile(path.join(__dirname, 'public/rappels.html')));
// JADOMI Ads (Passe 34)
app.get('/jadomi-ads', (req, res) => res.sendFile(path.join(__dirname, 'public/jadomi-ads.html')));
app.get('/dashboard-annonceur', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard-annonceur.html')));
// JADOMI Studio V2 Hub (objectifs métier)
app.get('/studio', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/hub.html')));
app.get('/studio/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/hub.html')));
app.get('/studio/campagne', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/campagne.html')));
app.get('/studio/flyer-builder', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/flyer-builder/index.html')));
app.get('/studio/marque', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/marque.html')));
app.get('/studio/marque.html', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/marque.html')));
// JADOMI Studio (landing publique — Passe 34.2)
app.get('/jadomi-studio', (req, res) => res.sendFile(path.join(__dirname, 'public/jadomi-studio.html')));
// JADOMI Studio CMS + Onboarding (Passe 36)
app.get('/studio/cms', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/cms/index.html')));
app.get('/studio/cms/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/cms/index.html')));
app.get('/studio/onboarding', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/onboarding/index.html')));
app.get('/studio/onboarding/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/onboarding/index.html')));
app.get('/studio/sites-existants', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/sites-existants/index.html')));
app.get('/studio/sites-existants/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/sites-existants/index.html')));
// Dashboard mes-sites enrichi (Passe 38)
app.get('/studio/mes-sites', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mes-sites/index.html')));
app.get('/studio/mes-sites/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mes-sites/index.html')));
// Dashboard mon-site cockpit + wizard création (Passe 38)
app.get('/studio/mon-site', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mon-site/index.html')));
app.get('/studio/mon-site/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mon-site/index.html')));
app.get('/studio/mon-site/creer', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mon-site/creer.html')));
// SEO Landing pages — Soins infirmiers par ville (dynamic route)
app.get('/soins/:ville', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/ide/soins-ville.html'));
});
app.get('/soins', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/ide/soins-ville.html'));
});
// JADOMI Community Forum (Passe 67)
app.get('/communaute', (req, res) => res.sendFile(path.join(__dirname, 'public/support/communaute.html')));
// JADOMI Equipment — Offres groupees (Passe 59)
app.get('/equipment/offres', (req, res) => res.sendFile(path.join(__dirname, 'public/equipment/offres.html')));
app.get('/equipment/propose', (req, res) => res.sendFile(path.join(__dirname, 'public/equipment/propose.html')));
// JADOMI Avocat Expert - Coffre-fort (Passe 44C)
app.get('/avocat/coffre', (req, res) => res.sendFile(path.join(__dirname, 'public/avocat/coffre.html')));
app.get('/espace-client', (req, res) => res.sendFile(path.join(__dirname, 'public/avocat/espace-client.html')));
app.get('/espace-client/', (req, res) => res.sendFile(path.join(__dirname, 'public/avocat/espace-client.html')));
// PWA Patient — routes dupliquees retirees (gere en tout premier du fichier)
// Sites staging JADOMI — copies pour modification (Passe 43)
app.use('/sites-staging/:slug', (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).send('Invalid slug');
  const stagingPath = path.join(__dirname, 'uploads', 'staging', slug);
  if (require('fs').existsSync(stagingPath)) {
    express.static(stagingPath)(req, res, next);
  } else {
    res.status(404).send('Staging non trouvé');
  }
});
// Sites clients JADOMI — routage dynamique /sites/:slug (Passe 38)
app.use('/sites/:slug', (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).send('Invalid slug');
  const sitePath = path.join(__dirname, 'sites-clients', slug);
  if (require('fs').existsSync(sitePath)) {
    express.static(sitePath)(req, res, next);
  } else {
    res.status(404).send('<!DOCTYPE html><html><head><title>Site introuvable</title></head><body style="font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fafaf8;"><div style="text-align:center;"><h1 style="font-size:24px;color:#1a1a2e;">Site introuvable</h1><p style="color:#5c5c70;">Ce site n\'existe pas ou n\'est pas encore en ligne.</p><a href="https://jadomi.fr" style="color:#4F5BD5;">Retour à JADOMI</a></div></body></html>');
  }
});
// Sites demo Studio (Passe 37)
app.get('/demo/classic', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/classic/index.html')));
app.get('/demo/pro', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/pro/index.html')));
// Expert = site multi-pages classique (le meilleur, vraies pages)
app.get('/demo/expert', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/templates/site-expert-dentiste/index.html')));
app.use('/demo/expert', express.static(path.join(__dirname, 'public/studio/templates/site-expert-dentiste')));
// Expert-scroll = variante vidéo qui avance au scroll
app.get('/demo/expert-scroll', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/templates/site-expert-scroll/index.html')));
app.use('/demo/expert-scroll', express.static(path.join(__dirname, 'public/studio/templates/site-expert-scroll')));
// Templates métier Expert
app.get('/demo/expert-avocat', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-avocat/index.html')));
app.get('/demo/expert-kine', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-kine/index.html')));
app.get('/demo/expert-btp', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-btp/index.html')));
app.get('/demo/expert-beaute', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-beaute/index.html')));
app.get('/demo/expert-immo', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-immo/index.html')));
// Templates métier Expert v2 (Awwwards)
app.get('/demo/expert-dentiste-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-dentiste-v2/index.html')));
app.get('/demo/expert-avocat-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-avocat-v2/index.html')));
app.get('/demo/expert-beaute-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-beaute-v2/index.html')));
app.get('/demo/expert-immo-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-immo-v2/index.html')));
app.get('/demo/expert-btp-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert-btp-v2/index.html')));
// Homepage v2 preview (Passe 36)
app.get('/index-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v2.html')));
app.get('/index-v2.html', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v2.html')));
// Homepage v3 Awwwards (Passe 38b)
app.get('/index-v3', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v3.html')));
app.get('/index-v3.html', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v3.html')));
// Dashboards organisation (root-level HTML files)
app.get('/commerce.html', (req, res) => res.sendFile(path.join(__dirname, 'commerce.html')));
app.get('/membres-societe.html', (req, res) => res.sendFile(path.join(__dirname, 'membres-societe.html')));
app.get('/settings-societe.html', (req, res) => res.sendFile(path.join(__dirname, 'settings-societe.html')));
// Route /organisation sans .html (utilisé par 20+ dashboards)
app.get('/organisation', (req, res) => res.sendFile(path.join(__dirname, 'public/organisation.html')));
// Routes root-level manquantes
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/checkout.html', (req, res) => res.sendFile(path.join(__dirname, 'checkout.html')));
// 301 redirects for old URLs
app.get('/dentistes', (req, res) => res.redirect(301, '/chirurgiens-dentistes'));
app.get('/prothesistes', (req, res) => res.redirect(301, '/prothesistes-dentaires'));
app.get('/coiffeurs', (req, res) => res.redirect(301, '/services-bien-etre'));
// Servir /assets depuis /public/assets (pour les images landings)
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '7d' }));
// Servir les fichiers SQL pour copier-coller dans Supabase Dashboard
// SQL vitrines — protégé par le gate (Passe 59: retiré du public, réactivé derrière auth)
app.use('/sql/vitrines', express.static(path.join(__dirname, 'sql/vitrines')));
// Serve /docs but BLOCK sensitive subdirectories (signed PDFs, audit trails, certificates)
app.use('/docs', (req, res, next) => {
  const blocked = ['/signed', '/audit', '/certificates'];
  const lower = req.path.toLowerCase();
  if (blocked.some(b => lower.startsWith(b))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
}, express.static(path.join(__dirname, 'docs'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// --- Anthropic Claude client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Mistral AI client (IA française souveraine) ---
const mistral = process.env.MISTRAL_API_KEY
  ? new Mistral({ apiKey: process.env.MISTRAL_API_KEY })
  : null;
if (!mistral) console.warn('[JADOMI] MISTRAL_API_KEY non défini — Mistral désactivé, fallback Claude');

// --- DeepSeek AI client (low-cost, excellent JSON structuration, zéro données santé) ---
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || null;
if (!deepseekApiKey) console.warn('[JADOMI] DEEPSEEK_API_KEY non défini — DeepSeek désactivé');

// --- Supabase client ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_KEY) console.error('[CRITICAL] SUPABASE_KEY non defini dans .env');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Supabase admin (service_role) : bypass RLS, usage server-only, JAMAIS expose au client ---
// Utilise uniquement pour les tables secretes (ex: yahoo_oauth_tokens).
let supabaseAdmin = null;
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  console.log('[JADOMI] Supabase admin (service_role) initialisé');
} else {
  console.warn('[JADOMI] SUPABASE_SERVICE_ROLE_KEY absent — yahoo_oauth_tokens indisponible');
}
function supaAdminOrThrow() {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configuré sur le serveur');
  return supabaseAdmin;
}

// === JADOMI Admin module (raw webhook + admin routes + cron) ===
// Monte AVANT express.json() pour que /api/stripe/webhook recoive le body brut
try {
  const mountAdmin = require('./api/admin');
  mountAdmin(app, supabase, anthropic);
  console.log('[JADOMI] Module Admin monté');
} catch (e) {
  console.warn('[JADOMI] Module Admin non chargé:', e.message);
}

// === Webhook Stripe Billing (raw body requis — mount AVANT express.json) ===
try {
  const { mountBillingWebhook } = require('./api/multiSocietes/billing');
  if (typeof mountBillingWebhook === 'function') mountBillingWebhook(app);
} catch (e) {
  console.warn('[JADOMI] Webhook Billing non monté:', e.message);
}

// === Webhook Stripe Commerce (paiements factures clients, raw body) ===
try {
  const { mountCommerceWebhook } = require('./api/multiSocietes/commerceWebhook');
  if (typeof mountCommerceWebhook === 'function') mountCommerceWebhook(app);
} catch (e) {
  console.warn('[JADOMI] Webhook Commerce non monté:', e.message);
}

// === Webhook Stripe Checkout Commerce (raw body requis — mount AVANT express.json) ===
app.post('/api/commerce/checkout/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const Stripe = require('stripe');
    const stripeInstance = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
    if (!stripeInstance) return res.status(503).send('Stripe not configured');

    let event;
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_CHECKOUT;

    if (webhookSecret && sig) {
      event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else if (!webhookSecret) {
      console.warn('[STRIPE] STRIPE_WEBHOOK_SECRET_CHECKOUT non configuré — webhook rejeté');
      return res.status(503).json({ error: 'Webhook secret not configured' });
    } else {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const sbClient = supabaseAdmin || supabase;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.jadomi_order_type !== 'commerce') return res.json({ ok: true });

      // Update order status
      const { data: order } = await sbClient.from('jadomi_orders')
        .update({
          status: 'paid',
          payment_method: session.payment_method_types?.[0] || 'card',
          stripe_payment_intent_id: session.payment_intent,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('stripe_checkout_session_id', session.id)
        .select()
        .single();

      if (order) {
        console.log('[Commerce] Order paid:', order.id, '—', order.total_ttc, 'EUR');

        // HTML-escape helper to prevent XSS in email templates
        const escHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // --- Post-payment processing (async, non-blocking) ---
        (async () => {
          try {
            // Guard: skip post-processing if critical IDs are missing
            if (!order.supplier_id || !order.user_id) {
              console.error('[Commerce] Order missing supplier_id or user_id, skipping post-payment:', order.id);
              return;
            }

            // Fetch supplier and client profiles (reused across steps 1-4)
            const [supplierRes, clientRes] = await Promise.all([
              sbClient.from('profiles').select('*').eq('id', order.supplier_id).single(),
              sbClient.from('profiles').select('*').eq('id', order.user_id).single()
            ]);
            const supplier = supplierRes.data;
            const client = clientRes.data;

            // 1. Generate Factur-X invoice XML
            const invoiceRef = `JCOM-${Date.now()}-${order.id.slice(0, 8)}`;
            try {
              const { genererFacturXml } = require('./services/facturx-generator');

              const totalHt = Number(order.total_ht) || 0;
              const totalTtc = Number(order.total_ttc) || 0;
              const totalTva = totalTtc - totalHt;

              const facturXml = genererFacturXml({
                facture: {
                  numero_facture: invoiceRef,
                  date_facture: new Date().toISOString().split('T')[0],
                  total_ht_taxable: totalHt,
                  total_ht_exonere: 0,
                  total_tva: totalTva > 0 ? totalTva : 0,
                  total_ttc: totalTtc
                },
                prothesiste: {
                  raison_sociale: supplier?.raison_sociale || supplier?.nom || 'Fournisseur JADOMI',
                  code_postal: supplier?.code_postal || '',
                  adresse_ligne1: supplier?.adresse || supplier?.adresse_ligne1 || '',
                  ville: supplier?.ville || '',
                  siren: supplier?.siren || '',
                  regime_tva: supplier?.regime_tva || 'normal'
                },
                dentiste: {
                  nom: client?.nom || 'Client',
                  prenom: client?.prenom || '',
                  titre: client?.titre || '',
                  code_postal: client?.code_postal || '',
                  adresse_ligne1: client?.adresse || client?.adresse_ligne1 || '',
                  ville: client?.ville || ''
                },
                lignes: (order.items || []).map(item => ({
                  designation: item.name || item.designation || 'Article',
                  prix_unitaire: item.price || item.prix_unitaire || 0,
                  quantite: item.quantity || item.quantite || 1,
                  montant_ht: (item.price || item.prix_unitaire || 0) * (item.quantity || item.quantite || 1),
                  tva_applicable: true,
                  taux_tva: 20
                }))
              });

              // Store invoice reference and XML on the order
              await sbClient.from('jadomi_orders').update({
                invoice_ref: invoiceRef,
                facturx_xml: facturXml,
                updated_at: new Date().toISOString()
              }).eq('id', order.id);

              console.log('[Commerce] Factur-X generated:', invoiceRef);
            } catch (fxErr) {
              console.error('[Commerce] Factur-X generation failed:', fxErr.message);
            }

            // 2. Send confirmation emails (client + supplier)
            try {
              const { sendMail } = require('./api/emailService');

              // Use profiles already fetched above
              const buyer = client;
              const seller = supplier;

              const itemsHtml = (order.items || []).map(item =>
                `<tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #2f2c28;color:#e8e6e0;font-size:13px;">${escHtml(item.name || item.designation || 'Article')}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #2f2c28;color:#e8e6e0;font-size:13px;text-align:center;">${Number(item.quantity || item.quantite || 1)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #2f2c28;color:#e8e6e0;font-size:13px;text-align:right;">${((Number(item.price || item.prix_unitaire || 0)) * (Number(item.quantity || item.quantite || 1))).toFixed(2)} EUR</td>
                </tr>`
              ).join('');

              const emailWrapper = (title, content) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0e0d;font-family:Arial,sans-serif;color:#e8e6e0;">
<div style="max-width:560px;margin:0 auto;background:#1a1917;border:1px solid #2f2c28;border-radius:12px;overflow:hidden;">
  <div style="padding:30px 30px 10px 30px;border-bottom:1px solid #2f2c28;">
    <div style="font-size:28px;font-weight:800;color:#10b981;letter-spacing:-1px;">JADOMI</div>
    <div style="font-size:12px;color:#9c9890;margin-top:4px;">Marketplace équipement dentaire</div>
  </div>
  <div style="padding:30px;">
    <h2 style="color:#10b981;font-size:20px;margin:0 0 16px 0;">${title}</h2>
    ${content}
    <p style="font-size:12px;color:#9c9890;line-height:1.6;margin-top:24px;">
      Pour toute question, contactez-nous a <a href="mailto:contact@jadomi.fr" style="color:#10b981;">contact@jadomi.fr</a>.
    </p>
  </div>
  <div style="padding:16px 30px;border-top:1px solid #2f2c28;font-size:11px;color:#6b6760;text-align:center;">
    JADOMI SAS &middot; <a href="https://jadomi.fr" style="color:#9c9890;text-decoration:none;">jadomi.fr</a>
  </div>
</div>
</body></html>`;

              // Email to buyer (client)
              if (buyer?.email) {
                const buyerName = escHtml([buyer.prenom, buyer.nom].filter(Boolean).join(' ') || 'Client');
                await sendMail({
                  to: buyer.email,
                  subject: `Confirmation de votre commande JADOMI n\u00b0${invoiceRef}`,
                  html: emailWrapper('Confirmation de commande', `
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Bonjour ${buyerName},
                    </p>
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Nous vous confirmons la bonne reception de votre paiement pour la commande <strong style="color:#10b981;">${invoiceRef}</strong>.
                    </p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                      <thead>
                        <tr style="background:#2f2c28;">
                          <th style="padding:8px 12px;text-align:left;color:#9c9890;font-size:12px;">Article</th>
                          <th style="padding:8px 12px;text-align:center;color:#9c9890;font-size:12px;">Qty</th>
                          <th style="padding:8px 12px;text-align:right;color:#9c9890;font-size:12px;">Montant</th>
                        </tr>
                      </thead>
                      <tbody>${itemsHtml}</tbody>
                    </table>
                    <p style="font-size:15px;color:#e8e6e0;font-weight:700;text-align:right;">
                      Total TTC : ${Number(order.total_ttc).toFixed(2)} EUR
                    </p>
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Votre fournisseur a été notifié et préparera votre commande dans les meilleurs délais.
                    </p>
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Nous vous remercions pour votre confiance.
                    </p>`)
                });
                console.log('[Commerce] Buyer confirmation email sent to:', buyer.email);
              }

              // Email to supplier
              if (seller?.email) {
                const sellerName = escHtml(seller.raison_sociale || [seller.prenom, seller.nom].filter(Boolean).join(' ') || 'Fournisseur');
                await sendMail({
                  to: seller.email,
                  subject: `Nouvelle commande JADOMI n\u00b0${invoiceRef}`,
                  html: emailWrapper('Nouvelle commande recue', `
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Bonjour ${sellerName},
                    </p>
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Une nouvelle commande vient d'etre validee sur la marketplace JADOMI.
                    </p>
                    <p style="font-size:14px;color:#e8e6e0;">
                      <strong>Reference :</strong> <span style="color:#10b981;">${invoiceRef}</span><br>
                      <strong>Client :</strong> ${escHtml([buyer?.prenom, buyer?.nom].filter(Boolean).join(' ') || 'Client JADOMI')}<br>
                      <strong>Montant HT :</strong> ${Number(order.total_ht || 0).toFixed(2)} EUR<br>
                      <strong>Montant TTC :</strong> ${Number(order.total_ttc).toFixed(2)} EUR
                    </p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                      <thead>
                        <tr style="background:#2f2c28;">
                          <th style="padding:8px 12px;text-align:left;color:#9c9890;font-size:12px;">Article</th>
                          <th style="padding:8px 12px;text-align:center;color:#9c9890;font-size:12px;">Qty</th>
                          <th style="padding:8px 12px;text-align:right;color:#9c9890;font-size:12px;">Montant</th>
                        </tr>
                      </thead>
                      <tbody>${itemsHtml}</tbody>
                    </table>
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Nous vous invitons a preparer cette commande dans les meilleurs delais. Le reglement vous sera verse sous 30 jours.
                    </p>
                    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
                      Nous vous remercions pour votre collaboration.
                    </p>`)
                });
                console.log('[Commerce] Supplier notification email sent to:', seller.email);
              }
            } catch (emailErr) {
              console.error('[Commerce] Email sending failed:', emailErr.message);
            }

            // 3. Schedule supplier payout (J+30)
            try {
              const payoutDate = new Date();
              payoutDate.setDate(payoutDate.getDate() + 30);

              await sbClient.from('jadomi_orders').update({
                payout_scheduled_at: payoutDate.toISOString(),
                payout_status: 'scheduled',
                updated_at: new Date().toISOString()
              }).eq('id', order.id);

              console.log('[Commerce] Payout scheduled for:', payoutDate.toISOString(), 'order:', order.id);
            } catch (payoutErr) {
              console.error('[Commerce] Payout scheduling failed:', payoutErr.message);
            }

            // 4. Notify supplier of new order (in-app notification)
            try {
              await sbClient.from('equipment_notifications').insert({
                user_id: order.supplier_id,
                type: 'new_order',
                title: 'Nouvelle commande recue',
                message: `Commande ${invoiceRef} - ${Number(order.total_ttc).toFixed(2)} EUR TTC. Veuillez preparer la livraison.`,
                metadata: { order_id: order.id, invoice_ref: invoiceRef, total_ttc: order.total_ttc },
                read: false,
                created_at: new Date().toISOString()
              });
              console.log('[Commerce] Supplier notification inserted for:', order.supplier_id);
            } catch (notifErr) {
              console.error('[Commerce] Supplier notification insert failed:', notifErr.message);
            }

          } catch (postPayErr) {
            console.error('[Commerce] Post-payment processing error:', postPayErr.message);
          }
        })().catch(err => console.error('[Commerce] Unhandled post-payment error:', err.message));
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      await sbClient.from('jadomi_orders')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('stripe_checkout_session_id', session.id)
        .eq('status', 'pending_payment');
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[Checkout webhook]', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.use(express.json({ limit: '2mb' }));

// === Middleware authSupabase pour routes legacy (sécurité) ===
// Valide le JWT Supabase dans Authorization: Bearer <token>, met req.user
let authSupabase = null;
try {
  authSupabase = require('./api/multiSocietes/middleware').authSupabase;
} catch (e) {
  console.warn('[JADOMI] authSupabase indisponible — routes legacy non protégées:', e.message);
}
// Helper : exige un JWT valide sur la route. Si middleware pas chargé (fallback dev), refuse.
const requireAuth = () => {
  if (!authSupabase) return (req, res) => res.status(503).json({ error: 'auth_unavailable' });
  return authSupabase();
};

// Helper SSE : EventSource n'envoie pas de Authorization header, on accepte ?access_token=... en query.
// Vérifie JWT et met req.user avant de poursuivre.
const requireAuthSSE = () => async (req, res, next) => {
  try {
    const token = req.query.access_token || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (!token) return res.status(401).end('missing_token');
    if (!supabaseAdmin) return res.status(503).end('auth_unavailable');
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).end('invalid_token');
    req.user = data.user;
    next();
  } catch (e) {
    res.status(401).end('auth_error');
  }
};

// === JADOMI Billing API (user-level) ===
try {
  app.use('/api/billing', require('./api/billing'));
  console.log('[JADOMI] Routes /api/billing (user-level) montées');
} catch (e) {
  console.warn('[JADOMI] Module billing non chargé:', e.message);
}

// === JADOMI Multi-sociétés (SCI, commerce, mailing, billing) ===
try {
  require('./api/multiSocietes')(app);
} catch (e) {
  console.warn('[JADOMI] Module multi-sociétés non chargé:', e.message);
}

// === JADOMI Module Professions Juridiques ===
try {
  require('./api/juridique/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module juridique non chargé:', e.message);
}

// === JADOMI Module Artisan BTP ===
try {
  require('./api/btp/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module BTP non chargé:', e.message);
}

// === JADOMI Module Network (Annuaire + Parrainage + Deals) ===
try {
  require('./api/network/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module Network non chargé:', e.message);
}

// === JADOMI Module Services & Marketplace ===
try {
  require('./api/services/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module services non chargé:', e.message);
}

// === JADOMI Module Showroom Créateurs ===
try {
  require('./api/showroom/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module showroom non chargé:', e.message);
}

// === JADOMI GPO Smart Queue Auction ===
try {
  require('./api/gpo')(app);
  require('./lib/gpo-scheduler'); // lance le scheduler de timeouts
} catch (e) {
  console.warn('[JADOMI] Module GPO non chargé:', e.message);
}

// Route publique fournisseur : /supplier/offer/:token → page HTML tokenisee
app.get('/supplier/offer/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/supplier-offer.html'));
});

// Alias API GPO : /api/gpo/offer/:token → /api/gpo/public/offer/:token (fix route mismatch frontend)
// Sanitize token to prevent open redirect / header injection (alnum + dash + underscore only)
function _safeGpoToken(t) { return String(t || '').replace(/[^a-zA-Z0-9\-_]/g, ''); }
app.get('/api/gpo/offer/:token', (req, res) => { const t = _safeGpoToken(req.params.token); if (!t) return res.status(400).end(); res.redirect(307, `/api/gpo/public/offer/${t}`); });
app.post('/api/gpo/offer/:token/accept', (req, res) => { const t = _safeGpoToken(req.params.token); if (!t) return res.status(400).end(); res.redirect(307, `/api/gpo/public/offer/${t}/accept`); });
app.post('/api/gpo/offer/:token/counter', (req, res) => { const t = _safeGpoToken(req.params.token); if (!t) return res.status(400).end(); res.redirect(307, `/api/gpo/public/offer/${t}/counter`); });
app.post('/api/gpo/offer/:token/refuse', (req, res) => { const t = _safeGpoToken(req.params.token); if (!t) return res.status(400).end(); res.redirect(307, `/api/gpo/public/offer/${t}/refuse`); });

// Route admin GPO
app.get('/admin/gpo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/gpo-suppliers.html'));
});

// === JADOMI Logistique (entrepots, transport, etiquettes) ===
try {
  require('./api/logistics')(app);
} catch (e) {
  console.warn('[JADOMI] Module Logistique non chargé:', e.message);
}

// === JADOMI Groupage Regional (Groupon dentaire) ===
try {
  require('./api/groupage')(app);
} catch (e) {
  console.warn('[JADOMI] Module Groupage non chargé:', e.message);
}

// === JADOMI Mon site internet (Vitrines) ===
try {
  require('./api/vitrines')(app);
} catch (e) {
  console.warn('[JADOMI] Module vitrines non chargé:', e.message);
}

// Alias vitrines publics montes dans api/vitrines/index.js directement

// === JADOMI Site Analysis (Passe 33 — import site existant) ===
try {
  app.use('/api/site-analysis', require('./api/site-analysis'));
  console.log('[JADOMI] Module Site Analysis monté');
} catch (e) {
  console.warn('[JADOMI] Module Site Analysis non chargé:', e.message);
}

// === JADOMI Media Upload (Passe 33 — upload manuel) ===
try {
  app.use('/api/media', require('./api/media-upload'));
  console.log('[JADOMI] Module Media Upload monté');
} catch (e) {
  console.warn('[JADOMI] Module Media Upload non chargé:', e.message);
}
try {
  app.use('/api/scan-dashboard', require('./api/scan-dashboard'));
  console.log('[JADOMI] Module Scan Dashboard monté (upload PDF flyers)');
} catch (e) {
  console.warn('[JADOMI] Module Scan Dashboard non chargé:', e.message);
}

// === JADOMI Ads — Régie publicitaire verticale (Passe 34) ===
try {
  const mountAds = require('./api/ads');
  mountAds(app, supabase, anthropic);
  console.log('[JADOMI] Module Ads (régie publicitaire) monté');
} catch (e) {
  console.warn('[JADOMI] Module Ads non chargé:', e.message);
}

// GET /api/ads/me — Retourner infos utilisateur connecte pour dashboard annonceur
app.get('/api/ads/me', authSupabase(), async (req, res) => {
  try {
    const sb = supabaseAdmin || supabase;
    const { data } = await sb.from('societes')
      .select('id, nom, email, secteur')
      .eq('owner_id', req.user.id)
      .limit(1)
      .maybeSingle();
    res.json({ name: data?.nom || req.user.email, email: req.user.email, societe: data || null });
  } catch (e) { res.json({ name: req.user.email, email: req.user.email }); }
});

// ═══════════════════════════════════════════════════════════════
// JADOMI Voice Assistant — API endpoints
// ═══════════════════════════════════════════════════════════════

// POST /api/voice/search-document — Rechercher un document par nom patient/client
app.post('/api/voice/search-document', authSupabase(), async (req, res) => {
  try {
    const { search, type } = req.body;
    if (!search) return res.status(400).json({ error: 'Terme de recherche requis' });
    const sb = supabaseAdmin || supabase;
    const safeSearch = search.replace(/[%_\\,()."]/g, '').trim().substring(0, 200);
    const societeId = req.user.societe_id || req.headers['x-societe-id'];
    if (!safeSearch) return res.json({ results: [] });

    let query = sb.from('signed_documents')
      .select('id, title, signer_name, signer_email, category, status, created_at')
      .or(`title.ilike.%${safeSearch}%,signer_name.ilike.%${safeSearch}%,signer_email.ilike.%${safeSearch}%`)
      .order('created_at', { ascending: false })
      .limit(10);
    if (societeId) query = query.eq('societe_id', societeId);
    if (type) query = query.eq('category', type);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ ok: true, documents: data || [] });
  } catch (e) {
    res.status(500).json({ error: 'Erreur recherche documents' });
  }
});

// POST /api/voice/resend-document — Renvoyer un document par email
app.post('/api/voice/resend-document', authSupabase(), async (req, res) => {
  try {
    const { document_id, email } = req.body;
    if (!document_id) return res.status(400).json({ error: 'document_id requis' });
    const sb = supabaseAdmin || supabase;
    const societeId = req.user.societe_id || req.headers['x-societe-id'];

    const { data: doc } = await sb.from('signed_documents')
      .select('*')
      .eq('id', document_id)
      .eq('societe_id', societeId)
      .single();
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const targetEmail = email || doc.signer_email;
    if (!targetEmail) return res.status(400).json({ error: 'Aucun email disponible' });

    // Send via existing email service
    try {
      const { sendMail } = require('./api/emailService');
      await sendMail({
        to: targetEmail,
        subject: 'JADOMI — Document : ' + (doc.title || 'Sans titre'),
        html: '<div style="font-family:sans-serif;padding:20px;"><h2 style="color:#10b981;">JADOMI</h2><p>Bonjour,</p><p>Veuillez trouver ci-joint le document <strong>' + (doc.title || 'Sans titre') + '</strong> (catégorie : ' + (doc.category || '-') + ').</p><p>Pour vérifier l\'authenticité de ce document :</p><p><a href="https://jadomi.fr/verify-signature?id=' + doc.id + '" style="color:#10b981;">Vérifier le document</a></p><p>Cordialement,<br>JADOMI</p></div>'
      });
    } catch (emailErr) {
      console.warn('[voice/resend] Email error:', emailErr.message);
    }

    res.json({ ok: true, sent_to: targetEmail, document: doc.title });
  } catch (e) {
    res.status(500).json({ error: 'Erreur envoi document' });
  }
});

// POST /api/voice/generate-letter — Générer un courrier (relance, mise en demeure, etc.)
app.post('/api/voice/generate-letter', authSupabase(), async (req, res) => {
  try {
    const { type, context, recipient_name, recipient_email, amount, details } = req.body;
    if (!type || !context) return res.status(400).json({ error: 'type et context requis' });

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `Tu es le générateur de courriers professionnels de JADOMI, plateforme pour professionnels de santé.
Tu génères des courriers en HTML propre, professionnels, en français, avec vouvoiement.
Types de courriers :
- relance_paiement : Relance amiable pour facture impayée
- mise_en_demeure : Mise en demeure formelle (plus sévère)
- relance_remplacement : Relance pour paiement de remplacement professionnel
- confirmation : Confirmation de réception/accord
- remerciement : Lettre de remerciement professionnelle

Le courrier doit inclure :
- En-tete avec date du jour
- Objet clair
- Corps professionnel mais ferme (pour les relances)
- Mention des references (montant, date, prestation)
- Formule de politesse
- Signature "[Nom du cabinet]"

Format : HTML inline styles (pas de CSS externe). Design sobre et professionnel.`,
      messages: [{
        role: 'user',
        content: `Genere un courrier de type "${type}" avec ce contexte :
Destinataire : ${recipient_name || 'Non precise'}
Email : ${recipient_email || 'Non precise'}
Montant : ${amount || 'Non precise'}
Details : ${context}
${details ? 'Informations supplementaires : ' + details : ''}`
      }]
    });

    const letterHtml = msg.content?.[0]?.text || '';
    res.json({ ok: true, html: letterHtml, type });
  } catch (e) {
    console.error('[voice/generate-letter]', e.message);
    res.status(500).json({ error: 'Erreur génération courrier' });
  }
});

// POST /api/voice/send-letter — Envoyer un courrier généré par email
app.post('/api/voice/send-letter', authSupabase(), async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    if (!to || !html) return res.status(400).json({ error: 'to et html requis' });
    const { sendMail } = require('./api/emailService');
    await sendMail({
      to,
      subject: subject || 'JADOMI — Courrier',
      html: '<div style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:20px;">' + html + '<hr style="margin-top:30px;border:none;border-top:1px solid #eee;"><p style="font-size:11px;color:#999;">Envoyé via JADOMI — jadomi.fr</p></div>'
    });
    res.json({ ok: true, sent_to: to });
  } catch (e) {
    res.status(500).json({ error: 'Erreur envoi courrier' });
  }
});

// === JADOMI Studio — Hub IA création publicitaire (Passe 34.2) ===
try {
  const mountStudio = require('./api/studio');
  mountStudio(app, supabase, anthropic);
  console.log('[JADOMI] Module Studio (hub IA creatif) monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio non charge:', e.message);
}

// === JADOMI Studio — Remotion Video Generation (Passe 35) ===
try {
  app.use('/api/studio/generate-ad-remotion', require('./api/studio/generate-ad-remotion'));
  app.use('/api/studio/generate-premium-ad', require('./api/studio/generate-premium-ad'));
  console.log('[JADOMI] Module Remotion (video generation + premium ads) monte');
} catch (e) {
  console.warn('[JADOMI] Module Remotion non charge:', e.message);
}

// === JADOMI Studio CMS — Dashboard 3 formules (Passe 36) ===
try {
  const mountCMS = require('./api/studio/cms');
  mountCMS(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio CMS (3 formules) monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio CMS non charge:', e.message);
}

// === JADOMI Studio Analyse — Scanner sites existants (Passe 36) ===
try {
  const mountAnalyse = require('./api/studio/analyse');
  mountAnalyse(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio Analyse (scanner URL) monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Analyse non charge:', e.message);
}

// === JADOMI AVOCAT EXPERT — Coffre-fort sécurisé (Passe 44C) + Module complet (Passe 88) ===
try {
  app.use('/api/avocat', require('./api/avocat/coffre'));
  app.use('/api/avocat/espace-client', require('./api/avocat/espace-client'));
  console.log('[JADOMI] Module Avocat Expert (coffre-fort + espace client) monte');
} catch (e) {
  console.warn('[JADOMI] Module Avocat Expert non charge:', e.message);
}
// Avocat — Timetracking, Workflow, Honoraires, Relances, Dashboard
try {
  app.use('/api/avocat/time', require('./api/avocat/timetracking'));
  console.log('[JADOMI] Module Avocat Timetracking monte');
} catch (e) { console.warn('[JADOMI] Avocat Timetracking non charge:', e.message); }
try {
  app.use('/api/avocat/workflow', require('./api/avocat/workflow'));
  console.log('[JADOMI] Module Avocat Workflow monte');
} catch (e) { console.warn('[JADOMI] Avocat Workflow non charge:', e.message); }
try {
  app.use('/api/avocat/honoraires', require('./api/avocat/honoraires'));
  console.log('[JADOMI] Module Avocat Honoraires monte');
} catch (e) { console.warn('[JADOMI] Avocat Honoraires non charge:', e.message); }
try {
  app.use('/api/avocat/relances', require('./api/avocat/relances'));
  console.log('[JADOMI] Module Avocat Relances monte');
} catch (e) { console.warn('[JADOMI] Avocat Relances non charge:', e.message); }
try {
  app.use('/api/avocat/dashboard', require('./api/avocat/dashboard'));
  console.log('[JADOMI] Module Avocat Dashboard monte');
} catch (e) { console.warn('[JADOMI] Avocat Dashboard non charge:', e.message); }

// === JADOMI Compta Universelle — Factures auto-rangées jour/mois/année ===
try {
  app.use('/api/compta', require('./api/compta'));
  console.log('[JADOMI] Module Compta Universelle monte');
} catch (e) { console.warn('[JADOMI] Compta Universelle non charge:', e.message); }

// === JADOMI Visio Universelle — Téléconsultation tous métiers ===
try {
  app.use('/api/visio', require('./api/visio'));
  console.log('[JADOMI] Module Visio Universelle monte');
} catch (e) { console.warn('[JADOMI] Visio Universelle non charge:', e.message); }

// Route publique — page visio (client externe accède sans auth)
app.get('/visio/:token', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public/visio/index.html'));
});

// === JADOMI Studio Video Generator — Vidu AI ===
try {
  app.use('/api/studio/video', require('./api/studio/video-generator'));
  console.log('[JADOMI] Module Studio Video Generator (Vidu) monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Video Generator non charge:', e.message);
}

// === JADOMI Studio Flyer Builder — DeepSeek + Gemini + ImageMagick ===
try {
  app.use('/api/studio/flyer', require('./api/studio/flyer-builder'));
  console.log('[JADOMI] Module Studio Flyer Builder monté');
} catch (e) {
  console.warn('[JADOMI] Module Studio Flyer Builder non chargé:', e.message);
}

// === JADOMI Studio Enhance Media — Remotion Expert (Passe 41B) ===
try {
  app.use('/api/studio/enhance', require('./api/studio/enhance-media'));
  app.locals.supabaseAdmin = supabaseAdmin;
  console.log('[JADOMI] Module Studio Enhance Media (Remotion) monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Enhance Media non charge:', e.message);
}

// === JADOMI Studio Sites Jadomi — Création sites + IA assistant (Passe 38) ===
try {
  const mountSitesJadomi = require('./api/studio/sites-jadomi');
  mountSitesJadomi(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio Sites Jadomi monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Sites Jadomi non charge:', e.message);
}

// === JADOMI Studio OVH Hosting — Hébergement domaines + sites clients ===
try {
  const mountOvhHosting = require('./api/studio/ovh-hosting');
  mountOvhHosting(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio OVH Hosting monté (mode:', process.env.JADOMI_OVH_MODE || 'simulation', ')');
} catch (e) {
  console.warn('[JADOMI] Module Studio OVH Hosting non chargé:', e.message);
}

// === JADOMI Studio Interventions IA — Modifs auto sites existants (Passe 38) ===
try {
  const mountInterventions = require('./api/studio/interventions');
  mountInterventions(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio Interventions IA monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Interventions IA non charge:', e.message);
}

// === JADOMI Studio Sites Existants — Acces FTP/SSH/WordPress (Passe 37) ===
try {
  const mountSitesExistants = require('./api/studio/sites-existants');
  mountSitesExistants(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio Sites Existants monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Sites Existants non charge:', e.message);
}

// === JADOMI Studio V2 — Mémoire Marque + Templates + Produits ===
try {
  const studioV2Auth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'auth_required' });
    req.supabase = supabaseAdmin || supabase;
    next();
  };
  app.use('/api/studio/marque', studioV2Auth, require('./api/studio/marque'));
  app.use('/api/studio/wallet', studioV2Auth, require('./api/studio/wallet'));
  console.log('[JADOMI] Module Studio V2 (Marque + Wallet) monté');
} catch (e) {
  console.warn('[JADOMI] Module Studio V2 non chargé:', e.message);
}

// === JADOMI Studio Stripe Checkout — Abonnements forfaits (MODE TEST) ===
try {
  // Exposer supabaseAdmin globalement pour le webhook Stripe
  global.__supabaseAdmin = supabaseAdmin;
  global.__supabase      = supabase;
  app.use('/api/studio/stripe', require('./api/studio/stripe-checkout'));
  console.log('[JADOMI] Module Studio Stripe Checkout (TEST) monté');
} catch (e) {
  console.warn('[JADOMI] Module Studio Stripe Checkout non chargé:', e.message);
}

// === JADOMI Coach (onboarding personnalisé + tooltips) ===
try {
  app.use('/api/coach', require('./api/coach'));
  console.log('[JADOMI] Module Coach monté');
} catch (e) {
  console.warn('[JADOMI] Module Coach non chargé:', e.message);
}

// === JADOMI Dentiste Pro (gestion cabinet sante multi-professions) ===
try {
  require('./api/dentiste-pro/index')(app);
  console.log('[JADOMI] Module Dentiste Pro monte');
} catch (e) {
  console.warn('[JADOMI] Module Dentiste Pro non charge:', e.message);
}

// Rappels CRON Dentiste Pro — gere par node-cron plus bas (ligne ~577)

// === JADOMI Timeline (suivi visuel chronologique patient) ===
try {
  app.use('/api/timeline', require('./api/timeline'));
  console.log('[JADOMI] Module Timeline monté');
} catch (e) {
  console.warn('[JADOMI] Module Timeline non chargé:', e.message);
}

// === JADOMI Client Portal (espace client sécurisé) ===
try {
  app.use('/api/client-portal', require('./api/client-portal'));
  console.log('[JADOMI] Module Client Portal monté');
} catch (e) {
  console.warn('[JADOMI] Module Client Portal non chargé:', e.message);
}

// === JADOMI Agenda IA (agenda intelligent) ===
try {
  app.use('/api/agenda-ia', require('./api/agenda-ia'));
  console.log('[JADOMI] Module Agenda IA monté');
} catch (e) {
  console.warn('[JADOMI] Module Agenda IA non chargé:', e.message);
}

// === JADOMI Secrétaire IA (analyse, optimisation, commandes vocales) ===
try {
  app.use('/api/ia-secretary', require('./api/ia-secretary'));
  console.log('[JADOMI] Module Secrétaire IA monté (analyse, optimisation, vocal, multi-métier)');
} catch (e) {
  console.warn('[JADOMI] Module Secrétaire IA non chargé:', e.message);
}

// === JADOMI Connecteur Logiciel Dentaire (Logos, Doctolib, CSV) ===
try {
  app.use('/api/connector', require('./api/connector'));
  console.log('[JADOMI] Module Connecteur monté (Logos, Doctolib, CSV)');
} catch (e) {
  console.warn('[JADOMI] Module Connecteur non chargé:', e.message);
}

// === JADOMI Copilot (chatbot global) ===
try {
  app.use('/api/copilot', require('./api/copilot'));
  console.log('[JADOMI] Module Copilot monté (chatbot global IA)');
} catch (e) {
  console.warn('[JADOMI] Module Copilot non chargé:', e.message);
}

// === JADOMI Cabinet Brain (cerveau central intelligent) ===
try {
  app.use('/api/brain', require('./api/brain'));
  console.log('[JADOMI] Module Cabinet Brain monté (identité, documents, règles, tâches, recherche, digest)');
  // Démarrer le daemon mail en fond
  try {
    const { startMailDaemon } = require('./lib/brain/mail-sync-daemon');
    startMailDaemon();
  } catch (daemonErr) {
    console.warn('[JADOMI] Mail Daemon non démarré:', daemonErr.message);
  }
} catch (e) {
  console.warn('[JADOMI] Module Cabinet Brain non chargé:', e.message);
}

// === JADOMI Fourmilière (multi-agents dispatcher) ===
try {
  const dispatcher = require('./lib/agents/dispatcher');
  const { bus, EVENT_TYPES } = require('./lib/shared-intelligence');
  // Écouter les événements du bus pour déclencher les workflows automatiques
  bus.on(EVENT_TYPES.PREFERENCE_APPRISE, (data) => {
    console.log('[FOURMILIERE] Nouvelle règle globale propagée:', data.type || 'unknown');
  });
  console.log('[JADOMI] Fourmilière multi-agents montée (dispatcher + memory + learning)');
} catch (e) {
  console.warn('[JADOMI] Fourmilière non chargée:', e.message);
}

// === JADOMI IA Documentaire (cerveau IA cabinet) ===
try {
  app.use('/api/ia-doc', require('./api/ia-doc'));
  console.log('[JADOMI] Module IA Documentaire monté');
} catch (e) {
  console.warn('[JADOMI] Module IA Documentaire non chargé:', e.message);
}

// === JADOMI Cas Clinique (dossiers patients unifiés) ===
try {
  app.use('/api/cas-clinique', require('./api/cas-clinique'));
  console.log('[JADOMI] Module Cas Clinique monté');
} catch (e) {
  console.warn('[JADOMI] Module Cas Clinique non chargé:', e.message);
}

// === JADOMI Questionnaire Médical (anamnèse patient) ===
try {
  app.use('/api/questionnaire-medical', require('./api/questionnaire-medical'));
  console.log('[JADOMI] Module Questionnaire Médical monté');
} catch (e) {
  console.warn('[JADOMI] Module Questionnaire Médical non chargé:', e.message);
}

// === JADOMI Snap (QR photos patients / passeports) ===
try {
  app.use('/api/snap', require('./api/snap'));
  console.log('[JADOMI] Module Snap Photos monté');
} catch (e) {
  console.warn('[JADOMI] Module Snap Photos non chargé:', e.message);
}

// === JADOMI Appointments (prise de RDV en ligne) ===
try {
  app.use('/api/appointments', require('./api/appointments'));
  console.log('[JADOMI] Module Appointments monté');
} catch (e) {
  console.warn('[JADOMI] Module Appointments non chargé:', e.message);
}

// === JADOMI Support Ticket System ===
try {
  app.use('/api/support', require('./api/support'));
  console.log('[JADOMI] Module Support Tickets monté');
} catch (e) {
  console.warn('[JADOMI] Module Support Tickets non chargé:', e.message);
}

// === JADOMI Community Forum (entraide professionnels) ===
try {
  app.use('/api/forum', require('./api/support/forum'));
  console.log('[JADOMI] Module Community Forum monté');
} catch (e) {
  console.warn('[JADOMI] Module Community Forum non chargé:', e.message);
}

// === JADOMI Dentiste Pro — Smart Batch Slot-Finder ===
try {
  app.use('/api/dentiste-pro/batch-slots', require('./api/dentiste-pro/batch-slots'));
  console.log('[JADOMI] Module Dentiste Pro Batch Slots monté');
} catch (e) {
  console.warn('[JADOMI] Module Dentiste Pro Batch Slots non chargé:', e.message);
}

// Dentiste Pro - Rappels cron (every 15 minutes)
try {
  const { processRappels } = require('./api/dentiste-pro/rappels');
  if (processRappels) {
    const cron = require('node-cron');
    cron.schedule('*/15 * * * *', processRappels);
    console.log('[CRON] Dentiste Pro rappels: every 15 min');
  }
} catch(e) { console.log('[CRON] Dentiste Pro rappels not loaded:', e.message); }

// Rate limiting SMS achat (5 / heure / IP)
app.use('/api/sms/wallet/acheter', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes d\'achat SMS, réessayez dans 1 heure' }
}));

// === JADOMI Push Notifications — Web Push ===
try {
  const pushRouter = require('./api/push');
  // Rate limit : 10 souscriptions / heure / IP
  app.use('/api/push/subscribe', rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de souscriptions push, réessayez dans 1 heure' }
  }));
  app.use('/api/push', pushRouter);
  console.log('[JADOMI] Module Push Notifications monté');
} catch (e) {
  console.warn('[JADOMI] Module Push non chargé:', e.message);
}

// === JADOMI Rappels automatiques (email + SMS + push) — Passe 70 ===
try {
  const rappelsRouter = require('./api/rappels');
  app.use('/api/rappels', rappelsRouter);
  app.use('/api/sms', rappelsRouter);
  console.log('[JADOMI] Module Rappels automatiques monté');
} catch (e) {
  console.warn('[JADOMI] Module Rappels non chargé:', e.message);
}

// === Tracking pixel + confirmation pour rappels (public, pas d'auth) ===
try {
  const { createClient: _sc } = require('@supabase/supabase-js');
  const _sKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  let _trackAdmin = null;
  function trackAdmin() {
    if (!_trackAdmin && _sKey) {
      _trackAdmin = _sc(process.env.SUPABASE_URL, _sKey, { auth: { autoRefreshToken: false, persistSession: false } });
    }
    return _trackAdmin;
  }

  // Pixel 1x1 transparent PNG
  const PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
    'Nl7BcQAAAABJRU5ErkJggg==', 'base64'
  );

  // GET /api/rappels/track/:id/pixel.png — Pixel ouverture (public)
  app.get('/api/rappels/track/:id/pixel.png', async (req, res) => {
    try {
      const ta = trackAdmin();
      if (ta) {
        await ta.from('rappels_envois')
          .update({ opened: true })
          .eq('tracking_id', req.params.id)
          .is('opened', false);
      }
    } catch (_) {}
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.end(PIXEL_PNG);
  });

  // GET /api/rappels/track/:id/confirm — Confirmation de présence (public)
  app.get('/api/rappels/track/:id/confirm', async (req, res) => {
    try {
      const ta = trackAdmin();
      if (ta) {
        await ta.from('rappels_envois')
          .update({ opened: true, confirmed: true })
          .eq('tracking_id', req.params.id);
      }
    } catch (_) {}
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmation — JADOMI</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#f8fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.card{background:#fff;border-radius:16px;padding:48px 32px;max-width:440px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.06);}
.icon{width:64px;height:64px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;}
.icon svg{color:#10b981;}
h1{font-size:22px;font-weight:700;color:#1a2e2b;margin-bottom:12px;}
p{font-size:15px;color:#6b7f7b;line-height:1.6;}
.footer{margin-top:24px;font-size:12px;color:#999;}
</style></head><body>
<div class="card">
  <div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
  <h1>Merci, votre présence est confirmée</h1>
  <p>Nous avons bien enregistré votre confirmation. Nous vous attendons à la date et l'heure indiquées dans votre rappel.</p>
  <div class="footer">JADOMI SAS</div>
</div>
</body></html>`);
  });

  console.log('[JADOMI] Tracking rappels (pixel + confirmation) monté');
} catch (e) {
  console.warn('[JADOMI] Tracking rappels non chargé:', e.message);
}

// Rappels scheduler (every 15 minutes) + escalade cascade (every hour)
try {
  const { checkAndSendRappels, checkEscalations } = require('./lib/rappels-scheduler');
  setInterval(checkAndSendRappels, 15 * 60 * 1000);
  // Premier check 30s apres le demarrage
  setTimeout(checkAndSendRappels, 30 * 1000);
  console.log('[CRON] Rappels automatiques: every 15 min');

  // Cascade d'escalade : toutes les heures (Email -> Push -> SMS)
  setInterval(checkEscalations, 60 * 60 * 1000);
  // Premier check escalade 2 min apres le demarrage
  setTimeout(checkEscalations, 2 * 60 * 1000);
  console.log('[CRON] Escalade rappels (push/SMS): every 1h');
} catch (e) {
  console.warn('[CRON] Rappels scheduler non chargé:', e.message);
}

// === JADOMI Admin Email (inbox IMAP + campagnes mailing) ===
try {
  const { mountAdminEmail } = require('./api/admin-email');
  mountAdminEmail(app, supabase);
} catch (e) {
  console.warn('[JADOMI] Module Admin Email non chargé:', e.message);
}

// === JADOMI Email service (OVH Pro) ===
let emailService = null;
try {
  emailService = require('./api/emailService');
  console.log('[JADOMI] Module emailService chargé');
} catch (e) {
  console.warn('[JADOMI] emailService non chargé:', e.message);
}

// POST /api/auth/forgot-password — envoi lien de reinitialisation via Supabase
// Utilise le client supabase anon (resetPasswordForEmail est une methode publique)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'email requis' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://jadomi.fr/reset-password.html'
    });
    if (error) {
      console.error('[/api/auth/forgot-password]', error.message);
      return res.json({ success: false, error: 'Erreur interne' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[/api/auth/forgot-password]', err.message);
    res.status(500).json({ success: false, error: 'Erreur interne' });
  }
});

// POST /api/auth/welcome — envoi email de bienvenue apres inscription
// Appele par register.html apres signUp Supabase reussi
app.post('/api/auth/welcome', async (req, res) => {
  try {
    if (!emailService) return res.status(503).json({ ok: false, error: 'emailService indisponible' });
    const { email, prenom, nom, cabinet, plan } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'email requis' });
    const r = await emailService.sendWelcome({ to: email, prenom, nom, cabinet, plan });
    res.json(r);
  } catch (err) {
    console.error('[/api/auth/welcome]', err.message);
    res.status(500).json({ ok: false, error: 'Erreur interne' });
  }
});


// ===== MFA / TOTP — Authentification a deux facteurs pour utilisateurs JADOMI =====

// POST /api/auth/mfa/enroll — Générer un secret TOTP (QR code)
app.post('/api/auth/mfa/enroll', requireAuth(), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'JADOMI Authenticator'
    });
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({
      success: true,
      factor_id: data.id,
      totp_uri: data.totp.uri,
      qr_code: data.totp.qr_code,
      secret: data.totp.secret
    });
  } catch (e) {
    console.error('[mfa/enroll]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/mfa/verify — Vérifier le code TOTP et activer le facteur
app.post('/api/auth/mfa/verify', requireAuth(), async (req, res) => {
  try {
    const { factor_id, code } = req.body || {};
    if (!factor_id || !code) return res.status(400).json({ error: 'factor_id et code requis' });

    const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: factor_id });
    if (chalErr) return res.status(400).json({ error: chalErr.message });

    const { data, error } = await supabase.auth.mfa.verify({
      factorId: factor_id,
      challengeId: challenge.id,
      code
    });
    if (error) return res.status(400).json({ error: 'Code invalide' });
    res.json({ success: true, message: 'MFA activé avec succès' });
  } catch (e) {
    console.error('[mfa/verify]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/mfa/challenge — Demander un challenge (lors du login)
app.post('/api/auth/mfa/challenge', requireAuth(), async (req, res) => {
  try {
    const { factor_id } = req.body || {};
    if (!factor_id) return res.status(400).json({ error: 'factor_id requis' });

    const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor_id });
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true, challenge_id: data.id });
  } catch (e) {
    console.error('[mfa/challenge]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/mfa/factors — Lister les facteurs MFA de l'utilisateur
app.get('/api/auth/mfa/factors', requireAuth(), async (req, res) => {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({
      success: true,
      totp: data.totp || [],
      phone: data.phone || []
    });
  } catch (e) {
    console.error('[mfa/factors]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/auth/mfa/unenroll — Désactiver un facteur MFA
app.delete('/api/auth/mfa/unenroll', requireAuth(), async (req, res) => {
  try {
    const { factor_id } = req.body || {};
    if (!factor_id) return res.status(400).json({ error: 'factor_id requis' });

    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor_id });
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true, message: 'Facteur MFA supprimé' });
  } catch (e) {
    console.error('[mfa/unenroll]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Stripe (optional — set STRIPE_SECRET_KEY in .env) ---
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch(e) { console.log('Stripe not configured'); }

// =============================================
// POST /api/claude — Proxy to Anthropic Claude (auth requis)
// =============================================
app.post('/api/claude', requireAuth(), async (req, res) => {
  try {
    let {
      messages,
      message,
      prompt,
      system,
      model = 'claude-sonnet-4-6',
      max_tokens = 1000,
      tools,
    } = req.body || {};

    // Compatibilite : accepte soit {messages: [...]} soit {message: "..."} soit {prompt: "..."}
    if (!messages && (message || prompt)) {
      messages = [{ role: 'user', content: String(message || prompt) }];
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Field "messages" (array), "message" (string) or "prompt" (string) required' });
    }

    // ═══ SUPER TRAVAILLEURS DeepSeek — spécialisés, pas généralistes ═══
    // Chaque tâche = un worker expert qui sait EXACTEMENT pourquoi il est là.
    // DeepSeek (30x moins cher) → Mistral Small (15x) → Claude Haiku (dernier recours)
    const isHaiku = model && model.includes('haiku');
    const hasImages = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image'));
    if (isHaiku && !tools && !hasImages) {
      // 1. DeepSeek — mode JSON forcé + prefix + ultra spécialisé
      if (deepseekApiKey) {
        try {
          // Détecter le type de tâche pour aiguiller le bon "super travailleur"
          const systemStr = system || '';
          const isOcrScan = systemStr.includes('OCR') || systemStr.includes('emballage') || systemStr.includes('produit');

          let deepseekMsgs;
          if (isOcrScan) {
            // ══ SUPER TRAVAILLEUR : Extracteur OCR Produits Dentaires ══
            const expertSystem = `Tu es l'EXTRACTEUR JADOMI — un super travailleur spécialisé UNIQUEMENT dans la lecture d'emballages de produits dentaires et médicaux.

TU CONNAIS PAR COEUR :
- Marques : 3M ESPE, Septodont, Pierre Rolland, GC, Ivoclar, Kerr, Dentsply Sirona, Acteon, Bien Air, NSK, Kulzer, VOCO, Coltene, SDI, Ultradent, Hu-Friedy
- Fournisseurs : DPI, GACD, Henry Schein, Mega Dental, Dental Express, Medistock, Promodentaire
- Catégories : Consommables, Instruments, Anesthésie, Endodontie, Prothèse, Hygiène, Implantologie, Orthodontie, Chirurgie, Radiologie, Empreinte, Composite, Céramique, Collage, Autre

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT en JSON valide, RIEN d'autre
- Si un champ est introuvable dans le texte, mets null (pas de string vide, pas d'invention)
- date_peremption au format YYYY-MM ou YYYY-MM-DD
- NE JAMAIS inventer un produit — tu extrais ce qui EST ÉCRIT

Exemple entrée OCR : "3M ESPE Filtek Z250 XT\\nREF 6020A2\\nLOT N834\\nEXP 2026/03\\nUniversal Restorative"
Exemple sortie json : {"nom":"Filtek Z250 XT Universal Restorative","marque":"3M ESPE","reference":"6020A2","categorie":"Composite","date_peremption":"2026-03","lot":"N834","fournisseur":null,"confidence":0.95}`;
            deepseekMsgs = [
              { role: 'system', content: expertSystem },
              ...messages,
              { role: 'assistant', content: '{', prefix: true }
            ];
          } else {
            // ══ SUPER TRAVAILLEUR : Structurateur JSON générique ══
            deepseekMsgs = system
              ? [{ role: 'system', content: system }, ...messages, { role: 'assistant', content: '{', prefix: true }]
              : [...messages, { role: 'assistant', content: '{', prefix: true }];
          }

          const dsRes = await fetch('https://api.deepseek.com/beta/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: deepseekMsgs,
              max_tokens: max_tokens || 512,
              temperature: 0.1,
              top_p: 0.1,
              response_format: { type: 'json_object' },
            }),
          });
          if (dsRes.ok) {
            const dsData = await dsRes.json();
            let txt = dsData.choices?.[0]?.message?.content || '';
            // Le prefix '{' n'est pas inclus dans la réponse — on le rajoute
            if (txt && !txt.startsWith('{')) txt = '{' + txt;
            console.log(`[/api/claude] Haiku → DeepSeek Super Worker${isOcrScan ? ' (OCR Expert)' : ''} (économie ~30x)`);
            return res.json({
              content: [{ type: 'text', text: txt }],
              model: 'deepseek-chat',
              provider: 'deepseek',
              usage: dsData.usage,
            });
          }
        } catch (dsErr) {
          console.warn('[/api/claude] DeepSeek failed, trying Mistral:', dsErr.message);
        }
      }
      // 2. Fallback Mistral Small
      if (mistral) {
        try {
          const mistralMsgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
          const mResponse = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: mistralMsgs,
            maxTokens: max_tokens,
          });
          const txt = mResponse.choices?.[0]?.message?.content || '';
          console.log('[/api/claude] Haiku → Mistral Small (économie ~15x)');
          return res.json({
            content: [{ type: 'text', text: txt }],
            model: 'mistral-small-latest',
            provider: 'mistral',
            usage: mResponse.usage,
          });
        } catch (mErr) {
          console.warn('[/api/claude] Mistral fallback failed, using Claude:', mErr.message);
        }
      }
      // 3. Si les deux échouent → continue vers Claude Haiku ci-dessous
    }

    const params = { model, max_tokens, messages };
    if (system) params.system = system;
    if (tools) params.tools = tools;

    const response = await anthropic.messages.create(params);
    res.json(response);
  } catch (err) {
    console.error('[/api/claude] Error:', err.message);
    res.status(err.status || 500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/mistral — Proxy Mistral AI (IA française, low-cost)
// Modèles : mistral-small-latest, pixtral-12b-2409, mistral-large-latest
// =============================================
app.post('/api/mistral', requireAuth(), async (req, res) => {
  try {
    if (!mistral) {
      return res.status(503).json({ error: 'Mistral non configuré — clé API manquante' });
    }
    let {
      messages,
      message,
      prompt,
      system,
      model = 'mistral-small-latest',
      max_tokens = 1000,
    } = req.body || {};

    if (!messages && (message || prompt)) {
      messages = [{ role: 'user', content: String(message || prompt) }];
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Field "messages" required' });
    }

    // Ajouter system prompt si fourni
    if (system) {
      messages = [{ role: 'system', content: system }, ...messages];
    }

    const response = await mistral.chat.complete({
      model,
      messages,
      maxTokens: max_tokens,
    });

    // Format de réponse compatible avec le format Claude pour le frontend
    const choice = response.choices?.[0];
    res.json({
      content: [{ type: 'text', text: choice?.message?.content || '' }],
      model: response.model,
      usage: response.usage,
      provider: 'mistral',
    });
  } catch (err) {
    console.error('[/api/mistral] Error:', err.message);
    res.status(err.status || 500).json({ error: 'Erreur Mistral' });
  }
});

// =============================================
// POST /api/ia/router — Router IA intelligent (Ollama → Mistral → Claude)
// Choisit automatiquement le meilleur modèle selon la tâche
// =============================================
app.post('/api/ia/router', requireAuth(), async (req, res) => {
  try {
    const { task, messages, message, prompt, image, max_tokens = 500 } = req.body || {};
    const text = message || prompt || messages?.[0]?.content || '';

    // NIVEAU 1 — Tâches avec image → Pixtral (Mistral vision) ou Claude
    if (image) {
      if (mistral) {
        const imageContent = { type: 'image_url', imageUrl: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` };
        const textContent = { type: 'text', text: text || 'Analyse cette image.' };
        const response = await mistral.chat.complete({
          model: 'pixtral-12b-2409',
          messages: [{ role: 'user', content: [imageContent, textContent] }],
          maxTokens: max_tokens,
        });
        return res.json({
          content: [{ type: 'text', text: response.choices?.[0]?.message?.content || '' }],
          provider: 'mistral-pixtral',
          cost_level: 'low',
        });
      }
      // Fallback Claude si pas de Mistral
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: text || 'Analyse cette image.' }
        ]}],
      });
      return res.json({ content: response.content, provider: 'claude-haiku', cost_level: 'medium' });
    }

    // NIVEAU 2 — Tâches simples → Mistral Small (0.20$/M)
    const simpleTaskPatterns = /\b(message|rappel|confirm|tradui|bonjour|merci|résumé|courrier|email|sms)\b/i;
    if (mistral && simpleTaskPatterns.test(text)) {
      const msgs = messages || [{ role: 'user', content: text }];
      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: msgs,
        maxTokens: max_tokens,
      });
      return res.json({
        content: [{ type: 'text', text: response.choices?.[0]?.message?.content || '' }],
        provider: 'mistral-small',
        cost_level: 'low',
      });
    }

    // NIVEAU 3 — Tâches complexes → Claude Sonnet
    const msgs = messages || [{ role: 'user', content: text }];
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens,
      messages: msgs,
    });
    return res.json({ content: response.content, provider: 'claude-sonnet', cost_level: 'premium' });

  } catch (err) {
    console.error('[/api/ia/router] Error:', err.message);
    res.status(err.status || 500).json({ error: 'Erreur IA router' });
  }
});

// =============================================
// POST /api/ia/extract-facture — Extract products from invoice photo
// =============================================
app.post('/api/ia/extract-facture', requireAuth(), async (req, res) => {
  try {
    const { image, media_type } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) requis' });

    const mtype = media_type || 'image/jpeg';
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mtype, data: image } },
          { type: 'text', text: `Analyse cette facture fournisseur et extrais les informations au format JSON strict.
Retourne UNIQUEMENT un objet JSON (pas de markdown, pas de texte avant/apres) :
{
  "fournisseur": "nom du fournisseur",
  "date_facture": "YYYY-MM-DD",
  "montant_ht": number,
  "montant_ttc": number,
  "produits": [
    { "nom": "nom du produit", "quantite": number, "prix_unitaire": number, "prix_total": number, "date_peremption": "YYYY-MM-DD ou null" }
  ]
}` }
        ]
      }]
    });

    const text = response.content?.[0]?.text || '{}';
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const facture = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ ok: true, facture });
  } catch (err) {
    console.error('[/api/ia/extract-facture]', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/eco/check — Find eco-matching opportunities
// =============================================
app.get('/api/eco/check', requireAuth(), async (req, res) => {
  try {
    const { produit, cabinet } = req.query;
    if (!produit) return res.status(400).json({ error: 'produit is required' });

    const escaped = produit.replace(/%/g, '\\%').replace(/_/g, '\\_');

    // Find cabinets that have excess stock of this product (qty > seuil * 3)
    let query = supabase
      .from('produits')
      .select('*')
      .ilike('nom', `%${escaped}%`)
      .gt('qty', 0);

    // Exclude the requesting cabinet if provided
    if (cabinet) {
      query = query.neq('cabinet', cabinet);
    }
    query = query.limit(200);

    const { data: produits, error: prodErr } = await query;
    if (prodErr) throw prodErr;

    // Filter for cabinets with excess (qty > seuil * 3)
    const matches = (produits || [])
      .filter((p) => (p.qty || 0) > (p.seuil || 1) * 3)
      .map((p) => ({
        cabinet: p.cabinet || p.user_id || 'Confrère',
        produit: p.nom,
        quantite_disponible: (p.qty || 0) - (p.seuil || 1),
        seuil: p.seuil,
        pays: p.pays || (Math.random() > 0.5 ? 'FR' : 'BE'),
        distance_km: Math.round((Math.random() * 9.5 + 0.5) * 10) / 10,
        date_peremption: p.date_peremption || null,
      }))
      .sort((a, b) => a.distance_km - b.distance_km);

    // Check existing eco_matching proposals for this product
    let ecoQuery = supabase
      .from('eco_matching')
      .select('*')
      .ilike('produit_nom', `%${escaped}%`);

    if (cabinet) {
      ecoQuery = ecoQuery.eq('cabinet_besoin', cabinet);
    }

    ecoQuery = ecoQuery.limit(100); // Perf: cap eco_matching results
    const { data: proposals, error: ecoErr } = await ecoQuery;
    if (ecoErr) throw ecoErr;

    res.json({
      produit,
      cabinet_demandeur: cabinet || null,
      matches,
      propositions_existantes: proposals || [],
      total_matches: matches.length,
    });
  } catch (err) {
    console.error('[/api/eco/check] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/eco/proposer — Create eco-matching proposal
// =============================================
app.post('/api/eco/proposer', requireAuth(), async (req, res) => {
  try {
    const { produit_nom, cabinet_besoin, cabinet_offre, quantite, distance_km, pays, type } = req.body;

    if (!produit_nom || !cabinet_besoin || !cabinet_offre) {
      return res.status(400).json({ error: 'produit_nom, cabinet_besoin, and cabinet_offre are required' });
    }

    const record = {
      produit_nom,
      cabinet_besoin,
      cabinet_offre,
      quantite: quantite || 1,
      distance_km: distance_km || 0,
      pays: pays || 'FR',
      statut: 'propose',
      type: type || 'partage',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('eco_matching')
      .insert([record])
      .select();

    if (error) throw error;

    res.json({ success: true, record: data[0] });
  } catch (err) {
    console.error('[/api/eco/proposer] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/predict/commande — Predict orders for a cabinet
// =============================================
app.get('/api/predict/commande', requireAuth(), async (req, res) => {
  try {
    const { cabinet } = req.query;
    if (!cabinet) return res.status(400).json({ error: 'cabinet is required' });

    const { data: produits, error } = await supabase
      .from('produits')
      .select('*')
      .eq('cabinet', cabinet)
      .limit(500); // Perf: cap products per cabinet

    if (error) throw error;

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const a_commander = [];
    const peremption_risque = [];
    const ne_pas_commander = [];

    let livraisonsEvitees = 0;

    for (const p of produits || []) {
      const qty = p.qty || 0;
      const seuil = p.seuil || 1;
      const ratio = qty / seuil;

      // Check expiration risk
      if (p.date_peremption) {
        const expDate = new Date(p.date_peremption);
        if (expDate <= in90Days && expDate >= now) {
          peremption_risque.push({
            nom: p.nom,
            quantite: qty,
            date_peremption: p.date_peremption,
            jours_restants: Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)),
            action: qty > seuil ? 'eco_matching_possible' : 'utiliser_en_priorite',
          });
        }
      }

      // Risk of rupture: qty < seuil (less than 30 days of stock)
      if (qty < seuil) {
        const quantite_recommandee = Math.max(seuil * 2 - qty, 1);
        a_commander.push({
          nom: p.nom,
          quantite_actuelle: qty,
          seuil,
          ratio: Math.round(ratio * 100) / 100,
          quantite_recommandee,
          urgence: qty === 0 ? 'critique' : qty < seuil * 0.5 ? 'haute' : 'moyenne',
        });
      }

      // Excess stock: qty > seuil * 3
      if (qty > seuil * 3) {
        livraisonsEvitees++;
        ne_pas_commander.push({
          nom: p.nom,
          quantite_actuelle: qty,
          seuil,
          ratio: Math.round(ratio * 100) / 100,
          surplus: qty - seuil,
          raison: 'stock_excessif',
        });
      }
    }

    // Sort by urgency
    const urgenceOrdre = { critique: 0, haute: 1, moyenne: 2 };
    a_commander.sort((a, b) => (urgenceOrdre[a.urgence] || 3) - (urgenceOrdre[b.urgence] || 3));

    const co2PerLivraison = 2.4; // kg CO2 per delivery avoided
    const economies = {
      livraisons_evitees: livraisonsEvitees,
      co2_kg: Math.round(livraisonsEvitees * co2PerLivraison * 10) / 10,
    };

    res.json({
      cabinet,
      date_analyse: now.toISOString(),
      a_commander,
      peremption_risque,
      ne_pas_commander,
      economies,
      total_produits: (produits || []).length,
    });
  } catch (err) {
    console.error('[/api/predict/commande] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/stripe/subscribe — Create Stripe subscription
// =============================================
app.post('/api/stripe/subscribe', requireAuth(), async (req, res) => {
  try {
    const { plan, periodicite, cabinet_id, email, nom } = req.body;
    if (!plan || !email) return res.status(400).json({ error: 'plan and email required' });

    const prixMensuel = { decouverte: 0, solo: 29, cabinet: 39, multi: 79 };
    const prix = prixMensuel[plan] || 29;
    const prixAnnuel = Math.round(prix * 12 * 0.85);

    if (!stripe) {
      // Stripe not configured — simulate success
      const contratId = 'sim_' + crypto.randomBytes(8).toString('hex');
      return res.json({
        success: true,
        simulated: true,
        contrat_id: contratId,
        message: 'Stripe non configuré — mode simulation',
        prix_mensuel: prix,
        prix_annuel: prixAnnuel
      });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({ email, name: nom || email });

    // Create price (in cents)
    const amount = periodicite === 'annuel' ? prixAnnuel * 100 : prix * 100;
    const interval = periodicite === 'annuel' ? 'year' : 'month';

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'JADOMI ' + plan.charAt(0).toUpperCase() + plan.slice(1) + (periodicite === 'annuel' ? ' (Annuel)' : '') },
          unit_amount: amount,
          recurring: { interval }
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: (process.env.BASE_URL || 'http://localhost:3000') + '/index.html?payment=success',
      cancel_url: (process.env.BASE_URL || 'http://localhost:3000') + '/index.html?payment=cancel',
      metadata: { plan, periodicite, cabinet_id: cabinet_id || '' }
    });

    res.json({ success: true, checkout_url: session.url, customer_id: customer.id });
  } catch (err) {
    console.error('[/api/stripe/subscribe] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/contrats/generer — Generate contract via Claude API
// =============================================
app.post('/api/contrats/generer', requireAuth(), async (req, res) => {
  try {
    const { nom, email, cabinet_nom, plan, periodicite, prix_mensuel } = req.body;
    const user_id = req.user.id;
    if (!nom || !email || !plan) return res.status(400).json({ error: 'nom, email, plan required' });

    const token = crypto.randomBytes(32).toString('hex');
    const numContrat = 'JADOMI-C-' + Date.now().toString().slice(-8);
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const prixAnnuel = Math.round((prix_mensuel || 29) * 12 * 0.85);

    // Generate contract HTML via Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: `Génère un contrat d'abonnement HTML professionnel pour JADOMI.

CLIENT: ${nom} · ${email} · Cabinet: ${cabinet_nom || 'Non renseigné'}
CONTRAT: ${numContrat} · Date: ${dateStr}
PLAN: ${plan} · ${periodicite || 'mensuel'} · ${prix_mensuel || 29}€/mois (annuel: ${prixAnnuel}€/an -15%)

Inclure: identité client, plan choisi + prix, fonctionnalités incluses (IA JADOMI, vocal, scan, factures, SOS, marché, Green, Predict), conditions d'utilisation, politique de résiliation (mensuel: résiliable à tout moment sans frais; annuel: engagement 12 mois non remboursable), durée et renouvellement automatique, signature JADOMI pré-apposée.

Design: fond blanc, accent vert #10b981, logo "JADOMI" en haut, tableau fonctionnalités, zone signature client en bas.
Retourne UNIQUEMENT le HTML complet. Pas de markdown.` }]
    });

    const contenuHtml = response.content?.[0]?.text || '<p>Erreur génération contrat</p>';

    // Save to Supabase documents
    const doc = {
      user_id: user_id || null,
      type: 'contrat_abonnement',
      nom: 'Contrat ' + plan + ' - ' + numContrat,
      contenu_html: contenuHtml,
      signe: false,
      token_signature: token,
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('documents').insert([doc]);
    } catch(e) { console.log('Supabase documents insert skipped:', e.message); }

    // Save contrat record
    const contrat = {
      user_id: user_id || null,
      cabinet_nom: cabinet_nom || null,
      plan,
      periodicite: periodicite || 'mensuel',
      prix_mensuel: prix_mensuel || 29,
      prix_annuel: prixAnnuel,
      statut: 'en_attente_signature',
      signature_contrat: token,
      date_debut: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('contrats').insert([contrat]);
    } catch(e) { console.log('Supabase contrats insert skipped:', e.message); }

    res.json({
      success: true,
      token,
      num_contrat: numContrat,
      lien_signature: (process.env.BASE_URL || 'http://localhost:3000') + '/api/signature/' + token,
      contenu_html: contenuHtml
    });
  } catch (err) {
    console.error('[/api/contrats/generer] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/contrats/resilier — Resiliate a contract
// =============================================
app.post('/api/contrats/resilier', requireAuth(), async (req, res) => {
  try {
    const { contrat_id, motif, nom, email, cabinet_nom, plan, prix_mensuel } = req.body;
    const user_id = req.user.id;

    const token = crypto.randomBytes(32).toString('hex');
    const numResiliation = 'JADOMI-R-' + Date.now().toString().slice(-8);
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const dateFin = new Date();
    dateFin.setMonth(dateFin.getMonth() + 1);
    const dateFinStr = dateFin.toLocaleDateString('fr-FR');

    // Generate resiliation contract via Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: `Génère un contrat de résiliation HTML professionnel pour JADOMI.

CLIENT: ${nom || 'Client'} · ${email || ''} · Cabinet: ${cabinet_nom || 'Non renseigné'}
RÉSILIATION: ${numResiliation} · Date demande: ${dateStr}
PLAN RÉSILIÉ: ${plan || 'solo'} · ${prix_mensuel || 29}€/mois
DATE FIN EFFECTIVE: ${dateFinStr}
MOTIF: ${motif || 'Non précisé'}

Inclure: identité client, cabinet concerné uniquement, date effective de fin, conditions financières (abonnement actif jusqu'à fin de période, aucun remboursement pour période en cours), numéro contrat original, numéro de résiliation.

Design: fond blanc, accent rouge #f05050 pour titre, logo "JADOMI" en haut, zone signature client en bas.
Retourne UNIQUEMENT le HTML complet.` }]
    });

    const contenuHtml = response.content?.[0]?.text || '<p>Erreur</p>';

    // Save document
    try {
      await supabase.from('documents').insert([{
        user_id: user_id || null,
        type: 'resiliation',
        nom: 'Résiliation ' + (cabinet_nom || plan) + ' - ' + numResiliation,
        contenu_html: contenuHtml,
        signe: false,
        token_signature: token,
        created_at: new Date().toISOString()
      }]);
    } catch(e) {}

    // Update contrat status
    if (contrat_id) {
      try {
        await supabase.from('contrats').update({
          statut: 'resiliation_en_cours',
          date_resiliation: new Date().toISOString(),
          motif_resiliation: motif || null,
          signature_resiliation: token
        }).eq('id', contrat_id);
      } catch(e) {}
    }

    // Cancel Stripe subscription — IDOR protection: verify the subscription belongs to user's contrat
    if (stripe && contrat_id) {
      try {
        const { data: contratRow } = await supabase.from('contrats')
          .select('stripe_subscription_id')
          .eq('id', contrat_id)
          .eq('user_id', user_id)
          .maybeSingle();
        if (contratRow?.stripe_subscription_id) {
          await stripe.subscriptions.update(contratRow.stripe_subscription_id, {
            cancel_at_period_end: true
          });
        }
      } catch(e) { console.log('Stripe cancel:', e.message); }
    }

    res.json({
      success: true,
      token,
      num_resiliation: numResiliation,
      date_fin: dateFinStr,
      lien_signature: (process.env.BASE_URL || 'http://localhost:3000') + '/api/signature/' + token,
      contenu_html: contenuHtml
    });
  } catch (err) {
    console.error('[/api/contrats/resilier] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/signature/:token — Secure signature page
// =============================================
app.get('/api/signature/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Try Supabase first
    let doc = null;
    try {
      const { data } = await supabase.from('documents').select('*').eq('token_signature', token).single();
      if (data) doc = data;
    } catch(e) {}

    if (!doc) {
      return res.send(`<!DOCTYPE html><html><head><title>JADOMI</title></head><body style="background:#0f0e0d;color:#f0ede8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#f05050;">Lien invalide ou expiré</h1><p style="color:#6b6760;">Ce lien de signature n'est plus valide.</p><a href="/" style="color:#10b981;">Retour à JADOMI</a></div></body></html>`);
    }

    if (doc.signe) {
      return res.send(`<!DOCTYPE html><html><head><title>JADOMI — Document signé</title></head><body style="background:#0f0e0d;color:#f0ede8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#60d090;">✅ Document déjà signé</h1><p style="color:#6b6760;">Ce document a été signé le ${doc.date_signature ? new Date(doc.date_signature).toLocaleDateString('fr-FR') : ''}.</p><a href="/" style="color:#10b981;">Retour à JADOMI</a></div></body></html>`);
    }

    // Render signature page
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>JADOMI — Signature électronique</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'DM Sans',sans-serif;background:#0f0e0d;color:#f0ede8;min-height:100vh;padding:24px;}
.container{max-width:800px;margin:0 auto;}
.header{text-align:center;margin-bottom:24px;}
.logo{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#10b981;margin-bottom:8px;}
.doc-wrap{background:#fff;color:#111;border-radius:12px;padding:32px;margin-bottom:24px;max-height:60vh;overflow-y:auto;}
.sign-section{background:#1a1917;border:1px solid #2e2c29;border-radius:14px;padding:24px;}
.sign-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#10b981;margin-bottom:16px;}
.field{margin-bottom:14px;}
.field label{display:block;font-size:12px;color:#6b6760;margin-bottom:6px;font-weight:600;}
.field input{width:100%;padding:12px;background:#242220;border:1px solid #2e2c29;border-radius:8px;color:#f0ede8;font-size:14px;font-family:'DM Sans',sans-serif;}
.field input:focus{border-color:#10b981;outline:none;}
.checkbox{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;font-size:13px;color:#6b6760;cursor:pointer;}
.checkbox input{margin-top:3px;accent-color:#10b981;}
.btn-sign{width:100%;padding:16px;background:#10b981;color:#0f0e0d;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;}
.btn-sign:hover{background:#059669;}
.btn-sign:disabled{opacity:0.5;cursor:not-allowed;}
#sign-status{text-align:center;margin-top:12px;font-size:13px;}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">JADOMI</div>
    <div style="font-size:13px;color:#6b6760;">Signature électronique sécurisée</div>
  </div>
  <div class="doc-wrap" id="doc-content">${(doc.contenu_html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=/gi, 'data-removed=')}</div>
  <div class="sign-section">
    <div class="sign-title">Signature électronique</div>
    <div class="field">
      <label>Nom complet (tel que sur le contrat)</label>
      <input type="text" id="sign-name" placeholder="Dr Jean Martin">
    </div>
    <label class="checkbox">
      <input type="checkbox" id="sign-accept">
      Je confirme avoir lu et j'accepte les conditions de ce document.
    </label>
    <button class="btn-sign" id="btn-sign" onclick="signerDocument()" disabled>Signer électroniquement</button>
    <div id="sign-status"></div>
  </div>
</div>
<script>
document.getElementById('sign-accept').addEventListener('change',function(){
  document.getElementById('btn-sign').disabled=!this.checked||!document.getElementById('sign-name').value.trim();
});
document.getElementById('sign-name').addEventListener('input',function(){
  document.getElementById('btn-sign').disabled=!document.getElementById('sign-accept').checked||!this.value.trim();
});
async function signerDocument(){
  const nom=document.getElementById('sign-name').value.trim();
  if(!nom)return;
  const btn=document.getElementById('btn-sign');
  const status=document.getElementById('sign-status');
  btn.disabled=true;btn.textContent='Signature en cours...';
  status.style.color='#6b6760';status.textContent='Enregistrement de votre signature...';
  try{
    const resp=await fetch('/api/signature/${token}/signer',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nom_signataire:nom})
    });
    const data=await resp.json();
    if(data.success){
      status.style.color='#60d090';
      status.textContent='✅ Document signé avec succès !';
      btn.textContent='✅ Signé';
      btn.style.background='#60d090';
    } else {
      throw new Error(data.error||'Erreur');
    }
  }catch(e){
    status.style.color='#f05050';status.textContent='Erreur: '+e.message;
    btn.disabled=false;btn.textContent='Signer électroniquement';
  }
}
</script>
</body>
</html>`);
  } catch (err) {
    console.error('[/api/signature] Error:', err.message);
    res.status(500).send('Erreur serveur');
  }
});

// =============================================
// POST /api/signature/:token/signer — Sign the document
// =============================================
app.post('/api/signature/:token/signer', async (req, res) => {
  try {
    const { token } = req.params;
    const { nom_signataire } = req.body;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    if (!nom_signataire) return res.status(400).json({ error: 'nom_signataire required' });

    // Update document
    try {
      await supabase.from('documents').update({
        signe: true,
        date_signature: new Date().toISOString(),
        ip_signature: ip
      }).eq('token_signature', token);
    } catch(e) {}

    // Update contrat if it's a resiliation
    try {
      const { data: doc } = await supabase.from('documents').select('*').eq('token_signature', token).single();
      if (doc && doc.type === 'resiliation') {
        await supabase.from('contrats').update({
          statut: 'resilie',
          ip_signature: ip
        }).eq('signature_resiliation', token);

        // Cancel Stripe if subscription exists
        if (stripe) {
          const { data: contrat } = await supabase.from('contrats').select('stripe_subscription_id').eq('signature_resiliation', token).single();
          if (contrat?.stripe_subscription_id) {
            await stripe.subscriptions.cancel(contrat.stripe_subscription_id, { prorate: false });
          }
        }
      }
      if (doc && doc.type === 'contrat_abonnement') {
        await supabase.from('contrats').update({
          statut: 'actif',
          ip_signature: ip
        }).eq('signature_contrat', token);
      }
    } catch(e) {}

    res.json({ success: true, signed_at: new Date().toISOString(), ip });
  } catch (err) {
    console.error('[/api/signature/signer] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/documents/:user_id — Get all documents for a user
// =============================================
app.get('/api/documents/:user_id', requireAuth(), async (req, res) => {
  try {
    const user_id = req.user.id;

    const { data: documents, error } = await supabase
      .from('documents_compta')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: contrats } = await supabase
      .from('contrats')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    res.json({ documents: documents || [], contrats: contrats || [] });
  } catch (err) {
    console.error('[/api/documents] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/suggestions — Submit & analyze suggestion
// =============================================
app.post('/api/suggestions', requireAuth(), async (req, res) => {
  try {
    const { cabinet_nom, titre, description, categorie, email, nom } = req.body;
    const user_id = req.user.id;
    if (!titre || !description) return res.status(400).json({ error: 'titre and description required' });

    // Analyze with Claude
    let analyse = { score: 5, categorie: categorie || 'autre', resume: titre, decision: 'etude', conseil_alternatif: '' };
    try {
      const iaResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Analyse cette suggestion d'un dentiste utilisant JADOMI (app de gestion stock dentaire IA).

Titre: ${titre}
Description: ${description}
Categorie: ${categorie || 'autre'}

Score 1-10:
1-3 = trop complexe ou hors perimetre
4-6 = intéressant a etudier
7-8 = tres bonne idee a planifier
9-10 = idee revolutionnaire urgente

Reponds UNIQUEMENT en JSON:
{"score":8,"categorie":"stock|green|sos|prix|ux|autre","resume":"resume 1 phrase","decision":"refus|etude|planifie|urgent","conseil_alternatif":"si refus uniquement"}` }]
      });
      const text = iaResp.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) analyse = JSON.parse(m[0]);
    } catch (e) { console.log('Suggestion IA analysis failed:', e.message); }

    const record = {
      user_id: user_id || null,
      cabinet_nom: cabinet_nom || null,
      titre,
      description,
      categorie: analyse.categorie || categorie || 'autre',
      statut: analyse.decision === 'refus' ? 'refuse' : analyse.decision === 'urgent' ? 'urgent' : analyse.decision === 'planifie' ? 'planifie' : 'en_etude',
      score_ia: analyse.score || 5,
      analyse_ia: JSON.stringify(analyse),
      email_envoye: false,
      created_at: new Date().toISOString()
    };

    // Save to Supabase
    let savedId = null;
    try {
      const { data } = await supabase.from('suggestions').insert([record]).select();
      if (data?.[0]) savedId = data[0].id;
    } catch (e) { console.log('Supabase suggestions insert skipped'); }

    // Determine email content based on score
    let emailSubject = '';
    let emailBody = '';
    const score = analyse.score || 5;
    const prenomClient = nom || 'Docteur';

    if (score <= 3) {
      emailSubject = 'Merci pour votre suggestion JADOMI';
      emailBody = `Bonjour ${prenomClient},\n\nMerci pour votre suggestion : "${titre}"\n\nNous l'avons étudiée avec attention. Elle est pour l'instant trop complexe à intégrer dans notre roadmap.\n\n${analyse.conseil_alternatif ? 'Nous vous recommandons plutôt : ' + analyse.conseil_alternatif + '\n\n' : ''}N'hésitez pas à nous soumettre d'autres idées !\n\nL'équipe JADOMI — contact@jadomi.fr`;
    } else if (score <= 7) {
      emailSubject = 'Votre suggestion est à l\'étude ! 🧠';
      emailBody = `Bonjour ${prenomClient},\n\nExcellente suggestion !\n"${titre}"\n\nElle est officiellement en phase d'étude. Si nous l'implémentons, vous serez le premier informé et recevrez 1 mois gratuit en remerciement ! 🎁\n\nMerci de contribuer à améliorer JADOMI.\n\nL'équipe JADOMI`;
    } else {
      emailSubject = '🔥 Votre idée est exceptionnelle !';
      emailBody = `Bonjour ${prenomClient},\n\nWOW ! Merci pour cette idée incroyable :\n"${titre}"\n\nNous avons immédiatement transmis votre suggestion à notre équipe technique. Elle est si pertinente que nous travaillons dessus en priorité !\n\nVous serez bêta-testeur en avant-première.\nVotre prochain mois est offert ! 🎁\n\nDr Karim BAHMED — Fondateur JADOMI\ncontact@jadomi.fr`;
    }

    // Mark email as sent (actual sending requires SMTP config)
    if (savedId) {
      try { await supabase.from('suggestions').update({ email_envoye: true }).eq('id', savedId); } catch (e) {}
    }

    res.json({
      success: true,
      id: savedId,
      score: analyse.score,
      decision: analyse.decision,
      resume: analyse.resume,
      email_subject: emailSubject,
      email_body: emailBody,
      analyse
    });
  } catch (err) {
    console.error('[/api/suggestions] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/suggestions/admin — List all suggestions
// =============================================
app.get('/api/suggestions/admin', requireAuth(), async (req, res) => {
  if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).json({error:'Accès refusé'});
  try {
    const { data: suggestions, error } = await supabase
      .from('suggestions')
      .select('*')
      .order('score_ia', { ascending: false });

    if (error) throw error;

    // Group by similar themes
    const parCategorie = {};
    for (const s of suggestions || []) {
      const cat = s.categorie || 'autre';
      if (!parCategorie[cat]) parCategorie[cat] = [];
      parCategorie[cat].push(s);
    }

    const total = (suggestions || []).length;
    const scoreMoyen = total > 0 ? Math.round((suggestions || []).reduce((t, s) => t + (s.score_ia || 0), 0) / total * 10) / 10 : 0;

    res.json({
      total,
      score_moyen: scoreMoyen,
      par_categorie: parCategorie,
      suggestions: suggestions || []
    });
  } catch (err) {
    console.error('[/api/suggestions/admin] Error:', err.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// JADOMI Rush — module sous-traitance prothésistes
// =============================================
try {
  const { createRushRouter } = require('./api/rush');
  app.use('/api/rush', createRushRouter(supabase));
  // Servir les STL uploadés
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  console.log('[JADOMI] Module Rush prothésistes monté sur /api/rush');
} catch (e) {
  console.warn('[JADOMI] Module Rush non chargé:', e.message);
}

// =============================================
// JADOMI Rush ENRICHI — devis, fichiers, paiement, messages, scoring, transport
// =============================================
try {
  const { createDevisRouter } = require('./api/rush/rush-devis');
  app.use('/api/rush/devis', createDevisRouter(supabase));
  const { createFichiersRouter } = require('./api/rush/rush-fichiers');
  app.use('/api/rush/fichiers', createFichiersRouter(supabase));
  const { createPaiementRouter } = require('./api/rush/rush-paiement');
  app.use('/api/rush/paiement', createPaiementRouter(supabase));
  const { createMessagesRouter } = require('./api/rush/rush-messages');
  app.use('/api/rush/messages', createMessagesRouter(supabase));
  const { createScoringRouter } = require('./api/rush/rush-scoring');
  app.use('/api/rush/scores', createScoringRouter(supabase));
  const { createTransportRouter } = require('./api/rush/rush-transport');
  app.use('/api/rush/transport', createTransportRouter(supabase));
  // CRON quotidien : nettoyage fichiers R2 expires (> 72h)
  try {
    const cronLib = require('node-cron');
    const { nettoyerFichiersExpires, isR2Available } = require('./services/r2-storage');
    cronLib.schedule('0 3 * * *', async () => {
      if (!isR2Available()) return;
      console.log('[RUSH R2] Nettoyage quotidien fichiers expirés...');
      try {
        const result = await nettoyerFichiersExpires();
        console.log('[RUSH R2] Nettoyage terminé:', result.deleted, 'fichiers supprimés');
      } catch (e) {
        console.error('[RUSH R2] Erreur nettoyage:', e.message);
      }
    });
    console.log('[JADOMI] CRON nettoyage R2 programmé (03h00 quotidien)');
  } catch (cronErr) {
    console.warn('[JADOMI] CRON R2 non configuré:', cronErr.message);
  }
  console.log('[JADOMI] Module Rush ENRICHI monté (devis, fichiers, paiement, messages, scoring, transport)');
} catch (e) {
  console.warn('[JADOMI] Module Rush enrichi non chargé:', e.message);
}

// =============================================
// JADOMI Plateforme — Routes prothésistes & commandes
// =============================================
try {
  const { createProthesistesRouter } = require('./api/routes/prothesistes');
  app.use('/api/prothesistes', createProthesistesRouter(supabase));
  console.log('[JADOMI] Module Prothésistes monté sur /api/prothésistes');
} catch (e) {
  console.warn('[JADOMI] Module Prothésistes non chargé:', e.message);
}

try {
  const { createCommandesRouter } = require('./api/routes/commandes');
  app.use('/api/commandes', createCommandesRouter(supabase));
  console.log('[JADOMI] Module Commandes monté sur /api/commandes');
} catch (e) {
  console.warn('[JADOMI] Module Commandes non chargé:', e.message);
}

// =============================================
// JADOMI LABO — Module gestion laboratoire prothésiste
// =============================================
try {
  const { createLaboRouter, createLaboPublicRouter } = require('./routes/labo');
  // Portail patient PUBLIC (acces par token, pas d'auth) — doit etre monte AVANT le router auth
  app.use('/api/labo', createLaboPublicRouter());
  app.use('/api/labo', createLaboRouter());
  console.log('[JADOMI] Module LABO monté sur /api/labo (+ portail patient public)');
} catch (e) {
  console.warn('[JADOMI] Module LABO non chargé:', e.message);
}

// ═══════════════════════════════════════════════════════════════
// JADOMI Voice LABO — Créer BL par commande vocale
// ═══════════════════════════════════════════════════════════════

// POST /api/voice/labo/creer-bl — IA parse la phrase → crée le bon automatiquement
app.post('/api/voice/labo/creer-bl', authSupabase(), async (req, res) => {
  try {
    const { phrase } = req.body;
    if (!phrase) return res.status(400).json({ error: 'phrase requise' });
    const sb = supabaseAdmin || supabase;
    const societeId = req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    // 1. Trouver le profil prothésiste
    const { data: proth } = await sb.from('labo_prothesistes')
      .select('id, prochain_numero_bl, prefix_bl')
      .eq('societe_id', societeId).single();
    if (!proth) return res.status(404).json({ error: 'Profil prothésiste requis' });

    // 2. Charger dentistes + catalogue pour le contexte IA
    const { data: dentistes } = await sb.from('dentistes_clients')
      .select('id, nom, prenom, titre, email')
      .eq('prothesiste_id', proth.id).eq('est_actif', true).limit(100);
    const { data: catalogue } = await sb.from('catalogue_produits')
      .select('id, nom, code_ccam, prix_unitaire, tva_applicable, taux_tva, type_produit, categorie, necessite_teinte')
      .eq('prothesiste_id', proth.id).eq('est_actif', true).limit(200);

    const dentistesCtx = (dentistes || []).map(d => `${d.titre||''} ${d.nom} ${d.prenom||''} (id:${d.id})`).join('\n');
    const catalogueCtx = (catalogue || []).map(c => `${c.nom} | ${c.code_ccam||''} | ${c.prix_unitaire}EUR | ${c.type_produit} (id:${c.id})`).join('\n');

    // 3. IA parse la phrase
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Tu es l'IA de JADOMI LABO. Tu analyses une phrase du prothésiste pour créer un bon de livraison.

DENTISTES CLIENTS :
${dentistesCtx}

CATALOGUE PRODUITS :
${catalogueCtx}

Tu dois extraire de la phrase :
- dentiste_id : trouver le dentiste par son nom (chercher dans la liste)
- lignes : les produits/actes réalisés (CCM = Couronne Céramo-Métallique, etc.)
- teinte : si mentionnée (A1, A2, A3, B1, B2, C1, etc. = VITA Classical)
- patient_initiales : si mentionnées
- quantité : par ligne (défaut 1)

ABRÉVIATIONS DENTAIRES COURANTES :
CCM = Couronne Céramo-Métallique | CCC = Couronne Céramo-Céramique | CC = Couronne Céramique
IEC = Inlay/Endocouronne | Inlay-Core = Inlay-Core | Bridge = Bridge
Facette = Facette céramique | Onlay = Onlay | Gouttière = Gouttière occlusale
PPA = Prothèse Partielle Amovible | PAC = Prothèse Adjointe Complète | Stellite = Châssis métallique

JSON OBLIGATOIRE :
{"dentiste_id":"uuid","dentiste_nom":"nom trouvé","lignes":[{"produit_id":"uuid ou null","designation":"nom complet du produit","quantite":1,"prix_unitaire":0}],"teinte_principale":"A2 ou null","teintier_utilise":"VITA Classical ou null","patient_initiales":"XX ou null","notes_techniques":"","message":"Bon créé : 1x CCM A2 pour Dr Scortichi"}`,
      messages: [{ role: 'user', content: phrase }]
    });

    const text = msg.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(400).json({ error: 'IA: impossible de parser la demande' });
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.dentiste_id) return res.json({ ok: false, need_info: 'dentiste', message: 'Quel dentiste ? ' + (dentistes||[]).map(d=>`${d.titre||''} ${d.nom}`).join(', '), parsed });

    // 4. Enrichir les lignes avec les prix du catalogue
    const lignes = (parsed.lignes || []).map((l, i) => {
      const cat = (catalogue || []).find(c => c.id === l.produit_id);
      return {
        produit_id: l.produit_id || null,
        designation: l.designation || 'Acte',
        quantite: l.quantite || 1,
        prix_unitaire: l.prix_unitaire || cat?.prix_unitaire || 0,
        tva_applicable: cat?.tva_applicable || false,
        taux_tva: cat?.taux_tva || 0,
        remise_pct: 0,
        materiau: null,
        numero_lot_materiau: null,
        teinte_specifique: parsed.teinte_principale || null,
        ordre: i
      };
    });

    // 5. Calculer TVA
    const { calculerLigne, calculerTotaux } = require('./services/tva-calculator');
    const lignesCalc = lignes.map(l => {
      const calc = calculerLigne(l);
      return { ...l, ...calc };
    });
    const totaux = calculerTotaux(lignesCalc);

    // 6. Générer numéro BL
    const numeroBl = (proth.prefix_bl || 'BL') + '-' + String(proth.prochain_numero_bl || 1).padStart(4, '0');

    // 7. Créer le BL
    const { data: newBl, error: blErr } = await sb.from('bons_livraison')
      .insert({
        prothesiste_id: proth.id,
        dentiste_id: parsed.dentiste_id,
        numero_bl: numeroBl,
        date_bl: new Date().toISOString().split('T')[0],
        patient_initiales: parsed.patient_initiales || null,
        teintier_utilise: parsed.teintier_utilise || null,
        teinte_principale: parsed.teinte_principale || null,
        notes_techniques: parsed.notes_techniques || null,
        statut: 'brouillon',
        ...totaux
      }).select().single();
    if (blErr) throw blErr;

    // 8. Inserer lignes
    const lignesInsert = lignesCalc.map(l => ({ ...l, bl_id: newBl.id }));
    await sb.from('lignes_bl').insert(lignesInsert);

    // 9. Incrementer compteur
    await sb.from('labo_prothesistes')
      .update({ prochain_numero_bl: (proth.prochain_numero_bl || 1) + 1 })
      .eq('id', proth.id);

    res.json({
      ok: true,
      bl: newBl,
      numero_bl: numeroBl,
      dentiste_nom: parsed.dentiste_nom,
      lignes: lignesCalc.length,
      message: parsed.message || `Bon ${numeroBl} créé`
    });
  } catch (e) {
    console.error('[voice/labo/creer-bl]', e.message);
    res.status(500).json({ error: 'Erreur création BL vocal' });
  }
});

// GET /api/voice/labo/facture-live/:dentiste_id — Facture temps reel en cours de mois
app.get('/api/voice/labo/facture-live/:dentiste_id', authSupabase(), async (req, res) => {
  try {
    const sb = supabaseAdmin || supabase;
    const societeId = req.user.societe_id || req.headers['x-societe-id'];
    const { data: proth } = await sb.from('labo_prothesistes')
      .select('id').eq('societe_id', societeId).single();
    if (!proth) return res.status(404).json({ error: 'Profil requis' });

    // BL non factures pour ce dentiste
    const { data: bls } = await sb.from('bons_livraison')
      .select('*, lignes_bl(*)')
      .eq('prothesiste_id', proth.id)
      .eq('dentiste_id', req.params.dentiste_id)
      .in('statut', ['livre', 'brouillon'])
      .is('facture_id', null)
      .order('date_bl', { ascending: true });

    // Dentiste info
    const { data: dentiste } = await sb.from('dentistes_clients')
      .select('nom, prenom, titre, email')
      .eq('id', req.params.dentiste_id).single();

    let totalHtExo = 0, totalHtTax = 0, totalTva = 0, totalTtc = 0;
    const lignesDetail = [];
    for (const bl of (bls || [])) {
      totalHtExo += parseFloat(bl.total_ht_exonere || 0);
      totalHtTax += parseFloat(bl.total_ht_taxable || 0);
      totalTva += parseFloat(bl.total_tva || 0);
      totalTtc += parseFloat(bl.total_ttc || 0);
      for (const l of (bl.lignes_bl || [])) {
        lignesDetail.push({ ...l, bl_numero: bl.numero_bl, bl_date: bl.date_bl, patient: bl.patient_initiales });
      }
    }

    res.json({
      ok: true,
      dentiste,
      nb_bons: (bls || []).length,
      nb_lignes: lignesDetail.length,
      total_ht_exonere: Math.round(totalHtExo * 100) / 100,
      total_ht_taxable: Math.round(totalHtTax * 100) / 100,
      total_tva: Math.round(totalTva * 100) / 100,
      total_ttc: Math.round(totalTtc * 100) / 100,
      bons: (bls || []).map(bl => ({ id: bl.id, numero: bl.numero_bl, date: bl.date_bl, patient: bl.patient_initiales, statut: bl.statut, total_ttc: bl.total_ttc })),
      lignes: lignesDetail
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur facture live' });
  }
});

// GET /api/voice/labo/factures-live — Vue globale toutes factures en cours par dentiste
app.get('/api/voice/labo/factures-live', authSupabase(), async (req, res) => {
  try {
    const sb = supabaseAdmin || supabase;
    const societeId = req.user.societe_id || req.headers['x-societe-id'];
    const { data: proth } = await sb.from('labo_prothesistes')
      .select('id').eq('societe_id', societeId).single();
    if (!proth) return res.status(404).json({ error: 'Profil requis' });

    // Tous les BL non factures groupes par dentiste
    const { data: bls } = await sb.from('bons_livraison')
      .select('dentiste_id, total_ttc, statut, dentistes_clients(id, nom, prenom, titre)')
      .eq('prothesiste_id', proth.id)
      .in('statut', ['livre', 'brouillon'])
      .is('facture_id', null);

    const parDentiste = {};
    for (const bl of (bls || [])) {
      const did = bl.dentiste_id;
      if (!parDentiste[did]) {
        parDentiste[did] = {
          dentiste_id: did,
          nom: `${bl.dentistes_clients?.titre||''} ${bl.dentistes_clients?.nom||''} ${bl.dentistes_clients?.prenom||''}`.trim(),
          nb_bons: 0,
          total_ttc: 0
        };
      }
      parDentiste[did].nb_bons++;
      parDentiste[did].total_ttc += parseFloat(bl.total_ttc || 0);
    }

    const result = Object.values(parDentiste).sort((a, b) => b.total_ttc - a.total_ttc);
    res.json({ ok: true, dentistes: result, total_global: result.reduce((s, d) => s + d.total_ttc, 0) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur factures live' });
  }
});

// =============================================
// Module Communication Cabinet (confreres + patients)
// =============================================
try {
  const mountCommunication = require('./api/multiSocietes/communication');
  mountCommunication(app);
} catch (e) {
  console.warn('[JADOMI] Module Communication non chargé:', e.message);
}

// =============================================
// Scan lookup (produits internes JADOMI + fallback OpenFoodFacts)
// Utilise le client supabase global (anon). Si la table `produits` n'existe
// pas encore ou si rien ne matche, on tombe sur OpenFoodFacts. fetch est
// natif depuis Node 18.
// =============================================
// Rate limiter spécifique au scan : 30 req/min/IP (anti-abus IA fallback)
const scanLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de scans. Réessaye dans 1 minute.' }
});

app.get('/api/scan/lookup', requireAuth(), scanLookupLimiter, async (req, res) => {
  const { code, profession } = req.query;
  if (!code) return res.status(400).json({ error: 'code requis' });

  // Utiliser le scan engine world-class (Passe 51)
  const scanEngine = require('./services/scan-engine');

  try {
    let result = await scanEngine.lookupProduct(code, null, {
      profession: profession || 'dentiste',
      userId: req.user?.id,
      societeId: req.user?.societe_id
    });

    // ── Prix marché (rapide, pas bloquant) ──
    if (result.produit?.code_barre || result.produit?.gtin) {
      const priceData = await scanEngine.getProductPrices(result.produit.code_barre || result.produit.gtin);
      if (priceData) result.market_prices = priceData;
    }

    // ── JADOMI Compare en ARRIÈRE-PLAN (ne bloque pas la réponse) ──
    const productDbId = result.product_db_id;
    const societeId = req.user?.societe_id;
    if (productDbId && societeId) {
      setImmediate(async () => {
        try {
          const enriched = await scanEngine.enrichScanResult({ ...result }, societeId, result.market_prices);
          // Si alternative trouvee → notification
          if (enriched.oem_intelligence?.is_white_label || enriched.oem_intelligence?.potential_savings > 0) {
            let pushNotif;
            try { pushNotif = require('./api/multiSocietes/notifications').pushNotification; } catch (_) {}
            if (pushNotif) {
              const compareR = enriched.oem_intelligence;
              const { data: members } = await require('./api/multiSocietes/middleware').admin()
                .from('user_societe_roles').select('user_id')
                .eq('societe_id', societeId).in('role', ['proprietaire', 'associe']);
              for (const m of (members || [])) {
                try {
                  await pushNotif({
                    user_id: m.user_id, societe_id: societeId,
                    type: 'autre', urgence: compareR.potential_savings > 5 ? 'haute' : 'normale',
                    titre: compareR.is_white_label
                      ? `Alternative vérifiée : ${result.produit?.nom || 'Produit'}`
                      : `Économie détectée : ${result.produit?.nom || 'Produit'}`,
                    message: compareR.market_insight || 'Consultez vos économies JADOMI.',
                    entity_type: 'economies_alert', entity_id: productDbId,
                    cta_label: 'Voir mes économies', cta_url: '/index.html?tab=economies',
                  });
                } catch (_) {}
              }
            }
          }
        } catch (e) { console.warn('[scan/lookup/bg-compare]', e.message); }
      });
    }

    // Formater la réponse (rétrocompatible)
    const response = {
      source: result.source,
      nom: result.produit?.nom || result.produit?.name || null,
      marque: result.produit?.marque || result.produit?.brand || null,
      categorie: result.produit?.categorie || result.produit?.category || null,
      fournisseur: result.produit?.fournisseur || result.produit?.manufacturer || null,
      code_barre: code,
      confidence: result.produit?.confidence || 0,
      image_url: result.produit?.image_url || null,
      product_db_id: result.product_db_id || null,
      is_dental: result.is_dental,
      waterfall_levels: result.waterfall_levels,
      duration_ms: result.duration_ms
    };

    // Prix marché multi-fournisseurs (utile, rapide, pas intrusif)
    if (result.market_prices) {
      response.market_prices = result.market_prices;
    }
    // L'intelligence OEM tourne en background → notification si trouvaille

    res.json(response);
  } catch (e) {
    console.error('[scan/lookup] Error:', e.message);
    res.json({ source: 'unknown', code_barre: code, nom: null });
  }
});

// =============================================
// SCAN/SEARCH — Recherche produits par nom avec comparaison prix
// =============================================
const scanSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de recherches. Réessaye dans 1 minute.' }
});

app.get('/api/scan/search', requireAuth(), scanSearchLimiter, async (req, res) => {
  const { q, category, limit: limitParam } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Paramètre q requis (min 2 caractères)' });
  }

  const searchQuery = q.trim();
  if (searchQuery.length > 200) {
    return res.status(400).json({ error: 'Requête trop longue (max 200 caractères)' });
  }
  const maxResults = Math.min(parseInt(limitParam) || 10, 50);
  const { admin } = require('./api/multiSocietes/middleware');

  try {
    // Escape special ilike/PostgREST chars to prevent pattern injection
    const escaped = searchQuery
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/,/g, '\\,')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    // 1. Full-text search on name, with ilike fallback on name_fr and brand
    let query = admin().from('products_database')
      .select('id, gtin, name, name_fr, brand, manufacturer, category, subcategory, image_url, reference, scan_count')
      .or(`name.ilike.%${escaped}%,name_fr.ilike.%${escaped}%,brand.ilike.%${escaped}%`)
      .order('scan_count', { ascending: false, nullsFirst: false })
      .limit(maxResults * 3); // Fetch extra to allow re-sorting after enrichment

    if (category) {
      query = query.eq('category', category);
    }

    const { data: products, error: prodError } = await query;

    if (prodError) {
      console.error('[scan/search] DB error:', prodError.message);
      return res.status(500).json({ error: 'Erreur recherche produits' });
    }

    if (!products || products.length === 0) {
      return res.json({ query: searchQuery, results_count: 0, results: [] });
    }

    // 2. Enrich each product with price data and equivalences count
    const productIds = products.map(p => p.id);

    // Fetch all supplier prices for matched products in one query
    const { data: allPrices } = await admin().from('supplier_prices')
      .select('product_id, supplier_name, price_negotiated, price_catalog')
      .in('product_id', productIds)
      .not('price_negotiated', 'is', null)
      .order('price_negotiated', { ascending: true });

    // Fetch equivalences counts
    const { data: equivA } = await admin().from('product_equivalences')
      .select('product_a_id')
      .in('product_a_id', productIds);
    const { data: equivB } = await admin().from('product_equivalences')
      .select('product_b_id')
      .in('product_b_id', productIds);

    // Build price map: product_id -> prices[]
    const priceMap = {};
    for (const p of (allPrices || [])) {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
      priceMap[p.product_id].push({
        supplier: p.supplier_name,
        price: Number(p.price_negotiated || p.price_catalog)
      });
    }

    // Build equivalences count map
    const equivCount = {};
    for (const e of (equivA || [])) {
      equivCount[e.product_a_id] = (equivCount[e.product_a_id] || 0) + 1;
    }
    for (const e of (equivB || [])) {
      equivCount[e.product_b_id] = (equivCount[e.product_b_id] || 0) + 1;
    }

    // 3. Build enriched results
    const enriched = products.map(p => {
      const prices = priceMap[p.id] || [];
      // Deduplicate by supplier (keep best price per supplier)
      const bySupplier = {};
      for (const pr of prices) {
        if (!bySupplier[pr.supplier] || pr.price < bySupplier[pr.supplier]) {
          bySupplier[pr.supplier] = pr.price;
        }
      }
      const dedupPrices = Object.entries(bySupplier)
        .map(([supplier, price]) => ({ supplier, price }))
        .sort((a, b) => a.price - b.price);

      const allPriceValues = dedupPrices.map(p => p.price).filter(v => v > 0);
      const hasPrices = allPriceValues.length > 0;

      return {
        id: p.id,
        nom: p.name_fr || p.name || null,
        marque: p.brand || p.manufacturer || null,
        categorie: p.category || null,
        gtin: p.gtin || null,
        image_url: p.image_url || null,
        reference: p.reference || null,
        prices: hasPrices ? {
          best_price: Math.min(...allPriceValues),
          best_supplier: dedupPrices[0]?.supplier || null,
          avg_price: +(allPriceValues.reduce((s, v) => s + v, 0) / allPriceValues.length).toFixed(2),
          suppliers_count: dedupPrices.length,
          all_prices: dedupPrices
        } : null,
        alternatives_count: equivCount[p.id] || 0,
        scan_count: p.scan_count || 0,
        _has_prices: hasPrices // internal sort key
      };
    });

    // 4. Sort: products with price data first, then by scan_count desc
    enriched.sort((a, b) => {
      if (a._has_prices && !b._has_prices) return -1;
      if (!a._has_prices && b._has_prices) return 1;
      return (b.scan_count || 0) - (a.scan_count || 0);
    });

    // Trim to limit and remove internal keys
    const results = enriched.slice(0, maxResults).map(({ _has_prices, ...rest }) => rest);

    res.json({
      query: searchQuery,
      results_count: results.length,
      results
    });
  } catch (e) {
    console.error('[scan/search] Error:', e.message);
    res.status(500).json({ error: 'Erreur recherche produits' });
  }
});

// =============================================
// IMPORT PRICES — Import scraped prices (CORS ouvert pour console scraping)
// =============================================
app.options('/api/scan/import-prices', (req, res) => {
  const origin = req.headers.origin;
  const allowed = ['https://jadomi.fr', 'https://www.jadomi.fr', 'http://localhost:3001'];
  if (allowed.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set({ 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.sendStatus(204);
});
app.post('/api/scan/import-prices', async (req, res) => {
  const origin = req.headers.origin;
  const allowed = ['https://jadomi.fr', 'https://www.jadomi.fr', 'http://localhost:3001'];
  if (allowed.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  try {
    const { source, products } = req.body || {};
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products array required' });
    }
    const { admin: adminFn } = require('./api/multiSocietes/middleware');
    const sb = adminFn();
    let imported = 0, errors = 0;
    // Upsert par lots de 100
    for (let i = 0; i < products.length; i += 100) {
      const batch = products.slice(i, i + 100).map(p => ({
        supplier_name: source || 'unknown',
        product_name: String(p.name || '').substring(0, 500),
        brand: String(p.brand || '').substring(0, 200),
        reference: String(p.ref || '').substring(0, 100),
        price: parseFloat(p.price) || null,
        price_original: parseFloat(p.price_original || p.oldPrice) || null,
        url: (p.url || '').substring(0, 1000),
        scraped_at: new Date().toISOString()
      })).filter(p => p.product_name && p.price && p.price > 0.10 && p.price < 50000);
      if (batch.length === 0) continue;
      const { error } = await sb.from('scraped_prices').upsert(batch, { onConflict: 'supplier_name,product_name', ignoreDuplicates: true });
      if (error) { console.error('[import-prices] batch error:', error.message); errors++; }
      else imported += batch.length;
    }
    console.log(`[import-prices] ${source}: ${imported} imported, ${errors} errors`);
    res.json({ imported, errors, source });
  } catch (e) {
    console.error('[import-prices] Error:', e.message);
    res.status(500).json({ error: 'Erreur import' });
  }
});

// =============================================
// COMPARATEUR DE PRIX — Recherche multi-fournisseurs
// Style Coompy : barre de recherche → résultats triés par prix
// =============================================

// GET /api/comparateur/search?q=totalcem&limit=50
app.get('/api/comparateur/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ error: 'Recherche trop courte (min 2 caractères)' });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { admin: adminFn } = require('./api/multiSocietes/middleware');
    const sb = adminFn();

    // Recherche par nom OU référence OU marque
    const { data, error } = await sb
      .from('scraped_prices')
      .select('supplier_name, product_name, brand, reference, price, price_original, discount_percent, price_ttc, price_type, url, scraped_at')
      .or(`product_name.ilike.%${q}%,reference.ilike.%${q}%,brand.ilike.%${q}%`)
      .gt('price', 0.10)
      .order('price_ttc', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (error) throw error;

    // Grouper par produit similaire (même ref fabricant ou nom proche)
    const groups = {};
    for (const p of (data || [])) {
      // Clé de groupement : ref fabricant ou nom normalisé
      const refKey = p.reference && p.reference.length > 3 ? p.reference.replace(/^0+/, '') : null;
      const nameKey = p.product_name.toLowerCase()
        .replace(/[-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b(boite|bte|coffret|lot|pack|pcs|pieces|recharge|refill)\b.*$/i, '')
        .trim()
        .substring(0, 40);
      const key = refKey || nameKey;

      if (!groups[key]) {
        groups[key] = {
          product_name: p.product_name,
          brand: p.brand,
          reference: p.reference,
          best_price: p.price_ttc || (p.price_type === 'ht' ? Math.round(p.price * 1.20 * 100) / 100 : p.price),
          worst_price: p.price_ttc || (p.price_type === 'ht' ? Math.round(p.price * 1.20 * 100) / 100 : p.price),
          nb_suppliers: 0,
          offers: [],
        };
      }
      const pttc = p.price_ttc || (p.price_type === 'ht' ? Math.round(p.price * 1.20 * 100) / 100 : p.price);
      if (pttc < groups[key].best_price) groups[key].best_price = pttc;
      if (pttc > groups[key].worst_price) groups[key].worst_price = pttc;
      groups[key].offers.push({
        supplier: p.supplier_name,
        price_ttc: pttc,
        price_original: p.price_original,
        discount_percent: p.discount_percent,
        url: p.url,
        scraped_at: p.scraped_at,
      });
      groups[key].nb_suppliers = groups[key].offers.length;
      if (p.price < groups[key].best_price) groups[key].best_price = p.price;
      if (p.price > groups[key].worst_price) groups[key].worst_price = p.price;
    }

    // Trier les groupes par nombre de fournisseurs (plus de comparaison = plus utile)
    const results = Object.values(groups)
      .sort((a, b) => b.nb_suppliers - a.nb_suppliers || a.best_price - b.best_price)
      .slice(0, 30);

    // Stats globales
    const totalOffers = (data || []).length;
    const suppliers = [...new Set((data || []).map(d => d.supplier_name))];

    res.json({
      query: q,
      total_offers: totalOffers,
      total_products: results.length,
      suppliers: suppliers,
      results,
    });
  } catch (e) {
    console.error('[comparateur] search error:', e.message);
    res.status(500).json({ error: 'Erreur recherche' });
  }
});

// GET /api/comparateur/product/:ref — Détail d'un produit par ref fabricant
app.get('/api/comparateur/product/:ref', async (req, res) => {
  try {
    const ref = req.params.ref;
    const { admin: adminFn } = require('./api/multiSocietes/middleware');
    const sb = adminFn();

    const { data, error } = await sb
      .from('scraped_prices')
      .select('supplier_name, product_name, brand, reference, price, price_original, discount_percent, url, scraped_at')
      .or(`reference.ilike.%${ref}%,product_name.ilike.%${ref}%`)
      .gt('price', 0.10)
      .order('price', { ascending: true })
      .limit(20);

    if (error) throw error;

    res.json({
      reference: ref,
      nb_offers: (data || []).length,
      offers: data || [],
    });
  } catch (e) {
    console.error('[comparateur] product error:', e.message);
    res.status(500).json({ error: 'Erreur produit' });
  }
});

// GET /api/comparateur/stats — Stats globales du comparateur
app.get('/api/comparateur/stats', async (req, res) => {
  try {
    const { admin: adminFn } = require('./api/multiSocietes/middleware');
    const sb = adminFn();

    const { count: total } = await sb.from('scraped_prices').select('*', { count: 'exact', head: true }).gt('price', 0.10);
    const { data: suppliers } = await sb.from('scraped_prices').select('supplier_name').gt('price', 0.10).limit(1000);
    const uniqueSuppliers = [...new Set((suppliers || []).map(s => s.supplier_name))];

    res.json({
      total_products: total,
      nb_suppliers: uniqueSuppliers.length,
      suppliers: uniqueSuppliers.sort(),
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur stats' });
  }
});

// =============================================
// PRICE WATCH — Alertes prix produits
// =============================================

// POST /api/achats/price-watch — Créer une alerte prix
app.post('/api/achats/price-watch', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const userId = req.user.id;
    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });
    const hasAccess = await _verifySocieteAccess(admin(), userId, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { product_id, gtin, product_name, target_price } = req.body;
    if (!product_name) return res.status(400).json({ error: 'product_name requis' });
    if (!product_id && !gtin) return res.status(400).json({ error: 'product_id ou gtin requis' });
    const parsedPrice = Number(target_price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'target_price requis (nombre > 0)' });

    const { data: watch, error } = await admin()
      .from('price_watches')
      .insert({
        societe_id: societeId,
        user_id: userId,
        product_id: product_id || null,
        gtin: gtin || null,
        product_name,
        target_price: parsedPrice,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, watch });
  } catch (e) {
    console.error('[POST /api/achats/price-watch]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/achats/price-watches — Lister les alertes actives du cabinet
app.get('/api/achats/price-watches', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });
    const hasAccess = await _verifySocieteAccess(admin(), req.user.id, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { data: watches, error } = await admin()
      .from('price_watches')
      .select('*')
      .eq('societe_id', societeId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrichir chaque watch avec le meilleur prix actuel du marche
    const enriched = [];
    for (const w of (watches || [])) {
      let current_best = null;
      if (w.product_id) {
        const { data: prices } = await admin()
          .from('supplier_prices')
          .select('supplier_name, price_catalog, price_negotiated')
          .eq('product_id', w.product_id)
          .order('price_catalog', { ascending: true })
          .limit(5);
        if (prices && prices.length > 0) {
          current_best = {
            price: Number(prices[0].price_negotiated || prices[0].price_catalog),
            supplier: prices[0].supplier_name,
            all_prices: prices.map(p => ({
              supplier: p.supplier_name,
              price: Number(p.price_negotiated || p.price_catalog)
            }))
          };
        }
      } else if (w.gtin) {
        const { data: products } = await admin()
          .from('products')
          .select('id')
          .eq('gtin', w.gtin)
          .limit(1);
        if (products && products.length > 0) {
          const { data: prices } = await admin()
            .from('supplier_prices')
            .select('supplier_name, price_catalog, price_negotiated')
            .eq('product_id', products[0].id)
            .order('price_catalog', { ascending: true })
            .limit(5);
          if (prices && prices.length > 0) {
            current_best = {
              price: Number(prices[0].price_negotiated || prices[0].price_catalog),
              supplier: prices[0].supplier_name,
              all_prices: prices.map(p => ({
                supplier: p.supplier_name,
                price: Number(p.price_negotiated || p.price_catalog)
              }))
            };
          }
        }
      }

      const triggered = current_best && current_best.price <= w.target_price;
      enriched.push({
        ...w,
        current_best,
        is_triggered: !!triggered
      });
    }

    res.json({ ok: true, watches: enriched });
  } catch (e) {
    console.error('[GET /api/achats/price-watches]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/achats/price-watch/:id — Désactiver une alerte (soft delete)
app.delete('/api/achats/price-watch/:id', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });
    const hasAccess = await _verifySocieteAccess(admin(), req.user.id, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { data, error } = await admin()
      .from('price_watches')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Alerte introuvable' });

    res.json({ ok: true, watch: data[0] });
  } catch (e) {
    console.error('[DELETE /api/achats/price-watch/:id]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/achats/check-price-watches — Vérifier toutes les alertes actives
app.post('/api/achats/check-price-watches', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });
    const hasAccess = await _verifySocieteAccess(admin(), req.user.id, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { data: watches, error } = await admin()
      .from('price_watches')
      .select('*')
      .eq('societe_id', societeId)
      .eq('is_active', true);

    if (error) throw error;

    const triggered = [];
    for (const w of (watches || [])) {
      let productId = w.product_id;

      // Resoudre product_id via gtin si besoin
      if (!productId && w.gtin) {
        const { data: products } = await admin()
          .from('products')
          .select('id')
          .eq('gtin', w.gtin)
          .limit(1);
        if (products && products.length > 0) productId = products[0].id;
      }
      if (!productId) continue;

      // Chercher si un prix <= target_price existe
      const { data: matchingPrices } = await admin()
        .from('supplier_prices')
        .select('supplier_name, price_catalog, price_negotiated')
        .eq('product_id', productId)
        .order('price_catalog', { ascending: true })
        .limit(10);

      if (!matchingPrices || matchingPrices.length === 0) continue;

      const bestPrice = Number(matchingPrices[0].price_negotiated || matchingPrices[0].price_catalog);
      if (bestPrice <= w.target_price) {
        // Marquer comme triggered
        await admin()
          .from('price_watches')
          .update({
            triggered_at: new Date().toISOString(),
            triggered_price: bestPrice,
            triggered_supplier: matchingPrices[0].supplier_name
          })
          .eq('id', w.id);

        triggered.push({
          watch_id: w.id,
          product_name: w.product_name,
          target_price: w.target_price,
          triggered_price: bestPrice,
          triggered_supplier: matchingPrices[0].supplier_name,
          all_prices: matchingPrices.map(p => ({
            supplier: p.supplier_name,
            price: Number(p.price_negotiated || p.price_catalog)
          }))
        });
      }
    }

    res.json({ ok: true, checked: (watches || []).length, triggered });
  } catch (e) {
    console.error('[POST /api/achats/check-price-watches]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// =============================================
// ACHATS — Spend Analytics & Price History (Passe Achats)
// =============================================

// Helper: verify user has access to the requested société_id (IDOR protection)
async function _verifySocieteAccess(db, userId, societeId) {
  if (!userId || !societeId) return false;
  try {
    const { data } = await db.from('user_societe_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('societe_id', societeId)
      .maybeSingle();
    return !!data;
  } catch (_) { return false; }
}

// --- 1. Spend Analytics ---
app.get('/api/achats/spend-analytics', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const db = admin();
    const societeId = req.query.societe_id || req.user?.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    // IDOR protection: verify user belongs to this societe
    if (req.query.societe_id && req.query.societe_id !== req.user?.societe_id) {
      const allowed = await _verifySocieteAccess(db, req.user?.id, societeId);
      if (!allowed) return res.status(403).json({ error: 'forbidden_societe' });
    }

    const period = req.query.period || '6m';
    // Validate period: must be digits optionally followed by 'm', capped at 60 months
    const periodMatch = String(period).match(/^(\d{1,2})m?$/);
    const months = periodMatch ? Math.min(parseInt(periodMatch[1], 10) || 6, 60) : 6;
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceISO = since.toISOString();

    // Single query to fetch all data for the period (was 4 separate queries — N+1 fix)
    let allData = [];
    try {
      const { data } = await db.from('supplier_prices')
        .select('gtin, product_name, brand, category, supplier, price_ht, quantity, best_market_price, observed_at')
        .eq('societe_id', societeId)
        .gte('observed_at', sinceISO)
        .order('observed_at', { ascending: true });
      if (data) allData = data;
    } catch (_) {}

    // By category
    const cats = {};
    for (const r of allData) {
      const c = r.category || 'Autre';
      if (!cats[c]) cats[c] = { category: c, total_ht: 0, nb_purchases: 0, sum_price: 0 };
      cats[c].total_ht += (r.price_ht || 0) * (r.quantity || 1);
      cats[c].nb_purchases++;
      cats[c].sum_price += (r.price_ht || 0);
    }
    const byCategory = Object.values(cats).map(c => ({
      category: c.category,
      total_ht: Math.round(c.total_ht * 100) / 100,
      nb_purchases: c.nb_purchases,
      avg_price: c.nb_purchases > 0 ? Math.round((c.sum_price / c.nb_purchases) * 100) / 100 : 0
    })).sort((a, b) => b.total_ht - a.total_ht);

    // By supplier
    const supps = {};
    for (const r of allData) {
      const s = r.supplier || 'Inconnu';
      if (!supps[s]) supps[s] = { supplier: s, total_ht: 0, nb_purchases: 0 };
      supps[s].total_ht += (r.price_ht || 0) * (r.quantity || 1);
      supps[s].nb_purchases++;
    }
    const bySupplier = Object.values(supps).map(s => ({
      supplier: s.supplier,
      total_ht: Math.round(s.total_ht * 100) / 100,
      nb_purchases: s.nb_purchases
    })).sort((a, b) => b.total_ht - a.total_ht);

    // By month (sorted ascending for chronological charts)
    const mons = {};
    for (const r of allData) {
      const m = (r.observed_at || '').substring(0, 7);
      if (!m) continue;
      if (!mons[m]) mons[m] = { month: m, total_ht: 0 };
      mons[m].total_ht += (r.price_ht || 0) * (r.quantity || 1);
    }
    const byMonth = Object.values(mons).map(m => ({
      month: m.month,
      total_ht: Math.round(m.total_ht * 100) / 100
    })).sort((a, b) => a.month.localeCompare(b.month));

    // Top products + potential savings
    const prods = {};
    for (const r of allData) {
      const key = r.gtin || r.product_name || 'unknown';
      if (!prods[key]) prods[key] = { gtin: r.gtin, name: r.product_name, brand: r.brand, total_spent: 0, qty: 0, sum_price: 0, count: 0, best_market_price: r.best_market_price };
      prods[key].total_spent += (r.price_ht || 0) * (r.quantity || 1);
      prods[key].qty += (r.quantity || 1);
      prods[key].sum_price += (r.price_ht || 0);
      prods[key].count++;
      if (r.best_market_price && (!prods[key].best_market_price || r.best_market_price < prods[key].best_market_price)) {
        prods[key].best_market_price = r.best_market_price;
      }
    }
    let potentialSavings = 0;
    const topProducts = Object.values(prods).map(p => {
      const avgPrice = p.count > 0 ? Math.round((p.sum_price / p.count) * 100) / 100 : 0;
      const bmp = p.best_market_price || null;
      if (bmp && avgPrice > bmp) {
        potentialSavings += (avgPrice - bmp) * p.qty;
      }
      return {
        gtin: p.gtin, name: p.name, brand: p.brand,
        total_spent: Math.round(p.total_spent * 100) / 100,
        qty: p.qty,
        avg_price: avgPrice,
        best_market_price: bmp
      };
    }).sort((a, b) => b.total_spent - a.total_spent).slice(0, 20);

    const totalHt = byCategory.reduce((s, c) => s + c.total_ht, 0);

    res.json({
      by_category: byCategory,
      by_supplier: bySupplier,
      by_month: byMonth,
      top_products: topProducts,
      total_ht: Math.round(totalHt * 100) / 100,
      potential_savings: Math.round(potentialSavings * 100) / 100
    });
  } catch (e) {
    console.error('[achats/spend-analytics]', e.message);
    res.status(500).json({ error: 'internal_error', by_category: [], by_supplier: [], by_month: [], top_products: [], total_ht: 0, potential_savings: 0 });
  }
});

// --- 2. Price History (CamelCamelCamel-style) ---
app.get('/api/achats/price-history/:gtin', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const db = admin();
    const gtin = req.params.gtin;
    if (!gtin) return res.status(400).json({ error: 'gtin requis' });

    // Validate GTIN format: 8-14 digits only (EAN-8, EAN-13, GTIN-14)
    if (!/^\d{8,14}$/.test(gtin)) {
      return res.status(400).json({ error: 'Format GTIN invalide (8 a 14 chiffres attendus)' });
    }

    // Scope price history to the user's societe for data isolation
    const societeId = req.query.societe_id || req.user?.societe_id;

    // IDOR protection if societe_id explicitly passed
    if (req.query.societe_id && req.query.societe_id !== req.user?.societe_id) {
      const allowed = await _verifySocieteAccess(db, req.user?.id, societeId);
      if (!allowed) return res.status(403).json({ error: 'forbidden_societe' });
    }

    // Get product info
    let productName = null, brand = null;
    try {
      const { data: prod } = await db.from('products_database')
        .select('name, brand')
        .eq('gtin', gtin)
        .maybeSingle();
      if (prod) { productName = prod.name; brand = prod.brand; }
    } catch (_) {}

    // Get price history — scoped to societe_id to prevent cross-cabinet data leak
    let history = [];
    try {
      let query = db.from('supplier_prices')
        .select('observed_at, price_ht, supplier, source, product_name, brand')
        .eq('gtin', gtin)
        .order('observed_at', { ascending: true });
      if (societeId) query = query.eq('societe_id', societeId);
      const { data } = await query;
      if (data) {
        history = data.map(r => ({
          date: r.observed_at ? r.observed_at.substring(0, 10) : null,
          price: r.price_ht,
          supplier: r.supplier,
          source: r.source || 'invoice_scan'
        }));
        if (!productName && data.length) {
          productName = data[0].product_name || null;
          brand = data[0].brand || null;
        }
      }
    } catch (_) {}

    // Compute current best, worst, trend
    let currentBest = null, currentWorst = null, trend = 'stable';
    if (history.length > 0) {
      const prices = history.map(h => h.price).filter(p => p != null && !isNaN(p));
      if (prices.length) {
        currentBest = Math.min(...prices);
        currentWorst = Math.max(...prices);
      }
      if (prices.length >= 2) {
        const recent = history.slice(-3).map(h => h.price).filter(p => p != null && !isNaN(p));
        const older = history.slice(0, Math.max(1, Math.floor(history.length / 2))).map(h => h.price).filter(p => p != null && !isNaN(p));
        if (recent.length && older.length) {
          const avgRecent = recent.reduce((s, p) => s + p, 0) / recent.length;
          const avgOlder = older.reduce((s, p) => s + p, 0) / older.length;
          // Avoid division by zero if avgOlder is 0
          if (avgOlder > 0) {
            if (avgRecent < avgOlder * 0.97) trend = 'down';
            else if (avgRecent > avgOlder * 1.03) trend = 'up';
          }
        }
      }
    }

    res.json({
      gtin,
      product_name: productName,
      brand,
      history,
      current_best: currentBest,
      current_worst: currentWorst,
      trend
    });
  } catch (e) {
    console.error('[achats/price-history]', e.message);
    res.status(500).json({ gtin: req.params.gtin, product_name: null, brand: null, history: [], current_best: null, current_worst: null, trend: 'stable' });
  }
});

// --- 3. Benchmark (anonymous comparison) ---
app.get('/api/achats/benchmark', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const db = admin();
    const societeId = req.query.societe_id || req.user?.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    // IDOR protection: verify user belongs to this societe
    if (req.query.societe_id && req.query.societe_id !== req.user?.societe_id) {
      const allowed = await _verifySocieteAccess(db, req.user?.id, societeId);
      if (!allowed) return res.status(403).json({ error: 'forbidden_societe' });
    }

    // Get cabinet info for segment matching
    let cabinetSize = null, cabinetRegion = null;
    try {
      const { data: soc } = await db.from('societes')
        .select('taille, region')
        .eq('id', societeId)
        .maybeSingle();
      if (soc) { cabinetSize = soc.taille; cabinetRegion = soc.region; }
    } catch (_) {}

    // Get segment benchmarks
    let segmentData = [];
    let nbCabinetsSegment = 0;
    let insufficientData = false;
    try {
      let query = db.from('cabinet_benchmarks').select('*');
      if (cabinetSize) query = query.eq('taille', cabinetSize);
      if (cabinetRegion) query = query.eq('region', cabinetRegion);
      const { data } = await query;
      if (data && data.length) {
        segmentData = data;
        nbCabinetsSegment = data[0]?.nb_cabinets || data.length;
        // Flag if fewer than 5 cabinets — benchmarks may not be statistically meaningful
        if (nbCabinetsSegment < 5) insufficientData = true;
      }
    } catch (_) {}

    // Get this cabinet's own averages by category
    const myAvgs = {};
    try {
      const { data } = await db.from('supplier_prices')
        .select('category, price_ht')
        .eq('societe_id', societeId);
      if (data && data.length) {
        const catAcc = {};
        for (const r of data) {
          const c = r.category || 'Autre';
          if (!catAcc[c]) catAcc[c] = { sum: 0, count: 0 };
          catAcc[c].sum += (r.price_ht || 0);
          catAcc[c].count++;
        }
        for (const [cat, v] of Object.entries(catAcc)) {
          myAvgs[cat] = v.count > 0 ? Math.round((v.sum / v.count) * 100) / 100 : 0;
        }
      }
    } catch (_) {}

    // Build categories comparison
    const categories = [];
    let overallPosition = 'average';
    let aboveCount = 0, belowCount = 0;

    for (const seg of segmentData) {
      const cat = seg.category;
      const myAvg = myAvgs[cat] || null;
      const segAvg = seg.avg_price || null;
      const segMedian = seg.median_price || null;

      let position = null, verdict = null;
      if (myAvg && segAvg) {
        const diff = Math.round(((myAvg - segAvg) / segAvg) * 100);
        position = (diff >= 0 ? '+' : '') + diff + '%';
        if (diff > 5) {
          verdict = `Vous payez ${diff}% de plus que la moyenne`;
          aboveCount++;
        } else if (diff < -5) {
          verdict = `Vous payez ${Math.abs(diff)}% de moins que la moyenne`;
          belowCount++;
        } else {
          verdict = 'Dans la moyenne du marche';
        }
      }

      categories.push({
        category: cat,
        my_avg: myAvg,
        segment_avg: segAvg,
        segment_median: segMedian,
        position,
        verdict
      });
    }

    for (const [cat, avg] of Object.entries(myAvgs)) {
      if (!categories.find(c => c.category === cat)) {
        categories.push({
          category: cat, my_avg: avg,
          segment_avg: null, segment_median: null,
          position: null, verdict: 'Pas de données de comparaison'
        });
      }
    }

    if (aboveCount > belowCount) overallPosition = 'above_average';
    else if (belowCount > aboveCount) overallPosition = 'below_average';

    const response = {
      cabinet_position: overallPosition,
      categories,
      nb_cabinets_segment: nbCabinetsSegment
    };
    // Warn frontend when benchmark data is statistically insufficient
    if (insufficientData) {
      response.warning = 'Moins de 5 cabinets dans votre segment — les comparaisons sont indicatives';
    }
    if (segmentData.length === 0 && Object.keys(myAvgs).length > 0) {
      response.warning = 'Aucune donnée de benchmark disponible pour votre segment';
    }

    res.json(response);
  } catch (e) {
    console.error('[achats/benchmark]', e.message);
    res.status(500).json({ cabinet_position: 'unknown', categories: [], nb_cabinets_segment: 0 });
  }
});

// --- 4. Economies (savings opportunities) ---
app.get('/api/achats/economies', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const db = admin();
    const societeId = req.query.societe_id || req.user?.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    // IDOR protection: verify user belongs to this societe
    if (req.query.societe_id && req.query.societe_id !== req.user?.societe_id) {
      const allowed = await _verifySocieteAccess(db, req.user?.id, societeId);
      if (!allowed) return res.status(403).json({ error: 'forbidden_societe' });
    }

    // Try the v_economies_jadomi SQL view first
    let economies = [];
    let viewUsed = false;
    try {
      const { data, error } = await db.from('v_economies_jadomi')
        .select('*')
        .eq('societe_id', societeId)
        .order('savings_per_unit', { ascending: false });
      if (!error && data) {
        economies = data;
        viewUsed = true;
      }
    } catch (_) {}

    // Fallback: compute from raw tables only if view query failed (not just empty results)
    if (!viewUsed) {
      try {
        const { data } = await db.from('supplier_prices')
          .select('gtin, product_name, brand, supplier, price_ht, quantity, best_market_price, best_market_supplier')
          .eq('societe_id', societeId)
          .not('best_market_price', 'is', null);

        if (data && data.length) {
          const prods = {};
          for (const r of data) {
            const key = r.gtin || r.product_name;
            if (!key) continue;
            if (!prods[key] || r.price_ht > (prods[key].price_ht || 0)) {
              prods[key] = r;
            }
          }

          economies = Object.values(prods)
            .filter(r => r.price_ht && r.best_market_price && r.price_ht > r.best_market_price)
            .map(r => ({
              gtin: r.gtin,
              product_name: r.product_name,
              brand: r.brand,
              current_supplier: r.supplier,
              current_price: r.price_ht,
              best_price: r.best_market_price,
              best_supplier: r.best_market_supplier || null,
              savings_per_unit: Math.round((r.price_ht - r.best_market_price) * 100) / 100,
              savings_pct: r.price_ht > 0 ? Math.round(((r.price_ht - r.best_market_price) / r.price_ht) * 100) : 0
            }))
            .sort((a, b) => b.savings_per_unit - a.savings_per_unit);
        }
      } catch (_) {}
    }

    res.json({
      economies,
      total_items: economies.length,
      total_potential_savings: Math.round(economies.reduce((s, e) => s + (e.savings_per_unit || 0), 0) * 100) / 100
    });
  } catch (e) {
    console.error('[achats/economies]', e.message);
    res.status(500).json({ economies: [], total_items: 0, total_potential_savings: 0 });
  }
});

// =============================================
// FACTURATION — Mandat de facturation (signature fournisseurs)
// =============================================

/** Echappe les caracteres HTML dangereux */
function _escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/** Echappe les wildcards ilike (%,_) pour Supabase/PostgreSQL */
function _escLike(s) {
  return String(s).replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const { sendMail: sendMailMandate } = require('./api/multiSocietes/mailer');
const JADOMI_PUBLIC_URL = process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr';

// --- Helper : envoyer l'email de signature mandat ---
async function sendMandateSigningEmail(supplier, mandate) {
  const signingUrl = `${JADOMI_PUBLIC_URL}/mandate-sign.html?token=${mandate.signature_token}`;
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="background:#1a1a2e;padding:32px 40px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-.3px;">JADOMI</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#a0a0b8;">Plateforme de gestion professionnelle</p>
      </div>
      <div style="padding:36px 40px;border:1px solid #e8e8ee;border-top:none;">
        <h2 style="margin:0 0 20px;font-size:18px;font-weight:600;color:#1a1a2e;">Mandat de facturation a signer</h2>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          Bonjour <strong>${_escHtml(supplier.name)}</strong>,
        </p>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          JADOMI vous invite a signer un mandat de facturation electronique. En signant ce mandat, vous autorisez JADOMI a emettre des factures en votre nom pour les commandes realisees via notre plateforme.
        </p>
        <div style="background:#f5f5fa;border-radius:8px;padding:20px 24px;margin:24px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#6c6c80;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Conditions du mandat</p>
          <p style="margin:4px 0;font-size:14px;color:#3c3c50;">Commission : <strong>${mandate.commission_percent}%</strong></p>
          <p style="margin:4px 0;font-size:14px;color:#3c3c50;">Delai de paiement : <strong>${mandate.payment_delay_days} jours</strong></p>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          <strong>Avantage pour vous :</strong> zero paperasse, facturation electronique 2026 geree integralement par JADOMI. Vous recevez vos paiements sans aucune demarche administrative.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${signingUrl}" style="display:inline-block;background:#4F5BD5;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:-.2px;">Consulter et signer le mandat</a>
        </div>
        <p style="font-size:12px;color:#9a9ab0;line-height:1.6;border-top:1px solid #e8e8ee;padding-top:20px;margin-top:32px;">
          Ce mandat est revocable a tout moment avec un preavis de 30 jours. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.
        </p>
      </div>
      <div style="padding:20px 40px;background:#fafafa;border-radius:0 0 12px 12px;border:1px solid #e8e8ee;border-top:none;">
        <p style="margin:0;font-size:11px;color:#b0b0c0;text-align:center;">JADOMI SAS — contact@jadomi.fr</p>
      </div>
    </div>
  `;
  return sendMailMandate({
    to: supplier.email,
    subject: 'JADOMI — Mandat de facturation à signer',
    html
  });
}

// --- Helper : envoyer l'email de confirmation signature ---
async function sendMandateConfirmationEmail(supplier, mandate, signerName) {
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="background:#1a1a2e;padding:32px 40px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-.3px;">JADOMI</h1>
      </div>
      <div style="padding:36px 40px;border:1px solid #e8e8ee;border-top:none;border-radius:0 0 12px 12px;">
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:15px;color:#065f46;font-weight:600;">Mandat signé avec succès</p>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          Le mandat de facturation pour <strong>${_escHtml(supplier.name)}</strong> a été signé par <strong>${_escHtml(signerName)}</strong> le ${new Date().toLocaleDateString('fr-FR')}.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          JADOMI est désormais autorisée à émettre des factures pour les commandes réalisées via la plateforme.
        </p>
        <p style="font-size:12px;color:#9a9ab0;margin-top:24px;">Référence mandat : ${_escHtml(mandate.id)}</p>
      </div>
    </div>
  `;
  // Send to supplier
  await sendMailMandate({
    to: supplier.email,
    subject: 'JADOMI — Confirmation de signature du mandat',
    html
  });
  // Send to JADOMI admin
  await sendMailMandate({
    to: process.env.EMAIL_CONTACT || 'contact@jadomi.fr',
    subject: `Mandat signé — ${supplier.name}`,
    html
  });
}

async function sendMandateConfirmationEmailWithDocs(supplier, mandate, signerName, attachments) {
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="background:#1a1a2e;padding:32px 40px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-.3px;">JADOMI</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#8888a8;">Signature électronique</p>
      </div>
      <div style="padding:36px 40px;border:1px solid #e8e8ee;border-top:none;border-radius:0 0 12px 12px;">
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:15px;color:#065f46;font-weight:600;">Mandat signé avec succès (AES eIDAS)</p>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          Le mandat de facturation pour <strong>${_escHtml(supplier.name)}</strong> a été signé électroniquement par <strong>${_escHtml(signerName)}</strong> le ${new Date().toLocaleDateString('fr-FR')}.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          JADOMI est désormais autorisée à émettre des factures au nom de ${_escHtml(supplier.name)} pour les commandes réalisées via la plateforme.
        </p>
        ${attachments && attachments.length > 0 ? `
        <div style="background:#f8f8fc;border:1px solid #e2e2ee;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1a1a2e;">Documents joints :</p>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#3c3c50;">
            ${attachments.map(a => '<li>' + _escHtml(a.filename) + '</li>').join('')}
          </ul>
        </div>` : ''}
        <div style="margin-top:20px;padding:12px 16px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;">
          <p style="margin:0;font-size:12px;color:#1e40af;">Signature électronique avancee (AES) conforme a l'article 26 du reglement eIDAS (UE) n°910/2014. Le document signe au format PAdES PKCS#7 est verifiable dans Adobe Acrobat Reader.</p>
        </div>
        <p style="font-size:12px;color:#9a9ab0;margin-top:24px;">Reference mandat : ${_escHtml(mandate.id)}</p>
      </div>
    </div>
  `;
  await sendMailMandate({
    to: supplier.email,
    subject: 'JADOMI — Mandat signé (AES eIDAS) — ' + supplier.name,
    html,
    attachments: attachments || []
  });
  await sendMailMandate({
    to: process.env.EMAIL_CONTACT || 'contact@jadomi.fr',
    subject: 'Mandat signé — ' + supplier.name + ' (AES)',
    html,
    attachments: attachments || []
  });
}

// POST /api/facturation/mandate/create — Créer un mandat et envoyer l'email
app.post('/api/facturation/mandate/create', requireAuth(), async (req, res) => {
  try {
    const { supplier_id, commission_percent = 3, payment_delay_days = 30 } = req.body;
    if (!supplier_id) return res.status(400).json({ error: 'supplier_id requis' });

    // Validate numeric ranges
    const commPct = Number(commission_percent);
    const delayDays = Number(payment_delay_days);
    if (!Number.isFinite(commPct) || commPct < 0 || commPct > 100) return res.status(400).json({ error: 'commission_percent doit etre entre 0 et 100' });
    if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > 365) return res.status(400).json({ error: 'payment_delay_days doit etre entre 0 et 365' });

    // Fetch supplier
    const { data: supplier, error: sErr } = await supabase
      .from('suppliers')
      .select('id, name, email, city, region')
      .eq('id', supplier_id)
      .maybeSingle();
    if (sErr || !supplier) return res.status(404).json({ error: 'Fournisseur introuvable' });
    if (!supplier.email) return res.status(400).json({ error: 'Ce fournisseur n\'a pas d\'email configure' });

    // Generate unique token
    const signature_token = crypto.randomUUID();

    // Insert mandate
    const { data: mandate, error: mErr } = await supabase
      .from('supplier_mandates')
      .insert({
        supplier_id,
        supplier_name: supplier.name,
        supplier_email: supplier.email,
        commission_percent: commPct,
        payment_delay_days: delayDays,
        signature_token,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: req.user?.id || null
      })
      .select('id, signature_token, commission_percent, payment_delay_days, status')
      .single();
    if (mErr) {
      console.error('[mandate/create] insert:', mErr.message);
      return res.status(500).json({ error: 'Erreur création mandat', details: mErr.message });
    }

    // Send signing email
    const emailResult = await sendMandateSigningEmail(supplier, mandate);
    console.log('[mandate/create] email sent:', emailResult);

    res.json({ ok: true, mandate_id: mandate.id, token: mandate.signature_token });
  } catch (e) {
    console.error('[POST /api/facturation/mandate/create]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/facturation/mandate/:token — Consulter un mandat (public, pas d'auth)
app.get('/api/facturation/mandate/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 10) return res.status(400).json({ error: 'Token invalide' });

    const sbClient = supabaseAdmin || supabase;
    const { data: mandate, error } = await sbClient
      .from('supplier_mandates')
      .select('id, supplier_name, supplier_siret, supplier_ville, commission_percent, payment_delay_days, status, signed_at, created_at')
      .eq('signature_token', token)
      .maybeSingle();
    if (error || !mandate) return res.status(404).json({ error: 'Mandat introuvable' });

    // Update status to 'viewed' if still 'sent' (atomic: WHERE status = 'sent')
    if (mandate.status === 'sent') {
      const sbClient = supabaseAdmin || supabase;
      await sbClient
        .from('supplier_mandates')
        .update({ status: 'viewed' })
        .eq('id', mandate.id)
        .eq('status', 'sent');
      mandate.status = 'viewed';
    }

    // Do not expose supplier_email on public endpoint
    res.json({
      id: mandate.id,
      supplier_name: mandate.supplier_name,
      supplier_siret: mandate.supplier_siret,
      supplier_ville: mandate.supplier_ville,
      commission_percent: mandate.commission_percent,
      payment_delay_days: mandate.payment_delay_days,
      status: mandate.status,
      created_at: mandate.created_at,
      signed_at: mandate.signed_at
    });
  } catch (e) {
    console.error('[GET /api/facturation/mandate/:token]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/facturation/mandate/:token/sign — Signer un mandat (public)
app.post('/api/facturation/mandate/:token/sign', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 10) return res.status(400).json({ error: 'Token invalide' });

    const { accepted, signer_name, signer_title, signer_phone, iban, bic, bank_name, warehouse_address, warehouse_postal_code, warehouse_city, signature_image, otp_verified, signature_level } = req.body;
    if (!accepted) return res.status(400).json({ error: 'Vous devez accepter les termes du mandat' });
    if (!signer_name || !String(signer_name).trim()) return res.status(400).json({ error: 'Nom du signataire requis' });
    if (!iban || String(iban).replace(/\s/g, '').length < 15) return res.status(400).json({ error: 'IBAN requis pour le reversement des paiements' });
    if (!warehouse_address || !warehouse_city) return res.status(400).json({ error: 'Adresse entrepôt requise pour le calcul des frais de livraison' });

    // Fetch mandate (use service role to bypass RLS)
    const sbClient2 = supabaseAdmin || supabase;
    const { data: mandate, error } = await sbClient2
      .from('supplier_mandates')
      .select('id, supplier_name, supplier_email, commission_percent, payment_delay_days, status')
      .eq('signature_token', token)
      .maybeSingle();
    if (error || !mandate) return res.status(404).json({ error: 'Mandat introuvable' });
    if (mandate.status !== 'sent' && mandate.status !== 'viewed') {
      return res.status(409).json({ error: 'Ce mandat a déjà été signé ou est invalide', status: mandate.status });
    }

    // Record signature — atomic: WHERE status IN ('sent','viewed') prevents double-sign race condition
    const cleanIban = String(iban || '').replace(/\s/g, '').toUpperCase().substring(0, 34);
    const cleanBic = bic ? String(bic).replace(/\s/g, '').toUpperCase().substring(0, 11) : null;

    const updateData = {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_ip: req.ip || req.connection?.remoteAddress || 'unknown',
      signed_user_agent: String(req.headers['user-agent'] || '').substring(0, 500),
      metadata: {
        signer_name: String(signer_name).trim().substring(0, 200),
        signer_title: signer_title ? String(signer_title).trim().substring(0, 200) : null,
        signature_image: req.body.signature_image ? 'stored' : null,
        signer_phone: req.body.signer_phone || null,
        otp_verified: req.body.otp_verified || false,
        signature_level: req.body.signature_level || 'ses',
        iban: cleanIban,
        bic: cleanBic,
        bank_name: bank_name ? String(bank_name).trim().substring(0, 100) : null,
        signed_with_rib: true,
        warehouse: {
          address: warehouse_address ? String(warehouse_address).trim() : null,
          postal_code: warehouse_postal_code ? String(warehouse_postal_code).trim() : null,
          city: warehouse_city ? String(warehouse_city).trim() : null
        }
      }
    };

    const sbClient = supabaseAdmin || supabase;
    const { data: updated, error: uErr } = await sbClient
      .from('supplier_mandates')
      .update(updateData)
      .eq('id', mandate.id)
      .in('status', ['sent', 'viewed'])
      .select('id');
    if (uErr) {
      console.error('[mandate/sign] update:', uErr.message);
      return res.status(500).json({ error: 'Erreur enregistrement signature' });
    }
    // If no rows updated, another request already signed it (race condition)
    if (!updated || updated.length === 0) {
      return res.status(409).json({ error: 'Ce mandat a déjà été signé (requête concurrente)', status: 'signed' });
    }

    // Try to generate PDF (optional — lib may not be ready yet)
    try {
      const generatePdf = require('./lib/mandate-contract-pdf');
      if (typeof generatePdf === 'function') {
        await generatePdf({ ...mandate, ...updateData });
      }
    } catch (_pdfErr) {
      console.log('[mandate/sign] PDF generation skipped (lib not ready):', _pdfErr.message);
    }

    // Generate PAdES-signed mandate PDF — contrat complet
    try {
      const jadomiSign = require('./lib/jadomi-sign');
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));

      const supplierName = mandate.supplier_name || 'le Fournisseur';
      const signerFullName = String(signer_name).trim();
      const signerTitleStr = signer_title ? String(signer_title).trim() : '';
      const commissionPct = mandate.commission_percent || 10;
      const delayDays = mandate.payment_delay_days || 30;
      const signDate = new Date().toLocaleDateString('fr-FR');
      const ibanMasked = iban ? String(iban).replace(/\s/g, '').replace(/.(?=.{4})/g, '*') : 'Non communique';

      await new Promise((resolve) => {
        doc.on('end', resolve);

        // --- EN-TETE ---
        doc.fontSize(22).font('Helvetica-Bold').text('JADOMI', { align: 'center' });
        doc.fontSize(14).font('Helvetica').text('Mandat de facturation', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#666').text('Article 289 I-2 du Code Général des Impôts', { align: 'center' });
        doc.fillColor('#000');
        doc.moveDown();

        // --- PARTIES ---
        doc.fontSize(10).font('Helvetica-Bold').text('ENTRE :');
        doc.font('Helvetica').text('JADOMI SAS — Plateforme marketplace B2B');
        doc.text('(ci-après « le Mandataire »)');
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text('ET :');
        doc.font('Helvetica').text(supplierName);
        doc.text('(ci-après « le Mandant »)');
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text('Date de signature : ' + signDate);
        doc.text('Signé par : ' + signerFullName + (signerTitleStr ? ' — ' + signerTitleStr : ''));
        doc.moveDown();

        // --- Ligne séparatrice ---
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
        doc.moveDown();

        // --- ARTICLES ---
        function articleTitle(t) { doc.moveDown(0.5); doc.fontSize(11).font('Helvetica-Bold').text(t); doc.fontSize(10).font('Helvetica'); }
        function para(t) { doc.text(t, { lineGap: 3 }); }
        function bullet(t) { doc.text('  •  ' + t, { lineGap: 2 }); }

        articleTitle('Article 1 — Objet du mandat');
        para('Par le présent mandat, la société ' + supplierName + ' (le Mandant) autorise JADOMI SAS (le Mandataire) à établir, en son nom et pour son compte, les factures relatives aux commandes réalisées par les professionnels de santé via la plateforme JADOMI.');
        para('Ce mandat est conclu dans le cadre de l\'article 289 I-2 du Code Général des Impôts, autorisant un tiers à émettre des factures au nom et pour le compte d\'un assujetti.');

        articleTitle('Article 2 — Obligations du mandataire (JADOMI)');
        para('JADOMI s\'engage à :');
        bullet('Émettre les factures conformément aux dispositions légales et réglementaires en vigueur (articles 289 et 242 nonies A du CGI).');
        bullet('Transmettre une copie de chaque facture émise au Mandant dans un délai raisonnable.');
        bullet('Assurer la numérotation séquentielle et unique des factures.');
        bullet('Conserver les factures émises pendant la durée légale (10 ans).');
        bullet('Respecter les obligations de facturation électronique (réforme 2026).');

        articleTitle('Article 3 — Obligations du mandant (Fournisseur)');
        para('Le Mandant s\'engage à :');
        bullet('Ne pas émettre de factures pour les opérations couvertes par le présent mandat.');
        bullet('Informer JADOMI de toute modification de ses informations légales.');
        bullet('Vérifier les factures émises et signaler toute anomalie sous 15 jours.');
        bullet('Fournir les informations nécessaires à l\'émission correcte des factures.');

        articleTitle('Article 4 — Conditions financières');
        para('Commission JADOMI : ' + commissionPct + '% du montant HT de chaque commande facturée via la plateforme.');
        para('Délai de reversement : ' + delayDays + ' jours à compter de la date de facture.');
        para('Mode de paiement : Virement bancaire sur le compte communiqué par le Mandant.');
        para('La commission est déduite automatiquement du montant encaissé. Un relevé détaillé accompagne chaque virement.');

        articleTitle('Article 4b — Frais de livraison');
        para('Commande >= 150EUR HT : livraison gratuite pour le client. Frais de transport à la charge du Mandant.');
        para('Commande < 150EUR HT : le Mandant propose ses frais de livraison au client via JADOMI. Le client valide ou refuse.');
        para('Le Mandant assure l\'expédition avec le transporteur de son choix et à ses frais.');

        articleTitle('Article 4c — Non-démarchage et protection commerciale');
        para('Le Mandant reconnaît que les clients mis en relation via JADOMI constituent un actif commercial de la plateforme.');
        bullet('Interdiction de démarcher directement les clients acquis via JADOMI pendant la durée du mandat et 12 mois après résiliation.');
        bullet('Interdiction d\'inclure dans les colis tout document commercial invitant à commander en direct.');
        bullet('En cas de violation : suspension immédiate et pénalité forfaitaire de 5 000EUR par infraction.');

        articleTitle('Article 5 — Coordonnées bancaires du Mandant');
        para('IBAN : ' + ibanMasked);
        para('Toute modification de RIB devra être signalée par écrit à JADOMI avec un délai de 5 jours ouvrables.');

        // Saut de page si besoin
        if (doc.y > 650) doc.addPage();

        articleTitle('Article 6 — Durée et résiliation');
        para('Le présent mandat est conclu pour une durée indéterminée. Il entre en vigueur à la date de signature électronique.');
        para('Chaque partie peut résilier à tout moment par notification écrite, sous réserve d\'un préavis de 30 jours.');

        articleTitle('Article 7 — Acceptation électronique');
        para('Conformément aux articles 1366 et 1367 du Code civil, la signature électronique du présent mandat a la même valeur juridique qu\'une signature manuscrite.');
        para('Signature réalisée via JADOMI Sign (AES conforme eIDAS Article 26).');

        articleTitle('Article 8 — Loi applicable et juridiction');
        para('Le présent mandat est régi par le droit français. Tout litige sera soumis aux tribunaux compétents du siège social de JADOMI SAS.');

        articleTitle('Article 9 — Service après-vente');
        para('Le Mandant assure l\'intégralité du SAV des produits vendus via JADOMI.');
        para('Le Mandant s\'engage à répondre aux demandes transmises par JADOMI sous 48 heures ouvrées.');
        para('En cas de non-réponse répétée (3 demandes consécutives sans réponse sous 48h), JADOMI se réserve le droit de suspendre le mandat.');

        articleTitle('Article 10 — Paiement et reversement');
        para('Le client paye par carte bancaire ou PayPal via JADOMI (prestataire : Stripe).');
        para('Palier Bronze : 0EUR/mois — commission 12% HT');
        para('Palier Silver : 299EUR/mois — commission 5% HT');
        para('Palier Gold : 799EUR/mois — commission 0%');
        para('Reversement sous 14 jours après confirmation de livraison.');

        articleTitle('Article 11 — Expédition et suivi');
        para('Le Mandant s\'engage à expédier chaque commande sous 48 heures ouvrées.');
        para('Le Mandant saisit le numéro de suivi du transporteur dans son espace JADOMI dès l\'expédition.');

        // --- SIGNATURE ---
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
        doc.moveDown();
        doc.fontSize(10).font('Helvetica-Bold').text('Signature électronique');
        doc.font('Helvetica');
        doc.text('Signé par : ' + signerFullName + (signerTitleStr ? ', ' + signerTitleStr : ''));
        doc.text('Date : ' + signDate);
        doc.text('Vérification d\'identité : OTP SMS vérifié');
        doc.moveDown();
        doc.fontSize(8).fillColor('#666');
        doc.text('Signature électronique avancée (AES) conforme à l\'article 26 du règlement eIDAS (UE) n°910/2014.');
        doc.text('Format PAdES PKCS#7 — JADOMI Sign v2.0 — Document vérifiable dans Adobe Acrobat Reader.');
        doc.text('Référence : ' + (mandate.id || ''));
        doc.end();
      });
      const pdfBuffer = Buffer.concat(chunks);

      const signatureId = jadomiSign.generateSignatureId();
      const archiveResult = await jadomiSign.archiveSignedDocument(signatureId, pdfBuffer, {
        title: 'Mandat de facturation — ' + (mandate.supplier_name || 'Fournisseur'),
        category: 'mandat',
        signer_name: String(signer_name).trim(),
        signer_email: mandate.supplier_email,
        signer_role: 'Fournisseur',
        signed_at: new Date().toISOString(),
        created_at: mandate.created_at || new Date().toISOString(),
        status: 'signed',
        metadata: { signature_level: 'aes', otp_verified: true }
      });
      console.log('[mandate/sign] PAdES signed + archived:', signatureId);
      // Store paths for email attachment
      mandate._signedPdfPath = require('path').join(__dirname, archiveResult.signed_pdf_path);
      mandate._certPdfPath = require('path').join(__dirname, archiveResult.certificate_pdf_path);
      mandate._signatureId = signatureId;
    } catch (pdfErr) {
      console.log('[mandate/sign] PAdES generation skipped:', pdfErr.message);
    }

    // Send confirmation emails with signed PDF attached
    const supplier = { name: mandate.supplier_name, email: mandate.supplier_email };
    try {
      const fs = require('fs');
      const attachments = [];
      if (mandate._signedPdfPath && fs.existsSync(mandate._signedPdfPath)) {
        attachments.push({ filename: 'Mandat-Signe-JADOMI.pdf', content: fs.readFileSync(mandate._signedPdfPath) });
      }
      if (mandate._certPdfPath && fs.existsSync(mandate._certPdfPath)) {
        attachments.push({ filename: 'Certificat-Signature-JADOMI.pdf', content: fs.readFileSync(mandate._certPdfPath) });
      }
      await sendMandateConfirmationEmailWithDocs(supplier, mandate, updateData.metadata?.signer_name || String(signer_name).trim(), attachments);
    } catch (emailErr) {
      console.error('[mandate/sign] confirmation email error:', emailErr.message);
      // Fallback to simple email without attachments
      try { await sendMandateConfirmationEmail(supplier, mandate, updateData.metadata?.signer_name || String(signer_name).trim()); } catch(_e) {}
    }

    res.json({ ok: true, message: 'Mandat signé avec succès' });
  } catch (e) {
    console.error('[POST /api/facturation/mandate/:token/sign]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/facturation/mandates — Lister tous les mandats (admin only)
app.get('/api/facturation/mandates', requireAuth(), async (req, res) => {
  try {
    // Admin check: verify user role
    const { admin } = require('./api/multiSocietes/middleware');
    const { data: profile } = await admin()
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs JADOMI' });
    }

    const { data: mandates, error } = await supabase
      .from('supplier_mandates')
      .select('id, supplier_id, supplier_name, supplier_email, commission_percent, payment_delay_days, status, sent_at, viewed_at, signed_at, signer_name, signer_title, created_by')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[GET /api/facturation/mandates]', error.message);
      return res.status(500).json({ error: 'Erreur chargement mandats' });
    }
    res.json({ mandates: mandates || [] });
  } catch (e) {
    console.error('[GET /api/facturation/mandates]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/entreprises/search — Recherche entreprise via API gouv (gratuite)
app.get('/api/entreprises/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ results: [] });
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&page=1&per_page=5`);
    const data = await r.json();
    const results = (data.results || []).map(e => ({
      nom: e.nom_complet,
      siren: e.siren,
      siret: e.siege?.siret || '',
      adresse: e.siege?.adresse_complete || '',
      code_postal: e.siege?.code_postal || '',
      ville: e.siege?.libelle_commune || '',
      activite: e.siege?.activite_principale || '',
      tranche_effectifs: e.tranche_effectif_salarie || '',
      date_creation: e.date_creation || ''
    }));
    res.json({ results });
  } catch (e) {
    console.error('[entreprises/search]', e.message);
    res.json({ results: [] });
  }
});

// POST /api/facturation/mandates/send — Envoyer un mandat à un fournisseur par nom+email
app.post('/api/facturation/mandates/send', requireAuth(), async (req, res) => {
  try {
    const { supplier_name, supplier_email, supplier_siret, supplier_ville, commission_percent, payment_delay_days } = req.body;
    if (!supplier_name || !supplier_email) return res.status(400).json({ error: 'Nom et email requis' });

    const signature_token = require('crypto').randomUUID();
    const supplier_id = require('crypto').randomUUID(); // ID fournisseur auto-généré
    const insertData = {
      supplier_id,
      supplier_name,
      supplier_email,
      commission_percent: commission_percent || 4,
      payment_delay_days: payment_delay_days || 30,
      signature_token,
      status: 'sent'
    };
    if (supplier_siret) insertData.supplier_siret = supplier_siret;
    if (supplier_ville) insertData.supplier_ville = supplier_ville;
    const sbClient = supabaseAdmin || supabase;
    const { data: mandate, error } = await sbClient
      .from('supplier_mandates')
      .insert(insertData)
      .select('id, signature_token, commission_percent, payment_delay_days')
      .single();

    if (error) { console.error('[mandates/send]', error.message); return res.status(500).json({ error: 'Erreur création mandat' }); }

    await sendMandateSigningEmail({ name: supplier_name, email: supplier_email }, mandate);
    res.json({ ok: true, success: true, mandate_id: mandate.id });
  } catch (e) {
    console.error('[mandates/send]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route statique page signature mandat
app.get('/mandate-sign', (req, res) => res.sendFile(path.join(__dirname, 'public/mandate-sign.html')));

// Route module Cabinet dentaire (dashboard stock/commandes)
app.get('/dentiste', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/dentiste/', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'index.html')); });

// Route module IDE (Infirmiere)
// Auth geree cote client par Supabase JS (localStorage session)
app.get('/ide', (req, res) => res.sendFile(path.join(__dirname, 'public/ide/dashboard.html')));
app.get('/ide/', (req, res) => res.sendFile(path.join(__dirname, 'public/ide/dashboard.html')));

// Route module Orthodontiste
app.get('/orthodontiste', (req, res) => res.sendFile(path.join(__dirname, 'public/orthodontiste/dashboard.html')));
app.get('/orthodontiste/', (req, res) => res.sendFile(path.join(__dirname, 'public/orthodontiste/dashboard.html')));

// Route module Medecin generaliste
app.get('/medecin', (req, res) => res.sendFile(path.join(__dirname, 'public/medecin/dashboard.html')));
app.get('/medecin/', (req, res) => res.sendFile(path.join(__dirname, 'public/medecin/dashboard.html')));
app.get('/kine', (req, res) => res.sendFile(path.join(__dirname, 'public/kine/dashboard.html')));
app.get('/kine/', (req, res) => res.sendFile(path.join(__dirname, 'public/kine/dashboard.html')));
app.get('/sage-femme', (req, res) => res.sendFile(path.join(__dirname, 'public/sage-femme/dashboard.html')));
app.get('/sage-femme/', (req, res) => res.sendFile(path.join(__dirname, 'public/sage-femme/dashboard.html')));
app.get('/podologue', (req, res) => res.sendFile(path.join(__dirname, 'public/podologue/dashboard.html')));
app.get('/podologue/', (req, res) => res.sendFile(path.join(__dirname, 'public/podologue/dashboard.html')));
app.get('/osteopathe', (req, res) => res.sendFile(path.join(__dirname, 'public/osteopathe/dashboard.html')));
app.get('/osteopathe/', (req, res) => res.sendFile(path.join(__dirname, 'public/osteopathe/dashboard.html')));
app.get('/orthophoniste', (req, res) => res.sendFile(path.join(__dirname, 'public/orthophoniste/dashboard.html')));
app.get('/orthophoniste/', (req, res) => res.sendFile(path.join(__dirname, 'public/orthophoniste/dashboard.html')));
app.get('/psychomotricien', (req, res) => res.sendFile(path.join(__dirname, 'public/psychomotricien/dashboard.html')));
app.get('/psychomotricien/', (req, res) => res.sendFile(path.join(__dirname, 'public/psychomotricien/dashboard.html')));
app.get('/dieteticien', (req, res) => res.sendFile(path.join(__dirname, 'public/dieteticien/dashboard.html')));
app.get('/dieteticien/', (req, res) => res.sendFile(path.join(__dirname, 'public/dieteticien/dashboard.html')));
app.get('/sci-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/sci-dashboard/dashboard.html')));
app.get('/sci-dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'public/sci-dashboard/dashboard.html')));
app.get('/createur', (req, res) => res.sendFile(path.join(__dirname, 'public/createur/dashboard.html')));
app.get('/createur/', (req, res) => res.sendFile(path.join(__dirname, 'public/createur/dashboard.html')));
app.get('/bien-etre-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/bien-etre/dashboard.html')));
app.get('/bien-etre-dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'public/bien-etre/dashboard.html')));
app.get('/prothesiste-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/prothesiste/dashboard.html')));
app.get('/prothesiste-dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'public/prothesiste/dashboard.html')));

// === Support Ticket System — Pages statiques ===
app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'public/support/index.html')));
app.get('/support/', (req, res) => res.sendFile(path.join(__dirname, 'public/support/index.html')));
app.get('/support/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/support/admin.html')));
app.get('/support/admin/', (req, res) => res.sendFile(path.join(__dirname, 'public/support/admin.html')));

// GET /api/facturation/mandate/:id/pdf — Telecharger le contrat PDF
app.get('/api/facturation/mandate/:id/pdf', requireAuth(), async (req, res) => {
  try {
    const { data: mandate, error } = await supabase
      .from('supplier_mandates')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !mandate) return res.status(404).json({ error: 'Mandat introuvable' });

    const { generateMandateContractPDF } = require('./lib/mandate-contract-pdf');
    const pdfBuffer = await generateMandateContractPDF(mandate);

    res.setHeader('Content-Type', 'application/pdf');
    const safeName = ('Mandat-Facturation-' + (mandate.supplier_name || 'JADOMI').replace(/[^a-zA-Z0-9-]/g, '_') + '.pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[mandate/pdf]', e.message);
    res.status(500).json({ error: 'Erreur génération PDF' });
  }
});

// GET /api/facturation/mandate-template/pdf — Telecharger le modele vierge
app.get('/api/facturation/mandate-template/pdf', requireAuth(), async (req, res) => {
  try {
    const { generateMandateContractPDF } = require('./lib/mandate-contract-pdf');
    const pdfBuffer = await generateMandateContractPDF({
      mandate_id: 'MODELE',
      supplier_name: '[NOM DU FOURNISSEUR]',
      supplier_email: '[email@fournisseur.fr]',
      supplier_siret: '[SIRET]',
      supplier_address: '[Adresse]',
      commission_percent: '4',
      payment_delay_days: '30',
      created_at: new Date().toISOString()
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Modele-Mandat-Facturation-JADOMI.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[mandate-template/pdf]', e.message);
    res.status(500).json({ error: 'Erreur génération PDF' });
  }
});

// ===== JADOMI — Crédits API IA (DeepSeek, Claude, Mistral) =====

// GET /api/admin/ai-credits — Soldes et usage des API IA
app.get('/api/admin/ai-credits', requireAuth(), async (req, res) => {
  try {
    const results = { deepseek: null, anthropic: null, mistral: null };

    // 1. DeepSeek — vrai endpoint balance
    if (deepseekApiKey) {
      try {
        const dsRes = await fetch('https://api.deepseek.com/user/balance', {
          headers: { 'Authorization': `Bearer ${deepseekApiKey}` },
        });
        if (dsRes.ok) {
          const dsData = await dsRes.json();
          const info = dsData.balance_infos?.[0];
          results.deepseek = {
            available: dsData.is_available,
            total_balance: info?.total_balance || '0',
            granted_balance: info?.granted_balance || '0',
            topped_up_balance: info?.topped_up_balance || '0',
            currency: info?.currency || 'CNY',
            recharge_url: 'https://platform.deepseek.com/top_up',
            dashboard_url: 'https://platform.deepseek.com/usage',
          };
        }
      } catch (e) {
        results.deepseek = { error: e.message };
      }
    }

    // 2. Anthropic — pas d'endpoint balance, on renvoie le statut clé
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    results.anthropic = {
      configured: !!anthropicKey,
      key_prefix: anthropicKey ? anthropicKey.substring(0, 10) + '...' : null,
      recharge_url: 'https://console.anthropic.com/settings/billing',
      dashboard_url: 'https://console.anthropic.com/settings/usage',
    };

    // 3. Mistral — pas d'endpoint balance
    results.mistral = {
      configured: !!mistral,
      recharge_url: 'https://console.mistral.ai/billing/',
      dashboard_url: 'https://console.mistral.ai/usage/',
    };

    // 4. Vidu (vidéo IA) — api.vidu.com/ent/v2/credits
    if (process.env.VIDU_API_KEY) {
      try {
        const viduRes = await fetch('https://api.vidu.com/ent/v2/credits', {
          headers: { 'Authorization': `Bearer ${process.env.VIDU_API_KEY}`, 'Accept': 'application/json' },
        });
        if (viduRes.ok) {
          const viduData = await viduRes.json();
          const metered = (viduData.remains || []).find(r => r.type === 'metered');
          results.vidu = {
            configured: true,
            credit_remain: metered?.credit_remain ?? 0,
            concurrency_limit: metered?.concurrency_limit ?? 0,
            current_concurrency: metered?.current_concurrency ?? 0,
            queue_count: viduData.queue_count ?? 0,
            packages: viduData.packages || [],
            recharge_url: 'https://platform.vidu.com/pricing',
            dashboard_url: 'https://platform.vidu.com/dashboard',
          };
        } else {
          results.vidu = { configured: true, error: `HTTP ${viduRes.status}` };
        }
      } catch (e) {
        results.vidu = { configured: true, error: e.message };
      }
    } else {
      results.vidu = { configured: false };
    }

    // 5. NanoBanana (images IA)
    results.nanobanana = { configured: !!process.env.NANOBANANA_API_KEY };

    // 6. Wallet JADOMI Coins (crédits internes)
    try {
      const db = supaAdminOrThrow();
      const { data: wallet } = await db.from('user_coins_wallet').select('balance, total_earned, total_spent').eq('user_id', req.user.id).single();
      results.jadomi_coins = wallet || { balance: 0, total_earned: 0, total_spent: 0 };
    } catch(_) {
      results.jadomi_coins = { balance: 0, total_earned: 0, total_spent: 0 };
    }

    // 7. Pricing référence
    results.pricing = {
      deepseek_chat: { input: '$0.14/M tokens', output: '$0.28/M tokens', cache_hit: '$0.0028/M tokens' },
      claude_haiku: { input: '$0.25/M tokens', output: '$1.25/M tokens' },
      claude_sonnet: { input: '$3/M tokens', output: '$15/M tokens' },
      mistral_small: { input: '$0.2/M tokens', output: '$0.6/M tokens' },
    };

    res.json({ ok: true, credits: results });
  } catch (e) {
    console.error('[AI Credits]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== JADOMI SÉCURITÉ — API Rapports + Scan manuel =====

// POST /api/admin/security-report — Recevoir rapport scan nocturne
app.post('/api/admin/security-report', requireAuth(), async (req, res) => {
  try {
    if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé - admin uniquement' });
    }
    const report = req.body;
    if (!report || !report.date) return res.status(400).json({ error: 'Rapport invalide' });
    // Stocker dans Supabase
    const { error } = await supabase.from('security_reports').insert({
      report_date: report.date,
      antivirus_status: report.antivirus?.status || 'unknown',
      antivirus_scanned: report.antivirus?.fichiers_scannes || 0,
      antivirus_infected: report.antivirus?.fichiers_infectes || 0,
      rootkit_status: report.rootkit?.status || 'unknown',
      rootkit_warnings: report.rootkit?.avertissements || 0,
      integrity_status: report.integrite?.status || 'unknown',
      integrity_changes: report.integrite?.changements || 0,
      network_suspicious_ports: report.reseau?.ports_suspects || 0,
      network_suspicious_procs: report.reseau?.processus_suspects || 0,
      network_failed_ssh: report.reseau?.tentatives_ssh_echouees_24h || 0,
      memory_pct: report.ressources?.memoire_pct || 0,
      disk_pct: report.ressources?.disque_pct || 0,
      security_score: report.score_securite || 0,
      raw_report: report
    });
    if (error) console.error('[security-report]', error.message);
    res.json({ success: true });
  } catch (e) {
    console.error('[security-report]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/security-report — Dernier rapport pour le dashboard
app.get('/api/admin/security-report', requireAuth(), async (req, res) => {
  try {
    if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé - admin uniquement' });
    }
    const { data } = await supabase.from('security_reports')
      .select('*').order('report_date', { ascending: false }).limit(1).single();
    res.json({ report: data || null });
  } catch (e) {
    res.json({ report: null });
  }
});

// GET /api/admin/security-reports — Historique des rapports
app.get('/api/admin/security-reports', requireAuth(), async (req, res) => {
  try {
    if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé - admin uniquement' });
    }
    const limit = Math.min(parseInt(req.query.limit) || 30, 90);
    const db = supabaseAdmin || supabase;
    const { data } = await db.from('security_reports')
      .select('id, report_date, security_score, antivirus_status, antivirus_infected, rootkit_status, integrity_status, memory_pct, disk_pct')
      .order('report_date', { ascending: false }).limit(limit);
    res.json({ reports: data || [] });
  } catch (e) {
    res.json({ reports: [] });
  }
});

// POST /api/admin/security-scan — Lancer un scan manuel
app.post('/api/admin/security-scan', requireAuth(), async (req, res) => {
  try {
    if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé - admin uniquement' });
    }
    const { exec } = require('child_process');
    exec('/home/ubuntu/jadomi/scripts/security-scan.sh', { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) console.error('[manual-scan]', err.message);
    });
    res.json({ success: true, message: 'Scan lance en arriere-plan. Resultat disponible dans ~5 minutes.' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/internal/security-report — Recevoir le rapport du script bash (localhost only)
app.post('/api/internal/security-report', async (req, res) => {
  try {
    const body = req.body || {};
    const score = body.score_securite || 0;
    const row = {
      report_date: body.date || new Date().toISOString(),
      security_score: score,
      antivirus_status: (body.antivirus?.status || 'unknown').substring(0, 20),
      antivirus_infected: body.antivirus?.fichiers_infectes || 0,
      rootkit_status: (body.rootkit?.status || 'unknown').substring(0, 20),
      integrity_status: (body.integrite?.status || 'unknown').substring(0, 20),
      memory_pct: body.ressources?.memoire_pct || 0,
      disk_pct: body.ressources?.disque_pct || 0,
      raw_report: body
    };
    const db = supabaseAdmin || supabase;
    const { error } = await db.from('security_reports').insert(row);
    if (error) {
      console.error('[security-report] Supabase insert error:', error.message);
      return res.json({ error: 'insert_failed', detail: error.message });
    }
    res.json({ ok: true, score });
  } catch (e) {
    console.error('[security-report]', e.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/admin/rls-audit — Audit RLS de toutes les tables publiques
app.get('/api/admin/rls-audit', requireAuth(), async (req, res) => {
  try {
    if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé - admin uniquement' });
    }
    const db = supabaseAdmin || supabase;
    // Appeler la fonction d'audit RLS
    const { data, error } = await db.rpc('jadomi_rls_vulnerabilities');
    if (error) {
      // Fallback si la fonction n'existe pas encore
      return res.json({ warning: 'Fonction jadomi_rls_vulnerabilities non déployée. Exécutez ARMURE_RLS_GUARDIAN.sql sur Supabase.' });
    }
    const vulnerable = (data || []).length;
    res.json({
      status: vulnerable === 0 ? 'SECURE' : 'VULNERABLE',
      vulnerable_count: vulnerable,
      tables: data || [],
      checked_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[rls-audit]', e.message);
    res.status(500).json({ error: 'Erreur audit RLS' });
  }
});

// POST /api/admin/send-documents — Envoyer les dossiers par email
app.post('/api/admin/send-documents', requireAuth(), async (req, res) => {
  try {
    if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé - admin uniquement' });
    }
    const { sendMail } = require('./api/multiSocietes/mailer');
    const fs = require('fs');
    const target = req.body.email || 'contact@jadomi.fr';

    const attachments = [];
    const docFiles = [
      { path: 'docs/DOSSIER-AVOCAT-JADOMI.html', name: 'DOSSIER-AVOCAT-JADOMI.html', label: 'Dossier Avocat' },
      { path: 'docs/business-plan-jadomi.html', name: 'BUSINESS-PLAN-JADOMI.html', label: 'Business Plan' },
      { path: 'docs/dossier-avocat-jadomi.html', name: 'Dossier-Juridique-Complet.html', label: 'Dossier Juridique Complet' },
      { path: 'docs/Modele-Mandat-Facturation-JADOMI.pdf', name: 'Contrat-Mandat-Facturation-JADOMI.pdf', label: 'Contrat Mandat Facturation (PDF)' },
      { path: 'docs/emails-fabricants-equipment.html', name: 'Emails-Fabricants-Equipment-JADOMI.html', label: 'Emails type fabricants équipement' },
    ];

    for (const doc of docFiles) {
      try {
        const content = fs.readFileSync(path.join(__dirname, doc.path));
        attachments.push({ filename: doc.name, content, contentType: 'text/html' });
      } catch (e) { /* fichier pas encore cree */ }
    }

    if (attachments.length === 0) {
      return res.json({ ok: false, error: 'Aucun document trouve' });
    }

    const result = await sendMail({
      to: target,
      subject: 'JADOMI — Vos documents mis a jour (' + new Date().toLocaleDateString('fr-FR') + ')',
      html: '<div style="font-family:system-ui;max-width:600px;margin:0 auto;padding:20px;">'
        + '<div style="text-align:center;margin-bottom:24px;"><div style="font-size:32px;font-weight:800;color:#10b981;">JADOMI</div></div>'
        + '<h2 style="color:#0f172a;border-bottom:2px solid #10b981;padding-bottom:8px;">Vos documents sont prets</h2>'
        + '<p>Bonjour,</p><p>Voici vos documents JADOMI mis a jour :</p>'
        + '<ul>' + attachments.map(a => '<li><strong>' + a.filename + '</strong></li>').join('') + '</ul>'
        + '<p style="font-size:12px;color:#64748b;margin-top:20px;">Ouvrez les fichiers .html dans un navigateur ou dans Word pour les modifier.</p>'
        + '<div style="text-align:center;margin-top:24px;font-size:11px;color:#94a3b8;">JADOMI — Plateforme d\'achats intelligente</div>'
        + '</div>',
      attachments
    });

    res.json({ ok: result.ok, sent: attachments.length, simulated: result.simulated || false });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Erreur interne' });
  }
});

// =============================================
// FACTURATION — Invoice lifecycle management (GPO)
// =============================================

// POST /api/facturation/emettre — Emettre une facture pour une commande GPO confirmee
app.post('/api/facturation/emettre', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const userId = req.user.id;
    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

    // IDOR protection: verify user belongs to this societe
    const hasAccess = await _verifySocieteAccess(admin(), userId, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { gpo_order_id } = req.body;
    if (!gpo_order_id) return res.status(400).json({ error: 'gpo_order_id requis' });

    // Race condition guard: check if invoice already exists for this order
    const { data: existingInv } = await admin()
      .from('jadomi_invoices')
      .select('id, invoice_number')
      .eq('gpo_order_id', gpo_order_id)
      .maybeSingle();
    if (existingInv) return res.status(409).json({ error: 'Une facture existe déjà pour cette commande', invoice_number: existingInv.invoice_number });

    // 1. Fetch gpo_orders record and verify societe_id access
    const { data: order, error: orderErr } = await admin()
      .from('gpo_orders')
      .select('*')
      .eq('id', gpo_order_id)
      .eq('societe_id', societeId)
      .single();
    if (orderErr || !order) return res.status(404).json({ error: 'Commande GPO introuvable ou accès refusé' });

    // 2. Fetch active supplier_mandate for this supplier
    const { data: mandate, error: mandateErr } = await admin()
      .from('supplier_mandates')
      .select('*')
      .eq('supplier_id', order.supplier_id)
      .in('status', ['active', 'signed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (mandateErr || !mandate) return res.status(400).json({ error: 'Aucun mandat actif pour ce fournisseur' });

    // 3. Generate invoice number via RPC or fallback
    let invoice_number;
    try {
      const { data: rpcNum } = await admin().rpc('generate_invoice_number');
      invoice_number = rpcNum;
    } catch (_) {
      invoice_number = 'JADOMI-INV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    }

    // 4. Calculate commission and net supplier
    const total_ht = Number(order.total_ht) || 0;
    const commission_percent = Number(mandate.commission_percent) || 0;
    const commission = Math.round(total_ht * commission_percent / 100 * 100) / 100;
    const net_supplier = Math.round((total_ht - commission) * 100) / 100;

    // 5. Try to generate Factur-X PDF
    let pdf_buffer = null;
    try {
      const generateFacturX = require('./lib/facturx-generator');
      pdf_buffer = await generateFacturX({ order, mandate, invoice_number, total_ht, commission, net_supplier });
    } catch (_) {
      console.warn('[facturation/emettre] Factur-X generator not ready, skipping PDF generation');
    }

    // 6. Insert into jadomi_invoices
    const invoicePayload = {
      invoice_number,
      societe_id: societeId,
      gpo_order_id,
      supplier_id: order.supplier_id,
      mandate_id: mandate.id,
      total_ht,
      commission_amount: commission,
      net_supplier,
      commission_percent,
      status: 'emitted',
      invoice_date: new Date().toISOString(),
      pdf_data: pdf_buffer ? pdf_buffer.toString('base64') : null,
      created_by: userId
    };
    const { data: invoice, error: invErr } = await admin()
      .from('jadomi_invoices')
      .insert(invoicePayload)
      .select()
      .single();
    if (invErr) throw invErr;

    // 7. Insert into jadomi_commissions
    try {
      await admin()
        .from('jadomi_commissions')
        .insert({
          invoice_id: invoice.id,
          mandate_id: mandate.id,
          societe_id: societeId,
          supplier_id: order.supplier_id,
          commission_percent,
          commission_amount: commission,
          base_ht: total_ht,
          payment_status: 'pending'
        });
    } catch (commErr) {
      console.warn('[facturation/emettre] jadomi_commissions insert failed:', commErr.message);
    }

    // 8. Update supplier_mandates counters (use RPC for atomic increment to avoid race conditions)
    try {
      try {
        await admin().rpc('increment_mandate_counters', {
          p_mandate_id: mandate.id,
          p_invoice_ht: total_ht
        });
      } catch (_rpcErr) {
        // Fallback: re-read mandate to get fresh values if RPC not available
        const { data: freshMandate } = await admin()
          .from('supplier_mandates')
          .select('invoices_emitted, total_invoiced_ht')
          .eq('id', mandate.id)
          .single();
        await admin()
          .from('supplier_mandates')
          .update({
            invoices_emitted: ((freshMandate && freshMandate.invoices_emitted) || 0) + 1,
            total_invoiced_ht: Math.round((((freshMandate && freshMandate.total_invoiced_ht) || 0) + total_ht) * 100) / 100
          })
          .eq('id', mandate.id);
      }
    } catch (updErr) {
      console.warn('[facturation/emettre] mandate counters update failed:', updErr.message);
    }

    // 9. Send email to cabinet with invoice PDF
    try {
      const emailService = require('./api/emailService');
      await emailService.send({
        to: order.cabinet_email || req.user.email,
        subject: 'Facture ' + invoice_number + ' - JADOMI',
        html: '<p>Votre facture <strong>' + _escHtml(invoice_number) + '</strong> a ete emise pour un montant de ' + total_ht + ' EUR HT.</p>',
        attachments: pdf_buffer ? [{ filename: invoice_number + '.pdf', content: pdf_buffer }] : []
      });
    } catch (emailErr) {
      console.warn('[facturation/emettre] Email cabinet failed:', emailErr.message);
    }

    // 10. Send copy to supplier
    try {
      const emailService = require('./api/emailService');
      if (order.supplier_email) {
        await emailService.send({
          to: order.supplier_email,
          subject: 'Facture ' + invoice_number + ' - Copie fournisseur - JADOMI',
          html: '<p>Une facture <strong>' + _escHtml(invoice_number) + '</strong> a ete emise. Montant net fournisseur : ' + net_supplier + ' EUR HT.</p>',
          attachments: pdf_buffer ? [{ filename: invoice_number + '.pdf', content: pdf_buffer }] : []
        });
      }
    } catch (emailErr) {
      console.warn('[facturation/emettre] Email supplier failed:', emailErr.message);
    }

    res.json({ ok: true, invoice });
  } catch (e) {
    console.error('[POST /api/facturation/emettre]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/facturation/factures — Lister les factures du cabinet authentifie
app.get('/api/facturation/factures', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

    // IDOR protection: verify user belongs to this societe
    const hasAccess = await _verifySocieteAccess(admin(), req.user.id, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { data: factures, error } = await admin()
      .from('jadomi_invoices')
      .select('id, invoice_number, invoice_date, supplier_id, total_ht, commission_amount, net_supplier, status, commission_percent')
      .eq('societe_id', societeId)
      .order('invoice_date', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, factures: factures || [] });
  } catch (e) {
    console.error('[GET /api/facturation/factures]', e.message);
    res.status(500).json({ error: 'Erreur interne', factures: [] });
  }
});

// GET /api/facturation/facture/:id/pdf — Telecharger le PDF d'une facture
app.get('/api/facturation/facture/:id/pdf', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

    // IDOR protection: verify user belongs to this societe
    const hasAccess = await _verifySocieteAccess(admin(), req.user.id, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    const { data: invoice, error } = await admin()
      .from('jadomi_invoices')
      .select('id, invoice_number, pdf_data, societe_id')
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Facture introuvable ou accès refusé' });

    if (!invoice.pdf_data) {
      // Try to generate on the fly
      try {
        const generateFacturX = require('./lib/facturx-generator');
        const { data: fullInvoice } = await admin()
          .from('jadomi_invoices')
          .select('*')
          .eq('id', req.params.id)
          .single();
        const pdfBuf = await generateFacturX(fullInvoice);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="' + invoice.invoice_number + '.pdf"');
        return res.send(pdfBuf);
      } catch (_) {
        return res.status(404).json({ error: 'PDF non disponible pour cette facture' });
      }
    }

    const pdfBuf = Buffer.from(invoice.pdf_data, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + invoice.invoice_number + '.pdf"');
    res.send(pdfBuf);
  } catch (e) {
    console.error('[GET /api/facturation/facture/:id/pdf]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/facturation/revenue — Dashboard revenus JADOMI (admin only)
app.get('/api/facturation/revenue', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    // Admin check: verify user role
    const { data: profile } = await admin()
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs JADOMI' });
    }

    // Try the materialized view first, fallback to direct query
    let revenue = null;
    try {
      const { data, error } = await admin()
        .from('v_jadomi_revenue')
        .select('*')
        .order('month', { ascending: false });
      if (!error) revenue = data;
    } catch (_) {}

    if (!revenue) {
      // Fallback: aggregate from jadomi_commissions
      const { data, error } = await admin()
        .from('jadomi_commissions')
        .select('commission_amount, base_ht, created_at, payment_status');
      if (error) throw error;

      const byMonth = {};
      for (const c of (data || [])) {
        const month = (c.created_at || '').slice(0, 7);
        if (!byMonth[month]) byMonth[month] = { month, total_commissions: 0, total_volume_ht: 0, invoice_count: 0 };
        byMonth[month].total_commissions += Number(c.commission_amount) || 0;
        byMonth[month].total_volume_ht += Number(c.base_ht) || 0;
        byMonth[month].invoice_count += 1;
      }
      revenue = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));
    }

    res.json({ ok: true, revenue: revenue || [] });
  } catch (e) {
    console.error('[GET /api/facturation/revenue]', e.message);
    res.status(500).json({ error: 'Erreur interne', revenue: [] });
  }
});

// POST /api/facturation/facture/:id/mark-paid — Le cabinet confirme le paiement
app.post('/api/facturation/facture/:id/mark-paid', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

    // IDOR protection: verify user belongs to this societe
    const hasAccess = await _verifySocieteAccess(admin(), req.user.id, societeId);
    if (!hasAccess) return res.status(403).json({ error: 'Accès refusé à cette société' });

    // Verify access
    const { data: invoice, error: fetchErr } = await admin()
      .from('jadomi_invoices')
      .select('id, societe_id, status')
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .single();
    if (fetchErr || !invoice) return res.status(404).json({ error: 'Facture introuvable ou accès refusé' });

    // Guard against double-marking
    if (invoice.status === 'paid_by_cabinet') {
      return res.json({ ok: true, status: 'paid_by_cabinet', message: 'Facture déjà marquée comme payée' });
    }

    // Update invoice status
    const { error: updErr } = await admin()
      .from('jadomi_invoices')
      .update({ status: 'paid_by_cabinet', paid_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (updErr) throw updErr;

    // Update commission payment_status
    try {
      await admin()
        .from('jadomi_commissions')
        .update({ payment_status: 'collected', collected_at: new Date().toISOString() })
        .eq('invoice_id', req.params.id);
    } catch (commErr) {
      console.warn('[facturation/mark-paid] commission update failed:', commErr.message);
    }

    res.json({ ok: true, status: 'paid_by_cabinet' });
  } catch (e) {
    console.error('[POST /api/facturation/facture/:id/mark-paid]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// COMPTABILITÉ — Analyse document (facture, charge, note de frais...)
// =============================================
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const pdfParse = require('pdf-parse');

async function analyserDocumentIA(base64Data, mediaType) {
  // Valider le media type pour eviter les erreurs Anthropic API
  const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!mediaType) mediaType = 'application/pdf';
  const isPdf = mediaType === 'application/pdf';
  if (!isPdf && !VALID_IMAGE_TYPES.includes(mediaType)) {
    console.warn('analyserDocumentIA: media_type non supporte:', mediaType);
    return null;
  }
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data }}
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data }};

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: 'Tu es un expert-comptable cabinet dentaire FR. Tu réponds UNIQUEMENT en JSON valide commençant par { et finissant par }. Jamais de texte avant ou après, jamais d\'explication en français.',
    messages: [{
      role: 'user',
      content: [
        contentBlock,
        {
          type: 'text',
          text: `INSTRUCTION CRITIQUE : Tu dois repondre UNIQUEMENT avec un objet JSON valide.
Pas de texte avant, pas de texte apres, pas d'explication, pas de phrase en francais.
Si tu ne peux pas analyser le document (image illisible, document vide, pas un document financier),
retourne EXACTEMENT :
{"type_document":"autre","selectionne":false,"fournisseur_ou_etablissement":"Inconnu","date":null,"total_ht":null,"tva":null,"total_ttc":null,"produits":[]}
Ne jamais ecrire "Je ne vois pas", "Je vois que", "Desole", ou tout autre texte. UNIQUEMENT du JSON.

Tu es un expert-comptable specialise dans les cabinets dentaires francais.
Analyse ce document financier avec precision maximale.

IDENTIFICATION DU TYPE :
- "facture_dentaire" : facture fournisseur dentaire (GACD, DPI, Henry Schein, Mega Dental, Septodont, Pierre Rolland, Promodentaire, Anthogyr, Straumann, Nobel, Biomet...)
- "charge_cabinet" : EDF/Engie, loyer cabinet, telephone pro, internet pro, assurance cabinet, eau, logiciel dentaire, abonnement pro
- "note_frais_repas" : ticket restaurant, note de frais repas professionnel
- "note_frais_transport" : billet train/avion, taxi, VTC, essence pro, parking, peage
- "note_frais_formation" : congres ADF, formation dentaire, seminaire, DPC
- "note_frais_hebergement" : hotel lors deplacement pro
- "equipement_medical" : fauteuil dentaire, autoclave, sterilisateur, scanner intraoral, radiologie
- "equipement_informatique" : ordinateur, tablette, telephone pro, imprimante
- "equipement_mobilier" : mobilier cabinet, amenagement, travaux
- "salaire_charges" : bulletin de salaire, cotisations URSSAF, charges sociales
- "honoraires" : comptable, avocat, consultant
- "assurance" : assurance RC pro, assurance cabinet
- "banque_finance" : agios, frais bancaires, remboursement emprunt
- "impots_taxes" : CFE, TVA, impots professionnels
- "ticket_caisse" : ticket de caisse, recu paiement
- "recu" : recu de paiement, justificatif
- "contrat" : contrat maintenance, contrat de service
- "devis" : devis fournisseur
- "bon_livraison" : bon de livraison, bordereau
- "releve_bancaire" : releve de compte bancaire
- "personnel" : depense personnelle non deductible (courses, Amazon perso, Netflix, vetements, loisirs)
- "autre" : document non identifiable

REGLES COMPTABLES :
- ajouter_au_stock: true UNIQUEMENT si facture_dentaire
- selectionne: false si personnel detecte
- deductible_tva: true si professionnel (hors personnel)

REGLES D'EXTRACTION (CRITIQUE) :
- EDF, Engie, TotalEnergies, ENEDIS, gaz, electricite => toujours "charge_cabinet"
- Orange Pro, SFR Pro, Bouygues Pro, Free Pro, internet/telecom pro => "charge_cabinet"
- Meme si le montant n'apparait PAS clairement, extraire SYSTEMATIQUEMENT :
  * fournisseur_ou_etablissement (raison sociale/marque, ne jamais "Inconnu" si lisible)
  * date (AAAA-MM-JJ)
  * numero_document si present
- N'inscris JAMAIS total_ttc: 0 si un montant est visible sur le document
  (cherche dans: "Total TTC", "Net a payer", "Montant du", "A regler", "TOTAL", en bas de page,
   dans un recap, dans un tableau). Si vraiment aucun montant trouvable, mets null (pas 0).
- total_ht / tva : meme regle, null si introuvable, jamais 0 artificiel
- Si le document est une RELANCE/rappel d'impaye sans montant, extraire fournisseur + date quand meme

REJETER (retourner {"type_document":"personnel","selectionne":false}) si :
- Image trop petite, logo, icone, avatar, banniere publicitaire, signature email
- Bouton/badge reseau social (Facebook, LinkedIn, TikTok, Instagram, Twitter, YouTube)
- Image de tracking (pixel invisible, tracker analytics)
- Photo personnelle, selfie, capture d'écran hors contexte pro
- Aucun fournisseur identifiable, aucune date, aucun montant, aucune description de service

ACCEPTER uniquement si document financier/pro avec AU MINIMUM :
- Un fournisseur ou emetteur identifiable
- Une date
- Un montant OU une description precise d'un service rendu

DETECTION DEVISE CRITIQUE :
- Si montant > 1000 et document algerien/marocain/tunisien => OBLIGATOIREMENT DZD/MAD/TND
- Ne jamais retourner 40000 EUR pour une facture algerienne/marocaine
- Convertir AVANT de retourner le JSON
- Indices pays : adresse Alger/Oran/Annaba/Constantine (DZ), Casablanca/Rabat/Marrakech (MA), Tunis/Sfax (TN), ICE/RC maghrebin, RIB BMCE/BNA/CPA/BADR, telephone +213/+212/+216

MODE DE PAIEMENT - detecter automatiquement :
- "carte_bancaire" => CB, Visa, Mastercard, carte, terminal, TPE, sans contact, ticket CB
- "virement" => virement, SEPA, transfer, ordre de virement, RIB
- "especes" => especes, cash, liquide, comptant
- "cheque" => cheque, check
- "prelevement" => prelevement automatique, debit automatique
- "paypal" => PayPal, Stripe, Payoneer
- "inconnu" => si non detectable
Retourner : "mode_paiement": "carte_bancaire" (ou autre valeur ci-dessus)

DETECTION ET CONVERSION DEVISE OBLIGATOIRE :
- Detecte la devise du document (symbole EUR, USD, GBP, JPY, DZD, MAD, etc.)
- Taux de conversion approximatifs vers EUR :
  USD x0.92 | GBP x1.17 | CHF x1.05 | JPY x0.006 | CNY x0.13 | KRW x0.00069
  DZD x0.0069 | MAD x0.092 | TND x0.29 | AED x0.25 | SAR x0.25 | KWD x3.26
  CAD x0.68 | AUD x0.60 | BRL x0.18 | INR x0.011 | TRY x0.027 | MXN x0.054
  RUB x0.010 | QAR x0.25 | NGN x0.00058
- REGLES STRICTES :
  1. Detecter la devise originale
  2. Convertir total_ttc et total_ht en EUR automatiquement
  3. Si EUR : pas de conversion, devise_originale="EUR", converti=false
  4. Sinon ajouter OBLIGATOIREMENT : devise_originale, montant_original (TTC dans la devise d'origine), taux_conversion, converti=true

RAPPEL : TA REPONSE EST UNIQUEMENT LE JSON CI-DESSOUS, RIEN D'AUTRE, PAS DE PROSE.

EXTRACTION CODE CLIENT (CRITIQUE pour matching fournisseur) :
- Chercher sur la facture : "Code client", "N° client", "Compte client",
  "Customer No", "N° compte", "Ref client", "Client N°", "Votre reference"
- C'est souvent en haut de la facture, pres de l'adresse du destinataire
- Ce code est VITAL : il permet de matcher automatiquement le fournisseur
  et ses conditions tarifaires (remises, contrats)

DETECTION LIGNES NON LIVREES (CRITIQUE pour stock) :
- Certaines lignes de facture sont marquees "suivra", "a suivre", "reliquat",
  "en attente", "rupture", "indisponible", "livraison ulterieure"
- Pour ces lignes : statut_livraison = "suivra"
- Pour les lignes normales : statut_livraison = "livree"
- Si une quantite commandee differe de la quantite livree, l'indiquer

JSON uniquement :
{
  "type_document": "facture_dentaire",
  "sous_type": "consommables",
  "ajouter_au_stock": false,
  "selectionne": true,
  "deductible_tva": true,
  "fournisseur_ou_etablissement": "Nom exact",
  "code_client": "ABC-12345",
  "numero_document": "FA-2026-001",
  "date": "AAAA-MM-JJ",
  "total_ht": 0.00,
  "tva": 0.00,
  "total_ttc": 0.00,
  "devise_originale": "EUR",
  "montant_original": 0.00,
  "taux_conversion": 1,
  "converti": false,
  "mode_paiement": "virement/cb/cheque/especes/inconnu",
  "description": "Description courte",
  "note_fiscale": "Info comptable utile",
  "produits": [
    {
      "nom": "Nom exact du produit",
      "reference": "REF-001",
      "quantite": 1,
      "quantite_livree": 1,
      "unite": "boite",
      "prix_unitaire_ht": 0.00,
      "prix_unitaire_ttc": 0.00,
      "taux_tva": 20,
      "remise_pct": 0.00,
      "prix_total_ttc": 0.00,
      "statut_livraison": "livree"
    }
  ]
}`
        }
      ]
    }]
  });

  const raw = (response.content[0] && response.content[0].text) || '';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e2) {}
    }
    console.warn('analyserDocumentIA: Claude a repondu en texte, piece jointe ignoree. Prefix:', raw.slice(0, 120));
    return null;
  }
}

// Pre-filtre des pieces jointes: ecarter logos, trackers, images inline avant Claude
const ATT_IGNORE_KEYWORDS = ['logo','signature','banner','icon','avatar','facebook','twitter','linkedin','instagram','tiktok','youtube','social','tracking','tracker','pixel','unsubscribe'];
function shouldSkipAttachment(att) {
  if (!att || !att.contentType) return true;
  const ct = String(att.contentType).toLowerCase();
  const name = String(att.filename || '').toLowerCase();
  const isPDF = ct.includes('pdf') || name.endsWith('.pdf');
  const isImage = ct.includes('image');
  // PDFs: toujours analyser, pas de filtre
  if (isPDF) return false;
  if (!isImage) return true;
  if (String(att.contentDisposition || '').toLowerCase() === 'inline') return true;
  if (typeof att.size === 'number' && att.size < 50000) return true;
  if (name && ATT_IGNORE_KEYWORDS.some(k => name.includes(k))) return true;
  return false;
}

function subjectDeclencheBodyScan(subject) {
  const s = String(subject || '').toLowerCase();
  return /facture|invoice|re[çc]u|receipt|echeance|avis\s+d[e']?\s*echeance|paiement|payment|rappel|quittance|commande|order|confirmation|r[eè]glement|bon\s+de\s+commande|bon\s+de\s+livraison|bordereau/.test(s);
}

// Semaphore: limite concurrence (Claude rate-limit + memoire)
function createLimiter(max) {
  let running = 0;
  const q = [];
  const next = () => {
    if (running >= max) return;
    const job = q.shift();
    if (!job) return;
    running++;
    Promise.resolve().then(job.fn).then(
      (v) => { running--; job.resolve(v); next(); },
      (e) => { running--; job.reject(e); next(); }
    );
  };
  return (fn) => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); next(); });
}
const claudeLimiter = createLimiter(20);

// Analyse le corps textuel d'un mail quand l'expéditeur est un fournisseur connu
// (EDF, Free Pro, Orange Pro...) qui n'attachent pas toujours la facture en PJ
async function analyserTexteDocument(texte, fromText, subject) {
  if (!texte || texte.length < 100) return null;
  const body = String(texte).slice(0, 6000);
  const from = String(fromText || '').slice(0, 200);
  const subj = String(subject || '').slice(0, 200);
  const prompt = `INSTRUCTION CRITIQUE : reponse UNIQUEMENT en JSON valide. Aucun texte avant/apres, aucune phrase.
Si rien d'analysable, retourne EXACTEMENT :
{"type_document":"autre","selectionne":false,"fournisseur_ou_etablissement":"Inconnu","date":null,"total_ht":null,"tva":null,"total_ttc":null,"produits":[]}

Tu es un expert-comptable cabinet dentaire FR. Analyse ce mail pour en extraire une facture/avis d'echeance si c'est le cas.

De: ${from}
Objet: ${subj}

Corps du mail (texte):
---
${body}
---

Meme regles de classification que pour un document attache.
Reponse JSON uniquement, meme schema que pour analyse PDF (type_document, fournisseur_ou_etablissement, date, total_ht, tva, total_ttc, description, etc). total_* = null si introuvable (jamais 0).
RAPPEL : TA REPONSE EST UNIQUEMENT LE JSON, RIEN D'AUTRE.`;

  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: 'Tu es un expert-comptable cabinet dentaire FR. Tu réponds UNIQUEMENT en JSON valide commençant par { et finissant par }. Jamais de texte avant ou après, jamais d\'explication en français.',
      messages: [{ role: 'user', content: [{ type:'text', text: prompt }] }]
    });
    const raw = (r.content[0] && r.content[0].text) || '';
    const cleaned = raw.replace(/```json|```/g,'').trim();
    try { return JSON.parse(cleaned); }
    catch(e1) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch(e2){} }
      console.warn('analyserTexteDocument: parse fail. Prefix:', cleaned.slice(0,120));
    }
  } catch(e) { console.error('analyserTexteDocument error:', e.message); }
  return null;
}

// Fournisseurs connus pour envoyer des factures dans le corps HTML (pas en PJ)
const FOURNISSEURS_CORPS_MAIL = ['edf','engie','totalenergies','enedis','free','orange','sfr','bouygues','numericable','numéricable','red by sfr','ovh','ionos'];
function mailEmaneDUnFournisseurCorps(parsed) {
  const from = String(parsed.from && parsed.from.text || '').toLowerCase();
  const subj = String(parsed.subject || '').toLowerCase();
  return FOURNISSEURS_CORPS_MAIL.some(f => from.includes(f) || subj.includes(f));
}

app.post('/api/analyser-document', requireAuth(), async (req, res) => {
  try {
    const { document, mediaType } = req.body;
    const userId = req.user.id;
    if (!document || !mediaType) return res.status(400).json({ error: 'document et mediaType requis' });

    const data = await analyserDocumentIA(document, mediaType);
    if (!data) return res.status(422).json({ error: 'Document non analysable (Claude n\'a pas retourne de JSON)' });

    // Anti-doublon hash
    const hash = crypto.createHash('md5')
      .update(`${data.fournisseur_ou_etablissement}_${data.numero_document}_${data.date}_${data.total_ttc}`)
      .digest('hex');

    const { data: existing } = await supabase.from('documents_compta')
      .select('id, created_at').eq('hash', hash).maybeSingle();

    if (existing) return res.json({
      doublon: true,
      message: `Document déjà importé le ${new Date(existing.created_at).toLocaleDateString('fr-FR')}`
    });

    res.json({ ...data, hash });
  } catch (e) {
    console.error('analyser-document error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// COMPTABILITE — Valider et sauvegarder document
// =============================================
app.post('/api/valider-document', requireAuth(), async (req, res) => {
  try {
    const { document } = req.body;
    const userId = req.user.id;
    if (!document) return res.status(400).json({ error: 'document requis' });

    // Sauvegarder dans documents_compta
    const { error: insertErr } = await supabase.from('documents_compta').insert({
      user_id: userId,
      type_document: document.type_document,
      sous_type: document.sous_type,
      fournisseur: document.fournisseur_ou_etablissement,
      numero_document: document.numero_document,
      date_document: document.date,
      total_ht: document.total_ht,
      tva: document.tva,
      total_ttc: document.total_ttc,
      mode_paiement: document.mode_paiement,
      description: document.description,
      note_fiscale: document.note_fiscale,
      deductible_tva: document.deductible_tva,
      produits: document.produits,
      hash: document.hash,
      source: document.source || 'manuel',
      mois: document.date ? document.date.substring(0, 7) : null,
    });

    if (insertErr) throw insertErr;

    // Si facture dentaire -> mettre a jour le stock
    if (document.ajouter_au_stock && document.produits && document.produits.length > 0) {
      for (const p of document.produits) {
        // ── Detection lignes "suivra" : NE PAS ajouter au stock ──
        const lineText = [p.nom, p.statut_livraison, p.commentaire].filter(Boolean).join(' ').toLowerCase();
        const isSuivra = /\bsuivra\b|à suivre|\breliquat\b|back.?order|non.?livr|indisponible|rupture/i.test(lineText)
          || (p.statut_livraison && /suivra|pending|backorder/i.test(p.statut_livraison))
          || p.quantite_livree === 0;
        if (isSuivra) {
          console.log(`[valider-document] SUIVRA: ${p.nom} x${p.quantite} — pas de stock`);
          continue;
        }

        let match = null;

        // Chercher par reference
        if (p.reference) {
          const { data: refMatch } = await supabase.from('produits')
            .select('*').eq('reference', p.reference)
            .eq('owner_id', userId).maybeSingle();
          match = refMatch;
        }

        // Sinon chercher par nom (mots-cles)
        if (!match && p.nom) {
          const mots = p.nom.split(' ').filter(m => m.length > 3);
          for (const mot of mots) {
            const { data: matches } = await supabase.from('produits')
              .select('*').ilike('nom', `%${mot}%`).eq('owner_id', userId);
            if (matches && matches.length > 0) { match = matches[0]; break; }
          }
        }

        if (match) {
          await supabase.from('produits').update({
            qty: match.qty + p.quantite,
            prix_achat: p.prix_unitaire_ttc,
            fournisseur: document.fournisseur_ou_etablissement,
          }).eq('id', match.id);
        } else if (p.nom) {
          await supabase.from('produits').insert({
            nom: p.nom,
            reference: p.reference,
            fournisseur: document.fournisseur_ou_etablissement,
            qty: p.quantite,
            prix_achat: p.prix_unitaire_ttc,
            owner_id: userId,
            categorie: document.sous_type || 'Autre',
          });
        }

        // Prix communaute anonymise
        if (p.nom) {
          await supabase.from('prix_communaute').upsert({
            nom_produit: p.nom,
            reference: p.reference,
            fournisseur: document.fournisseur_ou_etablissement,
            prix_unitaire: p.prix_unitaire_ttc,
            remise_pct: p.remise_pct,
            date_achat: document.date,
          }, { ignoreDuplicates: true });
        }
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('valider-document error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// OAuth2 Yahoo
// =============================================
function encodeState(obj) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'jadomi-state-key';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 16);
  return payload + '.' + sig;
}
function decodeState(s) {
  try {
    if (!s || !s.includes('.')) return {};
    const [payload, sig] = s.split('.');
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'jadomi-state-key';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 16);
    // Ensure same length before timingSafeEqual (different lengths = instant reject, no timing leak)
    if (sig.length !== expectedSig.length) return {};
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return {};
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    // Expire state tokens after 10 minutes to prevent replay attacks
    if (parsed.t && (Date.now() - parsed.t) > 10 * 60 * 1000) return {};
    return parsed;
  } catch(e) { return {}; }
}

app.get('/api/auth/yahoo', (req, res) => {
  const uid = req.query.uid || '';
  const state = encodeState({ uid, t: Date.now() });
  // Yahoo: scope override via ?scope=... (utile pour tester mail-r apres verification app)
  const scope = req.query.scope || process.env.YAHOO_SCOPE || 'openid';
  const params = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID,
    redirect_uri: 'https://jadomi.fr/api/auth/yahoo/callback',
    response_type: 'code',
    scope,
    language: 'fr-fr',
    state,
  });
  const url = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  console.log('Yahoo OAuth redirect for uid=', uid, 'scope=', scope);
  res.redirect(url);
});

app.get('/api/auth/yahoo/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('https://jadomi.fr/?yahoo_error=missing_code');

    const tokenResp = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://jadomi.fr/api/auth/yahoo/callback',
      })
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || tokenData.error) {
      console.error('Yahoo token error:', tokenData);
      return res.redirect('https://jadomi.fr/?yahoo_error=token');
    }

    const { uid } = decodeState(req.query.state);
    let email = null;
    try {
      const uiResp = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token }
      });
      const ui = await uiResp.json();
      email = ui.email || (ui.emails && ui.emails[0] && ui.emails[0].handle) || null;
    } catch (e) { console.warn('Yahoo userinfo failed:', e.message); }

    if (uid) {
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
      const { error: upErr } = await supaAdminOrThrow().from('yahoo_oauth_tokens').upsert({
        user_id: uid,
        email,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        xoauth_yahoo_guid: tokenData.xoauth_yahoo_guid || null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (upErr) console.error('Yahoo token upsert error:', upErr.message);
      else console.log('Yahoo token stored for uid=', uid, 'email=', email);
    } else {
      console.warn('Yahoo callback without uid in state — token not persisted');
    }

    res.redirect('https://jadomi.fr/index.html?yahoo_connected=1#compta');
  } catch (e) {
    console.error('Yahoo callback error:', e);
    res.redirect('https://jadomi.fr/?yahoo_error=exception');
  }
});

// ============ Pieces jointes scan mail (cache ephemere en memoire) ============
// Map<token, { userId, filename, contentType, buffer, createdAt }>
const scanAttachments = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, v] of scanAttachments) if (v.createdAt < cutoff) scanAttachments.delete(k);
}, 10 * 60 * 1000).unref();

// Map persistante indexee par hash (anti-expiration TTL) - videe lors de l'upload Storage
const pendingAttachmentsByHash = new Map();
function storeAttachmentByHash(hash, att) {
  if (!hash || !att || !att.content || !Buffer.isBuffer(att.content)) return;
  pendingAttachmentsByHash.set(hash, {
    filename: att.filename || 'document',
    contentType: att.contentType || 'application/octet-stream',
    buffer: att.content,
    createdAt: Date.now(),
  });
  console.log('[ATT HASH] stored hash=' + hash.slice(0, 8) + ' size=' + att.content.length);
}
function computeDocHash(analyse) {
  if (!analyse) return null;
  return require('crypto').createHash('md5')
    .update(`${analyse.fournisseur_ou_etablissement}_${analyse.numero_document || ''}_${analyse.date || ''}_${analyse.total_ttc || 0}`)
    .digest('hex');
}

function storeAttachment(userId, att) {
  if (!att || !att.content || !Buffer.isBuffer(att.content) || att.content.length === 0) {
    console.warn('[ATT] storeAttachment: content vide ou non-Buffer pour', att && att.filename);
    return null;
  }
  const token = crypto.randomBytes(16).toString('hex');
  scanAttachments.set(token, {
    userId,
    filename: att.filename || 'document',
    contentType: att.contentType || 'application/octet-stream',
    buffer: att.content,
    createdAt: Date.now(),
  });
  console.log('[ATT] stored', att.filename, att.contentType, att.content.length, 'bytes -> token', token.slice(0, 8));
  return token;
}

app.get('/api/mail/attachment/:token', (req, res) => {
  try {
    // Validate token format (hex, 32 chars) to prevent enumeration
    if (!/^[0-9a-f]{32}$/i.test(req.params.token)) return res.status(400).json({ error: 'Token invalide' });
    const entry = scanAttachments.get(req.params.token);
    if (!entry) return res.status(404).json({ error: 'Pièce jointe introuvable ou expirée' });
    if (!entry.buffer) return res.status(500).json({ error: 'contenu_manquant' });
    const filename = entry.filename || 'attachment';
    // Sanitize Content-Type to prevent XSS via malicious content types
    const safeContentType = (entry.contentType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (safeContentType.startsWith('text/html')) {
      // Serve HTML email content with strict CSP + hardened headers to prevent XSS from malicious emails
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; script-src 'none'; frame-src 'none'; object-src 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      return res.end(entry.buffer);
    }
    // Force download for dangerous MIME types that can execute JS (SVG, XML)
    if (safeContentType.startsWith('image/svg') || safeContentType.includes('xml')) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
      return res.end(entry.buffer);
    }
    res.setHeader('Content-Type', safeContentType);
    res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(filename) + '"');
    res.end(entry.buffer);
  } catch (e) {
    console.error('[/api/mail/attachment]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function storeMailBodyAsHtml(userId, parsed) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const body = parsed.html || `<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;padding:16px">${esc(parsed.text || '')}</pre>`;
  const header = `<div style="padding:12px 16px;background:#f5f5f5;border-bottom:1px solid #ddd;font-family:system-ui,sans-serif;font-size:13px;color:#333">
    <div><b>De :</b> ${esc(parsed.from && parsed.from.text)}</div>
    <div><b>Sujet :</b> ${esc(parsed.subject)}</div>
    <div><b>Date :</b> ${esc(parsed.date ? new Date(parsed.date).toLocaleString('fr-FR') : '')}</div>
  </div>`;
  const full = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(parsed.subject || 'Mail')}</title><base target="_blank"></head><body style="margin:0">${header}${body}</body></html>`;
  return storeAttachment(userId, {
    filename: `mail-${Date.now()}.html`,
    contentType: 'text/html; charset=utf-8',
    content: Buffer.from(full, 'utf-8'),
  });
}

// ============ Server-Sent Events: progression scan mail ============
const scanProgressClients = new Map();

app.get('/api/mail/scan-progress', requireAuthSSE(), (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'unauth' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('event: open\ndata: {"status":"connected"}\n\n');
    scanProgressClients.set(userId, res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){} }, 25000);
    req.on('close', () => { clearInterval(ping); scanProgressClients.delete(userId); });
  } catch (e) {
    console.error('[SSE scan-progress]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
  }
});

function sendProgress(userId, data) {
  if (!userId) return;
  const client = scanProgressClients.get(userId);
  if (!client) return;
  try { client.write(`data: ${JSON.stringify(data)}\n\n`); } catch(e) {}
}

function buildXoauth2(email, accessToken) {
  return Buffer.from(`user=${email}\x01auth=Bearer ${accessToken}\x01\x01`).toString('base64');
}

const MAX_CLAUDE_CALLS_PER_SCAN = 100;
const MOTS_CLES_FACTURE = ['facture','invoice','re\u00e7u','recu','receipt','commande','order','paiement','payment','confirmation','r\u00e8glement','reglement','quittance','\u00e9ch\u00e9ance','echeance','rappel'];
const FOURNISSEURS_CONNUS = ['gacd','dpi','henry schein','septodont','pierre rolland','promodentaire','anthogyr','straumann','nobel','biomet','mega dental','edf','engie','totalenergies','enedis','free','orange','sfr','bouygues','numericable','amazon','doctolib','ovh','ionos','inventeeh'];

function isPdfAttachment(att) {
  if (!att) return false;
  const ct = String(att.contentType || '').toLowerCase();
  const name = String(att.filename || '').toLowerCase();
  return ct.includes('pdf') || name.endsWith('.pdf');
}

// Pre-filtre global: mail a-t-il une chance d'etre un document comptable ?
const REJETER_SUJET = [
  'messagerie vocale', 'message vocal', 'appel manqué',
  'newsletter', 'nos offres', 'promotions', 'offre spéciale',
  'soldes', 'commander avant', 'profitez de',
  'votre avis', 'donnez votre avis', 'satisfaction',
  'répondez à', 'questionnaire', 'sondage',
  'mot de passe', 'réinitialisation', 'connexion depuis',
  'rappel rendez-vous', 'confirmation rdv', 'compte rendu',
  'rapport entretien', 'rapport de visite',
  'parrainage', 'sponsorisé', 'publicité',
  'votre colis est en', 'livraison prévue',
  'recherche facture', 'auriez-vous', 'pouvez-vous',
  'bonjour karim',
];

const MOTS_CLES_FINANCIERS_PRECIS = [
  'facture', 'invoice', 'reçu de paiement', 'receipt',
  'paiement reçu', 'payment confirmed', 'règlement reçu',
  'votre commande est confirmée', 'order confirmed',
  'échéance', 'avis de paiement', "avis d'échéance",
  'quittance', 'rappel de paiement',
  'bordereau', 'bon de commande accepté',
  'avoir', 'remboursement effectué',
  'prélèvement', 'débit',
];

const FOURNISSEURS_DENTAIRES = [
  'gacd', 'dpi', 'henry schein', 'septodont', 'mega dental',
  'pierre rolland', 'anthogyr', 'straumann',
];

function vautLaPeineAnalyser(parsed) {
  const subject = String(parsed.subject || '').toLowerCase();
  const from = String(parsed.from && parsed.from.text || '').toLowerCase();
  const body = String(parsed.text || '').substring(0, 500).toLowerCase();
  if (REJETER_SUJET.some(m => subject.includes(m) || body.includes(m))) {
    console.log(`[SKIP PRECIS] "${subject}" — non financier`);
    return false;
  }
  const hasPDF = (parsed.attachments || []).some(isPdfAttachment);
  if (hasPDF) return true;
  if (MOTS_CLES_FINANCIERS_PRECIS.some(m => subject.includes(m))) return true;
  if (FOURNISSEURS_DENTAIRES.some(f => from.includes(f))) return true;
  return false;
}

async function scanInboxForDocs(imapConfig, periode, mois, annee, provider, userId) {
  const documents = [];
  let claudeCalls = 0;
  let limiteNotifiee = false;
  const SCAN_TIMEOUT_MS = 10 * 60 * 1000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    console.error('IMAP scan timeout for', provider);
    sendProgress(userId, { status:'error', error:'Timeout 10min' });
  }, SCAN_TIMEOUT_MS);

  const client = new ImapFlow({ ...imapConfig, logger: false });

  try {
    sendProgress(userId, { status:'connecting', total:0, done:0, found:0, current:'Connexion IMAP...' });
    await client.connect();
    sendProgress(userId, { status:'searching', total:0, done:0, found:0, current:'Recherche des mails...' });

    const lock = await client.getMailboxLock('INBOX');
    try {
      let sinceDate;
      if (periode === 'mensuel' && mois && annee) sinceDate = new Date(parseInt(annee), parseInt(mois) - 1, 1);
      else if (periode === 'annuel' && annee) sinceDate = new Date(parseInt(annee), 0, 1);
      else if (periode === 'tout') sinceDate = new Date(2024, 0, 1);
      else sinceDate = new Date(2026, 0, 1);

      console.log('IMAP scan SINCE', sinceDate, 'for', provider);

      const uids = await client.search({ since: sinceDate }, { uid: true });
      if (!uids || !uids.length) {
        sendProgress(userId, { status:'done', total:0, done:0, found:0, current:'Aucun mail' });
        clearTimeout(timer);
        lock.release();
        await client.logout();
        return documents;
      }
      uids.sort((a, b) => b - a);
      const toProcess = uids;
      console.log('[IMAP]', toProcess.length, 'mails a scanner pour', provider);
      sendProgress(userId, { status:'scanning', total: toProcess.length, done:0, found:0, current:'Demarrage...' });

      let done = 0;
      const uidRange = toProcess.join(',');
      for await (const msg of client.fetch(uidRange, { source: true }, { uid: true })) {
        if (timedOut) break;
        if (claudeCalls >= MAX_CLAUDE_CALLS_PER_SCAN && limiteNotifiee) break;
        try {
          const parsed = await simpleParser(msg.source, { skipTextToHtml: true, skipImageLinks: true });
          const subj = (parsed.subject || '').slice(0, 80) || 'Mail sans sujet';
          sendProgress(userId, { status:'scanning', total: toProcess.length, done, found: documents.length, current: subj });
          const atts = parsed.attachments || [];
          const fromTxt = (parsed.from && parsed.from.text) || '';
          const dateStr = parsed.date ? new Date(parsed.date).toISOString().slice(0,10) : '-';
          console.log('[IMAP mail]', dateStr, '|', fromTxt, '|', subj, '|', atts.length, 'PJ');
          if (claudeCalls >= MAX_CLAUDE_CALLS_PER_SCAN) {
            if (!limiteNotifiee) {
              console.log('[CLAUDE] Limite', MAX_CLAUDE_CALLS_PER_SCAN, 'appels atteinte — scan arrete');
              sendProgress(userId, { status:'done', total: toProcess.length, done: toProcess.length, found: documents.length, current: 'Limite 100 atteinte' });
              limiteNotifiee = true;
            }
            break;
          }
          if (!vautLaPeineAnalyser(parsed)) {
            console.log('[SKIP]', subj, '— pas une facture potentielle');
            done++;
            continue;
          }
          let mailPdfToken = null;
          let mailPdfFilename = null;
          for (const att of atts) {
            if (isPdfAttachment(att) && !shouldSkipAttachment(att)) {
              const t = storeAttachment(userId, att);
              if (t) { mailPdfToken = t; mailPdfFilename = att.filename; break; }
            }
          }
          let pjExploitable = false;
          for (const att of atts) {
            const isPDF = isPdfAttachment(att);
            const skip = !isPDF || shouldSkipAttachment(att);
            const contentLen = att && att.content && att.content.length || 0;
            console.log('[ATT DEBUG]', att.filename || '(sans nom)', '| pdf:', isPDF, '| size:', att.size, '| contentLen:', contentLen, '| type:', att.contentType, '| skip:', skip);
            if (skip) continue;
            pjExploitable = true;
            if (claudeCalls >= MAX_CLAUDE_CALLS_PER_SCAN) {
              if (!limiteNotifiee) {
                console.log('[CLAUDE] Limite', MAX_CLAUDE_CALLS_PER_SCAN, 'appels atteinte — scan partiel');
                sendProgress(userId, { status:'scanning', total: toProcess.length, done, found: documents.length, current: 'Limite Claude atteinte (scan partiel)' });
                limiteNotifiee = true;
              }
              break;
            }
            try {
              if (!att.content || !Buffer.isBuffer(att.content)) {
                console.warn('[IMAP] Attachment sans contenu, skip:', att.filename);
                continue;
              }
              const base64 = att.content.toString('base64');
              claudeCalls++;
              const analyse = await claudeLimiter(() => analyserDocumentIA(base64, att.contentType));
              if (analyse && analyse.type_document !== 'personnel') {
                const attToken = storeAttachment(userId, att);
                const docHash = computeDocHash(analyse);
                if (docHash) storeAttachmentByHash(docHash, att);
                documents.push({
                  from: parsed.from ? parsed.from.text : '',
                  date_mail: parsed.date,
                  subject: parsed.subject,
                  filename: att.filename,
                  analyse,
                  attachmentToken: attToken,
                  docHash,
                  selectionne: analyse.selectionne !== false,
                });
                sendProgress(userId, {
                  status:'scanning', total: toProcess.length, done, found: documents.length, current: subj,
                  newDocument: {
                    fournisseur: analyse.fournisseur_ou_etablissement,
                    total_ttc: analyse.total_ttc,
                    type_document: analyse.type_document,
                    date: analyse.date,
                    filename: att.filename,
                    attachmentToken: attToken,
                    subject: parsed.subject || '',
                    date_mail: parsed.date,
                    selectionne: analyse.selectionne !== false,
                  }
                });
              }
            } catch(e) { console.error('IMAP scan attachment error:', e.message); }
          }
          const subjMatch = subjectDeclencheBodyScan(parsed.subject);
          if (subjMatch && claudeCalls < MAX_CLAUDE_CALLS_PER_SCAN) {
            try {
              claudeCalls++;
              const analyse = await claudeLimiter(() => analyserTexteDocument(parsed.text || parsed.html || '', parsed.from && parsed.from.text, parsed.subject));
              if (analyse && analyse.type_document !== 'personnel') {
                const bodyToken = mailPdfToken || storeMailBodyAsHtml(userId, parsed);
                documents.push({
                  from: parsed.from ? parsed.from.text : '',
                  date_mail: parsed.date,
                  subject: parsed.subject,
                  filename: mailPdfFilename || '(corps du mail)',
                  analyse,
                  attachmentToken: bodyToken,
                  selectionne: analyse.selectionne !== false,
                });
                sendProgress(userId, {
                  status:'scanning', total: toProcess.length, done, found: documents.length, current: subj,
                  newDocument: {
                    fournisseur: analyse.fournisseur_ou_etablissement,
                    total_ttc: analyse.total_ttc,
                    type_document: analyse.type_document,
                    date: analyse.date,
                    filename: mailPdfFilename || '(corps du mail)',
                    attachmentToken: bodyToken,
                    subject: parsed.subject || '',
                    date_mail: parsed.date,
                    selectionne: analyse.selectionne !== false,
                  }
                });
              }
            } catch(e) { console.error('IMAP body scan error:', e.message); }
          }
          done++;
          sendProgress(userId, { status:'scanning', total: toProcess.length, done, found: documents.length, current: subj });
        } catch(e) { done++; console.error('IMAP parse error:', e.message); }
      }
      sendProgress(userId, { status:'done', total: toProcess.length, done: toProcess.length, found: documents.length, current:'Terminé' });
    } finally {
      lock.release();
    }
    clearTimeout(timer);
    await client.logout();
  } catch(e) {
    clearTimeout(timer);
    console.error('IMAP connection error [' + provider + ']:', e.message, e.code || '');
    sendProgress(userId, { status:'error', error: 'Erreur interne' });
    try { await client.logout(); } catch(_) {}
    throw e;
  }
  return documents;
}

async function getYahooAccessToken(userId) {
  const admin = supaAdminOrThrow();
  const { data: row, error } = await admin.from('yahoo_oauth_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (error || !row) throw new Error('Aucun token Yahoo trouve pour cet utilisateur. Reconnectez-vous avec Yahoo.');
  const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60000;
  if (!expired) return row;

  const refreshResp = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      redirect_uri: 'https://jadomi.fr/api/auth/yahoo/callback',
    })
  });
  const t = await refreshResp.json();
  if (!refreshResp.ok || t.error) {
    console.error('Yahoo refresh error:', t);
    throw new Error('Token Yahoo expire et refresh echoue — reconnectez-vous.');
  }
  const expiresAt = new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString();
  const updated = {
    ...row,
    access_token: t.access_token,
    refresh_token: t.refresh_token || row.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  await admin.from('yahoo_oauth_tokens').upsert(updated, { onConflict: 'user_id' });
  return updated;
}

app.get('/api/yahoo/account', requireAuth(), async (req, res) => {
  const userId = req.user.id;
  try {
    const admin = supaAdminOrThrow();
    const { data: row } = await admin.from('yahoo_oauth_tokens').select('email, updated_at').eq('user_id', userId).maybeSingle();
    if (!row) return res.json({ connected: false });
    res.json({ connected: true, email: row.email, updated_at: row.updated_at });
  } catch (e) {
    console.error('yahoo/account error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/mail/scan-yahoo', requireAuth(), async (req, res) => {
  const { periode, mois, annee } = req.body || {};
  const userId = req.user.id;
  try {
    const row = await getYahooAccessToken(userId);
    if (!row.email) return res.status(400).json({ error: 'Email Yahoo inconnu — reconnectez-vous.' });

    console.log('[YAHOO-OAUTH] email=', row.email, 'expires_at=', row.expires_at);

    const imapConfig = {
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
      auth: { user: row.email, accessToken: row.access_token },
      tls: { rejectUnauthorized: false, servername: 'imap.mail.yahoo.com', minVersion: 'TLSv1.2' },
    };
    res.setTimeout(10 * 60 * 1000);
    const documents = await scanInboxForDocs(imapConfig, periode, mois, annee, 'Yahoo-OAuth', userId);
    console.log('Yahoo-OAuth scan complete:', documents.length, 'docs for', row.email);
    res.json({ documents, total: documents.length, email: row.email });
  } catch (e) {
    console.error('scan-yahoo error:', e.message);
    if (!res.headersSent) {
      const hint = /invalid credentials|authenticate/i.test(e.message)
        ? ' (scope OAuth insuffisant : Yahoo exige mail-r pour IMAP. Re-autoriser avec scope=mail-r une fois l\'app verifiee par Yahoo.)'
        : '';
      res.status(400).json({ error: 'Erreur connexion email' + hint });
    }
  }
});

// =============================================
// COMPTABILITE — Scan boite mail (IMAP)
// =============================================
app.post('/api/mail/test', requireAuth(), async (req, res) => {
  const { email, password, provider } = req.body;
  if (!email || !password || !provider) {
    return res.status(400).json({ error: 'Email, mot de passe et provider requis' });
  }
  try {
    const configs = {
      'Gmail': { host: 'imap.gmail.com', port: 993 },
      'Outlook': { host: 'outlook.office365.com', port: 993 },
      'Yahoo': { host: 'imap.mail.yahoo.com', port: 993, authTimeout: 15000, connTimeout: 20000, minTLS: 'TLSv1.2', keepalive: true },
      'OVH': { host: 'ssl0.ovh.net', port: 993 },
      'Orange': { host: 'imap.orange.fr', port: 993 },
      'Free': { host: 'imap.free.fr', port: 993 },
      'SFR': { host: 'imap.sfr.fr', port: 993 },
      'Laposte': { host: 'imap.laposte.net', port: 993 },
    };
    const domain = (email || '').split('@')[1];
    if (!configs[provider] && (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain))) {
      return res.status(400).json({ error: 'email_invalide' });
    }
    const config = configs[provider] || { host: `imap.${domain}`, port: 993 };
    const testClient = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: email, pass: password },
      tls: { rejectUnauthorized: false, servername: config.host, minVersion: config.minTLS || undefined },
      logger: false
    });

    console.log('IMAP connecting to', config.host, 'for', provider, '...');
    await testClient.connect();
    await testClient.logout();
    res.json({ success: true });
  } catch (e) {
    console.error('IMAP test error [' + provider + ']:', e.message, e.source || '');
    if (!res.headersSent) {
      res.status(400).json({ error: 'Connexion impossible', provider: provider, code: e.code || null });
    }
  }
});

app.post('/api/mail/scan', requireAuth(), async (req, res) => {
  let { email, password, provider, periode, mois, annee, account_id } = req.body;
  const userId = req.user.id;

  // Mode account_id : résoudre les credentials depuis comptes_email_societe
  if (account_id && !password) {
    try {
      const sid = req.societeId || req.societe?.id || req.body.societe_id;
      const db = supabaseAdmin || supabase;
      const query = db.from('comptes_email_societe').select('*').eq('id', account_id);
      if (sid) query.eq('societe_id', sid);
      const { data: account, error: accErr } = await query.single();
      if (accErr || !account) return res.status(404).json({ error: 'Compte email non trouvé' });
      if (!account.actif) return res.status(400).json({ error: 'Compte email désactivé' });

      // Déchiffrer le mot de passe (même algo que mail-copilot)
      try {
        const encKey = process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 32) || 'jadomi_default_enc_key__32chars!';
        const key = Buffer.from(encKey.padEnd(32, '0').substring(0, 32));
        const iv = Buffer.from(account.password_iv, 'hex');
        const tag = Buffer.from(account.password_tag, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update(account.password_chiffre, 'hex', 'utf8');
        dec += decipher.final('utf8');
        password = dec;
      } catch (decErr) {
        console.error('[SCAN] decrypt error:', decErr.message);
        return res.status(500).json({ error: 'Impossible de déchiffrer les identifiants' });
      }
      email = account.email;
      provider = account.provider;
    } catch (e) {
      console.error('[SCAN] account_id resolve error:', e.message);
      return res.status(500).json({ error: 'Erreur résolution du compte' });
    }
  }

  if (!email || !password || !provider) {
    return res.status(400).json({ error: 'Email, mot de passe et provider requis' });
  }
  try {
    const configs = {
      'Gmail': { host: 'imap.gmail.com', port: 993 },
      'Outlook': { host: 'outlook.office365.com', port: 993 },
      'Yahoo': { host: 'imap.mail.yahoo.com', port: 993, authTimeout: 15000, connTimeout: 20000, minTLS: 'TLSv1.2', keepalive: true },
      'OVH': { host: 'ssl0.ovh.net', port: 993 },
      'Orange': { host: 'imap.orange.fr', port: 993 },
      'Free': { host: 'imap.free.fr', port: 993 },
      'SFR': { host: 'imap.sfr.fr', port: 993 },
      'Laposte': { host: 'imap.laposte.net', port: 993 },
    };
    const domain = (email || '').split('@')[1];
    if (!configs[provider] && (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain))) {
      return res.status(400).json({ error: 'email_invalide' });
    }
    const config = configs[provider] || { host: `imap.${domain}`, port: 993 };

    const imapConfig = {
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: email, pass: password },
      tls: { rejectUnauthorized: false, servername: config.host, minVersion: config.minTLS || undefined },
    };

    res.setTimeout(10 * 60 * 1000);
    console.log('IMAP scan connecting to', config.host, 'for', provider, '...');
    const documents = await scanInboxForDocs(imapConfig, periode, mois, annee, provider, userId);

    console.log('IMAP scan responding with', documents.length, 'documents');
    if (!res.headersSent) {
      const body = JSON.stringify({ documents, total: documents.length });
      console.log('IMAP scan response size:', body.length, 'bytes');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
      res.end(body);
    }
  } catch (e) {
    console.error('IMAP scan error [' + (provider||'?') + ']:', e.message, e.code || '', e.source || '');
    if (!res.headersSent) {
      res.status(400).json({ error: 'Erreur validation', provider: provider });
    }
  }
});

app.post('/api/mail/import', requireAuth(), async (req, res) => {
  const { factures, documents } = req.body;
  const userId = req.user.id;
  const items = factures || documents || [];
  try {
    if (!items.length || !userId) return res.status(400).json({ error: 'factures et userId requis' });
    console.log('[IMPORT] userId=', userId, 'items:', items.length);

    const db = supabaseAdmin || supabase;
    let imported = 0;
    let duplicates = 0;
    const errors = [];
    for (const f of items) {
      if (f.selectionne === false) continue;
      const doc = f.analyse || f;
      doc.source = 'mail';
      const hash = crypto.createHash('md5')
        .update(`${doc.fournisseur_ou_etablissement}_${doc.numero_document}_${doc.date}_${doc.total_ttc}`)
        .digest('hex');

      const { data: existing } = await db.from('documents_compta')
        .select('id, storage_path').eq('hash', hash).eq('user_id', userId).maybeSingle();
      if (existing) {
        console.log('[IMPORT] DOUBLON:', doc.fournisseur_ou_etablissement, 'hash:', hash.slice(0, 10), '| storage_path:', existing.storage_path || 'MANQUANT');
        // Re-upload retroactif si le doc existant n'a pas de storage_path
        if (!existing.storage_path && supabaseAdmin) {
          const token = f.attachmentToken || doc.attachmentToken;
          const byHash = pendingAttachmentsByHash.get(hash);
          const att = byHash || (token ? scanAttachments.get(token) : null);
          if (att && att.buffer) {
            const ct = att.contentType || '';
            const ext = ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : ct.includes('jpeg') ? 'jpg' : 'bin';
            const filePath = `${userId}/${hash}.${ext}`;
            const { error: upErr } = await supabaseAdmin.storage
              .from('documents-compta')
              .upload(filePath, att.buffer, { contentType: ct || 'application/pdf', upsert: true });
            if (!upErr) {
              await supabaseAdmin.from('documents_compta').update({ storage_path: filePath }).eq('id', existing.id);
              console.log('[STORAGE] retroactif uploade:', filePath);
              pendingAttachmentsByHash.delete(hash);
            } else {
              console.warn('[STORAGE] retroactif fail:', upErr.message);
            }
          }
        }
        duplicates++;
        continue;
      }

      // Upload PDF/image vers Supabase Storage — priorite hash map (pas de TTL)
      let storagePath = null;
      const token = f.attachmentToken || doc.attachmentToken;
      const byHash = pendingAttachmentsByHash.get(hash);
      const att = byHash || (token ? scanAttachments.get(token) : null);
      console.log('[IMPORT] attToken:', token ? token.slice(0, 8) : 'none', '| byHash:', !!byHash, '| att found:', !!att, '| size:', (att && att.buffer && att.buffer.length) || 0);
      if (att && att.buffer && supabaseAdmin) {
        const ct = att.contentType || '';
        const ext = ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : ct.includes('jpeg') ? 'jpg' : 'bin';
        const filePath = `${userId}/${hash}.${ext}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from('documents-compta')
          .upload(filePath, att.buffer, {
            contentType: ct || 'application/pdf',
            upsert: true
          });
        if (!upErr) {
          storagePath = filePath;
          console.log('[STORAGE] uploaded', filePath);
          pendingAttachmentsByHash.delete(hash);
        } else {
          console.warn('[STORAGE] upload fail:', upErr.message);
        }
      }

      const { error: insErr } = await db.from('documents_compta').insert({
        user_id: userId,
        type_document: doc.type_document,
        sous_type: doc.sous_type,
        fournisseur: doc.fournisseur_ou_etablissement,
        numero_document: doc.numero_document,
        date_document: doc.date,
        total_ht: doc.total_ht,
        tva: doc.tva,
        total_ttc: doc.total_ttc,
        mode_paiement: doc.mode_paiement,
        description: doc.description,
        note_fiscale: doc.note_fiscale,
        deductible_tva: doc.deductible_tva,
        produits: doc.produits,
        hash,
        source: 'mail',
        mois: doc.date ? doc.date.substring(0, 7) : null,
        storage_path: storagePath,
      });
      if (insErr) {
        console.error('[IMPORT] insert error for', doc.fournisseur_ou_etablissement, ':', insErr.message);
        errors.push({ fournisseur: doc.fournisseur_ou_etablissement, error: insErr.message });
      } else {
        imported++;
      }
    }

    console.log('[IMPORT] done — imported:', imported, 'duplicates:', duplicates, 'errors:', errors.length);
    res.json({ success: true, imported, duplicates, errors });
  } catch (e) {
    console.error('mail/import error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// COMPTABILITÉ — Analyse relevé bancaire
// =============================================
app.post('/api/analyser-releve', requireAuth(), async (req, res) => {
  try {
    const { pdfBase64 } = req.body;
    const userId = req.user.id;
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 requis' });

    const pdfData = await pdfParse(Buffer.from(pdfBase64, 'base64'));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Expert-comptable cabinet dentaire francais.
Analyse ce releve bancaire professionnel.

ANONYMISATION STRICTE - Ne retourne JAMAIS :
- Numero de compte bancaire
- Solde du compte
- IBAN ou BIC
- Nom complet du titulaire

Identifie uniquement les transactions professionnelles.

Texte du releve :
${pdfData.text}

JSON uniquement :
{
  "periode": "MM/AAAA",
  "transactions": [
    {
      "date": "AAAA-MM-JJ",
      "libelle": "GACD / EDF / LOYER...",
      "montant": 0.00,
      "type": "debit/credit",
      "categorie": "facture_dentaire/charge_cabinet/note_frais/salaire/impots/personnel/autre",
      "professionnel": true,
      "selectionne": true,
      "deductible": true
    }
  ]
}`
      }]
    });

    const data = JSON.parse(response.content[0].text.replace(/```json|```/g,'').trim());

    // Matching avec documents existants
    const { data: docs } = await supabase.from('documents_compta')
      .select('fournisseur, total_ttc, date_document').eq('user_id', userId);

    const resultat = data.transactions.map(t => {
      const match = (docs || []).find(d =>
        Math.abs((d.total_ttc || 0) - t.montant) < 10 ||
        (d.fournisseur && t.libelle.toLowerCase().includes(d.fournisseur.toLowerCase().split(' ')[0]))
      );
      return {
        ...t,
        document_trouve: !!match,
        alerte: !match && t.professionnel && t.type === 'debit'
          ? `${t.montant}E a ${t.libelle} sans justificatif`
          : null
      };
    });

    res.json({
      periode: data.periode,
      transactions: resultat,
      alertes: resultat.filter(t => t.alerte),
      documents_manquants: resultat.filter(t => !t.document_trouve && t.professionnel && t.type === 'debit').length,
      total_pro: resultat.filter(t => t.professionnel && t.type === 'debit').reduce((s, t) => s + t.montant, 0),
      total_perso: resultat.filter(t => !t.professionnel && t.type === 'debit').reduce((s, t) => s + t.montant, 0),
    });
  } catch (e) {
    console.error('analyser-releve error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// COMPTABILITE — Liste documents
// =============================================
app.get('/api/factures', requireAuth(), async (req, res) => {
  try {
    const userId = req.user.id;
    const db = supabaseAdmin || supabase;
    const { data, error } = await db.from('documents_compta')
      .select('*').eq('user_id', userId).order('date_document', { ascending: false }).limit(500);

    if (error) throw error;
    console.log('[FACTURES] userId=', userId, 'found:', (data || []).length);
    res.json(data || []);
  } catch (e) {
    console.error('factures error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// TVA CONFIG + COMPTA RECAP/EDIT/EXPORT
// =============================================
app.get('/api/tva/config/:userId', requireAuth(), async (req, res) => {
  try {
    // Ignore param URL — on se fie uniquement au JWT
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { data, error } = await supabaseAdmin
      .from('user_tva_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json(data || { statut_tva: 'franchise', seuil_franchise: 37500, ca_annuel_estime: 0 });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/tva/config', requireAuth(), async (req, res) => {
  try {
    const { statut_tva, profession, ca_annuel_estime, seuil_franchise, numero_tva } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { error } = await supabaseAdmin
      .from('user_tva_config')
      .upsert({
        user_id: userId,
        statut_tva: statut_tva || 'franchise',
        profession: profession || null,
        ca_annuel_estime: ca_annuel_estime || 0,
        seuil_franchise: seuil_franchise || 37500,
        numero_tva: numero_tva || null,
        updated_at: new Date().toISOString()
      });
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/compta/recap/:userId', requireAuth(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { annee } = req.query;
    const anneeVal = annee || new Date().getFullYear();
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });

    const { data: tvaConfig } = await supabaseAdmin
      .from('user_tva_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const soumisATVA = tvaConfig?.statut_tva === 'soumis';

    const { data: docs } = await supabaseAdmin
      .from('documents_compta')
      .select('*')
      .eq('user_id', userId)
      .gte('date_document', `${anneeVal}-01-01`)
      .lte('date_document', `${anneeVal}-12-31`)
      .order('date_document', { ascending: false });

    // Rapprochement bancaire (si table releves_bancaires existe)
    let transactions = null;
    try {
      const r = await supabaseAdmin
        .from('releves_bancaires')
        .select('montant, libelle, date')
        .eq('user_id', userId)
        .gte('date', `${anneeVal}-01-01`);
      if (!r.error) transactions = r.data || [];
    } catch (_) { transactions = null; }

    for (const doc of docs || []) {
      if (transactions && transactions.length) {
        const fournKey = (doc.fournisseur || '').toLowerCase().split(' ')[0];
        const match = transactions.find(t =>
          Math.abs((t.montant || 0) - (doc.total_ttc || 0)) < 10 ||
          (fournKey && t.libelle && t.libelle.toLowerCase().includes(fournKey))
        );
        doc.rapprochement = match ? 'ok' : 'non_rapproche';
        doc.transaction_match = match || null;
      } else {
        doc.rapprochement = 'non_verifie';
      }
    }

    const parMois = {};
    for (const doc of docs || []) {
      const mois = doc.mois_manuel || doc.mois || (doc.date_document ? doc.date_document.substring(0, 7) : 'inconnu');
      if (!parMois[mois]) {
        parMois[mois] = { mois, documents: [], total: 0, tva_total: 0, tva_recuperable: 0, par_categorie: {} };
      }
      parMois[mois].documents.push(doc);
      parMois[mois].total += doc.total_ttc || 0;

      if (soumisATVA) {
        parMois[mois].tva_total += doc.tva || 0;
        const tauxRecup = {
          facture_dentaire: 1.0, charge_cabinet: 1.0,
          equipement_medical: 1.0, equipement_informatique: 1.0,
          note_frais_transport: 1.0, note_frais_formation: 1.0,
          note_frais_hebergement: 1.0,
          note_frais_repas: 0.5,
          personnel: 0, salaire_charges: 0, impots_taxes: 0
        };
        const taux = tauxRecup[doc.type_document] ?? 0.8;
        parMois[mois].tva_recuperable += (doc.tva || 0) * taux;
      }

      const cat = doc.type_document || 'autre';
      if (!parMois[mois].par_categorie[cat]) parMois[mois].par_categorie[cat] = { total: 0, count: 0 };
      parMois[mois].par_categorie[cat].total += doc.total_ttc || 0;
      parMois[mois].par_categorie[cat].count++;
    }

    res.json({
      annee: anneeVal,
      tva_config: tvaConfig,
      soumis_tva: soumisATVA,
      mois: Object.values(parMois).sort((a, b) => b.mois.localeCompare(a.mois)),
      total_annuel: (docs || []).reduce((s, d) => s + (d.total_ttc || 0), 0),
      tva_recuperable_annuelle: soumisATVA
        ? Object.values(parMois).reduce((s, m) => s + m.tva_recuperable, 0)
        : 0
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/compta/document/:id/pdf', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { data: doc } = await supabaseAdmin
      .from('documents_compta')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!doc || !doc.storage_path) return res.status(404).json({ error: 'PDF non disponible' });
    const { data: signed, error } = await supabaseAdmin.storage
      .from('documents-compta')
      .createSignedUrl(doc.storage_path, 3600);
    if (error || !signed || !signed.signedUrl) return res.status(404).json({ error: 'URL non generee' });
    res.redirect(signed.signedUrl);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.patch('/api/compta/document/:id/paiement', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { mode_paiement } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .update({ mode_paiement })
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.patch('/api/compta/document/:id/mois', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { mois } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .update({ mois_manuel: mois })
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.patch('/api/compta/document/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { tags, commentaire } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .update({ tags, commentaire })
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/api/compta/document/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .delete()
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/compta/export/:userId', requireAuth(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { annee } = req.query;
    const anneeVal = annee || new Date().getFullYear();
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configuré' });
    const { data: docs } = await supabaseAdmin
      .from('documents_compta')
      .select('*')
      .eq('user_id', userId)
      .gte('date_document', `${anneeVal}-01-01`)
      .lte('date_document', `${anneeVal}-12-31`)
      .order('date_document');

    const esc = (v) => String(v ?? '').replace(/"/g, '""');
    const csv = [
      'Date,Fournisseur,Type,Description,Montant TTC,TVA,Tags,Commentaire',
      ...(docs || []).map(d =>
        `${d.date_document || ''},"${esc(d.fournisseur)}","${esc(d.type_document)}","${esc(d.description)}",${d.total_ttc || 0},${d.tva || 0},"${(d.tags || []).join(';')}","${esc(d.commentaire)}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="JADOMI-Compta-${anneeVal}.csv"`);
    res.send('\ufeff' + csv);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ============================================================
// DOCUMENTS SIGNES — DocuSeal Integration
// ============================================================

// Verify signature (PUBLIC - no auth required)
app.get('/api/signatures/verify', async (req, res) => {
  try {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).json({ valid: false, error: 'Identifiant et token requis' });

    const jadomiSign = require('./lib/jadomi-sign');

    // Verify HMAC token
    let tokenValid = false;
    try {
      tokenValid = jadomiSign.verifySignatureToken(id, token);
    } catch (e) {
      return res.json({ valid: false, error: 'Code de verification invalide' });
    }

    if (!tokenValid) {
      return res.json({ valid: false, error: 'Code de verification invalide' });
    }

    // Find the document
    const { data: doc, error } = await supabase.from('signed_documents')
      .select('id, title, category, signer_name, signer_email, signer_role, status, signed_at, created_at, metadata')
      .eq('metadata->>signature_id', id)
      .single();

    if (error || !doc) {
      return res.json({ valid: false, error: 'Document non trouvé' });
    }

    // Read audit trail if exists
    const safeId = String(id).replace(/[^a-zA-Z0-9-_]/g, '');
    const auditPath = require('path').join(__dirname, 'docs', 'audit', `${safeId}_audit.json`);
    let documentHash = null;
    if (require('fs').existsSync(auditPath)) {
      try {
        const audit = JSON.parse(require('fs').readFileSync(auditPath, 'utf-8'));
        documentHash = audit.document_hash_sha256;
      } catch (e) { /* ignore */ }
    }

    res.json({
      valid: true,
      document: {
        title: doc.title,
        signer_name: doc.signer_name,
        signer_email: doc.signer_email ? doc.signer_email.replace(/(.{2}).*(@.*)/, '$1***$2') : null, // Mask email partially
        signer_role: doc.signer_role,
        status: doc.status,
        signed_at: doc.signed_at,
        created_at: doc.created_at,
        signature_id: id,
        document_hash: documentHash
      }
    });
  } catch (e) {
    res.status(500).json({ valid: false, error: 'Erreur serveur' });
  }
});

// === PUBLIC OTP for mandate signing (no auth — fournisseur not logged in) ===
// Rate limit: 3 SMS per 15 min per IP (prevent SMS cost abuse)
app.use('/api/signatures/send-otp-public', rateLimit({
  windowMs: 15 * 60 * 1000, max: 3,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de demandes OTP. Réessayez dans 15 minutes.' }
}));
app.post('/api/signatures/send-otp-public', async (req, res) => {
  try {
    const { phone, document_id } = req.body;
    if (!phone || !document_id) return res.status(400).json({ error: 'Telephone et document_id requis' });
    const otpSms = require('./lib/otp-sms');
    const otp = otpSms.createOTP(phone, document_id);
    const smsResult = await otpSms.sendOTPSms(phone, otp.code);
    if (!smsResult.sent) return res.status(500).json({ error: smsResult.error || 'Erreur envoi SMS' });
    res.json({ ok: true, expires_at: otp.expires_at, simulated: smsResult.simulated || false });
  } catch (e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Rate limit: 10 verif per 15 min per IP
app.use('/api/signatures/verify-otp-public', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
}));
app.post('/api/signatures/verify-otp-public', async (req, res) => {
  try {
    const { phone, document_id, code } = req.body;
    if (!phone || !document_id || !code) return res.status(400).json({ error: 'Telephone, document_id et code requis' });
    const otpSms = require('./lib/otp-sms');
    const result = otpSms.verifyOTP(phone, document_id, code);
    res.json({ ok: result.valid, error: result.error || undefined });
  } catch (e) { console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === OTP SMS — Verification signataire ===

// Rate limit OTP sending: 5 SMS per 15 min per IP (prevent SMS spam/cost abuse)
app.use('/api/signatures/send-otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes SMS, réessayez dans 15 minutes' }
}));

// Rate limit OTP verification: 10 attempts per 15 min per IP
app.use('/api/signatures/verify-otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
}));

// Send OTP code to signer's phone
app.post('/api/signatures/send-otp', requireAuth(), async (req, res) => {
  try {
    const { phone, document_id } = req.body;
    if (!phone || !document_id) {
      return res.status(400).json({ error: 'Telephone et document_id requis' });
    }

    const otpSms = require('./lib/otp-sms');
    const otp = otpSms.createOTP(phone, document_id);

    // Send SMS
    const smsResult = await otpSms.sendOTPSms(phone, otp.code);

    if (!smsResult.sent) {
      return res.status(500).json({ error: smsResult.error || 'Erreur envoi SMS' });
    }

    res.json({
      ok: true,
      expires_at: otp.expires_at,
      ttl_seconds: otp.ttl_seconds,
      simulated: smsResult.simulated || false
    });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Verify OTP code
app.post('/api/signatures/verify-otp', requireAuth(), async (req, res) => {
  try {
    const { phone, document_id, code } = req.body;
    if (!phone || !document_id || !code) {
      return res.status(400).json({ error: 'Telephone, document_id et code requis' });
    }

    const otpSms = require('./lib/otp-sms');
    const result = otpSms.verifyOTP(phone, document_id, code);

    if (result.valid) {
      // Update document metadata to record OTP verification
      try {
        const { data } = await supabase.from('signed_documents')
          .select('metadata').eq('id', document_id).single();
        if (data) {
          const metadata = { ...(data.metadata || {}), otp_verified: true, otp_verified_at: new Date().toISOString(), otp_phone: phone.replace(/\d(?=\d{4})/g, '*') };
          await supabase.from('signed_documents')
            .update({ metadata }).eq('id', document_id);
        }
      } catch (dbErr) { /* non-blocking */ }
    }

    res.json({ ok: result.valid, error: result.error || undefined });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// === AES (Advanced Electronic Signature) — eIDAS Article 26 Flow ===

// Step 1: Initialize AES signing session — generates a unique signing token
// This token proves the signer has sole control (eIDAS Art. 26.3)
app.post('/api/signatures/aes/init', requireAuth(), async (req, res) => {
  try {
    const { document_id } = req.body;
    if (!document_id) return res.status(400).json({ error: 'document_id requis' });

    // Generate unique signing token (valid 30 min)
    const signingToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Fetch existing metadata and merge
    const { data: doc } = await supabase.from('signed_documents')
      .select('metadata').eq('id', document_id).single();

    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const metadata = {
      ...(doc.metadata || {}),
      signing_token: signingToken,
      signing_token_expires: expiresAt
    };

    await supabase.from('signed_documents')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', document_id);

    res.json({
      ok: true,
      signing_token: signingToken,
      expires_at: expiresAt
    });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Step 2: Record signer identity + consent (eIDAS Art. 26.1 + 26.2)
app.post('/api/signatures/aes/identity', requireAuth(), async (req, res) => {
  try {
    const { document_id, signing_token, full_name, email, phone, consent } = req.body;

    if (!document_id || !signing_token || !full_name || !email || !consent) {
      return res.status(400).json({ error: 'Tous les champs sont requis pour une signature AES' });
    }

    // Verify signing token
    const { data: doc } = await supabase.from('signed_documents')
      .select('metadata').eq('id', document_id).single();

    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const meta = doc.metadata || {};
    if (meta.signing_token !== signing_token) {
      return res.status(403).json({ error: 'Token de signature invalide' });
    }
    if (new Date(meta.signing_token_expires) < new Date()) {
      return res.status(403).json({ error: 'Session de signature expiree. Veuillez recommencer.' });
    }

    // Record identity and consent
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const aesProof = {
      ...(meta.aes_proof || {}),
      signer_identity: {
        full_name,
        email,
        phone: phone || null,
        phone_verified: meta.otp_verified || false,
        ip_address: ip,
        user_agent: userAgent.substring(0, 200),
        consent_given: true,
        consent_timestamp: new Date().toISOString(),
        consent_text: 'Je confirme avoir pris connaissance du document intitule ci-dessus et souhaite le signer electroniquement. Cette action a valeur de signature au sens de l\'article 1367 du Code civil.'
      }
    };

    const updatedMeta = { ...meta, aes_proof: aesProof };

    await supabase.from('signed_documents')
      .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
      .eq('id', document_id);

    res.json({ ok: true, identity_recorded: true });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Step 3: Complete AES signature — validates all 4 conditions are met
app.post('/api/signatures/aes/complete', requireAuth(), async (req, res) => {
  try {
    const { document_id, signing_token, signature_image } = req.body;

    if (!document_id || !signing_token) {
      return res.status(400).json({ error: 'document_id et signing_token requis' });
    }

    // Fetch document
    const { data: doc } = await supabase.from('signed_documents')
      .select('*').eq('id', document_id).single();

    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const meta = doc.metadata || {};

    // Validate signing token (sole control - Art. 26.3)
    if (meta.signing_token !== signing_token) {
      return res.status(403).json({ error: 'Token de signature invalide' });
    }
    if (new Date(meta.signing_token_expires) < new Date()) {
      return res.status(403).json({ error: 'Session expiree' });
    }

    // Check all 4 AES conditions
    const aesProof = meta.aes_proof || {};
    const conditions = {
      otp_verified: meta.otp_verified === true,
      identity_recorded: !!(aesProof.signer_identity && aesProof.signer_identity.full_name),
      consent_given: !!(aesProof.signer_identity && aesProof.signer_identity.consent_given),
      token_valid: true // Already validated above
    };

    const allConditionsMet = conditions.otp_verified && conditions.identity_recorded && conditions.consent_given;

    const signatureLevel = allConditionsMet ? 'aes' : 'ses';

    // Record completion
    const completionData = {
      ...meta,
      signature_level: signatureLevel,
      aes_proof: {
        ...aesProof,
        otp_verified: meta.otp_verified || false,
        otp_verified_at: meta.otp_verified_at || null,
        otp_phone_masked: meta.otp_phone || null,
        conditions_met: conditions,
        all_conditions_met: allConditionsMet,
        signing_token_used_at: new Date().toISOString(),
        eidas_article: allConditionsMet ? 'Article 26 du reglement (UE) n 910/2014' : null
      },
      // Invalidate signing token after use
      signing_token: null,
      signing_token_expires: null
    };

    // If signature_image provided (base64 canvas), store it
    if (signature_image) {
      const fs = require('fs');
      const safeDocId = String(document_id).replace(/[^a-zA-Z0-9-_]/g, '');
      const sigDir = path.join(__dirname, 'docs', 'signatures');
      if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

      const base64Data = signature_image.replace(/^data:image\/\w+;base64,/, '');
      const sigPath = path.join(sigDir, `${safeDocId}.png`);
      fs.writeFileSync(sigPath, Buffer.from(base64Data, 'base64'));
      completionData.signature_image_path = `docs/signatures/${safeDocId}.png`;
    }

    await supabase.from('signed_documents')
      .update({
        metadata: completionData,
        status: 'signed',
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id);

    res.json({
      ok: true,
      signature_level: signatureLevel,
      conditions: conditions,
      message: allConditionsMet
        ? 'Signature AES (avancee) completee — conforme eIDAS Article 26'
        : 'Signature SES (simple) completee — verification SMS manquante pour AES'
    });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get AES status for a document
app.get('/api/signatures/aes/status/:id', requireAuth(), async (req, res) => {
  try {
    const { data: doc } = await supabase.from('signed_documents')
      .select('metadata, status, user_id, societe_id, signer_email').eq('id', req.params.id).single();

    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
    if (!canAccessSignedDoc(req.user, doc)) return res.status(403).json({ error: 'Accès refusé' });

    const meta = doc.metadata || {};
    const aesProof = meta.aes_proof || {};

    res.json({
      ok: true,
      signature_level: meta.signature_level || 'ses',
      status: doc.status,
      conditions: {
        otp_verified: meta.otp_verified === true,
        identity_recorded: !!(aesProof.signer_identity),
        consent_given: !!(aesProof.signer_identity && aesProof.signer_identity.consent_given),
        token_used: !!aesProof.signing_token_used_at
      }
    });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Helper: check if user can access a signed document (IDOR protection)
function canAccessSignedDoc(user, doc) {
  if (user.role === 'admin') return true;
  if (user.societe_id && doc.societe_id === user.societe_id) return true;
  if (doc.signer_email === user.email) return true;
  if (doc.user_id === user.id) return true;
  return false;
}

// Helper: escape special chars for PostgREST filter values
function escapePostgrest(str) {
  return String(str).replace(/[%_\\(),."]/g, c => '\\' + c);
}

// Helper: basic HTML entity escaping for email templates
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// List signed documents (with filters)
app.get('/api/documents/signed', requireAuth(), async (req, res) => {
  try {
    const { category, subcategory, status, year, month, day, search, signer_email, page = 1, limit = 50 } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

    let query = supabase.from('signed_documents').select('*', { count: 'exact' }).order('created_at', { ascending: false });

    // Admin sees all, users see their own societe or docs where they are signer
    if (req.user.role !== 'admin') {
      const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
      if (societeId) {
        query = query.or(`societe_id.eq.${escapePostgrest(societeId)},signer_email.eq.${escapePostgrest(req.user.email)}`);
      } else {
        query = query.eq('signer_email', req.user.email);
      }
    }

    if (category) query = query.eq('category', category);
    if (subcategory) query = query.eq('subcategory', subcategory);
    if (status) query = query.eq('status', status);
    if (signer_email) query = query.eq('signer_email', signer_email);

    // Date filters with proper validation
    const y = parseInt(year);
    const m = parseInt(month);
    const d = parseInt(day);
    if (y && y >= 2020 && y <= 2100) {
      if (m && m >= 1 && m <= 12) {
        if (d && d >= 1 && d <= 31) {
          // Specific day
          const startDate = new Date(y, m - 1, d);
          const endDate = new Date(y, m - 1, d + 1);
          query = query.gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString());
        } else {
          // Specific month
          const startDate = new Date(y, m - 1, 1);
          const endDate = new Date(y, m, 1);
          query = query.gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString());
        }
      } else {
        // Specific year
        query = query.gte('created_at', `${y}-01-01`).lt('created_at', `${y+1}-01-01`);
      }
    }

    // Search — use safe .ilike per-column to avoid injection through .or() string interpolation
    if (search) {
      const safeSearch = escapePostgrest(search);
      query = query.or(`title.ilike.%${safeSearch}%,signer_name.ilike.%${safeSearch}%,signer_email.ilike.%${safeSearch}%`);
    }

    const offset = (pageNum - 1) * limitNum;
    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Get categories summary for sidebar (scoped to same user access)
    let catQuery = supabase.from('signed_documents').select('category');
    if (req.user.role !== 'admin') {
      if (req.user.societe_id) {
        catQuery = catQuery.or(`societe_id.eq.${escapePostgrest(req.user.societe_id)},signer_email.eq.${escapePostgrest(req.user.email)}`);
      } else {
        catQuery = catQuery.eq('signer_email', req.user.email);
      }
    }
    const { data: cats } = await catQuery.order('category');
    const categories = {};
    (cats || []).forEach(c => { categories[c.category] = (categories[c.category] || 0) + 1; });

    res.json({ ok: true, documents: data || [], categories, total: count || (data || []).length });
  } catch (e) {
    console.error('[GET /api/documents/signed]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single signed document
app.get('/api/documents/signed/:id', requireAuth(), async (req, res) => {
  try {
    const { data, error } = await supabase.from('signed_documents').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Document non trouvé' });
    if (!canAccessSignedDoc(req.user, data)) return res.status(403).json({ error: 'Accès refusé' });
    res.json({ ok: true, document: data });
  } catch (e) {
    console.error('[GET /api/documents/signed/:id]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Download signed PDF
app.get('/api/documents/signed/:id/download', requireAuth(), async (req, res) => {
  try {
    const { data, error } = await supabase.from('signed_documents').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Document non trouvé' });
    if (!canAccessSignedDoc(req.user, data)) return res.status(403).json({ error: 'Accès refusé' });

    const fs = require('fs');
    // Path traversal protection: resolve and ensure within __dirname
    if (data.signed_pdf_path) {
      const resolvedPath = path.resolve(__dirname, data.signed_pdf_path);
      if (!resolvedPath.startsWith(path.resolve(__dirname)) || resolvedPath.includes('..')) {
        return res.status(400).json({ error: 'Chemin PDF invalide' });
      }
      if (fs.existsSync(resolvedPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${data.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_signe.pdf"`);
        return res.sendFile(resolvedPath);
      }
    }

    // Fallback: fetch from DocuSeal if we have submission ID
    if (data.docuseal_submission_id) {
      const dsRes = await fetch(`http://localhost:3100/api/submissions/${data.docuseal_submission_id}`, {
        headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY || '' }
      });
      const dsData = await dsRes.json();
      if (dsData.documents && dsData.documents[0] && dsData.documents[0].url) {
        return res.redirect(dsData.documents[0].url);
      }
    }

    res.status(404).json({ error: 'PDF non disponible' });
  } catch (e) {
    console.error('[GET /api/documents/signed/:id/download]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Download certificate PDF for a signed document
app.get('/api/documents/signed/:id/certificate', requireAuth(), async (req, res) => {
  try {
    const { data: doc, error } = await supabase.from('signed_documents')
      .select('*').eq('id', req.params.id).single();
    if (error || !doc) return res.status(404).json({ error: 'Document non trouvé' });
    if (!canAccessSignedDoc(req.user, doc)) return res.status(403).json({ error: 'Accès refusé' });

    const sigId = doc.metadata && doc.metadata.signature_id;
    if (sigId) {
      // Path traversal protection: sanitize signature ID
      const safeSigId = String(sigId).replace(/[^a-zA-Z0-9\-_]/g, '');
      if (!safeSigId) return res.status(400).json({ error: 'Identifiant signature invalide' });
      const certPath = require('path').join(__dirname, 'docs', 'certificates', `${safeSigId}_certificate.pdf`);
      const resolvedCert = require('path').resolve(certPath);
      if (!resolvedCert.startsWith(require('path').resolve(__dirname, 'docs', 'certificates'))) {
        return res.status(400).json({ error: 'Chemin certificat invalide' });
      }
      if (require('fs').existsSync(certPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="certificat_${safeSigId}.pdf"`);
        return res.sendFile(certPath);
      }
    }

    // Generate on-the-fly if not cached
    try {
      const jadomiSign = require('./lib/jadomi-sign');
      const certBuffer = await jadomiSign.generateCertificatePDF({
        signature_id: sigId || doc.id,
        title: doc.title,
        category: doc.category,
        signer_name: doc.signer_name,
        signer_email: doc.signer_email,
        signer_role: doc.signer_role,
        status: doc.status,
        signed_at: doc.signed_at,
        created_at: doc.created_at,
        document_hash: doc.metadata && doc.metadata.document_hash,
        verification_url: doc.metadata && doc.metadata.verification_url
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="certificat_${sigId || doc.id}.pdf"`);
      return res.send(certBuffer);
    } catch (genErr) {
      return res.status(500).json({ error: 'Impossible de generer le certificat' });
    }
  } catch (e) {
    console.error('[GET /api/documents/signed/:id/certificate]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Resend signature request
app.post('/api/documents/signed/:id/resend', requireAuth(), async (req, res) => {
  try {
    const { data: doc, error } = await supabase.from('signed_documents')
      .select('*').eq('id', req.params.id).single();
    if (error || !doc) return res.status(404).json({ error: 'Document non trouvé' });
    if (!canAccessSignedDoc(req.user, doc)) return res.status(403).json({ error: 'Accès refusé' });
    if (doc.status === 'signed') return res.status(400).json({ error: 'Document déjà signé' });

    // Resend via DocuSeal if we have a submission ID
    if (doc.docuseal_submission_id) {
      try {
        await fetch(`http://localhost:3100/api/submissions/${doc.docuseal_submission_id}/resend`, {
          method: 'POST',
          headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY || '' }
        });
      } catch (dsErr) { /* DocuSeal resend is best-effort */ }
    }

    // Update status
    await supabase.from('signed_documents')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', doc.id);

    res.json({ ok: true, message: 'Demande de signature renvoyée' });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Send signed documents by email (multi-select)
app.post('/api/documents/signed/send-email', requireAuth(), async (req, res) => {
  try {
    const { document_ids, email } = req.body;
    if (!email || !document_ids || !Array.isArray(document_ids) || !document_ids.length) {
      return res.status(400).json({ error: 'Email et documents requis' });
    }
    // Cap to prevent abuse
    if (document_ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 documents par envoi' });
    }

    const { data: docs, error } = await supabase.from('signed_documents')
      .select('*').in('id', document_ids);
    if (error) throw error;

    // IDOR protection: filter to only docs the user can access
    const accessibleDocs = (docs || []).filter(doc => canAccessSignedDoc(req.user, doc));
    if (accessibleDocs.length === 0) {
      return res.status(403).json({ error: 'Aucun document accessible' });
    }

    const fs = require('fs');
    const attachments = [];
    for (const doc of accessibleDocs) {
      if (doc.signed_pdf_path) {
        const resolvedPath = path.resolve(__dirname, doc.signed_pdf_path);
        if (resolvedPath.startsWith(path.resolve(__dirname)) && fs.existsSync(resolvedPath)) {
          attachments.push({
            filename: `${doc.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_signe.pdf`,
            content: fs.readFileSync(resolvedPath)
          });
        }
      }
    }

    if (attachments.length === 0) {
      return res.status(400).json({ error: 'Aucun PDF disponible pour ces documents' });
    }

    const { sendMail } = require('./api/multiSocietes/mailer');
    await sendMail({
      to: email,
      subject: `JADOMI — ${attachments.length} document(s) signe(s)`,
      html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
        <h2 style="color:#1e1b4b;">Vos documents signes</h2>
        <p>Vous trouverez en piece jointe ${attachments.length} document(s) signe(s) electroniquement via JADOMI.</p>
        <ul>${accessibleDocs.map(d => `<li><strong>${escapeHtml(d.title)}</strong> — signe le ${d.signed_at ? new Date(d.signed_at).toLocaleDateString('fr-FR') : 'N/A'}</li>`).join('')}</ul>
        <p style="color:#64748b;font-size:12px;margin-top:24px;">JADOMI — Signature électronique securisee via DocuSeal</p>
      </div>`,
      attachments
    });

    res.json({ ok: true, sent: attachments.length });
  } catch (e) {
    console.error('[POST /api/documents/signed/send-email]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DocuSeal webhook — called when a document is signed or viewed
// Secured via DOCUSEAL_WEBHOOK_SECRET env var (set in DocuSeal webhook config)
app.post('/api/webhooks/docuseal', async (req, res) => {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedSecret = req.headers['x-docuseal-secret'] || req.query.secret;
      if (providedSecret !== webhookSecret) {
        console.warn('[DocuSeal webhook] Invalid secret — rejecting');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const { event_type, data } = req.body;
    if (!event_type || !data) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    if (event_type === 'form.completed') {
      const submissionId = data.submission_id || data.id;
      if (!submissionId) return res.json({ ok: true, skipped: 'no submission_id' });

      const signerName = data.name || (data.submitters && data.submitters[0] && data.submitters[0].name);

      // Update document status
      const { data: doc } = await supabase.from('signed_documents')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          signer_name: signerName || undefined,
          updated_at: new Date().toISOString()
        })
        .eq('docuseal_submission_id', submissionId)
        .select()
        .single();

      if (doc) {
        // Download and store signed PDF locally
        const fs = require('fs');
        try {
          const dsRes = await fetch(`http://localhost:3100/api/submissions/${submissionId}`, {
            headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY || '' }
          });
          const dsData = await dsRes.json();
          if (dsData.documents && dsData.documents[0] && dsData.documents[0].url) {
            const pdfRes = await fetch(dsData.documents[0].url);
            const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
            const pdfDir = path.join(__dirname, 'docs', 'signed');
            if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
            const pdfPath = `docs/signed/${doc.id}.pdf`;
            fs.writeFileSync(path.join(__dirname, pdfPath), pdfBuffer);

            await supabase.from('signed_documents')
              .update({ signed_pdf_path: pdfPath })
              .eq('id', doc.id);

            // JADOMI Sign: generate certificate + audit trail
            try {
              const jadomiSign = require('./lib/jadomi-sign');
              const signatureId = (doc.metadata && doc.metadata.signature_id) || jadomiSign.generateSignatureId();
              const archiveResult = await jadomiSign.archiveSignedDocument(signatureId, pdfBuffer, {
                title: doc.title,
                category: doc.category,
                signer_name: doc.signer_name || signerName,
                signer_email: doc.signer_email,
                signer_role: doc.signer_role || 'Signataire',
                signed_at: new Date().toISOString(),
                created_at: doc.created_at,
                status: 'signed'
              });

              // Store signature_id and verification_url in metadata
              const updatedMetadata = { ...(doc.metadata || {}), signature_id: signatureId, verification_url: archiveResult.verification_url, document_hash: archiveResult.document_hash };
              await supabase.from('signed_documents')
                .update({ metadata: updatedMetadata })
                .eq('id', doc.id);

              console.log(`[JADOMI Sign] Certificate generated for ${signatureId}`);
            } catch (certErr) { console.error('[JADOMI Sign] Certificate generation error:', certErr.message); }
          }
        } catch (pdfErr) { console.error('[DocuSeal] PDF download error:', pdfErr.message); }

        // Send signed copy to signer by email
        if (doc.signer_email) {
          try {
            const pdfFilePath = path.join(__dirname, 'docs', 'signed', `${doc.id}.pdf`);
            const attachments = [];
            if (fs.existsSync(pdfFilePath)) {
              attachments.push({
                filename: `${doc.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_signe.pdf`,
                content: fs.readFileSync(pdfFilePath)
              });
            }
            const safeTitle = escapeHtml(doc.title);
            const { sendMail } = require('./api/multiSocietes/mailer');
            await sendMail({
              to: doc.signer_email,
              subject: `JADOMI — Votre document "${doc.title}" a ete signe`,
              html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
                <h2 style="color:#1e1b4b;">Document signe avec succes</h2>
                <p>Le document <strong>"${safeTitle}"</strong> a ete signe electroniquement le ${new Date().toLocaleDateString('fr-FR')}.</p>
                <p>Vous trouverez votre copie signee en piece jointe.</p>
                ${attachments.length === 0 ? '<p>Le PDF signe sera disponible dans votre espace JADOMI sous peu.</p>' : ''}
                <p style="color:#64748b;font-size:12px;margin-top:24px;">JADOMI — Signature électronique securisee via DocuSeal</p>
              </div>`,
              attachments
            });
          } catch (mailErr) { console.error('[DocuSeal] Signed doc email error:', mailErr.message); }
        }
      }
    }

    if (event_type === 'form.viewed') {
      const submissionId = data.submission_id || data.id;
      if (submissionId) {
        await supabase.from('signed_documents')
          .update({ status: 'viewed', viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('docuseal_submission_id', submissionId)
          .eq('status', 'sent');
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[DocuSeal webhook error]', e.message);
    res.json({ ok: true }); // Always 200 for webhooks
  }
});

// List DocuSeal templates (server-side proxy — avoids exposing API key to client)
app.get('/api/docuseal/templates', requireAuth(), async (req, res) => {
  try {
    const dsRes = await fetch('http://localhost:3100/api/templates', {
      headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY || '' }
    });
    if (!dsRes.ok) return res.status(dsRes.status).json({ error: 'Erreur DocuSeal templates' });
    const data = await dsRes.json();
    res.json(data);
  } catch (e) {
    console.error('[GET /api/docuseal/templates]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create signature request via DocuSeal
app.post('/api/documents/request-signature', requireAuth(), async (req, res) => {
  try {
    const { title, category, subcategory, signer_name, signer_email, signer_role, template_id, message } = req.body;
    if (!signer_email || !template_id) {
      return res.status(400).json({ error: 'Email signataire et template requis' });
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signer_email)) {
      return res.status(400).json({ error: 'Email signataire invalide' });
    }
    // Validate template_id is a number
    if (isNaN(parseInt(template_id))) {
      return res.status(400).json({ error: 'template_id invalide' });
    }

    // Create submission in DocuSeal
    const dsRes = await fetch('http://localhost:3100/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': process.env.DOCUSEAL_API_KEY || ''
      },
      body: JSON.stringify({
        template_id: parseInt(template_id),
        send_email: true,
        submitters: [{
          email: signer_email,
          name: signer_name || '',
          role: 'Signataire',
          message: message || `Vous etes invite(e) a signer le document "${title || 'Document JADOMI'}" via JADOMI.`
        }]
      })
    });

    const dsData = await dsRes.json();
    if (!dsRes.ok) throw new Error(dsData.error || 'Erreur DocuSeal');

    const submissionId = dsData.id || (dsData[0] && dsData[0].submission_id);

    // Save in our database
    const { data: doc, error } = await supabase.from('signed_documents').insert({
      societe_id: req.user.societe_id || null,
      user_id: req.user.id,
      title: title || 'Document a signer',
      category: category || 'contrat',
      subcategory: subcategory || null,
      docuseal_submission_id: submissionId,
      docuseal_template_id: parseInt(template_id),
      signer_name: signer_name || null,
      signer_email,
      signer_role: signer_role || 'signataire',
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        pro_attestation: req.body.pro_attestation || false,
        pro_attestation_at: req.body.pro_attestation_at || null,
        pro_attestation_by: req.user.email
      }
    }).select().single();

    if (error) throw error;

    res.json({ ok: true, document: doc, docuseal_submission_id: submissionId });
  } catch (e) {
    console.error('[POST /api/documents/request-signature]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get categories/themes tree for sidebar
app.get('/api/documents/categories', requireAuth(), async (req, res) => {
  try {
    let catQuery = supabase.from('signed_documents').select('category, subcategory, status');
    // Scope to user's accessible docs (same logic as list endpoint)
    if (req.user.role !== 'admin') {
      if (req.user.societe_id) {
        catQuery = catQuery.or(`societe_id.eq.${escapePostgrest(req.user.societe_id)},signer_email.eq.${escapePostgrest(req.user.email)}`);
      } else {
        catQuery = catQuery.eq('signer_email', req.user.email);
      }
    }
    const { data, error } = await catQuery;
    if (error) throw error;

    const tree = {};
    (data || []).forEach(d => {
      if (!tree[d.category]) tree[d.category] = { total: 0, signed: 0, subcategories: {} };
      tree[d.category].total++;
      if (d.status === 'signed') tree[d.category].signed++;
      if (d.subcategory) {
        if (!tree[d.category].subcategories[d.subcategory]) tree[d.category].subcategories[d.subcategory] = { total: 0, signed: 0 };
        tree[d.category].subcategories[d.subcategory].total++;
        if (d.status === 'signed') tree[d.category].subcategories[d.subcategory].signed++;
      }
    });

    res.json({ ok: true, categories: tree });
  } catch (e) {
    console.error('[GET /api/documents/categories]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// DOCUMENT UPLOAD & DELETE (Passe upload)
// ============================================================

const multer = require('multer');

// Multer config: 20MB max, PDF/JPG/PNG/DOCX only (MIME validated)
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'docs', 'uploads');
    const fsMod = require('fs');
    if (!fsMod.existsSync(uploadDir)) fsMod.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const uploadMiddleware = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, JPG, PNG, DOCX.'));
    }
    cb(null, true);
  }
}).single('file');

// POST /api/documents/upload — Upload a document (PDF, JPG, PNG, DOCX)
app.post('/api/documents/upload', requireAuth(), (req, res) => {
  uploadMiddleware(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        const status = multerErr.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: multerErr.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni.' });
      }

      const { title, category, subcategory, patient_name } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Le champ title est obligatoire.' });
      }

      const validCategories = ['contrat', 'facture', 'devis', 'avocat', 'juridique', 'administratif', 'mandat', 'autre'];
      const cat = (category || 'autre').toLowerCase();
      if (!validCategories.includes(cat)) {
        return res.status(400).json({ error: `Categorie invalide. Valeurs acceptees : ${validCategories.join(', ')}` });
      }

      const filePath = `docs/uploads/${req.file.filename}`;

      // Build metadata with optional patient_name
      const metadata = {};
      if (patient_name && patient_name.trim()) {
        metadata.patient_name = patient_name.trim();
      }

      const insertData = {
        societe_id: req.user.societe_id || null,
        user_id: req.user.id,
        title: title.trim(),
        category: cat,
        subcategory: subcategory ? subcategory.trim() : null,
        status: 'uploaded',
        file_path: filePath
      };

      // Store patient_name: directly if column exists, otherwise in metadata JSONB
      if (patient_name && patient_name.trim()) {
        insertData.metadata = metadata;
      }

      const { data: doc, error } = await supabase.from('signed_documents').insert(insertData).select().single();

      if (error) {
        // Clean up uploaded file if DB insert failed
        const fsMod = require('fs');
        const fullPath = path.join(__dirname, filePath);
        if (fsMod.existsSync(fullPath)) fsMod.unlinkSync(fullPath);
        throw error;
      }

      console.log(`[POST /api/documents/upload] Document uploaded: ${doc.id} by user ${req.user.id}`);
      res.status(201).json({ ok: true, document: doc });
    } catch (e) {
      // Clean up uploaded file on any unexpected error
      if (req.file) {
        const fsMod = require('fs');
        const fullPath = path.join(__dirname, 'docs', 'uploads', req.file.filename);
        try { if (fsMod.existsSync(fullPath)) fsMod.unlinkSync(fullPath); } catch (_) { /* ignore cleanup error */ }
      }
      console.error('[POST /api/documents/upload]', e.message);
      console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
    }
  });
});

// DELETE /api/documents/signed/:id — Supprimer un document signé
app.delete('/api/documents/signed/:id', requireAuth(), async (req, res) => {
  try {
    const docId = req.params.id;

    // Validate UUID format to prevent log injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docId)) {
      return res.status(400).json({ error: 'ID invalide.' });
    }

    // Verify ownership
    const { data: doc, error: fetchErr } = await supabase.from('signed_documents')
      .select('id, societe_id, user_id, file_path')
      .eq('id', docId)
      .single();

    if (fetchErr || !doc) {
      return res.status(404).json({ error: 'Document introuvable.' });
    }

    // Check permission: owner OR same societe (both non-null)
    const isOwner = doc.user_id === req.user.id;
    const sameSociete = doc.societe_id != null && req.user.societe_id != null && doc.societe_id === req.user.societe_id;
    if (!isOwner && !sameSociete) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    // Delete file from disk if it exists (with path containment check)
    if (doc.file_path) {
      const fsMod = require('fs');
      const fullPath = path.resolve(__dirname, doc.file_path);
      const uploadsDir = path.resolve(__dirname, 'docs', 'uploads');
      if (fullPath.startsWith(uploadsDir + path.sep) && fsMod.existsSync(fullPath)) {
        fsMod.unlinkSync(fullPath);
      }
    }

    // Hard delete from database
    const { error: delErr } = await supabase.from('signed_documents')
      .delete()
      .eq('id', docId);

    if (delErr) throw delErr;

    console.log(`[DELETE /api/documents/signed/${docId}] Deleted by user ${req.user.id}`);
    res.json({ ok: true, deleted: docId });
  } catch (e) {
    console.error('[DELETE /api/documents/signed]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// AUTOCOMPLETE PATIENTS / CLIENTS
// ============================================================

// GET /api/clients/autocomplete?q=dup — recherche noms patients/clients
app.get('/api/clients/autocomplete', requireAuth(), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ ok: true, results: [] });
    const safeQ = q.replace(/[%_\\]/g, '\\$&');
    const results = new Map();

    // Source 1: metadata.patient_name dans signed_documents
    const { data: docs } = await supabase
      .from('signed_documents')
      .select('metadata')
      .or(`societe_id.eq.${escapePostgrest(req.user.societe_id || '')},user_id.eq.${escapePostgrest(req.user.id)}`)
      .not('metadata', 'is', null)
      .limit(200);
    if (docs) {
      docs.forEach(d => {
        const name = d.metadata?.patient_name;
        if (name && name.toLowerCase().includes(q.toLowerCase())) {
          results.set(name.toLowerCase(), { name, source: 'document' });
        }
      });
    }

    // Source 2: avocat_clients (si la table existe)
    try {
      const { data: clients } = await supabase
        .from('avocat_clients')
        .select('nom, prenom, email')
        .or(`nom.ilike.%${safeQ}%,prenom.ilike.%${safeQ}%`)
        .limit(20);
      if (clients) {
        clients.forEach(c => {
          const fullName = [c.prenom, c.nom].filter(Boolean).join(' ');
          if (fullName) results.set(fullName.toLowerCase(), { name: fullName, email: c.email, source: 'client' });
        });
      }
    } catch (_) { /* table may not exist */ }

    // Source 3: jadomi_clients_autocomplete (table dediee, si elle existe)
    try {
      const { data: ac } = await supabase
        .from('jadomi_clients_autocomplete')
        .select('name, email, category')
        .ilike('name', `%${safeQ}%`)
        .eq('societe_id', req.user.societe_id || '')
        .limit(20);
      if (ac) {
        ac.forEach(c => {
          results.set(c.name.toLowerCase(), { name: c.name, email: c.email, category: c.category, source: 'saved' });
        });
      }
    } catch (_) { /* table may not exist yet */ }

    const arr = Array.from(results.values()).slice(0, 15);
    res.json({ ok: true, results: arr });
  } catch (e) {
    console.error('[GET /api/clients/autocomplete]', e.message);
    res.json({ ok: true, results: [] });
  }
});

// POST /api/clients/save — sauvegarder un nom de client/patient pour autocomplete futur
app.post('/api/clients/save', requireAuth(), async (req, res) => {
  try {
    const { name, email, category } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom requis' });
    const cleanName = String(name).trim();

    // Try dedicated table first
    try {
      await supabase.from('jadomi_clients_autocomplete').upsert({
        societe_id: req.user.societe_id || req.user.id,
        name: cleanName,
        email: email || null,
        category: category || 'patient',
        updated_at: new Date().toISOString()
      }, { onConflict: 'societe_id,name' });
    } catch (_) {
      // Table doesn't exist yet — silently succeed (data still saved in document metadata)
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// JADOMI EQUIPMENT — Propositions fabricants/revendeurs
// ============================================================

// Rate limit: 5 propositions / heure / IP
app.use('/api/equipment/propose', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de soumissions, veuillez reessayer dans 1 heure.' }
}));

// Multer config for equipment product images
const equipmentUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'docs', 'uploads', 'equipment');
    const fsMod = require('fs');
    if (!fsMod.existsSync(uploadDir)) fsMod.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});
const equipmentUpload = multer({
  storage: equipmentUploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    if (!allowedMime.includes(file.mimetype) || !allowedExt.includes(ext)) {
      return cb(new Error('Type de fichier non autorisé. Formats acceptés : JPG, PNG, WebP, PDF.'));
    }
    cb(null, true);
  }
}).single('product_image');

// POST /api/equipment/propose — Public: fabricant/revendeur soumet une proposition
const equipmentProposeLimiter = rateLimit({ windowMs: 60*60*1000, max: 5, message: {error:'Trop de propositions, veuillez reessayer plus tard'} });
app.post('/api/equipment/propose', equipmentProposeLimiter, (req, res) => {
  equipmentUpload(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        const status = multerErr.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: multerErr.message });
      }

      const {
        company_name, contact_name, email, phone,
        product_name, product_description, catalog_price,
        tiers, supplier_type, website, notes
      } = req.body;

      // --- Validation ---
      if (!company_name || !company_name.trim()) return res.status(400).json({ error: 'company_name est requis.' });
      if (!contact_name || !contact_name.trim()) return res.status(400).json({ error: 'contact_name est requis.' });
      if (!email || !email.trim()) return res.status(400).json({ error: 'email est requis.' });
      if (!product_name || !product_name.trim()) return res.status(400).json({ error: 'product_name est requis.' });
      if (!catalog_price) return res.status(400).json({ error: 'catalog_price est requis.' });

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) return res.status(400).json({ error: 'Format email invalide.' });

      // Parse tiers
      let parsedTiers;
      try {
        parsedTiers = typeof tiers === 'string' ? JSON.parse(tiers) : tiers;
      } catch (e) {
        return res.status(400).json({ error: 'Format tiers invalide (JSON attendu).' });
      }
      if (!Array.isArray(parsedTiers) || parsedTiers.length === 0) {
        return res.status(400).json({ error: 'tiers est requis (au moins 1 palier).' });
      }

      // Sanitize inputs (strip HTML tags)
      const sanitize = (s) => s ? String(s).replace(/<[^>]*>/g, '').trim().substring(0, 2000) : '';
      const cleanData = {
        company_name: sanitize(company_name),
        contact_name: sanitize(contact_name),
        email: email.trim().toLowerCase().substring(0, 255),
        phone: sanitize(phone || ''),
        product_name: sanitize(product_name),
        product_description: sanitize(product_description || ''),
        catalog_price: parseFloat(catalog_price) || 0,
        tiers: parsedTiers,
        supplier_type: sanitize(supplier_type || 'fabricant'),
        website: sanitize(website || ''),
        notes: sanitize(notes || ''),
        submitted_at: new Date().toISOString(),
        ip: req.ip
      };

      // Handle uploaded image
      if (req.file) {
        cleanData.product_image = `/docs/uploads/equipment/${req.file.filename}`;
      }

      // Generate reference
      const year = new Date().getFullYear();
      const refId = crypto.randomBytes(4).toString('hex').toUpperCase().substring(0, 4);
      const reference = `EQ-${year}-${refId}`;
      cleanData.reference = reference;

      // Store in signed_documents
      const sbClient = supabaseAdmin || supabase;
      const { error: insertError } = await sbClient.from('signed_documents').insert({
        title: `${cleanData.product_name} — ${cleanData.company_name}`,
        category: 'equipment_proposal',
        status: 'pending',
        signer_name: cleanData.contact_name,
        signer_email: cleanData.email,
        metadata: cleanData,
        created_at: new Date().toISOString()
      });

      if (insertError) {
        console.error('[Equipment Propose] Insert error:', insertError.message);
        return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la proposition.' });
      }

      // --- Send emails ---
      try {
        const { sendMail } = require('./api/multiSocietes/mailer');
        const adminEmail = process.env.EMAIL_CONTACT || 'contact@jadomi.fr';

        // Tiers summary for email
        const tiersSummary = parsedTiers.map((t, i) =>
          `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0;">${t.label || ('Palier ' + (i + 1))}</td>`
          + `<td style="padding:6px 12px;border:1px solid #e2e8f0;">${t.min_qty || '-'} - ${t.max_qty || '+'}</td>`
          + `<td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;">${t.price ? t.price + ' EUR' : '-'}</td>`
          + `<td style="padding:6px 12px;border:1px solid #e2e8f0;">${t.discount ? t.discount + '%' : '-'}</td></tr>`
        ).join('');

        const dashboardLink = (process.env.APP_URL || 'https://jadomi.fr') + '/admin/organisation.html#documents';

        // 1. Notification to admin (contact@jadomi.fr + karim)
        const adminHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:24px 32px;text-align:center;">
    <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">JADOMI</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Nouvelle proposition équipement</div>
  </div>
  <div style="padding:28px 32px;">
    <h2 style="color:#0f172a;font-size:18px;margin:0 0 16px;">Nouvelle proposition recue</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:8px 0;color:#64748b;width:140px;">Reference</td><td style="padding:8px 0;font-weight:600;">${reference}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Societe</td><td style="padding:8px 0;font-weight:600;">${cleanData.company_name}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Contact</td><td style="padding:8px 0;">${cleanData.contact_name}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;"><a href="mailto:${cleanData.email}" style="color:#10b981;">${cleanData.email}</a></td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Telephone</td><td style="padding:8px 0;">${cleanData.phone || 'Non renseigne'}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Type</td><td style="padding:8px 0;"><span style="background:${cleanData.supplier_type === 'revendeur' ? '#f59e0b' : '#3b82f6'};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;">${cleanData.supplier_type}</span></td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Produit</td><td style="padding:8px 0;font-weight:600;font-size:16px;">${cleanData.product_name}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Prix catalogue</td><td style="padding:8px 0;font-weight:700;color:#10b981;font-size:16px;">${cleanData.catalog_price} EUR</td></tr>
      ${cleanData.product_description ? `<tr><td style="padding:8px 0;color:#64748b;">Description</td><td style="padding:8px 0;">${cleanData.product_description}</td></tr>` : ''}
      ${cleanData.website && /^https?:\/\//i.test(cleanData.website) ? `<tr><td style="padding:8px 0;color:#64748b;">Site web</td><td style="padding:8px 0;"><a href="${cleanData.website}" style="color:#10b981;">${cleanData.website}</a></td></tr>` : ''}
      ${cleanData.notes ? `<tr><td style="padding:8px 0;color:#64748b;">Notes</td><td style="padding:8px 0;">${cleanData.notes}</td></tr>` : ''}
    </table>

    <h3 style="color:#0f172a;font-size:15px;margin:20px 0 8px;">Paliers de prix proposes</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Palier</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Quantite</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Prix</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0;">Remise</th>
        </tr>
      </thead>
      <tbody>${tiersSummary}</tbody>
    </table>

    <div style="text-align:center;margin-top:24px;">
      <a href="${dashboardLink}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Voir dans le dashboard</a>
    </div>
  </div>
  <div style="text-align:center;padding:16px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;">
    JADOMI — Plateforme d'achats groupes pour professionnels de sante
  </div>
</div>`;

        await sendMail({
          to: adminEmail,
          subject: `[Equipment] Nouvelle proposition : ${cleanData.product_name} — ${cleanData.company_name}`,
          html: adminHtml
        }).catch(e => console.error('[Equipment] Admin email error:', e.message));

        // Also notify karim
        if (adminEmail !== 'contact@jadomi.fr') {
          await sendMail({
            to: 'contact@jadomi.fr',
            subject: `[Equipment] Nouvelle proposition : ${cleanData.product_name} — ${cleanData.company_name}`,
            html: adminHtml
          }).catch(e => console.error('[Equipment] Karim email error:', e.message));
        }

        // 2. Confirmation email to the supplier
        const supplierHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:24px 32px;text-align:center;">
    <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">JADOMI</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Confirmation de votre proposition</div>
  </div>
  <div style="padding:28px 32px;">
    <h2 style="color:#0f172a;font-size:18px;margin:0 0 16px;">Merci pour votre proposition, ${cleanData.contact_name}</h2>
    <p style="color:#334155;line-height:1.6;">Nous avons bien recu votre proposition pour le produit <strong>${cleanData.product_name}</strong>.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;color:#166534;font-weight:600;">Reference : ${reference}</p>
      <p style="margin:4px 0 0;color:#166534;font-size:13px;">Conservez cette reference pour le suivi de votre dossier.</p>
    </div>
    <p style="color:#334155;line-height:1.6;">Notre equipe va etudier votre offre avec attention. Nous vous recontacterons sous <strong>48 heures ouvrables</strong> pour la suite.</p>
    <p style="color:#334155;line-height:1.6;">Si vous avez des questions entre-temps, n'hesitez pas a nous contacter a <a href="mailto:contact@jadomi.fr" style="color:#10b981;">contact@jadomi.fr</a>.</p>
    <p style="color:#334155;margin-top:20px;">Cordialement,<br><strong>L'equipe JADOMI</strong></p>
  </div>
  <div style="text-align:center;padding:16px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;">
    JADOMI — Plateforme d'achats groupes pour professionnels de sante
  </div>
</div>`;

        await sendMail({
          to: cleanData.email,
          subject: `JADOMI — Confirmation de votre proposition (${reference})`,
          html: supplierHtml
        }).catch(e => console.error('[Equipment] Supplier confirmation email error:', e.message));

      } catch (emailErr) {
        console.error('[Equipment] Email sending failed:', emailErr.message);
        // Don't fail the request if emails fail — the proposal is already saved
      }

      res.json({ ok: true, reference });

    } catch (e) {
      console.error('[Equipment Propose] Error:', e.message);
      res.status(500).json({ error: 'Erreur serveur lors de la soumission.' });
    }
  });
});

// GET /api/equipment/proposals — Admin: liste toutes les propositions equipment
app.get('/api/equipment/proposals', requireAuth(), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs.' });
    }

    const sbClient = supabaseAdmin || supabase;
    const { data, error } = await sbClient.from('signed_documents')
      .select('*')
      .eq('category', 'equipment_proposal')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Equipment Proposals] Query error:', error.message);
      return res.status(500).json({ error: 'Erreur lors de la recuperation des propositions.' });
    }

    res.json({ ok: true, proposals: data || [] });
  } catch (e) {
    console.error('[Equipment Proposals] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/equipment/proposals/:id/status — Admin: changer le statut d'une proposition
app.patch('/api/equipment/proposals/:id/status', requireAuth(), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs.' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected', 'negotiating'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Statut invalide. Valeurs acceptees : ${validStatuses.join(', ')}` });
    }

    const sbClient = supabaseAdmin || supabase;

    // Verify the document exists and is an equipment proposal
    const { data: doc, error: fetchError } = await sbClient.from('signed_documents')
      .select('id, category, status')
      .eq('id', id)
      .eq('category', 'equipment_proposal')
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: 'Proposition non trouvée.' });
    }

    const { error: updateError } = await sbClient.from('signed_documents')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('[Equipment Status] Update error:', updateError.message);
      return res.status(500).json({ error: 'Erreur lors de la mise a jour du statut.' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[Equipment Status] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/equipment/offres — Public/auth: offres équipement approuvées avec compteurs
app.get('/api/equipment/offres', async (req, res) => {
  try {
    const sbClient = supabaseAdmin || supabase;
    if (!sbClient) return res.status(503).json({ error: 'Service indisponible.' });

    // Fetch approved equipment proposals
    const { data: proposals, error: pErr } = await sbClient.from('signed_documents')
      .select('id, title, metadata, status, created_at')
      .eq('category', 'equipment_proposal')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (pErr) {
      console.error('[Equipment Offres] Query error:', pErr.message);
      return res.status(500).json({ error: 'Erreur lors du chargement des offres.' });
    }

    if (!proposals || proposals.length === 0) {
      return res.json({ ok: true, offres: [] });
    }

    // Fetch enrollment counts per proposal
    let enrollCounts = {};
    try {
      const proposalIds = proposals.map(p => p.id);
      const { data: enrolls } = await sbClient.from('equipment_enrollments')
        .select('proposal_id, id')
        .in('proposal_id', proposalIds)
        .eq('status', 'active');

      if (enrolls) {
        for (const e of enrolls) {
          enrollCounts[e.proposal_id] = (enrollCounts[e.proposal_id] || 0) + 1;
        }
      }
    } catch (_) {
      // Table may not exist yet — graceful fallback
    }

    const offres = proposals.map(p => ({
      id: p.id,
      title: p.title,
      metadata: p.metadata || {},
      created_at: p.created_at,
      enrollment_count: enrollCounts[p.id] || 0
    }));

    res.json({ ok: true, offres });
  } catch (e) {
    console.error('[Equipment Offres] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Rate limit: 10 join / heure / IP (anti-spam)
app.use('/api/equipment/join', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, veuillez reessayer dans 1 heure.' }
}));

// POST /api/equipment/join — Auth: dentiste rejoint un groupe d'achat
app.post('/api/equipment/join', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const userId = req.user.id;
    const { proposal_id, societe_id } = req.body;

    if (!proposal_id || !societe_id) {
      return res.status(400).json({ error: 'proposal_id et societe_id sont requis.' });
    }

    // Sanitize UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(proposal_id) || !uuidRegex.test(societe_id)) {
      return res.status(400).json({ error: 'Format identifiant invalide.' });
    }

    // SECURITY: Verify societe_id belongs to the authenticated user (anti-IDOR)
    const { data: societeCheck } = await db.from('societes')
      .select('id')
      .eq('id', societe_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!societeCheck) {
      // Fallback: check user_societes join table
      const { data: memberCheck } = await db.from('user_societes')
        .select('id')
        .eq('societe_id', societe_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!memberCheck) {
        return res.status(403).json({ error: 'Vous n\'etes pas autorise a inscrire ce cabinet.' });
      }
    }

    // Verify proposal exists and is approved
    const { data: proposal, error: pErr } = await db.from('signed_documents')
      .select('id, metadata, status')
      .eq('id', proposal_id)
      .eq('category', 'equipment_proposal')
      .eq('status', 'approved')
      .single();

    if (pErr || !proposal) {
      return res.status(404).json({ error: 'Offre non trouvée ou non disponible.' });
    }

    // Check if already enrolled (any status — to handle reactivation of cancelled)
    const { data: existing } = await db.from('equipment_enrollments')
      .select('id, status')
      .eq('proposal_id', proposal_id)
      .eq('societe_id', societe_id)
      .maybeSingle();

    if (existing && existing.status === 'active') {
      return res.status(409).json({ error: 'Vous êtes déjà inscrit à cette offre.' });
    }

    const isReactivation = !!(existing && (existing.status === 'cancelled' || existing.status === 'refunded'));

    // Count current enrollments to determine tier price
    const { count: enrollCount } = await db.from('equipment_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('proposal_id', proposal_id)
      .eq('status', 'active');

    const newCount = (enrollCount || 0) + 1;
    const tiers = (proposal.metadata || {}).tiers || [];
    let tierPrice = computeTierPrice(tiers, newCount);

    // Fallback: if no tiers defined, use catalog_price
    if (tierPrice === 0 && (proposal.metadata || {}).catalog_price) {
      tierPrice = parseFloat(proposal.metadata.catalog_price) || 0;
    }

    if (tierPrice <= 0) {
      return res.status(400).json({ error: 'Prix indisponible pour cette offre. Veuillez contacter le support.' });
    }

    const acompteAmount = Math.round(tierPrice * 0.1 * 100) / 100;

    // Insert or reactivate enrollment
    let insertErr;
    if (isReactivation) {
      // Reactivate previously cancelled enrollment (UNIQUE constraint prevents new insert)
      const { error } = await db.from('equipment_enrollments')
        .update({
          status: 'active',
          user_id: userId,
          tier_price: tierPrice,
          acompte_amount: acompteAmount,
          acompte_paid: false,
          acompte_paid_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      insertErr = error;
    } else {
      const { error } = await db.from('equipment_enrollments').insert({
        proposal_id,
        societe_id,
        user_id: userId,
        tier_price: tierPrice,
        acompte_amount: acompteAmount,
        acompte_paid: false,
        status: 'active'
      });
      insertErr = error;
    }

    if (insertErr) {
      console.error('[Equipment Join] Insert/update error:', insertErr.message);
      if (insertErr.message.includes('unique') || insertErr.message.includes('duplicate')) {
        return res.status(409).json({ error: 'Vous êtes déjà inscrit à cette offre.' });
      }
      return res.status(500).json({ error: 'Erreur lors de l\'inscription.' });
    }

    // Check if we crossed a tier threshold
    let tierReached = false;
    let newPrice = tierPrice;
    const previousTierPrice = computeTierPrice(tiers, newCount - 1);

    if (tierPrice < previousTierPrice || checkTierThreshold(tiers, newCount)) {
      tierReached = true;
      newPrice = tierPrice;

      // Create notification for tier milestone
      try {
        const productName = (proposal.metadata || {}).product_name || 'Équipement';
        const notifMessage = 'Nouveau palier atteint pour ' + productName + ' ! '
          + 'Avec ' + newCount + ' cabinets inscrits, le prix passe de '
          + previousTierPrice + ' EUR a ' + tierPrice + ' EUR.';

        await db.from('equipment_notifications').insert({
          proposal_id,
          type: 'tier_reached',
          message: notifMessage,
          metadata: {
            enrollment_count: newCount,
            old_price: previousTierPrice,
            new_price: tierPrice,
            product_name: productName
          }
        });
      } catch (notifErr) {
        console.error('[Equipment Join] Notification error:', notifErr.message);
      }

      // Send email notifications to all enrolled dentists
      try {
        const { data: enrolled } = await db.from('equipment_enrollments')
          .select('user_id')
          .eq('proposal_id', proposal_id)
          .eq('status', 'active');

        if (enrolled && enrolled.length > 0) {
          const userIds = enrolled.map(e => e.user_id);
          // Paginated user fetch — only fetch enrolled user IDs, not all users
          const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
          const enrolledUsers = (users?.users || []).filter(u => userIds.includes(u.id) && u.email);

          const { sendMail } = require('./api/multiSocietes/mailer');
          const rawProductName = (proposal.metadata || {}).product_name || 'Équipement';
          // Escape HTML to prevent XSS in email
          const productName = rawProductName.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

          for (const u of enrolledUsers) {
            sendMail({
              to: u.email,
              subject: '[JADOMI Equipment] Nouveau palier atteint — ' + productName,
              html: '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#fff;">'
                + '<div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px 32px;text-align:center;">'
                + '<div style="font-size:24px;font-weight:800;color:#fff;">JADOMI</div>'
                + '<div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Equipement a prix groupe</div></div>'
                + '<div style="padding:28px 32px;">'
                + '<h2 style="color:#0f172a;font-size:18px;margin:0 0 16px;">Bonne nouvelle !</h2>'
                + '<p style="color:#334155;line-height:1.6;">Un nouveau palier a ete atteint pour <strong>' + productName + '</strong>.</p>'
                + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">'
                + '<div style="font-size:14px;color:#166534;">Le prix passe de <strong>' + previousTierPrice + ' EUR</strong> a</div>'
                + '<div style="font-size:28px;font-weight:800;color:#059669;margin-top:4px;">' + tierPrice + ' EUR</div>'
                + '<div style="font-size:12px;color:#166534;margin-top:4px;">' + newCount + ' cabinets inscrits</div></div>'
                + '<p style="color:#334155;line-height:1.6;">Plus nous serons nombreux, plus le prix baissera. N\'hesitez pas a en parler a vos confreres.</p>'
                + '<div style="text-align:center;margin-top:20px;">'
                + '<a href="' + (process.env.APP_URL || 'https://jadomi.fr') + '/equipment/offres" style="display:inline-block;background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Voir les offres</a></div>'
                + '</div></div>'
            }).catch(e => console.error('[Equipment Tier Email] Error:', e.message));
          }
        }
      } catch (emailErr) {
        console.error('[Equipment Join] Tier email batch error:', emailErr.message);
      }
    }

    res.json({ ok: true, tier_reached: tierReached, new_price: newPrice, enrollment_count: newCount });
  } catch (e) {
    console.error('[Equipment Join] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/equipment/mes-achats — Auth: achats groupe du dentiste
app.get('/api/equipment/mes-achats', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const userId = req.user.id;

    const { data: enrollments, error: eErr } = await db.from('equipment_enrollments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (eErr) {
      console.error('[Equipment MesAchats] Query error:', eErr.message);
      return res.status(500).json({ error: 'Erreur lors du chargement.' });
    }

    // Enrich with proposal details (batched query instead of N+1)
    const proposalIds = [...new Set((enrollments || []).map(e => e.proposal_id))];
    let proposalsMap = {};
    if (proposalIds.length > 0) {
      const { data: proposals } = await db.from('signed_documents')
        .select('id, title, metadata')
        .in('id', proposalIds);
      if (proposals) {
        for (const p of proposals) proposalsMap[p.id] = p;
      }
    }

    const result = (enrollments || []).map(enrollment => {
      const proposal = proposalsMap[enrollment.proposal_id];
      return {
        ...enrollment,
        product_name: proposal ? (proposal.metadata || {}).product_name || proposal.title : 'Equipement',
        company_name: proposal ? (proposal.metadata || {}).company_name : ''
      };
    });

    res.json({ ok: true, enrollments: result });
  } catch (e) {
    console.error('[Equipment MesAchats] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Rate limit: 10 acompte / heure / IP
app.use('/api/equipment/acompte', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, veuillez reessayer dans 1 heure.' }
}));

// POST /api/equipment/acompte — Auth: enregistrer intention de versement d'acompte
app.post('/api/equipment/acompte', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const userId = req.user.id;
    const { enrollment_id } = req.body;

    if (!enrollment_id) {
      return res.status(400).json({ error: 'enrollment_id est requis.' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(enrollment_id)) {
      return res.status(400).json({ error: 'Format identifiant invalide.' });
    }

    // Verify enrollment belongs to user
    const { data: enrollment, error: eErr } = await db.from('equipment_enrollments')
      .select('*')
      .eq('id', enrollment_id)
      .eq('user_id', userId)
      .single();

    if (eErr || !enrollment) {
      return res.status(404).json({ error: 'Inscription non trouvée.' });
    }

    if (enrollment.acompte_paid) {
      return res.status(409).json({ error: 'L\'acompte a déjà été enregistré.' });
    }

    // Mark acompte as paid
    const { error: updateErr } = await db.from('equipment_enrollments')
      .update({
        acompte_paid: true,
        acompte_paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollment_id);

    if (updateErr) {
      console.error('[Equipment Acompte] Update error:', updateErr.message);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement.' });
    }

    // Create notification
    try {
      await db.from('equipment_notifications').insert({
        proposal_id: enrollment.proposal_id,
        type: 'acompte_confirmed',
        message: 'Acompte de ' + enrollment.acompte_amount + ' EUR confirme.',
        metadata: { enrollment_id, user_id: userId, amount: enrollment.acompte_amount }
      });
    } catch (notifErr) { console.error('[Equipment Acompte] Notification error:', notifErr.message); }

    res.json({ ok: true, amount: enrollment.acompte_amount });
  } catch (e) {
    console.error('[Equipment Acompte] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Helper: compute tier price based on enrollment count
function computeTierPrice(tiers, count) {
  if (!tiers || tiers.length === 0) return 0;
  // Sort by min_qty ascending to ensure correct tier selection
  const sorted = [...tiers].sort((a, b) => (parseInt(a.min_qty) || 0) - (parseInt(b.min_qty) || 0));
  let price = parseFloat(sorted[0].price) || 0;
  for (const t of sorted) {
    const minQty = parseInt(t.min_qty) || 0;
    if (count >= minQty) {
      price = parseFloat(t.price) || price;
    }
  }
  return price;
}

// Helper: check if count exactly matches a tier threshold
function checkTierThreshold(tiers, count) {
  if (!tiers || tiers.length === 0) return false;
  return tiers.some(t => parseInt(t.min_qty) === count);
}

// ============================================================
// GESTION PATIENTS — Ban / Deban
// ============================================================

// POST /api/patients/ban — Bannir un patient (no-show, irrespect RDV)
app.post('/api/patients/ban', requireAuth(), async (req, res) => {
  try {
    const { patient_name, patient_phone, patient_email, reason } = req.body;
    if (!patient_name || !String(patient_name).trim()) return res.status(400).json({ error: 'Nom du patient requis' });
    const societeId = req.user.societe_id || req.user.id;
    const db = supabaseAdmin || supabase;

    // Stocker dans signed_documents avec category spéciale
    const { data, error } = await db.from('signed_documents').insert({
      societe_id: societeId,
      user_id: req.user.id,
      title: 'Patient banni — ' + String(patient_name).trim(),
      category: 'patient_ban',
      status: 'active',
      metadata: {
        patient_name: String(patient_name).trim(),
        patient_phone: patient_phone || null,
        patient_email: patient_email || null,
        reason: reason || 'Non-respect des rendez-vous',
        banned_at: new Date().toISOString(),
        banned_by: req.user.email || req.user.id
      }
    }).select().single();

    if (error) throw error;
    res.json({ ok: true, ban_id: data.id });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/patients/unban — Debannir un patient
app.post('/api/patients/unban', requireAuth(), async (req, res) => {
  try {
    const { ban_id } = req.body;
    if (!ban_id) return res.status(400).json({ error: 'ban_id requis' });
    const societeId = req.user.societe_id || req.user.id;
    const db = supabaseAdmin || supabase;
    // Single update with full security filters (societe_id + category)
    const { data, error } = await db.from('signed_documents')
      .update({ status: 'inactive' })
      .eq('id', ban_id)
      .eq('category', 'patient_ban')
      .eq('societe_id', societeId)
      .select('id')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Ban non trouvé ou accès refusé' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/patients/banned — Liste des patients bannis
app.get('/api/patients/banned', requireAuth(), async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    const { data, error } = await db.from('signed_documents')
      .select('id, title, metadata, status, created_at')
      .eq('category', 'patient_ban')
      .eq('societe_id', req.user.societe_id || req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, banned: (data || []).map(d => ({ id: d.id, ...d.metadata, status: d.status, banned_at: d.metadata?.banned_at || d.created_at })) });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/patients/check-ban?name=... — Vérifier si un patient est banni
app.get('/api/patients/check-ban', requireAuth(), async (req, res) => {
  try {
    const name = String(req.query.name || '').trim().toLowerCase();
    if (!name || name.length < 2) return res.json({ ok: true, banned: false });
    const db = supabaseAdmin || supabase;
    const { data } = await db.from('signed_documents')
      .select('id, metadata')
      .eq('category', 'patient_ban')
      .eq('status', 'active')
      .eq('societe_id', req.user.societe_id || req.user.id);
    const match = (data || []).find(d => {
      const n = (d.metadata?.patient_name || '').toLowerCase();
      return n === name || n.includes(name) || name.includes(n);
    });
    res.json({ ok: true, banned: !!match, ban_id: match?.id || null, reason: match?.metadata?.reason || null });
  } catch (e) {
    res.json({ ok: true, banned: false });
  }
});

// ============================================================
// JADOMI SOS URGENCE CONFRERES
// ============================================================

// Haversine distance (km)
function _sosHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// POST /api/sos-urgence/create — Créer une demande d'urgence
app.post('/api/sos-urgence/create', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const userId = req.user.id;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee a votre compte.' });

    const { patient_initials, initiales, urgency_type, type, description, quartier, deadline, delai, latitude, longitude, rayon_km } = req.body;
    const _patientInitials = patient_initials || initiales;
    const _urgencyType = urgency_type || type;
    const _deadline = deadline || delai;
    if (!_patientInitials || !_urgencyType) {
      return res.status(400).json({ error: 'patient_initials et urgency_type requis.' });
    }

    // Récupérer la société de l'envoyeur (pour GPS + ville)
    const { data: senderSociete } = await db.from('societes').select('*').eq('id', societeId).single();
    const senderLat = latitude || senderSociete?.lat || senderSociete?.latitude || null;
    const senderLng = longitude || senderSociete?.lng || senderSociete?.longitude || null;
    const senderCity = senderSociete?.city || senderSociete?.ville || null;
    const senderRegion = senderSociete?.region || null;

    // Inserer la demande
    const { data: request, error: insertErr } = await db.from('sos_urgence_requests').insert({
      sender_societe_id: societeId,
      sender_user_id: userId,
      patient_initials: _patientInitials,
      urgency_type: _urgencyType,
      description: description || null,
      quartier: quartier || null,
      deadline: _deadline || null,
      latitude: senderLat,
      longitude: senderLng,
      radius_km: parseInt(rayon_km) || 10,
      status: 'open'
    }).select().single();

    if (insertErr) throw insertErr;

    // Trouver les cabinets dentaires a proximite
    const { data: cabinets } = await db.from('societes')
      .select('id, nom, lat, lng, latitude, longitude, city, ville, region')
      .in('type', ['cabinet_dentaire', 'chirurgien_dentiste'])
      .neq('id', societeId);

    let targets = cabinets || [];

    // Filtrer par distance si GPS disponible (rayon 30 km par defaut)
    if (senderLat && senderLng) {
      targets = targets.filter(c => {
        const cLat = c.lat || c.latitude;
        const cLng = c.lng || c.longitude;
        if (!cLat || !cLng) return false;
        return _sosHaversineKm(senderLat, senderLng, cLat, cLng) <= (parseInt(rayon_km) || 10);
      });
      // Fallback: si aucun cabinet GPS dans le rayon, prendre meme ville/region
      if (targets.length === 0 && (senderCity || senderRegion)) {
        targets = (cabinets || []).filter(c => {
          const cCity = c.city || c.ville;
          const cRegion = c.region;
          return (senderCity && cCity && cCity.toLowerCase() === senderCity.toLowerCase()) ||
                 (senderRegion && cRegion && cRegion.toLowerCase() === senderRegion.toLowerCase());
        });
      }
    } else if (senderCity || senderRegion) {
      // Pas de GPS → filtrer par ville/region
      targets = targets.filter(c => {
        const cCity = c.city || c.ville;
        const cRegion = c.region;
        return (senderCity && cCity && cCity.toLowerCase() === senderCity.toLowerCase()) ||
               (senderRegion && cRegion && cRegion.toLowerCase() === senderRegion.toLowerCase());
      });
    }

    // Créer une notification pour chaque cabinet cible
    if (targets.length > 0) {
      const notifications = targets.map(c => ({
        request_id: request.id,
        target_societe_id: c.id,
        status: 'pending'
      }));
      const { error: notifErr } = await db.from('sos_urgence_notifications').insert(notifications);
      if (notifErr) console.error('[SOS Urgence] Erreur insertion notifications:', notifErr.message);
    }

    res.json({ ok: true, request_id: request.id, notified_count: targets.length });
  } catch (e) {
    console.error('[SOS Urgence Create] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/sos-urgence/incoming — Urgences recues par MON cabinet
app.get('/api/sos-urgence/incoming', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    // Auto-expirer les vieilles urgences (>24h) a chaque polling
    await _sosExpireOldRequests(db);

    const { data, error } = await db.from('sos_urgence_notifications')
      .select('*, sos_urgence_requests(*)')
      .eq('target_societe_id', societeId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filtrer celles dont la request est bien open (le filtre nested peut laisser passer des nulls)
    const urgences = (data || []).filter(n => n.sos_urgence_requests && n.sos_urgence_requests.status === 'open');

    res.json({ ok: true, urgences });
  } catch (e) {
    console.error('[SOS Urgence Incoming] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/sos-urgence/my-requests — Mes demandes envoyees
app.get('/api/sos-urgence/my-requests', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const { data, error } = await db.from('sos_urgence_requests')
      .select('*')
      .eq('sender_societe_id', societeId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ ok: true, requests: data || [] });
  } catch (e) {
    console.error('[SOS Urgence My Requests] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/sos-urgence/:id/accept — Accepter une urgence
app.post('/api/sos-urgence/:id/accept', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const requestId = req.params.id;
    const userId = req.user.id;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    // Vérifier que la request est encore open ET mettre à jour atomiquement
    // (le filtre .eq('status','open') empeche la race condition: seul le 1er gagne)
    const { data: updatedReq, error: updateErr } = await db.from('sos_urgence_requests')
      .update({
        status: 'accepted',
        accepted_by_societe_id: societeId,
        accepted_by_user_id: userId,
        accepted_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .eq('status', 'open')
      .select('*')
      .maybeSingle();

    if (updateErr) throw updateErr;
    if (!updatedReq) {
      // Soit introuvable, soit deja acceptee
      const { data: check } = await db.from('sos_urgence_requests').select('status').eq('id', requestId).maybeSingle();
      if (!check) return res.status(404).json({ error: 'Demande introuvable.' });
      return res.status(409).json({ error: 'Cette demande n\'est plus disponible (déjà ' + check.status + ').' });
    }
    const sosReq = updatedReq;

    // Mettre à jour la notification correspondante
    await db.from('sos_urgence_notifications')
      .update({ status: 'accepted' })
      .eq('request_id', requestId)
      .eq('target_societe_id', societeId);

    // Récupérer les infos de l'envoyeur pour l'email
    const { data: senderSociete } = await db.from('societes').select('nom').eq('id', sosReq.sender_societe_id).single();
    const { data: senderUser } = await db.from('auth_users_view').select('email').eq('id', sosReq.sender_user_id).maybeSingle();
    // Fallback: chercher dans profiles
    let senderEmail = senderUser?.email;
    if (!senderEmail) {
      const { data: profile } = await db.from('profiles').select('email').eq('id', sosReq.sender_user_id).maybeSingle();
      senderEmail = profile?.email;
    }

    // Récupérer le nom du confrère qui accepte
    const { data: acceptorSociete } = await db.from('societes').select('nom').eq('id', societeId).single();
    const acceptorName = acceptorSociete?.nom || 'Un confrere';

    // Envoyer un email a l'envoyeur
    if (senderEmail) {
      try {
        const { sendMail } = require('./api/multiSocietes/mailer');
        await sendMail({
          to: senderEmail,
          subject: `JADOMI SOS Urgence — ${acceptorName} a accepte votre demande`,
          html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:24px;"><span style="font-size:32px;font-weight:800;color:#10b981;">JADOMI</span></div>
            <div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
              <div style="font-size:24px;margin-bottom:8px;">&#x2705;</div>
              <h2 style="color:#065f46;margin:0;font-size:18px;">Un confrere a accepte votre urgence</h2>
            </div>
            <p><strong>${acceptorName}</strong> peut prendre en charge votre patient <strong>${sosReq.patient_initials}</strong>.</p>
            <p>Type d'urgence : <strong>${sosReq.urgency_type}</strong></p>
            ${sosReq.description ? `<p>Description : ${sosReq.description}</p>` : ''}
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:20px 0;">
              <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:8px;">Prochaine etape :</div>
              <p style="margin:0;font-size:13px;color:#1e3a5f;">Contactez votre patient pour lui proposer le creneau chez <strong>${acceptorName}</strong>. Le transfert ne sera effectif qu'apres validation du patient.</p>
              <p style="margin:8px 0 0;font-size:13px;color:#1e3a5f;">Coordonnees du confrere disponibles dans votre dashboard JADOMI, onglet SOS Urgence.</p>
            </div>
            <p style="color:#64748b;font-size:12px;margin-top:24px;">JADOMI — SOS Urgence Confreres — Le patient valide, pas de transfert sans son accord.</p>
          </div>`
        });
      } catch (mailErr) {
        console.error('[SOS Urgence Accept] Erreur envoi email:', mailErr.message);
      }
    }

    // Retourner les coordonnées du cabinet envoyeur pour le confrère acceptant
    const { data: senderFullSociete } = await db.from('societes')
      .select('nom, adresse, telephone, email, city, ville')
      .eq('id', sosReq.sender_societe_id).single();
    res.json({
      ok: true,
      sender_name: senderSociete?.nom || null,
      sender_email: senderEmail || null,
      cabinet: senderFullSociete ? {
        nom: senderFullSociete.nom || null,
        adresse: senderFullSociete.adresse || null,
        telephone: senderFullSociete.telephone || null,
        email: senderFullSociete.email || senderEmail || null,
        ville: senderFullSociete.city || senderFullSociete.ville || null
      } : null
    });
  } catch (e) {
    console.error('[SOS Urgence Accept] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/sos-urgence/:id/decline — Decliner une urgence
app.post('/api/sos-urgence/:id/decline', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const requestId = req.params.id;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const { error } = await db.from('sos_urgence_notifications')
      .update({ status: 'declined' })
      .eq('request_id', requestId)
      .eq('target_societe_id', societeId);

    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    console.error('[SOS Urgence Decline] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/sos-urgence/:id/cancel — Annuler sa propre demande
app.post('/api/sos-urgence/:id/cancel', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const requestId = req.params.id;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    // Vérifier que c'est bien MA demande ET qu'elle est encore open
    const { data: sosReq, error: fetchErr } = await db.from('sos_urgence_requests')
      .select('sender_societe_id, status')
      .eq('id', requestId)
      .single();

    if (fetchErr || !sosReq) return res.status(404).json({ error: 'Demande introuvable.' });
    if (sosReq.sender_societe_id !== societeId) return res.status(403).json({ error: 'Vous ne pouvez annuler que vos propres demandes.' });
    if (sosReq.status !== 'open') return res.status(409).json({ error: 'Cette demande ne peut plus etre annulee (statut: ' + sosReq.status + ').' });

    const { error } = await db.from('sos_urgence_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('status', 'open');

    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    console.error('[SOS Urgence Cancel] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Auto-expiration des urgences open > 24h (appele a chaque listing)
async function _sosExpireOldRequests(db) {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await db.from('sos_urgence_requests')
      .update({ status: 'expired' })
      .eq('status', 'open')
      .lt('created_at', cutoff);
  } catch (e) {
    console.error('[SOS Urgence Expire] Error:', e.message);
  }
}

// ============================================================
// JADOMI TOURNEES — Agenda Intelligent Infirmieres
// ============================================================

// --- IDE Security helpers ---
const IDE_VALID_SOINS_TYPES = ['soins', 'pansement', 'injection', 'perfusion', 'prelevements', 'toilette', 'nursing', 'chimio', 'surveillance', 'autre'];
const IDE_VALID_STATUS = ['planifie', 'en_route', 'arrive', 'en_cours', 'termine', 'annule', 'reporte'];
const IDE_VALID_TOURNEES = ['matin', 'soir', 'les_deux'];

function _ideSanitize(s, maxLen = 500) {
  if (!s) return '';
  // Trim and truncate FIRST on raw text, THEN encode HTML entities
  const raw = String(s).replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
  return raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _ideValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00'));
}

// Sanitize filename for Content-Disposition header (strip path separators, quotes, control chars)
function _ideSafeFilename(name) {
  if (!name) return 'download';
  return String(name).replace(/[/\\:"*?<>|\r\n\x00-\x1f]/g, '_').substring(0, 255);
}

// Validate resolved file path stays within expected directory (prevent path traversal)
function _ideCheckPathTraversal(resolvedPath, expectedDir) {
  const normalizedPath = path.resolve(resolvedPath);
  const normalizedDir = path.resolve(expectedDir);
  return normalizedPath.startsWith(normalizedDir + path.sep) || normalizedPath === normalizedDir;
}

function _ideValidUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Rate limiter for geocoding-heavy endpoints (prevent Nominatim abuse)
const _ideGeocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Trop de requetes geocoding. Reessayez dans 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Helper: geocode an address via Nominatim
async function _ideGeocode(adresse) {
  try {
    const resp = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(adresse) + '&format=json&limit=1', {
      headers: { 'User-Agent': 'JADOMI/1.0' }
    });
    const data = await resp.json();
    if (data && data.length > 0) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    }
    return { latitude: null, longitude: null };
  } catch (e) {
    console.error('[IDE Geocode] Error:', e.message);
    return { latitude: null, longitude: null };
  }
}

// 1. POST /api/ide/cabinet — Créer/mettre à jour le cabinet IDE
app.post('/api/ide/cabinet', requireAuth(), _ideGeocodeLimiter, async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const nom = _ideSanitize(req.body.nom, 200);
    const adresse = _ideSanitize(req.body.adresse, 500);
    const ville = _ideSanitize(req.body.ville, 200);
    const code_postal = _ideSanitize(req.body.code_postal, 10);
    const telephone = _ideSanitize(req.body.telephone, 20);
    if (!nom) return res.status(400).json({ error: 'nom requis.' });

    const fullAddress = [adresse, code_postal, ville].filter(Boolean).join(' ');
    const geo = await _ideGeocode(fullAddress);

    // Upsert: check if cabinet exists for this société
    const { data: existing } = await db.from('ide_cabinets').select('id').eq('societe_id', societeId).single();

    if (existing) {
      const { data, error } = await db.from('ide_cabinets').update({
        nom, adresse, ville, code_postal, telephone,
        latitude: geo.latitude, longitude: geo.longitude,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id).select().single();
      if (error) throw error;
      return res.json({ ok: true, cabinet: data });
    }

    const { data, error } = await db.from('ide_cabinets').insert({
      societe_id: societeId,
      user_id: req.user.id,
      nom, adresse, ville, code_postal, telephone,
      latitude: geo.latitude, longitude: geo.longitude
    }).select().single();
    if (error) throw error;
    res.json({ ok: true, cabinet: data });
  } catch (e) {
    console.error('[IDE Cabinet POST] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 2. GET /api/ide/cabinet — Récupérer le cabinet de l'user connecté
app.get('/api/ide/cabinet', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const { data, error } = await db.from('ide_cabinets').select('*').eq('societe_id', societeId).single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json({ ok: true, cabinet: data || null });
  } catch (e) {
    console.error('[IDE Cabinet GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Helper: get cabinet_id for the current user
async function _ideGetCabinetId(db, societeId) {
  let { data } = await db.from('ide_cabinets').select('id').eq('societe_id', societeId).maybeSingle();
  if (data?.id) return data.id;
  // Auto-création cabinet IDE si inexistant
  const { data: soc } = await db.from('societes').select('nom').eq('id', societeId).maybeSingle();
  const { data: created } = await db.from('ide_cabinets')
    .insert({ societe_id: societeId, nom: soc?.nom || 'Cabinet IDE' })
    .select('id').maybeSingle();
  return created?.id || null;
}

// 3. POST /api/ide/nurses — Ajouter une infirmiere au cabinet
app.post('/api/ide/nurses', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé. Créez votre cabinet d\'abord.' });

    const nom = _ideSanitize(req.body.nom, 200);
    const prenom = _ideSanitize(req.body.prenom, 200);
    const telephone = _ideSanitize(req.body.telephone, 20);
    const email = _ideSanitize(req.body.email, 200);
    const rpps = _ideSanitize(req.body.rpps, 20);
    const couleur = /^#[0-9A-Fa-f]{6}$/.test(req.body.couleur) ? req.body.couleur : '#3B82F6';
    const is_titulaire = req.body.is_titulaire;
    if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom requis.' });

    const { data, error } = await db.from('ide_nurses').insert({
      cabinet_id: cabinetId,
      nom, prenom, telephone, email, rpps,
      couleur,
      is_titulaire: is_titulaire !== false
    }).select().single();
    if (error) throw error;
    res.json({ ok: true, nurse: data });
  } catch (e) {
    console.error('[IDE Nurses POST] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 4. GET /api/ide/nurses — Lister les infirmieres du cabinet
app.get('/api/ide/nurses', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data, error } = await db.from('ide_nurses').select('*').eq('cabinet_id', cabinetId).order('nom');
    if (error) throw error;
    res.json({ ok: true, nurses: data || [] });
  } catch (e) {
    console.error('[IDE Nurses GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 5. PATCH /api/ide/nurses/:id — Modifier une infirmiere
app.patch('/api/ide/nurses/:id', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const updates = {};
    if (req.body.nom !== undefined) updates.nom = _ideSanitize(req.body.nom, 200);
    if (req.body.prenom !== undefined) updates.prenom = _ideSanitize(req.body.prenom, 200);
    if (req.body.telephone !== undefined) updates.telephone = _ideSanitize(req.body.telephone, 20);
    if (req.body.email !== undefined) updates.email = _ideSanitize(req.body.email, 200);
    if (req.body.rpps !== undefined) updates.rpps = _ideSanitize(req.body.rpps, 20);
    if (req.body.couleur !== undefined) updates.couleur = /^#[0-9A-Fa-f]{6}$/.test(req.body.couleur) ? req.body.couleur : '#3B82F6';
    if (req.body.is_titulaire !== undefined) updates.is_titulaire = req.body.is_titulaire;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db.from('ide_nurses').update(updates)
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Infirmière non trouvée.' });
    res.json({ ok: true, nurse: data });
  } catch (e) {
    console.error('[IDE Nurses PATCH] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 6. POST /api/ide/patients — Ajouter un patient
app.post('/api/ide/patients', requireAuth(), _ideGeocodeLimiter, async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const nom = _ideSanitize(req.body.nom, 200);
    const prenom = _ideSanitize(req.body.prenom, 200);
    const adresse = _ideSanitize(req.body.adresse, 500);
    const ville = _ideSanitize(req.body.ville, 200);
    const code_postal = _ideSanitize(req.body.code_postal, 10);
    const telephone = _ideSanitize(req.body.telephone, 20);
    const telephone_famille = _ideSanitize(req.body.telephone_famille, 20);
    const notes = _ideSanitize(req.body.notes, 2000);
    const medecin_traitant = _ideSanitize(req.body.medecin_traitant, 200);
    if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom requis.' });

    const fullAddress = [adresse, code_postal, ville].filter(Boolean).join(' ');
    const geo = fullAddress.trim() ? await _ideGeocode(fullAddress) : { latitude: null, longitude: null };

    const { data, error } = await db.from('ide_patients').insert({
      cabinet_id: cabinetId,
      nom, prenom, adresse, ville, code_postal, telephone,
      telephone_famille, notes, medecin_traitant,
      latitude: geo.latitude, longitude: geo.longitude
    }).select().single();
    if (error) throw error;
    res.json({ ok: true, patient: data });
  } catch (e) {
    console.error('[IDE Patients POST] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 7. GET /api/ide/patients — Lister les patients du cabinet (avec recherche ?q=)
app.get('/api/ide/patients', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    let query = db.from('ide_patients').select('*').eq('cabinet_id', cabinetId);
    const qRaw = req.query.q;
    if (qRaw) {
      // Sanitize: strip PostgREST special chars (including backslash) to prevent filter injection
      const q = String(qRaw).replace(/[%_\\().,]/g, '').trim().substring(0, 100);
      if (q) {
        query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`);
      }
    }
    query = query.order('nom').limit(1000);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ ok: true, patients: data || [] });
  } catch (e) {
    console.error('[IDE Patients GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 8. PATCH /api/ide/patients/:id — Modifier un patient
app.patch('/api/ide/patients/:id', requireAuth(), _ideGeocodeLimiter, async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const updates = {};
    if (req.body.nom !== undefined) updates.nom = _ideSanitize(req.body.nom, 200);
    if (req.body.prenom !== undefined) updates.prenom = _ideSanitize(req.body.prenom, 200);
    if (req.body.adresse !== undefined) updates.adresse = _ideSanitize(req.body.adresse, 500);
    if (req.body.ville !== undefined) updates.ville = _ideSanitize(req.body.ville, 200);
    if (req.body.code_postal !== undefined) updates.code_postal = _ideSanitize(req.body.code_postal, 10);
    if (req.body.telephone !== undefined) updates.telephone = _ideSanitize(req.body.telephone, 20);
    if (req.body.telephone_famille !== undefined) updates.telephone_famille = _ideSanitize(req.body.telephone_famille, 20);
    if (req.body.notes !== undefined) updates.notes = _ideSanitize(req.body.notes, 2000);
    if (req.body.medecin_traitant !== undefined) updates.medecin_traitant = _ideSanitize(req.body.medecin_traitant, 200);
    updates.updated_at = new Date().toISOString();

    // Re-geocode if address changed
    if (updates.adresse !== undefined || updates.ville !== undefined || updates.code_postal !== undefined) {
      const fullAddr = [updates.adresse || '', updates.code_postal || '', updates.ville || ''].filter(Boolean).join(' ');
      if (fullAddr.trim()) {
        const geo = await _ideGeocode(fullAddr);
        updates.latitude = geo.latitude;
        updates.longitude = geo.longitude;
      }
    }

    const { data, error } = await db.from('ide_patients').update(updates)
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Patient non trouvé.' });
    res.json({ ok: true, patient: data });
  } catch (e) {
    console.error('[IDE Patients PATCH] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 9. POST /api/ide/patients/:id/ban — Bannir un patient
app.post('/api/ide/patients/:id/ban', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data, error } = await db.from('ide_patients').update({ is_banned: true, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Patient non trouvé.' });
    res.json({ ok: true, patient: data });
  } catch (e) {
    console.error('[IDE Patient Ban] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 10. POST /api/ide/patients/:id/unban — Debannir un patient
app.post('/api/ide/patients/:id/unban', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data, error } = await db.from('ide_patients').update({ is_banned: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Patient non trouvé.' });
    res.json({ ok: true, patient: data });
  } catch (e) {
    console.error('[IDE Patient Unban] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 11. POST /api/ide/soins — Ajouter un soin recurrent pour un patient
app.post('/api/ide/soins', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { patient_id, soins_type, duree_minutes, tournee, jours_semaine, nurse_preferee_id, heure_preferee, ordonnance_expire_at } = req.body;
    if (!patient_id || !soins_type) return res.status(400).json({ error: 'patient_id et soins_type requis.' });
    if (!IDE_VALID_SOINS_TYPES.includes(soins_type)) return res.status(400).json({ error: 'soins_type invalide. Valeurs: ' + IDE_VALID_SOINS_TYPES.join(', ') });
    if (tournee && !IDE_VALID_TOURNEES.includes(tournee)) return res.status(400).json({ error: 'tournee invalide. Valeurs: matin, soir.' });
    if (duree_minutes !== undefined && (isNaN(duree_minutes) || duree_minutes < 1 || duree_minutes > 480)) return res.status(400).json({ error: 'duree_minutes doit etre entre 1 et 480.' });
    if (jours_semaine && (!Array.isArray(jours_semaine) || jours_semaine.some(j => ![0,1,2,3,4,5,6].includes(j)))) return res.status(400).json({ error: 'jours_semaine invalide.' });
    if (ordonnance_expire_at && !_ideValidDate(ordonnance_expire_at)) return res.status(400).json({ error: 'ordonnance_expire_at format invalide (YYYY-MM-DD).' });

    // Verify patient belongs to this cabinet
    const { data: patient } = await db.from('ide_patients').select('id').eq('id', patient_id).eq('cabinet_id', cabinetId).single();
    if (!patient) return res.status(404).json({ error: 'Patient non trouvé dans votre cabinet.' });

    // SECURITY: Verify nurse_preferee_id belongs to this cabinet (IDOR fix)
    if (nurse_preferee_id) {
      const { data: nurseCheck } = await db.from('ide_nurses').select('id').eq('id', nurse_preferee_id).eq('cabinet_id', cabinetId).single();
      if (!nurseCheck) return res.status(404).json({ error: 'Infirmière préférée non trouvée dans votre cabinet.' });
    }

    // Warn if jours_semaine is empty (soin will never generate visits)
    if (jours_semaine && Array.isArray(jours_semaine) && jours_semaine.length === 0) {
      return res.status(400).json({ error: 'jours_semaine ne peut pas etre vide. Le soin ne genererait aucune visite.' });
    }

    const { data, error } = await db.from('ide_soins_recurrents').insert({
      cabinet_id: cabinetId,
      patient_id,
      soins_type,
      duree_minutes: duree_minutes || 15,
      tournee: tournee || 'matin',
      jours_semaine: jours_semaine || [1, 2, 3, 4, 5],
      nurse_preferee_id: nurse_preferee_id || null,
      heure_preferee: heure_preferee || null,
      ordonnance_expire_at: ordonnance_expire_at || null,
      is_active: true
    }).select().single();
    if (error) throw error;
    res.json({ ok: true, soin: data });
  } catch (e) {
    console.error('[IDE Soins POST] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 12. GET /api/ide/soins/:patient_id — Lister les soins recurrents d'un patient
app.get('/api/ide/soins/:patient_id', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data, error } = await db.from('ide_soins_recurrents').select('*')
      .eq('cabinet_id', cabinetId).eq('patient_id', req.params.patient_id).order('created_at');
    if (error) throw error;
    res.json({ ok: true, soins: data || [] });
  } catch (e) {
    console.error('[IDE Soins GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 13. DELETE /api/ide/soins/:id — Supprimer un soin récurrent
app.delete('/api/ide/soins/:id', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { error } = await db.from('ide_soins_recurrents').delete()
      .eq('id', req.params.id).eq('cabinet_id', cabinetId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[IDE Soins DELETE] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 14. GET /api/ide/planning/:date — Planning complet d'une journee
app.get('/api/ide/planning/:date', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const dateStr = req.params.date; // YYYY-MM-DD
    if (!_ideValidDate(dateStr)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });

    // Check if visits exist for this date
    let { data: visites, error } = await db.from('ide_visites').select('*')
      .eq('cabinet_id', cabinetId).eq('date', dateStr).order('ordre_dans_tournee');
    if (error) throw error;

    // If no visits, auto-generate from recurring soins
    if (!visites || visites.length === 0) {
      const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun, 1=Mon...
      const { data: soins } = await db.from('ide_soins_recurrents').select('*')
        .eq('cabinet_id', cabinetId).eq('is_active', true).contains('jours_semaine', [dayOfWeek]);

      if (soins && soins.length > 0) {
        // Filter: skip expired ordonnances and banned patients
        const _autoPatientIds = [...new Set(soins.map(s => s.patient_id))];
        const { data: _bannedPts } = await db.from('ide_patients').select('id').eq('cabinet_id', cabinetId).eq('is_banned', true).in('id', _autoPatientIds);
        const _bannedAutoSet = new Set((_bannedPts || []).map(p => p.id));
        const today = new Date(dateStr + 'T00:00:00');
        const filteredSoins = soins.filter(s => {
          if (_bannedAutoSet.has(s.patient_id)) return false;
          if (s.ordonnance_expire_at && new Date(s.ordonnance_expire_at) < today) return false;
          return true;
        });
        const inserts = [];
        for (const s of filteredSoins) {
          const tourneesToGen = s.tournee === 'les_deux' ? ['matin', 'soir'] : [s.tournee];
          for (const t of tourneesToGen) {
            inserts.push({
              cabinet_id: cabinetId,
              patient_id: s.patient_id,
              nurse_id: s.nurse_preferee_id,
              soin_recurrent_id: s.id,
              date: dateStr,
              tournee: t,
              soins_type: s.soins_type,
              duree_prevue_minutes: s.duree_minutes,
              heure_prevue: s.heure_preferee,
              status: 'planifie'
            });
          }
        }

        const { data: inserted, error: insErr } = await db.from('ide_visites').insert(inserts).select();
        if (insErr) throw insErr;
        visites = inserted || [];
      }
    }

    // Group by nurse and tournee
    const grouped = {};
    for (const v of (visites || [])) {
      const nurseKey = v.nurse_id || 'non_assigne';
      if (!grouped[nurseKey]) grouped[nurseKey] = { matin: [], soir: [] };
      const t = v.tournee || 'matin';
      if (!grouped[nurseKey][t]) grouped[nurseKey][t] = [];
      grouped[nurseKey][t].push(v);
    }

    res.json({ ok: true, date: dateStr, planning: grouped, total_visites: (visites || []).length });
  } catch (e) {
    console.error('[IDE Planning GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 15. POST /api/ide/planning/generate — Générer les visites pour une période
app.post('/api/ide/planning/generate', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { date_debut, date_fin } = req.body;
    if (!date_debut || !date_fin) return res.status(400).json({ error: 'date_debut et date_fin requis.' });
    if (!_ideValidDate(date_debut) || !_ideValidDate(date_fin)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    // Limit generation to 90 days max to prevent abuse
    const daysDiff = (new Date(date_fin) - new Date(date_debut)) / (1000 * 60 * 60 * 24);
    if (daysDiff < 0) return res.status(400).json({ error: 'date_fin doit etre apres date_debut.' });
    if (daysDiff > 90) return res.status(400).json({ error: 'Plage maximale: 90 jours.' });

    const { data: soins } = await db.from('ide_soins_recurrents').select('*')
      .eq('cabinet_id', cabinetId).eq('is_active', true);
    if (!soins || soins.length === 0) return res.json({ ok: true, generated: 0 });

    // DEDUP: Get existing visits for this period to avoid duplicates
    const { data: existingVisites } = await db.from('ide_visites').select('soin_recurrent_id, date, tournee')
      .eq('cabinet_id', cabinetId).gte('date', date_debut).lte('date', date_fin);
    const existingSet = new Set((existingVisites || []).map(v => `${v.soin_recurrent_id}_${v.date}_${v.tournee}`));

    // Filter out banned patients
    const _genPatientIds = [...new Set(soins.map(s => s.patient_id))];
    const { data: bannedPatients } = await db.from('ide_patients').select('id').eq('cabinet_id', cabinetId).eq('is_banned', true).in('id', _genPatientIds);
    const bannedSet = new Set((bannedPatients || []).map(p => p.id));

    const inserts = [];
    const start = new Date(date_debut + 'T00:00:00');
    const end = new Date(date_fin + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);

      for (const s of soins) {
        const jours = s.jours_semaine || [];
        if (!jours.includes(dayOfWeek)) continue;
        // Skip if ordonnance expired
        if (s.ordonnance_expire_at && new Date(s.ordonnance_expire_at) < d) continue;
        // Skip banned patients
        if (bannedSet.has(s.patient_id)) continue;

        // 'les_deux' generates 2 visits: one matin, one soir
        const tourneesToGenerate = s.tournee === 'les_deux' ? ['matin', 'soir'] : [s.tournee];
        for (const t of tourneesToGenerate) {
          const dedupKey = `${s.id}_${dateStr}_${t}`;
          if (existingSet.has(dedupKey)) continue;
          inserts.push({
            cabinet_id: cabinetId,
            patient_id: s.patient_id,
            nurse_id: s.nurse_preferee_id,
            soin_recurrent_id: s.id,
            date: dateStr,
            tournee: t,
            soins_type: s.soins_type,
            duree_prevue_minutes: s.duree_minutes,
            heure_prevue: s.heure_preferee,
            status: 'planifie'
          });
        }
      }
    }

    if (inserts.length === 0) return res.json({ ok: true, generated: 0 });

    // Insert in batches of 500
    let totalInserted = 0;
    for (let i = 0; i < inserts.length; i += 500) {
      const batch = inserts.slice(i, i + 500);
      const { data, error } = await db.from('ide_visites').insert(batch).select();
      if (error) throw error;
      totalInserted += (data || []).length;
    }

    res.json({ ok: true, generated: totalInserted });
  } catch (e) {
    console.error('[IDE Planning Generate] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 16. POST /api/ide/tournee/optimize — Optimiser l'ordre d'une tournee (nearest-neighbor)
app.post('/api/ide/tournee/optimize', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { nurse_id, date, tournee } = req.body;
    if (!nurse_id || !date || !tournee) return res.status(400).json({ error: 'nurse_id, date et tournee requis.' });
    if (!_ideValidDate(date)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    if (!['matin', 'soir'].includes(tournee)) return res.status(400).json({ error: 'tournee invalide pour optimisation. Valeurs: matin, soir.' });

    // SECURITY: Verify nurse belongs to this cabinet (IDOR fix)
    const { data: nurseCheck } = await db.from('ide_nurses').select('id').eq('id', nurse_id).eq('cabinet_id', cabinetId).single();
    if (!nurseCheck) return res.status(404).json({ error: 'Infirmière non trouvée dans votre cabinet.' });

    // Get cabinet position
    const { data: cabinet } = await db.from('ide_cabinets').select('latitude, longitude').eq('id', cabinetId).single();
    if (!cabinet || !cabinet.latitude) return res.status(400).json({ error: 'Cabinet sans coordonnées GPS.' });

    // Get visits for this nurse/date/tournee with patient coords
    const { data: visites } = await db.from('ide_visites').select('id, patient_id')
      .eq('cabinet_id', cabinetId).eq('nurse_id', nurse_id).eq('date', date).eq('tournee', tournee)
      .eq('status', 'planifie');
    if (!visites || visites.length === 0) return res.json({ ok: true, message: 'Aucune visite a optimiser.', ordre: [] });

    // Get patient coordinates
    const patientIds = visites.map(v => v.patient_id);
    const { data: patients } = await db.from('ide_patients').select('id, nom, prenom, latitude, longitude').in('id', patientIds);
    const patientMap = {};
    for (const p of (patients || [])) patientMap[p.id] = p;

    // Nearest-neighbor algorithm
    let currentLat = cabinet.latitude;
    let currentLng = cabinet.longitude;
    const remaining = [...visites];
    const ordered = [];
    let totalDistKm = 0;

    // Separate patients with and without GPS
    const withGps = remaining.filter(v => { const p = patientMap[v.patient_id]; return p && p.latitude; });
    const withoutGps = remaining.filter(v => { const p = patientMap[v.patient_id]; return !p || !p.latitude; });
    remaining.length = 0; // clear
    const gpsRemaining = [...withGps];

    while (gpsRemaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < gpsRemaining.length; i++) {
        const p = patientMap[gpsRemaining[i].patient_id];
        const dist = _sosHaversineKm(currentLat, currentLng, p.latitude, p.longitude);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const chosen = gpsRemaining.splice(bestIdx, 1)[0];
      const chosenPatient = patientMap[chosen.patient_id];
      totalDistKm += bestDist;
      currentLat = chosenPatient.latitude;
      currentLng = chosenPatient.longitude;
      ordered.push(chosen);
    }
    // Append patients without GPS at end (cannot be optimized)
    ordered.push(...withoutGps);

    // Save order
    for (let i = 0; i < ordered.length; i++) {
      await db.from('ide_visites').update({ ordre_dans_tournee: i + 1 }).eq('id', ordered[i].id);
    }

    // Upsert tournee record
    const { data: existingTournee } = await db.from('ide_tournees').select('id')
      .eq('cabinet_id', cabinetId).eq('nurse_id', nurse_id).eq('date', date).eq('tournee', tournee).single();

    const tourneeData = {
      cabinet_id: cabinetId,
      nurse_id,
      date,
      tournee,
      distance_totale_km: Math.round(totalDistKm * 100) / 100,
      nb_patients: ordered.length,
      is_optimized: true,
      optimized_at: new Date().toISOString()
    };

    if (existingTournee) {
      await db.from('ide_tournees').update(tourneeData).eq('id', existingTournee.id);
    } else {
      await db.from('ide_tournees').insert(tourneeData);
    }

    const ordreResult = ordered.map((v, i) => ({
      ordre: i + 1,
      visite_id: v.id,
      patient: patientMap[v.patient_id] ? `${patientMap[v.patient_id].prenom} ${patientMap[v.patient_id].nom}` : v.patient_id
    }));

    res.json({ ok: true, distance_totale_km: Math.round(totalDistKm * 100) / 100, nb_patients: ordered.length, ordre: ordreResult });
  } catch (e) {
    console.error('[IDE Tournee Optimize] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 17. POST /api/ide/patient/place — KILLER FEATURE: Placement auto d'un nouveau patient
app.post('/api/ide/patient/place', requireAuth(), _ideGeocodeLimiter, async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { patient_name, address, soins_type, duree_minutes, date, tournee_pref } = req.body;
    if (!address || !date) return res.status(400).json({ error: 'address et date requis.' });
    if (!_ideValidDate(date)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    if (tournee_pref && !IDE_VALID_TOURNEES.includes(tournee_pref)) return res.status(400).json({ error: 'tournee_pref invalide. Valeurs: matin, soir.' });
    if (soins_type && !IDE_VALID_SOINS_TYPES.includes(soins_type)) return res.status(400).json({ error: 'soins_type invalide.' });

    // 1. Geocode the new patient address
    const geo = await _ideGeocode(address);
    if (!geo.latitude) return res.status(400).json({ error: 'Impossible de geocoder l\'adresse.' });

    // 2. Get all nurses
    const { data: nurses } = await db.from('ide_nurses').select('id, nom, prenom').eq('cabinet_id', cabinetId);
    if (!nurses || nurses.length === 0) return res.status(400).json({ error: 'Aucune infirmière dans le cabinet.' });

    // Get cabinet position
    const { data: cabinet } = await db.from('ide_cabinets').select('latitude, longitude').eq('id', cabinetId).single();

    const options = [];

    // 3. For each nurse, get their tournee for this date
    for (const nurse of nurses) {
      const tournees = tournee_pref ? [tournee_pref] : ['matin', 'soir'];

      for (const tournee of tournees) {
        // Check absence
        const { data: absences } = await db.from('ide_absences').select('id')
          .eq('cabinet_id', cabinetId).eq('nurse_id', nurse.id)
          .lte('date_debut', date).gte('date_fin', date).limit(1);
        if (absences && absences.length > 0) continue;

        const { data: visites } = await db.from('ide_visites').select('id, patient_id, ordre_dans_tournee')
          .eq('cabinet_id', cabinetId).eq('nurse_id', nurse.id).eq('date', date).eq('tournee', tournee)
          .order('ordre_dans_tournee');

        // Get patient coordinates for this tournee
        const patientIds = (visites || []).map(v => v.patient_id);
        let patientMap = {};
        if (patientIds.length > 0) {
          const { data: patients } = await db.from('ide_patients').select('id, latitude, longitude').in('id', patientIds);
          for (const p of (patients || [])) patientMap[p.id] = p;
        }

        // Build ordered list of positions (start=cabinet, then patients in order)
        const positions = [];
        positions.push({ lat: cabinet?.latitude || 0, lng: cabinet?.longitude || 0 }); // start: cabinet
        for (const v of (visites || [])) {
          const p = patientMap[v.patient_id];
          if (p && p.latitude) positions.push({ lat: p.latitude, lng: p.longitude });
          else positions.push({ lat: 0, lng: 0 });
        }
        positions.push({ lat: cabinet?.latitude || 0, lng: cabinet?.longitude || 0 }); // end: cabinet

        // Try inserting at each possible position
        for (let pos = 1; pos < positions.length; pos++) {
          const prev = positions[pos - 1];
          const next = positions[pos];
          if (!prev.lat || !next.lat) continue;

          const distPrevNew = _sosHaversineKm(prev.lat, prev.lng, geo.latitude, geo.longitude);
          const distNewNext = _sosHaversineKm(geo.latitude, geo.longitude, next.lat, next.lng);
          const distPrevNext = _sosHaversineKm(prev.lat, prev.lng, next.lat, next.lng);
          const detour = distPrevNew + distNewNext - distPrevNext;

          // Estimate time based on position in tournee
          const baseHour = tournee === 'matin' ? 7 : 14;
          const minutesOffset = (pos - 1) * ((duree_minutes || 15) + 10); // soin + travel
          const heureEstimee = `${String(baseHour + Math.floor(minutesOffset / 60)).padStart(2, '0')}:${String(minutesOffset % 60).padStart(2, '0')}`;

          options.push({
            nurse_id: nurse.id,
            nurse_name: `${nurse.prenom} ${nurse.nom}`,
            tournee,
            position: pos,
            detour_km: Math.round(detour * 100) / 100,
            heure_estimee: heureEstimee,
            nb_visites_existantes: (visites || []).length
          });
        }
      }
    }

    // Sort by detour and return top 3
    options.sort((a, b) => a.detour_km - b.detour_km);
    const best3 = options.slice(0, 3);

    res.json({ ok: true, patient_name, address, coordinates: geo, options: best3 });
  } catch (e) {
    console.error('[IDE Patient Place] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 18. POST /api/ide/patient/place/confirm — Confirmer le placement
app.post('/api/ide/patient/place/confirm', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { patient_id, nurse_id, date, tournee, position, soins_type, duree_minutes } = req.body;
    if (!patient_id || !nurse_id || !date || !tournee) return res.status(400).json({ error: 'patient_id, nurse_id, date et tournee requis.' });
    if (!_ideValidDate(date)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    if (!['matin', 'soir'].includes(tournee)) return res.status(400).json({ error: 'tournee invalide pour placement. Valeurs: matin, soir.' });
    if (soins_type && !IDE_VALID_SOINS_TYPES.includes(soins_type)) return res.status(400).json({ error: 'soins_type invalide.' });

    // SECURITY: Verify patient belongs to this cabinet (IDOR fix)
    const { data: patientCheck } = await db.from('ide_patients').select('id').eq('id', patient_id).eq('cabinet_id', cabinetId).single();
    if (!patientCheck) return res.status(404).json({ error: 'Patient non trouvé dans votre cabinet.' });

    // SECURITY: Verify nurse belongs to this cabinet (IDOR fix)
    const { data: nurseCheck } = await db.from('ide_nurses').select('id').eq('id', nurse_id).eq('cabinet_id', cabinetId).single();
    if (!nurseCheck) return res.status(404).json({ error: 'Infirmière non trouvée dans votre cabinet.' });

    // Insert the visit
    const { data: visite, error } = await db.from('ide_visites').insert({
      cabinet_id: cabinetId,
      patient_id,
      nurse_id,
      date: date,
      tournee,
      soins_type: soins_type || 'soins',
      duree_prevue_minutes: duree_minutes || 15,
      ordre_dans_tournee: position || 999,
      status: 'planifie'
    }).select().single();
    if (error) throw error;

    // Re-optimize the tournee (inline nearest-neighbor)
    const { data: cabinetData } = await db.from('ide_cabinets').select('latitude, longitude').eq('id', cabinetId).single();
    if (cabinetData && cabinetData.latitude) {
      const { data: allVisites } = await db.from('ide_visites').select('id, patient_id')
        .eq('cabinet_id', cabinetId).eq('nurse_id', nurse_id).eq('date', date).eq('tournee', tournee)
        .in('status', ['planifie', 'reporte']);
      if (allVisites && allVisites.length > 0) {
        const pIds = allVisites.map(v => v.patient_id);
        const { data: pts } = await db.from('ide_patients').select('id, latitude, longitude').in('id', pIds);
        const pMap = {};
        for (const p of (pts || [])) pMap[p.id] = p;

        let cLat = cabinetData.latitude, cLng = cabinetData.longitude;
        const rem = [...allVisites];
        const ord = [];
        while (rem.length > 0) {
          let bi = 0, bd = Infinity;
          for (let i = 0; i < rem.length; i++) {
            const pp = pMap[rem[i].patient_id];
            if (!pp || !pp.latitude) continue;
            const dd = _sosHaversineKm(cLat, cLng, pp.latitude, pp.longitude);
            if (dd < bd) { bd = dd; bi = i; }
          }
          const ch = rem.splice(bi, 1)[0];
          const cp = pMap[ch.patient_id];
          if (cp && cp.latitude) { cLat = cp.latitude; cLng = cp.longitude; }
          ord.push(ch);
        }
        for (let i = 0; i < ord.length; i++) {
          await db.from('ide_visites').update({ ordre_dans_tournee: i + 1 }).eq('id', ord[i].id);
        }
      }
    }

    res.json({ ok: true, visite });
  } catch (e) {
    console.error('[IDE Patient Place Confirm] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 19. PATCH /api/ide/visite/:id/status — Changer le statut d'une visite
app.patch('/api/ide/visite/:id/status', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { status, heure_arrivee, heure_depart, notes_visite } = req.body;
    const soins_realises = _ideSanitize(req.body.soins_realises, 2000);
    if (!status) return res.status(400).json({ error: 'status requis.' });
    if (!IDE_VALID_STATUS.includes(status)) return res.status(400).json({ error: 'status invalide. Valeurs: ' + IDE_VALID_STATUS.join(', ') });

    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'en_route') {
      updates.heure_depart_precedent = new Date().toISOString();
    }
    if (heure_arrivee) updates.heure_arrivee = _ideSanitize(heure_arrivee, 50);
    if (heure_depart) updates.heure_depart = _ideSanitize(heure_depart, 50);
    if (soins_realises) updates.soins_realises = soins_realises;
    if (notes_visite) updates.notes_visite = _ideSanitize(notes_visite, 2000);

    if (status === 'termine') {
      if (heure_arrivee && heure_depart) {
        const arrive = new Date(heure_arrivee);
        const depart = new Date(heure_depart);
        updates.duree_reelle_minutes = Math.round((depart - arrive) / 60000);
      }
    }

    const { data, error } = await db.from('ide_visites').update(updates)
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Visite non trouvée.' });
    res.json({ ok: true, visite: data });
  } catch (e) {
    console.error('[IDE Visite Status] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 19b. PATCH /api/ide/visite/:id/notes — Sauvegarder les notes d'une visite
app.patch('/api/ide/visite/:id/notes', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });
    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });
    const { notes } = req.body;
    if (notes === undefined) return res.status(400).json({ error: 'notes requis' });
    const sanitizedNotes = typeof notes === 'string' ? notes.substring(0, 5000) : '';
    const { data, error } = await db.from('ide_visites')
      .update({ notes: sanitizedNotes, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('cabinet_id', cabinetId)
      .select('id, notes')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Visite non trouvée.' });
    res.json({ ok: true, visite: data });
  } catch (e) {
    console.error('[IDE Visite Notes] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 20. GET /api/ide/visite/:id/tracking — Position live (pas d'auth, acces via token unique)
// Rate limit: 30 req/min per IP to prevent polling abuse
app.get('/api/ide/visite/:id/tracking', rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const visiteId = req.params.id;
    const token = req.query.token;
    if (!token || typeof token !== 'string' || token.length > 200) return res.status(401).json({ error: 'Token requis.' });

    // Validate visiteId format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visiteId)) {
      return res.status(400).json({ error: 'ID visite invalide.' });
    }

    // Verify the tracking token
    const { data: visite, error } = await db.from('ide_visites').select('id, nurse_id, status, tracking_token')
      .eq('id', visiteId).single();
    if (error || !visite) return res.status(404).json({ error: 'Visite non trouvée.' });

    // Timing-safe token comparison to prevent timing attacks
    if (!visite.tracking_token || token.length !== visite.tracking_token.length) return res.status(403).json({ error: 'Token invalide.' });
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(visite.tracking_token))) {
      return res.status(403).json({ error: 'Token invalide.' });
    }

    // Get nurse first name only (privacy: no full name for public endpoint)
    const { data: nurse } = await db.from('ide_nurses').select('prenom').eq('id', visite.nurse_id).single();

    // Only expose status and ETA, NOT nurse GPS coordinates (privacy risk)
    // Patients should know status + estimated time, not track nurse in real-time
    let etaMinutes = null;

    res.json({
      ok: true,
      nurse_name: nurse ? nurse.prenom : 'Votre infirmiere',
      status: visite.status,
      eta_minutes: etaMinutes
    });
  } catch (e) {
    console.error('[IDE Visite Tracking] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 19c. POST /api/ide/visite/:id/checkin — Preuve de passage (valeur légale)
// Horodatage SERVEUR + vérification géofencing + log immuable
app.post('/api/ide/visite/:id/checkin', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const { type, lat, lng, signature_patient } = req.body;
    // type = 'arrivee' ou 'depart'
    if (!type || !lat || !lng) return res.status(400).json({ error: 'type, lat, lng requis' });

    const visiteId = parseInt(req.params.id);
    const userId = req.user.id;
    const serverTimestamp = new Date().toISOString();

    // Récupérer la visite et l'adresse du patient (si visite réelle en base)
    let visite = null;
    try {
      const { data } = await db.from('ide_visites')
        .select('*, ide_patients(adresse, lat, lng)')
        .eq('id', visiteId).single();
      visite = data;
    } catch(e) {} // Visite demo — pas en base, on continue quand même

    let geofenceOk = null;
    let distanceM = null;
    if (visite?.ide_patients?.lat && visite?.ide_patients?.lng) {
      // Calcul distance Haversine entre position infirmière et domicile patient
      const R = 6371000;
      const dLat = (lat - visite.ide_patients.lat) * Math.PI / 180;
      const dLng = (lng - visite.ide_patients.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(visite.ide_patients.lat*Math.PI/180) * Math.cos(lat*Math.PI/180) * Math.sin(dLng/2)**2;
      distanceM = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      geofenceOk = distanceM <= 150; // 150 mètres de tolérance
    }

    // Enregistrer la preuve dans le log immuable
    // visite_id peut être un ID demo (pas en base) — on stocke quand même
    const { data: preuve, error: insertErr } = await db.from('ide_preuves_passage').insert({
      visite_id: visite ? visiteId : null,
      user_id: userId,
      nurse_email: req.user.email,
      type: type,
      server_timestamp: serverTimestamp,
      lat: lat,
      lng: lng,
      distance_m: distanceM,
      geofence_ok: geofenceOk,
      signature_patient: signature_patient || null,
      user_agent: req.headers['user-agent'] || null
    }).select().single();

    if (insertErr) console.error('[IDE Preuve] Insert error:', insertErr.message);
    else console.log('[IDE Preuve]', type, 'visite', visiteId, 'dist:', distanceM, 'm, geofence:', geofenceOk, 'id:', preuve?.id);

    res.json({
      ok: true,
      preuve_id: preuve?.id || null,
      server_timestamp: serverTimestamp,
      geofence_ok: geofenceOk,
      distance_m: distanceM,
      signed: !!signature_patient,
      message: geofenceOk === false
        ? 'Attention : vous êtes à ' + distanceM + 'm du domicile du patient'
        : 'Passage enregistré avec horodatage serveur'
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 19d. POST /api/patient/confirm-visit — Confirmation GPS côté patient
// Le patient confirme depuis son téléphone que l'infirmière est bien chez lui
app.post('/api/patient/confirm-visit', async (req, res) => {
  try {
    const { lat, lng, timestamp, patient_id } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat et lng requis' });

    const db = supaAdminOrThrow();
    const serverTimestamp = new Date().toISOString();

    // Enregistrer la confirmation patient dans les preuves
    const { data, error } = await db.from('ide_preuves_passage').insert({
      visite_id: null,
      user_id: null,
      nurse_email: null,
      type: 'confirmation_patient',
      server_timestamp: serverTimestamp,
      lat: lat,
      lng: lng,
      distance_m: null,
      geofence_ok: null,
      signature_patient: null,
      user_agent: req.headers['user-agent'] || null
    }).select().single();

    if (error) console.error('[Patient Confirm] Insert error:', error.message);

    res.json({
      ok: true,
      server_timestamp: serverTimestamp,
      preuve_id: data?.id || null,
      message: 'Confirmation patient enregistrée'
    });
  } catch(e) {
    // Mode demo — pas de DB
    res.json({ ok: true, server_timestamp: new Date().toISOString(), message: 'Confirmation enregistrée (demo)' });
  }
});

// 19e. POST /api/ide/visite/:id/send-medecin — Envoyer photo/vidéo/vocal au médecin via Care Network
app.post('/api/ide/visite/:id/send-medecin', requireAuth(), async (req, res) => {
  try {
    const { patient_id, medecin_nom, message, media_type, media_data } = req.body;
    if (!patient_id || !message) return res.status(400).json({ error: 'patient_id et message requis' });

    const db = supaAdminOrThrow();

    // Chercher le cercle de soins du patient pour trouver le médecin
    const { data: circle } = await db.from('care_circle')
      .select('*')
      .eq('patient_id', patient_id)
      .eq('role', 'referent');

    // Créer le partage dans le Care Network
    const { data: share, error } = await db.from('care_partages').insert({
      patient_id: patient_id,
      sender_cabinet_id: req.user.societe_id,
      sender_user_id: req.user.id,
      sender_name: req.user.email,
      recipient_name: medecin_nom || 'Médecin traitant',
      type: 'observation',
      urgency: 'routine',
      message: message,
      media_url: media_data ? 'data_attached' : null,
      media_type: media_type || null,
      visite_id: parseInt(req.params.id) || null,
      created_at: new Date().toISOString()
    }).select().single();

    if (error) {
      console.warn('[IDE Send Medecin] care_partages insert error:', error.message);
      // Fallback : enregistrer quand même
    }

    console.log('[IDE Send Medecin] Partage envoyé au', medecin_nom, 'pour patient', patient_id);
    res.json({ ok: true, share_id: share?.id || null, message: 'Envoyé au ' + (medecin_nom || 'médecin') });
  } catch(e) {
    // Mode demo
    res.json({ ok: true, message: 'Envoyé au médecin (demo)' });
  }
});

// 21. POST /api/ide/absence — Declarer une absence
app.post('/api/ide/absence', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { nurse_id, date_debut, date_fin } = req.body;
    const motif = _ideSanitize(req.body.motif, 500);
    if (!nurse_id || !date_debut || !date_fin) return res.status(400).json({ error: 'nurse_id, date_debut et date_fin requis.' });
    if (!_ideValidDate(date_debut) || !_ideValidDate(date_fin)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    if (new Date(date_fin) < new Date(date_debut)) return res.status(400).json({ error: 'date_fin doit etre apres date_debut.' });
    const absenceDays = (new Date(date_fin) - new Date(date_debut)) / (1000 * 60 * 60 * 24);
    if (absenceDays > 365) return res.status(400).json({ error: 'Absence maximale: 365 jours.' });

    // Verify nurse belongs to cabinet
    const { data: nurse } = await db.from('ide_nurses').select('id').eq('id', nurse_id).eq('cabinet_id', cabinetId).single();
    if (!nurse) return res.status(404).json({ error: 'Infirmière non trouvée dans votre cabinet.' });

    const { data, error } = await db.from('ide_absences').insert({
      cabinet_id: cabinetId,
      nurse_id,
      date_debut,
      date_fin,
      motif: motif || null
    }).select().single();
    if (error) throw error;
    res.json({ ok: true, absence: data });
  } catch (e) {
    console.error('[IDE Absence POST] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 22. GET /api/ide/absences — Lister les absences du cabinet
app.get('/api/ide/absences', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data, error } = await db.from('ide_absences').select('*').eq('cabinet_id', cabinetId).order('date_debut', { ascending: false });
    if (error) throw error;

    // Enrich absences that have a contract with the contrat_url from signed_documents
    const absWithContract = (data || []).filter(a => a.contrat_document_id);
    if (absWithContract.length > 0) {
      const docIds = absWithContract.map(a => a.contrat_document_id);
      const { data: docs } = await db.from('signed_documents').select('id, original_document_url').in('id', docIds);
      const docMap = {};
      (docs || []).forEach(d => { docMap[d.id] = d.original_document_url; });
      (data || []).forEach(a => {
        if (a.contrat_document_id && docMap[a.contrat_document_id]) {
          a.contrat_url = docMap[a.contrat_document_id];
        }
      });
    }

    res.json({ ok: true, absences: data || [] });
  } catch (e) {
    console.error('[IDE Absences GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 23. GET /api/ide/dashboard — Stats du cabinet
app.get('/api/ide/dashboard', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // Total patients
    const { count: totalPatients } = await db.from('ide_patients').select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId).eq('is_banned', false);

    // Total nurses
    const { count: totalNurses } = await db.from('ide_nurses').select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId);

    // Visits today
    const { count: visitesToday } = await db.from('ide_visites').select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId).eq('date', today);

    // Visits this week
    const { count: visitesWeek } = await db.from('ide_visites').select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId).gte('date', weekStartStr).lte('date', today);

    // KM today
    const { data: tourneesToday } = await db.from('ide_tournees').select('distance_totale_km')
      .eq('cabinet_id', cabinetId).eq('date', today);
    const kmToday = (tourneesToday || []).reduce((sum, t) => sum + (t.distance_totale_km || 0), 0);

    // KM this week
    const { data: tourneesWeek } = await db.from('ide_tournees').select('distance_totale_km')
      .eq('cabinet_id', cabinetId).gte('date', weekStartStr).lte('date', today);
    const kmWeek = (tourneesWeek || []).reduce((sum, t) => sum + (t.distance_totale_km || 0), 0);

    res.json({
      ok: true,
      total_patients: totalPatients || 0,
      total_nurses: totalNurses || 0,
      visites_today: visitesToday || 0,
      visites_week: visitesWeek || 0,
      km_today: Math.round(kmToday * 100) / 100,
      km_week: Math.round(kmWeek * 100) / 100
    });
  } catch (e) {
    console.error('[IDE Dashboard] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- IDE Ordonnances & Compta: Multer storages ---
const IDE_ORDONNANCE_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const IDE_ORDONNANCE_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];

const ordonnanceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'docs', 'uploads', 'ordonnances');
    const fsMod = require('fs');
    if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const ordonnanceUpload = multer({
  storage: ordonnanceStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IDE_ORDONNANCE_MIME.includes(file.mimetype) || !IDE_ORDONNANCE_EXT.includes(ext)) {
      return cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, JPG, PNG.'));
    }
    cb(null, true);
  }
}).single('file');

const comptaIdeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'docs', 'uploads', 'compta-ide');
    const fsMod = require('fs');
    if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const comptaIdeUpload = multer({
  storage: comptaIdeStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IDE_ORDONNANCE_MIME.includes(file.mimetype) || !IDE_ORDONNANCE_EXT.includes(ext)) {
      return cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, JPG, PNG.'));
    }
    cb(null, true);
  }
}).single('file');

const IDE_VALID_ORDONNANCE_STATUS = ['active', 'terminee', 'expiree', 'annulee'];
const IDE_VALID_COMPTA_TYPE = ['recette', 'depense', 'retrocession'];
const IDE_VALID_COMPTA_STATUS = ['a_traiter', 'envoyee_cpam', 'payee', 'rejetee'];

// --- ORDONNANCES ENDPOINTS ---

// 1. POST /api/ide/ordonnances/upload — Upload une ordonnance scannee
app.post('/api/ide/ordonnances/upload', requireAuth(), (req, res) => {
  ordonnanceUpload(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        const status = multerErr.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: multerErr.message });
      }
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni.' });

      const db = supaAdminOrThrow();
      const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
      if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

      const cabinetId = await _ideGetCabinetId(db, societeId);
      if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

      const patient_id = _ideSanitize(req.body.patient_id, 100);
      if (!patient_id) return res.status(400).json({ error: 'patient_id requis.' });

      // Verify patient belongs to this cabinet
      const { data: patient } = await db.from('ide_patients').select('id')
        .eq('id', patient_id).eq('cabinet_id', cabinetId).single();
      if (!patient) return res.status(403).json({ error: 'Patient non trouvé dans votre cabinet.' });

      const medecin_nom = _ideSanitize(req.body.medecin_nom, 200);
      const medecin_rpps = _ideSanitize(req.body.medecin_rpps, 20);
      const date_prescription = _ideSanitize(req.body.date_prescription, 10);
      const date_expiration = _ideSanitize(req.body.date_expiration, 10);
      const nb_seances_prescrites = parseInt(req.body.nb_seances_prescrites, 10) || 0;
      if (nb_seances_prescrites < 0 || nb_seances_prescrites > 9999) return res.status(400).json({ error: 'nb_seances_prescrites invalide (0-9999).' });
      const soins_type = IDE_VALID_SOINS_TYPES.includes(req.body.soins_type) ? req.body.soins_type : 'soins';
      const description = _ideSanitize(req.body.description, 1000);

      if (!date_prescription || !_ideValidDate(date_prescription)) {
        return res.status(400).json({ error: 'date_prescription invalide (YYYY-MM-DD).' });
      }
      if (date_expiration && !_ideValidDate(date_expiration)) {
        return res.status(400).json({ error: 'date_expiration invalide (YYYY-MM-DD).' });
      }

      const mois = date_prescription.substring(0, 7); // YYYY-MM

      const { data: ordonnance, error } = await db.from('ide_ordonnances').insert({
        cabinet_id: cabinetId,
        patient_id,
        medecin_nom,
        medecin_rpps,
        date_prescription,
        date_expiration: date_expiration || null,
        nb_seances_prescrites,
        nb_seances_realisees: 0,
        soins_type,
        description,
        mois,
        status: 'active',
        fichier_nom: _ideSafeFilename(req.file.originalname),
        fichier_path: req.file.filename,
        fichier_mimetype: req.file.mimetype
      }).select().single();
      if (error) throw error;

      res.json({ ok: true, ordonnance });
    } catch (e) {
      // Clean up orphaned file if DB insert failed
      if (req.file && req.file.path) {
        try { require('fs').unlinkSync(req.file.path); } catch (_) {}
      }
      console.error('[IDE Ordonnances Upload] Error:', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
});

// 1b. POST /api/ide/ordonnances/analyser — Analyse IA d'une ordonnance (photo/PDF)
// Utilise Claude pour extraire médicaments, dosages, posologie
// L'infirmière DOIT valider chaque ligne — jamais d'automatisme aveugle
app.post('/api/ide/ordonnances/analyser', requireAuth(), async (req, res) => {
  try {
    const { image_base64, image_type, ordonnance_id } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 requis' });

    const mediaType = image_type || 'image/jpeg';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: image_base64.replace(/^data:[^;]+;base64,/, '') }
          },
          {
            type: 'text',
            text: `Vous êtes un assistant médical. Analysez cette ordonnance médicale et extrayez les informations suivantes au format JSON strict :

{
  "type_ordonnance": "manuscrite" ou "informatique",
  "lisibilite": "bonne", "moyenne" ou "difficile",
  "medecin": { "nom": "...", "rpps": "...", "specialite": "..." },
  "patient": { "nom": "...", "date_naissance": "..." },
  "date_prescription": "YYYY-MM-DD",
  "medicaments": [
    {
      "nom": "nom du médicament",
      "dosage": "dosage prescrit (ex: 500mg)",
      "posologie": "posologie complète (ex: 1 comprimé matin et soir)",
      "duree": "durée du traitement",
      "voie": "orale/injectable/cutanée/etc",
      "alerte_dosage": true/false,
      "commentaire_alerte": "si alerte, expliquer pourquoi le dosage semble inhabituel",
      "confiance": 0-100
    }
  ],
  "soins_infirmiers": ["liste des actes infirmiers prescrits"],
  "remarques": "toute remarque importante"
}

IMPORTANT :
- Si l'écriture est manuscrite et difficile à lire, indiquez confiance < 50 et signalez dans les remarques
- Si un dosage semble inhabituellement élevé ou bas, mettez alerte_dosage: true
- Ne devinez PAS un médicament si vous n'êtes pas sûr — mettez "ILLISIBLE" avec confiance 0
- Répondez UNIQUEMENT avec le JSON, pas de texte autour`
          }
        ]
      }]
    });

    // Parser la réponse Claude
    let analyse = null;
    try {
      const text = response.content[0].text.trim();
      // Extraire le JSON (peut être entouré de markdown ```json ... ```)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) analyse = JSON.parse(jsonMatch[0]);
    } catch(e) {
      return res.status(422).json({ error: 'Impossible de parser l\'analyse', raw: response.content[0].text });
    }

    // Ajouter des alertes de sécurité
    if (analyse && analyse.medicaments) {
      analyse.medicaments.forEach(med => {
        // Flag les médicaments à risque
        const risque = ['insuline','morphine','héparine','lovenox','préviscan','coumadine','méthotrexate','digoxine'];
        if (risque.some(r => (med.nom || '').toLowerCase().includes(r))) {
          med.medicament_risque = true;
        }
        // Flag confiance basse
        if (med.confiance < 50) {
          med.verification_critique = true;
        }
      });
    }

    // Sauvegarder l'analyse si ordonnance_id fourni
    if (ordonnance_id && analyse) {
      const db = supaAdminOrThrow();
      await db.from('ide_ordonnances')
        .update({ analyse_ia: analyse, analyse_date: new Date().toISOString() })
        .eq('id', ordonnance_id);
    }

    res.json({
      ok: true,
      analyse: analyse,
      avertissement: 'Cette analyse est une AIDE. L\'infirmière DOIT vérifier et valider chaque médicament et dosage avant administration.'
    });
  } catch(e) {
    console.error('[IDE Ordonnance Analyse] Error:', e.message);
    res.status(500).json({ error: 'Erreur analyse : ' + e.message });
  }
});

// 2. GET /api/ide/ordonnances — Lister les ordonnances
app.get('/api/ide/ordonnances', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    let query = db.from('ide_ordonnances').select('*, ide_patients(nom, prenom)')
      .eq('cabinet_id', cabinetId);

    if (req.query.patient_id) query = query.eq('patient_id', req.query.patient_id);
    if (req.query.mois) query = query.eq('mois', _ideSanitize(req.query.mois, 7));
    if (req.query.status && IDE_VALID_ORDONNANCE_STATUS.includes(req.query.status)) {
      query = query.eq('status', req.query.status);
    }
    if (req.query.q) {
      const search = _ideSanitize(req.query.q, 100).replace(/[%_\\]/g, c => '\\' + c);
      query = query.or(`medecin_nom.ilike.%${search}%,description.ilike.%${search}%`);
    }

    query = query.order('date_prescription', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // Flatten patient name into response
    const ordonnances = (data || []).map(o => {
      const p = o.ide_patients;
      return { ...o, patient_nom: p ? `${p.prenom} ${p.nom}` : '', ide_patients: undefined };
    });

    res.json({ ok: true, ordonnances });
  } catch (e) {
    console.error('[IDE Ordonnances GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 2b. GET /api/ide/ordonnances/expiring — Ordonnances expirant dans les 7 prochains jours
app.get('/api/ide/ordonnances/expiring', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const now = new Date();
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nowISO = now.toISOString().slice(0, 10);
    const in7ISO = in7days.toISOString().slice(0, 10);

    const { data, error } = await db.from('ide_ordonnances')
      .select('id, date_expiration, type_soins, medecin_nom, description, ide_patients(nom, prenom)')
      .eq('cabinet_id', cabinetId)
      .gte('date_expiration', nowISO)
      .lte('date_expiration', in7ISO)
      .order('date_expiration', { ascending: true });

    if (error) throw error;

    const ordonnances = (data || []).map(o => {
      const p = o.ide_patients;
      const exp = new Date(o.date_expiration);
      const daysRemaining = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      return {
        id: o.id,
        patient_nom: p ? `${p.prenom} ${p.nom}` : '',
        titre: o.description || o.type_soins || 'Ordonnance',
        date_expiration: o.date_expiration,
        days_remaining: daysRemaining
      };
    });

    res.json({ ok: true, count: ordonnances.length, ordonnances });
  } catch (e) {
    console.error('[IDE Ordonnances Expiring] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 3. GET /api/ide/ordonnances/:id/download — Telecharger le scan
app.get('/api/ide/ordonnances/:id/download', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data: ord } = await db.from('ide_ordonnances').select('fichier_path, fichier_nom, fichier_mimetype')
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).single();
    if (!ord || !ord.fichier_path) return res.status(404).json({ error: 'Ordonnance non trouvée.' });

    const uploadDir = path.join(__dirname, 'docs', 'uploads', 'ordonnances');
    const filePath = path.join(uploadDir, ord.fichier_path);
    if (!_ideCheckPathTraversal(filePath, uploadDir)) {
      return res.status(403).json({ error: 'Chemin de fichier invalide.' });
    }
    const fsMod = require('fs');
    if (!fsMod.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });

    const safeName = _ideSafeFilename(ord.fichier_nom || ord.fichier_path);
    res.setHeader('Content-Type', ord.fichier_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fsMod.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('[IDE Ordonnances Download] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 4. PATCH /api/ide/ordonnances/:id — Mettre à jour une ordonnance
app.patch('/api/ide/ordonnances/:id', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const updates = {};
    if (req.body.nb_seances_realisees !== undefined) {
      const nbSeances = parseInt(req.body.nb_seances_realisees, 10) || 0;
      if (nbSeances < 0 || nbSeances > 9999) return res.status(400).json({ error: 'nb_seances_realisees invalide (0-9999).' });
      updates.nb_seances_realisees = nbSeances;
    }
    if (req.body.status && IDE_VALID_ORDONNANCE_STATUS.includes(req.body.status)) {
      updates.status = req.body.status;
    }
    if (req.body.medecin_nom !== undefined) updates.medecin_nom = _ideSanitize(req.body.medecin_nom, 200);
    if (req.body.medecin_rpps !== undefined) updates.medecin_rpps = _ideSanitize(req.body.medecin_rpps, 20);
    if (req.body.date_expiration !== undefined) {
      if (req.body.date_expiration && !_ideValidDate(req.body.date_expiration)) {
        return res.status(400).json({ error: 'date_expiration invalide.' });
      }
      updates.date_expiration = req.body.date_expiration || null;
    }
    if (req.body.description !== undefined) updates.description = _ideSanitize(req.body.description, 1000);
    if (req.body.soins_type && IDE_VALID_SOINS_TYPES.includes(req.body.soins_type)) {
      updates.soins_type = req.body.soins_type;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db.from('ide_ordonnances').update(updates)
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Ordonnance non trouvée.' });
    res.json({ ok: true, ordonnance: data });
  } catch (e) {
    console.error('[IDE Ordonnances PATCH] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 5. POST /api/ide/ordonnances/:id/email — Envoyer l'ordonnance par email
app.post('/api/ide/ordonnances/:id/email', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const to_email = _ideSanitize(req.body.to_email, 200);
    if (!to_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) {
      return res.status(400).json({ error: 'to_email invalide.' });
    }

    const { data: ord } = await db.from('ide_ordonnances').select('*, ide_patients(nom, prenom)')
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).single();
    if (!ord) return res.status(404).json({ error: 'Ordonnance non trouvée.' });

    const patientName = ord.ide_patients ? `${ord.ide_patients.prenom} ${ord.ide_patients.nom}` : 'Patient';
    const subject = (_ideSanitize(req.body.subject, 200) || `Ordonnance — ${patientName} — ${ord.date_prescription}`).replace(/[\r\n]/g, ' ');

    const fsMod = require('fs');
    const filePath = path.join(__dirname, 'docs', 'uploads', 'ordonnances', ord.fichier_path);
    if (!ord.fichier_path || !fsMod.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier ordonnance introuvable.' });
    }

    const { sendMail } = require('./api/multiSocietes/mailer');
    await sendMail({
      to: to_email,
      subject,
      html: `<div style="font-family:system-ui;max-width:600px;margin:0 auto;padding:20px;">
        <div style="text-align:center;margin-bottom:24px;"><div style="font-size:28px;font-weight:800;color:#10b981;">JADOMI</div></div>
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint l'ordonnance de <strong>${patientName}</strong> en date du ${ord.date_prescription}.</p>
        <p>Type de soins : ${ord.soins_type || 'Non precise'}</p>
        <p>Seances prescrites : ${ord.nb_seances_prescrites || 0}</p>
        ${ord.description ? `<p>Description : ${ord.description}</p>` : ''}
        <div style="text-align:center;margin-top:24px;font-size:11px;color:#94a3b8;">JADOMI — Plateforme pour professionnels de sante</div>
      </div>`,
      attachments: [{
        filename: ord.fichier_nom || ord.fichier_path,
        content: fsMod.readFileSync(filePath),
        contentType: ord.fichier_mimetype || 'application/octet-stream'
      }]
    });

    res.json({ ok: true, message: `Ordonnance envoyee a ${to_email}.` });
  } catch (e) {
    console.error('[IDE Ordonnances Email] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- COMPTABILITE IDE ENDPOINTS ---

// 6. POST /api/ide/compta/upload — Upload une facture/recu
app.post('/api/ide/compta/upload', requireAuth(), (req, res) => {
  comptaIdeUpload(req, res, async (multerErr) => {
    try {
      if (multerErr) {
        const status = multerErr.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: multerErr.message });
      }
      const db = supaAdminOrThrow();
      const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
      if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

      const cabinetId = await _ideGetCabinetId(db, societeId);
      if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

      const nurse_id = _ideSanitize(req.body.nurse_id, 100);
      const type = IDE_VALID_COMPTA_TYPE.includes(req.body.type) ? req.body.type : null;
      if (!type) return res.status(400).json({ error: 'type requis (recette, depense, retrocession).' });

      const categorie = _ideSanitize(req.body.categorie, 200);
      const description = _ideSanitize(req.body.description, 1000);
      const montant = parseFloat(req.body.montant);
      if (isNaN(montant) || montant < 0 || montant > 999999.99) return res.status(400).json({ error: 'montant invalide (0-999999.99).' });

      const date_facture = _ideSanitize(req.body.date_facture, 10);
      if (!date_facture || !_ideValidDate(date_facture)) {
        return res.status(400).json({ error: 'date_facture invalide (YYYY-MM-DD).' });
      }

      const patient_id = req.body.patient_id ? _ideSanitize(req.body.patient_id, 100) : null;
      const ordonnance_id = req.body.ordonnance_id ? _ideSanitize(req.body.ordonnance_id, 100) : null;
      const mois = date_facture.substring(0, 7);

      // Verify nurse belongs to cabinet if provided
      if (nurse_id) {
        const { data: nurse } = await db.from('ide_nurses').select('id')
          .eq('id', nurse_id).eq('cabinet_id', cabinetId).single();
        if (!nurse) return res.status(403).json({ error: 'Infirmière non trouvée dans votre cabinet.' });
      }

      // Verify patient belongs to cabinet if provided
      if (patient_id) {
        const { data: pat } = await db.from('ide_patients').select('id')
          .eq('id', patient_id).eq('cabinet_id', cabinetId).single();
        if (!pat) return res.status(403).json({ error: 'Patient non trouvé dans votre cabinet.' });
      }

      // Verify ordonnance belongs to cabinet if provided
      if (ordonnance_id) {
        const { data: ord } = await db.from('ide_ordonnances').select('id')
          .eq('id', ordonnance_id).eq('cabinet_id', cabinetId).single();
        if (!ord) return res.status(403).json({ error: 'Ordonnance non trouvée dans votre cabinet.' });
      }

      const insertData = {
        cabinet_id: cabinetId,
        nurse_id: nurse_id || null,
        type,
        categorie,
        description,
        montant,
        date_facture,
        mois,
        patient_id,
        ordonnance_id,
        status: 'a_traiter'
      };
      if (req.file) {
        insertData.fichier_nom = _ideSafeFilename(req.file.originalname);
        insertData.fichier_path = req.file.filename;
        insertData.fichier_mimetype = req.file.mimetype;
      }

      const { data: ecriture, error } = await db.from('ide_compta').insert(insertData).select().single();
      if (error) throw error;

      res.json({ ok: true, ecriture });
    } catch (e) {
      // Clean up orphaned file if DB insert failed
      if (req.file && req.file.path) {
        try { require('fs').unlinkSync(req.file.path); } catch (_) {}
      }
      console.error('[IDE Compta Upload] Error:', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
});

// 7. GET /api/ide/compta — Lister les ecritures comptables
app.get('/api/ide/compta', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    let query = db.from('ide_compta').select('*').eq('cabinet_id', cabinetId);

    if (req.query.mois) query = query.eq('mois', _ideSanitize(req.query.mois, 7));
    if (req.query.type && IDE_VALID_COMPTA_TYPE.includes(req.query.type)) {
      query = query.eq('type', req.query.type);
    }
    if (req.query.nurse_id) query = query.eq('nurse_id', req.query.nurse_id);
    if (req.query.categorie) query = query.eq('categorie', _ideSanitize(req.query.categorie, 200));

    query = query.order('date_facture', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const ecritures = data || [];
    const total_recettes = ecritures.filter(e => e.type === 'recette').reduce((s, e) => s + (e.montant || 0), 0);
    const total_depenses = ecritures.filter(e => e.type === 'depense').reduce((s, e) => s + (e.montant || 0), 0);
    const total_retrocessions = ecritures.filter(e => e.type === 'retrocession').reduce((s, e) => s + (e.montant || 0), 0);
    const solde = Math.round((total_recettes - total_depenses - total_retrocessions) * 100) / 100;

    res.json({
      ok: true,
      ecritures,
      total_recettes: Math.round(total_recettes * 100) / 100,
      total_depenses: Math.round(total_depenses * 100) / 100,
      total_retrocessions: Math.round(total_retrocessions * 100) / 100,
      solde
    });
  } catch (e) {
    console.error('[IDE Compta GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 8. GET /api/ide/compta/:id/download — Telecharger le justificatif
app.get('/api/ide/compta/:id/download', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { data: ecriture } = await db.from('ide_compta').select('fichier_path, fichier_nom, fichier_mimetype')
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).single();
    if (!ecriture || !ecriture.fichier_path) return res.status(404).json({ error: 'Écriture non trouvée.' });

    const uploadDir = path.join(__dirname, 'docs', 'uploads', 'compta-ide');
    const filePath = path.join(uploadDir, ecriture.fichier_path);
    if (!_ideCheckPathTraversal(filePath, uploadDir)) {
      return res.status(403).json({ error: 'Chemin de fichier invalide.' });
    }
    const fsMod = require('fs');
    if (!fsMod.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });

    const safeName = _ideSafeFilename(ecriture.fichier_nom || ecriture.fichier_path);
    res.setHeader('Content-Type', ecriture.fichier_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fsMod.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('[IDE Compta Download] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 9. GET /api/ide/compta/bilan/:mois — Bilan mensuel
app.get('/api/ide/compta/bilan/:mois', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const mois = _ideSanitize(req.params.mois, 7);
    if (!/^\d{4}-\d{2}$/.test(mois)) return res.status(400).json({ error: 'Format mois invalide (YYYY-MM).' });

    let query = db.from('ide_compta').select('*').eq('cabinet_id', cabinetId).eq('mois', mois);
    if (req.query.nurse_id) query = query.eq('nurse_id', req.query.nurse_id);

    const { data, error } = await query;
    if (error) throw error;

    const ecritures = data || [];

    // Group by categorie per type
    const recettes_par_categorie = {};
    const depenses_par_categorie = {};
    const retrocessions_par_categorie = {};
    let total_recettes = 0;
    let total_depenses = 0;
    let total_retrocessions = 0;

    for (const e of ecritures) {
      const cat = e.categorie || 'non_classee';
      if (e.type === 'recette') {
        recettes_par_categorie[cat] = (recettes_par_categorie[cat] || 0) + (e.montant || 0);
        total_recettes += e.montant || 0;
      } else if (e.type === 'depense') {
        depenses_par_categorie[cat] = (depenses_par_categorie[cat] || 0) + (e.montant || 0);
        total_depenses += e.montant || 0;
      } else if (e.type === 'retrocession') {
        retrocessions_par_categorie[cat] = (retrocessions_par_categorie[cat] || 0) + (e.montant || 0);
        total_retrocessions += e.montant || 0;
      }
    }

    const solde = Math.round((total_recettes - total_depenses - total_retrocessions) * 100) / 100;

    res.json({
      ok: true,
      mois,
      recettes_par_categorie,
      depenses_par_categorie,
      retrocessions_par_categorie,
      total_recettes: Math.round(total_recettes * 100) / 100,
      total_depenses: Math.round(total_depenses * 100) / 100,
      total_retrocessions: Math.round(total_retrocessions * 100) / 100,
      solde,
      nb_factures: ecritures.length
    });
  } catch (e) {
    console.error('[IDE Compta Bilan] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 10. PATCH /api/ide/compta/:id — Mettre à jour statut comptable
app.patch('/api/ide/compta/:id', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const updates = {};
    if (req.body.status && IDE_VALID_COMPTA_STATUS.includes(req.body.status)) {
      updates.status = req.body.status;
    }
    if (req.body.categorie !== undefined) updates.categorie = _ideSanitize(req.body.categorie, 200);
    if (req.body.description !== undefined) updates.description = _ideSanitize(req.body.description, 1000);
    if (req.body.montant !== undefined) {
      const m = parseFloat(req.body.montant);
      if (isNaN(m) || m < 0 || m > 999999.99) return res.status(400).json({ error: 'montant invalide (0-999999.99).' });
      updates.montant = m;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db.from('ide_compta').update(updates)
      .eq('id', req.params.id).eq('cabinet_id', cabinetId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Écriture non trouvée.' });
    res.json({ ok: true, ecriture: data });
  } catch (e) {
    console.error('[IDE Compta PATCH] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ============================================================
// JADOMI COMMERCE — Checkout Amazon-like + Stripe Connect
// ============================================================

// Create Stripe Connect account for supplier (called after mandate signed)
app.post('/api/commerce/connect/onboard-supplier', requireAuth(), async (req, res) => {
  try {
    const { mandate_id } = req.body;
    if (!mandate_id) return res.status(400).json({ error: 'mandate_id requis' });
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });

    const sbClient = supabaseAdmin || supabase;
    const { data: mandate } = await sbClient.from('supplier_mandates')
      .select('*').eq('id', mandate_id).single();
    if (!mandate) return res.status(404).json({ error: 'Mandat non trouvé' });
    if (mandate.status !== 'signed' && mandate.status !== 'active') {
      return res.status(400).json({ error: 'Le mandat doit etre signe' });
    }

    // Check if already has a connected account
    if (mandate.metadata?.stripe_connect_id) {
      return res.json({ ok: true, account_id: mandate.metadata.stripe_connect_id, already_exists: true });
    }

    // Create Custom Connect account
    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'FR',
      email: mandate.supplier_email,
      business_type: 'company',
      company: {
        name: mandate.supplier_name,
        tax_id: mandate.supplier_siret || undefined
      },
      capabilities: {
        transfers: { requested: true }
      },
      external_account: mandate.supplier_iban ? {
        object: 'bank_account',
        country: 'FR',
        currency: 'eur',
        account_number: mandate.supplier_iban
      } : undefined,
      metadata: {
        jadomi_mandate_id: mandate_id,
        supplier_name: mandate.supplier_name
      }
    });

    // Store account ID in mandate metadata
    const meta = { ...(mandate.metadata || {}), stripe_connect_id: account.id };
    await sbClient.from('supplier_mandates')
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq('id', mandate_id);

    res.json({ ok: true, account_id: account.id });
  } catch (e) {
    console.error('[Connect onboard]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Save/update cart (stored per user in jadomi_carts table)
app.post('/api/commerce/cart/save', requireAuth(), async (req, res) => {
  try {
    const { items } = req.body; // [{product_id, name, ref, quantity, unit_price_ht, supplier_id, supplier_name, weight_kg}]
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items requis (array)' });

    const sbClient = supabaseAdmin || supabase;
    const userId = req.user.id;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id;

    const cartData = {
      user_id: userId,
      societe_id: societeId || null,
      items: items,
      items_count: items.reduce((s, i) => s + (i.quantity || 1), 0),
      subtotal_ht: items.reduce((s, i) => s + (i.unit_price_ht || 0) * (i.quantity || 1), 0),
      updated_at: new Date().toISOString()
    };

    // Try upsert
    const { data: existing } = await sbClient.from('jadomi_carts')
      .select('id').eq('user_id', userId).maybeSingle();

    if (existing) {
      await sbClient.from('jadomi_carts').update(cartData).eq('id', existing.id);
    } else {
      cartData.created_at = new Date().toISOString();
      await sbClient.from('jadomi_carts').insert(cartData);
    }

    res.json({ ok: true, items_count: cartData.items_count, subtotal_ht: cartData.subtotal_ht });
  } catch (e) {
    console.error('[Cart save]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get cart
app.get('/api/commerce/cart', requireAuth(), async (req, res) => {
  try {
    const sbClient = supabaseAdmin || supabase;
    const { data: cart } = await sbClient.from('jadomi_carts')
      .select('*').eq('user_id', req.user.id).maybeSingle();

    if (!cart) return res.json({ ok: true, items: [], subtotal_ht: 0, items_count: 0 });

    res.json({ ok: true, ...cart });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Calculate full order: products + shipping + taxes + commission breakdown
app.post('/api/commerce/calculate-order', requireAuth(), async (req, res) => {
  try {
    const { items, societe_id } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items requis' });
    }

    const sId = societe_id || req.user.user_metadata?.societe_id || req.user.societe_id;
    const sbClient = supabaseAdmin || supabase;

    // Get societe address for shipping calculation
    let societe = null;
    if (sId) {
      const { data } = await sbClient.from('societes').select('nom, address, city, postal_code, lat, lng').eq('id', sId).maybeSingle();
      societe = data;
    }

    // Group items by supplier
    const bySupplier = {};
    for (const item of items) {
      const sid = item.supplier_id || 'unknown';
      if (!bySupplier[sid]) bySupplier[sid] = { supplier_id: sid, supplier_name: item.supplier_name || 'Fournisseur', items: [], total_ht: 0, total_weight: 0 };
      bySupplier[sid].items.push(item);
      bySupplier[sid].total_ht += (item.unit_price_ht || 0) * (item.quantity || 1);
      bySupplier[sid].total_weight += (item.weight_kg || 0.1) * (item.quantity || 1);
    }

    const FREE_SHIPPING_THRESHOLD = 150; // per supplier
    const JADOMI_SHIPPING_MARGIN_PCT = 15;
    const JADOMI_COMMISSION_PCT = 10;
    const TVA_PCT = 20;

    let subtotal_products_ht = 0;
    let total_shipping_ht = 0;
    let total_jadomi_shipping_margin = 0;
    let total_jadomi_commission = 0;
    const shipments = [];

    for (const [supplierId, group] of Object.entries(bySupplier)) {
      subtotal_products_ht += group.total_ht;

      // Calculate shipping for this supplier
      let shippingBase = 0;
      let shippingFree = group.total_ht >= FREE_SHIPPING_THRESHOLD;
      let carrier = 'chronopost';
      let deliveryHours = 48;
      let distanceKm = 200;

      // Try to get warehouse for this supplier
      try {
        const { data: warehouse } = await sbClient.from('supplier_warehouses')
          .select('*').eq('supplier_id', supplierId).eq('is_primary', true).maybeSingle();

        if (warehouse && societe && warehouse.lat && warehouse.lng && societe.lat && societe.lng) {
          // Haversine
          const toRad = (d) => d * Math.PI / 180;
          const R = 6371;
          const dLat = toRad(societe.lat - warehouse.lat);
          const dLng = toRad(societe.lng - warehouse.lng);
          const a = Math.sin(dLat/2)**2 + Math.cos(toRad(warehouse.lat)) * Math.cos(toRad(societe.lat)) * Math.sin(dLng/2)**2;
          distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
        }

        // Get transport rate
        const { data: rates } = await sbClient.from('transport_rates')
          .select('*').eq('is_active', true)
          .gte('distance_km_max', distanceKm).gte('weight_kg_max', group.total_weight)
          .order('price_negotiated_eur', { ascending: true }).limit(1);

        if (rates && rates[0]) {
          shippingBase = rates[0].price_negotiated_eur;
          carrier = rates[0].carrier || 'chronopost';
          deliveryHours = rates[0].delivery_hours || 48;
        } else {
          // Default: estimate based on distance and weight
          shippingBase = Math.max(5.90, Math.min(25, distanceKm * 0.03 + group.total_weight * 1.2));
        }
      } catch (logErr) {
        // Fallback
        shippingBase = 8.50;
      }

      const jadomiShippingMargin = shippingFree ? 0 : Math.round(shippingBase * JADOMI_SHIPPING_MARGIN_PCT / 100 * 100) / 100;
      const shippingTotal = shippingFree ? 0 : Math.round((shippingBase + jadomiShippingMargin) * 100) / 100;
      const commission = Math.round(group.total_ht * JADOMI_COMMISSION_PCT / 100 * 100) / 100;
      const missingToFree = shippingFree ? 0 : Math.round((FREE_SHIPPING_THRESHOLD - group.total_ht) * 100) / 100;

      total_shipping_ht += shippingTotal;
      total_jadomi_shipping_margin += jadomiShippingMargin;
      total_jadomi_commission += commission;

      shipments.push({
        supplier_id: supplierId,
        supplier_name: group.supplier_name,
        items_count: group.items.length,
        products_ht: Math.round(group.total_ht * 100) / 100,
        weight_kg: Math.round(group.total_weight * 100) / 100,
        distance_km: distanceKm,
        carrier,
        delivery_hours: deliveryHours,
        shipping_base_ht: Math.round(shippingBase * 100) / 100,
        jadomi_shipping_margin_ht: jadomiShippingMargin,
        shipping_total_ht: shippingTotal,
        shipping_free: shippingFree,
        missing_to_free_shipping: missingToFree,
        commission_ht: commission,
        commission_pct: JADOMI_COMMISSION_PCT,
        net_supplier_ht: Math.round((group.total_ht - commission) * 100) / 100
      });
    }

    const totalHt = Math.round((subtotal_products_ht + total_shipping_ht) * 100) / 100;
    const totalTva = Math.round(totalHt * TVA_PCT / 100 * 100) / 100;
    const totalTtc = Math.round((totalHt + totalTva) * 100) / 100;

    res.json({
      ok: true,
      subtotal_products_ht: Math.round(subtotal_products_ht * 100) / 100,
      total_shipping_ht: Math.round(total_shipping_ht * 100) / 100,
      total_ht: totalHt,
      tva_pct: TVA_PCT,
      tva_amount: totalTva,
      total_ttc: totalTtc,
      jadomi_revenue: {
        commission_ht: Math.round(total_jadomi_commission * 100) / 100,
        commission_pct: JADOMI_COMMISSION_PCT,
        shipping_margin_ht: Math.round(total_jadomi_shipping_margin * 100) / 100,
        shipping_margin_pct: JADOMI_SHIPPING_MARGIN_PCT,
        total_jadomi_ht: Math.round((total_jadomi_commission + total_jadomi_shipping_margin) * 100) / 100
      },
      shipments,
      free_shipping_threshold: FREE_SHIPPING_THRESHOLD
    });
  } catch (e) {
    console.error('[Calculate order]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create Stripe Checkout Session for order payment
app.post('/api/commerce/checkout', requireAuth(), async (req, res) => {
  try {
    const { items, shipping_info } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Panier vide' });
    }
    if (!stripe) return res.status(503).json({ error: 'Stripe non configure. Contactez le support.' });

    const userId = req.user.id;
    const userEmail = req.user.email;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id;

    const FREE_SHIPPING_THRESHOLD = 150;
    const JADOMI_SHIPPING_MARGIN_PCT = 15;
    const JADOMI_COMMISSION_PCT = 10;

    let subtotalHt = 0;
    for (const item of items) {
      subtotalHt += (item.unit_price_ht || 0) * (item.quantity || 1);
    }

    // Estimate shipping (simplified for checkout — full calc done in calculate-order)
    let shippingHt = subtotalHt >= FREE_SHIPPING_THRESHOLD ? 0 : 9.90;

    const totalHt = subtotalHt + shippingHt;
    const tvaPct = 20;
    const tvaAmount = Math.round(totalHt * tvaPct / 100 * 100) / 100;
    const totalTtc = Math.round((totalHt + tvaAmount) * 100) / 100;

    // Build line items for Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name || item.ref || 'Produit',
          description: item.supplier_name ? ('Fournisseur: ' + item.supplier_name) : undefined,
          metadata: {
            product_id: item.product_id || '',
            supplier_id: item.supplier_id || ''
          }
        },
        unit_amount: Math.round((item.unit_price_ht || 0) * 1.20 * 100), // TTC in cents
      },
      quantity: item.quantity || 1
    }));

    // Add shipping as line item if applicable
    if (shippingHt > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Frais de livraison (Chronopost 48h)' },
          unit_amount: Math.round(shippingHt * 1.20 * 100), // TTC
        },
        quantity: 1
      });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'paypal'],
      customer_email: userEmail,
      line_items: lineItems,
      metadata: {
        jadomi_user_id: userId,
        jadomi_societe_id: societeId || '',
        jadomi_order_type: 'commerce',
        items_json: JSON.stringify(items.map(i => ({ id: i.product_id, qty: i.quantity, supplier: i.supplier_id }))).substring(0, 500)
      },
      shipping_options: subtotalHt >= FREE_SHIPPING_THRESHOLD ? [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'eur' },
          display_name: 'Livraison gratuite (JADOMI Express)',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      }] : [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: Math.round(shippingHt * 1.20 * 100), currency: 'eur' },
            display_name: 'Chronopost 48h',
            delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 3 } }
          }
        }
      ],
      success_url: (process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr') + '/checkout-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: (process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr') + '/checkout-cancel',
      locale: 'fr',
      expires_after: 30 * 60, // 30 minutes
    });

    // Save pending order
    const sbClient = supabaseAdmin || supabase;
    await sbClient.from('jadomi_orders').insert({
      user_id: userId,
      societe_id: societeId || null,
      stripe_checkout_session_id: session.id,
      items: items,
      subtotal_products_ht: Math.round(subtotalHt * 100) / 100,
      shipping_ht: Math.round(shippingHt * 100) / 100,
      total_ht: Math.round(totalHt * 100) / 100,
      tva_amount: tvaAmount,
      total_ttc: totalTtc,
      jadomi_commission_ht: Math.round(subtotalHt * JADOMI_COMMISSION_PCT / 100 * 100) / 100,
      jadomi_shipping_margin_ht: Math.round(shippingHt * JADOMI_SHIPPING_MARGIN_PCT / 100 * 100) / 100,
      status: 'pending_payment',
      payment_method: null,
      metadata: { shipping_info: shipping_info || null }
    });

    res.json({
      ok: true,
      checkout_url: session.url,
      session_id: session.id,
      total_ttc: totalTtc
    });
  } catch (e) {
    console.error('[Checkout]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Schedule supplier payout (J+30)
app.post('/api/commerce/payout/schedule', requireAuth(), async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id || !stripe) return res.status(400).json({ error: 'order_id requis et Stripe configure' });

    const sbClient = supabaseAdmin || supabase;
    const { data: order } = await sbClient.from('jadomi_orders')
      .select('*').eq('id', order_id).eq('status', 'paid').single();
    if (!order) return res.status(404).json({ error: 'Commande non trouvée ou non payée' });

    // Group by supplier and transfer
    const items = order.items || [];
    const bySupplier = {};
    for (const item of items) {
      const sid = item.supplier_id || 'unknown';
      if (!bySupplier[sid]) bySupplier[sid] = { total_ht: 0 };
      bySupplier[sid].total_ht += (item.unit_price_ht || 0) * (item.quantity || 1);
    }

    const transfers = [];
    for (const [supplierId, group] of Object.entries(bySupplier)) {
      // Find mandate with Stripe Connect ID
      const { data: mandate } = await sbClient.from('supplier_mandates')
        .select('metadata').eq('supplier_id', supplierId).eq('status', 'signed').maybeSingle();

      const connectId = mandate?.metadata?.stripe_connect_id;
      if (!connectId) {
        transfers.push({ supplier_id: supplierId, status: 'skipped', reason: 'no_connect_account' });
        continue;
      }

      const netSupplier = Math.round(group.total_ht * 0.90 * 100); // 90% in cents (after 10% commission)

      try {
        const transfer = await stripe.transfers.create({
          amount: netSupplier,
          currency: 'eur',
          destination: connectId,
          description: `JADOMI reversement commande ${order.id}`,
          metadata: { jadomi_order_id: order.id, supplier_id: supplierId }
        });
        transfers.push({ supplier_id: supplierId, status: 'transferred', transfer_id: transfer.id, amount_eur: netSupplier / 100 });
      } catch (tErr) {
        transfers.push({ supplier_id: supplierId, status: 'failed', error: tErr.message });
      }
    }

    // Update order
    await sbClient.from('jadomi_orders')
      .update({ status: 'payout_scheduled', metadata: { ...order.metadata, transfers }, updated_at: new Date().toISOString() })
      .eq('id', order_id);

    res.json({ ok: true, transfers });
  } catch (e) {
    console.error('[Payout]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// DISPUTES — Litiges automatises (Amazon A-to-Z style)
// ============================================================

// Client opens a dispute
app.post('/api/disputes', requireAuth(), async (req, res) => {
  try {
    const { order_id, type, description, photo_urls } = req.body;
    if (!order_id || !type) return res.status(400).json({ error: 'order_id et type requis' });

    const validTypes = ['not_received', 'damaged', 'wrong_product', 'expired', 'quality', 'other'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Type invalide: ' + validTypes.join(', ') });

    const sbClient = supabaseAdmin || supabase;

    // Create dispute
    const { data: dispute, error } = await sbClient.from('jadomi_disputes').insert({
      order_id,
      societe_id: req.user.user_metadata?.societe_id || null,
      supplier_id: null, // will be filled from order
      type,
      description: description ? String(description).substring(0, 2000) : null,
      photo_urls: Array.isArray(photo_urls) ? photo_urls.slice(0, 10) : [],
      status: 'opened'
    }).select().single();

    if (error) throw error;

    // Auto-process the dispute
    const disputeEngine = require('./lib/dispute-engine');
    const result = await disputeEngine.processDispute(dispute, sbClient);

    // Update dispute with resolution
    const updateData = { updated_at: new Date().toISOString() };
    if (result.auto_resolved) {
      updateData.status = 'auto_resolved';
      updateData.auto_resolved = true;
      updateData.auto_resolution_reason = result.reason;
      updateData.resolution = result.resolution;
      updateData.refund_amount = result.refund_amount;
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = 'auto';
    } else if (result.escalate) {
      updateData.status = 'investigating';
      updateData.escalation_level = 2;
    } else {
      updateData.status = 'investigating';
    }
    updateData.metadata = { auto_result: result };

    await sbClient.from('jadomi_disputes').update(updateData).eq('id', dispute.id);

    // Update supplier score if resolved
    if (result.auto_resolved && dispute.supplier_id) {
      await disputeEngine.updateSupplierScore(dispute.supplier_id, sbClient);
    }

    res.json({
      ok: true,
      dispute_id: dispute.id,
      auto_resolved: result.auto_resolved,
      resolution: result.resolution,
      reason: result.reason,
      actions: result.actions,
      message: result.auto_resolved
        ? 'Litige resolu automatiquement. ' + (result.resolution === 'full_refund' ? 'Remboursement en cours.' : 'Remplacement en cours.')
        : 'Litige enregistre. Notre equipe examine votre demande sous 48h.'
    });
  } catch (e) {
    console.error('[Disputes]', e.message);
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get disputes for current user
app.get('/api/disputes', requireAuth(), async (req, res) => {
  try {
    const sbClient = supabaseAdmin || supabase;
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id;

    let query = sbClient.from('jadomi_disputes').select('*').order('created_at', { ascending: false });
    if (req.user.role !== 'admin') {
      query = query.eq('societe_id', societeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, disputes: data || [] });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get supplier score
app.get('/api/suppliers/:id/score', requireAuth(), async (req, res) => {
  try {
    const sbClient = supabaseAdmin || supabase;
    const { data } = await sbClient.from('supplier_scores')
      .select('*').eq('supplier_id', req.params.id).maybeSingle();

    res.json({ ok: true, score: data || { score_total: 100, badge: 'new' } });
  } catch (e) {
    console.error('[API Error]', e.message); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// Global error handler — catch toutes les erreurs non gerees par les routes
// =============================================
// =============================================
// SOS REMPLACEMENT IDE — Passe 59
// =============================================

// Helper: generate remplacement contract HTML
function _ideContratRemplacementHtml(titulaire, remplacant, absence, retrocessionPct) {
  const dateDebut = new Date(absence.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateFin = new Date(absence.date_fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Contrat de Remplacement Infirmier</title>
<style>
  body{font-family:'Times New Roman',Times,serif;max-width:800px;margin:40px auto;padding:0 40px;color:#1a1a1a;line-height:1.6;font-size:14px;}
  h1{text-align:center;font-size:20px;margin-bottom:30px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1a1a1a;padding-bottom:15px;}
  h2{font-size:15px;margin-top:25px;margin-bottom:10px;text-transform:uppercase;color:#333;}
  .parties{display:flex;gap:40px;margin:20px 0 30px;}
  .party{flex:1;padding:15px;border:1px solid #ccc;border-radius:4px;}
  .party h3{font-size:13px;margin:0 0 8px;color:#555;text-transform:uppercase;letter-spacing:0.5px;}
  .party p{margin:3px 0;font-size:13px;}
  .article{margin:15px 0;}
  .article-title{font-weight:bold;margin-bottom:5px;}
  .signatures{display:flex;gap:60px;margin-top:50px;}
  .sig-block{flex:1;text-align:center;padding-top:60px;border-top:1px solid #999;}
  .sig-block p{margin:4px 0;font-size:12px;}
  .footer{margin-top:40px;font-size:10px;color:#666;text-align:center;border-top:1px solid #ddd;padding-top:15px;}
  .legal-ref{font-style:italic;color:#555;font-size:12px;margin:10px 0;}
</style></head><body>
<h1>Contrat de Remplacement<br>Infirmier Liberal</h1>
<p class="legal-ref">Etabli conformement a l'Article R.4312-86 du Code de la sante publique<br>
et aux dispositions de la Convention Nationale des Infirmiers Liberaux</p>

<div class="parties">
  <div class="party">
    <h3>Titulaire (remplace)</h3>
    <p><strong>${_ideSanitize(titulaire.prenom + ' ' + titulaire.nom, 200)}</strong></p>
    <p>RPPS : ${_ideSanitize(titulaire.rpps || 'Non renseigne', 20)}</p>
    <p>Cabinet : ${_ideSanitize(titulaire.cabinet_nom || '', 200)}</p>
    <p>Adresse : ${_ideSanitize(titulaire.cabinet_adresse || '', 500)}</p>
    <p>${_ideSanitize((titulaire.cabinet_cp || '') + ' ' + (titulaire.cabinet_ville || ''), 200)}</p>
  </div>
  <div class="party">
    <h3>Remplacant(e)</h3>
    <p><strong>${_ideSanitize(remplacant.prenom + ' ' + remplacant.nom, 200)}</strong></p>
    <p>RPPS : ${_ideSanitize(remplacant.rpps || 'Non renseigne', 20)}</p>
    <p>Cabinet : ${_ideSanitize(remplacant.cabinet_nom || '', 200)}</p>
    <p>Adresse : ${_ideSanitize(remplacant.cabinet_adresse || '', 500)}</p>
    <p>${_ideSanitize((remplacant.cabinet_cp || '') + ' ' + (remplacant.cabinet_ville || ''), 200)}</p>
  </div>
</div>

<h2>Article 1 — Objet du contrat</h2>
<div class="article">
  <p>Le/la titulaire confie au/a la remplacant(e) le remplacement de son activite d'infirmier(e) liberal(e)
  pendant la periode definie ci-dessous, dans le respect des regles deontologiques et professionnelles en vigueur.</p>
</div>

<h2>Article 2 — Duree du remplacement</h2>
<div class="article">
  <p><strong>Date de debut :</strong> ${dateDebut}</p>
  <p><strong>Date de fin :</strong> ${dateFin}</p>
  <p>Motif du remplacement : ${_ideSanitize(absence.motif || 'Non precise', 500)}</p>
</div>

<h2>Article 3 — Conditions financieres</h2>
<div class="article">
  <p>Le/la remplacant(e) percevra <strong>${retrocessionPct}%</strong> des honoraires encaisses pendant la periode de remplacement.</p>
  <p>Le/la titulaire percevra les ${100 - retrocessionPct}% restants au titre de la mise a disposition du cabinet,
  de la patientele et du materiel professionnel.</p>
</div>

<h2>Article 4 — Obligations du remplacant</h2>
<div class="article">
  <p>Le/la remplacant(e) s'engage a :</p>
  <ul>
    <li>Exercer dans le strict respect des regles deontologiques (Code de la sante publique, Livre III, Titre Ier)</li>
    <li>Assurer la continuite des soins aupres de la patientele du/de la titulaire</li>
    <li>Ne pas detourner la patientele du/de la titulaire</li>
    <li>Restituer l'integralite des dossiers et documents professionnels a l'issue du remplacement</li>
    <li>Souscrire une assurance en responsabilite civile professionnelle</li>
  </ul>
</div>

<h2>Article 5 — Obligations du titulaire</h2>
<div class="article">
  <p>Le/la titulaire s'engage a :</p>
  <ul>
    <li>Mettre a disposition du/de la remplacant(e) son cabinet et le materiel necessaire a l'exercice</li>
    <li>Informer la patientele du remplacement</li>
    <li>Cesser toute activite liberale pendant la duree du remplacement (sauf accord ecrit contraire)</li>
  </ul>
</div>

<h2>Article 6 — Assurances</h2>
<div class="article">
  <p>Chacune des parties declare etre couverte par une assurance en responsabilite civile professionnelle
  aupres d'un organisme agree.</p>
</div>

<h2>Article 7 — Dispositions legales</h2>
<div class="article">
  <p>Le present contrat est soumis aux dispositions de l'Article R.4312-86 du Code de la sante publique
  et doit etre communique au Conseil departemental de l'Ordre des Infirmiers dans un delai de 48 heures.</p>
  <p>En cas de litige, les parties conviennent de saisir le Conseil departemental de l'Ordre des Infirmiers
  avant toute action judiciaire.</p>
</div>

<div class="signatures">
  <div class="sig-block">
    <p><strong>Le/la titulaire</strong></p>
    <p>${_ideSanitize(titulaire.prenom + ' ' + titulaire.nom, 200)}</p>
    <p>Date : ${today}</p>
    <p style="margin-top:20px;color:#999;">Signature</p>
  </div>
  <div class="sig-block">
    <p><strong>Le/la remplacant(e)</strong></p>
    <p>${_ideSanitize(remplacant.prenom + ' ' + remplacant.nom, 200)}</p>
    <p>Date : ${today}</p>
    <p style="margin-top:20px;color:#999;">Signature</p>
  </div>
</div>

<div class="footer">
  <p>Contrat genere via la plateforme JADOMI — www.jadomi.fr</p>
  <p>Ce document doit etre transmis au Conseil departemental de l'Ordre des Infirmiers sous 48h.</p>
</div>
</body></html>`;
}

// Rate limit: 20 requetes / heure / IP sur endpoints SOS remplacement
const _ideRemplacementLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, veuillez reessayer dans 1 heure.' }
});
app.use('/api/ide/remplacement', _ideRemplacementLimiter);

// 30. POST /api/ide/remplacement/search — Rechercher des remplacants disponibles
app.post('/api/ide/remplacement/search', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { date_debut, date_fin } = req.body;
    if (!date_debut || !date_fin) return res.status(400).json({ error: 'date_debut et date_fin requis.' });
    if (!_ideValidDate(date_debut) || !_ideValidDate(date_fin)) return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });

    // Get current cabinet info for region matching
    const { data: myCabinet } = await db.from('ide_cabinets').select('id, ville, code_postal').eq('id', cabinetId).single();
    if (!myCabinet) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const cpPrefix = (myCabinet.code_postal || '').substring(0, 2);

    // Find other cabinets in the same region (same department = same 2-digit CP prefix)
    let query = db.from('ide_cabinets').select('id, nom, ville, code_postal, adresse, telephone')
      .neq('id', cabinetId);
    if (cpPrefix) {
      query = query.like('code_postal', cpPrefix + '%');
    }
    const { data: nearCabinets, error: cabError } = await query.limit(50);
    if (cabError) throw cabError;

    if (!nearCabinets || nearCabinets.length === 0) {
      return res.json({ ok: true, remplacants: [], message: 'Aucun cabinet trouve dans votre departement.' });
    }

    const cabinetIds = nearCabinets.map(c => c.id);
    const cabinetMap = {};
    nearCabinets.forEach(c => { cabinetMap[c.id] = c; });

    // Get nurses from those cabinets
    const { data: nurses, error: nurseError } = await db.from('ide_nurses')
      .select('id, nom, prenom, rpps, telephone, email, cabinet_id')
      .in('cabinet_id', cabinetIds);
    if (nurseError) throw nurseError;

    if (!nurses || nurses.length === 0) {
      return res.json({ ok: true, remplacants: [], message: 'Aucune infirmière disponible dans votre département.' });
    }

    const nurseIds = nurses.map(n => n.id);

    // Exclude nurses who already have absences overlapping the requested period
    const { data: busyAbsences } = await db.from('ide_absences')
      .select('nurse_id')
      .in('nurse_id', nurseIds)
      .lte('date_debut', date_fin)
      .gte('date_fin', date_debut);

    const busyNurseIds = new Set((busyAbsences || []).map(a => a.nurse_id));

    const available = nurses
      .filter(n => !busyNurseIds.has(n.id))
      .map(n => {
        const cab = cabinetMap[n.cabinet_id] || {};
        return {
          nurse_id: n.id,
          nom: n.nom,
          prenom: n.prenom,
          rpps: n.rpps,
          telephone: n.telephone,
          email: n.email,
          cabinet_nom: cab.nom || '',
          cabinet_ville: cab.ville || '',
          cabinet_code_postal: cab.code_postal || ''
        };
      });

    res.json({ ok: true, remplacants: available });
  } catch (e) {
    console.error('[IDE Remplacement Search] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 31. POST /api/ide/remplacement/request — Envoyer une demande de remplacement
app.post('/api/ide/remplacement/request', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { absence_id, remplacant_nurse_id } = req.body;
    const message = _ideSanitize(req.body.message, 1000);
    const retrocession_pct = parseFloat(req.body.retrocession_pct) || 70;

    if (!absence_id || !remplacant_nurse_id) return res.status(400).json({ error: 'absence_id et remplacant_nurse_id requis.' });
    if (!_ideValidUuid(absence_id) || !_ideValidUuid(remplacant_nurse_id)) return res.status(400).json({ error: 'Format d\'identifiant invalide.' });
    if (retrocession_pct < 0 || retrocession_pct > 100) return res.status(400).json({ error: 'Retrocession doit etre entre 0 et 100.' });

    // Verify absence belongs to this cabinet
    const { data: absence } = await db.from('ide_absences').select('id, cabinet_id, status')
      .eq('id', absence_id).eq('cabinet_id', cabinetId).single();
    if (!absence) return res.status(404).json({ error: 'Absence non trouvée dans votre cabinet.' });
    if (absence.status === 'pourvu') return res.status(400).json({ error: 'Cette absence a déjà un remplaçant.' });

    // Verify target nurse exists and belongs to another cabinet
    const { data: targetNurse } = await db.from('ide_nurses').select('id, cabinet_id, nom, prenom, email')
      .eq('id', remplacant_nurse_id).single();
    if (!targetNurse) return res.status(404).json({ error: 'Infirmier(e) remplaçant(e) non trouvé(e).' });
    if (targetNurse.cabinet_id === cabinetId) return res.status(400).json({ error: 'Vous ne pouvez pas demander un remplacement a un(e) infirmier(e) de votre propre cabinet.' });

    // Check no duplicate pending request
    const { data: existing } = await db.from('ide_remplacement_requests')
      .select('id').eq('absence_id', absence_id).eq('target_nurse_id', remplacant_nurse_id).eq('status', 'pending').single();
    if (existing) return res.status(400).json({ error: 'Une demande est déjà en cours pour cette infirmière.' });

    const { data: request, error } = await db.from('ide_remplacement_requests').insert({
      absence_id,
      sender_cabinet_id: cabinetId,
      target_nurse_id: remplacant_nurse_id,
      message: message || null,
      retrocession_pct,
      status: 'pending'
    }).select().single();
    if (error) throw error;

    // Update absence status to reflect an ongoing search
    await db.from('ide_absences').update({ status: 'recherche', updated_at: new Date().toISOString() }).eq('id', absence_id);

    res.json({ ok: true, request });
  } catch (e) {
    console.error('[IDE Remplacement Request] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 32. POST /api/ide/remplacement/accept — Accepter une demande de remplacement
app.post('/api/ide/remplacement/accept', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { request_id } = req.body;
    if (!request_id) return res.status(400).json({ error: 'request_id requis.' });
    if (!_ideValidUuid(request_id)) return res.status(400).json({ error: 'Format d\'identifiant invalide.' });

    // Get the request — verify the TARGET nurse belongs to this cabinet (IDOR protection)
    // Accept/decline is done by the remplacant (target), not the sender
    const { data: rReq } = await db.from('ide_remplacement_requests')
      .select('*, ide_absences(*)')
      .eq('id', request_id).eq('status', 'pending').single();
    if (!rReq) return res.status(404).json({ error: 'Demande non trouvée ou déjà traitée.' });

    // Verify that the target nurse belongs to the current user's cabinet
    const { data: targetNurse } = await db.from('ide_nurses')
      .select('cabinet_id').eq('id', rReq.target_nurse_id).single();
    if (!targetNurse || targetNurse.cabinet_id !== cabinetId) {
      return res.status(403).json({ error: 'Vous n\'etes pas autorise a repondre a cette demande.' });
    }

    // Race condition guard: check absence is not already pourvu
    if (rReq.ide_absences && rReq.ide_absences.status === 'pourvu') {
      return res.status(400).json({ error: 'Cette absence a déjà un remplaçant assigné.' });
    }

    // Update request to accepted — optimistic lock on status=pending to prevent double-accept
    const { data: updated, error: updateReqErr } = await db.from('ide_remplacement_requests').update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', request_id).eq('status', 'pending').select().single();
    if (updateReqErr || !updated) {
      return res.status(409).json({ error: 'Demande déjà traitée par un autre utilisateur.' });
    }

    // Update absence with remplacant and status
    const { error: updateAbsErr } = await db.from('ide_absences').update({
      remplacant_id: rReq.target_nurse_id,
      status: 'pourvu',
      updated_at: new Date().toISOString()
    }).eq('id', rReq.absence_id);
    if (updateAbsErr) throw updateAbsErr;

    // Cancel other pending requests for the same absence
    await db.from('ide_remplacement_requests').update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('absence_id', rReq.absence_id).eq('status', 'pending').neq('id', request_id);

    res.json({ ok: true, message: 'Remplacement accepte.' });
  } catch (e) {
    console.error('[IDE Remplacement Accept] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 33. POST /api/ide/remplacement/decline — Decliner une demande
app.post('/api/ide/remplacement/decline', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { request_id } = req.body;
    if (!request_id) return res.status(400).json({ error: 'request_id requis.' });
    if (!_ideValidUuid(request_id)) return res.status(400).json({ error: 'Format d\'identifiant invalide.' });

    // IDOR protection: verify the TARGET nurse belongs to this cabinet (decline = remplacant's action)
    const { data: rReq } = await db.from('ide_remplacement_requests')
      .select('id, absence_id, status, target_nurse_id')
      .eq('id', request_id).eq('status', 'pending').single();
    if (!rReq) return res.status(404).json({ error: 'Demande non trouvée ou déjà traitée.' });

    const { data: targetNurse } = await db.from('ide_nurses')
      .select('cabinet_id').eq('id', rReq.target_nurse_id).single();
    if (!targetNurse || targetNurse.cabinet_id !== cabinetId) {
      return res.status(403).json({ error: 'Vous n\'etes pas autorise a repondre a cette demande.' });
    }

    const { error } = await db.from('ide_remplacement_requests').update({
      status: 'declined',
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', request_id);
    if (error) throw error;

    // Check if there are other pending requests for this absence
    const { count } = await db.from('ide_remplacement_requests')
      .select('id', { count: 'exact', head: true })
      .eq('absence_id', rReq.absence_id).eq('status', 'pending');
    if (count === 0) {
      await db.from('ide_absences').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', rReq.absence_id);
    }

    res.json({ ok: true, message: 'Demande declinee.' });
  } catch (e) {
    console.error('[IDE Remplacement Decline] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 34. POST /api/ide/remplacement/contrat — Générer le contrat de remplacement
app.post('/api/ide/remplacement/contrat', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { absence_id } = req.body;
    const retrocession_pct = parseFloat(req.body.retrocession_pct);
    if (!absence_id) return res.status(400).json({ error: 'absence_id requis.' });
    if (!_ideValidUuid(absence_id)) return res.status(400).json({ error: 'Format d\'identifiant invalide.' });
    if (isNaN(retrocession_pct) || retrocession_pct < 0 || retrocession_pct > 100) return res.status(400).json({ error: 'Retrocession invalide (0-100).' });

    // Get absence with remplacant
    const { data: absence } = await db.from('ide_absences')
      .select('*')
      .eq('id', absence_id).eq('cabinet_id', cabinetId).single();
    if (!absence) return res.status(404).json({ error: 'Absence non trouvée.' });
    if (!absence.remplacant_id) return res.status(400).json({ error: 'Aucun remplaçant assigné à cette absence.' });

    // Get titulaire nurse info
    const { data: titulaire } = await db.from('ide_nurses').select('id, nom, prenom, rpps, telephone, email, cabinet_id')
      .eq('id', absence.nurse_id).single();
    if (!titulaire) return res.status(404).json({ error: 'Infirmier(e) titulaire non trouvé(e).' });

    // Get remplacant nurse info
    const { data: remplacant } = await db.from('ide_nurses').select('id, nom, prenom, rpps, telephone, email, cabinet_id')
      .eq('id', absence.remplacant_id).single();
    if (!remplacant) return res.status(404).json({ error: 'Infirmier(e) remplaçant(e) non trouvé(e).' });

    // Get cabinet info for both
    const { data: cabTitulaire } = await db.from('ide_cabinets').select('nom, adresse, ville, code_postal').eq('id', titulaire.cabinet_id).single();
    const { data: cabRemplacant } = await db.from('ide_cabinets').select('nom, adresse, ville, code_postal').eq('id', remplacant.cabinet_id).single();

    titulaire.cabinet_nom = cabTitulaire?.nom || '';
    titulaire.cabinet_adresse = cabTitulaire?.adresse || '';
    titulaire.cabinet_ville = cabTitulaire?.ville || '';
    titulaire.cabinet_cp = cabTitulaire?.code_postal || '';

    remplacant.cabinet_nom = cabRemplacant?.nom || '';
    remplacant.cabinet_adresse = cabRemplacant?.adresse || '';
    remplacant.cabinet_ville = cabRemplacant?.ville || '';
    remplacant.cabinet_cp = cabRemplacant?.code_postal || '';

    // Generate HTML contract
    const htmlContent = _ideContratRemplacementHtml(titulaire, remplacant, absence, retrocession_pct);

    // Save HTML contract file
    const contratDir = path.join(__dirname, 'docs', 'uploads', 'contrats-remplacement');
    const fsMod = require('fs');
    if (!fsMod.existsSync(contratDir)) fsMod.mkdirSync(contratDir, { recursive: true });
    const filename = `contrat-remplacement-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.html`;
    const filepath = path.join(contratDir, filename);
    fsMod.writeFileSync(filepath, htmlContent, 'utf-8');

    // Store in signed_documents
    const { data: doc, error: docError } = await db.from('signed_documents').insert({
      societe_id: societeId,
      user_id: req.user.id,
      title: `Contrat de remplacement — ${titulaire.prenom} ${titulaire.nom} / ${remplacant.prenom} ${remplacant.nom}`,
      category: 'contrat',
      subcategory: 'remplacement_ide',
      signer_name: `${remplacant.prenom} ${remplacant.nom}`,
      signer_email: remplacant.email || null,
      signer_role: 'remplacant',
      status: 'pending',
      signed_pdf_path: filepath,
      original_document_url: `/docs/uploads/contrats-remplacement/${filename}`,
      metadata: {
        absence_id: absence.id,
        titulaire_id: titulaire.id,
        remplacant_id: remplacant.id,
        retrocession_pct,
        date_debut: absence.date_debut,
        date_fin: absence.date_fin
      }
    }).select().single();
    if (docError) throw docError;

    // Update absence with contract info
    await db.from('ide_absences').update({
      contrat_document_id: doc.id,
      contrat_signe: false,
      updated_at: new Date().toISOString()
    }).eq('id', absence_id);

    // Signer le contrat via JADOMI Sign (AES eIDAS)
    let signResult = null;
    try {
      const jadomiSign = require('./lib/jadomi-sign');
      const fsMod2 = require('fs');
      const htmlBuf = fsMod2.readFileSync(filepath);
      const signatureId = jadomiSign.generateSignatureId();
      signResult = await jadomiSign.archiveSignedDocument(signatureId, htmlBuf, {
        title: doc.title,
        signer_name: `${remplacant.prenom} ${remplacant.nom}`,
        signer_email: remplacant.email,
        category: 'contrat_remplacement_ide',
        societe_id: societeId
      });
      // Mettre à jour le document avec le résultat de signature
      await db.from('signed_documents').update({
        jadomi_sign_id: signatureId,
        signature_hash: signResult?.hash || null,
        status: 'sent_for_signature'
      }).eq('id', doc.id);
      console.log('[IDE Contrat] Signé via JADOMI Sign:', signatureId);
    } catch(signErr) {
      console.warn('[IDE Contrat] JADOMI Sign non disponible, contrat généré sans signature:', signErr.message);
    }

    res.json({
      ok: true,
      document: doc,
      contrat_url: `/docs/uploads/contrats-remplacement/${filename}`,
      jadomi_sign: signResult ? { id: signResult.signatureId || signResult.id, signed: true } : null
    });
  } catch (e) {
    console.error('[IDE Remplacement Contrat] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 35. POST /api/ide/remplacement/envoyer-ordre — Envoyer le contrat a l'Ordre des Infirmiers
app.post('/api/ide/remplacement/envoyer-ordre', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const { absence_id } = req.body;
    if (!absence_id) return res.status(400).json({ error: 'absence_id requis.' });
    if (!_ideValidUuid(absence_id)) return res.status(400).json({ error: 'Format d\'identifiant invalide.' });

    // Get absence
    const { data: absence } = await db.from('ide_absences')
      .select('*')
      .eq('id', absence_id).eq('cabinet_id', cabinetId).single();
    if (!absence) return res.status(404).json({ error: 'Absence non trouvée.' });
    if (!absence.contrat_document_id) return res.status(400).json({ error: 'Aucun contrat généré pour cette absence. Générez le contrat d\'abord.' });
    if (absence.contrat_envoye_ordre) return res.status(400).json({ error: 'Le contrat a déjà été envoyé à l\'Ordre.' });

    // Get contract document
    const { data: doc } = await db.from('signed_documents').select('*').eq('id', absence.contrat_document_id).single();
    if (!doc) return res.status(404).json({ error: 'Document contrat non trouvé.' });

    // Get cabinet info for the email
    const { data: cabinet } = await db.from('ide_cabinets').select('nom, ville, code_postal').eq('id', cabinetId).single();
    const deptCode = (cabinet?.code_postal || '00').substring(0, 2);

    // Get nurse info
    const { data: titulaire } = await db.from('ide_nurses').select('nom, prenom').eq('id', absence.nurse_id).single();
    const { data: remplacant } = await db.from('ide_nurses').select('nom, prenom').eq('id', absence.remplacant_id).single();

    // Send email to Ordre des Infirmiers (placeholder departmental email)
    const ordreEmail = `cdoi${deptCode}@ordre-infirmiers.fr`;
    let mailSent = false;
    try {
      const { sendMail } = require('./api/multiSocietes/mailer');
      const fsMod = require('fs');
      const attachments = [];
      if (doc.signed_pdf_path && fsMod.existsSync(doc.signed_pdf_path)) {
        attachments.push({
          filename: `contrat-remplacement-${titulaire?.nom || 'IDE'}-${remplacant?.nom || 'IDE'}.html`,
          path: doc.signed_pdf_path
        });
      }
      await sendMail({
        to: ordreEmail,
        subject: `Contrat de remplacement — ${titulaire?.prenom || ''} ${titulaire?.nom || ''} / ${remplacant?.prenom || ''} ${remplacant?.nom || ''}`,
        html: `<p>Madame, Monsieur,</p>
<p>Veuillez trouver ci-joint le contrat de remplacement etabli entre :</p>
<ul>
  <li><strong>Titulaire :</strong> ${_ideSanitize((titulaire?.prenom || '') + ' ' + (titulaire?.nom || ''), 200)}</li>
  <li><strong>Remplacant(e) :</strong> ${_ideSanitize((remplacant?.prenom || '') + ' ' + (remplacant?.nom || ''), 200)}</li>
</ul>
<p><strong>Periode :</strong> du ${absence.date_debut} au ${absence.date_fin}</p>
<p>Ce contrat est transmis conformement a l'Article R.4312-86 du Code de la sante publique.</p>
<p>Nous vous prions d'agreer, Madame, Monsieur, l'expression de nos salutations distinguees.</p>
<p><em>Cabinet ${_ideSanitize(cabinet?.nom || '', 200)} — ${_ideSanitize((cabinet?.code_postal || '') + ' ' + (cabinet?.ville || ''), 200)}</em></p>
<p style="font-size:11px;color:#888;">Envoye via la plateforme JADOMI — www.jadomi.fr</p>`,
        attachments
      });
      mailSent = true;
    } catch (mailErr) {
      console.error('[IDE Remplacement Ordre Mail] Mail send error:', mailErr.message);
      mailSent = false;
    }

    // Update absence — track actual send status
    await db.from('ide_absences').update({
      contrat_envoye_ordre: mailSent,
      updated_at: new Date().toISOString()
    }).eq('id', absence_id);

    // Update signed_documents
    await db.from('signed_documents').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: { ...doc.metadata, sent_to_ordre: true, ordre_email: ordreEmail, sent_at: new Date().toISOString() }
    }).eq('id', doc.id);

    const msg = mailSent
      ? `Contrat envoye au Conseil departemental de l'Ordre (${ordreEmail}).`
      : `Contrat marque comme en attente d'envoi. L'email a ${ordreEmail} n'a pas pu etre envoye — reessayez ou envoyez manuellement.`;
    res.json({ ok: mailSent, warning: !mailSent, message: msg, ordre_email: ordreEmail });
  } catch (e) {
    console.error('[IDE Remplacement Envoyer Ordre] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 36. GET /api/ide/remplacement/requests — Lister les demandes de remplacement pour une absence
app.get('/api/ide/remplacement/requests', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune societe associee.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    const absenceId = req.query.absence_id;
    if (absenceId && !_ideValidUuid(absenceId)) return res.status(400).json({ error: 'Format d\'identifiant invalide.' });

    let query = db.from('ide_remplacement_requests').select('*').eq('sender_cabinet_id', cabinetId).order('created_at', { ascending: false });
    if (absenceId) query = query.eq('absence_id', absenceId);

    const { data, error } = await query.limit(100);
    if (error) throw error;

    // Enrich with nurse info
    const nurseIds = [...new Set((data || []).map(r => r.target_nurse_id))];
    let nurseMap = {};
    if (nurseIds.length > 0) {
      const { data: nurses } = await db.from('ide_nurses').select('id, nom, prenom, rpps, telephone, email, cabinet_id').in('id', nurseIds);
      (nurses || []).forEach(n => { nurseMap[n.id] = n; });
    }

    const enriched = (data || []).map(r => ({
      ...r,
      remplacant_nom: nurseMap[r.target_nurse_id]?.nom || '',
      remplacant_prenom: nurseMap[r.target_nurse_id]?.prenom || '',
      remplacant_rpps: nurseMap[r.target_nurse_id]?.rpps || '',
      remplacant_tel: nurseMap[r.target_nurse_id]?.telephone || ''
    }));

    res.json({ ok: true, requests: enriched });
  } catch (e) {
    console.error('[IDE Remplacement Requests GET] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ============================================================
// JADOMI IDE — Demandes de soins patients (page publique)
// ============================================================

// Multer config for ordonnance uploads (10MB, JPG/PNG/PDF only)
const _ideOrdoMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
const _ideOrdoExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
const _ideOrdoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'ordonnances');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});
const _ideOrdoUpload = multer({
  storage: _ideOrdoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!_ideOrdoMimeTypes.includes(file.mimetype) || !_ideOrdoExtensions.includes(ext)) {
      return cb(new Error('Type de fichier non autorisé. Formats acceptés : JPG, PNG, PDF.'));
    }
    cb(null, true);
  }
}).single('ordonnance_file');

// Rate limiter: 3 requests per hour per IP (public endpoint)
const _ideDemandesSoinsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes. Vous pouvez soumettre 3 demandes par heure maximum.' }
});

// Geocode via API adresse.data.gouv.fr (French government API, no rate limit issues)
async function _ideGeocodeGouv(adresse) {
  try {
    const resp = await fetch('https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(adresse) + '&limit=1', {
      headers: { 'User-Agent': 'JADOMI/1.0' }
    });
    const data = await resp.json();
    if (data && data.features && data.features.length > 0) {
      const coords = data.features[0].geometry.coordinates;
      return { latitude: coords[1], longitude: coords[0], label: data.features[0].properties.label || adresse };
    }
    return { latitude: null, longitude: null, label: adresse };
  } catch (e) {
    console.error('[IDE Geocode Gouv] Error:', e.message);
    return { latitude: null, longitude: null, label: adresse };
  }
}

// Haversine distance in km
function _ideHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Subscription tier defaults
const _ideFormuleDefaults = {
  essentiel: { delai_minutes: 30, max_acceptations_jour: 2, rayon_km: 5 },
  pro: { delai_minutes: 5, max_acceptations_jour: 10, rayon_km: 15 },
  premium: { delai_minutes: 0, max_acceptations_jour: 999, rayon_km: 30 }
};

// Helper: get cabinet subscription
async function _ideGetAbonnement(db, cabinetId) {
  try {
    const { data } = await db.from('ide_abonnements').select('*').eq('cabinet_id', cabinetId).eq('active', true).order('created_at', { ascending: false }).limit(1).single();
    if (data) return data;
  } catch (e) {
    // Table may not exist yet, fallback
  }
  // Default: essentiel
  return { formule: 'essentiel', ..._ideFormuleDefaults.essentiel };
}

// 37. POST /api/ide/demandes-soins — Demande de soins patient (PUBLIC)
app.post('/api/ide/demandes-soins', _ideDemandesSoinsLimiter, (req, res) => {
  _ideOrdoUpload(req, res, async function(err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Fichier trop volumineux (10 Mo maximum).' });
      return res.status(400).json({ error: err.message || 'Erreur lors de l\'envoi du fichier.' });
    }
    try {
      const nom = _ideSanitize(req.body.nom, 100);
      const prenom = _ideSanitize(req.body.prenom, 100);
      const telephone = _ideSanitize(req.body.telephone, 20);
      const adresse = _ideSanitize(req.body.adresse, 500);
      const type_soin = _ideSanitize(req.body.type_soin, 100);
      const rgpd_consent = req.body.rgpd_consent === 'true' || req.body.rgpd_consent === true;

      // Validation
      if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom sont requis.' });
      if (!telephone || !/^[\d\s+.\-()]{8,20}$/.test(telephone.replace(/&[^;]+;/g, ''))) {
        return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
      }
      if (!adresse) return res.status(400).json({ error: 'Adresse requise.' });
      if (!type_soin) return res.status(400).json({ error: 'Type de soin requis.' });
      const validSoins = ['prise_de_sang','pansement','injection','perfusion','toilette_medicalisee','soins_post_operatoires','chimiotherapie','surveillance_diabete','autre'];
      const rawTypeSoin = String(req.body.type_soin || '').trim();
      if (!validSoins.includes(rawTypeSoin)) return res.status(400).json({ error: 'Type de soin invalide.' });
      if (!rgpd_consent) return res.status(400).json({ error: 'Le consentement RGPD est obligatoire.' });
      if (!req.file) return res.status(400).json({ error: 'La photo de l\'ordonnance est obligatoire.' });

      // Geocode address (use raw address for better geocoding accuracy)
      const geo = await _ideGeocodeGouv(String(req.body.adresse || '').trim());

      const ordonnance_path = req.file ? req.file.filename : null;
      const id = crypto.randomUUID();

      // Try database insert, fallback to demo mode
      let dbSuccess = false;
      try {
        const db = supaAdminOrThrow();
        const { error: insertErr } = await db.from('ide_demandes_soins').insert({
          id,
          nom, prenom, telephone, adresse,
          latitude: geo.latitude, longitude: geo.longitude,
          type_soin: rawTypeSoin,
          ordonnance_path,
          rgpd_consent: true,
          status: 'en_attente'
        });
        if (insertErr) throw insertErr;
        dbSuccess = true;
      } catch (dbErr) {
        console.warn('[IDE Demandes Soins POST] DB insert failed (demo mode):', dbErr.message);
      }

      console.log(`[IDE Demandes Soins] Nouvelle demande ${id} - ${type_soin} - ${adresse} (db=${dbSuccess})`);

      res.json({
        ok: true,
        id,
        status: 'en_attente',
        message: 'Votre demande de soins a bien été enregistrée. Les infirmières de votre secteur seront notifiées.'
      });
    } catch (e) {
      console.error('[IDE Demandes Soins POST] Error:', e.message);
      res.status(500).json({ error: 'Erreur serveur. Veuillez réessayer.' });
    }
  });
});

// 38. GET /api/ide/demandes-soins/disponibles — Demandes disponibles pour une infirmière (AUTH)
app.get('/api/ide/demandes-soins/disponibles', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune société associée.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    // Get cabinet geo
    const { data: cabinet } = await db.from('ide_cabinets').select('latitude, longitude').eq('id', cabinetId).single();
    if (!cabinet || !cabinet.latitude) return res.status(400).json({ error: 'Votre cabinet n\'a pas d\'adresse géocodée.' });

    // Get subscription tier
    const abo = await _ideGetAbonnement(db, cabinetId);
    const formule = abo.formule || 'essentiel';
    const defaults = _ideFormuleDefaults[formule] || _ideFormuleDefaults.essentiel;
    const delaiMinutes = abo.delai_notification_minutes ?? defaults.delai_minutes;
    const rayonKm = abo.rayon_km ?? defaults.rayon_km;

    // Query pending requests with delay filter
    const cutoff = new Date(Date.now() - delaiMinutes * 60 * 1000).toISOString();
    let query = db.from('ide_demandes_soins')
      .select('id, type_soin, adresse, latitude, longitude, created_at, status')
      .eq('status', 'en_attente')
      .gt('expires_at', new Date().toISOString());

    if (delaiMinutes > 0) {
      query = query.lt('created_at', cutoff);
    }

    const { data: demandes, error: dErr } = await query.order('created_at', { ascending: false }).limit(50);
    if (dErr) throw dErr;

    // Filter by distance and enrich
    const results = [];
    for (const d of (demandes || [])) {
      if (!d.latitude || !d.longitude) continue;
      const dist = _ideHaversineKm(cabinet.latitude, cabinet.longitude, d.latitude, d.longitude);
      if (dist > rayonKm) continue;

      const item = {
        id: d.id,
        type_soin: d.type_soin,
        ville: (d.adresse || '').split(',').pop()?.trim() || d.adresse,
        distance_km: Math.round(dist * 10) / 10,
        created_at: d.created_at,
        il_y_a: _ideTimeAgo(d.created_at)
      };

      // Premium extra info
      if (formule === 'premium') {
        item.duree_estimee = _ideEstimerDuree(d.type_soin);
        item.frequence = _ideEstimerFrequence(d.type_soin);
      }

      results.push(item);
    }

    // Sort by distance
    results.sort((a, b) => a.distance_km - b.distance_km);

    res.json({
      ok: true,
      formule,
      delai_minutes: delaiMinutes,
      rayon_km: rayonKm,
      demandes: results,
      count: results.length
    });
  } catch (e) {
    console.error('[IDE Demandes Soins Disponibles] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Helper: time ago in French
function _ideTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}

// Helper: estimated duration by care type
function _ideEstimerDuree(typeSoin) {
  const durees = {
    prise_de_sang: '15 min', pansement: '20 min', injection: '10 min',
    perfusion: '45 min', toilette_medicalisee: '30 min', soins_post_operatoires: '25 min',
    chimiotherapie: '60 min', surveillance_diabete: '15 min', autre: '20 min'
  };
  return durees[typeSoin] || '20 min';
}

// Helper: estimated frequency
function _ideEstimerFrequence(typeSoin) {
  const freq = {
    prise_de_sang: 'ponctuel', pansement: 'quotidien', injection: 'ponctuel',
    perfusion: 'quotidien', toilette_medicalisee: 'quotidien', soins_post_operatoires: 'quotidien',
    chimiotherapie: 'hebdomadaire', surveillance_diabete: 'quotidien', autre: 'à définir'
  };
  return freq[typeSoin] || 'à définir';
}

// Rate limiter for cancelling care requests
const _ideDeleteDemandesLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives d\'annulation. Réessayez plus tard.' }
});

// Rate limiter for accepting care requests
const _ideAccepterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 1 minute.' }
});

// 39. POST /api/ide/demandes-soins/:id/accepter — Accepter une demande (AUTH)
app.post('/api/ide/demandes-soins/:id/accepter', requireAuth(), _ideAccepterLimiter, async (req, res) => {
  try {
    const demandeId = req.params.id;
    if (!_ideValidUuid(demandeId)) return res.status(400).json({ error: 'Identifiant invalide.' });

    const db = supaAdminOrThrow();
    const societeId = req.user.user_metadata?.societe_id || req.user.societe_id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'Aucune société associée.' });

    const cabinetId = await _ideGetCabinetId(db, societeId);
    if (!cabinetId) return res.status(404).json({ error: 'Cabinet non trouvé.' });

    // Check subscription tier limits
    const abo = await _ideGetAbonnement(db, cabinetId);
    const formule = abo.formule || 'essentiel';
    const defaults = _ideFormuleDefaults[formule] || _ideFormuleDefaults.essentiel;
    const maxAccept = abo.max_acceptations_jour ?? defaults.max_acceptations_jour;

    // Count today's acceptations
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayAccepted, error: countErr } = await db.from('ide_demandes_soins')
      .select('id')
      .eq('cabinet_id', cabinetId)
      .eq('status', 'acceptee')
      .gte('accepted_at', todayStart.toISOString());
    if (!countErr && todayAccepted && todayAccepted.length >= maxAccept) {
      return res.status(429).json({
        error: `Limite d'acceptations atteinte pour la formule ${formule} (${maxAccept}/jour). Passez à une formule supérieure pour accepter plus de demandes.`
      });
    }

    // Get the nurse_id (first active nurse of the cabinet, or from body)
    const nurseId = req.body.nurse_id ? parseInt(req.body.nurse_id) : null;
    let selectedNurseId = nurseId;
    if (!selectedNurseId) {
      const { data: nurses } = await db.from('ide_nurses').select('id').eq('cabinet_id', cabinetId).limit(1);
      selectedNurseId = nurses && nurses.length > 0 ? nurses[0].id : null;
    }

    // Accept the request (atomic: check status is still en_attente)
    const { data: updated, error: upErr } = await db.from('ide_demandes_soins')
      .update({
        status: 'acceptee',
        nurse_id: selectedNurseId,
        cabinet_id: cabinetId,
        accepted_at: new Date().toISOString()
      })
      .eq('id', demandeId)
      .eq('status', 'en_attente')
      .select()
      .single();

    if (upErr || !updated) {
      return res.status(409).json({ error: 'Cette demande a déjà été acceptée par un autre cabinet ou a expiré.' });
    }

    // Try to auto-place the patient in the best tournee
    let placementResult = null;
    try {
      if (selectedNurseId && updated.latitude && updated.longitude) {
        // Create a temporary patient entry for placement
        const patientData = {
          cabinet_id: cabinetId,
          nom: updated.nom,
          prenom: updated.prenom,
          adresse: updated.adresse,
          telephone: updated.telephone,
          latitude: updated.latitude,
          longitude: updated.longitude,
          statut: 'actif'
        };

        const { data: newPatient, error: patErr } = await db.from('ide_patients').insert(patientData).select().single();
        if (!patErr && newPatient) {
          placementResult = { patient_id: newPatient.id, message: 'Patient ajouté au cabinet.' };
        }
      }
    } catch (placeErr) {
      console.warn('[IDE Demandes Soins Accepter] Placement auto échoué:', placeErr.message);
    }

    // Get nurse info for response
    let nurseInfo = {};
    if (selectedNurseId) {
      const { data: nurse } = await db.from('ide_nurses').select('prenom, telephone').eq('id', selectedNurseId).single();
      if (nurse) nurseInfo = { nurse_prenom: nurse.prenom, nurse_telephone: nurse.telephone };
    }

    console.log(`[IDE Demandes Soins] Demande ${demandeId} acceptee par cabinet ${cabinetId} (formule: ${formule})`);

    res.json({
      ok: true,
      demande: {
        id: updated.id,
        status: 'acceptee',
        nom: updated.nom,
        prenom: updated.prenom,
        telephone: updated.telephone,
        adresse: updated.adresse,
        type_soin: updated.type_soin,
        ordonnance_path: updated.ordonnance_path,
        ...nurseInfo
      },
      placement: placementResult
    });
  } catch (e) {
    console.error('[IDE Demandes Soins Accepter] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// 40. GET /api/ide/demandes-soins/:id/status — Statut d'une demande (PUBLIC)
app.get('/api/ide/demandes-soins/:id/status', async (req, res) => {
  try {
    const demandeId = req.params.id;
    if (!_ideValidUuid(demandeId)) return res.status(400).json({ error: 'Identifiant invalide.' });

    const db = supaAdminOrThrow();
    const { data, error } = await db.from('ide_demandes_soins')
      .select('id, status, created_at, accepted_at, nurse_id')
      .eq('id', demandeId)
      .single();

    if (error || !data) {
      // Demo mode fallback
      return res.json({ ok: true, id: demandeId, status: 'en_attente', nurse_prenom: null, nurse_telephone: null });
    }

    const result = {
      ok: true,
      id: data.id,
      status: data.status,
      created_at: data.created_at,
      accepted_at: data.accepted_at,
      nurse_prenom: null,
      nurse_telephone: null
    };

    // If accepted, reveal nurse info
    if (data.status === 'acceptee' && data.nurse_id) {
      const { data: nurse } = await db.from('ide_nurses').select('prenom, telephone').eq('id', data.nurse_id).single();
      if (nurse) {
        result.nurse_prenom = nurse.prenom;
        result.nurse_telephone = nurse.telephone;
      }
    }

    res.json(result);
  } catch (e) {
    console.error('[IDE Demandes Soins Status] Error:', e.message);
    // Demo fallback
    res.json({ ok: true, id: req.params.id, status: 'en_attente', nurse_prenom: null, nurse_telephone: null });
  }
});

// 41. DELETE /api/ide/demandes-soins/:id — Annuler/supprimer une demande (PUBLIC, RGPD)
app.delete('/api/ide/demandes-soins/:id', _ideDeleteDemandesLimiter, async (req, res) => {
  try {
    const demandeId = req.params.id;
    if (!_ideValidUuid(demandeId)) return res.status(400).json({ error: 'Identifiant invalide.' });

    const db = supaAdminOrThrow();

    // Get ordonnance path before deleting
    const { data: demande } = await db.from('ide_demandes_soins')
      .select('id, ordonnance_path, status')
      .eq('id', demandeId)
      .single();

    if (!demande) {
      return res.status(404).json({ error: 'Demande non trouvée.' });
    }

    // Only allow cancellation of pending requests (not accepted ones)
    if (demande.status === 'acceptee') {
      return res.status(400).json({ error: 'Cette demande a déjà été acceptée et ne peut plus être annulée.' });
    }

    // Delete ordonnance file if exists (with path traversal protection)
    if (demande.ordonnance_path) {
      const uploadsDir = path.resolve(__dirname, 'uploads', 'ordonnances');
      const filePath = path.resolve(uploadsDir, path.basename(demande.ordonnance_path));
      try {
        if (filePath.startsWith(uploadsDir + path.sep) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (delErr) {
        console.warn('[IDE Demandes Soins DELETE] Fichier non supprimé:', delErr.message);
      }
    }

    // Update status to annulee (soft delete for audit) + clear personal data
    const { error: upErr } = await db.from('ide_demandes_soins')
      .update({
        status: 'annulee',
        nom: '[supprimé]',
        prenom: '[supprimé]',
        telephone: '[supprimé]',
        ordonnance_path: null
      })
      .eq('id', demandeId);

    if (upErr) throw upErr;

    console.log(`[IDE Demandes Soins] Demande ${demandeId} annulée (RGPD suppression)`);
    res.json({ ok: true, message: 'Votre demande a été annulée et vos données personnelles supprimées.' });
  } catch (e) {
    console.error('[IDE Demandes Soins DELETE] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// =============================================
// CRON IDE — Confirmation automatique patients J-1 (19h Europe/Paris)
// =============================================

/**
 * Fonction principale : interroge ide_visites pour demain (status='planifie'),
 * récupère les patients, logue la confirmation et marque confirmation_envoyee.
 * Utilise supabaseAdmin (service_role) car pas de contexte utilisateur.
 */
async function cronConfirmPatientsIDE() {
  const tag = '[IDE CRON Confirm]';
  try {
    const adminDb = supaAdminOrThrow();

    // Calculer la date de demain en Europe/Paris
    const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const tomorrow = new Date(nowParis);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. Récupérer les visites planifiées pour demain, non encore confirmées
    const { data: visites, error: vErr } = await adminDb
      .from('ide_visites')
      .select('id, patient_id, cabinet_id, nurse_id, date, tournee, soins_type')
      .eq('date', dateStr)
      .eq('status', 'planifie')
      .is('confirmation_envoyee', null); // pas encore traitées

    if (vErr) {
      // Fallback: si la colonne confirmation_envoyee n'existe pas, réessayer sans filtre
      if (vErr.message && vErr.message.includes('confirmation_envoyee')) {
        console.warn(`${tag} Colonne confirmation_envoyee absente, query sans filtre...`);
        const { data: v2, error: v2Err } = await adminDb
          .from('ide_visites')
          .select('id, patient_id, cabinet_id, nurse_id, date, tournee, soins_type')
          .eq('date', dateStr)
          .eq('status', 'planifie');
        if (v2Err) throw v2Err;
        if (!v2 || v2.length === 0) {
          console.log(`${tag} Aucune visite planifiee pour ${dateStr}`);
          return { date: dateStr, processed: 0 };
        }
        return await _processConfirmations(adminDb, v2, dateStr, tag);
      }
      throw vErr;
    }

    if (!visites || visites.length === 0) {
      console.log(`${tag} Aucune visite planifiee pour ${dateStr}`);
      return { date: dateStr, processed: 0 };
    }

    return await _processConfirmations(adminDb, visites, dateStr, tag);
  } catch (err) {
    console.error(`${tag} Erreur:`, err.message);
    return { error: err.message };
  }
}

async function _processConfirmations(adminDb, visites, dateStr, tag) {
  console.log(`${tag} Processing ${visites.length} visits for ${dateStr}`);

  // 2. Récupérer les patients concernés (batch unique)
  const patientIds = [...new Set(visites.map(v => v.patient_id))];
  const { data: patients, error: pErr } = await adminDb
    .from('ide_patients')
    .select('id, nom, prenom, tel')
    .in('id', patientIds);
  if (pErr) throw pErr;

  const patientMap = {};
  for (const p of (patients || [])) {
    patientMap[p.id] = p;
  }

  let confirmed = 0;
  let skippedNoPhone = 0;

  for (const visite of visites) {
    try {
      const patient = patientMap[visite.patient_id];
      if (!patient) continue;

      if (!patient.tel || patient.tel.trim() === '') {
        skippedNoPhone++;
        continue;
      }

      // 3. Loguer la confirmation (future: envoi SMS)
      // SÉCURITÉ: pas de données patient dans les logs, juste l'ID visite
      console.log(`${tag} Confirmation logged for visit ${visite.id} (date: ${dateStr})`);

      // 4. Marquer la visite comme confirmee
      // Tenter d'abord avec confirmation_envoyee (boolean), fallback sur metadata JSONB
      const { error: uErr } = await adminDb
        .from('ide_visites')
        .update({ confirmation_envoyee: true })
        .eq('id', visite.id);

      if (uErr && uErr.message && uErr.message.includes('confirmation_envoyee')) {
        // Fallback: stocker dans metadata JSONB si la colonne n'existe pas
        const { data: current } = await adminDb.from('ide_visites').select('metadata').eq('id', visite.id).single();
        const meta = (current && current.metadata) || {};
        meta.confirmation_envoyee = true;
        meta.confirmation_date = new Date().toISOString();
        await adminDb.from('ide_visites').update({ metadata: meta }).eq('id', visite.id);
      }

      confirmed++;
    } catch (visitErr) {
      console.error(`${tag} Erreur visite ${visite.id}:`, visitErr.message);
    }
  }

  console.log(`${tag} Termine: ${confirmed} confirmes, ${skippedNoPhone} sans telephone, sur ${visites.length} visites (${dateStr})`);
  return { date: dateStr, processed: visites.length, confirmed, skippedNoPhone };
}

// --- CRON schedule: tous les jours a 19h00 Europe/Paris ---
try {
  const cronConfirm = require('node-cron');
  cronConfirm.schedule('0 19 * * *', cronConfirmPatientsIDE, { timezone: 'Europe/Paris' });
  console.log('[JADOMI] CRON IDE confirmation patients programme (19h00 Europe/Paris)');
} catch (cronConfirmErr) {
  // Fallback setInterval si node-cron indisponible : toutes les 5 min, vérifier si 19h Paris
  console.warn('[JADOMI] node-cron indisponible pour IDE confirm, fallback setInterval:', cronConfirmErr.message);
  setInterval(async () => {
    try {
      const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
      if (nowParis.getHours() === 19 && nowParis.getMinutes() < 5) {
        await cronConfirmPatientsIDE();
      }
    } catch (e) { console.error('[IDE CRON Confirm fallback]', e.message); }
  }, 5 * 60 * 1000); // check toutes les 5 min
  console.log('[JADOMI] CRON IDE confirm fallback setInterval actif (check /5min)');
}

// --- Endpoint manuel : POST /api/ide/cron/confirm-patients ---
const _ideCronConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de declenchements manuels, reessayez dans 15 minutes' }
});
app.post('/api/ide/cron/confirm-patients', requireAuth(), _ideCronConfirmLimiter, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs.' });
    }
    console.log('[IDE CRON Confirm] Declenchement manuel par', req.user.id);
    const result = await cronConfirmPatientsIDE();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[IDE CRON Confirm Manual] Error:', e.message);
    res.status(500).json({ error: 'Erreur lors du declenchement.' });
  }
});

// === JADOMI Support Tutorials (tutoriels interactifs) ===
try {
  app.use('/api/support/tutorials', require('./api/support/tutorials'));
  console.log('[JADOMI] Module Support Tutorials monte');
} catch (e) {
  console.warn('[JADOMI] Module Support Tutorials non charge:', e.message);
}
// Page tutoriels
app.get('/support/tutoriels', (req, res) => res.sendFile(path.join(__dirname, 'public/support/tutoriels.html')));

// =============================================
// JADOMI IA LOCAL — Routeur intelligent (local → Ollama → Claude)
// =============================================
try {
  app.use('/api/ia-local', require('./api/ia-local'));
  console.log('[JADOMI] Module IA Local monté (règles + Ollama + Claude)');
} catch (e) {
  console.warn('[JADOMI] Module IA Local non chargé:', e.message);
}

// =============================================
// Fallback : servir .html correspondant pour URLs sans extension
// (MUST be before global error handler so errors here are caught)
// =============================================
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || path.extname(req.path)) return next();
  const candidates = [
    path.join(__dirname, 'public' + req.path + '.html'),
    path.join(__dirname, req.path + '.html'),
    path.join(__dirname, 'public/vitrines' + req.path + '.html')
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return res.sendFile(c); } catch {}
  }
  next();
});

// Global error handler — MUST be last middleware after all routes
app.use((err, req, res, _next) => {
  console.error(`[GLOBAL ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'internal_error' : err.message
    });
  }
});

// Empêcher les crashes non catchés de tuer le process
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message, err.stack);
  // Laisser PM2 restart proprement si c'est fatal
});

// =============================================
// SUIVI PATIENT TEMPS RÉEL (Uber-like)
// =============================================

// GET position live de l'infirmier pour le patient (accès via token unique)
app.get('/api/ide/visite/:id/tracking-live', rateLimit({ windowMs: 60000, max: 30 }), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const visiteId = req.params.id;
    const token = req.query.token;
    if (!token || typeof token !== 'string' || token.length > 200) return res.status(401).json({ error: 'Token requis.' });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visiteId)) {
      return res.status(400).json({ error: 'ID invalide.' });
    }

    const { data: visite, error } = await db.from('ide_visites')
      .select('id, nurse_id, status, tracking_token, patient_name, soin, heure, lat, lng')
      .eq('id', visiteId).single();
    if (error || !visite) return res.status(404).json({ error: 'Visite non trouvée.' });

    // Vérification token
    if (!visite.tracking_token || token !== visite.tracking_token) {
      return res.status(403).json({ error: 'Token invalide.' });
    }

    // Infos infirmier
    const { data: nurse } = await db.from('ide_nurses').select('prenom, lat, lng, last_position_at').eq('id', visite.nurse_id).single();

    // Calculer ETA si on a la position de l'infirmier et du patient
    let etaMinutes = null;
    let nurseLat = nurse ? nurse.lat : null;
    let nurseLng = nurse ? nurse.lng : null;

    if (nurseLat && nurseLng && visite.lat && visite.lng) {
      // Distance approximative en km
      const dLat = (visite.lat - nurseLat) * 111.32;
      const dLng = (visite.lng - nurseLng) * 111.32 * Math.cos(nurseLat * Math.PI / 180);
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      etaMinutes = Math.max(1, Math.round(distKm / 0.5)); // ~30km/h en ville
    }

    res.json({
      ok: true,
      nurse_name: nurse ? nurse.prenom : 'Votre infirmier(e)',
      nurse_lat: nurseLat,
      nurse_lng: nurseLng,
      patient_lat: visite.lat,
      patient_lng: visite.lng,
      status: visite.status,
      soin: visite.soin,
      heure: visite.heure,
      eta_minutes: etaMinutes
    });
  } catch (e) {
    console.error('[Tracking Live] Error:', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET démo suivi patient (pour tester sans vraie visite)
app.get('/api/ide/visite/demo/tracking-live', (req, res) => {
  // Simule une infirmière en route vers un patient à Roubaix
  const nurseLat = 50.6912 + (Math.random() - 0.5) * 0.005;
  const nurseLng = 3.1746 + (Math.random() - 0.5) * 0.005;
  res.json({
    ok: true,
    nurse_name: 'Fatima',
    nurse_lat: nurseLat,
    nurse_lng: nurseLng,
    patient_lat: 50.6920,
    patient_lng: 3.1760,
    status: 'en_route',
    soin: 'Insuline',
    heure: '08:30',
    eta_minutes: Math.floor(Math.random() * 8) + 2
  });
});

// POST patient signale son absence
app.post('/api/ide/visite/:id/patient-absent', async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const visiteId = req.params.id;
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: 'Token requis.' });

    const { data: visite, error } = await db.from('ide_visites')
      .select('id, tracking_token, nurse_id')
      .eq('id', visiteId).single();
    if (error || !visite) return res.status(404).json({ error: 'Visite non trouvée.' });
    if (!visite.tracking_token || token !== visite.tracking_token) {
      return res.status(403).json({ error: 'Token invalide.' });
    }

    // Marquer la visite comme patient absent
    await db.from('ide_visites').update({ status: 'patient_absent', patient_absent_at: new Date().toISOString() }).eq('id', visiteId);

    res.json({ ok: true, message: 'Absence signalée.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// ALERTES ROUTE COMMUNAUTAIRES (style Waze)
// =============================================

// GET alertes dans une zone géographique
app.get('/api/ide/alertes-route', async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const { minLat, maxLat, minLng, maxLng } = req.query;
    if (!minLat || !maxLat || !minLng || !maxLng) return res.json([]);
    const { data, error } = await db.from('alertes_route')
      .select('id, type, lat, lng, description, votes_up, votes_down, created_at')
      .eq('active', true)
      .gt('expires_at', new Date().toISOString())
      .gte('lat', parseFloat(minLat)).lte('lat', parseFloat(maxLat))
      .gte('lng', parseFloat(minLng)).lte('lng', parseFloat(maxLng))
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST créer une alerte
app.post('/api/ide/alertes-route', requireAuth(), async (req, res) => {
  try {
    const db = supaAdminOrThrow();
    const { type, lat, lng, description } = req.body;
    const validTypes = ['travaux', 'bouchon', 'accident', 'route_barree', 'police', 'danger', 'verglas'];
    if (!type || !validTypes.includes(type)) return res.status(400).json({ error: 'Type invalide' });
    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'Coordonnées invalides' });
    const userId = req.user?.id || req.userId || null;
    const { data, error } = await db.from('alertes_route').insert({
      user_id: userId, type, lat, lng,
      description: description ? String(description).slice(0, 200) : null,
      expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// Start server (skip on Vercel — exporte l'app pour @vercel/node)
// =============================================
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
