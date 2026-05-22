// =============================================
// JADOMI — Provider Légifrance (API PISTE v2.4)
// Accès aux codes, lois, décrets, jurisprudence
// Documentation : https://developer.aife.economie.gouv.fr/
// =============================================

const { getAuthHeaders, invalidateToken } = require('./piste-auth');

const BASE_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

// === Helper fetch avec retry sur 401 ===
async function pisteCall(endpoint, body, method = 'POST') {
  let headers = await getAuthHeaders();

  const opts = { method, headers };
  if (body && method === 'POST') {
    opts.body = JSON.stringify(body);
  }

  let resp = await fetch(BASE_URL + endpoint, opts);

  // Retry une fois si 401 (token expiré)
  if (resp.status === 401) {
    invalidateToken();
    headers = await getAuthHeaders();
    opts.headers = headers;
    resp = await fetch(BASE_URL + endpoint, opts);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[legifrance]', endpoint, resp.status, errText.substring(0, 200));
    throw new Error('Légifrance API erreur ' + resp.status);
  }

  return resp.json();
}

// ================================================
// RECHERCHE dans les codes (Code civil, Code pénal, etc.)
// ================================================
async function searchCode(query, options = {}) {
  const body = {
    fond: 'CODE_DATE',
    recherche: {
      champs: [
        {
          typeChamp: 'ALL',
          criteres: [
            { typeRecherche: 'EXACTE', valeur: query, operateur: 'ET' }
          ],
          operateur: 'ET'
        }
      ],
      filtres: [],
      pageNumber: options.page || 1,
      pageSize: Math.min(options.pageSize || 10, 100)
    }
  };

  // Filtre par code spécifique si fourni
  if (options.codeId) {
    body.recherche.filtres.push({
      facette: 'TEXT_LEGAL_ID',
      valeurs: [options.codeId]
    });
  }

  return pisteCall('/search', body);
}

// ================================================
// CONSULTATION d'un article de code par son ID
// ================================================
async function getArticle(articleId) {
  return pisteCall('/consult/getArticle', { id: articleId });
}

// ================================================
// CONSULTATION d'un texte de loi par son ID
// ================================================
async function getTexte(texteId) {
  return pisteCall('/consult/jorf/id', { textCid: texteId });
}

// ================================================
// RECHERCHE jurisprudence judiciaire (Cour de cassation, cours d'appel)
// ================================================
async function searchJurisprudenceJudiciaire(query, options = {}) {
  const body = {
    fond: 'JURI',
    recherche: {
      champs: [
        {
          typeChamp: 'ALL',
          criteres: [
            { typeRecherche: 'EXACTE', valeur: query, operateur: 'ET' }
          ],
          operateur: 'ET'
        }
      ],
      filtres: [],
      pageNumber: options.page || 1,
      pageSize: Math.min(options.pageSize || 10, 100)
    }
  };

  if (options.dateDebut) {
    body.recherche.filtres.push({
      facette: 'DATE_DECISION',
      spiDateDebut: options.dateDebut
    });
  }
  if (options.dateFin) {
    body.recherche.filtres.push({
      facette: 'DATE_DECISION',
      spiDateFin: options.dateFin
    });
  }

  return pisteCall('/search', body);
}

// ================================================
// RECHERCHE jurisprudence administrative (Conseil d'État, CAA)
// ================================================
async function searchJurisprudenceAdmin(query, options = {}) {
  const body = {
    fond: 'CETAT',
    recherche: {
      champs: [
        {
          typeChamp: 'ALL',
          criteres: [
            { typeRecherche: 'EXACTE', valeur: query, operateur: 'ET' }
          ],
          operateur: 'ET'
        }
      ],
      filtres: [],
      pageNumber: options.page || 1,
      pageSize: Math.min(options.pageSize || 10, 100)
    }
  };

  return pisteCall('/search', body);
}

// ================================================
// CONSULTATION du Journal Officiel (derniers textes)
// ================================================
async function getJournalOfficiel(options = {}) {
  const body = {
    nbElement: options.limit || 20,
    pageNumber: options.page || 1
  };
  return pisteCall('/list/jorf/container', body);
}

// ================================================
// RECHERCHE textes législatifs et réglementaires (LODA)
// ================================================
async function searchLoda(query, options = {}) {
  const body = {
    fond: 'LODA_DATE',
    recherche: {
      champs: [
        {
          typeChamp: 'ALL',
          criteres: [
            { typeRecherche: 'EXACTE', valeur: query, operateur: 'ET' }
          ],
          operateur: 'ET'
        }
      ],
      filtres: [],
      pageNumber: options.page || 1,
      pageSize: Math.min(options.pageSize || 10, 100)
    }
  };

  return pisteCall('/search', body);
}

// ================================================
// LISTE des codes disponibles
// ================================================
async function listCodes() {
  return pisteCall('/list/code', {});
}

// ================================================
// TABLE DES MATIÈRES d'un code
// ================================================
async function getCodeTDM(codeId) {
  return pisteCall('/consult/code/tableMatieres', { textId: codeId });
}

module.exports = {
  searchCode,
  getArticle,
  getTexte,
  searchJurisprudenceJudiciaire,
  searchJurisprudenceAdmin,
  getJournalOfficiel,
  searchLoda,
  listCodes,
  getCodeTDM
};
