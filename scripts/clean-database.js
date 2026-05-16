#!/usr/bin/env node
// =============================================
// JADOMI — Nettoyage BDD 156K produits
//
// Phase 1 : Cross-match local (gratuit, brand + tokens)
// Phase 2 : DeepSeek normalise les noms + confirme les matches incertains
// Phase 3 : Stats et rapport
//
// Usage:
//   node scripts/clean-database.js --stats        État de la base
//   node scripts/clean-database.js --crossmatch   Cross-match local
//   node scripts/clean-database.js --normalize     DeepSeek normalise par batch
//   node scripts/clean-database.js --fix-prices    Corriger les prix Venta
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const RESULTS_FILE = '/tmp/jadomi-crossmatch-results.json';
const LOG_FILE = '/tmp/jadomi-clean-database.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// SUPABASE HELPERS
// =============================================

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + path);
    https.get(url.toString(), {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const count = res.headers['content-range']?.split('/')[1];
          resolve({ data: JSON.parse(data), count: parseInt(count) || 0 });
        } catch { resolve({ data: [], count: 0 }); }
      });
    }).on('error', reject);
  });
}

// =============================================
// PHASE 1 : STATS
// =============================================

async function cmdStats() {
  log('\n========== STATS BASE DE DONNÉES ==========');

  // Compter par fournisseur
  const suppliers = ['gacd', 'megadental', 'doctorai', 'doctorstrong', 'dentalclick',
    'dentalpromotion', 'dentalgooddeal', 'henryschein', 'b2b-dental', 'DentalClick'];

  const counts = {};
  let total = 0;
  for (const s of suppliers) {
    const { count } = await supabaseGet(`scraped_prices?supplier_name=eq.${s}&select=id&limit=1`);
    if (count > 0) { counts[s] = count; total += count; }
  }

  log('\nProduits par fournisseur:');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) =>
    log(`  ${s.padEnd(22)} ${c.toLocaleString()}`));
  log(`  ${'─'.repeat(35)}`);
  log(`  ${'TOTAL'.padEnd(22)} ${total.toLocaleString()}`);

  // Échantillon pour vérifier la qualité
  const { data: sample } = await supabaseGet('scraped_prices?select=supplier_name,product_name,brand,price,price_original,reference&limit=20&order=created_at.desc');
  log('\n--- Derniers 5 produits ajoutés ---');
  sample.slice(0, 5).forEach(p => {
    log(`  [${p.supplier_name}] ${p.product_name}`);
    log(`    Prix: ${p.price}€ ${p.price_original && p.price_original !== p.price ? '(catalogue: ' + p.price_original + '€)' : ''} | Réf: ${p.reference || '-'} | Marque: ${p.brand || '-'}`);
  });

  // Compter les produits sans prix, sans marque, sans ref
  const { count: noPrice } = await supabaseGet('scraped_prices?price=is.null&select=id&limit=1');
  const { count: noBrand } = await supabaseGet('scraped_prices?brand=is.null&select=id&limit=1');
  const { count: noRef } = await supabaseGet('scraped_prices?reference=is.null&select=id&limit=1');

  log('\n--- Qualité ---');
  log(`  Sans prix:     ${noPrice.toLocaleString()} (${Math.round(noPrice / total * 100)}%)`);
  log(`  Sans marque:   ${noBrand.toLocaleString()} (${Math.round(noBrand / total * 100)}%)`);
  log(`  Sans ref:      ${noRef.toLocaleString()} (${Math.round(noRef / total * 100)}%)`);
  log(`  Avec match:    ${0} (cross-matching pas encore fait)`);
}

// =============================================
// PHASE 2 : CROSS-MATCH LOCAL (gratuit)
// =============================================

function normalize(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(de|du|des|le|la|les|un|une|pour|avec|et|en|par|lot|boite|bte|pcs|pce|pieces?|coffret|kit|pack|x\d+)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(name) {
  return normalize(name).split(' ').filter(t => t.length >= 2);
}

async function cmdCrossmatch() {
  log('\n========== CROSS-MATCH LOCAL ==========');

  // Charger les produits par lots (Supabase limite à 1000)
  const allProducts = [];
  const suppliers = ['gacd', 'doctorstrong', 'doctorai', 'megadental', 'dentalpromotion', 'dentalgooddeal'];

  for (const s of suppliers) {
    log(`  Chargement ${s}...`);
    let offset = 0;
    while (true) {
      const { data } = await supabaseGet(
        `scraped_prices?supplier_name=eq.${s}&select=id,product_name,brand,reference,price&limit=1000&offset=${offset}&order=id`
      );
      if (!data || data.length === 0) break;
      data.forEach(p => allProducts.push({ ...p, supplier: s }));
      offset += data.length;
      if (data.length < 1000) break;
      if (offset >= 5000) break; // Limiter à 5K par fournisseur pour le premier test
    }
    log(`    → ${allProducts.filter(p => p.supplier === s).length} produits chargés`);
  }

  log(`\n  Total chargé: ${allProducts.length} produits de ${suppliers.length} fournisseurs`);

  // Index par marque normalisée
  const byBrand = {};
  allProducts.forEach(p => {
    const brand = normalize(p.brand || '').substring(0, 30) || 'unknown';
    if (!byBrand[brand]) byBrand[brand] = [];
    byBrand[brand].push(p);
  });

  log(`  ${Object.keys(byBrand).length} marques distinctes`);

  // Cross-match par marque + tokens
  let matches = 0;
  let exactRef = 0;
  const matchPairs = [];

  for (const [brand, products] of Object.entries(byBrand)) {
    if (products.length < 2) continue;

    // Grouper par fournisseur
    const bySupplier = {};
    products.forEach(p => {
      if (!bySupplier[p.supplier]) bySupplier[p.supplier] = [];
      bySupplier[p.supplier].push(p);
    });

    const supplierKeys = Object.keys(bySupplier);
    if (supplierKeys.length < 2) continue; // Même marque mais 1 seul fournisseur

    // Comparer chaque paire de fournisseurs
    for (let i = 0; i < supplierKeys.length; i++) {
      for (let j = i + 1; j < supplierKeys.length; j++) {
        const listA = bySupplier[supplierKeys[i]];
        const listB = bySupplier[supplierKeys[j]];

        for (const a of listA) {
          for (const b of listB) {
            // Match par référence exacte
            if (a.reference && b.reference && a.reference === b.reference) {
              matchPairs.push({ a, b, method: 'ref_exact', confidence: 0.95 });
              exactRef++;
              matches++;
              continue;
            }

            // Match par tokens nom (Jaccard > 0.6)
            const tokA = tokenize(a.product_name);
            const tokB = tokenize(b.product_name);
            if (tokA.length < 2 || tokB.length < 2) continue;
            const common = tokA.filter(t => tokB.includes(t));
            const jaccard = common.length / new Set([...tokA, ...tokB]).size;
            if (jaccard >= 0.6) {
              matchPairs.push({ a, b, method: 'name_tokens', confidence: jaccard });
              matches++;
            }
          }
        }
      }
    }
  }

  log(`\n  === RÉSULTATS CROSS-MATCH LOCAL ===`);
  log(`  Matches trouvés: ${matches}`);
  log(`  - Par ref exacte: ${exactRef}`);
  log(`  - Par tokens nom: ${matches - exactRef}`);

  // Top 10 matches
  log(`\n  --- Exemples de matches ---`);
  matchPairs.sort((a, b) => b.confidence - a.confidence);
  matchPairs.slice(0, 10).forEach(m => {
    log(`  [${m.method} ${Math.round(m.confidence * 100)}%]`);
    log(`    A: [${m.a.supplier}] ${m.a.product_name} → ${m.a.price}€`);
    log(`    B: [${m.b.supplier}] ${m.b.product_name} → ${m.b.price}€`);
    if (m.a.price && m.b.price) {
      const diff = Math.abs(m.a.price - m.b.price);
      const pct = Math.round(diff / Math.max(m.a.price, m.b.price) * 100);
      log(`    Δ prix: ${diff.toFixed(2)}€ (${pct}%)`);
    }
  });

  // Sauvegarder
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({
    date: new Date().toISOString(),
    totalProducts: allProducts.length,
    totalMatches: matches,
    exactRefMatches: exactRef,
    tokenMatches: matches - exactRef,
    pairs: matchPairs.slice(0, 1000).map(m => ({
      supplierA: m.a.supplier, nameA: m.a.product_name, priceA: m.a.price, refA: m.a.reference,
      supplierB: m.b.supplier, nameB: m.b.product_name, priceB: m.b.price, refB: m.b.reference,
      method: m.method, confidence: m.confidence,
    })),
  }, null, 2));
  log(`\n  Résultats sauvés dans ${RESULTS_FILE}`);
}

// =============================================
// PHASE 3 : DEEPSEEK NORMALISE PAR BATCH
// =============================================

async function callDeepSeek(prompt, content) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: content },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

async function cmdNormalize() {
  log('\n========== NORMALISATION DEEPSEEK ==========');

  // Charger un échantillon pour tester
  const { data: sample } = await supabaseGet(
    'scraped_prices?select=id,supplier_name,product_name,brand,reference,price&limit=50&order=created_at.desc'
  );

  if (!sample || sample.length === 0) { log('Aucun produit en base'); return; }

  // Batch de 20 produits → 1 appel DeepSeek
  const batch = sample.slice(0, 20);
  const content = batch.map((p, i) =>
    `${i + 1}. [${p.supplier_name}] ${p.product_name} | Marque: ${p.brand || '?'} | Réf: ${p.reference || '?'} | Prix: ${p.price}€`
  ).join('\n');

  const prompt = `Tu es un expert en produits dentaires. Pour chaque produit, normalise le nom et identifie :
- Le nom normalisé standard (sans le fournisseur, sans les variantes marketing)
- La marque correcte
- Le type de produit (consommable, instrument, équipement, matériau)

Retourne un JSON : {"products": [{"index": 1, "normalized_name": "...", "brand": "...", "type": "..."}]}`;

  log(`  Envoi de ${batch.length} produits à DeepSeek...`);
  const response = await callDeepSeek(prompt, content);

  if (!response) { log('  DeepSeek indisponible'); return; }

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      log(`  ${(result.products || []).length} produits normalisés`);
      (result.products || []).slice(0, 5).forEach(p => {
        const original = batch[p.index - 1];
        log(`  #${p.index} ${original?.product_name?.substring(0, 40)}`);
        log(`    → ${p.normalized_name} [${p.brand}] (${p.type})`);
      });
    }
  } catch (e) {
    log(`  Erreur parsing: ${e.message}`);
    log(`  Réponse brute: ${response.substring(0, 200)}`);
  }
}

// =============================================
// CLI
// =============================================

async function main() {
  const cmd = process.argv[2]?.replace('--', '');

  if (!cmd) {
    console.log(`
JADOMI — Nettoyage base de données (156K produits)

Usage:
  node scripts/clean-database.js --stats        État de la base
  node scripts/clean-database.js --crossmatch   Cross-match local (gratuit)
  node scripts/clean-database.js --normalize     DeepSeek normalise (test 20 produits)
`);
    return;
  }

  const start = Date.now();
  switch (cmd) {
    case 'stats': await cmdStats(); break;
    case 'crossmatch': await cmdCrossmatch(); break;
    case 'normalize': await cmdNormalize(); break;
    default: console.log('Commande inconnue: ' + cmd);
  }

  log(`\nDurée: ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
