#!/usr/bin/env node
// =============================================
// JADOMI — VENTA GROUP API SCRAPER
//
// Exploite l'API Elasticsearch Suggest de DoctorStrong/DoctorAI/MegaDental
// (groupe Venta = mêmes codes produits internes)
//
// UN scrape → 3 sites d'un coup avec :
//   - Tous les produits parents
//   - Toutes les sous-références (children/variantes)
//   - Prix catalogue + prix promo
//   - Codes croisés (code_drai, code_strong, code_mega)
//   - Marques, catégories, SKUs
//
// Usage: node scripts/scrape-venta-api.js
//        node scripts/scrape-venta-api.js --report
// =============================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const nodemailer = require('nodemailer');

const PROGRESS_FILE = '/tmp/venta-api-progress.json';
const LOG_FILE = '/tmp/venta-api.log';
const EMAIL_TO = 'karim_bahmed@yahoo.fr';

// DoctorStrong as primary source (same data as DoctorAI + MegaDental)
const API_BASE = 'https://www.doctorstrong.fr/search/ajax/suggest?q=';
const API_DRAI = 'https://www.doctor-ai.fr/search/ajax/suggest?q=';

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

// =============================================
// LOGGING
// =============================================

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function sendEmail(subject, html) {
  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>',
      to: EMAIL_TO, subject, html,
    });
  } catch (e) {}
}

// =============================================
// HTTP FETCH — simple, pas besoin de Puppeteer
// =============================================

function fetchJSON(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

// =============================================
// PROGRESS MANAGEMENT
// =============================================

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch (e) {}
  }
  return {
    products: {},       // entity_id → full product data
    completedQueries: [],
    stats: { totalProducts: 0, totalChildren: 0, totalQueries: 0 },
  };
}

function saveProgress(progress) {
  progress.lastSaved = new Date().toISOString();
  progress.stats.totalProducts = Object.keys(progress.products).length;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

// =============================================
// EXTRACT PRODUCT DATA — le coeur du système
// =============================================

function extractProduct(raw) {
  const entityId = raw.entity_id;
  if (!entityId) return null;

  // Prix
  const priceData = (raw.price || []).find(p => p.customer_group_id === 0) || raw.price?.[0] || {};
  const price = priceData.final_price || priceData.price || null;
  const originalPrice = priceData.original_price || null;
  const specialPrice = raw.special_price?.[0] || null;
  const isDiscount = priceData.is_discount || false;

  // Noms
  const name = Array.isArray(raw.name) ? raw.name[0] : raw.name || '';
  const brand = raw.option_text_marque?.[0] || '';

  // Codes croisés
  const codesDrai = raw.code_drai || [];
  const codesStrong = raw.code_strong || [];
  const codesMega = raw.code_mega || [];
  const codesFournisseur = raw.code_art_fournisseur || [];

  // SKUs
  const skus = raw.sku || [];

  // Catégorie
  const category = raw.category?.find(c => c.name)?.name || raw.highlightCategory || '';

  // URL
  const urlKey = Array.isArray(raw.url_key) ? raw.url_key[0] : raw.url_key || raw.url || '';

  // Variantes / children
  const children = [];
  const childrenRaw = raw.children || [];
  const libelleWeb = raw.libelle_web || [];
  const libelleDigis = raw.libelle_digis || [];
  const optionModele = raw.option_text_modele || [];

  for (let i = 0; i < childrenRaw.length; i++) {
    const child = childrenRaw[i];
    children.push({
      id: child.id?.[0] || null,
      name: libelleWeb[i] || libelleDigis[i] || '',
      codeDrai: child.code_drai?.[0] || codesDrai[i] || '',
      codeStrong: child.code_strong?.[0] || codesStrong[i] || '',
      codeMega: child.code_mega?.[0] || codesMega[i] || '',
      codeFournisseur: child.code_art_fournisseur?.[0] || codesFournisseur[i] || '',
      urlKey: child.url_key?.[0] || '',
      modele: optionModele[i] || '',
    });
  }

  // Si pas de children, créer un seul "enfant" avec les codes du parent
  if (children.length === 0 && (codesDrai.length > 0 || codesStrong.length > 0)) {
    for (let i = 0; i < Math.max(codesDrai.length, codesStrong.length, codesMega.length); i++) {
      children.push({
        id: null,
        name: libelleWeb[i] || name,
        codeDrai: codesDrai[i] || '',
        codeStrong: codesStrong[i] || '',
        codeMega: codesMega[i] || '',
        codeFournisseur: codesFournisseur[i] || '',
        urlKey: '',
        modele: optionModele[i] || '',
      });
    }
  }

  return {
    entityId,
    name,
    brand,
    price,
    originalPrice,
    specialPrice,
    isDiscount,
    category,
    urlStrong: `https://www.doctorstrong.fr/${urlKey}.html`,
    urlDrai: urlKey ? `https://www.doctor-ai.fr/${urlKey}.html` : '',
    skus,
    children,
    totalVariants: children.length,
    codesDrai,
    codesStrong,
    codesMega,
    codesFournisseur,
  };
}

// =============================================
// BUILD QUERY LIST — stratégie exhaustive
// =============================================

function buildQueries() {
  const queries = new Set();

  const isDeep = process.argv.includes('--deep');

  // 1. Toutes les combinaisons 2 lettres (676 queries)
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const a of letters) {
    for (const b of letters) {
      queries.add(a + b);
    }
  }

  // 1b. En mode deep : toutes les combinaisons 3 lettres fréquentes
  if (isDeep) {
    const freq = 'abcdefghilmnoprstuvz'; // lettres fréquentes en français
    for (const a of freq) {
      for (const b of freq) {
        for (const c of freq) {
          queries.add(a + b + c);
        }
      }
    }
  }

  // 2. Chiffres et codes produits (100 queries)
  for (let i = 0; i <= 9; i++) {
    for (let j = 0; j <= 9; j++) {
      queries.add(`${i}${j}`);
    }
  }

  // 2b. Codes produits 3 chiffres (en deep)
  if (isDeep) {
    for (let i = 0; i <= 9; i++) {
      for (let j = 0; j <= 9; j++) {
        for (let k = 0; k <= 9; k++) {
          queries.add(`${i}${j}${k}`);
        }
      }
    }
  }

  // 3. Combinaisons lettre+chiffre fréquentes
  for (const a of letters) {
    for (let d = 0; d <= 9; d++) {
      queries.add(a + d);
      queries.add(d + a);
    }
  }

  // 4. Marques majeures GACD (pour ne rien rater)
  const brands = [
    'JAKOBI', 'DENTSPLY', 'IVOCLAR', 'HU-FRIEDY', 'GC', 'KEROX', 'SOLVENTUM',
    'NICHROMINOX', 'OSSTEM', 'VOCO', 'KERR', 'CARL MARTIN', 'ULTRADENT',
    'COLTENE', 'ERGODENTA', 'HYGITECH', 'MEDIBASE', 'ITENA', 'NUSMILE',
    'ACTEON', 'BIEN AIR', 'SATELEC', 'NSK', 'KAVO', 'W&H', 'SEPTODONT',
    'KULZER', 'SDI', 'TOKUYAMA', 'SHOFU', 'MECTRON', 'PLANMECA',
    'CARESTREAM', 'VATECH', 'ZHERMACK', 'CATTANI', 'DURR', 'OWANDY',
    'BIOMET', 'STRAUMANN', 'NOBEL', 'ZIMMER', 'MIS', 'ANTHOGYR',
    'BEGO', 'VITA', 'DENTAL DIREKT', 'ZIRCONIA', 'EMAX',
    'CLEARFIL', 'TETRIC', 'FILTEK', 'BULK', 'EMPRESS',
    'ORTHO', 'ORMCO', 'AMERICAN', '3M', 'MICRO MEGA', 'MAILLEFER',
    'PROTAPER', 'WAVEONE', 'RECIPROC', 'HYFLEX',
    'CYBERTECH', 'PRIMA', 'MUCODONT', 'PROCLINIC', 'DENTOCLIC',
    'ELITE', 'OMNICHROMA', 'BEAUTIFIL', 'LUXATEMP', 'PROVICOL',
    'FUJI', 'KETAC', 'CAVIT', 'TEMP BOND', 'RELY X',
    'ENDO', 'ROTARY', 'APEX', 'LIMA', 'PATHFINDER',
    'CHIRURGIE', 'SUTURE', 'LAME', 'AIGUILLE', 'SERINGUE',
    'COIFFE', 'MATRICE', 'COIN', 'DIGUE', 'CRAMPON',
    'EMPREINTE', 'ALGI', 'SILICONE', 'POLYETHER',
    'BLANCHIMENT', 'PEROXYDE', 'FLUOR', 'PROPHYLAXIE',
    'MASQUE', 'GANT', 'BAVETTE', 'STERIL', 'AUTOCLAVE',
    'FAUTEUIL', 'UNIT', 'COMPRESSEUR', 'ASPIRATION',
    'RADIO', 'CAPTEUR', 'PANORAMIQUE', 'CONE BEAM',
    'COMPOSITE', 'CIMENT', 'ADHESIF', 'MORDANCAGE', 'PRIMER',
    'FRAISE', 'TURBINE', 'CONTRE-ANGLE', 'PIECE A MAIN',
    'DETARTRAGE', 'CURETTE', 'SONDE', 'MIROIR', 'PRECELLE',
    'SPATULE', 'FOULOIR', 'BRUNISSOIR', 'EXCAVATEUR',
  ];
  for (const b of brands) {
    queries.add(b.toLowerCase());
    // Also add first 3 chars for partial matches
    if (b.length >= 4) queries.add(b.substring(0, 4).toLowerCase());
  }

  // 5. Termes dentaires courants
  const terms = [
    'résine', 'prothese', 'couronne', 'bridge', 'pivot', 'inlay', 'onlay',
    'pivot', 'tenon', 'obturation', 'endodontie', 'parodontie', 'pedodontie',
    'orthodontie', 'implantologie', 'chirurgie', 'esthetique', 'blanchiment',
    'prophylaxie', 'detartrage', 'polissage', 'curetage', 'surfacage',
    'amalgame', 'zinc', 'eugénol', 'hydroxyde', 'calcium',
    'papier', 'rouleau', 'coton', 'compresse', 'aspiration',
    'huile', 'spray', 'lubrifiant', 'nettoyant', 'desinfectant',
    'lampe', 'polymériser', 'photo', 'led', 'halogene',
    'fil', 'bracket', 'tube', 'arc', 'élastique', 'ligature',
    'micro', 'nano', 'hybrid', 'flow', 'bulk', 'universal',
    'anesthesie', 'carpule', 'articaine', 'lidocaine', 'mepivacaine',
    'provisoire', 'temporaire', 'definitif', 'permanent',
    'ceramique', 'zircone', 'disilicate', 'lithium', 'feldspath',
  ];
  for (const t of terms) {
    queries.add(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  }

  return Array.from(queries);
}

// =============================================
// IMPORT TO SUPABASE — via API JADOMI
// =============================================

async function importToSupabase(products, siteName) {
  const http = require('http');
  const items = [];
  for (const p of Object.values(products)) {
    // Import le produit parent
    if (p.price) {
      // Ref fabricant : code_art_fournisseur est la ref du FABRICANT (ex: V040214028025 pour VDW)
      // Les codes spécifiques (codeDrai, codeStrong, codeMega) sont les refs FOURNISSEUR
      const refFabricant = p.codesFournisseur?.[0] || '';
      const refSite = siteName === 'doctorstrong' ? p.codesStrong?.[0] :
                      siteName === 'doctorai' ? p.codesDrai?.[0] :
                      p.codesMega?.[0];
      items.push({
        name: p.name,
        brand: p.brand,
        ref: refSite || p.skus?.[0] || '',
        ref_fabricant: refFabricant,
        category: p.category,
        price: p.specialPrice || p.price,
        price_original: p.originalPrice || p.price,
        discount: p.isDiscount && p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0,
        url: siteName === 'doctorstrong' ? p.urlStrong : p.urlDrai,
      });
    }

    // Import chaque sous-référence/variante
    for (const child of p.children || []) {
      if (child.name && child.name !== p.name) {
        const ref = siteName === 'doctorstrong' ? child.codeStrong :
                    siteName === 'doctorai' ? child.codeDrai :
                    child.codeMega;
        items.push({
          name: child.name,
          brand: p.brand,
          ref: ref || '',
          ref_fabricant: child.codeFournisseur || '',
          category: p.category,
          price: p.specialPrice || p.price,
          price_original: p.originalPrice || p.price,
          discount: p.isDiscount && p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0,
          url: siteName === 'doctorstrong' ? p.urlStrong : p.urlDrai,
        });
      }
    }
  }

  // Send in batches of 500 — format attendu par l'API : { source, products }
  const batchSize = 500;
  let imported = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const postData = JSON.stringify({ source: siteName, products: batch });
      const result = await new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3001/api/scan/import-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 30000,
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(postData);
        req.end();
      });
      imported += batch.length;
      log(`  Import ${siteName} batch ${Math.floor(i/batchSize)+1}/${Math.ceil(items.length/batchSize)}: ${batch.length} OK`);
    } catch (e) {
      log(`  Import erreur batch ${Math.floor(i/batchSize)+1}: ${e.message}`);
    }
  }

  return imported;
}

// =============================================
// MAIN
// =============================================

async function main() {
  if (process.argv.includes('--report')) {
    const progress = loadProgress();
    const products = Object.values(progress.products);
    const totalChildren = products.reduce((s, p) => s + (p.children?.length || 0), 0);
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
    console.log(`\n=== VENTA API SCRAPER REPORT ===`);
    console.log(`Produits parents: ${products.length}`);
    console.log(`Sous-références: ${totalChildren}`);
    console.log(`Total (parents + children): ${products.length + totalChildren}`);
    console.log(`Marques: ${brands.length}`);
    console.log(`Queries: ${progress.completedQueries?.length || 0}`);
    console.log(`Top 20 marques:`);
    const brandCounts = {};
    products.forEach(p => { if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand]||0)+1; });
    Object.entries(brandCounts).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([b,c]) => console.log(`  ${b}: ${c}`));
    return;
  }

  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI VENTA API SCRAPER — 3 SITES EN 1               ║');
  log('║  DoctorStrong + DoctorAI + MegaDental                   ║');
  log('║  Elasticsearch Suggest API — SANS Puppeteer             ║');
  log('╚══════════════════════════════════════════════════════════╝');

  const progress = loadProgress();
  const completedSet = new Set(progress.completedQueries || []);
  const allQueries = buildQueries();
  const pendingQueries = allQueries.filter(q => !completedSet.has(q));

  log(`Queries totales: ${allQueries.length}`);
  log(`Déjà faites: ${completedSet.size}`);
  log(`Restantes: ${pendingQueries.length}`);
  log(`Produits existants: ${Object.keys(progress.products).length}`);

  await sendEmail(
    `🔍 Venta API Scraper démarré — ${pendingQueries.length} queries restantes`,
    `<h2>Scraper Venta API (3 sites en 1)</h2>
     <p>${Object.keys(progress.products).length} produits existants</p>
     <p>${pendingQueries.length} queries à faire sur ${allQueries.length} total</p>`
  );

  let newProducts = 0;
  let newChildren = 0;
  let errors = 0;
  const startTime = Date.now();

  // Use BOTH APIs in parallel for max coverage
  for (let i = 0; i < pendingQueries.length; i++) {
    const query = pendingQueries[i];

    try {
      // Fetch from DoctorStrong (primary) and DoctorAI (secondary) in parallel
      const [strongResults, draiResults] = await Promise.all([
        fetchJSON(API_BASE + encodeURIComponent(query)),
        fetchJSON(API_DRAI + encodeURIComponent(query)),
      ]);

      // Process DoctorStrong results
      const allResults = [...(strongResults || []), ...(draiResults || [])];
      const productResults = allResults.filter(r => r.type === 'product');

      for (const raw of productResults) {
        const product = extractProduct(raw);
        if (!product) continue;

        if (!progress.products[product.entityId]) {
          progress.products[product.entityId] = product;
          newProducts++;
          newChildren += product.children.length;
        } else {
          // Merge children if we found new ones
          const existing = progress.products[product.entityId];
          const existingChildIds = new Set(existing.children.map(c => c.id || c.codeFournisseur));
          for (const child of product.children) {
            const childKey = child.id || child.codeFournisseur;
            if (childKey && !existingChildIds.has(childKey)) {
              existing.children.push(child);
              existing.totalVariants = existing.children.length;
              newChildren++;
            }
          }
        }
      }

      completedSet.add(query);

      // Progress log every 100 queries
      if ((i + 1) % 100 === 0 || i === pendingQueries.length - 1) {
        const totalProducts = Object.keys(progress.products).length;
        const totalChildrenCount = Object.values(progress.products).reduce((s, p) => s + (p.children?.length || 0), 0);
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const rate = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(1);
        log(`  [${i + 1}/${pendingQueries.length}] ${totalProducts} produits, ${totalChildrenCount} variantes (+${newProducts} new) | ${elapsed}min | ${rate} q/s`);

        // Save progress
        progress.completedQueries = Array.from(completedSet);
        progress.stats.totalChildren = totalChildrenCount;
        saveProgress(progress);
      }

      // Adaptive delay — respectful but fast (pas de Puppeteer = léger pour le serveur)
      await new Promise(r => setTimeout(r, 150)); // 150ms between queries

    } catch (err) {
      errors++;
      completedSet.add(query); // Skip on error
    }
  }

  // Final save
  progress.completedQueries = Array.from(completedSet);
  saveProgress(progress);

  const totalProducts = Object.keys(progress.products).length;
  const totalChildrenCount = Object.values(progress.products).reduce((s, p) => s + (p.children?.length || 0), 0);
  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  log('\n═══════════════════════════════════════════════');
  log(`VENTA API SCRAPING TERMINÉ en ${elapsedMin} min`);
  log(`Produits parents: ${totalProducts}`);
  log(`Sous-références: ${totalChildrenCount}`);
  log(`TOTAL: ${totalProducts + totalChildrenCount}`);
  log(`Erreurs: ${errors}`);
  log('═══════════════════════════════════════════════');

  // Phase 2: Import to Supabase for all 3 sites
  log('\n📦 Import vers Supabase (3 sites)...');

  const importedStrong = await importToSupabase(progress.products, 'doctorstrong');
  log(`  DoctorStrong: ${importedStrong} lignes importées`);

  const importedDrai = await importToSupabase(progress.products, 'doctorai');
  log(`  DoctorAI: ${importedDrai} lignes importées`);

  const importedMega = await importToSupabase(progress.products, 'megadental');
  log(`  MegaDental: ${importedMega} lignes importées`);

  // Phase 3: Match avec GACD
  log('\n🔗 Cross-référencement avec GACD...');
  await matchWithGACD(progress.products);

  // Send final email
  const html = `<h2>🏆 Venta API Scraping TERMINÉ</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse;font-family:Arial">
    <tr style="background:#16213e;color:white"><th>Métrique</th><th>Valeur</th></tr>
    <tr><td>Produits parents</td><td><b>${totalProducts}</b></td></tr>
    <tr><td>Sous-références</td><td><b>${totalChildrenCount}</b></td></tr>
    <tr><td>TOTAL</td><td><b style="color:#22c55e">${totalProducts + totalChildrenCount}</b></td></tr>
    <tr><td>Temps</td><td>${elapsedMin} min</td></tr>
    <tr><td>Erreurs</td><td>${errors}</td></tr>
    <tr><td>Import DoctorStrong</td><td>${importedStrong}</td></tr>
    <tr><td>Import DoctorAI</td><td>${importedDrai}</td></tr>
    <tr><td>Import MegaDental</td><td>${importedMega}</td></tr>
    </table>`;

  await sendEmail(`🏆 Venta API: ${totalProducts + totalChildrenCount} produits (${totalProducts} parents + ${totalChildrenCount} variantes)`, html);
}

// =============================================
// MATCH WITH GACD — cross-reference automatique
// =============================================

async function matchWithGACD(ventaProducts) {
  const gacdFile = '/tmp/search-progress-gacd.json';
  if (!fs.existsSync(gacdFile)) {
    log('  Pas de données GACD, skip matching');
    return;
  }

  const gacdData = JSON.parse(fs.readFileSync(gacdFile, 'utf8'));
  const gacdProducts = Object.values(gacdData.products);
  log(`  GACD: ${gacdProducts.length} produits de référence`);

  // Build index by brand + normalized name for fast matching
  const ventaByBrand = {};
  for (const p of Object.values(ventaProducts)) {
    const brand = (p.brand || '').toLowerCase().trim();
    if (!ventaByBrand[brand]) ventaByBrand[brand] = [];
    ventaByBrand[brand].push(p);
  }

  let matched = 0;
  const matchResults = [];

  for (const gacdP of gacdProducts) {
    const gacdBrand = (gacdP.brand || '').toLowerCase().trim();
    const gacdName = (gacdP.name || '').toLowerCase();

    // Try exact brand match first
    const candidates = ventaByBrand[gacdBrand] || [];

    for (const ventaP of candidates) {
      const ventaName = (ventaP.name || '').toLowerCase();
      // Simple word overlap score
      const gacdWords = gacdName.split(/\s+/).filter(w => w.length > 2);
      const ventaWords = new Set(ventaName.split(/\s+/).filter(w => w.length > 2));
      const overlap = gacdWords.filter(w => ventaWords.has(w)).length;
      const score = gacdWords.length > 0 ? overlap / gacdWords.length : 0;

      if (score >= 0.4) {
        matchResults.push({
          gacdName: gacdP.name,
          gacdPrice: gacdP.price,
          gacdBrand: gacdP.brand,
          ventaName: ventaP.name,
          ventaPrice: ventaP.price,
          ventaPriceOriginal: ventaP.originalPrice,
          ventaBrand: ventaP.brand,
          urlStrong: ventaP.urlStrong,
          urlDrai: ventaP.urlDrai,
          variants: ventaP.children.length,
          score,
        });
        matched++;
        break; // Best match for this GACD product
      }
    }
  }

  log(`  Matchés GACD↔Venta: ${matched}/${gacdProducts.length} (${(matched/gacdProducts.length*100).toFixed(1)}%)`);

  // Save match results
  fs.writeFileSync('/tmp/venta-gacd-matches.json', JSON.stringify(matchResults, null, 2));
  log(`  Résultats sauvegardés: /tmp/venta-gacd-matches.json`);
}

main().catch(err => {
  log(`ERREUR FATALE: ${err.message}`);
  process.exit(1);
});
