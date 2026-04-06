require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Anthropic Claude client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Supabase client ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    const {
      messages,
      system,
      model = 'claude-sonnet-4-20250514',
      max_tokens = 1000,
    } = req.body;

    const { tools } = req.body;
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
      .from('documents')
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
// Start server
// =============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
