// =============================================
// JADOMI LABO — Routes stock & materiaux
// Scan code-barres, lookup waterfall, alertes peremption
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// GET /api/labo/stock — Liste stock
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { categorie, search, alerte, peremption } = req.query;
    let query = admin().from('labo_stock').select('*')
      .eq('prothesiste_id', req.prothesisteId).eq('est_actif', true)
      .order('categorie').order('nom');
    if (categorie) query = query.eq('categorie', categorie);
    if (search) query = query.or(`nom.ilike.%${search}%,marque.ilike.%${search}%,code_barre.ilike.%${search}%`);
    if (alerte === 'true') query = query.lte('quantite', 'seuil_alerte');
    if (peremption) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(peremption));
      query = query.lte('date_peremption', d.toISOString().split('T')[0]).not('date_peremption', 'is', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ stock: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/stock/alertes — Alertes stock bas + peremption
router.get('/alertes', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const now = new Date();
    const j30 = new Date(now.getTime() + 30*86400000).toISOString().split('T')[0];
    const j60 = new Date(now.getTime() + 60*86400000).toISOString().split('T')[0];
    const j90 = new Date(now.getTime() + 90*86400000).toISOString().split('T')[0];

    const { data: stockBas } = await admin().from('labo_stock').select('id,nom,quantite,seuil_alerte,unite')
      .eq('prothesiste_id', req.prothesisteId).eq('est_actif', true).filter('quantite', 'lte', 'seuil_alerte');

    // Filter stock bas client-side (Supabase can't compare columns directly)
    const alertesStock = (stockBas || []).filter(s => Number(s.quantite) <= Number(s.seuil_alerte));

    const { data: peremption30 } = await admin().from('labo_stock').select('id,nom,date_peremption,numero_lot')
      .eq('prothesiste_id', req.prothesisteId).eq('est_actif', true)
      .lte('date_peremption', j30).not('date_peremption', 'is', null);

    const { data: peremption60 } = await admin().from('labo_stock').select('id,nom,date_peremption,numero_lot')
      .eq('prothesiste_id', req.prothesisteId).eq('est_actif', true)
      .gt('date_peremption', j30).lte('date_peremption', j60).not('date_peremption', 'is', null);

    const { data: peremption90 } = await admin().from('labo_stock').select('id,nom,date_peremption,numero_lot')
      .eq('prothesiste_id', req.prothesisteId).eq('est_actif', true)
      .gt('date_peremption', j60).lte('date_peremption', j90).not('date_peremption', 'is', null);

    res.json({
      stock_bas: alertesStock,
      peremption_30j: peremption30 || [],
      peremption_60j: peremption60 || [],
      peremption_90j: peremption90 || [],
      total_alertes: alertesStock.length + (peremption30||[]).length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/stock/scan/:code — Lookup waterfall (Supabase → OpenFoodFacts → JADOMI IA)
router.get('/scan/:code', async (req, res) => {
  try {
    const code = req.params.code;
    if (!code) return res.status(400).json({ error: 'code requis' });

    // Niveau 1 : Stock interne
    if (req.prothesisteId) {
      const { data } = await admin().from('labo_stock').select('*')
        .eq('prothesiste_id', req.prothesisteId).eq('code_barre', code).maybeSingle();
      if (data) return res.json({ source: 'jadomi', produit: data, existe_stock: true });
    }

    // Niveau 2 : OpenFoodFacts
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
      const d = await r.json();
      if (d && d.status === 1 && d.product) {
        const p = d.product;
        return res.json({
          source: 'openfoodfacts',
          produit: {
            nom: p.product_name_fr || p.product_name || null,
            marque: p.brands || null,
            categorie: (p.categories_tags?.[0] || 'Produit').replace(/^en:/, ''),
            image_url: p.image_url || null,
            code_barre: code
          },
          existe_stock: false
        });
      }
    } catch (e) { /* fallback */ }

    // Niveau 3 : JADOMI IA (Claude Haiku)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          messages: [{
            role: 'user',
            content: `Code-barres: ${code}. Identifie ce produit (domaine dentaire/medical/labo prothese). JSON strict: {"nom":"...","marque":"...","categorie":"...","fournisseur":null,"confidence":0.0}`
          }]
        });
        const txt = msg.content[0]?.text || '';
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          const json = JSON.parse(m[0]);
          if (json.confidence >= 0.4 && json.nom) {
            return res.json({ source: 'jadomi-ia', produit: { ...json, code_barre: code }, existe_stock: false });
          }
        }
      } catch (e) { /* fallback */ }
    }

    res.json({ source: 'unknown', produit: null, existe_stock: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/stock — Ajouter produit
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const b = req.body;
    const { data, error } = await admin().from('labo_stock').insert({
      prothesiste_id: req.prothesisteId,
      nom: b.nom, categorie: b.categorie, sous_categorie: b.sous_categorie,
      marque: b.marque, fournisseur: b.fournisseur, reference_fournisseur: b.reference_fournisseur,
      code_barre: b.code_barre, type_code: b.type_code,
      quantite: b.quantite || 0, unite: b.unite || 'unite',
      seuil_alerte: b.seuil_alerte || 1, prix_unitaire: b.prix_unitaire,
      prix_fournisseur_2: b.prix_fournisseur_2, fournisseur_2: b.fournisseur_2,
      prix_fournisseur_3: b.prix_fournisseur_3, fournisseur_3: b.fournisseur_3,
      date_peremption: b.date_peremption, numero_lot: b.numero_lot,
      image_url: b.image_url, notes: b.notes
    }).select().single();
    if (error) throw error;
    res.json({ success: true, produit: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/labo/stock/:id — Modifier produit
router.put('/:id', async (req, res) => {
  try {
    const allowed = ['nom','categorie','sous_categorie','marque','fournisseur','reference_fournisseur',
      'code_barre','type_code','quantite','unite','seuil_alerte','prix_unitaire',
      'prix_fournisseur_2','fournisseur_2','prix_fournisseur_3','fournisseur_3',
      'date_peremption','numero_lot','image_url','notes','est_actif'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    updates.updated_at = new Date().toISOString();
    const { data, error } = await admin().from('labo_stock').update(updates)
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId).select().single();
    if (error) throw error;
    res.json({ success: true, produit: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/stock/:id/mouvement — Entree/sortie stock
router.post('/:id/mouvement', async (req, res) => {
  try {
    const { type_mouvement, quantite, motif, bl_id } = req.body;
    if (!type_mouvement || quantite === undefined) return res.status(400).json({ error: 'type_mouvement et quantite requis' });

    const { data: stock } = await admin().from('labo_stock').select('quantite')
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId).single();
    if (!stock) return res.status(404).json({ error: 'Produit non trouve' });

    let newQty = Number(stock.quantite);
    if (type_mouvement === 'entree') newQty += Number(quantite);
    else if (type_mouvement === 'sortie') newQty -= Number(quantite);
    else newQty = Number(quantite);

    await admin().from('labo_stock').update({ quantite: Math.max(0, newQty), updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    await admin().from('labo_stock_mouvements').insert({
      stock_id: req.params.id, type_mouvement, quantite: Number(quantite),
      motif: motif || null, bl_id: bl_id || null
    });

    res.json({ success: true, nouvelle_quantite: Math.max(0, newQty) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/labo/stock/:id — Desactiver
router.delete('/:id', async (req, res) => {
  try {
    await admin().from('labo_stock').update({ est_actif: false })
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/stock/scan-peremption — Photo → JADOMI IA lecture date peremption
router.post('/scan-peremption', async (req, res) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 requis' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'JADOMI IA non disponible' });

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image_base64 } },
          { type: 'text', text: 'Lis la date de peremption sur ce produit. Reponds JSON strict: {"date_peremption":"YYYY-MM-DD","numero_lot":"...","confidence":0.0}. Si pas lisible, confidence=0.' }
        ]
      }]
    });
    const txt = msg.content[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      const json = JSON.parse(m[0]);
      return res.json({ success: true, ...json });
    }
    res.json({ success: false, error: 'Non lisible' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
