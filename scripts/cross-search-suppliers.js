#!/usr/bin/env node
/**
 * JADOMI — Cross-search fournisseurs
 * Prend les noms de produits d'un fournisseur et les cherche sur les autres sites
 * pour trouver les memes produits avec prix differents
 *
 * Strategie : GACD (44K refs) = base de reference
 * → cherche chaque produit sur Doctor Strong, Doctor AI, Mega Dental, etc.
 *
 * Usage: node scripts/cross-search-suppliers.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PROGRESS_FILE = '/home/ubuntu/jadomi/tmp/cross-search-progress.json';
const RESULTS_FILE = '/home/ubuntu/jadomi/tmp/cross-search-results.json';
const LOG_FILE = '/tmp/cross-search.log';

// Sites a chercher (ceux qui ont une recherche web)
const SEARCH_SITES = [
  {
    name: 'doctorstrong',
    searchUrl: (q) => `https://www.doctorstrong.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    priceRegex: /data-price-amount="([0-9.]+)"|"price"\s*:\s*"?([0-9.]+)/g,
    nameRegex: /<h[23][^>]*class="[^"]*product[^"]*"[^>]*>\s*<a[^>]*>([^<]+)/g
  },
  {
    name: 'doctorai',
    searchUrl: (q) => `https://www.doctor-ai.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    priceRegex: /data-price-amount="([0-9.]+)"|"price"\s*:\s*"?([0-9.]+)/g,
    nameRegex: /<h[23][^>]*class="[^"]*product[^"]*"[^>]*>\s*<a[^>]*>([^<]+)/g
  },
  {
    name: 'megadental',
    searchUrl: (q) => `https://www.megadental.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    priceRegex: /data-price-amount="([0-9.]+)"|"price"\s*:\s*"?([0-9.]+)/g,
    nameRegex: /<h[23][^>]*class="[^"]*product[^"]*"[^>]*>\s*<a[^>]*>([^<]+)/g
  }
];

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const ua = UAS[Math.floor(Math.random() * UAS.length)];
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': 'text/html' },
      signal: controller.signal, redirect: 'follow'
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

function extractProducts(html, site) {
  if (!html) return [];
  const products = [];

  // Extraire prix
  const prices = [];
  let m;
  const priceRe = new RegExp(site.priceRegex.source, 'g');
  while ((m = priceRe.exec(html)) !== null) {
    const p = parseFloat(m[1] || m[2]);
    if (p > 0.5 && p < 50000) prices.push(p);
  }

  // Extraire noms
  const names = [];
  const nameRe = new RegExp(site.nameRegex.source, 'g');
  while ((m = nameRe.exec(html)) !== null) {
    names.push(m[1].trim());
  }

  // Combiner
  for (let i = 0; i < Math.min(names.length, prices.length); i++) {
    products.push({ name: names[i], price: prices[i], supplier: site.name });
  }

  // Si pas de noms mais des prix, extraire autrement
  if (products.length === 0 && prices.length > 0) {
    // Chercher dans JSON-LD
    const ldMatches = [...html.matchAll(/"name"\s*:\s*"([^"]{5,80})"/g)];
    for (let i = 0; i < Math.min(ldMatches.length, prices.length); i++) {
      products.push({ name: ldMatches[i][1], price: prices[i], supplier: site.name });
    }
  }

  return products;
}

async function searchProductOnSite(productName, site) {
  // Simplifier le nom pour la recherche (garder les mots importants)
  const searchTerms = productName
    .replace(/[^\w\sàâéèêëïîôùûç-]/gi, ' ')
    .replace(/\b(le|la|les|de|du|des|un|une|par|pour|avec|boite|bte|lot|pcs|x\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 5)
    .join(' ');

  if (searchTerms.length < 4) return [];

  const url = site.searchUrl(searchTerms);
  const html = await fetchWithTimeout(url, 12000);
  return extractProducts(html, site);
}

async function main() {
  log('=== CROSS-SEARCH FOURNISSEURS ===');

  // Charger le progress
  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch(e) {}

  let results = [];
  try { results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch(e) {}

  // Charger les produits GACD (source de reference)
  log('Chargement produits GACD...');
  let gacdProducts = [];
  let offset = 0;
  while (true) {
    const { data } = await db.from('scraped_prices')
      .select('id, product_name, brand, price, reference')
      .eq('supplier_name', 'gacd')
      .not('product_name', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    gacdProducts = gacdProducts.concat(data);
    offset += 1000;
  }
  log(`GACD: ${gacdProducts.length} produits charges`);

  // Filtrer les produits deja traites
  const done = new Set(Object.keys(progress));
  const todo = gacdProducts.filter(p => !done.has(p.id));
  log(`Deja traites: ${done.size} | Restants: ${todo.length}`);

  let found = 0;
  let errors = 0;
  let searched = done.size;

  for (let i = 0; i < todo.length; i++) {
    const product = todo[i];
    const name = product.product_name;
    if (!name || name.length < 5) { progress[product.id] = 'skip'; continue; }

    // Chercher sur chaque site
    for (const site of SEARCH_SITES) {
      try {
        const matches = await searchProductOnSite(name, site);
        if (matches.length > 0) {
          found++;
          results.push({
            gacd_id: product.id,
            gacd_name: name,
            gacd_price: product.price,
            gacd_brand: product.brand,
            matches: matches.map(m => ({
              supplier: m.supplier,
              name: m.name,
              price: m.price
            }))
          });

          // Importer les nouveaux prix dans scraped_prices
          for (const match of matches) {
            try {
              await db.from('scraped_prices').upsert({
                supplier_name: match.supplier,
                product_name: match.name,
                price: match.price,
                matched_gtin: 'CROSS:' + product.id,
                matched_product_id: product.id
              }, { onConflict: 'supplier_name,product_name', ignoreDuplicates: true });
            } catch(e) {}
          }
        }

        // Rate limit entre les sites
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
      } catch(e) {
        errors++;
      }
    }

    progress[product.id] = 'done';
    searched++;

    // Log toutes les 50 recherches
    if (searched % 50 === 0) {
      log(`[${searched}/${gacdProducts.length}] Matches: ${found} | Erreurs: ${errors}`);
      // Sauvegarder progress
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    }

    // Rate limit entre les produits
    await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
  }

  log(`\n=== TERMINE ===`);
  log(`Produits cherches: ${searched}`);
  log(`Matches trouves: ${found}`);
  log(`Erreurs: ${errors}`);

  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  log('Resultats sauvegardes');
}

main().catch(e => log('FATAL: ' + e.message));
