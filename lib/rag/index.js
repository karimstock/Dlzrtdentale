// =============================================
// JADOMI RAG — API publique
// La mémoire de Qwen : recherche sémantique 100% locale
// sur le catalogue comparateur (238K+ produits).
//
// Usage :
//   const rag = require('./lib/rag');
//   const hits = await rag.searchProducts('composite pour molaire pas cher', 10);
// =============================================
const { embedQuery } = require('./embedder');
const { searchByVector, countProducts, getMeta } = require('./store');

/**
 * Recherche sémantique dans le catalogue produits.
 * @param {string} query - requête en langage naturel (français OK)
 * @param {number} limit - nombre de résultats (défaut 10)
 * @returns {Promise<Array<{product_name, brand, category, supplier_name, reference, price_ttc, url, distance}>>}
 */
async function searchProducts(query, limit = 10) {
  const vec = await embedQuery(query);
  return searchByVector(vec, limit);
}

/**
 * Construit un bloc de contexte RAG prêt à injecter dans un prompt Qwen.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<string>} contexte formaté (ou chaîne vide si index vide)
 */
async function buildContext(query, limit = 8) {
  const hits = await searchProducts(query, limit);
  if (!hits.length) return '';
  const lines = hits.map((h, i) =>
    `${i + 1}. ${h.product_name} — marque: ${h.brand || '?'} — catégorie: ${h.category || '?'} — fournisseur: ${h.supplier_name} — prix TTC: ${h.price_ttc != null ? h.price_ttc + ' €' : 'n.c.'}${h.reference ? ' — réf: ' + h.reference : ''}`
  );
  return `DONNÉES CATALOGUE JADOMI (recherche : "${query}") :\n${lines.join('\n')}`;
}

/** État de l'index (pour monitoring). */
function status() {
  return {
    products: countProducts(),
    lastIndexedId: getMeta('last_sb_id'),
    lastRun: getMeta('last_run_at'),
  };
}

module.exports = { searchProducts, buildContext, status };
