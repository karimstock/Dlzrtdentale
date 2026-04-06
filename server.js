require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

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
// Start server
// =============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
