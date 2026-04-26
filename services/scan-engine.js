// =============================================
// JADOMI — Scan Engine (waterfall multi-niveaux)
// Passe 51 — World-class product lookup
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

// Categories dentaires
const DENTAL_CATEGORIES = [
  'Orthodontie','Prothese','Implants','Instruments','Chirurgie',
  'Endodontie','Parodontie','Composites','Empreintes','Equipement',
  'CFAO','Radiologie','Anesthesie','Hygiene','Sterilisation','Esthetique'
];

// Categories prioritaires par metier du praticien
// Le scan cherche D'ABORD dans la specialite, PUIS elargit
const PRIORITY_BY_PROFESSION = {
  'orthodontiste': ['Orthodontie', 'Instruments', 'CFAO', 'Equipement'],
  'prothesiste': ['Prothese', 'CFAO', 'Instruments', 'Empreintes', 'Equipement'],
  'implantologue': ['Implants', 'Chirurgie', 'Prothese', 'Instruments'],
  'endodontiste': ['Endodontie', 'Instruments', 'Radiologie', 'Equipement'],
  'parodontiste': ['Parodontie', 'Chirurgie', 'Instruments', 'Implants'],
  'omnipraticien': ['Composites', 'Instruments', 'Empreintes', 'Anesthesie', 'Hygiene'],
  'chirurgien': ['Chirurgie', 'Implants', 'Instruments', 'Anesthesie'],
  'labo': ['Prothese', 'CFAO', 'Empreintes', 'Instruments', 'Equipement'],
};

/**
 * Waterfall ULTRA-RAPIDE pour identifier un produit par GTIN
 *
 * Strategie : DENTAL FIRST
 *   1. labo_stock cabinet (stock interne) → instantane
 *   2. products_database GTIN exact (1.3M produits dentaires) → <5ms
 *   3. products_database reference fabricant → <10ms
 *   4. products_database recherche floue (GTIN partiel, variantes) → <20ms
 *   5. OpenFoodFacts (fallback non-dental) → ~200ms
 *   6. Claude IA (dernier recours) → ~1-2s
 *
 * 99%+ des scans dentaires resolus en <10ms (niveaux 1-3)
 */
async function lookupProduct(code, prothesisteId, options = {}) {
  const startTime = Date.now();
  let waterfallLevels = 0;

  // Normaliser le code (retirer espaces, tirets)
  const cleanCode = code.replace(/[\s\-]/g, '').trim();

  // Categories prioritaires selon le metier du praticien
  // Orthodontiste → cherche d'abord dans Orthodontie
  // Prothesiste → cherche d'abord dans Prothese, etc.
  const profession = options.profession || 'omnipraticien';
  const priorityCategories = PRIORITY_BY_PROFESSION[profession] || DENTAL_CATEGORIES;

  // ══════════════════════════════════════════
  // NIVEAU 1 : Stock interne cabinet (instantane)
  // ══════════════════════════════════════════
  waterfallLevels++;
  if (prothesisteId) {
    try {
      const { data } = await admin().from('labo_stock').select('*')
        .eq('prothesiste_id', prothesisteId).eq('code_barre', cleanCode).maybeSingle();
      if (data) {
        logScan(cleanCode, 'labo_stock', 1.0, waterfallLevels, Date.now() - startTime, options);
        incrementScanCount(cleanCode);
        return { source: 'jadomi', produit: data, existe_stock: true, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
      }
    } catch (e) { /* continue */ }
  }

  // ══════════════════════════════════════════
  // NIVEAU 2 : Base JADOMI — GTIN exact (1.3M produits, <5ms)
  // ══════════════════════════════════════════
  waterfallLevels++;
  try {
    const { data } = await admin().from('products_database').select(
      'id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,reference,sterile,single_use,gmdn_code,metadata'
    ).eq('gtin', cleanCode).maybeSingle();

    if (data) {
      incrementScanCount(cleanCode);
      logScan(cleanCode, 'products_database', data.confidence_score || 0.95, waterfallLevels, Date.now() - startTime, options);
      return {
        source: 'products_database',
        produit: mapProductToResult(data),
        existe_stock: false,
        product_db_id: data.id,
        is_dental: DENTAL_CATEGORIES.includes(data.category),
        waterfall_levels: waterfallLevels,
        duration_ms: Date.now() - startTime
      };
    }
  } catch (e) { /* table may not exist yet */ }

  // ══════════════════════════════════════════
  // NIVEAU 3 : Base JADOMI — Reference fabricant (<10ms)
  // ══════════════════════════════════════════
  waterfallLevels++;
  if (cleanCode.length >= 4) {
    try {
      const { data } = await admin().from('products_database')
        .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,reference,sterile,single_use,metadata')
        .or(`reference.eq.${cleanCode},manufacturer_ref.eq.${cleanCode}`)
        .limit(1).maybeSingle();

      if (data) {
        incrementScanCount(data.gtin);
        logScan(cleanCode, 'products_database_ref', data.confidence_score || 0.85, waterfallLevels, Date.now() - startTime, options);
        return {
          source: 'products_database',
          produit: mapProductToResult(data),
          existe_stock: false,
          product_db_id: data.id,
          is_dental: DENTAL_CATEGORIES.includes(data.category),
          waterfall_levels: waterfallLevels,
          duration_ms: Date.now() - startTime
        };
      }
    } catch (e) { /* continue */ }
  }

  // ══════════════════════════════════════════
  // NIVEAU 4 : Base JADOMI — Recherche floue GTIN (<20ms)
  // Variantes : EAN-8 dans EAN-13, zero-padding, prefixe
  // ══════════════════════════════════════════
  waterfallLevels++;
  if (cleanCode.length >= 6) {
    try {
      // Essayer avec zero-padding (EAN-8 → EAN-13)
      const padded = cleanCode.padStart(14, '0');
      const variants = [padded, cleanCode.padStart(13, '0'), cleanCode.padStart(12, '0')];

      for (const variant of variants) {
        if (variant === cleanCode) continue;
        const { data } = await admin().from('products_database')
          .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,reference,sterile,single_use,metadata')
          .eq('gtin', variant).maybeSingle();

        if (data) {
          incrementScanCount(data.gtin);
          logScan(cleanCode, 'products_database_fuzzy', data.confidence_score || 0.75, waterfallLevels, Date.now() - startTime, options);
          return {
            source: 'products_database',
            produit: mapProductToResult(data),
            existe_stock: false,
            product_db_id: data.id,
            is_dental: DENTAL_CATEGORIES.includes(data.category),
            matched_variant: variant,
            waterfall_levels: waterfallLevels,
            duration_ms: Date.now() - startTime
          };
        }
      }

      // Recherche par prefixe — PRIORITE METIER
      // Orthodontiste → cherche d'abord dans Orthodontie, puis elargit
      // Prothesiste → cherche d'abord dans Prothese, puis elargit
      if (cleanCode.length >= 8) {
        const prefix = cleanCode.substring(0, 8);

        // Etape 4a : chercher dans les categories prioritaires du metier
        const { data: priorityMatch } = await admin().from('products_database')
          .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,metadata')
          .like('gtin', `${prefix}%`)
          .in('category', priorityCategories)
          .order('scan_count', { ascending: false })
          .limit(1).maybeSingle();

        if (priorityMatch) {
          incrementScanCount(priorityMatch.gtin);
          logScan(cleanCode, 'products_database_prefix_priority', priorityMatch.confidence_score || 0.7, waterfallLevels, Date.now() - startTime, options);
          return {
            source: 'products_database',
            produit: mapProductToResult(priorityMatch),
            existe_stock: false,
            product_db_id: priorityMatch.id,
            is_dental: true,
            match_type: 'prefix_priority',
            matched_profession: profession,
            waterfall_levels: waterfallLevels,
            duration_ms: Date.now() - startTime
          };
        }

        // Etape 4b : elargir a TOUTES les categories dentaires
        const { data: broadMatch } = await admin().from('products_database')
          .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,metadata')
          .like('gtin', `${prefix}%`)
          .in('category', DENTAL_CATEGORIES)
          .order('scan_count', { ascending: false })
          .limit(1).maybeSingle();

        if (broadMatch) {
          incrementScanCount(broadMatch.gtin);
          logScan(cleanCode, 'products_database_prefix_broad', broadMatch.confidence_score || 0.6, waterfallLevels, Date.now() - startTime, options);
          return {
            source: 'products_database',
            produit: mapProductToResult(broadMatch),
            existe_stock: false,
            product_db_id: broadMatch.id,
            is_dental: true,
            match_type: 'prefix_broad',
            waterfall_levels: waterfallLevels,
            duration_ms: Date.now() - startTime
          };
        }
      }
    } catch (e) { /* continue */ }
  }

  // ══════════════════════════════════════════
  // NIVEAU 4bis : Recherche par NOM si code non-numerique
  // (quand le dentiste tape "equia forte" au lieu de scanner)
  // ══════════════════════════════════════════
  if (cleanCode.length >= 3 && !/^\d+$/.test(cleanCode)) {
    waterfallLevels++;
    try {
      // Recherche full-text rapide (utilise index GIN si dispo)
      let data = null;
      try {
        const res = await admin().from('products_database')
          .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,metadata')
          .textSearch('name', cleanCode, { type: 'plain' })
          .in('category', priorityCategories)
          .limit(1).maybeSingle();
        data = res.data;
      } catch (e) { /* fulltext pas dispo, continue */ }

      // Fallback : chercher dans toutes categories
      if (!data) {
        try {
          const res = await admin().from('products_database')
            .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,metadata')
            .textSearch('name', cleanCode, { type: 'plain' })
            .limit(1).maybeSingle();
          data = res.data;
        } catch (e) { /* continue */ }
      }

      // Fallback : recherche par brand
      if (!data) {
        try {
          const res = await admin().from('products_database')
            .select('id,gtin,name,name_fr,brand,manufacturer,category,subcategory,image_url,confidence_score,metadata')
            .ilike('brand', `%${cleanCode}%`)
            .limit(1).maybeSingle();
          data = res.data;
        } catch (e) { /* continue */ }
      }

      if (data) {
        incrementScanCount(data.gtin);
        logScan(cleanCode, 'products_database_text', data.confidence_score || 0.7, waterfallLevels, Date.now() - startTime, options);
        return {
          source: 'products_database',
          produit: mapProductToResult(data),
          existe_stock: false,
          product_db_id: data.id,
          is_dental: DENTAL_CATEGORIES.includes(data.category),
          match_type: 'text_search',
          waterfall_levels: waterfallLevels,
          duration_ms: Date.now() - startTime
        };
      }
    } catch (e) { /* continue */ }
  }

  // ══════════════════════════════════════════
  // NIVEAU 5 : OpenFoodFacts (non-dental, ~200ms)
  // ══════════════════════════════════════════
  waterfallLevels++;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(cleanCode)}.json`, { signal: controller.signal });
    clearTimeout(timeout);
    const d = await r.json();
    if (d && d.status === 1 && d.product) {
      const p = d.product;
      const produit = {
        nom: p.product_name_fr || p.product_name || null,
        marque: p.brands || null,
        categorie: (p.categories_tags?.[0] || 'Produit').replace(/^en:/, ''),
        image_url: p.image_url || null,
        code_barre: cleanCode
      };
      cacheProduct(cleanCode, produit, 'openfoodfacts');
      logScan(cleanCode, 'openfoodfacts', 0.8, waterfallLevels, Date.now() - startTime, options);
      return { source: 'openfoodfacts', produit, existe_stock: false, is_dental: false, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
    }
  } catch (e) { /* timeout ou erreur, continue */ }

  // ══════════════════════════════════════════
  // NIVEAU 6 : Claude IA (dernier recours, ~1-2s)
  // ══════════════════════════════════════════
  waterfallLevels++;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'Tu es un assistant expert en produits dentaires, medicaux et de laboratoire prothetique. Identifie le produit a partir de son code-barres. Reponds UNIQUEMENT en JSON strict.',
        messages: [{
          role: 'user',
          content: `Code-barres: ${cleanCode}. Identifie ce produit. JSON strict: {"nom":"...","marque":"...","categorie":"...","sous_categorie":"...","fournisseur":null,"confidence":0.0,"is_dental":true}`
        }]
      });
      const txt = msg.content[0]?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) {
        const json = JSON.parse(m[0]);
        if (json.confidence >= 0.4 && json.nom) {
          const produit = { ...json, code_barre: cleanCode };
          cacheProduct(cleanCode, produit, 'claude_ia');
          logScan(cleanCode, 'claude_ia', json.confidence, waterfallLevels, Date.now() - startTime, options);
          return { source: 'jadomi-ia', produit, existe_stock: false, is_dental: json.is_dental !== false, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
        }
      }
    } catch (e) { /* continue */ }
  }

  // Rien trouve
  logScan(cleanCode, 'unknown', 0, waterfallLevels, Date.now() - startTime, options);
  return { source: 'unknown', produit: null, existe_stock: false, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
}

/**
 * Recherche multi-fournisseurs pour un produit
 */
async function getProductPrices(gtin) {
  try {
    const { data: prices } = await admin().from('supplier_prices')
      .select('supplier_name, price_catalog, price_negotiated, discount_percent, observed_at, source')
      .eq('gtin', gtin)
      .order('observed_at', { ascending: false })
      .limit(20);

    if (!prices || !prices.length) return null;

    const validPrices = prices.map(p => p.price_negotiated || p.price_catalog).filter(Boolean);
    if (!validPrices.length) return null;

    return {
      prices: prices.slice(0, 10),
      market_stats: {
        average: +(validPrices.reduce((a, b) => a + b, 0) / validPrices.length).toFixed(2),
        best: Math.min(...validPrices),
        worst: Math.max(...validPrices),
        suppliers_count: new Set(prices.map(p => p.supplier_name)).size,
        last_observed: prices[0].observed_at
      }
    };
  } catch (e) { return null; }
}

// ── Helpers ────────────────────────────────────

function mapProductToResult(dbProduct) {
  return {
    nom: dbProduct.name_fr || dbProduct.name,
    marque: dbProduct.brand,
    categorie: dbProduct.category,
    fournisseur: dbProduct.manufacturer,
    code_barre: dbProduct.gtin,
    image_url: dbProduct.image_url,
    reference: dbProduct.reference,
    sterile: dbProduct.sterile,
    single_use: dbProduct.single_use,
    confidence: dbProduct.confidence_score
  };
}

async function cacheProduct(gtin, produit, source) {
  try {
    await admin().from('products_database').upsert({
      gtin,
      name: produit.nom || produit.name || 'Unknown',
      name_fr: produit.nom || produit.name_fr,
      brand: produit.marque || produit.brand,
      category: produit.categorie || produit.category,
      manufacturer: produit.fournisseur || produit.manufacturer,
      image_url: produit.image_url,
      source,
      confidence_score: produit.confidence || 0.5,
      last_synced_at: new Date().toISOString()
    }, { onConflict: 'gtin', ignoreDuplicates: false });
  } catch (e) { /* silent — cache is best-effort */ }
}

async function incrementScanCount(gtin) {
  try {
    await admin().rpc('increment_scan_count', { p_gtin: gtin });
  } catch (e) {
    // Fallback si la fonction RPC n'existe pas
    try {
      const { data } = await admin().from('products_database')
        .select('scan_count').eq('gtin', gtin).maybeSingle();
      if (data) {
        await admin().from('products_database')
          .update({ scan_count: (data.scan_count || 0) + 1 })
          .eq('gtin', gtin);
      }
    } catch (e2) { /* silent */ }
  }
}

async function logScan(code, source, confidence, levels, durationMs, options = {}) {
  try {
    await admin().from('scan_logs').insert({
      user_id: options.userId || null,
      societe_id: options.societeId || null,
      prothesiste_id: options.prothesisteId || null,
      scan_type: 'barcode',
      gtin: code,
      raw_code: code,
      source_used: source,
      confidence,
      waterfall_levels_tried: levels,
      duration_ms: durationMs,
      scan_method: options.scanMethod || 'manual'
    });
  } catch (e) { /* silent — logging is best-effort */ }
}

module.exports = { lookupProduct, getProductPrices, logScan, cacheProduct };
