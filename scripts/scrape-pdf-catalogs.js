#!/usr/bin/env node
// =============================================
// JADOMI — Extracteur de produits depuis catalogues PDF
//
// pdf-parse extrait le texte → DeepSeek structure les produits
// Big Boss Claude supervise, ouvrier chinois DeepSeek fait le boulot
//
// Usage:
//   node scripts/scrape-pdf-catalogs.js                    # Tous les PDFs
//   node scripts/scrape-pdf-catalogs.js --file=path.pdf    # Un seul PDF
//   node scripts/scrape-pdf-catalogs.js --test              # Test 3 pages d'un PDF
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pdfParse = require('pdf-parse');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const FLYERS_DIR = '/home/ubuntu/jadomi/uploads/flyers';
const PROGRESS_FILE = '/tmp/jadomi-pdf-scrape-progress.json';
const LOG_FILE = '/tmp/jadomi-pdf-scrape.log';
const RESULTS_DIR = '/tmp/pdf-products';

const BATCH_PAGES = 3; // Nombre de pages envoyées par appel DeepSeek

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

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
      timeout: 60000,
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

const PDF_PROMPT = `Tu es un extracteur de données depuis des catalogues dentaires PDF.
Le texte ci-dessous provient de pages d'un catalogue fournisseur dentaire.

Extrais TOUS les produits visibles avec :
- name : nom du produit (désignation complète + conditionnement)
- ref : référence catalogue/fournisseur (code article, souvent un nombre)
- price : prix HT en euros (nombre décimal, le prix REMISÉ si barré visible)
- price_original : prix barré/catalogue si visible, sinon null
- brand : marque/fabricant
- category : endodontie/restauration/empreinte/prothese/implantologie/chirurgie/orthodontie/prophylaxie/radiologie/anesthesie/instruments/consommables/equipement/hygiene/labo

IMPORTANT :
- Un catalogue peut avoir des centaines de produits par page, extrais-les TOUS
- Les prix sont souvent en colonnes (Réf | Désignation | Prix HT)
- Ignore les textes marketing, titres de section, conditions de vente
- Si aucun produit identifiable, retourne {"products": []}

Retourne UNIQUEMENT un JSON : {"products": [...]}`;

async function extractFromPdf(pdfPath, options = {}) {
  const filename = path.basename(pdfPath);
  const testMode = options.test || false;
  const maxPages = options.maxPages || 999;

  log(`\n========== PDF: ${filename} (${Math.round(fs.statSync(pdfPath).size / 1024 / 1024)}MB) ==========`);

  // Extraire le texte
  let pdf;
  try {
    const buffer = fs.readFileSync(pdfPath);
    pdf = await pdfParse(buffer, {
      max: testMode ? 5 : maxPages,
    });
  } catch (err) {
    log(`  Erreur lecture PDF: ${err.message}`);
    return [];
  }

  log(`  ${pdf.numpages} pages, ${pdf.text.length} caractères extraits`);

  if (pdf.text.length < 100) {
    log(`  PDF image-only (pas de texte extractible) — skip`);
    return [];
  }

  // Découper le texte par pages (approximatif — pdf-parse ne donne pas les pages individuelles)
  // On découpe par blocs de ~3000 chars pour garder le contexte
  const chunks = [];
  const chunkSize = 4000;
  for (let i = 0; i < pdf.text.length; i += chunkSize) {
    chunks.push(pdf.text.substring(i, i + chunkSize));
  }

  log(`  ${chunks.length} blocs de texte à analyser`);
  if (testMode) {
    log(`  MODE TEST — 3 premiers blocs seulement`);
    chunks.splice(3);
  }

  // Envoyer chaque bloc à DeepSeek
  const allProducts = [];
  let totalCost = 0;

  for (let i = 0; i < chunks.length; i += BATCH_PAGES) {
    const batch = chunks.slice(i, i + BATCH_PAGES).join('\n\n--- PAGE SUIVANTE ---\n\n');

    const response = await callDeepSeek(PDF_PROMPT, `Fournisseur: ${guessSupplier(filename)}\n\n${batch}`);
    totalCost += 0.001;

    if (!response) { log(`  Bloc ${i}: DeepSeek erreur`); continue; }

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const products = parsed.products || [];
        allProducts.push(...products.map(p => ({
          ...p,
          supplier: guessSupplier(filename),
          source_pdf: filename,
        })));

        if (products.length > 0) {
          log(`  Bloc ${i}-${i + BATCH_PAGES}: ${products.length} produits`);
        }
      }
    } catch {}

    // Log toutes les 10 itérations
    if ((i / BATCH_PAGES) % 10 === 0 && i > 0) {
      log(`  Progression: ${i}/${chunks.length} blocs, ${allProducts.length} produits`);
    }
  }

  // Dédupliquer par nom+ref
  const unique = new Map();
  allProducts.forEach(p => {
    const key = `${(p.name || '').toLowerCase().substring(0, 50)}__${p.ref || ''}`;
    if (!unique.has(key)) unique.set(key, p);
  });
  const dedupedProducts = [...unique.values()];

  log(`\n  RÉSULTAT ${filename}:`);
  log(`  ${allProducts.length} bruts → ${dedupedProducts.length} uniques`);
  log(`  Coût DeepSeek: ~$${totalCost.toFixed(3)}`);

  // Exemples
  dedupedProducts.slice(0, 5).forEach(p => {
    log(`    [${p.brand || '?'}] ${(p.name || '').substring(0, 50)} → ${p.price || '?'}€ | Réf: ${p.ref || '-'}`);
  });

  // Sauvegarder
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, filename.replace('.pdf', '.json'));
  fs.writeFileSync(outFile, JSON.stringify(dedupedProducts, null, 2));

  return dedupedProducts;
}

function guessSupplier(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('henry') || lower.includes('schein') || lower.includes('cabinet') || lower.includes('labo_2023') || lower.includes('mp_bdef') || lower.includes('fr116') || lower.includes('flyer_mai') || lower.includes('esthetique')) return 'HenrySchein';
  if (lower.includes('mega')) return 'MegaDental';
  if (lower.includes('dpi') || lower.includes('dental_promotion')) return 'DentalPromotion';
  if (lower.includes('septaline')) return 'Septaline';
  if (lower.includes('smp')) return 'SMP';
  if (lower.includes('libert')) return 'Liberte';
  if (lower.includes('adf')) return 'ADF';
  return 'Inconnu';
}

// =============================================
// MAIN
// =============================================

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const singleFile = args.find(a => a.startsWith('--file='))?.split('=')[1];

  log('=== JADOMI PDF CATALOG SCRAPER ===');
  log(`DeepSeek: ${DEEPSEEK_KEY ? 'OK' : 'MANQUANT'}`);

  let pdfs;
  if (singleFile) {
    pdfs = [singleFile];
  } else {
    pdfs = fs.readdirSync(FLYERS_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(f => path.join(FLYERS_DIR, f))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size); // Plus gros d'abord
  }

  log(`${pdfs.length} PDFs à traiter`);

  let grandTotal = 0;
  for (const pdf of pdfs) {
    const products = await extractFromPdf(pdf, { test: testMode });
    grandTotal += products.length;
  }

  log(`\n=== BILAN FINAL ===`);
  log(`${pdfs.length} PDFs traités`);
  log(`${grandTotal} produits extraits au total`);
  log(`Résultats dans ${RESULTS_DIR}/`);
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
