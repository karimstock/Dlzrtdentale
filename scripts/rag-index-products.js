#!/usr/bin/env node
// =============================================
// JADOMI RAG — Indexation du catalogue comparateur
// Lit scraped_prices (Supabase) page par page, embedde en local
// (nomic-embed-text) et stocke dans data/rag/products.db.
// RESUMABLE : reprend après le dernier id traité (meta.last_sb_id).
//
// Usage : node scripts/rag-index-products.js
// Log   : /tmp/rag-index.log
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const fs = require('fs');
const { embed } = require('../lib/rag/embedder');
const store = require('../lib/rag/store');

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const PAGE_SIZE = 512;   // lignes Supabase par page
const EMBED_BATCH = 64;  // textes par appel Ollama
const LOG_FILE = '/tmp/rag-index.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function fetchPage(afterId) {
  const filter = afterId ? `&id=gt.${afterId}` : '';
  const url = `${SUPABASE_URL}/rest/v1/scraped_prices?select=id,product_name,brand,category,supplier_name,reference,price_ttc,url&order=id.asc&limit=${PAGE_SIZE}${filter}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, timeout: 60000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Texte embeddé : nom + marque + catégorie (le prix change, on ne l'embedde pas)
function toEmbedText(p) {
  let t = p.product_name || '';
  if (p.brand) t += ` | marque ${p.brand}`;
  if (p.category) t += ` | catégorie ${p.category}`;
  return t;
}

(async () => {
  log(`=== Indexation RAG démarrée — déjà en base : ${store.countProducts()} produits ===`);
  let afterId = store.getMeta('last_sb_id');
  if (afterId) log(`Reprise après id ${afterId}`);
  let total = store.countProducts();
  const t0 = Date.now();

  while (true) {
    let rows;
    try {
      rows = await fetchPage(afterId);
    } catch (e) {
      log(`ERREUR fetch (retry 10s) : ${e.message}`);
      await new Promise(r => setTimeout(r, 10000));
      continue;
    }
    if (!rows.length) break;

    // Embeddings par sous-lots
    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      const chunk = rows.slice(i, i + EMBED_BATCH);
      let vecs;
      try {
        vecs = await embed(chunk.map(toEmbedText), 'document');
      } catch (e) {
        log(`ERREUR embed (retry 5s) : ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
        i -= EMBED_BATCH; // rejouer ce sous-lot
        continue;
      }
      store.insertBatch(chunk.map(p => ({
        sb_id: p.id,
        product_name: p.product_name || '',
        brand: p.brand || null,
        category: p.category || null,
        supplier_name: p.supplier_name || null,
        reference: p.reference || null,
        price_ttc: p.price_ttc != null ? p.price_ttc : null,
        url: p.url || null,
      })), vecs);
    }

    afterId = rows[rows.length - 1].id;
    store.setMeta('last_sb_id', afterId);
    store.setMeta('last_run_at', new Date().toISOString());
    total = store.countProducts();

    const rate = total / ((Date.now() - t0) / 1000);
    if (total % 5120 < PAGE_SIZE) {
      log(`${total} produits indexés (${rate.toFixed(0)}/s)`);
    }
  }

  log(`=== TERMINÉ : ${store.countProducts()} produits indexés en ${((Date.now() - t0) / 60000).toFixed(1)} min ===`);
  process.exit(0);
})().catch(e => { log(`FATAL : ${e.stack}`); process.exit(1); });
