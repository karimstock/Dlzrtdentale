#!/usr/bin/env node
// =============================================
// JADOMI — Moteur de cross-matching produits
// "1 produit = 1 groupe = N revendeurs" : le VRAI comparatif.
//
// Étages de décision (calibrés le 7 juin 2026) :
//   1. Candidats   : voisins sémantiques (embeddings RAG, distance < 0.32, autre fournisseur)
//   2. Signature   : marque normalisée + tokens variants (n°, teintes, tailles, contenances)
//                    → tokens égaux + même marque = MATCH AUTO
//                    → tokens numériques différents = REJET AUTO (Olive n°21 ≠ n°23 !)
//   3. Zone grise  : verdict Qwen3.6 (matchProducts, JSON garanti) — budget limité par run
//   4. Écriture    : groupes → matched_product_id + match_confidence dans Supabase (REST)
//
// Usage : node scripts/match-products.js [--limit N] [--dry-run] [--no-llm]
// Log   : /tmp/match-products.log
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const store = require('../lib/rag/store');

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const LOG_FILE = '/tmp/match-products.log';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const NO_LLM = ARGS.includes('--no-llm');
const LIMIT = (() => { const i = ARGS.indexOf('--limit'); return i >= 0 ? parseInt(ARGS[i + 1]) : Infinity; })();
const LLM_BUDGET = 400; // verdicts Qwen max par run (~40 min de CPU)

// Seuils calibrés sur échantillons réels (voir session 7 juin 2026)
const DIST_CANDIDATE = 0.32; // au-delà : pas candidat
const DIST_AUTO = 0.28;      // en-deçà + signature égale : match auto
const KNN = 12;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Normalisation marque : "3M ESPE" ≈ "3M", "KOMET" ≈ "Komet" ──
function normBrand(b) {
  if (!b) return null;
  return String(b).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || null;
}

// ── Signature variants : tout ce qui différencie deux déclinaisons ──
// nombres (016, 4, 50, 21, 23...), teintes dentaires (A1-D4, OM3...), tailles (XS-XXXL)
function variantTokens(name) {
  const n = String(name || '').toUpperCase();
  const tokens = new Set();
  // Nombres avec ou sans décimales (et fractions type 7/8) — capture n°, ISO, contenances
  for (const m of n.matchAll(/\d+(?:[.,/]\d+)?/g)) tokens.add(m[0].replace(',', '.'));
  // Teintes dentaires (A1..D4, BL, OM1..)
  for (const m of n.matchAll(/\b([A-D][1-4](?:[.,]5)?|BL[1-4]?|OM[1-9])\b/g)) tokens.add(m[1]);
  // Tailles vêtements/gants
  for (const m of n.matchAll(/\b(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL)\b/g)) tokens.add('SZ:' + m[1]);
  return tokens;
}

function sameTokens(a, b) {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

// ── Comparaison des MOTS (calibration 7 juin : les nombres ne suffisent pas !) ──
// "Gradia 2.7ml CV" vs "Gradia 2.7ml BW" : mêmes nombres mais teintes différentes.
const STOPWORDS = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'POUR', 'ET', 'A', 'AU', 'AUX', 'EN', 'X', 'PAR', 'BOITE', 'BTE', 'BOIT', 'LOT', 'PACK', 'THE', 'OF', 'N', 'NO', 'REF']);
const COLORS = new Set(['NOIR', 'NOIRE', 'BLANC', 'BLANCHE', 'BLEU', 'BLEUE', 'ROUGE', 'VERT', 'VERTE', 'JAUNE', 'ROSE', 'VIOLET', 'VIOLETTE', 'ORANGE', 'GRIS', 'GRISE', 'CLAIR', 'CLAIRE', 'FONCE', 'FONCEE', 'CIEL', 'TRANSPARENT', 'FUCHSIA', 'FUSHIA', 'TURQUOISE', 'ASSORTIS', 'ASSORTI']);

function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Mots du nom, marque(s) retirées (y compris initiales : "Ortho Technology" → "OT")
function wordSet(name, brands) {
  let n = stripAccents(String(name || '').toUpperCase());
  const brandWords = new Set();
  for (const b of brands) {
    const words = stripAccents(String(b || '').toUpperCase()).split(/[^A-Z0-9]+/).filter(Boolean);
    words.forEach(w => brandWords.add(w));
    if (words.length >= 2) brandWords.add(words.map(w => w[0]).join('')); // initiales
  }
  return new Set(
    n.split(/[^A-Z0-9.,/]+/)
      .filter(w => w && !STOPWORDS.has(w) && !brandWords.has(w))
  );
}

// Différence symétrique des mots entre deux noms
function wordDiff(nameA, nameB, brands) {
  const a = wordSet(nameA, brands), b = wordSet(nameB, brands);
  const diff = [];
  for (const w of a) if (!b.has(w)) diff.push(w);
  for (const w of b) if (!a.has(w)) diff.push(w);
  return diff;
}

// Un mot en différence est-il un code variant (teinte CV/BW, quadrant LG/UG, forme abrégée) ?
function isVariantCode(w) {
  return /^[A-Z]{1,4}[0-9]{0,2}$/.test(w) || COLORS.has(w);
}

// Les tokens numériques diffèrent-ils ? (= variantes différentes, rejet sûr)
function numbersDiffer(a, b) {
  const numsA = [...a].filter(t => /^\d/.test(t)).sort().join('|');
  const numsB = [...b].filter(t => /^\d/.test(t)).sort().join('|');
  return numsA !== numsB;
}

// ── Union-Find pour construire les groupes ──
const parent = new Map();
function find(x) {
  if (!parent.has(x)) parent.set(x, x);
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r);
  while (parent.get(x) !== r) { const next = parent.get(x); parent.set(x, r); x = next; }
  return r;
}
function union(a, b) { parent.set(find(a), find(b)); }

// ── Écriture Supabase : PATCH groupé par matched_product_id ──
function patchGroup(sbIds, groupId, confidence) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/scraped_prices?id=in.(${sbIds.join(',')})`;
    const body = JSON.stringify({ matched_product_id: groupId, match_confidence: confidence });
    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      timeout: 30000,
    }, (res) => {
      res.resume();
      res.on('end', () => res.statusCode < 300 ? resolve() : reject(new Error(`PATCH HTTP ${res.statusCode}`)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const db = store.getDb();
  // Table locale des verdicts (cache : ne jamais re-juger une paire)
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_verdicts (
      pair_key TEXT PRIMARY KEY,   -- rowidA:rowidB (A<B)
      verdict TEXT,                -- auto_match | auto_reject | llm_match | llm_reject
      score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS product_groups (
      rowid_product INTEGER PRIMARY KEY,
      group_id TEXT,
      confidence REAL,
      method TEXT
    );
  `);
  const getVerdict = db.prepare('SELECT verdict FROM match_verdicts WHERE pair_key = ?');
  const setVerdict = db.prepare('INSERT OR IGNORE INTO match_verdicts (pair_key, verdict, score) VALUES (?, ?, ?)');

  const total = store.countProducts();
  log(`=== Matching démarré — ${total} produits indexés, limit=${LIMIT === Infinity ? '∞' : LIMIT}, dry=${DRY_RUN}, llm=${!NO_LLM} ===`);

  const products = db.prepare(`
    SELECT p.rowid, p.sb_id, p.product_name, p.brand, p.supplier_name
    FROM products p
    LEFT JOIN product_groups g ON g.rowid_product = p.rowid
    WHERE g.group_id IS NULL
    ORDER BY p.rowid
    ${LIMIT !== Infinity ? 'LIMIT ' + LIMIT : ''}
  `).all();

  const knnStmt = db.prepare(`
    SELECT p.rowid, p.product_name, p.brand, p.supplier_name, v.distance
    FROM vec_products v JOIN products p ON p.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ${KNN}
    ORDER BY v.distance
  `);
  const getVec = db.prepare('SELECT embedding FROM vec_products WHERE rowid = ?');

  let stats = { autoMatch: 0, autoReject: 0, llmMatch: 0, llmReject: 0, llmUsed: 0, processed: 0 };
  let llmQueue = [];

  for (const p of products) {
    stats.processed++;
    const vecRow = getVec.get(BigInt(p.rowid));
    if (!vecRow) continue;
    const pTokens = variantTokens(p.product_name);
    const pBrand = normBrand(p.brand);

    for (const h of knnStmt.all(vecRow.embedding)) {
      if (h.rowid === p.rowid || h.supplier_name === p.supplier_name) continue;
      if (h.distance > DIST_CANDIDATE) break;
      const key = p.rowid < h.rowid ? `${p.rowid}:${h.rowid}` : `${h.rowid}:${p.rowid}`;
      const cached = getVerdict.get(key);
      if (cached) {
        if (cached.verdict.endsWith('match')) union(p.rowid, h.rowid);
        continue;
      }
      const hTokens = variantTokens(h.product_name);
      const hBrand = normBrand(h.brand);

      // REJET SÛR : variantes numériques différentes (n°21 ≠ n°23, 4g ≠ 8g)
      if (numbersDiffer(pTokens, hTokens)) {
        setVerdict.run(key, 'auto_reject', h.distance);
        stats.autoReject++;
        continue;
      }
      const brandOk = pBrand && hBrand && (pBrand === hBrand || pBrand.startsWith(hBrand) || hBrand.startsWith(pBrand));
      const diff = wordDiff(p.product_name, h.product_name, [p.brand, h.brand]);

      // MATCH SÛR : même marque + mêmes nombres + AUCUN mot différent + distance courte
      if (brandOk && sameTokens(pTokens, hTokens) && diff.length === 0 && h.distance <= DIST_AUTO) {
        setVerdict.run(key, 'auto_match', h.distance);
        union(p.rowid, h.rowid);
        stats.autoMatch++;
        continue;
      }
      // REJET SÛR : la différence contient un code variant (teinte CV/BW, quadrant LG/UG,
      // couleur, forme) → déclinaisons différentes du même produit, PAS le même article
      if (diff.some(isVariantCode)) {
        setVerdict.run(key, 'auto_reject', h.distance);
        stats.autoReject++;
        continue;
      }
      // ZONE GRISE (mots longs différents = reformulation probable) → Qwen tranche
      if (!NO_LLM && stats.llmUsed < LLM_BUDGET) {
        llmQueue.push({ key, a: p, b: h });
        stats.llmUsed++;
      } else {
        stats.greySkipped = (stats.greySkipped || 0) + 1;
      }
    }
    if (stats.processed % 2000 === 0) {
      log(`${stats.processed}/${products.length} — autoMatch=${stats.autoMatch} autoReject=${stats.autoReject} llmQueue=${llmQueue.length}`);
    }
  }

  // ── Verdicts Qwen sur la zone grise ──
  if (llmQueue.length && !NO_LLM) {
    log(`Zone grise : ${llmQueue.length} paires → verdicts Qwen3.6...`);
    const { OLLAMA_TASKS } = require('../lib/ia-router');
    for (const item of llmQueue) {
      try {
        const raw = await OLLAMA_TASKS.matchProducts(
          `${item.a.product_name} (marque: ${item.a.brand || '?'}, fournisseur: ${item.a.supplier_name})`,
          `${item.b.product_name} (marque: ${item.b.brand || '?'}, fournisseur: ${item.b.supplier_name})`
        );
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (v.match && v.score >= 85) {
          setVerdict.run(item.key, 'llm_match', v.score / 100);
          union(item.a.rowid, item.b.rowid);
          stats.llmMatch++;
        } else {
          setVerdict.run(item.key, 'llm_reject', v.score / 100);
          stats.llmReject++;
        }
      } catch (e) {
        log(`ERREUR verdict Qwen (${item.key}) : ${e.message}`);
      }
    }
  }

  // ── Construction des groupes + écriture ──
  const groups = new Map(); // root → [rowids]
  for (const rowid of parent.keys()) {
    const root = find(rowid);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(rowid);
  }
  const realGroups = [...groups.values()].filter(g => g.length >= 2);
  log(`${realGroups.length} groupes multi-fournisseurs trouvés (${realGroups.reduce((s, g) => s + g.length, 0)} produits)`);

  const setGroup = db.prepare('INSERT OR REPLACE INTO product_groups (rowid_product, group_id, confidence, method) VALUES (?, ?, ?, ?)');
  const getSbIds = db.prepare('SELECT sb_id FROM products WHERE rowid = ?');
  let written = 0;
  for (const g of realGroups) {
    const groupId = crypto.randomUUID();
    const tx = db.transaction(() => {
      for (const r of g) setGroup.run(r, groupId, 0.9, 'auto');
    });
    tx();
    if (!DRY_RUN) {
      const sbIds = g.map(r => getSbIds.get(r)?.sb_id).filter(Boolean);
      try {
        await patchGroup(sbIds, groupId, 0.9);
        written++;
      } catch (e) {
        log(`ERREUR PATCH Supabase groupe ${groupId} : ${e.message}`);
      }
    }
  }

  log(`=== TERMINÉ : autoMatch=${stats.autoMatch} autoReject=${stats.autoReject} llmMatch=${stats.llmMatch} llmReject=${stats.llmReject} — ${realGroups.length} groupes, ${DRY_RUN ? 'DRY RUN (rien écrit)' : written + ' groupes écrits dans Supabase'} ===`);
  process.exit(0);
})().catch(e => { log(`FATAL : ${e.stack}`); process.exit(1); });
