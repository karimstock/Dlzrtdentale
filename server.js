require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

const app = express();

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
  'https://jadomi.be', 'https://www.jadomi.be'
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

// === Security: Rate limiting ===
const rateLimit = require('express-rate-limit');

// Global API : 300 requetes / 15 min / IP (bypass assets statiques et health)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes, reessayez dans 15 minutes' },
  skip: (req) => req.path === '/api/health'
});
app.use('/api/', globalLimiter);

// Strict login : 5 tentatives / 15 min / IP
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, reessayez dans 15 minutes' }
}));

// Strict register : 3 creations / heure / IP
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de creations de compte, reessayez dans 1 heure' }
}));

// Modere forgot-password : 5 / 15 min / IP
app.use('/api/auth/forgot-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes, reessayez dans 15 minutes' }
}));

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

// Middleware : strip .html extension et rediriger vers URL propre
app.use((req, res, next) => {
  if (req.path.endsWith('.html') && !req.path.startsWith('/public/') && !req.path.startsWith('/api/')) {
    const cleanPath = req.path.replace(/\.html$/, '');
    return res.redirect(301, cleanPath);
  }
  next();
});

// app.use(express.json()) deplace plus bas pour permettre raw body sur webhook stripe
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/landing.html')));
app.get('/m', (req, res) => res.sendFile(path.join(__dirname, 'mobile.html')));
app.get('/tarifs', (req, res) => res.sendFile(path.join(__dirname, 'public/tarifs.html')));
app.get('/demo', (req, res) => res.sendFile(path.join(__dirname, 'public/demo.html')));
// Landings metier dedies (Passe 27 + 5-group hierarchy)
app.get('/avocats', (req, res) => res.sendFile(path.join(__dirname, 'public/avocats.html')));
app.get('/btp', (req, res) => res.sendFile(path.join(__dirname, 'public/btp.html')));
app.get('/sci', (req, res) => res.sendFile(path.join(__dirname, 'public/sci.html')));
app.get('/createurs', (req, res) => res.sendFile(path.join(__dirname, 'public/createurs.html')));
app.get('/chirurgiens-dentistes', (req, res) => res.sendFile(path.join(__dirname, 'public/chirurgiens-dentistes.html')));
app.get('/orthodontistes', (req, res) => res.sendFile(path.join(__dirname, 'public/orthodontistes.html')));
app.get('/prothesistes-dentaires', (req, res) => res.sendFile(path.join(__dirname, 'public/prothesistes-dentaires.html')));
app.get('/professions-paramedicales', (req, res) => res.sendFile(path.join(__dirname, 'public/professions-paramedicales.html')));
app.get('/services-bien-etre', (req, res) => res.sendFile(path.join(__dirname, 'public/services-bien-etre.html')));
// 301 redirects for old URLs
app.get('/dentistes', (req, res) => res.redirect(301, '/chirurgiens-dentistes'));
app.get('/prothesistes', (req, res) => res.redirect(301, '/prothesistes-dentaires'));
app.get('/coiffeurs', (req, res) => res.redirect(301, '/services-bien-etre'));
// Servir /assets depuis /public/assets (pour les images landings)
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use(express.static(path.join(__dirname)));

// --- Anthropic Claude client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Supabase client ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Supabase admin (service_role) : bypass RLS, usage server-only, JAMAIS expose au client ---
// Utilise uniquement pour les tables secretes (ex: yahoo_oauth_tokens).
let supabaseAdmin = null;
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  console.log('[JADOMI] Supabase admin (service_role) initialise');
} else {
  console.warn('[JADOMI] SUPABASE_SERVICE_ROLE_KEY absent — yahoo_oauth_tokens indisponible');
}
function supaAdminOrThrow() {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY non configure sur le serveur');
  return supabaseAdmin;
}

// === JADOMI Admin module (raw webhook + admin routes + cron) ===
// Monte AVANT express.json() pour que /api/stripe/webhook recoive le body brut
try {
  const mountAdmin = require('./api/admin');
  mountAdmin(app, supabase, anthropic);
  console.log('[JADOMI] Module Admin monte');
} catch (e) {
  console.warn('[JADOMI] Module Admin non charge:', e.message);
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
  console.warn('[JADOMI] Module multi-sociétés non charge:', e.message);
}

// === JADOMI Module Professions Juridiques ===
try {
  require('./api/juridique/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module juridique non charge:', e.message);
}

// === JADOMI Module Artisan BTP ===
try {
  require('./api/btp/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module BTP non charge:', e.message);
}

// === JADOMI Module Network (Annuaire + Parrainage + Deals) ===
try {
  require('./api/network/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module Network non charge:', e.message);
}

// === JADOMI Module Services & Marketplace ===
try {
  require('./api/services/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module services non charge:', e.message);
}

// === JADOMI Module Showroom Créateurs ===
try {
  require('./api/showroom/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module showroom non charge:', e.message);
}

// === JADOMI Network (Annuaire + Parrainage + Deals) ===
try {
  require('./api/network/index')(app);
} catch (e) {
  console.warn('[JADOMI] Module network non charge:', e.message);
}

// === JADOMI GPO Smart Queue Auction ===
try {
  require('./api/gpo')(app);
  require('./lib/gpo-scheduler'); // lance le scheduler de timeouts
} catch (e) {
  console.warn('[JADOMI] Module GPO non charge:', e.message);
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
  console.warn('[JADOMI] Module Logistique non charge:', e.message);
}

// === JADOMI Groupage Regional (Groupon dentaire) ===
try {
  require('./api/groupage')(app);
} catch (e) {
  console.warn('[JADOMI] Module Groupage non charge:', e.message);
}

// === JADOMI Mon site internet (Vitrines) ===
try {
  require('./api/vitrines')(app);
} catch (e) {
  console.warn('[JADOMI] Module vitrines non charge:', e.message);
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

// === JADOMI Coach (onboarding personnalise + tooltips) ===
try {
  app.use('/api/coach', require('./api/coach'));
  console.log('[JADOMI] Module Coach monte');
} catch (e) {
  console.warn('[JADOMI] Module Coach non charge:', e.message);
}

// === JADOMI Timeline (suivi visuel chronologique patient) ===
try {
  app.use('/api/timeline', require('./api/timeline'));
  console.log('[JADOMI] Module Timeline monte');
} catch (e) {
  console.warn('[JADOMI] Module Timeline non charge:', e.message);
}

// === JADOMI Client Portal (espace client securise) ===
try {
  app.use('/api/client-portal', require('./api/client-portal'));
  console.log('[JADOMI] Module Client Portal monte');
} catch (e) {
  console.warn('[JADOMI] Module Client Portal non charge:', e.message);
}

// === JADOMI Appointments (prise de RDV en ligne) ===
try {
  app.use('/api/appointments', require('./api/appointments'));
  console.log('[JADOMI] Module Appointments monte');
} catch (e) {
  console.warn('[JADOMI] Module Appointments non charge:', e.message);
}

// === JADOMI Admin Email (inbox IMAP + campagnes mailing) ===
try {
  const { mountAdminEmail } = require('./api/admin-email');
  mountAdminEmail(app, supabase);
} catch (e) {
  console.warn('[JADOMI] Module Admin Email non charge:', e.message);
}

// === JADOMI Email service (OVH Pro) ===
let emailService = null;
try {
  emailService = require('./api/emailService');
  console.log('[JADOMI] Module emailService charge');
} catch (e) {
  console.warn('[JADOMI] emailService non charge:', e.message);
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
      return res.json({ success: false, error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[/api/auth/forgot-password]', err.message);
    res.status(500).json({ success: false, error: err.message });
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
    res.status(500).json({ ok: false, error: err.message });
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
    res.status(err.status || 500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// GET /api/eco/check — Find eco-matching opportunities
// =============================================
app.get('/api/eco/check', requireAuth(), async (req, res) => {
  try {
    const { produit, cabinet } = req.query;
    if (!produit) return res.status(400).json({ error: 'produit is required' });

    // Find cabinets that have excess stock of this product (qty > seuil * 3)
    let query = supabase
      .from('produits')
      .select('*')
      .ilike('nom', `%${produit}%`)
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
        message: 'Stripe non configure — mode simulation',
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
    res.status(500).json({ error: err.message });
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
      messages: [{ role: 'user', content: `Genere un contrat d'abonnement HTML professionnel pour JADOMI.

CLIENT: ${nom} · ${email} · Cabinet: ${cabinet_nom || 'Non renseigne'}
CONTRAT: ${numContrat} · Date: ${dateStr}
PLAN: ${plan} · ${periodicite || 'mensuel'} · ${prix_mensuel || 29}€/mois (annuel: ${prixAnnuel}€/an -15%)

Inclure: identite client, plan choisi + prix, fonctionnalites incluses (IA JADOMI, vocal, scan, factures, SOS, marche, Green, Predict), conditions d'utilisation, politique de resiliation (mensuel: resiliable a tout moment sans frais; annuel: engagement 12 mois non remboursable), duree et renouvellement automatique, signature JADOMI pre-apposee.

Design: fond blanc, accent vert #10b981, logo "JADOMI" en haut, tableau fonctionnalites, zone signature client en bas.
Retourne UNIQUEMENT le HTML complet. Pas de markdown.` }]
    });

    const contenuHtml = response.content?.[0]?.text || '<p>Erreur generation contrat</p>';

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
    res.status(500).json({ error: err.message });
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
      messages: [{ role: 'user', content: `Genere un contrat de resiliation HTML professionnel pour JADOMI.

CLIENT: ${nom || 'Client'} · ${email || ''} · Cabinet: ${cabinet_nom || 'Non renseigne'}
RESILIATION: ${numResiliation} · Date demande: ${dateStr}
PLAN RESILIE: ${plan || 'solo'} · ${prix_mensuel || 29}€/mois
DATE FIN EFFECTIVE: ${dateFinStr}
MOTIF: ${motif || 'Non precise'}

Inclure: identite client, cabinet concerne uniquement, date effective de fin, conditions financieres (abonnement actif jusqu'a fin de periode, aucun remboursement pour periode en cours), numero contrat original, numero de resiliation.

Design: fond blanc, accent rouge #f05050 pour titre, logo "JADOMI" en haut, zone signature client en bas.
Retourne UNIQUEMENT le HTML complet.` }]
    });

    const contenuHtml = response.content?.[0]?.text || '<p>Erreur</p>';

    // Save document
    try {
      await supabase.from('documents').insert([{
        user_id: user_id || null,
        type: 'resiliation',
        nom: 'Resiliation ' + (cabinet_nom || plan) + ' - ' + numResiliation,
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
    res.status(500).json({ error: err.message });
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
      return res.send(`<!DOCTYPE html><html><head><title>JADOMI</title></head><body style="background:#0f0e0d;color:#f0ede8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#f05050;">Lien invalide ou expire</h1><p style="color:#6b6760;">Ce lien de signature n'est plus valide.</p><a href="/" style="color:#10b981;">Retour a JADOMI</a></div></body></html>`);
    }

    if (doc.signe) {
      return res.send(`<!DOCTYPE html><html><head><title>JADOMI — Document signe</title></head><body style="background:#0f0e0d;color:#f0ede8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#60d090;">✅ Document deja signe</h1><p style="color:#6b6760;">Ce document a ete signe le ${doc.date_signature ? new Date(doc.date_signature).toLocaleDateString('fr-FR') : ''}.</p><a href="/" style="color:#10b981;">Retour a JADOMI</a></div></body></html>`);
    }

    // Render signature page
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>JADOMI — Signature electronique</title>
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
    <div style="font-size:13px;color:#6b6760;">Signature electronique securisee</div>
  </div>
  <div class="doc-wrap" id="doc-content">${doc.contenu_html || ''}</div>
  <div class="sign-section">
    <div class="sign-title">Signature electronique</div>
    <div class="field">
      <label>Nom complet (tel que sur le contrat)</label>
      <input type="text" id="sign-name" placeholder="Dr Jean Martin">
    </div>
    <label class="checkbox">
      <input type="checkbox" id="sign-accept">
      Je confirme avoir lu et j'accepte les conditions de ce document.
    </label>
    <button class="btn-sign" id="btn-sign" onclick="signerDocument()" disabled>Signer electroniquement</button>
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
      status.textContent='✅ Document signe avec succes !';
      btn.textContent='✅ Signe';
      btn.style.background='#60d090';
    } else {
      throw new Error(data.error||'Erreur');
    }
  }catch(e){
    status.style.color='#f05050';status.textContent='Erreur: '+e.message;
    btn.disabled=false;btn.textContent='Signer electroniquement';
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
4-6 = interessant a etudier
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
      emailBody = `Bonjour ${prenomClient},\n\nMerci pour votre suggestion : "${titre}"\n\nNous l'avons etudiee avec attention. Elle est pour l'instant trop complexe a integrer dans notre roadmap.\n\n${analyse.conseil_alternatif ? 'Nous vous recommandons plutot : ' + analyse.conseil_alternatif + '\n\n' : ''}N'hesitez pas a nous soumettre d'autres idees !\n\nL'equipe JADOMI — contact@jadomi.fr`;
    } else if (score <= 7) {
      emailSubject = 'Votre suggestion est a l\'etude ! 🧠';
      emailBody = `Bonjour ${prenomClient},\n\nExcellente suggestion !\n"${titre}"\n\nElle est officiellement en phase d'etude. Si nous l'implementons, vous serez le premier informe et recevrez 1 mois gratuit en remerciement ! 🎁\n\nMerci de contribuer a ameliorer JADOMI.\n\nL'equipe JADOMI`;
    } else {
      emailSubject = '🔥 Votre idee est exceptionnelle !';
      emailBody = `Bonjour ${prenomClient},\n\nWOW ! Merci pour cette idee incroyable :\n"${titre}"\n\nNous avons immediatement transmis votre suggestion a notre equipe technique. Elle est si pertinente que nous travaillons dessus en priorite !\n\nVous serez beta-testeur en avant-premiere.\nVotre prochain mois est offert ! 🎁\n\nDr Karim BAHMED — Fondateur JADOMI\ncontact@jadomi.fr`;
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// JADOMI Rush — module sous-traitance prothesistes
// =============================================
try {
  const { createRushRouter } = require('./api/rush');
  app.use('/api/rush', createRushRouter(supabase));
  // Servir les STL uploadés
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  console.log('[JADOMI] Module Rush prothesistes monte sur /api/rush');
} catch (e) {
  console.warn('[JADOMI] Module Rush non charge:', e.message);
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
      console.log('[RUSH R2] Nettoyage quotidien fichiers expires...');
      try {
        const result = await nettoyerFichiersExpires();
        console.log('[RUSH R2] Nettoyage termine:', result.deleted, 'fichiers supprimes');
      } catch (e) {
        console.error('[RUSH R2] Erreur nettoyage:', e.message);
      }
    });
    console.log('[JADOMI] CRON nettoyage R2 programme (03h00 quotidien)');
  } catch (cronErr) {
    console.warn('[JADOMI] CRON R2 non configure:', cronErr.message);
  }
  console.log('[JADOMI] Module Rush ENRICHI monte (devis, fichiers, paiement, messages, scoring, transport)');
} catch (e) {
  console.warn('[JADOMI] Module Rush enrichi non charge:', e.message);
}

// =============================================
// JADOMI Plateforme — Routes prothesistes & commandes
// =============================================
try {
  const { createProthesistesRouter } = require('./api/routes/prothesistes');
  app.use('/api/prothesistes', createProthesistesRouter(supabase));
  console.log('[JADOMI] Module Prothesistes monte sur /api/prothesistes');
} catch (e) {
  console.warn('[JADOMI] Module Prothesistes non charge:', e.message);
}

try {
  const { createCommandesRouter } = require('./api/routes/commandes');
  app.use('/api/commandes', createCommandesRouter(supabase));
  console.log('[JADOMI] Module Commandes monte sur /api/commandes');
} catch (e) {
  console.warn('[JADOMI] Module Commandes non charge:', e.message);
}

// =============================================
// JADOMI LABO — Module gestion laboratoire prothesiste
// =============================================
try {
  const { createLaboRouter } = require('./routes/labo');
  app.use('/api/labo', createLaboRouter());
  console.log('[JADOMI] Module LABO monte sur /api/labo');
} catch (e) {
  console.warn('[JADOMI] Module LABO non charge:', e.message);
}

// =============================================
// Module Communication Cabinet (confreres + patients)
// =============================================
try {
  const mountCommunication = require('./api/multiSocietes/communication');
  mountCommunication(app);
} catch (e) {
  console.warn('[JADOMI] Module Communication non charge:', e.message);
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
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code requis' });

  // 1. Lookup interne JADOMI
  try {
    const { data } = await supabase
      .from('produits')
      .select('nom, categorie, marque, fournisseur, code_barre')
      .eq('code_barre', code)
      .single();
    if (data) {
      return res.json({
        source: 'jadomi',
        nom: data.nom,
        categorie: data.categorie,
        marque: data.marque,
        fournisseur: data.fournisseur
      });
    }
  } catch (e) { /* table absente ou no row -> fallback */ }

  // 2. Fallback OpenFoodFacts
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
    const d = await r.json();
    if (d && d.status === 1 && d.product) {
      const p = d.product;
      const cat = (p.categories_tags && p.categories_tags[0]) ? p.categories_tags[0].replace(/^en:/, '') : 'Produit';
      return res.json({
        source: 'openfoodfacts',
        nom: p.product_name_fr || p.product_name || null,
        marque: p.brands || null,
        categorie: cat,
        image: p.image_url || null
      });
    }
  } catch (e) { /* network ou parse -> unknown */ }

  // 3. Fallback JADOMI IA (Claude Haiku via api.anthropic.com)
  //    Identifie les produits dentaires/médicaux/vétérinaires à partir du GTIN.
  //    Coût : ~$0.001 par appel. Rate-limité à 30/min/IP par scanLookupLimiter.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          system: "Tu es expert en produits dentaires, médicaux et vétérinaires. Tu identifies les produits à partir de leur code-barres GTIN/EAN. Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication, sans texte avant ou après.",
          messages: [{
            role: 'user',
            content: 'Code-barres GTIN/EAN: ' + code + '. Identifie ce produit s\'il fait partie du domaine sante (dentaire, medical, veterinaire). Format JSON strict obligatoire: {"nom":"nom exact","marque":"marque fabricant","categorie":"categorie precise","fournisseur":null,"confidence":0.0}. La confidence est entre 0 et 1. Si tu ne reconnais pas ce code, mets confidence a 0 et tous les champs textuels a null.'
          }]
        })
      });
      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const txt = (aiData && aiData.content && aiData.content[0] && aiData.content[0].text) || '';
        const cleaned = txt.replace(/```json|```/g, '').trim();
        let json = null;
        try { json = JSON.parse(cleaned); } catch (_) { /* parse fail -> unknown */ }
        if (json && typeof json.confidence === 'number' && json.confidence >= 0.4 && json.nom) {
          return res.json({
            source: 'jadomi-ia',
            nom: json.nom,
            marque: json.marque || null,
            categorie: json.categorie || 'Autre',
            fournisseur: json.fournisseur || null,
            confidence: json.confidence
          });
        }
      }
    } catch (e) { /* IA fail -> unknown */ }
  }

  // 4. Inconnu
  res.json({ source: 'unknown', code_barre: code, nom: null });
});


// =============================================
// COMPTABILITE — Analyse document (facture, charge, note de frais...)
// =============================================
const Imap = require('imap');
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
- Photo personnelle, selfie, capture d'ecran hors contexte pro
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

JSON uniquement :
{
  "type_document": "facture_dentaire",
  "sous_type": "consommables",
  "ajouter_au_stock": false,
  "selectionne": true,
  "deductible_tva": true,
  "fournisseur_ou_etablissement": "Nom exact",
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
      "unite": "boite",
      "prix_unitaire_ht": 0.00,
      "prix_unitaire_ttc": 0.00,
      "taux_tva": 20,
      "remise_pct": 0.00,
      "prix_total_ttc": 0.00
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
      message: `Document deja importe le ${new Date(existing.created_at).toLocaleDateString('fr-FR')}`
    });

    res.json({ ...data, hash });
  } catch (e) {
    console.error('analyser-document error:', e.message);
    res.status(500).json({ error: e.message });
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
        let match = null;

        // Chercher par reference
        if (p.reference) {
          const { data: refMatch } = await supabase.from('produits')
            .select('*').eq('reference', p.reference)
            .eq('owner_id', userId).maybeSingle();
          match = refMatch;
        }

        // Sinon chercher par nom (mots-cles)
        if (!match) {
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
        } else {
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

    res.json({ success: true });
  } catch (e) {
    console.error('valider-document error:', e.message);
    res.status(500).json({ error: e.message });
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

app.get('/api/mail/attachment/:token', requireAuth(), (req, res) => {
  try {
    const entry = scanAttachments.get(req.params.token);
    if (!entry) return res.status(404).json({ error: 'Piece jointe introuvable ou expiree' });
    if (entry.userId && entry.userId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
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
    res.status(500).json({ error: e.message });
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
    if (!res.headersSent) res.status(500).json({ error: e.message });
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

function scanInboxForDocs(imap, periode, mois, annee, provider, userId) {
  return new Promise((resolve, reject) => {
    const documents = [];
    let claudeCalls = 0;
    let limiteNotifiee = false;
    let settled = false;
    const settle = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const SCAN_TIMEOUT_MS = 10 * 60 * 1000;
    const timer = setTimeout(() => {
      console.error('IMAP scan timeout for', provider);
      try { imap.end(); } catch(e) {}
      sendProgress(userId, { status:'error', error:'Timeout 10min' });
      settle(() => reject(new Error('Timeout: le scan a pris plus de 10 minutes. Essayez une periode plus courte.')));
    }, SCAN_TIMEOUT_MS);

    sendProgress(userId, { status:'connecting', total:0, done:0, found:0, current:'Connexion IMAP...' });

    imap.once('ready', () => {
      sendProgress(userId, { status:'searching', total:0, done:0, found:0, current:'Recherche des mails...' });
      imap.openBox('INBOX', true, (err) => {
        if (err) { try { imap.end(); } catch(e) {} sendProgress(userId, { status:'error', error: err.message }); return settle(() => reject(err)); }
        let sinceDate;
        if (periode === 'mensuel' && mois && annee) sinceDate = new Date(parseInt(annee), parseInt(mois) - 1, 1);
        else if (periode === 'annuel' && annee) sinceDate = new Date(parseInt(annee), 0, 1);
        else if (periode === 'tout') sinceDate = new Date(2024, 0, 1);
        else sinceDate = new Date(2026, 0, 1);

        console.log('IMAP scan SINCE', sinceDate, 'for', provider);
        imap.search([['SINCE', sinceDate]], (err, uids) => {
          if (err) { try { imap.end(); } catch(e) {} sendProgress(userId, { status:'error', error: err.message }); return settle(() => reject(err)); }
          if (!uids || !uids.length) { try { imap.end(); } catch(e) {} sendProgress(userId, { status:'done', total:0, done:0, found:0, current:'Aucun mail' }); return settle(() => resolve(documents)); }
          uids.sort((a, b) => b - a); // Plus recents en premier
          const toProcess = uids;
          console.log('[IMAP]', toProcess.length, 'mails a scanner pour', provider);
          sendProgress(userId, { status:'scanning', total: toProcess.length, done:0, found:0, current:'Demarrage...' });
          let done = 0;
          const parsePromises = [];
          const f = imap.fetch(toProcess, { bodies: '', struct: true });
          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              const p = simpleParser(stream, { skipTextToHtml: true, skipImageLinks: true }).then(async (parsed) => {
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
                    try { imap.end(); } catch(e) {}
                  }
                  return;
                }
                if (!vautLaPeineAnalyser(parsed)) {
                  console.log('[SKIP]', subj, '— pas une facture potentielle');
                  return;
                }
                // Pre-store du 1er PDF du mail pour le partager avec un eventuel body-scan
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
                // Scan du corps: uniquement si sujet match (filtre dur pour limiter Claude)
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
              }).catch((e) => { done++; console.error('IMAP parse error:', e.message); });
              parsePromises.push(p);
            });
          });
          f.once('error', (err) => { try { imap.end(); } catch(e) {} sendProgress(userId, { status:'error', error: err.message }); settle(() => reject(err)); });
          f.once('end', () => {
            Promise.all(parsePromises).finally(() => {
              try { imap.end(); } catch(e) {}
              sendProgress(userId, { status:'done', total: toProcess.length, done: toProcess.length, found: documents.length, current:'Termine' });
              settle(() => resolve(documents));
            });
          });
        });
      });
    });
    imap.once('error', (err) => {
      console.error('IMAP connection error [' + provider + ']:', err.message, err.code || '');
      sendProgress(userId, { status:'error', error: err.message });
      settle(() => reject(err));
    });
    imap.connect();
  });
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
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mail/scan-yahoo', requireAuth(), async (req, res) => {
  const { periode, mois, annee } = req.body || {};
  const userId = req.user.id;
  try {
    const row = await getYahooAccessToken(userId);
    if (!row.email) return res.status(400).json({ error: 'Email Yahoo inconnu — reconnectez-vous.' });

    const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
    const authString = `user=${row.email}\x01auth=Bearer ${row.access_token}\x01\x01`;
    const xoauth2Token = Buffer.from(authString).toString('base64');
    console.log('[YAHOO-OAUTH] email=', row.email, 'expired=', expired, 'expires_at=', row.expires_at);
    console.log('[YAHOO-OAUTH] XOAUTH2 base64 length:', xoauth2Token.length);

    const imap = new Imap({
      user: row.email,
      xoauth2: xoauth2Token,
      host: 'imap.mail.yahoo.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false, servername: 'imap.mail.yahoo.com', minVersion: 'TLSv1.2' },
      connTimeout: 30000,
      authTimeout: 20000,
      keepalive: true,
    });
    res.setTimeout(10 * 60 * 1000);
    const documents = await scanInboxForDocs(imap, periode, mois, annee, 'Yahoo-OAuth', userId);
    console.log('Yahoo-OAuth scan complete:', documents.length, 'docs for', row.email);
    res.json({ documents, total: documents.length, email: row.email });
  } catch (e) {
    console.error('scan-yahoo error:', e.message);
    if (!res.headersSent) {
      const hint = /invalid credentials|authenticate/i.test(e.message)
        ? ' (scope OAuth insuffisant : Yahoo exige mail-r pour IMAP. Re-autoriser avec scope=mail-r une fois l\'app verifiee par Yahoo.)'
        : '';
      res.status(400).json({ error: e.message + hint });
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
    const imap = new Imap({ user: email, password, host: config.host, port: config.port, tls: true, tlsOptions: { rejectUnauthorized: false, servername: config.host, minVersion: config.minTLS || undefined }, connTimeout: 30000, authTimeout: 20000, keepalive: true });

    await new Promise((resolve, reject) => {
      imap.once('ready', () => { imap.end(); resolve(); });
      imap.once('error', (err) => { console.error('IMAP error [' + provider + ']:', err.message, err.code || ''); reject(err); });
      console.log('IMAP connecting to', config.host, 'for', provider, '...');
      imap.connect();
    });
    res.json({ success: true });
  } catch (e) {
    console.error('IMAP test error [' + provider + ']:', e.message, e.source || '');
    if (!res.headersSent) {
      res.status(400).json({ error: `Connexion impossible : ${e.message}`, provider: provider, code: e.code || null });
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

    const imap = new Imap({ user: email, password, host: config.host, port: config.port, tls: true, tlsOptions: { rejectUnauthorized: false, servername: config.host, minVersion: config.minTLS || undefined }, connTimeout: 30000, authTimeout: 20000, keepalive: true });

    res.setTimeout(10 * 60 * 1000);
    const documents = [];
    let claudeCalls = 0;
    let limiteNotifiee = false;

    await new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };

      // Timeout global 10 min — renvoie JSON, pas HTML
      const timer = setTimeout(() => {
        console.error('IMAP scan timeout for', provider, email);
        try { imap.end(); } catch(e) {}
        sendProgress(userId, { status:'error', error:'Timeout 10min' });
        settle(() => reject(new Error('Timeout: le scan a pris plus de 10 minutes. Essayez une periode plus courte.')));
      }, 10 * 60 * 1000);

      sendProgress(userId, { status:'connecting', total:0, done:0, found:0, current:'Connexion IMAP...' });

      imap.once('ready', () => {
        sendProgress(userId, { status:'searching', total:0, done:0, found:0, current:'Recherche des mails...' });
        imap.openBox('INBOX', true, (err) => {
          if (err) { try { imap.end(); } catch(e) {} sendProgress(userId,{status:'error',error:err.message}); return settle(() => reject(err)); }

          let sinceDate;
          if (periode === 'mensuel' && mois && annee) {
            sinceDate = new Date(parseInt(annee), parseInt(mois) - 1, 1);
          } else if (periode === 'annuel' && annee) {
            sinceDate = new Date(parseInt(annee), 0, 1);
          } else if (periode === 'tout') {
            sinceDate = new Date(2024, 0, 1);
          } else {
            sinceDate = new Date(2026, 0, 1);
          }

          console.log('IMAP scan search SINCE', sinceDate, 'for', provider);

          imap.search([['SINCE', sinceDate]], (err, uids) => {
            if (err) { try { imap.end(); } catch(e) {} return settle(() => reject(err)); }
            if (!uids || !uids.length) {
              console.log('IMAP scan: 0 mails found for', provider);
              try { imap.end(); } catch(e) {}
              return settle(() => resolve());
            }

            uids.sort((a, b) => b - a); // Plus recents en premier
            const toProcess = uids;
            console.log('[IMAP]', toProcess.length, 'mails a scanner pour', provider);
            sendProgress(userId, { status:'scanning', total: toProcess.length, done:0, found:0, current:'Demarrage...' });
            let scanDone = 0;
            const parsePromises = [];

            const f = imap.fetch(toProcess, { bodies: '', struct: true });

            f.on('message', (msg) => {
              msg.on('body', (stream) => {
                const p = simpleParser(stream, { skipTextToHtml: true, skipImageLinks: true }).then(async (parsed) => {
                  const subj = (parsed.subject || '').slice(0, 80) || 'Mail sans sujet';
                  sendProgress(userId, { status:'scanning', total: toProcess.length, done: scanDone, found: documents.length, current: subj });
                  const atts = parsed.attachments || [];
                  const fromTxt = (parsed.from && parsed.from.text) || '';
                  const dateStr = parsed.date ? new Date(parsed.date).toISOString().slice(0,10) : '-';
                  console.log('[IMAP mail]', dateStr, '|', fromTxt, '|', subj, '|', atts.length, 'PJ');
                  if (claudeCalls >= MAX_CLAUDE_CALLS_PER_SCAN) {
                    if (!limiteNotifiee) {
                      console.log('[CLAUDE] Limite', MAX_CLAUDE_CALLS_PER_SCAN, 'appels atteinte — scan arrete');
                      sendProgress(userId, { status:'done', total: toProcess.length, done: toProcess.length, found: documents.length, current: 'Limite 100 atteinte' });
                      limiteNotifiee = true;
                      try { imap.end(); } catch(e) {}
                    }
                    return;
                  }
                  if (!vautLaPeineAnalyser(parsed)) {
                    console.log('[SKIP]', subj, '— pas une facture potentielle');
                    return;
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
                        sendProgress(userId, { status:'scanning', total: toProcess.length, done: scanDone, found: documents.length, current: 'Limite Claude atteinte (scan partiel)' });
                        limiteNotifiee = true;
                      }
                      break;
                    }
                    try {
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
                          status:'scanning', total: toProcess.length, done: scanDone, found: documents.length, current: subj,
                          newDocument: {
                            fournisseur: analyse.fournisseur_ou_etablissement,
                            total_ttc: analyse.total_ttc,
                            type_document: analyse.type_document,
                            date: analyse.date,
                            filename: att.filename,
                            attachmentToken: attToken,
                            subject: parsed.subject || '',
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
                          status:'scanning', total: toProcess.length, done: scanDone, found: documents.length, current: subj,
                          newDocument: {
                            fournisseur: analyse.fournisseur_ou_etablissement,
                            total_ttc: analyse.total_ttc,
                            type_document: analyse.type_document,
                            date: analyse.date,
                            filename: mailPdfFilename || '(corps du mail)',
                            attachmentToken: bodyToken,
                            subject: parsed.subject || '',
                            selectionne: analyse.selectionne !== false,
                          }
                        });
                      }
                    } catch(e) { console.error('IMAP body scan error:', e.message); }
                  }
                  scanDone++;
                  sendProgress(userId, { status:'scanning', total: toProcess.length, done: scanDone, found: documents.length, current: subj });
                }).catch((e) => { scanDone++; console.error('IMAP scan parse error:', e.message); });
                parsePromises.push(p);
              });
            });

            f.once('error', (err) => {
              console.error('IMAP fetch error:', err.message);
              try { imap.end(); } catch(e) {}
              settle(() => reject(err));
            });

            f.once('end', () => {
              console.log('IMAP fetch done, waiting for', parsePromises.length, 'parse jobs...');
              Promise.all(parsePromises).finally(() => {
                console.log('IMAP scan complete:', documents.length, 'documents found');
                try { imap.end(); } catch(e) {}
                sendProgress(userId, { status:'done', total: toProcess.length, done: toProcess.length, found: documents.length, current:'Termine' });
                settle(() => resolve());
              });
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error('IMAP connection error [' + (provider||'?') + ']:', err.message, err.code || '');
        sendProgress(userId, { status:'error', error: err.message });
        settle(() => reject(err));
      });
      console.log('IMAP scan connecting to', config.host, 'for', provider, '...');
      imap.connect();
    });

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
      res.status(400).json({ error: e.message, provider: provider });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// TVA CONFIG + COMPTA RECAP/EDIT/EXPORT
// =============================================
app.get('/api/tva/config/:userId', requireAuth(), async (req, res) => {
  try {
    // Ignore param URL — on se fie uniquement au JWT
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
    const { data, error } = await supabaseAdmin
      .from('user_tva_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || { statut_tva: 'franchise', seuil_franchise: 37500, ca_annuel_estime: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tva/config', requireAuth(), async (req, res) => {
  try {
    const { statut_tva, profession, ca_annuel_estime, seuil_franchise, numero_tva } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
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
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compta/recap/:userId', requireAuth(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { annee } = req.query;
    const anneeVal = annee || new Date().getFullYear();
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });

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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compta/document/:id/pdf', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/compta/document/:id/paiement', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { mode_paiement } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .update({ mode_paiement })
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/compta/document/:id/mois', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { mois } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .update({ mois_manuel: mois })
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/compta/document/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { tags, commentaire } = req.body || {};
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .update({ tags, commentaire })
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/compta/document/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
    const { error } = await supabaseAdmin
      .from('documents_compta')
      .delete()
      .eq('id', id).eq('user_id', userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compta/export/:userId', requireAuth(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { annee } = req.query;
    const anneeVal = annee || new Date().getFullYear();
    if (!supabaseAdmin) return res.status(500).json({ error: 'supabaseAdmin non configure' });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
