// =============================================
// JADOMI RAG — Embedder (nomic-embed-text via Ollama)
// 100% local : aucune donnée ne quitte le serveur.
// nomic-embed-text exige des préfixes de tâche :
//   - "search_document: " pour les documents indexés
//   - "search_query: "    pour les requêtes de recherche
// =============================================
const http = require('http');

const OLLAMA_URL = 'http://127.0.0.1:11434';
const EMBED_MODEL = 'nomic-embed-text';
const DIMS = 768;

/**
 * Embedde un lot de textes (max ~64 par appel pour rester fluide).
 * @param {string[]} texts - textes BRUTS (le préfixe est ajouté ici)
 * @param {'document'|'query'} kind
 * @returns {Promise<Float32Array[]>}
 */
function embed(texts, kind = 'document') {
  const prefix = kind === 'query' ? 'search_query: ' : 'search_document: ';
  const input = texts.map(t => prefix + String(t).slice(0, 2000));

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: EMBED_MODEL, input });
    const req = http.request(OLLAMA_URL + '/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.embeddings) return reject(new Error('Pas d\'embeddings dans la réponse : ' + data.slice(0, 200)));
          resolve(json.embeddings.map(e => Float32Array.from(e)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout embedding Ollama')); });
    req.write(body);
    req.end();
  });
}

/** Embedde une requête de recherche unique. */
async function embedQuery(text) {
  const [v] = await embed([text], 'query');
  return v;
}

module.exports = { embed, embedQuery, DIMS, EMBED_MODEL };
