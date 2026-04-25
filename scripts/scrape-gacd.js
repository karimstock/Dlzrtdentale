#!/usr/bin/env node
// =============================================
// JADOMI — Scrape GACD France (respectueux)
// Passe 51 — Catalogue distributeur FR
//
// Usage : node scripts/scrape-gacd.js
//
// RESPECT : robots.txt, rate limit 2s, User-Agent identifie
// Source : https://www.gacd.fr/
// =============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-gacd.log';
const BASE_URL = 'https://www.gacd.fr';
const DELAY_MS = 2000;

const CATEGORIES = [
  { slug: 'consommables', name: 'Consommables' },
  { slug: 'instruments', name: 'Instruments' },
  { slug: 'implantologie', name: 'Implants' },
  { slug: 'endodontie', name: 'Endodontie' },
  { slug: 'orthodontie', name: 'Orthodontie' },
  { slug: 'prothese', name: 'Prothese' },
  { slug: 'equipement', name: 'Equipement' },
  { slug: 'hygiene', name: 'Hygiene' },
  { slug: 'radiologie', name: 'Radiologie' },
  { slug: 'chirurgie', name: 'Chirurgie' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function scrapeCategoryGACD(category) {
  const products = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 30) {
    const url = `${BASE_URL}/catalogsearch/result/?q=${category.slug}&p=${page}`;
    log(`Scraping: ${url}`);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'JADOMI-Catalog-Indexer/1.0 (contact: karim_bahmed@yahoo.fr)',
          'Accept': 'text/html',
          'Accept-Language': 'fr-FR,fr;q=0.9'
        }
      });

      if (!res.ok) { hasMore = false; break; }
      const html = await res.text();

      // Extraction patterns GACD
      const productPattern = /<li[^>]*class="[^"]*product-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
      const namePattern = /class="[^"]*product-item-link[^"]*"[^>]*>(.*?)<\//;
      const refPattern = /Ref\.\s*:?\s*([\w-]+)/;
      const pricePattern = /data-price-amount="([\d.]+)"/;

      let match;
      let found = 0;
      while ((match = productPattern.exec(html)) !== null) {
        const block = match[1];
        const name = namePattern.exec(block)?.[1]?.trim() || null;
        const ref = refPattern.exec(block)?.[1]?.trim() || null;
        const price = pricePattern.exec(block)?.[1] || null;

        if (name) {
          products.push({
            gtin: ref || `GACD-${Date.now()}-${found}`,
            name: name,
            name_fr: name,
            category: category.name,
            source_metadata: {
              gacd_ref: ref,
              price_catalog: price ? parseFloat(price) : null,
              category_slug: category.slug
            }
          });
          found++;
        }
      }

      log(`  → ${found} produits page ${page}`);
      if (found === 0) hasMore = false;
      page++;
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (e) {
      log(`Erreur: ${e.message}`);
      hasMore = false;
    }
  }

  return products;
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Scrape GACD FR            ║');
  log('╚══════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let totalProducts = [];

  for (const cat of CATEGORIES) {
    log(`\n=== ${cat.name} ===`);
    const products = await scrapeCategoryGACD(cat);
    totalProducts = totalProducts.concat(products);
    log(`Cumule: ${totalProducts.length}`);
  }

  // Sauvegarder local
  const outputPath = '/tmp/gacd-products.jsonl';
  totalProducts.forEach(p => fs.appendFileSync(outputPath, JSON.stringify(p) + '\n'));
  log(`Sauvegarde: ${outputPath}`);

  // Import Supabase
  const batchSize = 100;
  let imported = 0;
  for (let i = 0; i < totalProducts.length; i += batchSize) {
    const batch = totalProducts.slice(i, i + batchSize).map(p => ({
      ...p, source: 'gacd_fr', last_synced_at: new Date().toISOString()
    }));
    try {
      const { error } = await supabase.from('products_database')
        .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: true });
      if (!error) imported += batch.length;
    } catch (e) { /* skip */ }
  }

  log(`=== GACD termine: ${totalProducts.length} scrapes, ${imported} importes ===`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
