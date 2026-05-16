#!/usr/bin/env node
/**
 * BUILDER PRIX DPI (dentalpromotion.fr)
 * Cherche les prix pour chaque produit DPI via search_api_fulltext
 * Capture: prix catalogue (barré) + prix promo + % réduction
 *
 * Usage: node scripts/enrich-dpi-prices.js
 */

const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', 'tmp');
const OUTPUT = path.join(TMP, 'dpi-prices.json');
const PROGRESS = path.join(TMP, 'dpi-prices-progress.json');

// Charger les produits DPI depuis le catalogue extrait
const DPI_FILES = [
  'dpi-catalogue-general.json',
  'dpi-pdfplumber-tables.json'
];

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchDPI(query) {
  const q = encodeURIComponent(query);
  const url = `https://www.dentalpromotion.fr/shop?search_api_fulltext=${q}`;
  const ua = UAS[Math.floor(Math.random() * UAS.length)];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': 'text/html' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const html = await r.text();

    // Extract prices
    const results = [];

    // Pattern: prix barré (catalogue) + prix promo
    const promoPattern = /promo-price-crossed[^>]*>[^<]*<s>([0-9]+[,.]?[0-9]*)\s*€[\s\S]*?product-price-value[^>]*>([0-9]+[,.]?[0-9]*)\s*€/g;
    // Pattern: prix simple (sans promo)
    const simplePattern = /product-price-value[^>]*>([0-9]+[,.]?[0-9]*)\s*€/g;
    // Pattern: réduction %
    const reductionPattern = /promo-price-reduction[^>]*>\s*-?(\d+)%/g;

    // Extraire les paires barré/promo
    let match;
    while ((match = promoPattern.exec(html)) !== null) {
      results.push({
        prix_catalogue: parseFloat(match[1].replace(',', '.')),
        prix_promo: parseFloat(match[2].replace(',', '.')),
      });
    }

    // Si pas de paire, extraire les prix simples
    if (results.length === 0) {
      while ((match = simplePattern.exec(html)) !== null) {
        results.push({
          prix_catalogue: null,
          prix_promo: parseFloat(match[1].replace(',', '.'))
        });
      }
    }

    // Extraire réductions
    const reductions = [];
    while ((match = reductionPattern.exec(html)) !== null) {
      reductions.push(parseInt(match[1]));
    }

    // Extraire les noms produits trouvés
    const namePattern = /field--name-title[^>]*>([^<]+)/g;
    const names = [];
    while ((match = namePattern.exec(html)) !== null) {
      names.push(match[1].trim());
    }

    // Aussi extraire les URLs produits
    const urlPattern = /href="(https:\/\/www\.dentalpromotion\.fr\/shop\/[^"]+)"/g;
    const urls = [];
    while ((match = urlPattern.exec(html)) !== null) {
      urls.push(match[1]);
    }

    return {
      prices: results,
      reductions,
      names,
      urls,
      total_results: results.length
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('=== DPI PRICE BUILDER ===');

  // Load DPI products
  let allProducts = [];
  for (const f of DPI_FILES) {
    const fp = path.join(TMP, f);
    if (fs.existsSync(fp)) {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const prods = data.products || data;
      console.log(`  ${f}: ${prods.length} produits`);
      for (const p of prods) {
        const ref = p.ref || p.sku || '';
        const name = p.product || p.name || '';
        if (ref && !allProducts.find(x => x.ref === ref)) {
          allProducts.push({ ref, name, brand: p.brand || 'DPI', price_pdf: p.price || p.prixPromo || null });
        }
      }
    }
  }
  console.log(`Total unique: ${allProducts.length}`);

  // Load progress
  let results = {};
  if (fs.existsSync(PROGRESS)) {
    results = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log(`Reprise: ${Object.keys(results).length} déjà traités`);
  }

  let found = 0, errors = 0, skipped = 0;

  for (let i = 0; i < allProducts.length; i++) {
    const p = allProducts[i];

    if (results[p.ref]) { skipped++; continue; }

    // Chercher par ref d'abord
    let searchResult = await searchDPI(p.ref);

    // Si pas de résultat, chercher par nom
    if (!searchResult || searchResult.total_results === 0) {
      const shortName = (p.name || '').split(' ').slice(0, 4).join(' ');
      if (shortName.length > 3) {
        await delay(500);
        searchResult = await searchDPI(shortName);
      }
    }

    if (searchResult && searchResult.prices.length > 0) {
      const best = searchResult.prices[0];
      results[p.ref] = {
        ...p,
        prix_catalogue_web: best.prix_catalogue,
        prix_promo_web: best.prix_promo,
        reduction_pct: best.prix_catalogue && best.prix_promo
          ? Math.round((1 - best.prix_promo / best.prix_catalogue) * 100)
          : null,
        found_name: searchResult.names[0] || null,
        found_url: searchResult.urls[0] || null,
        enriched_at: new Date().toISOString()
      };
      found++;
    } else {
      results[p.ref] = { ...p, prix_catalogue_web: null, prix_promo_web: null, error: 'not_found' };
      errors++;
    }

    if ((i + 1) % 10 === 0) {
      const pct = Math.round(((i + 1) / allProducts.length) * 100);
      console.log(`[${pct}%] ${i + 1}/${allProducts.length} | Prix: ${found} | Erreurs: ${errors} | Skip: ${skipped}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(results, null, 2));
    }

    await delay(1500);
  }

  // Save
  const output = {
    source: 'DPI - Dental Promotion',
    enriched_at: new Date().toISOString(),
    stats: {
      total: allProducts.length,
      with_price: Object.values(results).filter(r => r.prix_promo_web).length,
      with_catalogue_price: Object.values(results).filter(r => r.prix_catalogue_web).length,
      not_found: errors
    },
    products: Object.values(results)
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log('\n=== RÉSUMÉ ===');
  console.log(`Traités: ${Object.keys(results).length}`);
  console.log(`Prix promo trouvés: ${output.stats.with_price}`);
  console.log(`Prix catalogue (barré): ${output.stats.with_catalogue_price}`);
  console.log(`Non trouvés: ${errors}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
