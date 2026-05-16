#!/usr/bin/env node
/**
 * SCRAPER MULTI-FOURNISSEURS - Nouveaux sites
 * Scrape en parallèle : 2CMED, B2B-Dental, DentalGoodDeal, Promodentaire
 * Via sitemaps + JSON-LD / HTML parsing
 *
 * Usage: node scripts/scrape-new-suppliers.js
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
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html,application/json' }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

function extractJsonLd(html) {
  const products = [];
  const matches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const m of matches) {
    try {
      const data = JSON.parse(m.replace(/<\/?script[^>]*>/g, ''));
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          products.push({
            ref: item.sku || item.mpn || item.productID || '',
            name: item.name || '',
            brand: item.brand?.name || item.brand || '',
            price: item.offers?.price ? parseFloat(item.offers.price) : (item.offers?.lowPrice ? parseFloat(item.offers.lowPrice) : null),
            image: typeof item.image === 'string' ? item.image : (Array.isArray(item.image) ? item.image[0] : ''),
            inStock: item.offers?.availability?.includes('InStock') || false
          });
        }
      }
    } catch (e) {}
  }
  return products;
}

function extractHtmlProduct(html, url) {
  const nameMatch = html.match(/<h1[^>]*>([^<]+)/) || html.match(/product-name[^>]*>([^<]+)/);
  const priceMatch = html.match(/data-price-amount="([0-9.]+)"/) || html.match(/(\d+[,\.]\d{2})\s*€/);
  const refMatch = html.match(/itemprop="sku"[^>]*content="([^"]*)"/) || html.match(/sku['":\s]+['"]([A-Z0-9\-\.]+)/i);
  if (!nameMatch) return null;
  return {
    ref: refMatch ? refMatch[1] : '',
    name: nameMatch[1].trim(),
    price: priceMatch ? parseFloat((priceMatch[1] || priceMatch[0]).replace(',', '.')) : null
  };
}

async function scrapeSitemap(sitemapUrl, supplierName, outputFile) {
  console.log(`\n=== ${supplierName} ===`);
  const progressFile = path.join(TMP, `${supplierName.toLowerCase().replace(/\s/g, '-')}-progress.json`);

  // Get sitemap
  const xml = await fetchPage(sitemapUrl, 15000);
  if (!xml) { console.log('  Sitemap inaccessible'); return; }

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1])
    .filter(u => !u.includes('/blog') && !u.includes('/contact') && !u.includes('/admin') &&
                 !u.endsWith('.xml') && !u.includes('/category') && !u.includes('/info/'));
  console.log(`  URLs: ${urls.length}`);

  // Load progress
  let results = {};
  if (fs.existsSync(progressFile)) {
    results = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    console.log(`  Reprise: ${Object.keys(results).length} déjà faits`);
  }

  let found = 0, errors = 0, skipped = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (results[url]) { skipped++; continue; }

    const html = await fetchPage(url);
    if (!html) { results[url] = { error: 'fetch' }; errors++; }
    else {
      const jsonLd = extractJsonLd(html);
      if (jsonLd.length > 0) {
        results[url] = { url, products: jsonLd, supplier: supplierName };
        found++;
      } else {
        const fallback = extractHtmlProduct(html, url);
        if (fallback) {
          results[url] = { url, products: [fallback], supplier: supplierName };
          found++;
        } else {
          results[url] = { url, error: 'no_product' };
          errors++;
        }
      }
    }

    if ((i + 1) % 20 === 0) {
      const pct = Math.round(((i + 1) / urls.length) * 100);
      console.log(`  [${pct}%] ${i + 1}/${urls.length} | OK: ${found} | Err: ${errors} | Skip: ${skipped}`);
      fs.writeFileSync(progressFile, JSON.stringify(results));
    }
    await delay(1000);
  }

  // Save
  const allProducts = [];
  for (const entry of Object.values(results)) {
    if (entry.products) {
      for (const p of entry.products) {
        p.supplier = supplierName;
        allProducts.push(p);
      }
    }
  }

  fs.writeFileSync(path.join(TMP, outputFile), JSON.stringify({
    supplier: supplierName,
    scraped_at: new Date().toISOString(),
    stats: { urls: urls.length, products: allProducts.length, errors },
    products: allProducts
  }, null, 2));

  fs.writeFileSync(progressFile, JSON.stringify(results));
  console.log(`  ✓ ${supplierName}: ${allProducts.length} produits → ${outputFile}`);

  // Import to Supabase
  if (allProducts.length > 0) {
    const batchSize = 500;
    for (let b = 0; b < allProducts.length; b += batchSize) {
      const batch = allProducts.slice(b, b + batchSize).map(p => ({
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
  }
}

async function main() {
  console.log('=== SCRAPER NOUVEAUX FOURNISSEURS ===');
  console.log(`Heure: ${new Date().toISOString()}\n`);

  // 2CMED - sitemap connu
  await scrapeSitemap(
    'https://www.2cmed.com/1_fr_0_sitemap.xml',
    '2CMED',
    '2cmed-products.json'
  );

  // DentalGoodDeal - pas de sitemap, on utilise leur search
  console.log('\n=== DENTAL GOOD DEAL (search) ===');
  // DGD utilise un site custom, on va chercher page par page
  const dgdProducts = [];
  for (let page = 1; page <= 200; page++) {
    const url = `https://www.dentalgooddeal.com/recherche_cabinet?motcle=&page=${page}&tri=alpha_asc&par_page=100`;
    const html = await fetchPage(url);
    if (!html) break;

    const prods = [...html.matchAll(/class="produit_titre"[^>]*>([^<]+)/g)];
    const prices = [...html.matchAll(/class="produit_prix[^"]*"[^>]*>([0-9,\.]+)\s*€/g)];
    const refs = [...html.matchAll(/class="produit_ref[^"]*"[^>]*>(?:Réf\.\s*)?([^<]+)/g)];

    if (prods.length === 0) break;

    for (let j = 0; j < prods.length; j++) {
      dgdProducts.push({
        name: prods[j][1].trim(),
        price: prices[j] ? parseFloat(prices[j][1].replace(',', '.')) : null,
        ref: refs[j] ? refs[j][1].trim() : '',
        supplier: 'DentalGoodDeal'
      });
    }

    if (page % 10 === 0) console.log(`  Page ${page}: ${dgdProducts.length} produits cumulés`);
    await delay(800);
  }

  if (dgdProducts.length > 0) {
    fs.writeFileSync(path.join(TMP, 'dentalgooddeal-products.json'), JSON.stringify({
      supplier: 'DentalGoodDeal',
      scraped_at: new Date().toISOString(),
      stats: { products: dgdProducts.length },
      products: dgdProducts
    }, null, 2));
    console.log(`  ✓ DentalGoodDeal: ${dgdProducts.length} produits`);
  }

  console.log('\n=== TERMINÉ ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
