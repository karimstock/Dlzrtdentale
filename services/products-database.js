// =============================================
// JADOMI — Products Database Service
// Passe 51 — CRUD + search + enrichment
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

/**
 * Recherche full-text en français
 */
async function searchProducts(query, options = {}) {
  const { limit = 10, category, source } = options;
  try {
    let q = admin().from('products_database')
      .select('id, gtin, name, name_fr, brand, manufacturer, category, image_url, confidence_score, scan_count')
      .textSearch('name_fr', query, { type: 'websearch', config: 'french' })
      .limit(limit);

    if (category) q = q.eq('category', category);
    if (source) q = q.eq('source', source);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    // Fallback ilike si full-text échoue
    try {
      const { data } = await admin().from('products_database')
        .select('id, gtin, name, name_fr, brand, manufacturer, category, image_url, confidence_score, scan_count')
        .or(`name_fr.ilike.%${query}%,name.ilike.%${query}%,brand.ilike.%${query}%`)
        .limit(limit);
      return data || [];
    } catch (e2) { return []; }
  }
}

/**
 * Stats globales de la base produits
 * Performance: single RPC call (get_database_stats) instead of loading all rows.
 * Fallback: 3 lightweight queries (count + 2 RPCs) if combined RPC unavailable.
 * Previous approach loaded 100K+ rows into memory — now O(1) memory.
 */
async function getDatabaseStats() {
  try {
    // Strategy 1: Single RPC call (sql/services/64_database_stats_rpc.sql)
    const { data: stats, error: rpcError } = await admin().rpc('get_database_stats');
    if (!rpcError && stats) {
      const s = typeof stats === 'string' ? JSON.parse(stats) : stats;
      return {
        total_products: s.total_products || 0,
        by_source: s.by_source || {},
        by_category: s.by_category || {},
        top_categories: Object.entries(s.by_category || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 20)
      };
    }

    // Strategy 2: Individual efficient queries (no row loading)
    const { count: total } = await admin().from('products_database').select('*', { count: 'exact', head: true });

    // Source stats via dedicated RPC (sql/vitrines/62_audit_passe62.sql)
    const sourceMap = {};
    const { data: sources } = await admin().rpc('get_product_stats_by_source').catch(() => ({ data: null }));
    if (sources) {
      sources.forEach(r => { sourceMap[r.source] = parseInt(r.count); });
    }

    // Category stats via dedicated RPC
    const catMap = {};
    const { data: categories } = await admin().rpc('get_product_stats_by_category').catch(() => ({ data: null }));
    if (categories) {
      categories.forEach(r => { if (r.category) catMap[r.category] = parseInt(r.count); });
    }

    return {
      total_products: total || 0,
      by_source: sourceMap,
      by_category: catMap,
      top_categories: Object.entries(catMap).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 20)
    };
  } catch (e) {
    return { total_products: 0, by_source: {}, by_category: {}, error: e.message };
  }
}

/**
 * Import batch de produits (utilisé par les scripts)
 */
async function bulkInsertProducts(products, source) {
  const results = { inserted: 0, updated: 0, errors: 0 };
  const batchSize = 100;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map(p => ({
      gtin: p.gtin,
      udi: p.udi || null,
      reference: p.reference || null,
      manufacturer_ref: p.manufacturer_ref || null,
      name: p.name || p.nom || 'Unknown',
      name_fr: p.name_fr || p.nom || null,
      name_en: p.name_en || null,
      brand: p.brand || p.marque || null,
      manufacturer: p.manufacturer || p.fournisseur || null,
      category: p.category || p.categorie || null,
      subcategory: p.subcategory || null,
      gmdn_code: p.gmdn_code || null,
      package_type: p.package_type || null,
      package_quantity: p.package_quantity || null,
      unit: p.unit || null,
      sterile: p.sterile || null,
      single_use: p.single_use || null,
      market_region: p.market_region || null,
      source,
      source_url: p.source_url || null,
      source_metadata: p.source_metadata || null,
      image_url: p.image_url || null,
      metadata: p.metadata || null,
      last_synced_at: new Date().toISOString()
    }));

    try {
      const { data, error } = await admin().from('products_database')
        .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: false });
      if (error) {
        results.errors += batch.length;
      } else {
        results.inserted += batch.length;
      }
    } catch (e) {
      results.errors += batch.length;
    }
  }

  return results;
}

/**
 * Obtenir les catégories distinctes
 * Performance: uses get_database_stats RPC (includes distinct_categories).
 * Fallback: DISTINCT query instead of loading 10K rows + dedup in JS.
 */
async function getCategories() {
  try {
    // Try combined RPC first (includes distinct_categories)
    const { data: stats } = await admin().rpc('get_database_stats').catch(() => ({ data: null }));
    if (stats) {
      const s = typeof stats === 'string' ? JSON.parse(stats) : stats;
      if (Array.isArray(s.distinct_categories)) return s.distinct_categories;
    }
    // Fallback: category RPC returns grouped categories
    const { data: categories } = await admin().rpc('get_product_stats_by_category').catch(() => ({ data: null }));
    if (categories) {
      return categories.map(r => r.category).filter(Boolean).sort();
    }
    // Last resort: select distinct (still better than loading 10K rows)
    const { data } = await admin().from('products_database')
      .select('category')
      .not('category', 'is', null)
      .limit(500);
    return [...new Set((data || []).map(r => r.category))].sort();
  } catch (e) { return []; }
}

module.exports = { searchProducts, getDatabaseStats, bulkInsertProducts, getCategories };
