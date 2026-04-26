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

// GET /api/labo/stock/scan/:code — Lookup waterfall multi-niveaux (Passe 51)
// Niveaux : labo_stock → products_database → products_database(ref) → OpenFoodFacts → Claude IA
router.get('/scan/:code', async (req, res) => {
  try {
    const code = req.params.code;
    if (!code) return res.status(400).json({ error: 'code requis' });

    let scanEngine;
    try { scanEngine = require('../../services/scan-engine'); } catch (e) { scanEngine = null; }

    // Si scan-engine disponible, utiliser le waterfall complet
    // Le parametre profession permet le scan contextuel :
    // orthodontiste → cherche d'abord Orthodontie
    // prothesiste → cherche d'abord Prothese, etc.
    if (scanEngine) {
      const result = await scanEngine.lookupProduct(code, req.prothesisteId, {
        userId: req.userId || null,
        societeId: req.societeId || null,
        prothesisteId: req.prothesisteId || null,
        profession: req.query.profession || 'labo',
        scanMethod: req.query.method || 'manual'
      });

      // Ajouter les prix multi-fournisseurs si produit trouve
      if (result.produit && result.source !== 'unknown') {
        try {
          const pricesData = await scanEngine.getProductPrices(code);
          if (pricesData) result.prices = pricesData;
        } catch (e) { /* silent */ }
      }

      return res.json(result);
    }

    // Fallback : waterfall inline (si scan-engine pas encore charge)
    // Niveau 1 : Stock interne
    if (req.prothesisteId) {
      const { data } = await admin().from('labo_stock').select('*')
        .eq('prothesiste_id', req.prothesisteId).eq('code_barre', code).maybeSingle();
      if (data) return res.json({ source: 'jadomi', produit: data, existe_stock: true });
    }

    // Niveau 2 : products_database (GTIN exact)
    try {
      const { data } = await admin().from('products_database').select('*')
        .eq('gtin', code).maybeSingle();
      if (data) {
        return res.json({
          source: 'products_database',
          produit: {
            nom: data.name_fr || data.name,
            marque: data.brand,
            categorie: data.category,
            fournisseur: data.manufacturer,
            code_barre: data.gtin,
            image_url: data.image_url,
            reference: data.reference,
            confidence: data.confidence_score
          },
          existe_stock: false
        });
      }
    } catch (e) { /* table may not exist yet */ }

    // Niveau 3 : OpenFoodFacts
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

    // Niveau 4 : JADOMI IA (Claude Haiku)
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

// GET /api/labo/stock/scan-stats — Analytics scans (Passe 51)
router.get('/scan-stats', async (req, res) => {
  try {
    let totalScans = 0, successRate = 0, avgDuration = 0, bySource = {}, topProducts = [], recentScans = [], totalCorrections = 0;

    // Stats scan_logs
    try {
      const { data: logs } = await admin().from('scan_logs')
        .select('source_used, confidence, duration_ms, gtin, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (logs?.length) {
        totalScans = logs.length;
        const identified = logs.filter(l => l.source_used !== 'unknown').length;
        successRate = Math.round(identified / totalScans * 100);
        const durations = logs.filter(l => l.duration_ms).map(l => l.duration_ms);
        avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

        logs.forEach(l => { bySource[l.source_used] = (bySource[l.source_used] || 0) + 1; });
        recentScans = logs.slice(0, 50);
      }
    } catch (e) { /* scan_logs table may not exist yet */ }

    // Stats products_database
    let dbTotal = 0, dbSources = {};
    try {
      const { count } = await admin().from('products_database').select('*', { count: 'exact', head: true });
      dbTotal = count || 0;

      const { data: srcData } = await admin().from('products_database').select('source').limit(100000);
      if (srcData) srcData.forEach(r => { dbSources[r.source] = (dbSources[r.source] || 0) + 1; });
    } catch (e) { /* table may not exist */ }

    // Top produits
    try {
      const { data } = await admin().from('products_database')
        .select('gtin, name_fr, name, scan_count')
        .order('scan_count', { ascending: false })
        .gt('scan_count', 0)
        .limit(20);
      topProducts = (data || []).map(p => ({ gtin: p.gtin, name: p.name_fr || p.name, scan_count: p.scan_count }));
    } catch (e) { /* silent */ }

    // Corrections
    try {
      const { count } = await admin().from('product_corrections').select('*', { count: 'exact', head: true });
      totalCorrections = count || 0;
    } catch (e) { /* silent */ }

    res.json({
      total_scans: totalScans,
      success_rate: successRate,
      avg_duration: avgDuration,
      by_source: bySource,
      db_total: dbTotal,
      db_sources: dbSources,
      top_products: topProducts,
      recent_scans: recentScans,
      total_corrections: totalCorrections
    });
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

// POST /api/labo/stock/scan-peremption — Photo → JADOMI IA lecture date peremption (Sonnet Vision)
router.post('/scan-peremption', async (req, res) => {
  try {
    let imageData = req.body.image_base64;
    if (!imageData) return res.status(400).json({ error: 'image_base64 requis' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'JADOMI IA non disponible' });

    // Strip data URL prefix if present (frontend sends dataUrl)
    if (imageData.startsWith('data:')) {
      imageData = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `Tu es un assistant expert specialise dans la lecture de dates de peremption sur des emballages de produits dentaires, medicaux et de laboratoire prothetique.

Tu connais tous les formats utilises dans l'industrie :
- DD/MM/YYYY (francais)
- MM/YYYY ou MM/YY (international)
- YYYY-MM-DD (ISO)
- Marquages : EXP, USE BY, BBE, Best Before, Peremption
- Pictogramme sablier
- Numeros de lot : LOT, Batch, No., REF

Tu retournes TOUJOURS un JSON strict avec confidence calibre sur la qualite reelle de ta lecture.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
          { type: 'text', text: `Analyse cette photo d'emballage de produit dentaire/medical/labo.

Trouve et extrais :
1. La DATE DE PEREMPTION (la plus importante)
2. Le NUMERO DE LOT si visible
3. La zone ou tu as lu la date

Indique TOUJOURS un score de confidence honnete :
- 0.9-1.0 : Date parfaitement lisible
- 0.7-0.9 : Date lisible avec legere ambiguite
- 0.5-0.7 : Date partiellement lisible
- 0.3-0.5 : Date difficile a lire
- <0.3 : Pas de date visible ou trop floue

Format JSON strict :
{"date_peremption":"YYYY-MM-DD ou null","numero_lot":"texte ou null","confidence":0.0,"format_detecte":"MM/YY ou DD/MM/YYYY etc","zone_image":"description ou tu as lu","observations":"notes utiles"}` }
        ]
      }]
    });
    const txt = msg.content[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      const json = JSON.parse(m[0]);
      return res.json({ success: true, ...json });
    }
    res.json({ success: false, confidence: 0, error: 'Non lisible' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/stock/supplier/lookup — Recherche et enrichit un fournisseur inconnu via IA
router.post('/supplier/lookup', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'name requis (min 2 caracteres)' });

    const supplierName = name.trim();
    const normalized = supplierName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');

    // Chercher d'abord dans suppliers_directory
    try {
      const { data: existing } = await admin().from('suppliers_directory')
        .select('*')
        .ilike('name_normalized', `%${normalized.substring(0, 20)}%`)
        .limit(5);

      if (existing?.length) {
        return res.json({ found: true, source: 'directory', suppliers: existing });
      }
    } catch (e) { /* table pas encore creee, continue */ }

    // Pas trouve → Claude Haiku recherche les infos
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ found: false, source: 'none', supplier: { name: supplierName } });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `Tu es un expert du marche de la distribution dentaire et medicale en France et en Europe. Tu connais tous les distributeurs, fabricants et groupements d'achats du secteur dentaire.`,
      messages: [{
        role: 'user',
        content: `Le fournisseur "${supplierName}" est mentionne sur une facture de cabinet dentaire.

Identifie ce fournisseur et donne toutes les infos utiles.

JSON strict :
{
  "name": "Nom officiel exact",
  "legal_name": "Raison sociale ou null",
  "supplier_type": "distributor|manufacturer|groupement|depot|marketplace",
  "website": "URL ou null",
  "phone": "telephone ou null",
  "country": "FR|DE|CH|IT|US|...",
  "city": "ville siege ou null",
  "specialties": ["orthodontie","prothese","implants","omnipratique","labo"],
  "brands_distributed": ["Marque1","Marque2"],
  "sectors": ["dentaire","medical","labo"],
  "coverage_national": true/false,
  "description": "1-2 phrases description en francais",
  "confidence": 0.0-1.0
}`
      }]
    });

    const txt = msg.content[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return res.json({ found: false, source: 'ia', supplier: { name: supplierName } });

    const supplier = JSON.parse(m[0]);

    // Sauvegarder dans suppliers_directory
    try {
      await admin().from('suppliers_directory').upsert({
        name: supplier.name || supplierName,
        name_normalized: (supplier.name || supplierName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ''),
        legal_name: supplier.legal_name || null,
        supplier_type: supplier.supplier_type || 'distributor',
        website: supplier.website || null,
        phone: supplier.phone || null,
        country: supplier.country || 'FR',
        city: supplier.city || null,
        specialties: supplier.specialties || [],
        brands_distributed: supplier.brands_distributed || [],
        sectors: supplier.sectors || ['dentaire'],
        coverage_national: supplier.coverage_national || false,
        source: 'ia_enriched',
        enriched_at: new Date().toISOString(),
        enriched_by: 'claude_haiku',
        metadata: { description: supplier.description, confidence: supplier.confidence }
      }, { onConflict: 'name', ignoreDuplicates: false });
    } catch (e) { /* silent — table may not exist yet */ }

    res.json({
      found: true,
      source: 'ia',
      supplier: { ...supplier, name: supplier.name || supplierName },
      message: 'Fournisseur identifie et enregistre dans l\'annuaire JADOMI'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/stock/scan/photo-identify — Photo produit → Claude Vision → enrichit la base JADOMI
// Workflow : code-barres inconnu → dentiste prend le produit en photo → IA identifie → base enrichie pour TOUS
router.post('/scan/photo-identify', async (req, res) => {
  try {
    const { image_base64, gtin } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 requis' });
    if (!gtin) return res.status(400).json({ error: 'gtin requis (code-barres scanne)' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'JADOMI IA non disponible' });

    let imageData = image_base64;
    if (imageData.startsWith('data:')) {
      imageData = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `Tu es un expert en produits dentaires, medicaux et de laboratoire prothetique.
Tu identifies les produits a partir de photos d'emballage, de boite, ou du produit lui-meme.
Tu connais toutes les marques : 3M, Dentsply Sirona, GC, Ivoclar, Kerr, Vita, Ultradent, Septodont,
VDW, Hu-Friedy, Bien-Air, W&H, NSK, Acteon, Straumann, Nobel Biocare, Zimmer, Osstem,
Zhermack, Tokuyama, Shofu, Kuraray, Coltene, SDI, VOCO, Kulzer, DMG, Produits Dentaires SA, etc.

Tu retournes TOUJOURS un JSON strict.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
          { type: 'text', text: `Identifie ce produit dentaire/medical a partir de cette photo.
Le code-barres scanne est : ${gtin}

Extrais toutes les informations visibles :
1. Nom EXACT du produit (tel qu'ecrit sur l'emballage)
2. Marque / fabricant
3. Categorie (Instruments, Composites, Endodontie, Orthodontie, Prothese, Implants, etc.)
4. Sous-categorie precise
5. Conditionnement (quantite, unite)
6. Toute info supplementaire visible (taille, couleur, reference)

JSON strict :
{
  "nom": "Nom exact du produit",
  "nom_fr": "Nom en francais si different",
  "marque": "Marque",
  "fabricant": "Fabricant",
  "categorie": "Categorie principale",
  "sous_categorie": "Sous-categorie precise",
  "conditionnement": "ex: boite de 6, flacon 5ml",
  "reference_fabricant": "reference visible ou null",
  "taille": "taille/dimension ou null",
  "couleur": "couleur/teinte ou null",
  "sterile": true/false ou null,
  "usage_unique": true/false ou null,
  "description_fr": "Description 1-2 phrases",
  "mots_cles": ["mot1","mot2","mot3","mot4","mot5"],
  "confidence": 0.0-1.0
}` }
        ]
      }]
    });

    const txt = msg.content[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return res.json({ success: false, error: 'Produit non identifie' });

    const product = JSON.parse(m[0]);

    // Enregistrer dans products_database → enrichit la base pour TOUS les dentistes
    try {
      await admin().from('products_database').upsert({
        gtin: gtin,
        name: product.nom || product.nom_fr || 'Unknown',
        name_fr: product.nom_fr || product.nom || null,
        brand: product.marque || null,
        manufacturer: product.fabricant || null,
        category: product.categorie || 'Divers',
        subcategory: product.sous_categorie || null,
        reference: product.reference_fabricant || null,
        manufacturer_ref: product.reference_fabricant || null,
        sterile: product.sterile || null,
        single_use: product.usage_unique || null,
        package_type: product.conditionnement || null,
        size: product.taille || null,
        color: product.couleur || null,
        source: 'photo_identify',
        confidence_score: product.confidence || 0.8,
        metadata: {
          description_fr: product.description_fr,
          keywords_fr: product.mots_cles,
          identified_by: req.userId || 'anonymous',
          identified_at: new Date().toISOString(),
          photo_source: true
        },
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'gtin', ignoreDuplicates: false });
    } catch (e) { /* silent */ }

    // Logger le scan
    try {
      await admin().from('scan_logs').insert({
        user_id: req.userId || null,
        societe_id: req.societeId || null,
        prothesiste_id: req.prothesisteId || null,
        scan_type: 'photo',
        gtin: gtin,
        source_used: 'photo_identify',
        confidence: product.confidence || 0.8,
        scan_method: 'photo'
      });
    } catch (e) { /* silent */ }

    res.json({
      success: true,
      produit: {
        nom: product.nom_fr || product.nom,
        marque: product.marque,
        categorie: product.categorie,
        sous_categorie: product.sous_categorie,
        fournisseur: product.fabricant,
        code_barre: gtin,
        confidence: product.confidence,
        description: product.description_fr,
        conditionnement: product.conditionnement
      },
      enriched: true,
      message: 'Produit identifie et ajoute a la base JADOMI. Tous les dentistes pourront le scanner instantanement.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
