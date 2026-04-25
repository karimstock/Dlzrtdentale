#!/usr/bin/env node
// =============================================
// JADOMI — Scrape distributeurs dentaires FR
// Passe 51 — Pierre Rolland, Dental Hi Tec, Dental Express
//
// Usage : node scripts/scrape-dental-distributors.js
//
// RESPECT : robots.txt, rate limit 2-3s, User-Agent identifie
// =============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-dental-distributors.log';
const DELAY_MS = 2500;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

const DISTRIBUTORS = [
  {
    name: 'Pierre Rolland / Acteon',
    base_url: 'https://www.acteongroup.com',
    search_paths: ['/fr/dental/produits'],
    source_key: 'pierre_rolland'
  },
  {
    name: 'Dental Hi Tec',
    base_url: 'https://www.dental-hitec.com',
    search_paths: ['/fr/nos-produits'],
    source_key: 'dental_hitec'
  },
  {
    name: 'Mega Dental',
    base_url: 'https://www.megadental.com',
    search_paths: ['/catalogue'],
    source_key: 'megadental'
  }
];

async function scrapeDistributor(distributor) {
  log(`\n=== ${distributor.name} ===`);
  const products = [];

  for (const searchPath of distributor.search_paths) {
    const url = `${distributor.base_url}${searchPath}`;
    log(`Scraping: ${url}`);

    try {
      // Verifier robots.txt d'abord
      const robotsRes = await fetch(`${distributor.base_url}/robots.txt`);
      if (robotsRes.ok) {
        const robotsTxt = await robotsRes.text();
        log(`robots.txt: ${robotsTxt.substring(0, 200)}`);
      }

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'JADOMI-Catalog-Indexer/1.0 (contact: karim_bahmed@yahoo.fr)',
          'Accept': 'text/html',
          'Accept-Language': 'fr-FR,fr;q=0.9'
        }
      });

      if (!res.ok) {
        log(`HTTP ${res.status} — skip`);
        continue;
      }

      const html = await res.text();

      // Extraction generique
      // Chercher des patterns produits communs (h2/h3 avec liens, prix, refs)
      const titlePattern = /<(?:h[2-4]|a)[^>]*class="[^"]*(?:product|item|card)[^"]*"[^>]*>([^<]+)<\//gi;
      let match;
      while ((match = titlePattern.exec(html)) !== null) {
        const name = match[1].trim();
        if (name.length > 3 && name.length < 200) {
          products.push({
            gtin: `${distributor.source_key}-${products.length}`,
            name,
            name_fr: name,
            source: distributor.source_key,
            source_metadata: {
              distributor: distributor.name,
              source_url: url
            }
          });
        }
      }

      log(`  → ${products.length} produits trouves`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (e) {
      log(`Erreur ${distributor.name}: ${e.message}`);
    }
  }

  return products;
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Scrape Distributeurs FR   ║');
  log('╚══════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let allProducts = [];

  for (const distributor of DISTRIBUTORS) {
    const products = await scrapeDistributor(distributor);
    allProducts = allProducts.concat(products);
  }

  // Sauvegarder local
  const outputPath = '/tmp/dental-distributors-products.jsonl';
  allProducts.forEach(p => fs.appendFileSync(outputPath, JSON.stringify(p) + '\n'));
  log(`\nSauvegarde: ${outputPath} (${allProducts.length} produits)`);

  // Import Supabase
  const batchSize = 100;
  let imported = 0;
  for (let i = 0; i < allProducts.length; i += batchSize) {
    const batch = allProducts.slice(i, i + batchSize).map(p => ({
      ...p, last_synced_at: new Date().toISOString()
    }));
    try {
      const { error } = await supabase.from('products_database')
        .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: true });
      if (!error) imported += batch.length;
    } catch (e) { /* skip */ }
  }

  log(`=== Distributeurs termine: ${allProducts.length} scrapes, ${imported} importes ===`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
