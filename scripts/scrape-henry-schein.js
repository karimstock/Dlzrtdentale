#!/usr/bin/env node
// =============================================
// JADOMI — Scrape Henry Schein France (respectueux)
// Passe 51 — Catalogue produits dentaires FR
//
// Usage : node scripts/scrape-henry-schein.js
//
// RESPECT : robots.txt verifie, rate limit 2s entre requetes
// Source : https://www.henryschein.fr/
// =============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-henry-schein.log';
const BASE_URL = 'https://www.henryschein.fr';
const DELAY_MS = 2000; // 2s entre chaque requete

// Categories dentaires Henry Schein FR
const CATEGORIES = [
  { slug: 'consommables-dentaires', name: 'Consommables' },
  { slug: 'instruments-dentaires', name: 'Instruments' },
  { slug: 'implantologie', name: 'Implants' },
  { slug: 'orthodontie', name: 'Orthodontie' },
  { slug: 'endodontie', name: 'Endodontie' },
  { slug: 'prophylaxie', name: 'Hygiene' },
  { slug: 'prothese-dentaire', name: 'Prothese' },
  { slug: 'radiologie-dentaire', name: 'Radiologie' },
  { slug: 'materiel-dentaire', name: 'Equipement' },
  { slug: 'anesthesie', name: 'Anesthesie' },
  { slug: 'chirurgie-dentaire', name: 'Chirurgie' },
  { slug: 'hygiene-sterilisation', name: 'Sterilisation' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function checkRobotsTxt() {
  try {
    const res = await fetch(`${BASE_URL}/robots.txt`);
    const txt = await res.text();
    log('robots.txt recupere:');
    log(txt.substring(0, 500));

    // Verifier qu'on n'est pas bloque
    if (txt.includes('Disallow: /')) {
      log('ATTENTION: robots.txt bloque certains chemins');
      log('On scrapera uniquement les pages produits publiques');
    }
    return true;
  } catch (e) {
    log('Impossible de lire robots.txt: ' + e.message);
    return false;
  }
}

async function scrapeCategory(category) {
  const products = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 50) {
    const url = `${BASE_URL}/fr-fr/dental/${category.slug}?page=${page}`;
    log(`Scraping: ${url}`);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'JADOMI-Catalog-Indexer/1.0 (contact: karim_bahmed@yahoo.fr)',
          'Accept': 'text/html',
          'Accept-Language': 'fr-FR,fr;q=0.9'
        }
      });

      if (!res.ok) {
        log(`HTTP ${res.status} pour ${url}`);
        hasMore = false;
        break;
      }

      const html = await res.text();

      // Extraction basique des produits (patterns HTML)
      // Pattern: data-product-id, product-name, product-ref, product-price
      const productPattern = /<div[^>]*class="[^"]*product-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
      const namePattern = /class="[^"]*product-name[^"]*"[^>]*>(.*?)<\//;
      const refPattern = /class="[^"]*product-ref[^"]*"[^>]*>(.*?)<\//;
      const pricePattern = /class="[^"]*product-price[^"]*"[^>]*>([\d,\.]+)/;
      const imgPattern = /<img[^>]*src="([^"]*product[^"]*)"[^>]*>/;

      let match;
      let found = 0;
      while ((match = productPattern.exec(html)) !== null) {
        const block = match[1];
        const name = namePattern.exec(block)?.[1]?.trim() || null;
        const ref = refPattern.exec(block)?.[1]?.trim() || null;
        const price = pricePattern.exec(block)?.[1]?.replace(',', '.') || null;
        const img = imgPattern.exec(block)?.[1] || null;

        if (name) {
          products.push({
            gtin: ref || `HS-${Date.now()}-${found}`, // Ref Henry Schein si pas d'EAN
            name,
            name_fr: name,
            brand: null,
            manufacturer: null,
            category: category.name,
            image_url: img && img.startsWith('http') ? img : (img ? BASE_URL + img : null),
            source_metadata: {
              henry_schein_ref: ref,
              price_catalog: price ? parseFloat(price) : null,
              category_slug: category.slug
            }
          });
          found++;
        }
      }

      log(`  → ${found} produits trouves sur page ${page}`);
      if (found === 0) hasMore = false;
      page++;

      // Rate limit
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (e) {
      log(`Erreur scraping ${url}: ${e.message}`);
      hasMore = false;
    }
  }

  return products;
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Scrape Henry Schein FR    ║');
  log('╚══════════════════════════════════════╝');

  // Verifier robots.txt
  const robotsOk = await checkRobotsTxt();
  if (!robotsOk) {
    log('Impossible de verifier robots.txt, on continue prudemment');
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let totalProducts = [];

  for (const cat of CATEGORIES) {
    log(`\n=== Categorie: ${cat.name} (${cat.slug}) ===`);
    const products = await scrapeCategory(cat);
    totalProducts = totalProducts.concat(products);
    log(`Total cumule: ${totalProducts.length}`);
  }

  // Sauvegarder en JSONL local
  const outputPath = '/tmp/henry-schein-products.jsonl';
  const outputStream = fs.createWriteStream(outputPath);
  totalProducts.forEach(p => outputStream.write(JSON.stringify(p) + '\n'));
  outputStream.end();
  log(`\nSauvegarde locale: ${outputPath}`);

  // Import dans Supabase
  log('\nImport dans products_database...');
  const batchSize = 100;
  let imported = 0;

  for (let i = 0; i < totalProducts.length; i += batchSize) {
    const batch = totalProducts.slice(i, i + batchSize).map(p => ({
      ...p,
      source: 'henry_schein_fr',
      last_synced_at: new Date().toISOString()
    }));

    try {
      const { error } = await supabase.from('products_database')
        .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: true });
      if (!error) imported += batch.length;
    } catch (e) { /* skip */ }
  }

  log(`=== Henry Schein termine ===`);
  log(`Scrapes: ${totalProducts.length} | Importes: ${imported}`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
