#!/usr/bin/env node
// =============================================
// JADOMI — SCRAPE IA PIPELINE
//
// Orchestrateur principal : fetch brut → analyse IA → import BDD → cross-match
//
// Architecture :
//   1. Scraper brut → stocke HTML dans /tmp/scrape-raw/{site}/
//   2. Analyseur IA (Gemini Flash gratuit → Ollama fallback) → JSON structuré
//   3. Import → Supabase scraped_prices
//   4. Cross-match IA → grouper les mêmes produits entre fournisseurs
//
// Usage :
//   node scripts/scrape-ia-pipeline.js --fetch dgd          # Étape 1 : fetch brut
//   node scripts/scrape-ia-pipeline.js --analyze dgd        # Étape 2 : analyser avec IA
//   node scripts/scrape-ia-pipeline.js --import dgd         # Étape 3 : importer en BDD
//   node scripts/scrape-ia-pipeline.js --crossmatch         # Étape 4 : cross-match
//   node scripts/scrape-ia-pipeline.js --full dgd           # Tout d'un coup
//   node scripts/scrape-ia-pipeline.js --test dgd           # Test sur 1 page
//   node scripts/scrape-ia-pipeline.js --status             # État des données
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { fetchSupplier, fetchSinglePage, listRawFiles, SUPPLIERS } = require('../lib/scrape-ia/raw-fetcher');
const { analyzeProducts } = require('../lib/scrape-ia/analyzer');
const { crossMatchAll } = require('../lib/scrape-ia/cross-matcher');

const ANALYZED_DIR = '/tmp/scrape-analyzed';
const LOG_FILE = '/tmp/scrape-ia-pipeline.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// IMPORT VERS SUPABASE
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function importToSupabase(products) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log('  Supabase non configuré, skip import');
    return { inserted: 0 };
  }

  const https = require('https');
  let inserted = 0;
  const batchSize = 50;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map(p => ({
      supplier: p.supplier,
      product_name: p.name,
      price: p.price,
      price_original: p.price_original,
      reference: p.ref,
      brand: p.brand,
      category: p.category,
      url: p.source_url,
      image_url: p.image_url,
      packaging: p.packaging,
      scraped_at: new Date().toISOString(),
      source: 'ia-pipeline',
    }));

    try {
      const result = await new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/scraped_prices`);
        const payload = JSON.stringify(batch);
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + '?on_conflict=supplier,reference',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'resolution=merge-duplicates',
          },
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end(payload);
      });

      if (result.status < 300) {
        inserted += batch.length;
      } else {
        log(`  Import batch erreur HTTP ${result.status}: ${result.body.substring(0, 200)}`);
      }
    } catch (err) {
      log(`  Import erreur: ${err.message}`);
    }
  }

  return { inserted };
}

// =============================================
// COMMANDES
// =============================================

async function cmdFetch(supplierId, options = {}) {
  log(`\n========== FETCH BRUT: ${supplierId} ==========`);
  const results = await fetchSupplier(supplierId, options);
  log(`Fetch terminé: ${results.length} pages récupérées`);
  return results;
}

async function cmdAnalyze(supplierId) {
  log(`\n========== ANALYSE IA: ${supplierId} ==========`);
  const rawFiles = listRawFiles(supplierId);
  if (rawFiles.length === 0) {
    log('Aucun fichier brut trouvé. Lancez --fetch d\'abord.');
    return [];
  }

  const config = SUPPLIERS[supplierId];
  const allProducts = [];

  if (!fs.existsSync(ANALYZED_DIR)) fs.mkdirSync(ANALYZED_DIR, { recursive: true });

  // Fichier de progression
  const progressFile = path.join(ANALYZED_DIR, `${supplierId}-progress.json`);
  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch {}

  for (let i = 0; i < rawFiles.length; i++) {
    const file = rawFiles[i];
    const basename = path.basename(file);

    // Skip si déjà analysé
    if (progress[basename]) {
      log(`  [${i + 1}/${rawFiles.length}] ${basename} — déjà analysé (${progress[basename]} produits)`);
      // Charger les résultats existants
      const existingFile = path.join(ANALYZED_DIR, supplierId, basename.replace('.html', '.json'));
      if (fs.existsSync(existingFile)) {
        try {
          const existing = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
          allProducts.push(...existing);
        } catch {}
      }
      continue;
    }

    log(`  [${i + 1}/${rawFiles.length}] Analyse ${basename}...`);
    const html = fs.readFileSync(file, 'utf8');

    // Extraire l'URL d'origine si possible (dans le HTML ou le nom du fichier)
    const urlMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
    const pageUrl = urlMatch ? urlMatch[1] : `${config?.baseUrl || 'https://unknown'}/${basename}`;

    const products = await analyzeProducts(html, config?.name || supplierId, pageUrl);
    log(`    → ${products.length} produits extraits`);

    // Sauvegarder les résultats
    const outDir = path.join(ANALYZED_DIR, supplierId);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, basename.replace('.html', '.json'));
    fs.writeFileSync(outFile, JSON.stringify(products, null, 2));

    allProducts.push(...products);

    // Mettre à jour la progression
    progress[basename] = products.length;
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  }

  // Sauvegarder tous les produits
  const allFile = path.join(ANALYZED_DIR, `${supplierId}-all.json`);
  fs.writeFileSync(allFile, JSON.stringify(allProducts, null, 2));

  log(`\nAnalyse terminée: ${allProducts.length} produits extraits de ${rawFiles.length} pages`);
  return allProducts;
}

async function cmdImport(supplierId) {
  log(`\n========== IMPORT BDD: ${supplierId} ==========`);
  const allFile = path.join(ANALYZED_DIR, `${supplierId}-all.json`);
  if (!fs.existsSync(allFile)) {
    log('Aucun fichier analysé trouvé. Lancez --analyze d\'abord.');
    return;
  }

  const products = JSON.parse(fs.readFileSync(allFile, 'utf8'));
  log(`${products.length} produits à importer...`);

  const { inserted } = await importToSupabase(products);
  log(`Import terminé: ${inserted} produits insérés/mis à jour`);
}

async function cmdCrossMatch() {
  log(`\n========== CROSS-MATCH IA ==========`);

  // Charger tous les produits analysés
  const allProducts = {};
  if (!fs.existsSync(ANALYZED_DIR)) {
    log('Aucun produit analysé. Lancez --analyze d\'abord.');
    return;
  }

  const files = fs.readdirSync(ANALYZED_DIR).filter(f => f.endsWith('-all.json'));
  for (const f of files) {
    const supplierId = f.replace('-all.json', '');
    const products = JSON.parse(fs.readFileSync(path.join(ANALYZED_DIR, f), 'utf8'));
    if (products.length > 0) {
      allProducts[supplierId] = products;
      log(`  ${supplierId}: ${products.length} produits`);
    }
  }

  if (Object.keys(allProducts).length < 2) {
    log('Il faut au moins 2 fournisseurs analysés pour le cross-match.');
    return;
  }

  const matches = await crossMatchAll(allProducts, { maxIaCalls: 200 });
  log('Cross-match terminé!');
  return matches;
}

async function cmdTest(supplierId) {
  log(`\n========== TEST: ${supplierId} (1 page) ==========`);
  const config = SUPPLIERS[supplierId];
  if (!config) {
    log(`Fournisseur inconnu: ${supplierId}. Disponibles: ${Object.keys(SUPPLIERS).join(', ')}`);
    return;
  }

  // Fetch 1 seule page
  let testUrl;
  if (config.type === 'categories') {
    const firstCat = Object.values(config.categories)[0];
    testUrl = config.baseUrl + firstCat;
  } else if (config.type === 'search_api') {
    testUrl = config.searchUrl + 'composite';
  } else {
    testUrl = config.baseUrl;
  }

  log(`Fetch: ${testUrl}`);
  const result = await fetchSinglePage(testUrl, config.name);
  if (!result) {
    log('Fetch échoué!');
    return;
  }
  log(`HTML: ${result.body.length} bytes`);

  // Analyser
  log('Analyse IA...');
  const products = await analyzeProducts(result.body, config.name, testUrl);
  log(`\n=== RÉSULTAT: ${products.length} produits ===`);

  for (const p of products.slice(0, 10)) {
    log(`  ${p.brand ? '[' + p.brand + '] ' : ''}${p.name}`);
    log(`    Prix: ${p.price}€${p.price_original ? ' (barré: ' + p.price_original + '€)' : ''} | Réf: ${p.ref || '-'}`);
    log(`    Conditionnement: ${p.packaging || '-'} | Image: ${p.image_url ? 'oui' : 'non'}`);
  }
  if (products.length > 10) log(`  ... et ${products.length - 10} autres`);

  return products;
}

async function cmdStatus() {
  log('\n========== STATUS SCRAPE IA ==========');

  // Fichiers bruts
  log('\n--- Fichiers bruts (/tmp/scrape-raw/) ---');
  const rawDir = '/tmp/scrape-raw';
  if (fs.existsSync(rawDir)) {
    for (const dir of fs.readdirSync(rawDir)) {
      const files = fs.readdirSync(path.join(rawDir, dir)).filter(f => f.endsWith('.html'));
      log(`  ${dir}: ${files.length} pages`);
    }
  } else {
    log('  (vide)');
  }

  // Fichiers analysés
  log('\n--- Produits analysés (/tmp/scrape-analyzed/) ---');
  if (fs.existsSync(ANALYZED_DIR)) {
    const files = fs.readdirSync(ANALYZED_DIR).filter(f => f.endsWith('-all.json'));
    for (const f of files) {
      const products = JSON.parse(fs.readFileSync(path.join(ANALYZED_DIR, f), 'utf8'));
      const withPrice = products.filter(p => p.price > 0);
      const withRef = products.filter(p => p.ref);
      const withImage = products.filter(p => p.image_url);
      log(`  ${f.replace('-all.json', '')}: ${products.length} produits (${withPrice.length} avec prix, ${withRef.length} avec ref, ${withImage.length} avec image)`);
    }
  } else {
    log('  (vide)');
  }

  // Cross-match
  const cmFile = '/tmp/scrape-ia-crossmatch-results.json';
  if (fs.existsSync(cmFile)) {
    log('\n--- Cross-match ---');
    const results = JSON.parse(fs.readFileSync(cmFile, 'utf8'));
    for (const [key, data] of Object.entries(results)) {
      log(`  ${key}: ${data.matches} matches (${data.totalA} x ${data.totalB})`);
    }
  }

  // Config IA
  log('\n--- Config IA ---');
  log(`  Gemini API Key: ${process.env.GEMINI_API_KEY ? 'configurée' : 'MANQUANTE'}`);
  log(`  DeepSeek API Key: ${process.env.DEEPSEEK_API_KEY ? 'configurée' : 'MANQUANTE — ajouter DEEPSEEK_API_KEY dans .env'}`);
  log(`  Mistral API Key: ${process.env.MISTRAL_API_KEY ? 'configurée' : 'MANQUANTE'}`);
  log(`  Ollama: ${await checkOllama() ? 'disponible' : 'indisponible'}`);
  log(`  Cascade: Gemini (gratuit) → DeepSeek (0.27$/M) → Mistral (0.13€/M) → Ollama (local)`);
  log(`  Fournisseurs configurés: ${Object.keys(SUPPLIERS).join(', ')}`);
}

async function checkOllama() {
  return new Promise(resolve => {
    const req = require('http').get('http://127.0.0.1:11434/api/version', { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// =============================================
// CLI
// =============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args.find(a => a.startsWith('--'))?.replace('--', '');
  const supplier = args.find(a => !a.startsWith('--'));

  if (!command) {
    console.log(`
JADOMI Scrape IA Pipeline
========================

Usage:
  node scripts/scrape-ia-pipeline.js --test <fournisseur>      Test sur 1 page
  node scripts/scrape-ia-pipeline.js --fetch <fournisseur>     Fetch HTML brut
  node scripts/scrape-ia-pipeline.js --analyze <fournisseur>   Analyser avec IA
  node scripts/scrape-ia-pipeline.js --import <fournisseur>    Importer en BDD
  node scripts/scrape-ia-pipeline.js --crossmatch              Cross-match tous
  node scripts/scrape-ia-pipeline.js --full <fournisseur>      Pipeline complet
  node scripts/scrape-ia-pipeline.js --status                  État des données

Fournisseurs: ${Object.keys(SUPPLIERS).join(', ')}

Architecture:
  Scraper brut (HTTP) → IA Gemini Flash gratuit → JSON → Supabase
  Pas de sélecteurs CSS hardcodés. L'IA comprend le HTML.
`);
    return;
  }

  const start = Date.now();

  switch (command) {
    case 'test':
      if (!supplier) { console.log('Fournisseur requis. Ex: --test dgd'); return; }
      await cmdTest(supplier);
      break;

    case 'fetch':
      if (!supplier) { console.log('Fournisseur requis.'); return; }
      await cmdFetch(supplier);
      break;

    case 'analyze':
      if (!supplier) { console.log('Fournisseur requis.'); return; }
      await cmdAnalyze(supplier);
      break;

    case 'import':
      if (!supplier) { console.log('Fournisseur requis.'); return; }
      await cmdImport(supplier);
      break;

    case 'crossmatch':
      await cmdCrossMatch();
      break;

    case 'full':
      if (!supplier) { console.log('Fournisseur requis.'); return; }
      await cmdFetch(supplier);
      await cmdAnalyze(supplier);
      await cmdImport(supplier);
      log('\nPipeline complet terminé!');
      break;

    case 'status':
      await cmdStatus();
      break;

    default:
      console.log(`Commande inconnue: --${command}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`\nDurée totale: ${elapsed}s`);
}

main().catch(err => {
  console.error('ERREUR PIPELINE:', err);
  process.exit(1);
});
