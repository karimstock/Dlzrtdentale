// =============================================
// JADOMI LABO — API Entreprises DINUM
// Recherche cabinets dentaires (NAF 86.23Z)
// =============================================

const https = require('https');

const BASE_URL = 'https://recherche-entreprises.api.gouv.fr/search';
const NAF_DENTAIRE = '86.23Z';

function rechercherCabinet(query, options = {}) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      q: query,
      activite_principale: NAF_DENTAIRE,
      per_page: String(options.per_page || 10)
    });

    const url = `${BASE_URL}?${params.toString()}`;

    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const resultats = (json.results || []).map(r => {
            const siege = r.siege || {};
            return {
              raison_sociale: r.nom_complet || r.nom_raison_sociale || '',
              siren: r.siren || '',
              siret: siege.siret || '',
              adresse_ligne1: siege.adresse || '',
              code_postal: siege.code_postal || '',
              ville: siege.libelle_commune || '',
              dirigeants: (r.dirigeants || []).map(d =>
                `${d.prenoms || ''} ${d.nom || ''}`.trim()
              ).filter(Boolean),
              date_creation: r.date_creation || null,
              tranche_effectifs: r.tranche_effectif_salarie || null
            };
          });
          resolve({ total: json.total_results || 0, resultats });
        } catch (e) {
          reject(new Error('Erreur parsing API entreprises: ' + e.message));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { rechercherCabinet };
