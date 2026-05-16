#!/usr/bin/env node
/**
 * DPI PRICE BUILDER V2 — via sitemap + JSON-LD
 * 1. Télécharge les 8719 URLs du sitemap DPI
 * 2. Pour chaque page produit, extrait le JSON-LD (ref, nom, prix, stock)
 * 3. Matche avec nos refs PDF existantes
 *
 * Usage: node scripts/enrich-dpi-sitemap.js
 */

const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', 'tmp');
const OUTPUT = path.join(TMP, 'dpi-sitemap-products.json');
const PROGRESS = path.join(TMP, 'dpi-sitemap-progress.json');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': 'text/html' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    return null;
  }
}

function extractProducts(html, pageUrl) {
  const products = [];

  // JSON-LD extraction (DPI uses Product schema with variants)
  const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (ldMatches) {
    for (const m of ldMatches) {
      try {
        const jsonStr = m.replace(/<\/?script[^>]*>/g, '');
        const data = JSON.parse(jsonStr);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product' || item.type === 'Product') {
            products.push({
              ref: item.sku || item.productID || item.id || '',
              name: item.name || '',
              brand: item.brand?.name || item.brand || '',
              price: item.offers?.price ? parseFloat(item.offers.price) : null,
              currency: item.offers?.priceCurrency || 'EUR',
              inStock: item.offers?.availability?.includes('InStock') || false,
              image: item.image || '',
              url: pageUrl
            });
          }
        }
      } catch (e) {}
    }
  }

  // Fallback: HTML extraction
  if (products.length === 0) {
    // Product name
    const nameMatch = html.match(/data-product-name="([^"]*)"/);
    // Price
    const promoMatch = html.match(/product-price-value[^>]*>([0-9]+[,.]?[0-9]*)\s*€/);
    const barreMatch = html.match(/promo-price-crossed[^>]*>[^<]*<s>([0-9]+[,.]?[0-9]*)\s*€/);
    // Ref from breadcrumb or product page
    const refMatch = html.match(/itemprop="sku"[^>]*content="([^"]*)"/);

    if (nameMatch || promoMatch) {
      products.push({
        ref: refMatch ? refMatch[1] : '',
        name: nameMatch ? nameMatch[1] : '',
        price: promoMatch ? parseFloat(promoMatch[1].replace(',', '.')) : null,
        price_barre: barreMatch ? parseFloat(barreMatch[1].replace(',', '.')) : null,
        url: pageUrl
      });
    }
  }

  return products;
}

async function main() {
  console.log('=== DPI SITEMAP BUILDER ===\n');

  // Step 1: Get all URLs from sitemap
  console.log('Récupération du sitemap DPI...');
  let allUrls = [];
  for (let page = 1; page <= 5; page++) {
    const sitemapUrl = `https://www.dentalpromotion.fr/sitemap.xml?page=${page}`;
    const xml = await fetchPage(sitemapUrl);
    if (!xml) continue;
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    // Filter: skip /shop/cat/ (categories) and non-product pages
    const productUrls = urls.filter(u =>
      u !== 'https://www.dentalpromotion.fr/' &&
      u !== 'https://www.dentalpromotion.fr/shop' &&
      !u.includes('/cat/') &&
      !u.includes('/user') &&
      !u.includes('/admin')
    );
    allUrls = allUrls.concat(productUrls);
    console.log(`  Page ${page}: ${productUrls.length} produits`);
  }
  console.log(`Total URLs produit: ${allUrls.length}\n`);

  // Step 2: Load progress
  let results = {};
  if (fs.existsSync(PROGRESS)) {
    results = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log(`Reprise: ${Object.keys(results).length} déjà traités`);
  }

  let found = 0, errors = 0, skipped = 0, variants = 0;

  // Step 3: Scrape each product page
  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];

    if (results[url]) { skipped++; continue; }

    const html = await fetchPage(url);
    if (!html) {
      results[url] = { url, error: 'fetch_failed' };
      errors++;
    } else {
      const products = extractProducts(html, url);
      if (products.length > 0) {
        results[url] = { url, products };
        found++;
        variants += products.length;
      } else {
        results[url] = { url, products: [], error: 'no_product' };
        errors++;
      }
    }

    if ((i + 1) % 20 === 0) {
      const pct = Math.round(((i + 1) / allUrls.length) * 100);
      console.log(`[${pct}%] ${i + 1}/${allUrls.length} | Produits: ${found} (${variants} variantes) | Erreurs: ${errors} | Skip: ${skipped}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(results));
    }

    await delay(300); // 3 req/s — DPI n'a pas de protection forte
  }

  // Step 4: Flatten and save
  const allProducts = [];
  for (const entry of Object.values(results)) {
    if (entry.products) {
      for (const p of entry.products) {
        if (p.ref || p.name) allProducts.push(p);
      }
    }
  }

  const output = {
    source: 'DPI dentalpromotion.fr - Sitemap complet',
    scraped_at: new Date().toISOString(),
    stats: {
      urls_total: allUrls.length,
      pages_scraped: found,
      products_found: allProducts.length,
      errors
    },
    products: allProducts
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log('\n=== RÉSUMÉ ===');
  console.log(`URLs: ${allUrls.length}`);
  console.log(`Pages OK: ${found}`);
  console.log(`Produits (avec variantes): ${allProducts.length}`);
  console.log(`Erreurs: ${errors}`);
  console.log(`Fichier: ${OUTPUT}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
