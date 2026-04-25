// =============================================
// JADOMI — Products Database Service
// Passe 51 — CRUD + search + enrichment
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

/**
 * Recherche full-text en francais
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
    // Fallback ilike si full-text echoue
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
 */
async function getDatabaseStats() {
  try {
    const { count: total } = await admin().from('products_database').select('*', { count: 'exact', head: true });
    const { data: bySrc } = await admin().from('products_database')
      .select('source')
      .limit(100000);

    const sourceMap = {};
    (bySrc || []).forEach(r => {
      sourceMap[r.source] = (sourceMap[r.source] || 0) + 1;
    });

    const { data: byCat } = await admin().from('products_database')
      .select('category')
      .limit(100000);

    const catMap = {};
    (byCat || []).forEach(r => {
      if (r.category) catMap[r.category] = (catMap[r.category] || 0) + 1;
    });

    return {
      total_products: total || 0,
      by_source: sourceMap,
      by_category: catMap,
      top_categories: Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 20)
    };
  } catch (e) {
    return { total_products: 0, by_source: {}, by_category: {}, error: e.message };
  }
}

/**
 * Import batch de produits (utilise par les scripts)
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
 * Obtenir les categories distinctes
 */
async function getCategories() {
  try {
    const { data } = await admin().from('products_database')
      .select('category')
      .not('category', 'is', null)
      .limit(10000);
    const cats = [...new Set((data || []).map(r => r.category))].sort();
    return cats;
  } catch (e) { return []; }
}

module.exports = { searchProducts, getDatabaseStats, bulkInsertProducts, getCategories };
