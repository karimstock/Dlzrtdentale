#!/usr/bin/env node
// =============================================
// JADOMI — Cross-match PDF catalogues ↔ BDD existante
//
// 1. Charge les produits extraits des PDFs
// 2. Pour chaque ref, cherche dans scraped_prices (156K produits)
// 3. Compare les prix catalogue vs remisé
// 4. DeepSeek vérifie les matches incertains
//
// Usage:
//   node scripts/crossmatch-pdf-db.js              # Cross-match complet
//   node scripts/crossmatch-pdf-db.js --stats       # Stats seulement
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const PDF_DIR = '/tmp/pdf-products';
const RESULTS_FILE = '/tmp/jadomi-pdf-crossmatch.json';
const LOG_FILE = '/tmp/jadomi-pdf-crossmatch.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function supabaseSearch(ref) {
  return new Promise((resolve) => {
    const url = `${SUPABASE_URL}/rest/v1/scraped_prices?reference=ilike.*${encodeURIComponent(ref)}*&select=supplier_name,product_name,price,price_original,reference,brand&limit=10`;
    https.get(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats');

  log('=== CROSS-MATCH PDF ↔ BDD ===');

  // Charger tous les produits PDF
  if (!fs.existsSync(PDF_DIR)) { log('Pas de produits PDF. Lance scrape-pdf-catalogs.js d\'abord.'); return; }

  const allPdfProducts = [];
  const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.json'));

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(PDF_DIR, f), 'utf8'));
    allPdfProducts.push(...data);
    log(`  ${f}: ${data.length} produits`);
  }

  log(`\nTotal PDF: ${allPdfProducts.length} produits`);

  // Stats refs
  const withRef = allPdfProducts.filter(p => p.ref && p.ref.length > 2);
  const withPrice = allPdfProducts.filter(p => p.price > 0);
  log(`  Avec ref: ${withRef.length} (${Math.round(withRef.length / allPdfProducts.length * 100)}%)`);
  log(`  Avec prix: ${withPrice.length} (${Math.round(withPrice.length / allPdfProducts.length * 100)}%)`);

  if (statsOnly) return;

  // Cross-match par ref
  log('\n--- Cross-match par référence ---');
  const matches = [];
  const noMatch = [];
  let searched = 0;

  // Prendre les refs uniques
  const uniqueRefs = [...new Set(withRef.map(p => p.ref))];
  log(`${uniqueRefs.length} refs uniques à chercher dans la BDD`);

  for (const ref of uniqueRefs) {
    const dbResults = await supabaseSearch(ref);
    searched++;

    if (dbResults.length > 0) {
      const pdfProduct = withRef.find(p => p.ref === ref);
      matches.push({
        ref,
        pdf: {
          name: pdfProduct.name,
          price: pdfProduct.price,
          brand: pdfProduct.brand,
          supplier: pdfProduct.supplier,
        },
        db: dbResults.map(r => ({
          supplier: r.supplier_name,
          name: r.product_name,
          price: r.price,
          price_original: r.price_original,
        })),
        priceDiff: dbResults[0].price && pdfProduct.price
          ? Math.round((1 - dbResults[0].price / pdfProduct.price) * 100)
          : null,
      });
    } else {
      noMatch.push(ref);
    }

    if (searched % 50 === 0) {
      log(`  ${searched}/${uniqueRefs.length} refs cherchées — ${matches.length} matches`);
    }

    // Petit délai pour pas surcharger Supabase
    if (searched % 20 === 0) await new Promise(r => setTimeout(r, 500));
  }

  log(`\n=== RÉSULTATS ===`);
  log(`Refs cherchées: ${searched}`);
  log(`Matches trouvés: ${matches.length} (${Math.round(matches.length / searched * 100)}%)`);
  log(`Sans match: ${noMatch.length}`);

  // Top 10 plus gros écarts de prix
  const withDiff = matches.filter(m => m.priceDiff !== null && m.priceDiff !== 0)
    .sort((a, b) => Math.abs(b.priceDiff) - Math.abs(a.priceDiff));

  log('\n--- TOP 10 ÉCARTS DE PRIX (catalogue PDF vs BDD) ---');
  withDiff.slice(0, 10).forEach(m => {
    log(`  Réf ${m.ref}: ${m.pdf.name?.substring(0, 40)}`);
    log(`    PDF (${m.pdf.supplier}): ${m.pdf.price}€`);
    m.db.forEach(d => log(`    BDD (${d.supplier}): ${d.price}€ ${d.price_original ? '(catalogue: ' + d.price_original + '€)' : ''}`));
    log(`    Écart: ${m.priceDiff}%`);
  });

  // Sauvegarder
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({
    date: new Date().toISOString(),
    totalPdf: allPdfProducts.length,
    totalRefs: uniqueRefs.length,
    matches: matches.length,
    noMatch: noMatch.length,
    topDiffs: withDiff.slice(0, 100),
    allMatches: matches,
  }, null, 2));

  log(`\nRésultats sauvés dans ${RESULTS_FILE}`);
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
