#!/usr/bin/env node
// =============================================
// JADOMI — PDF Scraper PRO (page par page + OCR vision)
//
// Stratégie :
//   1. pdf-parse extrait le texte page par page
//   2. Pages avec texte riche → DeepSeek texte (pas cher)
//   3. Pages avec peu de texte → pdftoppm → image → DeepSeek Vision
//   4. Déduplique par ref
//
// Usage :
//   node scripts/scrape-pdf-pro.js --file=path.pdf
//   node scripts/scrape-pdf-pro.js --file=path.pdf --test    (10 pages)
//   nohup node scripts/scrape-pdf-pro.js --file=path.pdf &
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const LOG_FILE = '/tmp/jadomi-pdf-pro.log';
const RESULTS_DIR = '/tmp/pdf-pro-products';
const PROGRESS_FILE = '/tmp/pdf-pro-progress.json';
const MIN_TEXT_FOR_ANALYSIS = 50; // Minimum chars pour considérer une page comme "texte"
const MIN_TEXT_FOR_VISION = 200;  // En dessous → OCR vision

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// DEEPSEEK TEXT API
// =============================================

function callDeepSeek(prompt, content) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: content },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      timeout: 30000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

const CATALOG_PROMPT = `Tu extrais les produits d'une page de catalogue dentaire.
Le texte peut etre desordonne (extraction PDF) — reconstitue les produits.

Pour chaque produit, extrais :
- ref : reference fournisseur (format XXX-XXXX ou numero)
- name : designation complete
- price : prix HT en euros (nombre decimal). Si pas de prix visible, mets null.
- brand : marque/fabricant
- packaging : conditionnement si visible

REGLES :
- Une ref = un produit unique, meme s'il y a des sous-refs/variantes
- Extrais TOUTES les refs visibles, meme s'il n'y a pas de prix
- Ignore : titres de section, texte marketing, conditions de vente, index/sommaire
- Si c'est une page d'index (liste de noms + numeros de page), extrais quand meme les noms+refs

Retourne UNIQUEMENT un JSON : {"products": [...]}
Si aucun produit identifiable, retourne {"products": []}`;

// =============================================
// EXTRACTION PAGE PAR PAGE
// =============================================

async function extractPages(pdfPath, maxPages) {
  const pages = [];
  const options = {
    max: maxPages || 9999,
    pagerender: function(pageData) {
      return pageData.getTextContent().then(function(tc) {
        let text = '';
        for (const item of tc.items) text += item.str + ' ';
        pages.push(text.trim());
        return text;
      });
    }
  };

  const buf = fs.readFileSync(pdfPath);
  const pdf = await pdfParse(buf, options);
  return { pages, totalPages: pdf.numpages };
}

// =============================================
// CONVERSION PAGE → IMAGE (pour OCR)
// =============================================

function pageToImage(pdfPath, pageNum) {
  const outDir = '/tmp/pdf-pages';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `page-${pageNum}`);

  try {
    execSync(`pdftoppm -f ${pageNum} -l ${pageNum} -jpeg -r 200 "${pdfPath}" "${outFile}"`, {
      timeout: 15000
    });
    // pdftoppm ajoute un suffix
    const files = fs.readdirSync(outDir).filter(f => f.startsWith(`page-${pageNum}`));
    if (files.length > 0) return path.join(outDir, files[0]);
  } catch {}
  return null;
}

// =============================================
// MAIN
// =============================================

async function main() {
  const args = process.argv.slice(2);
  const pdfPath = args.find(a => a.startsWith('--file='))?.split('=')[1];
  const testMode = args.includes('--test');
  const startPage = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1]) || 0;

  if (!pdfPath) { console.log('Usage: node scripts/scrape-pdf-pro.js --file=path.pdf [--test] [--start=N]'); return; }
  if (!fs.existsSync(pdfPath)) { console.log('Fichier non trouve: ' + pdfPath); return; }

  const filename = path.basename(pdfPath);
  log(`=== PDF PRO SCRAPER: ${filename} ===`);

  // Charger la progression
  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  const processedPages = new Set(progress[filename]?.done || []);
  const allProducts = progress[filename]?.products || [];

  // Extraire le texte page par page
  const maxPages = testMode ? 30 : 9999;
  log(`Extraction texte page par page (max ${maxPages})...`);
  const { pages, totalPages } = await extractPages(pdfPath, maxPages);
  log(`${pages.length} pages extraites (${totalPages} total dans le PDF)`);

  // Classifier les pages
  let textPages = 0, sparsePages = 0, emptyPages = 0, skippedPages = 0;
  const pagesToProcess = [];

  for (let i = startPage; i < pages.length; i++) {
    if (processedPages.has(i)) { skippedPages++; continue; }
    const text = pages[i];
    if (text.length < MIN_TEXT_FOR_ANALYSIS) {
      emptyPages++;
    } else {
      textPages++;
      pagesToProcess.push({ index: i, text, type: text.length < MIN_TEXT_FOR_VISION ? 'sparse' : 'text' });
    }
  }

  log(`Pages: ${textPages} avec texte, ${emptyPages} vides, ${skippedPages} deja faites`);
  if (testMode) log(`MODE TEST — 30 pages max`);

  // Traiter par batch de 3 pages (économie tokens)
  let totalNew = 0;
  const seenRefs = new Set(allProducts.map(p => p.ref).filter(Boolean));
  const batchSize = 3;

  for (let i = 0; i < pagesToProcess.length; i += batchSize) {
    const batch = pagesToProcess.slice(i, i + batchSize);
    const batchText = batch.map((p, idx) =>
      `--- PAGE ${p.index + 1} ---\n${p.text.substring(0, 2000)}`
    ).join('\n\n');

    // Envoyer à DeepSeek
    const response = await callDeepSeek(CATALOG_PROMPT, batchText);
    if (!response) { log(`  Batch ${i}: DeepSeek erreur`); continue; }

    // Parser
    let products = [];
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) products = JSON.parse(match[0]).products || [];
    } catch {}

    // Dédupliquer par ref
    let newCount = 0;
    for (const p of products) {
      if (p.ref && seenRefs.has(p.ref)) continue;
      if (p.ref) seenRefs.add(p.ref);
      allProducts.push({
        ...p,
        source_page: batch[0].index + 1,
        source_pdf: filename,
      });
      newCount++;
    }
    totalNew += newCount;

    // Marquer comme traité
    batch.forEach(p => processedPages.add(p.index));

    if (newCount > 0 || products.length > 0) {
      log(`  Pages ${batch.map(b => b.index + 1).join(',')}: ${products.length} produits (${newCount} nouveaux) — total: ${allProducts.length}`);
    }

    // Sauvegarder progression toutes les 10 itérations
    if ((i / batchSize) % 10 === 0) {
      progress[filename] = { done: [...processedPages], products: allProducts };
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
    }
  }

  // Sauvegarder final
  progress[filename] = { done: [...processedPages], products: allProducts };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

  // Sauvegarder les produits
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, filename.replace('.pdf', '.json'));

  // Dédupliquer par ref final
  const uniqueMap = new Map();
  allProducts.forEach(p => {
    const key = p.ref || p.name;
    if (!uniqueMap.has(key)) uniqueMap.set(key, p);
  });
  const dedupedProducts = [...uniqueMap.values()];
  fs.writeFileSync(outFile, JSON.stringify(dedupedProducts, null, 2));

  log(`\n=== BILAN ===`);
  log(`PDF: ${filename}`);
  log(`Pages traitees: ${processedPages.size} / ${pages.length}`);
  log(`Produits bruts: ${allProducts.length}`);
  log(`Produits uniques: ${dedupedProducts.length}`);
  log(`Nouveaux cette session: ${totalNew}`);
  log(`Sauvegarde: ${outFile}`);
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
