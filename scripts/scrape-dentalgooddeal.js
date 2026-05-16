#!/usr/bin/env node
// =============================================
// JADOMI — Scraper DentalGoodDeal (site custom)
// Stratégie: navigation par catégories (pas de search)
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const PROGRESS_FILE = '/tmp/search-progress-dentalgooddeal.json';
const LOG_FILE = '/tmp/search-dentalgooddeal.log';

const CATEGORIES = [
  { name: 'CFAO', url: '/categorie_cfao_68174.html' },
  { name: 'Empreintes', url: '/categorie_empreintes_67637.html' },
  { name: 'Laboratoire', url: '/categorie_laboratoire_67447.html' },
  { name: 'Couronnes', url: '/categorie_couronnes_67120.html' },
  { name: 'Ciments', url: '/categorie_ciments_66751.html' },
  { name: 'Anesthesie', url: '/categorie_anesthesie_66644.html' },
  { name: 'Radiographie', url: '/categorie_radiographie_66432.html' },
  { name: 'Vetements', url: '/categorie_vetements_66357.html' },
  { name: 'Instruments rotatifs', url: '/categorie_instruments_rotatifs_65952.html' },
  { name: 'Hygiene sterilisation', url: '/categorie_hygiene_et_sterilisation_65436.html' },
  { name: 'Restauration', url: '/categorie_restauration_64571.html' },
  { name: 'Orthodontie', url: '/categorie_orthodontie_64086.html' },
  { name: 'Implantologie', url: '/categorie_implantologie_63768.html' },
  { name: 'Prophylaxie', url: '/categorie_prophylaxie_63522.html' },
  { name: 'Pivots', url: '/categorie_pivots_63348.html' },
  { name: 'Fraises', url: '/categorie_fraises_62701.html' },
  { name: 'Usage unique', url: '/categorie_usage_unique_62124.html' },
  { name: 'Endodontie', url: '/categorie_endodontie_61498.html' },
  { name: 'Petits instruments', url: '/categorie_petits_instruments_60529.html' },
  // Subcategories (from CFAO/Lab)
  { name: 'CFAO Lab', url: '/categorie_cfao_67552.html' },
  { name: 'Adhesifs', url: '/categorie_adhesifs_68063.html' },
  { name: 'Alginates', url: '/categorie_alginates_67638.html' },
  { name: 'Silicones addition', url: '/categorie_silicones_par_addition_67769.html' },
  { name: 'Silicones condensation', url: '/categorie_silicones_par_condensation_67724.html' },
  { name: 'Porte empreintes', url: '/categorie_porte_empreintes__67974.html' },
  { name: 'Retraction gingivale', url: '/categorie_retraction_gingivale_68066.html' },
  { name: 'Polyethers', url: '/categorie_polyethers_67687.html' },
  { name: 'Enregistrement occlusion', url: '/categorie_enregistrement_de_l_occlusion_68115.html' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch (e) { return { completedQueries: [], products: {} }; }
  }
  return { completedQueries: [], products: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,.\-]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

async function scrapeCategory(page, baseUrl, category, progress) {
  const url = baseUrl + category.url;
  log(`📂 ${category.name}: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2000));

    // Also discover subcategories on this page
    const subCats = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="categorie_"]'))
        .map(a => ({ text: a.textContent.trim(), url: new URL(a.href).pathname }))
        .filter(a => a.text.length > 2 && a.text.length < 60);
    });

    // Extract products (custom DentalGoodDeal structure)
    const products = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('.div_encars_gamme,.div_encars_gamme_horizontal');

      for (const card of cards) {
        const nameEl = card.querySelector('.titre_gamme_liste_gamme');
        const priceEl = card.querySelector('.gamme_prix');
        const oldPriceEl = card.querySelector('.gamme_prix_barre');
        const discountEl = card.querySelector('.gamme_pourcentage');
        const countEl = card.querySelector('.nb_articles_liste_gamme');
        const imgEl = card.querySelector('img');
        const linkEl = card.querySelector('a[href]');

        const name = nameEl?.textContent?.trim() || '';
        const priceText = priceEl?.textContent?.trim() || '';
        const oldPriceText = oldPriceEl?.textContent?.trim() || '';
        const discount = discountEl?.textContent?.trim() || '';
        const articleCount = countEl?.textContent?.trim() || '';
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
        const url = linkEl?.href || '';

        if (name && name.length > 2) {
          items.push({ name, priceText, oldPriceText, discount, articleCount, imageUrl, url });
        }
      }

      return items;
    });

    let newCount = 0;
    for (const p of products) {
      p.searchQuery = category.name;
      const key = `${p.name}__${p.priceText}`.toLowerCase().replace(/\s+/g, ' ');
      if (!progress.products[key]) {
        progress.products[key] = p;
        newCount++;
      }
    }

    log(`  ${products.length} produits, ${newCount} nouveaux` + (subCats.length > 0 ? ` (+ ${subCats.length} sous-cat)` : ''));

    return { products: products.length, newCount, subCategories: subCats };
  } catch (err) {
    log(`  ERREUR: ${err.message}`);
    return { products: 0, newCount: 0, subCategories: [] };
  }
}

async function main() {
  log('========== DEBUT SCRAPE DENTALGOODDEAL ==========');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  const progress = loadProgress();
  const completedSet = new Set(progress.completedQueries || []);
  const baseUrl = 'https://www.dentalgooddeal.com';

  // Phase 1: Main categories
  const allCats = [...CATEGORIES];
  const discoveredCats = new Set(CATEGORIES.map(c => c.url));

  for (const cat of allCats) {
    if (completedSet.has(cat.url)) {
      log(`  SKIP ${cat.name} (déjà fait)`);
      continue;
    }

    const result = await scrapeCategory(page, baseUrl, cat, progress);
    completedSet.add(cat.url);

    // Add discovered subcategories
    for (const sub of result.subCategories) {
      if (!discoveredCats.has(sub.url)) {
        discoveredCats.add(sub.url);
        allCats.push({ name: sub.text, url: sub.url });
      }
    }

    progress.completedQueries = Array.from(completedSet);
    saveProgress(progress);

    await new Promise(r => setTimeout(r, 1500));
  }

  // Final stats
  const totalProducts = Object.keys(progress.products).length;
  log(`\n========== FIN SCRAPE DENTALGOODDEAL ==========`);
  log(`Total produits uniques: ${totalProducts}`);
  log(`Categories scrapées: ${completedSet.size}`);

  // Import to API
  const allProducts = Object.values(progress.products);
  if (allProducts.length > 0) {
    log('Import vers API...');
    for (let i = 0; i < allProducts.length; i += 200) {
      const batch = allProducts.slice(i, i + 200).map(p => ({
        name: p.name,
        price: parsePrice(p.priceText),
        price_original: parsePrice(p.oldPriceText),
        discount: p.discount ? parseInt(p.discount) : null,
        ref: '',
        category: `DentalGoodDeal: ${p.searchQuery || 'unknown'}`,
        url: p.url || '',
        brand: null,
        image_url: p.imageUrl || null,
      }));

      try {
        const resp = await fetch('http://127.0.0.1:3001/api/scan/import-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'dentalgooddeal', products: batch, page: `cat-batch-${Math.floor(i/200)+1}` }),
        });
        if (resp.ok) log(`  Import batch ${Math.floor(i/200)+1}: ${batch.length} OK`);
      } catch (err) {
        log(`  Import error: ${err.message}`);
      }
    }
  }

  await browser.close();
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
