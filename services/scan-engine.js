// =============================================
// JADOMI — Scan Engine (waterfall multi-niveaux)
// Passe 51 — World-class product lookup
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

/**
 * Waterfall multi-niveaux pour identifier un produit par GTIN
 * Niveaux :
 *   1. labo_stock cabinet (stock interne)
 *   2. products_database (GTIN exact)
 *   3. products_database (full-text francais)
 *   4. OpenFoodFacts (fallback)
 *   5. Claude IA (dernier recours)
 *
 * @param {string} code - GTIN/EAN/code-barres
 * @param {string|null} prothesisteId - ID prothesiste pour stock local
 * @param {object} options - {userId, societeId, skipCache}
 * @returns {object} {source, produit, existe_stock, waterfall_levels, duration_ms}
 */
async function lookupProduct(code, prothesisteId, options = {}) {
  const startTime = Date.now();
  let waterfallLevels = 0;

  // NIVEAU 1 : Stock interne cabinet
  waterfallLevels++;
  if (prothesisteId) {
    try {
      const { data } = await admin().from('labo_stock').select('*')
        .eq('prothesiste_id', prothesisteId).eq('code_barre', code).maybeSingle();
      if (data) {
        await logScan(code, 'labo_stock', 1.0, waterfallLevels, Date.now() - startTime, options);
        await incrementScanCount(code);
        return { source: 'jadomi', produit: data, existe_stock: true, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
      }
    } catch (e) { /* continue */ }
  }

  // NIVEAU 2 : products_database (GTIN exact)
  waterfallLevels++;
  try {
    const { data } = await admin().from('products_database').select('*')
      .eq('gtin', code).maybeSingle();
    if (data) {
      await incrementScanCount(code);
      await logScan(code, 'products_database', data.confidence_score || 0.9, waterfallLevels, Date.now() - startTime, options);
      return {
        source: 'products_database',
        produit: mapProductToResult(data),
        existe_stock: false,
        product_db_id: data.id,
        waterfall_levels: waterfallLevels,
        duration_ms: Date.now() - startTime
      };
    }
  } catch (e) { /* table may not exist yet, continue */ }

  // NIVEAU 3 : products_database (full-text francais)
  waterfallLevels++;
  if (code.length >= 4) {
    try {
      const { data } = await admin().from('products_database')
        .select('*')
        .or(`reference.eq.${code},manufacturer_ref.eq.${code}`)
        .limit(1).maybeSingle();
      if (data) {
        await incrementScanCount(data.gtin);
        await logScan(code, 'products_database_ref', data.confidence_score || 0.7, waterfallLevels, Date.now() - startTime, options);
        return {
          source: 'products_database',
          produit: mapProductToResult(data),
          existe_stock: false,
          product_db_id: data.id,
          waterfall_levels: waterfallLevels,
          duration_ms: Date.now() - startTime
        };
      }
    } catch (e) { /* continue */ }
  }

  // NIVEAU 4 : OpenFoodFacts
  waterfallLevels++;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
    const d = await r.json();
    if (d && d.status === 1 && d.product) {
      const p = d.product;
      const produit = {
        nom: p.product_name_fr || p.product_name || null,
        marque: p.brands || null,
        categorie: (p.categories_tags?.[0] || 'Produit').replace(/^en:/, ''),
        image_url: p.image_url || null,
        code_barre: code
      };
      // Cache dans products_database pour prochaine fois
      await cacheProduct(code, produit, 'openfoodfacts');
      await logScan(code, 'openfoodfacts', 0.8, waterfallLevels, Date.now() - startTime, options);
      return { source: 'openfoodfacts', produit, existe_stock: false, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
    }
  } catch (e) { /* continue */ }

  // NIVEAU 5 : Claude IA (dernier recours)
  waterfallLevels++;
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
          const produit = { ...json, code_barre: code };
          await cacheProduct(code, produit, 'claude_ia');
          await logScan(code, 'claude_ia', json.confidence, waterfallLevels, Date.now() - startTime, options);
          return { source: 'jadomi-ia', produit, existe_stock: false, waterfall_levels: waterfallLevels, duration_ms: Date.now() - startTime };
        }
      }
    } catch (e) { /* continue */ }
  }

  // Rien trouve
  await logScan(code, 'unknown', 0, waterfallLevels, Date.now() - startTime, options);
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
