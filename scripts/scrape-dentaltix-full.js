#!/usr/bin/env node
/**
 * DENTALTIX FULL SCRAPER
 * 1. Parse le sitemap espagnol (1415 URLs)
 * 2. Pour chaque produit, extrait nom + ref + prix depuis la page ES
 * 3. Cherche le même produit sur le site FR pour avoir le prix FR
 *
 * Usage: node scripts/scrape-dentaltix-full.js
 */

const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', 'tmp');
const OUTPUT = path.join(TMP, 'dentaltix-full.json');
const PROGRESS = path.join(TMP, 'dentaltix-full-progress.json');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    return null;
  }
}

function extractProduct(html, url) {
  // JSON-LD
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ldMatch) {
    try {
      const data = JSON.parse(ldMatch[1]);
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          return {
            ref: item.sku || item.mpn || '',
            name: item.name || '',
            brand: item.brand?.name || '',
            price: item.offers?.price ? parseFloat(item.offers.price) : (item.offers?.lowPrice ? parseFloat(item.offers.lowPrice) : null),
            currency: item.offers?.priceCurrency || 'EUR',
            image: typeof item.image === 'string' ? item.image : (item.image?.[0] || ''),
            url_es: url
          };
        }
      }
    } catch (e) {}
  }

  // Fallback HTML
  const nameMatch = html.match(/<h1[^>]*>([^<]+)/);
  const priceMatch = html.match(/(\d+[,\.]\d{2})\s*€/);
  const refMatch = html.match(/sku['":\s]+['"]?([A-Z0-9\-\.]+)/i);

  if (nameMatch) {
    return {
      ref: refMatch ? refMatch[1] : '',
      name: nameMatch[1].trim(),
      price: priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null,
      url_es: url
    };
  }
  return null;
}

async function main() {
  console.log('=== DENTALTIX FULL SCRAPER ===\n');

  // Step 1: Parse sitemap espagnol
  console.log('Parsing sitemap espagnol...');
  const sitemapXml = await fetchPage('https://www.dentaltix.com/sitemap.xml');
  if (!sitemapXml) { console.error('Impossible de charger le sitemap'); process.exit(1); }

  const allUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1])
    .filter(u => !u.includes('/blog/') && !u.includes('/contact') && !u.includes('/error') &&
                 !u.includes('/condiciones') && !u.includes('/politica') &&
                 u !== 'https://www.dentaltix.com/es/' &&
                 u.includes('/es/'));

  console.log(`URLs produit ES: ${allUrls.length}\n`);

  // Step 2: Load progress
  let results = {};
  if (fs.existsSync(PROGRESS)) {
    results = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log(`Reprise: ${Object.keys(results).length} déjà traités`);
  }

  let found = 0, errors = 0, skipped = 0;

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    if (results[url]) { skipped++; continue; }

    const html = await fetchPage(url);
    if (!html) {
      results[url] = { url, error: 'fetch_failed' };
      errors++;
    } else {
      const product = extractProduct(html, url);
      if (product && (product.name || product.ref)) {
        // Construire l'URL FR equivalent
        const frUrl = url.replace('/es/', '/fr/');
        product.url_fr = frUrl;
        results[url] = product;
        found++;
      } else {
        results[url] = { url, error: 'no_product' };
        errors++;
      }
    }

    if ((i + 1) % 20 === 0) {
      const pct = Math.round(((i + 1) / allUrls.length) * 100);
      console.log(`[${pct}%] ${i + 1}/${allUrls.length} | Produits: ${found} | Erreurs: ${errors} | Skip: ${skipped}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(results));
    }

    await delay(1500);
  }

  // Step 3: Flatten and save
  const products = Object.values(results).filter(p => p.name && !p.error);

  const output = {
    source: 'Dentaltix - Sitemap ES → FR',
    scraped_at: new Date().toISOString(),
    stats: {
      urls_es: allUrls.length,
      products_found: products.length,
      with_price: products.filter(p => p.price).length,
      errors
    },
    products
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log('\n=== RÉSUMÉ ===');
  console.log(`URLs ES: ${allUrls.length}`);
  console.log(`Produits trouvés: ${products.length}`);
  console.log(`Avec prix: ${output.stats.with_price}`);
  console.log(`Fichier: ${OUTPUT}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
