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

// Global API : 100 requetes / 15 min / IP (bypass assets statiques et health)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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

// app.use(express.json()) deplace plus bas pour permettre raw body sur webhook stripe
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'landing.html')));
app.get('/m', (req, res) => res.sendFile(path.join(__dirname, 'mobile.html')));
app.use(express.static(path.join(__dirname)));

// --- Anthropic Claude client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Supabase client ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === JADOMI Admin module (raw webhook + admin routes + cron) ===
// Monte AVANT express.json() pour que /api/stripe/webhook recoive le body brut
try {
  const mountAdmin = require('./api/admin');
  mountAdmin(app, supabase, anthropic);
  console.log('[JADOMI] Module Admin monte');
} catch (e) {
  console.warn('[JADOMI] Module Admin non charge:', e.message);
}

app.use(express.json());

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
// POST /api/claude — Proxy to Anthropic Claude
// =============================================
app.post('/api/claude', async (req, res) => {
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
// GET /api/eco/check — Find eco-matching opportunities
// =============================================
app.get('/api/eco/check', async (req, res) => {
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
app.post('/api/eco/proposer', async (req, res) => {
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
app.get('/api/predict/commande', async (req, res) => {
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
app.post('/api/stripe/subscribe', async (req, res) => {
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
app.post('/api/contrats/generer', async (req, res) => {
  try {
    const { user_id, nom, email, cabinet_nom, plan, periodicite, prix_mensuel } = req.body;
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

Design: fond blanc, accent vert #c8f060, logo "JADOMI" en haut, tableau fonctionnalites, zone signature client en bas.
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
app.post('/api/contrats/resilier', async (req, res) => {
  try {
    const { contrat_id, motif, user_id, nom, email, cabinet_nom, plan, prix_mensuel } = req.body;

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
      return res.send(`<!DOCTYPE html><html><head><title>JADOMI</title></head><body style="background:#0f0e0d;color:#f0ede8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#f05050;">Lien invalide ou expire</h1><p style="color:#6b6760;">Ce lien de signature n'est plus valide.</p><a href="/" style="color:#c8f060;">Retour a JADOMI</a></div></body></html>`);
    }

    if (doc.signe) {
      return res.send(`<!DOCTYPE html><html><head><title>JADOMI — Document signe</title></head><body style="background:#0f0e0d;color:#f0ede8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#60d090;">✅ Document deja signe</h1><p style="color:#6b6760;">Ce document a ete signe le ${doc.date_signature ? new Date(doc.date_signature).toLocaleDateString('fr-FR') : ''}.</p><a href="/" style="color:#c8f060;">Retour a JADOMI</a></div></body></html>`);
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
.logo{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#c8f060;margin-bottom:8px;}
.doc-wrap{background:#fff;color:#111;border-radius:12px;padding:32px;margin-bottom:24px;max-height:60vh;overflow-y:auto;}
.sign-section{background:#1a1917;border:1px solid #2e2c29;border-radius:14px;padding:24px;}
.sign-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#c8f060;margin-bottom:16px;}
.field{margin-bottom:14px;}
.field label{display:block;font-size:12px;color:#6b6760;margin-bottom:6px;font-weight:600;}
.field input{width:100%;padding:12px;background:#242220;border:1px solid #2e2c29;border-radius:8px;color:#f0ede8;font-size:14px;font-family:'DM Sans',sans-serif;}
.field input:focus{border-color:#c8f060;outline:none;}
.checkbox{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;font-size:13px;color:#6b6760;cursor:pointer;}
.checkbox input{margin-top:3px;accent-color:#c8f060;}
.btn-sign{width:100%;padding:16px;background:#c8f060;color:#0f0e0d;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;}
.btn-sign:hover{background:#8fb840;}
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
app.get('/api/documents/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

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
app.post('/api/suggestions', async (req, res) => {
  try {
    const { user_id, cabinet_nom, titre, description, categorie, email, nom } = req.body;
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
app.get('/api/suggestions/admin', async (req, res) => {
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
  const contentBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data }}
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data }};

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        contentBlock,
        {
          type: 'text',
          text: `Tu es un expert-comptable specialise dans les cabinets dentaires francais.
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

  return JSON.parse(response.content[0].text.replace(/```json|```/g,'').trim());
}

app.post('/api/analyser-document', async (req, res) => {
  try {
    const { document, mediaType, userId } = req.body;
    if (!document || !mediaType) return res.status(400).json({ error: 'document et mediaType requis' });

    const data = await analyserDocumentIA(document, mediaType);

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
app.post('/api/valider-document', async (req, res) => {
  try {
    const { document, userId } = req.body;
    if (!document || !userId) return res.status(400).json({ error: 'document et userId requis' });

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
app.get('/api/auth/yahoo', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID,
    redirect_uri: process.env.YAHOO_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile mail-r',
    state: req.query.state || ('jadomi_' + Date.now())
  });
  res.redirect(`https://api.login.yahoo.com/oauth2/request_auth?${params}`);
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
        redirect_uri: process.env.YAHOO_CALLBACK_URL,
      })
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || tokenData.error) {
      console.error('Yahoo token error:', tokenData);
      return res.redirect('https://jadomi.fr/?yahoo_error=token');
    }

    const accessToken = tokenData.access_token;
    // TODO: persister tokenData (access_token / refresh_token / xoauth_yahoo_guid) dans Supabase
    // via req.query.state pour lier a l'utilisateur connecte.
    res.redirect('https://jadomi.fr/index.html?yahoo_connected=1#compta');
  } catch (e) {
    console.error('Yahoo callback error:', e);
    res.redirect('https://jadomi.fr/?yahoo_error=exception');
  }
});

async function scanMailOAuth2(accessToken, email, userId) {
  const imap = new Imap({
    user: email,
    xoauth2: accessToken,
    host: 'imap.mail.yahoo.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 30000,
    authTimeout: 20000,
  });
  return imap;
}

// =============================================
// COMPTABILITE — Scan boite mail (IMAP)
// =============================================
app.post('/api/mail/test', async (req, res) => {
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
    const config = configs[provider] || { host: `imap.${email.split('@')[1]}`, port: 993 };
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

app.post('/api/mail/scan', async (req, res) => {
  const { email, password, provider, userId, periode, mois, annee } = req.body;
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
    const config = configs[provider] || { host: `imap.${email.split('@')[1]}`, port: 993 };

    const imap = new Imap({ user: email, password, host: config.host, port: config.port, tls: true, tlsOptions: { rejectUnauthorized: false, servername: config.host, minVersion: config.minTLS || undefined }, connTimeout: 30000, authTimeout: 20000, keepalive: true });

    res.setTimeout(180000);
    const documents = [];

    await new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };

      // Timeout global 90s — renvoie JSON, pas HTML
      const timer = setTimeout(() => {
        console.error('IMAP scan timeout 90s for', provider, email);
        try { imap.end(); } catch(e) {}
        settle(() => reject(new Error('Timeout: le scan a pris plus de 90 secondes. Essayez une periode plus courte.')));
      }, 90000);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) { try { imap.end(); } catch(e) {} return settle(() => reject(err)); }

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

            const toProcess = uids.slice(-50);
            console.log('IMAP scan: fetching', toProcess.length, 'mails for', provider);
            const parsePromises = [];

            const f = imap.fetch(toProcess, { bodies: '', struct: true });

            f.on('message', (msg) => {
              msg.on('body', (stream) => {
                const p = simpleParser(stream).then(async (parsed) => {
                  for (const att of parsed.attachments || []) {
                    const isPDF = att.contentType && att.contentType.includes('pdf');
                    const isImage = att.contentType && att.contentType.includes('image');
                    if (isPDF || isImage) {
                      try {
                        const base64 = att.content.toString('base64');
                        const analyse = await analyserDocumentIA(base64, att.contentType);
                        if (analyse && analyse.type_document !== 'personnel') {
                          documents.push({
                            from: parsed.from ? parsed.from.text : '',
                            date_mail: parsed.date,
                            subject: parsed.subject,
                            filename: att.filename,
                            analyse,
                            selectionne: analyse.selectionne !== false,
                          });
                        }
                      } catch(e) { console.error('IMAP scan attachment error:', e.message); }
                    }
                  }
                }).catch((e) => { console.error('IMAP scan parse error:', e.message); });
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
              Promise.all(parsePromises).then(() => {
                console.log('IMAP scan complete:', documents.length, 'documents found');
                try { imap.end(); } catch(e) {}
                settle(() => resolve());
              }).catch(() => {
                try { imap.end(); } catch(e) {}
                settle(() => resolve());
              });
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error('IMAP connection error [' + (provider||'?') + ']:', err.message, err.code || '');
        settle(() => reject(err));
      });
      console.log('IMAP scan connecting to', config.host, 'for', provider, '...');
      imap.connect();
    });

    console.log('IMAP scan responding with', documents.length, 'documents');
    res.json({ documents, total: documents.length });
  } catch (e) {
    console.error('IMAP scan error [' + (provider||'?') + ']:', e.message, e.code || '', e.source || '');
    if (!res.headersSent) {
      res.status(400).json({ error: e.message, provider: provider });
    }
  }
});

app.post('/api/mail/import', async (req, res) => {
  const { factures, userId } = req.body;
  try {
    if (!factures || !userId) return res.status(400).json({ error: 'factures et userId requis' });

    let imported = 0;
    for (const f of factures) {
      if (!f.selectionne) continue;
      const doc = f.analyse || f;
      doc.source = 'mail';
      // Reuse valider-document logic
      const hash = crypto.createHash('md5')
        .update(`${doc.fournisseur_ou_etablissement}_${doc.numero_document}_${doc.date}_${doc.total_ttc}`)
        .digest('hex');

      const { data: existing } = await supabase.from('documents_compta')
        .select('id').eq('hash', hash).maybeSingle();
      if (existing) continue;

      await supabase.from('documents_compta').insert({
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
      });
      imported++;
    }

    res.json({ success: true, imported });
  } catch (e) {
    console.error('mail/import error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// COMPTABILITE — Analyse releve bancaire
// =============================================
app.post('/api/analyser-releve', async (req, res) => {
  try {
    const { pdfBase64, userId } = req.body;
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
app.get('/api/factures', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId requis' });

    const { data, error } = await supabase.from('documents_compta')
      .select('*').eq('user_id', userId).order('date_document', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('factures error:', e.message);
    res.status(500).json({ error: e.message });
  }
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
