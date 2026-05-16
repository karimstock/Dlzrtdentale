#!/usr/bin/env node
// =============================================
// JADOMI — MULTI-SUPPLIER API SCRAPER
//
// Scrape TOUS les fournisseurs qui ont une API accessible
// sans Puppeteer (HTTP simple = rapide + fiable)
//
// Sites couverts :
//   1. DentalRee (Shopify) — products.json
//   2. Dental-France (WooCommerce) — wp-json REST API
//   3. Polydentia (WooCommerce) — wp-json REST API
//   4. GACD (Algolia) — déjà couvert par scrape-gacd-algolia-v2.js
//   5. Venta group — déjà couvert par scrape-venta-api.js
//
// Usage: node scripts/scrape-all-apis.js
//        node scripts/scrape-all-apis.js --site dentalree
// =============================================

const fs = require('fs');
const https = require('https');
const http = require('http');
const nodemailer = require('nodemailer');

const LOG_FILE = '/tmp/scrape-all-apis.log';
const EMAIL_TO = 'karim_bahmed@yahoo.fr';

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function fetchJSON(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
      timeout: 20000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function importBatch(source, products) {
  const postData = JSON.stringify({ source, products });
  return new Promise((resolve) => {
    const req = http.request('http://localhost:3001/api/scan/import-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 30000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', (e) => resolve(`error: ${e.message}`));
    req.on('timeout', () => { req.destroy(); resolve('timeout'); });
    req.write(postData);
    req.end();
  });
}

// =============================================
// SHOPIFY SCRAPER — products.json API
// =============================================

async function scrapeShopify(config) {
  log(`\n${'═'.repeat(55)}`);
  log(`🛒 Shopify: ${config.name} (${config.url})`);

  const allProducts = [];
  let page = 1;
  while (page <= 200) { // Safety limit
    const data = await fetchJSON(`${config.url}/products.json?limit=250&page=${page}`);
    if (!data || !data.products || data.products.length === 0) break;

    for (const p of data.products) {
      // Product parent
      const basePrice = p.variants?.[0]?.price ? parseFloat(p.variants[0].price) : null;
      const comparePrice = p.variants?.[0]?.compare_at_price ? parseFloat(p.variants[0].compare_at_price) : null;

      allProducts.push({
        name: p.title,
        brand: p.vendor || '',
        ref: p.variants?.[0]?.sku || '',
        category: p.product_type || '',
        price: basePrice,
        price_original: comparePrice || basePrice,
        discount: comparePrice && basePrice < comparePrice ? Math.round((1 - basePrice/comparePrice) * 100) : 0,
        url: `${config.url}/products/${p.handle}`,
      });

      // Chaque variante comme sous-référence
      if (p.variants && p.variants.length > 1) {
        for (const v of p.variants.slice(1)) {
          const vPrice = v.price ? parseFloat(v.price) : basePrice;
          const vCompare = v.compare_at_price ? parseFloat(v.compare_at_price) : null;
          allProducts.push({
            name: `${p.title} - ${v.title}`,
            brand: p.vendor || '',
            ref: v.sku || '',
            category: p.product_type || '',
            price: vPrice,
            price_original: vCompare || vPrice,
            discount: vCompare && vPrice < vCompare ? Math.round((1 - vPrice/vCompare) * 100) : 0,
            url: `${config.url}/products/${p.handle}?variant=${v.id}`,
          });
        }
      }
    }

    log(`  Page ${page}: ${data.products.length} produits (total: ${allProducts.length})`);
    page++;
    await new Promise(r => setTimeout(r, 500)); // Respectful delay
  }

  log(`  ✅ ${config.name}: ${allProducts.length} produits extraits`);

  // Import
  for (let i = 0; i < allProducts.length; i += 500) {
    const batch = allProducts.slice(i, i + 500);
    await importBatch(config.supplierName, batch);
    log(`  Import batch ${Math.floor(i/500)+1}: ${batch.length} OK`);
  }

  return allProducts.length;
}

// =============================================
// WOOCOMMERCE SCRAPER — Store API v1
// =============================================

async function scrapeWooCommerce(config) {
  log(`\n${'═'.repeat(55)}`);
  log(`🏪 WooCommerce: ${config.name} (${config.url})`);

  const allProducts = [];
  let page = 1;
  while (page <= 200) {
    const data = await fetchJSON(`${config.url}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    if (!data || !Array.isArray(data) || data.length === 0) break;

    for (const p of data) {
      // WC Store API returns prices in cents
      const price = p.prices?.price ? parseInt(p.prices.price) / 100 : null;
      const regularPrice = p.prices?.regular_price ? parseInt(p.prices.regular_price) / 100 : null;
      const salePrice = p.prices?.sale_price ? parseInt(p.prices.sale_price) / 100 : null;
      const finalPrice = salePrice || price;
      const category = p.categories?.[0]?.name || '';

      allProducts.push({
        name: p.name,
        brand: '', // WC doesn't always have brand
        ref: p.sku || '',
        category,
        price: finalPrice,
        price_original: regularPrice || finalPrice,
        discount: regularPrice && finalPrice < regularPrice ? Math.round((1 - finalPrice/regularPrice) * 100) : 0,
        url: p.permalink || `${config.url}/?p=${p.id}`,
      });
    }

    log(`  Page ${page}: ${data.length} produits (total: ${allProducts.length})`);
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  log(`  ✅ ${config.name}: ${allProducts.length} produits extraits`);

  for (let i = 0; i < allProducts.length; i += 500) {
    const batch = allProducts.slice(i, i + 500);
    await importBatch(config.supplierName, batch);
    log(`  Import batch ${Math.floor(i/500)+1}: ${batch.length} OK`);
  }

  return allProducts.length;
}

// =============================================
// PRESTASHOP AJAX SCRAPER — search AJAX endpoint
// Fonctionne pour les PS 1.7+ avec Ajax search
// =============================================

async function scrapePrestashopAjax(config) {
  log(`\n${'═'.repeat(55)}`);
  log(`🔧 PrestaShop AJAX: ${config.name} (${config.url})`);

  const allProducts = new Map(); // Deduplicate by product ID
  const searchTerms = config.searchTerms || [
    'composite', 'ciment', 'gant', 'fraise', 'implant', 'empreinte',
    'adhesif', 'sonde', 'miroir', 'curette', 'turbine', 'seringue',
    'coiffe', 'matrice', 'digue', 'bracket', 'fil', 'resine',
    'masque', 'compresse', 'coton', 'spatule', 'detartrage', 'endo',
    'polissage', 'blanchiment', 'silicone', 'suture', 'lame', 'chirurgie',
    'prothese', 'ceramique', 'zircone', 'lampe', 'radio', 'fauteuil',
    'autoclave', 'desinfectant', 'anesthesie', 'carpule', 'fluor',
    'amalgame', 'obturation', 'provisoire', 'couronne', 'bridge',
    'pivot', 'moule', 'protection', 'gaze', 'aspiration', 'canule',
    'spray', 'huile', 'nettoyant', 'sterilisation', 'sachet',
    'pince', 'ciseaux', 'porte', 'excavateur', 'fouloir', 'brunissoir',
    'precelle', 'daviers', 'elevateur', 'rugine', 'syndesmotome',
    'rouleaux', 'papier', 'articulation', 'mordancage', 'primer',
    'vernis', 'liner', 'base', 'eugénol', 'calcium', 'zinc',
    'algi', 'alginate', 'plâtre', 'cire', 'articulateur',
    'photopolymeriser', 'led', 'tip', 'embout', 'capteur',
    'ortho', 'elastique', 'ressort', 'mini-vis', 'tube',
    'paro', 'sondage', 'irrigation', 'cone', 'gutta', 'lime',
    'instrument', 'rotatif', 'insert', 'ultrason',
    'brossette', 'prophylaxie', 'pate', 'cupule',
  ];

  for (let i = 0; i < searchTerms.length; i++) {
    const term = searchTerms[i];
    try {
      // Build URL with pagination
      for (let page = 1; page <= 5; page++) {
        const url = `${config.url}/recherche?s=${encodeURIComponent(term)}&resultsPerPage=100&page=${page}&ajax=1`;
        const data = await fetchJSON(url);
        if (!data || !data.rendered_products) break;

        // Extract products from HTML
        const html = data.rendered_products;
        const productRegex = /data-id-product="(\d+)"[\s\S]*?product-title[^>]*>\s*<a[^>]*>([^<]+)<[\s\S]*?content="([\d.]+)"/g;
        let match;
        let pageCount = 0;
        while ((match = productRegex.exec(html)) !== null) {
          const id = match[1];
          const name = match[2].trim();
          const price = parseFloat(match[3]);
          if (!allProducts.has(id)) {
            allProducts.set(id, {
              name,
              brand: '',
              ref: '',
              category: term,
              price,
              price_original: price,
              url: `${config.url}/product/${id}`,
            });
            pageCount++;
          }
        }

        // Also try alternate HTML pattern
        const altRegex = /data-id-product="(\d+)"[\s\S]*?<(?:h\d|span|a)[^>]*class="[^"]*(?:product-title|product-name)[^"]*"[^>]*>(?:<a[^>]*>)?([^<]+)/g;
        while ((match = altRegex.exec(html)) !== null) {
          const id = match[1];
          if (!allProducts.has(id)) {
            allProducts.set(id, {
              name: match[2].trim(),
              brand: '',
              ref: '',
              category: term,
              price: null,
              price_original: null,
              url: `${config.url}/product/${id}`,
            });
          }
        }

        if (pageCount === 0) break; // No more results
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (e) {}

    if ((i + 1) % 10 === 0) {
      log(`  [${i+1}/${searchTerms.length}] ${allProducts.size} produits uniques`);
    }
    await new Promise(r => setTimeout(r, 600));
  }

  const products = Array.from(allProducts.values());
  log(`  ✅ ${config.name}: ${products.length} produits extraits`);

  for (let i = 0; i < products.length; i += 500) {
    const batch = products.slice(i, i + 500);
    await importBatch(config.supplierName, batch);
    log(`  Import batch ${Math.floor(i/500)+1}: ${batch.length} OK`);
  }

  return products.length;
}

// =============================================
// SITE CONFIGURATIONS
// =============================================

const SITES = [
  // Shopify sites
  {
    name: 'DentalRee',
    supplierName: 'dentalree',
    url: 'https://www.dentalree.com',
    type: 'shopify',
  },

  // WooCommerce sites
  {
    name: 'Dental France',
    supplierName: 'dental-france',
    url: 'https://www.dental-france.fr',
    type: 'woocommerce',
  },
  {
    name: 'Polydentia',
    supplierName: 'polydentia',
    url: 'https://www.polydentia.ch',
    type: 'woocommerce',
  },

  // PrestaShop AJAX sites
  {
    name: 'DentAlachat',
    supplierName: 'dentalachat',
    url: 'https://dentalachat.com',
    type: 'prestashop-ajax',
  },
  {
    name: 'Go-Dentaire',
    supplierName: 'godentaire',
    url: 'https://www.go-dentaire.com',
    type: 'prestashop-ajax',
  },
  {
    name: 'TopDentaire',
    supplierName: 'topdentaire',
    url: 'https://www.topdentaire.fr',
    type: 'prestashop-ajax',
  },
  {
    name: 'DentalPrive',
    supplierName: 'dentalprive',
    url: 'https://www.dentalprive.fr',
    type: 'prestashop-ajax',
  },
];

// =============================================
// MAIN
// =============================================

async function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI MULTI-SUPPLIER API SCRAPER                     ║');
  log(`║  ${SITES.length} fournisseurs — API-first (pas de Puppeteer)       ║`);
  log('╚══════════════════════════════════════════════════════════╝');

  // Filter by --site arg
  let targetSite = null;
  const siteArg = process.argv.indexOf('--site');
  if (siteArg >= 0) targetSite = process.argv[siteArg + 1];
  const sitesToScrape = targetSite
    ? SITES.filter(s => s.supplierName === targetSite)
    : SITES;

  const results = {};
  const startTime = Date.now();

  for (const site of sitesToScrape) {
    try {
      let count = 0;
      switch (site.type) {
        case 'shopify':
          count = await scrapeShopify(site);
          break;
        case 'woocommerce':
          count = await scrapeWooCommerce(site);
          break;
        case 'prestashop-ajax':
          count = await scrapePrestashopAjax(site);
          break;
      }
      results[site.supplierName] = count;
    } catch (err) {
      log(`❌ ${site.name}: ${err.message}`);
      results[site.supplierName] = 0;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalNew = Object.values(results).reduce((s, c) => s + c, 0);

  log('\n═══════════════════════════════════════════════');
  log(`MULTI-SUPPLIER TERMINÉ en ${elapsed} min`);
  Object.entries(results).forEach(([name, count]) => {
    log(`  ${name}: ${count} produits`);
  });
  log(`  TOTAL IMPORTÉ: ${totalNew}`);
  log('═══════════════════════════════════════════════');

  // Send email report
  let html = `<h2>🦷 Multi-Supplier Scraper TERMINÉ</h2>`;
  html += `<p>Durée: ${elapsed} min</p>`;
  html += `<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:Arial">`;
  html += `<tr style="background:#16213e;color:white"><th>Fournisseur</th><th>Produits</th></tr>`;
  Object.entries(results).sort((a,b)=>b[1]-a[1]).forEach(([name, count]) => {
    html += `<tr><td>${name}</td><td><b>${count.toLocaleString()}</b></td></tr>`;
  });
  html += `<tr style="background:#16213e;color:white"><td><b>TOTAL</b></td><td><b>${totalNew.toLocaleString()}</b></td></tr>`;
  html += `</table>`;

  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>',
      to: EMAIL_TO,
      subject: `🦷 Multi-Supplier: ${totalNew.toLocaleString()} produits importés (${sitesToScrape.length} sites)`,
      html,
    });
  } catch (e) {}
}

main().catch(err => {
  log(`ERREUR FATALE: ${err.message}`);
  process.exit(1);
});
