// =============================================
// JADOMI — Provider Judilibre (API PISTE v1.0)
// Jurisprudence Cour de cassation — texte intégral
// Open data, pseudonymisée
// =============================================

const { getAuthHeaders, invalidateToken } = require('./piste-auth');

const BASE_URL = 'https://api.piste.gouv.fr/cassation/judilibre/v1.0';

// === Helper fetch avec retry sur 401 ===
async function judilibreCall(endpoint, params = {}) {
  let headers = await getAuthHeaders();

  const url = new URL(BASE_URL + endpoint);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  let resp = await fetch(url.toString(), { method: 'GET', headers });

  if (resp.status === 401) {
    invalidateToken();
    headers = await getAuthHeaders();
    resp = await fetch(url.toString(), { method: 'GET', headers });
  }

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[judilibre]', endpoint, resp.status, errText.substring(0, 200));
    throw new Error('Judilibre API erreur ' + resp.status);
  }

  return resp.json();
}

// ================================================
// RECHERCHE plein texte dans les décisions
// ================================================
async function search(query, options = {}) {
  const params = {
    query: query,
    page: options.page || 0,
    page_size: Math.min(options.pageSize || 10, 50),
    sort: options.sort || 'score',
    order: options.order || 'desc'
  };

  // Filtres optionnels
  if (options.chambre) params.chamber = options.chambre;
  if (options.formation) params.formation = options.formation;
  if (options.type) params.type = options.type;
  if (options.matiere) params.theme = options.matiere;
  if (options.dateDebut) params.date_start = options.dateDebut;
  if (options.dateFin) params.date_end = options.dateFin;
  if (options.solution) params.solution = options.solution;
  if (options.publication) params.publication = options.publication;

  return judilibreCall('/search', params);
}

// ================================================
// DÉCISION par son ID — texte intégral
// ================================================
async function getDecision(decisionId) {
  return judilibreCall('/decision', { id: decisionId });
}

// ================================================
// TAXONOMIE — liste des filtres disponibles
// ================================================
async function getTaxonomy(key) {
  const params = {};
  if (key) params.id = key;
  return judilibreCall('/taxonomy', params);
}

// ================================================
// STATISTIQUES du fonds documentaire
// ================================================
async function getStats() {
  return judilibreCall('/stats');
}

// ================================================
// HISTORIQUE TRANSACTIONNEL — suivi des modifications
// Endpoint /transactionalHistory (créations, mises à jour, suppressions)
// Doc : https://github.com/Cour-de-cassation/judilibre-search
// ATTENTION : next_page n'est valide que 1 minute
// ================================================
async function getTransactionalHistory(options = {}) {
  const params = {};
  if (options.date) params.date = options.date;
  if (options.page_size) params.page_size = options.page_size;
  if (options.order) params.order = options.order;

  // Si on a un next_page brut (querystring complet), l'utiliser tel quel
  if (options._rawQuery) {
    const url = BASE_URL + '/transactionalHistory?' + options._rawQuery;
    const headers = await getAuthHeaders();
    let resp = await fetch(url, { method: 'GET', headers });
    if (resp.status === 401) {
      invalidateToken();
      const h2 = await getAuthHeaders();
      resp = await fetch(url, { method: 'GET', headers: h2 });
    }
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[judilibre] transactionalHistory', resp.status, errText.substring(0, 200));
      throw new Error('Judilibre transactionalHistory erreur ' + resp.status);
    }
    return resp.json();
  }

  return judilibreCall('/transactionalHistory', params);
}

/**
 * Récupère TOUT l'historique transactionnel depuis une date (pagination auto).
 * Attention : chaque next_page expire en 1 minute, donc on pagine vite.
 */
async function getAllTransactionalHistory(sinceDate) {
  const all = [];
  const isoDate = sinceDate instanceof Date ? sinceDate.toISOString() : sinceDate;

  let result = await getTransactionalHistory({ date: isoDate, page_size: 50 });
  if (result.transactions) all.push(...result.transactions);

  while (result.next_page) {
    result = await getTransactionalHistory({ _rawQuery: result.next_page });
    if (result.transactions) all.push(...result.transactions);
  }

  return all;
}

// ================================================
// EXPORT lot de décisions (CSV/JSON)
// ================================================
async function exportDecisions(options = {}) {
  const params = {
    batch: options.batch || 0,
    batch_size: Math.min(options.batchSize || 50, 1000),
    type: options.type || 'json',
    sort: options.sort || 'date',
    order: options.order || 'desc'
  };

  if (options.dateDebut) params.date_start = options.dateDebut;
  if (options.dateFin) params.date_end = options.dateFin;
  if (options.chambre) params.chamber = options.chambre;

  return judilibreCall('/export', params);
}

module.exports = {
  search,
  getDecision,
  getTaxonomy,
  getStats,
  exportDecisions,
  getTransactionalHistory,
  getAllTransactionalHistory
};
