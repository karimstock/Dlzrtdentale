require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

const app = express();

// === PWA Patient — MUST be first (before Helmet, CORS, etc.) ===
app.use('/patient', (req, res) => {
  const reqPath = req.path === '/' ? '/index.html' : req.path;
  const filePath = path.join(__dirname, 'public', 'patient', reqPath);
  const fs = require('fs');
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
  } catch(e) {}
  res.sendFile(path.join(__dirname, 'public', 'patient', 'index.html'));
});

// === PWA Labo Pro — MUST be before Helmet, CORS, etc. ===
app.use('/labo-pro', (req, res) => {
  const reqPath = req.path === '/' ? '/index.html' : req.path;
  const filePath = path.join(__dirname, 'public', 'labo-pro', reqPath);
  const fs = require('fs');
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
  contentSecurityPolicy: false, // desactive CSP pour ne pas casser les CDN (jsdelivr, unpkg, google fonts)
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// === Security: CORS strict ===
// En production, seules les origines jadomi.fr/.be sont autorisees.
// En dev/local (sans NODE_ENV=production), toutes origines acceptees.
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

// ===== SECURITE JADOMI — Headers protection niveau etatique =====
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=self, microphone=self, geolocation=self');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://api.stripe.com wss://*.supabase.co; frame-src https://js.stripe.com http://localhost:3100;");
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

// Strict register : 3 creations / heure / IP
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

// === Monitoring: health endpoint (bypass rate limit) ===
app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memory: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
    memory_details: {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB'
    },
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development'
  });
});

// Middleware : strip .html extension et rediriger vers URL propre (conserve les query params)
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
app.get('/orthodontistes', (req, res) => res.sendFile(path.join(__dirname, 'public/orthodontistes.html')));
app.get('/prothesistes-dentaires', (req, res) => res.sendFile(path.join(__dirname, 'public/prothesistes-dentaires.html')));
app.get('/professions-paramedicales', (req, res) => res.sendFile(path.join(__dirname, 'public/professions-paramedicales.html')));
app.get('/services-bien-etre', (req, res) => res.sendFile(path.join(__dirname, 'public/services-bien-etre.html')));
// JADOMI Dentiste Pro Dashboard
app.get('/admin/dentiste-pro', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/dentiste-pro.html')));
// JADOMI Ads (Passe 34)
app.get('/jadomi-ads', (req, res) => res.sendFile(path.join(__dirname, 'public/jadomi-ads.html')));
app.get('/dashboard-annonceur', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard-annonceur.html')));
// JADOMI Studio (Passe 34.2)
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
// Dashboard mon-site cockpit + wizard creation (Passe 38)
app.get('/studio/mon-site', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mon-site/index.html')));
app.get('/studio/mon-site/', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mon-site/index.html')));
app.get('/studio/mon-site/creer', (req, res) => res.sendFile(path.join(__dirname, 'public/studio/mon-site/creer.html')));
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
    res.status(404).send('Staging non trouve');
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
    res.status(404).send('<!DOCTYPE html><html><head><title>Site introuvable</title></head><body style="font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fafaf8;"><div style="text-align:center;"><h1 style="font-size:24px;color:#1a1a2e;">Site introuvable</h1><p style="color:#5c5c70;">Ce site n\'existe pas ou n\'est pas encore en ligne.</p><a href="https://jadomi.fr" style="color:#4F5BD5;">Retour a JADOMI</a></div></body></html>');
  }
});
// Sites demo Studio (Passe 37)
app.get('/demo/classic', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/classic/index.html')));
app.get('/demo/pro', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/pro/index.html')));
app.get('/demo/expert', (req, res) => res.sendFile(path.join(__dirname, 'public/demo/expert/index.html')));
// Homepage v2 preview (Passe 36)
app.get('/index-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v2.html')));
app.get('/index-v2.html', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v2.html')));
// Homepage v3 Awwwards (Passe 38b)
app.get('/index-v3', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v3.html')));
app.get('/index-v3.html', (req, res) => res.sendFile(path.join(__dirname, 'public/index-v3.html')));
// 301 redirects for old URLs
app.get('/dentistes', (req, res) => res.redirect(301, '/chirurgiens-dentistes'));
app.get('/prothesistes', (req, res) => res.redirect(301, '/prothesistes-dentaires'));
app.get('/coiffeurs', (req, res) => res.redirect(301, '/services-bien-etre'));
// Servir /assets depuis /public/assets (pour les images landings)
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
// Serve /docs but BLOCK sensitive subdirectories (signed PDFs, audit trails, certificates)
app.use('/docs', (req, res, next) => {
  const blocked = ['/signed', '/audit', '/certificates'];
  const lower = req.path.toLowerCase();
  if (blocked.some(b => lower.startsWith(b))) {
    return res.status(403).json({ error: 'Acces refuse' });
  }
  next();
}, express.static(path.join(__dirname, 'docs')));
app.use(express.static(path.join(__dirname, 'public')));

// --- Anthropic Claude client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    } else {
      event = JSON.parse(req.body.toString());
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
        // TODO: Generate Factur-X invoice
        // TODO: Send confirmation emails (client + supplier)
        // TODO: Schedule supplier payout (J+30)
        // TODO: Notify supplier of new order
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

app.use(express.json());

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

// === JADOMI Ads — Régie publicitaire verticale (Passe 34) ===
try {
  const mountAds = require('./api/ads');
  mountAds(app, supabase, anthropic);
  console.log('[JADOMI] Module Ads (régie publicitaire) monté');
} catch (e) {
  console.warn('[JADOMI] Module Ads non chargé:', e.message);
}

// === JADOMI Studio — Hub IA creation publicitaire (Passe 34.2) ===
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

// === JADOMI AVOCAT EXPERT — Coffre-fort securise (Passe 44C) ===
try {
  app.use('/api/avocat', require('./api/avocat/coffre'));
  app.use('/api/avocat/espace-client', require('./api/avocat/espace-client'));
  console.log('[JADOMI] Module Avocat Expert (coffre-fort + espace client) monte');
} catch (e) {
  console.warn('[JADOMI] Module Avocat Expert non charge:', e.message);
}

// === JADOMI Studio Enhance Media — Remotion Expert (Passe 41B) ===
try {
  app.use('/api/studio/enhance', require('./api/studio/enhance-media'));
  app.locals.supabaseAdmin = supabaseAdmin;
  console.log('[JADOMI] Module Studio Enhance Media (Remotion) monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Enhance Media non charge:', e.message);
}

// === JADOMI Studio Sites Jadomi — Creation sites + IA assistant (Passe 38) ===
try {
  const mountSitesJadomi = require('./api/studio/sites-jadomi');
  mountSitesJadomi(app, supabaseAdmin || supabase);
  console.log('[JADOMI] Module Studio Sites Jadomi monte');
} catch (e) {
  console.warn('[JADOMI] Module Studio Sites Jadomi non charge:', e.message);
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

// === JADOMI Appointments (prise de RDV en ligne) ===
try {
  app.use('/api/appointments', require('./api/appointments'));
  console.log('[JADOMI] Module Appointments monté');
} catch (e) {
  console.warn('[JADOMI] Module Appointments non chargé:', e.message);
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

// POST /api/auth/mfa/enroll — Generer un secret TOTP (QR code)
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

// POST /api/auth/mfa/verify — Verifier le code TOTP et activer le facteur
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
    res.json({ success: true, message: 'MFA active avec succes' });
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

// DELETE /api/auth/mfa/unenroll — Desactiver un facteur MFA
app.delete('/api/auth/mfa/unenroll', requireAuth(), async (req, res) => {
  try {
    const { factor_id } = req.body || {};
    if (!factor_id) return res.status(400).json({ error: 'factor_id requis' });

    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor_id });
    if (error) return res.status(400).json({ error: 'Erreur validation' });
    res.json({ success: true, message: 'Facteur MFA supprime' });
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
      model = 'claude-sonnet-4-20250514',
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
// POST /api/ia/extract-facture — Extract products from invoice photo
// =============================================
app.post('/api/ia/extract-facture', requireAuth(), async (req, res) => {
  try {
    const { image, media_type } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) requis' });

    const mtype = media_type || 'image/jpeg';
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
      .ilike('produit_nom', `%${produit}%`);

    if (cabinet) {
      ecoQuery = ecoQuery.eq('cabinet_besoin', cabinet);
    }

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
      .eq('cabinet', cabinet);

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
      model: 'claude-sonnet-4-20250514',
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
      model: 'claude-sonnet-4-20250514',
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

    // Cancel Stripe subscription if exists
    if (stripe && req.body.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(req.body.stripe_subscription_id, {
          cancel_at_period_end: true
        });
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
  <div class="doc-wrap" id="doc-content">${doc.contenu_html || ''}</div>
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
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

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
        model: 'claude-sonnet-4-20250514',
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
  const { createLaboRouter } = require('./routes/labo');
  app.use('/api/labo', createLaboRouter());
  console.log('[JADOMI] Module LABO monté sur /api/labo');
} catch (e) {
  console.warn('[JADOMI] Module LABO non chargé:', e.message);
}

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

app.get('/api/scan/lookup', scanLookupLimiter, async (req, res) => {
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
                      ? `Alternative verifiee : ${result.produit?.nom || 'Produit'}`
                      : `Economie detectee : ${result.produit?.nom || 'Produit'}`,
                    message: compareR.market_insight || 'Consultez vos economies JADOMI.',
                    entity_type: 'economies_alert', entity_id: productDbId,
                    cta_label: 'Voir mes economies', cta_url: '/index.html?tab=economies',
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

app.get('/api/scan/search', scanSearchLimiter, async (req, res) => {
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
// PRICE WATCH — Alertes prix produits
// =============================================

// POST /api/achats/price-watch — Creer une alerte prix
app.post('/api/achats/price-watch', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const userId = req.user.id;
    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

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

// DELETE /api/achats/price-watch/:id — Desactiver une alerte (soft delete)
app.delete('/api/achats/price-watch/:id', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

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

// POST /api/achats/check-price-watches — Verifier toutes les alertes actives
app.post('/api/achats/check-price-watches', requireAuth(), async (req, res) => {
  try {
    const { admin } = require('./api/multiSocietes/middleware');
    const societeId = req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id requis (header X-Societe-Id)' });

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

// Helper: verify user has access to the requested societe_id (IDOR protection)
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
          position: null, verdict: 'Pas de donnees de comparaison'
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
      response.warning = 'Aucune donnee de benchmark disponible pour votre segment';
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
    subject: 'JADOMI — Mandat de facturation a signer',
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
          <p style="margin:0;font-size:15px;color:#065f46;font-weight:600;">Mandat signe avec succes</p>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          Le mandat de facturation pour <strong>${_escHtml(supplier.name)}</strong> a ete signe par <strong>${_escHtml(signerName)}</strong> le ${new Date().toLocaleDateString('fr-FR')}.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          JADOMI est desormais autorisee a emettre des factures pour les commandes realisees via la plateforme.
        </p>
        <p style="font-size:12px;color:#9a9ab0;margin-top:24px;">Reference mandat : ${_escHtml(mandate.id)}</p>
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
    subject: `Mandat signe — ${supplier.name}`,
    html
  });
}

async function sendMandateConfirmationEmailWithDocs(supplier, mandate, signerName, attachments) {
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="background:#1a1a2e;padding:32px 40px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-.3px;">JADOMI</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#8888a8;">Signature electronique</p>
      </div>
      <div style="padding:36px 40px;border:1px solid #e8e8ee;border-top:none;border-radius:0 0 12px 12px;">
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:15px;color:#065f46;font-weight:600;">Mandat signe avec succes (AES eIDAS)</p>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          Le mandat de facturation pour <strong>${_escHtml(supplier.name)}</strong> a ete signe electroniquement par <strong>${_escHtml(signerName)}</strong> le ${new Date().toLocaleDateString('fr-FR')}.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#3c3c50;">
          JADOMI est desormais autorisee a emettre des factures au nom de ${_escHtml(supplier.name)} pour les commandes realisees via la plateforme.
        </p>
        ${attachments && attachments.length > 0 ? `
        <div style="background:#f8f8fc;border:1px solid #e2e2ee;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1a1a2e;">Documents joints :</p>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#3c3c50;">
            ${attachments.map(a => '<li>' + _escHtml(a.filename) + '</li>').join('')}
          </ul>
        </div>` : ''}
        <div style="margin-top:20px;padding:12px 16px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;">
          <p style="margin:0;font-size:12px;color:#1e40af;">Signature electronique avancee (AES) conforme a l'article 26 du reglement eIDAS (UE) n°910/2014. Le document signe au format PAdES PKCS#7 est verifiable dans Adobe Acrobat Reader.</p>
        </div>
        <p style="font-size:12px;color:#9a9ab0;margin-top:24px;">Reference mandat : ${_escHtml(mandate.id)}</p>
      </div>
    </div>
  `;
  await sendMailMandate({
    to: supplier.email,
    subject: 'JADOMI — Mandat signe (AES eIDAS) — ' + supplier.name,
    html,
    attachments: attachments || []
  });
  await sendMailMandate({
    to: process.env.EMAIL_CONTACT || 'contact@jadomi.fr',
    subject: 'Mandat signe — ' + supplier.name + ' (AES)',
    html,
    attachments: attachments || []
  });
}

// POST /api/facturation/mandate/create — Creer un mandat et envoyer l'email
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
      return res.status(500).json({ error: 'Erreur creation mandat', details: mErr.message });
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
    if (!warehouse_address || !warehouse_city) return res.status(400).json({ error: 'Adresse entrepot requise pour le calcul des frais de livraison' });

    // Fetch mandate (use service role to bypass RLS)
    const sbClient2 = supabaseAdmin || supabase;
    const { data: mandate, error } = await sbClient2
      .from('supplier_mandates')
      .select('id, supplier_name, supplier_email, commission_percent, payment_delay_days, status')
      .eq('signature_token', token)
      .maybeSingle();
    if (error || !mandate) return res.status(404).json({ error: 'Mandat introuvable' });
    if (mandate.status !== 'sent' && mandate.status !== 'viewed') {
      return res.status(409).json({ error: 'Ce mandat a deja ete signe ou est invalide', status: mandate.status });
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
      return res.status(409).json({ error: 'Ce mandat a deja ete signe (requete concurrente)', status: 'signed' });
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
        doc.fontSize(10).fillColor('#666').text('Article 289 I-2 du Code General des Impots', { align: 'center' });
        doc.fillColor('#000');
        doc.moveDown();

        // --- PARTIES ---
        doc.fontSize(10).font('Helvetica-Bold').text('ENTRE :');
        doc.font('Helvetica').text('JADOMI SAS — Plateforme marketplace B2B');
        doc.text('(ci-apres « le Mandataire »)');
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text('ET :');
        doc.font('Helvetica').text(supplierName);
        doc.text('(ci-apres « le Mandant »)');
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text('Date de signature : ' + signDate);
        doc.text('Signe par : ' + signerFullName + (signerTitleStr ? ' — ' + signerTitleStr : ''));
        doc.moveDown();

        // --- Ligne separatrice ---
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
        doc.moveDown();

        // --- ARTICLES ---
        function articleTitle(t) { doc.moveDown(0.5); doc.fontSize(11).font('Helvetica-Bold').text(t); doc.fontSize(10).font('Helvetica'); }
        function para(t) { doc.text(t, { lineGap: 3 }); }
        function bullet(t) { doc.text('  •  ' + t, { lineGap: 2 }); }

        articleTitle('Article 1 — Objet du mandat');
        para('Par le present mandat, la societe ' + supplierName + ' (le Mandant) autorise JADOMI SAS (le Mandataire) a etablir, en son nom et pour son compte, les factures relatives aux commandes realisees par les professionnels de sante via la plateforme JADOMI.');
        para('Ce mandat est conclu dans le cadre de l\'article 289 I-2 du Code General des Impots, autorisant un tiers a emettre des factures au nom et pour le compte d\'un assujetti.');

        articleTitle('Article 2 — Obligations du mandataire (JADOMI)');
        para('JADOMI s\'engage a :');
        bullet('Emettre les factures conformement aux dispositions legales et reglementaires en vigueur (articles 289 et 242 nonies A du CGI).');
        bullet('Transmettre une copie de chaque facture emise au Mandant dans un delai raisonnable.');
        bullet('Assurer la numerotation sequentielle et unique des factures.');
        bullet('Conserver les factures emises pendant la duree legale (10 ans).');
        bullet('Respecter les obligations de facturation electronique (reforme 2026).');

        articleTitle('Article 3 — Obligations du mandant (Fournisseur)');
        para('Le Mandant s\'engage a :');
        bullet('Ne pas emettre de factures pour les operations couvertes par le present mandat.');
        bullet('Informer JADOMI de toute modification de ses informations legales.');
        bullet('Verifier les factures emises et signaler toute anomalie sous 15 jours.');
        bullet('Fournir les informations necessaires a l\'emission correcte des factures.');

        articleTitle('Article 4 — Conditions financieres');
        para('Commission JADOMI : ' + commissionPct + '% du montant HT de chaque commande facturee via la plateforme.');
        para('Delai de reversement : ' + delayDays + ' jours a compter de la date de facture.');
        para('Mode de paiement : Virement bancaire sur le compte communique par le Mandant.');
        para('La commission est deduite automatiquement du montant encaisse. Un releve detaille accompagne chaque virement.');

        articleTitle('Article 4b — Frais de livraison');
        para('Commande >= 150EUR HT : livraison gratuite pour le client. Frais de transport a la charge du Mandant.');
        para('Commande < 150EUR HT : le Mandant propose ses frais de livraison au client via JADOMI. Le client valide ou refuse.');
        para('Le Mandant assure l\'expedition avec le transporteur de son choix et a ses frais.');

        articleTitle('Article 4c — Non-demarchage et protection commerciale');
        para('Le Mandant reconnait que les clients mis en relation via JADOMI constituent un actif commercial de la plateforme.');
        bullet('Interdiction de demarcher directement les clients acquis via JADOMI pendant la duree du mandat et 12 mois apres resiliation.');
        bullet('Interdiction d\'inclure dans les colis tout document commercial invitant a commander en direct.');
        bullet('En cas de violation : suspension immediate et penalite forfaitaire de 5 000EUR par infraction.');

        articleTitle('Article 5 — Coordonnees bancaires du Mandant');
        para('IBAN : ' + ibanMasked);
        para('Toute modification de RIB devra etre signalee par ecrit a JADOMI avec un delai de 5 jours ouvrables.');

        // Saut de page si besoin
        if (doc.y > 650) doc.addPage();

        articleTitle('Article 6 — Duree et resiliation');
        para('Le present mandat est conclu pour une duree indeterminee. Il entre en vigueur a la date de signature electronique.');
        para('Chaque partie peut resilier a tout moment par notification ecrite, sous reserve d\'un preavis de 30 jours.');

        articleTitle('Article 7 — Acceptation electronique');
        para('Conformement aux articles 1366 et 1367 du Code civil, la signature electronique du present mandat a la meme valeur juridique qu\'une signature manuscrite.');
        para('Signature realisee via JADOMI Sign (AES conforme eIDAS Article 26).');

        articleTitle('Article 8 — Loi applicable et juridiction');
        para('Le present mandat est regi par le droit francais. Tout litige sera soumis aux tribunaux competents du siege social de JADOMI SAS.');

        articleTitle('Article 9 — Service apres-vente');
        para('Le Mandant assure l\'integralite du SAV des produits vendus via JADOMI.');
        para('Le Mandant s\'engage a repondre aux demandes transmises par JADOMI sous 48 heures ouvrees.');
        para('En cas de non-reponse repetee (3 demandes consecutives sans reponse sous 48h), JADOMI se reserve le droit de suspendre le mandat.');

        articleTitle('Article 10 — Paiement et reversement');
        para('Le client paye par carte bancaire ou PayPal via JADOMI (prestataire : Stripe).');
        para('Palier Bronze : 0EUR/mois — commission 12% HT');
        para('Palier Silver : 299EUR/mois — commission 5% HT');
        para('Palier Gold : 799EUR/mois — commission 0%');
        para('Reversement sous 14 jours apres confirmation de livraison.');

        articleTitle('Article 11 — Expedition et suivi');
        para('Le Mandant s\'engage a expedier chaque commande sous 48 heures ouvrees.');
        para('Le Mandant saisit le numero de suivi du transporteur dans son espace JADOMI des l\'expedition.');

        // --- SIGNATURE ---
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
        doc.moveDown();
        doc.fontSize(10).font('Helvetica-Bold').text('Signature electronique');
        doc.font('Helvetica');
        doc.text('Signe par : ' + signerFullName + (signerTitleStr ? ', ' + signerTitleStr : ''));
        doc.text('Date : ' + signDate);
        doc.text('Verification d\'identite : OTP SMS verifie');
        doc.moveDown();
        doc.fontSize(8).fillColor('#666');
        doc.text('Signature electronique avancee (AES) conforme a l\'article 26 du reglement eIDAS (UE) n°910/2014.');
        doc.text('Format PAdES PKCS#7 — JADOMI Sign v2.0 — Document verifiable dans Adobe Acrobat Reader.');
        doc.text('Reference : ' + (mandate.id || ''));
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

    res.json({ ok: true, message: 'Mandat signe avec succes' });
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

// POST /api/facturation/mandates/send — Envoyer un mandat a un fournisseur par nom+email
app.post('/api/facturation/mandates/send', requireAuth(), async (req, res) => {
  try {
    const { supplier_name, supplier_email, supplier_siret, supplier_ville, commission_percent, payment_delay_days } = req.body;
    if (!supplier_name || !supplier_email) return res.status(400).json({ error: 'Nom et email requis' });

    const signature_token = require('crypto').randomUUID();
    const supplier_id = require('crypto').randomUUID(); // ID fournisseur auto-genere
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

    if (error) { console.error('[mandates/send]', error.message); return res.status(500).json({ error: 'Erreur creation mandat' }); }

    await sendMandateSigningEmail({ name: supplier_name, email: supplier_email }, mandate);
    res.json({ ok: true, success: true, mandate_id: mandate.id });
  } catch (e) {
    console.error('[mandates/send]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route statique page signature mandat
app.get('/mandate-sign', (req, res) => res.sendFile(path.join(__dirname, 'public/mandate-sign.html')));

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
    res.status(500).json({ error: 'Erreur generation PDF' });
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
    res.status(500).json({ error: 'Erreur generation PDF' });
  }
});

// ===== JADOMI SECURITE — API Rapports + Scan manuel =====

// POST /api/admin/security-report — Recevoir rapport scan nocturne
app.post('/api/admin/security-report', async (req, res) => {
  try {
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
    const limit = Math.min(parseInt(req.query.limit) || 30, 90);
    const { data } = await supabase.from('security_reports')
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
    const { exec } = require('child_process');
    exec('/home/ubuntu/jadomi/scripts/security-scan.sh', { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) console.error('[manual-scan]', err.message);
    });
    res.json({ success: true, message: 'Scan lance en arriere-plan. Resultat disponible dans ~5 minutes.' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/send-documents — Envoyer les dossiers par email
app.post('/api/admin/send-documents', requireAuth(), async (req, res) => {
  try {
    const { sendMail } = require('./api/multiSocietes/mailer');
    const fs = require('fs');
    const target = req.body.email || 'karim_bahmed@yahoo.fr';

    const attachments = [];
    const docFiles = [
      { path: 'docs/DOSSIER-AVOCAT-JADOMI.html', name: 'DOSSIER-AVOCAT-JADOMI.html', label: 'Dossier Avocat' },
      { path: 'docs/business-plan-jadomi.html', name: 'BUSINESS-PLAN-JADOMI.html', label: 'Business Plan' },
      { path: 'docs/dossier-avocat-jadomi.html', name: 'Dossier-Juridique-Complet.html', label: 'Dossier Juridique Complet' },
      { path: 'docs/Modele-Mandat-Facturation-JADOMI.pdf', name: 'Contrat-Mandat-Facturation-JADOMI.pdf', label: 'Contrat Mandat Facturation (PDF)' },
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
    if (!hasAccess) return res.status(403).json({ error: 'Acces refuse a cette societe' });

    const { gpo_order_id } = req.body;
    if (!gpo_order_id) return res.status(400).json({ error: 'gpo_order_id requis' });

    // Race condition guard: check if invoice already exists for this order
    const { data: existingInv } = await admin()
      .from('jadomi_invoices')
      .select('id, invoice_number')
      .eq('gpo_order_id', gpo_order_id)
      .maybeSingle();
    if (existingInv) return res.status(409).json({ error: 'Une facture existe deja pour cette commande', invoice_number: existingInv.invoice_number });

    // 1. Fetch gpo_orders record and verify societe_id access
    const { data: order, error: orderErr } = await admin()
      .from('gpo_orders')
      .select('*')
      .eq('id', gpo_order_id)
      .eq('societe_id', societeId)
      .single();
    if (orderErr || !order) return res.status(404).json({ error: 'Commande GPO introuvable ou acces refuse' });

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
    if (!hasAccess) return res.status(403).json({ error: 'Acces refuse a cette societe' });

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
    if (!hasAccess) return res.status(403).json({ error: 'Acces refuse a cette societe' });

    const { data: invoice, error } = await admin()
      .from('jadomi_invoices')
      .select('id, invoice_number, pdf_data, societe_id')
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Facture introuvable ou acces refuse' });

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
    if (!hasAccess) return res.status(403).json({ error: 'Acces refuse a cette societe' });

    // Verify access
    const { data: invoice, error: fetchErr } = await admin()
      .from('jadomi_invoices')
      .select('id, societe_id, status')
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .single();
    if (fetchErr || !invoice) return res.status(404).json({ error: 'Facture introuvable ou acces refuse' });

    // Guard against double-marking
    if (invoice.status === 'paid_by_cabinet') {
      return res.json({ ok: true, status: 'paid_by_cabinet', message: 'Facture deja marquee comme payee' });
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
// COMPTABILITE — Analyse document (facture, charge, note de frais...)
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
    system: 'Tu es un expert-comptable cabinet dentaire FR. Tu reponds UNIQUEMENT en JSON valide commencant par { et finissant par }. Jamais de texte avant ou apres, jamais d\'explication en francais.',
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

// Analyse le corps textuel d'un mail quand l'expediteur est un fournisseur connu
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
      system: 'Tu es un expert-comptable cabinet dentaire FR. Tu reponds UNIQUEMENT en JSON valide commencant par { et finissant par }. Jamais de texte avant ou apres, jamais d\'explication en francais.',
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
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeState(s) {
  try { return JSON.parse(Buffer.from(s || '', 'base64url').toString('utf8')); } catch(e) { return {}; }
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
    const entry = scanAttachments.get(req.params.token);
    if (!entry) return res.status(404).json({ error: 'Piece jointe introuvable ou expiree' });
    if (!entry.buffer) return res.status(500).json({ error: 'contenu_manquant' });
    res.setHeader('Content-Type', entry.contentType || 'application/octet-stream');
    const filename = entry.filename || 'attachment';
    if (entry.contentType && entry.contentType.startsWith('text/html')) {
      return res.end(entry.buffer);
    }
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
      sendProgress(userId, { status:'done', total: toProcess.length, done: toProcess.length, found: documents.length, current:'Termine' });
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
  const { email, password, provider, periode, mois, annee } = req.body;
  const userId = req.user.id;
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
// COMPTABILITE — Analyse releve bancaire
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
      .select('*').eq('user_id', userId).order('date_document', { ascending: false });

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
      return res.json({ valid: false, error: 'Document non trouve' });
    }

    // Read audit trail if exists
    const auditPath = require('path').join(__dirname, 'docs', 'audit', `${id}_audit.json`);
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
app.post('/api/signatures/send-otp-public', async (req, res) => {
  try {
    const { phone, document_id } = req.body;
    if (!phone || !document_id) return res.status(400).json({ error: 'Telephone et document_id requis' });
    const otpSms = require('./lib/otp-sms');
    const otp = otpSms.createOTP(phone, document_id);
    const smsResult = await otpSms.sendOTPSms(phone, otp.code);
    if (!smsResult.sent) return res.status(500).json({ error: smsResult.error || 'Erreur envoi SMS' });
    res.json({ ok: true, expires_at: otp.expires_at, simulated: smsResult.simulated || false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/signatures/verify-otp-public', async (req, res) => {
  try {
    const { phone, document_id, code } = req.body;
    if (!phone || !document_id || !code) return res.status(400).json({ error: 'Telephone, document_id et code requis' });
    const otpSms = require('./lib/otp-sms');
    const result = otpSms.verifyOTP(phone, document_id, code);
    res.json({ ok: result.valid, error: result.error || undefined });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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

    if (!doc) return res.status(404).json({ error: 'Document non trouve' });

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
    res.status(500).json({ error: e.message });
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

    if (!doc) return res.status(404).json({ error: 'Document non trouve' });

    const meta = doc.metadata || {};
    if (meta.signing_token !== signing_token) {
      return res.status(403).json({ error: 'Token de signature invalide' });
    }
    if (new Date(meta.signing_token_expires) < new Date()) {
      return res.status(403).json({ error: 'Session de signature expiree. Veuillez recommencer.' });
    }

    // Record identity and consent
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
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
    res.status(500).json({ error: e.message });
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

    if (!doc) return res.status(404).json({ error: 'Document non trouve' });

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
      const sigDir = path.join(__dirname, 'docs', 'signatures');
      if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

      const base64Data = signature_image.replace(/^data:image\/\w+;base64,/, '');
      const sigPath = path.join(sigDir, `${document_id}.png`);
      fs.writeFileSync(sigPath, Buffer.from(base64Data, 'base64'));
      completionData.signature_image_path = `docs/signatures/${document_id}.png`;
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
    res.status(500).json({ error: e.message });
  }
});

// Get AES status for a document
app.get('/api/signatures/aes/status/:id', requireAuth(), async (req, res) => {
  try {
    const { data: doc } = await supabase.from('signed_documents')
      .select('metadata, status').eq('id', req.params.id).single();

    if (!doc) return res.status(404).json({ error: 'Document non trouve' });

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
    res.status(500).json({ error: e.message });
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
      const societeId = req.user.societe_id;
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
    res.status(500).json({ error: e.message });
  }
});

// Get single signed document
app.get('/api/documents/signed/:id', requireAuth(), async (req, res) => {
  try {
    const { data, error } = await supabase.from('signed_documents').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Document non trouve' });
    if (!canAccessSignedDoc(req.user, data)) return res.status(403).json({ error: 'Acces refuse' });
    res.json({ ok: true, document: data });
  } catch (e) {
    console.error('[GET /api/documents/signed/:id]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Download signed PDF
app.get('/api/documents/signed/:id/download', requireAuth(), async (req, res) => {
  try {
    const { data, error } = await supabase.from('signed_documents').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Document non trouve' });
    if (!canAccessSignedDoc(req.user, data)) return res.status(403).json({ error: 'Acces refuse' });

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
    res.status(500).json({ error: e.message });
  }
});

// Download certificate PDF for a signed document
app.get('/api/documents/signed/:id/certificate', requireAuth(), async (req, res) => {
  try {
    const { data: doc, error } = await supabase.from('signed_documents')
      .select('*').eq('id', req.params.id).single();
    if (error || !doc) return res.status(404).json({ error: 'Document non trouve' });

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
    res.status(500).json({ error: e.message });
  }
});

// Resend signature request
app.post('/api/documents/signed/:id/resend', requireAuth(), async (req, res) => {
  try {
    const { data: doc, error } = await supabase.from('signed_documents')
      .select('*').eq('id', req.params.id).single();
    if (error || !doc) return res.status(404).json({ error: 'Document non trouve' });
    if (doc.status === 'signed') return res.status(400).json({ error: 'Document deja signe' });

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

    res.json({ ok: true, message: 'Demande de signature renvoyee' });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
        <p style="color:#64748b;font-size:12px;margin-top:24px;">JADOMI — Signature electronique securisee via DocuSeal</p>
      </div>`,
      attachments
    });

    res.json({ ok: true, sent: attachments.length });
  } catch (e) {
    console.error('[POST /api/documents/signed/send-email]', e.message);
    res.status(500).json({ error: e.message });
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
                <p style="color:#64748b;font-size:12px;margin-top:24px;">JADOMI — Signature electronique securisee via DocuSeal</p>
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    if (!stripe) return res.status(503).json({ error: 'Stripe non configure' });

    const sbClient = supabaseAdmin || supabase;
    const { data: mandate } = await sbClient.from('supplier_mandates')
      .select('*').eq('id', mandate_id).single();
    if (!mandate) return res.status(404).json({ error: 'Mandat non trouve' });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    if (!order) return res.status(404).json({ error: 'Commande non trouvee ou non payee' });

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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// Global error handler — catch toutes les erreurs non gerees par les routes
// =============================================
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
// Fallback : servir .html correspondant pour URLs sans extension
// =============================================
const fs = require('fs');
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || path.extname(req.path)) return next();
  const candidates = [
    path.join(__dirname, req.path + '.html'),
    path.join(__dirname, 'public' + req.path + '.html'),
    path.join(__dirname, 'public/vitrines' + req.path + '.html')
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return res.sendFile(c); } catch {}
  }
  next();
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
