#!/usr/bin/env node
/**
 * SCRAPER FOURNISSEURS PROTHÉSISTES
 * CAP Dentaire (5888 URLs) + Go-Dentaire (10452 URLs)
 * PrestaShop → JSON-LD extraction
 *
 * Usage: node scripts/scrape-prothesiste-suppliers.js
 */

const fs = require('fs');
const path = require('path');
const TMP = path.join(__dirname, '..', 'tmp');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url, timeout = 10000) {
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html' }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

function extractProduct(html, url) {
  // JSON-LD
  const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m.replace(/<\/?script[^>]*>/g, ''));
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          const offers = item.offers || {};
          const price = offers.price || offers.lowPrice;
          return {
            ref: item.sku || item.mpn || item.productID || '',
            name: item.name || '',
            brand: item.brand?.name || item.brand || '',
            description: (item.description || '').slice(0, 200),
            price: price ? parseFloat(price) : null,
            currency: offers.priceCurrency || 'EUR',
            inStock: (offers.availability || '').includes('InStock'),
            image: typeof item.image === 'string' ? item.image : (Array.isArray(item.image) ? item.image[0] : ''),
            url
          };
        }
      }
    } catch (e) {}
  }

  // Fallback HTML
  const h1 = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)/) || html.match(/<h1[^>]*>([^<]+)/);
  const priceM = html.match(/itemprop="price"[^>]*content="([^"]+)"/) || html.match(/current-price[^>]*>([0-9,\.]+)/);
  const refM = html.match(/itemprop="sku"[^>]*content="([^"]+)"/) || html.match(/reference[^>]*>([^<]+)/);
  if (h1) {
    return {
      ref: refM ? refM[1].trim() : '',
      name: h1[1].trim(),
      price: priceM ? parseFloat(priceM[1].replace(',', '.')) : null,
      url
    };
  }
  return null;
}

async function scrapeSite(sitemapUrl, supplierName, outputFile) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${supplierName}`);
  console.log(`${'='.repeat(50)}`);

  const progressFile = path.join(TMP, `${outputFile.replace('.json', '')}-progress.json`);

  // Get sitemap
  const xml = await fetchPage(sitemapUrl, 15000);
  if (!xml) { console.log('  Sitemap inaccessible'); return 0; }

  // Filter product URLs (skip categories, CMS pages, etc.)
  const allUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1])
    .filter(u => {
      const lower = u.toLowerCase();
      return !lower.includes('/blog') && !lower.includes('/content/') &&
             !lower.includes('/info/') && !lower.includes('/module/') &&
             !lower.includes('/contactez') && !lower.includes('/mon-compte') &&
             !lower.includes('/panier') && !lower.includes('/commande') &&
             !lower.includes('/sitemap') && !lower.endsWith('.xml');
    });

  console.log(`  URLs totales: ${allUrls.length}`);

  // Load progress
  let results = {};
  if (fs.existsSync(progressFile)) {
    results = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    console.log(`  Reprise: ${Object.keys(results).length} déjà faits`);
  }

  let found = 0, errors = 0, skipped = 0;

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    if (results[url]) { skipped++; continue; }

    const html = await fetchPage(url);
    if (!html) {
      results[url] = { error: 'fetch' };
      errors++;
    } else {
      const product = extractProduct(html, url);
      if (product && product.name) {
        product.supplier = supplierName;
        results[url] = product;
        found++;
      } else {
        results[url] = { error: 'no_product', url };
        errors++;
      }
    }

    if ((i + 1) % 50 === 0) {
      const pct = Math.round(((i + 1) / allUrls.length) * 100);
      console.log(`  [${pct}%] ${i + 1}/${allUrls.length} | Produits: ${found} | Err: ${errors} | Skip: ${skipped}`);
      fs.writeFileSync(progressFile, JSON.stringify(results));
    }

    await delay(500); // Rapide mais poli
  }

  // Save final
  const products = Object.values(results).filter(p => p.name && !p.error);
  const output = {
    supplier: supplierName,
    scraped_at: new Date().toISOString(),
    stats: {
      urls: allUrls.length,
      products: products.length,
      with_price: products.filter(p => p.price).length,
      errors
    },
    products
  };

  fs.writeFileSync(path.join(TMP, outputFile), JSON.stringify(output, null, 2));
  fs.writeFileSync(progressFile, JSON.stringify(results));

  console.log(`  ✓ ${supplierName}: ${products.length} produits (${output.stats.with_price} avec prix)`);

  // Import to Supabase
  const batchSize = 500;
  for (let b = 0; b < products.length; b += batchSize) {
    const batch = products.slice(b, b + batchSize).map(p => ({
      supplier_name: supplierName,
      product_name: p.name,
      brand: p.brand || '',
      reference: p.ref || '',
      price: p.price || null,
      url: p.url || ''
    }));
    try {
      await fetch('http://localhost:3001/api/scan/import-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: supplierName.toLowerCase().replace(/\s/g, '-'), products: batch })
      });
    } catch (e) {}
  }
  console.log(`  → Importé dans Supabase`);

  return products.length;
}

async function main() {
  console.log('=== SCRAPER FOURNISSEURS PROTHÉSISTES ===');
  console.log(`${new Date().toISOString()}\n`);

  let total = 0;

  // CAP Dentaire - 5888 URLs - Centrale d'achat prothésiste
  total += await scrapeSite(
    'https://www.capdentaire.com/1_fr_0_sitemap.xml',
    'CAP Dentaire',
    'capdentaire-products.json'
  );

  // Go-Dentaire - 10452 URLs
  total += await scrapeSite(
    'https://www.go-dentaire.com/1_fr_0_sitemap.xml',
    'Go-Dentaire',
    'godentaire-products.json'
  );

  // dents.henryschein.fr - Site LABO HS (14000 refs, on a déjà le builder mais pas les noms)
  // On scrape les catégories pour avoir les noms complets
  // Skip pour l'instant car le builder HS tourne déjà

  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL PROTHÉSISTE: ${total} produits`);
  console.log(`${'='.repeat(50)}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
