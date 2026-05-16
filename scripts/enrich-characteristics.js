#!/usr/bin/env node
/**
 * ENRICHISSEMENT CARACTÉRISTIQUES PRODUIT
 * Pour chaque ref : scrape la page produit complète pour extraire
 * - Description complète
 * - Caractéristiques techniques (matériau, dimensions, composition)
 * - Catégorie / sous-catégorie
 * - Mots-clés métier (pour recherche dentiste)
 * - Conditionnement (boîte de X, seringue, unidose...)
 *
 * Sources : pages produit des fournisseurs ouverts
 * Usage: node scripts/enrich-characteristics.js --source=gacd
 */

const fs = require('fs');
const path = require('path');
const TMP = path.join(__dirname, '..', 'tmp');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(url, { headers: { 'User-Agent': ua }, signal: c.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : null;
  } catch (e) { return null; }
}

// Catégories dentaires pour classification auto
const CATEGORIES = {
  'Restauration': ['composite', 'résine', 'ciment', 'collage', 'adhésif', 'bonding', 'verre ionomère', 'amalgame', 'inlay', 'onlay', 'couronne provisoire'],
  'Endodontie': ['lime', 'file', 'endo', 'canal', 'obturation', 'gutta', 'cône', 'irrigat', 'apex', 'pulp'],
  'Chirurgie': ['éponge', 'hémostat', 'suture', 'fil résorbable', 'bistouri', 'lame', 'membrane', 'os synthétique', 'greffe', 'implant'],
  'Prothèse': ['empreinte', 'alginate', 'silicone', 'plâtre', 'cire', 'dent prothèse', 'résine acrylique', 'articulateur'],
  'Hygiène & Stérilisation': ['désinfect', 'stérilis', 'autoclave', 'lingette', 'gant', 'masque', 'sachet stérili', 'indicateur'],
  'Orthodontie': ['bracket', 'arc', 'fil ortho', 'élastique', 'ligature', 'bague', 'aligneur', 'contention'],
  'Prophylaxie': ['détart', 'poliss', 'pâte prophylaxie', 'fluorure', 'brossette', 'aéropoli', 'poudre prophy'],
  'Radiologie': ['capteur', 'radio', 'film', 'cliché', 'panoramique', 'rétro-alvéolaire'],
  'Anesthésie': ['anesthés', 'cartouche', 'aiguille', 'seringue anesthés', 'articaïne', 'lidocaïne'],
  'Petit équipement': ['lampe', 'turbine', 'contre-angle', 'pièce à main', 'détartreur', 'insert ultrason'],
  'Consommables': ['coton', 'compresse', 'aspiration', 'canule', 'gobelet', 'serviette', 'bavoir'],
  'CFAO': ['scanner', 'usinage', 'bloc', 'disque', 'zircone', 'disilicate', 'fraisage']
};

// Mots-clés de conditionnement
const PACKAGING = {
  'seringue': /seringue|syringe/i,
  'unidose': /unidose|compule|capsule|tip|carpule/i,
  'boîte': /boîte|boite|box|coffret|lot/i,
  'flacon': /flacon|bouteille|bidon/i,
  'tube': /tube/i,
  'sachet': /sachet|blister/i,
  'kit': /kit|coffret|starter|intro/i,
  'recharge': /recharge|refill|réassort/i
};

function classifyProduct(name, description) {
  const text = ((name || '') + ' ' + (description || '')).toLowerCase();

  // Catégorie
  let bestCat = 'Autre';
  let bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORIES)) {
    const score = words.filter(w => text.includes(w.toLowerCase())).length;
    if (score > bestScore) { bestScore = score; bestCat = cat; }
  }

  // Conditionnement
  let packaging = null;
  for (const [pkg, regex] of Object.entries(PACKAGING)) {
    if (regex.test(text)) { packaging = pkg; break; }
  }

  // Quantité
  const qtyMatch = text.match(/(\d+)\s*(pcs|pièces|unités|capsules|compules|seringues|flacons|sachets|blisters)/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1]) : null;

  // Mots-clés métier extraits du texte
  const metaKeywords = [];
  const keywordPatterns = [
    /photopolymér/i, /autopolymér/i, /dual/i, /chémopolymér/i,
    /radiopaque/i, /résorbable/i, /stérile/i, /sans latex/i,
    /nanohybride/i, /micro-hybride/i, /nano-céramique/i, /flowable|fluide/i,
    /bulk.?fill/i, /universel/i, /esthétique/i,
    /nickel.?titane|niti/i, /acier/i, /titane/i, /zircone/i, /céramique/i, /composite/i,
    /sans eugenol/i, /avec eugenol/i, /provisoire|temporaire/i, /définitif|permanent/i,
    /collagène/i, /gélatine/i, /hémostatique/i
  ];
  for (const p of keywordPatterns) {
    if (p.test(text)) metaKeywords.push(p.source.replace(/[\/\\|?*+^$()[\]{}]/g, '').replace(/\.\*/g, ' ').trim());
  }

  return { category: bestCat, packaging, qty, keywords: metaKeywords };
}

function extractPageData(html) {
  if (!html) return null;

  let description = '';
  let specs = {};

  // Description longue
  const descMatch = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/[^>]+>/i) ||
                    html.match(/product-description[^>]*>([\s\S]*?)<\/div>/i) ||
                    html.match(/description[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  // Caractéristiques techniques (tableaux)
  const specMatches = html.matchAll(/<(?:tr|li)[^>]*>\s*<(?:td|th|span|strong)[^>]*>([^<]+)<\/(?:td|th|span|strong)>\s*<(?:td|span)[^>]*>([^<]+)/gi);
  for (const m of specMatches) {
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key.length > 2 && key.length < 50 && val.length > 0 && val.length < 100) {
      specs[key] = val;
    }
  }

  // JSON-LD enrichi
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let jsonld = null;
  if (ldMatch) {
    try {
      const d = JSON.parse(ldMatch[1]);
      const items = Array.isArray(d) ? d : [d];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          jsonld = {
            name: item.name,
            description: item.description?.slice(0, 300),
            brand: item.brand?.name,
            sku: item.sku,
            category: item.category,
            material: item.material,
            weight: item.weight
          };
        }
      }
    } catch (e) {}
  }

  return { description, specs, jsonld };
}

async function main() {
  const source = process.argv.find(a => a.startsWith('--source='))?.split('=')[1] || 'gacd';

  console.log(`=== ENRICHISSEMENT CARACTÉRISTIQUES — ${source.toUpperCase()} ===\n`);

  // Charger les produits
  let products = [];
  if (source === 'gacd') {
    const data = JSON.parse(fs.readFileSync(path.join(TMP, 'gacd-algolia-2026-05-08.json'), 'utf8'));
    products = data.map(p => ({ ref: p.ref, name: p.name, price: p.price, brand: p.brand, url: p.url, supplier: 'GACD' }));
  } else if (source === 'dpi') {
    const data = JSON.parse(fs.readFileSync(path.join(TMP, 'dpi-sitemap-progress.json'), 'utf8'));
    products = Object.values(data).filter(v => v.products).flatMap(v => v.products.map(p => ({ ...p, supplier: 'DPI' })));
  } else if (source === 'hs') {
    const data = JSON.parse(fs.readFileSync(path.join(TMP, 'henryschein-prices.json'), 'utf8'));
    products = (data.products || []).map(p => ({ ref: p.ref, name: p.product || p.found_name, price: p.price_hs, url: p.url_hs, supplier: 'Henry Schein' }));
  }

  console.log(`Produits à enrichir: ${products.length}`);

  const progressFile = path.join(TMP, `enriched-${source}-progress.json`);
  let progress = {};
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    console.log(`Reprise: ${Object.keys(progress).length} déjà enrichis`);
  }

  let enriched = 0, scraped = 0, skipped = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const key = p.ref || p.name;
    if (!key || progress[key]) { skipped++; continue; }

    // Classifier avec le nom actuel
    const classification = classifyProduct(p.name, '');

    // Si on a une URL, scraper la page pour la description complète
    let pageData = null;
    if (p.url && !p.url.includes('gacd.fr')) { // GACD = Cloudflare, skip
      pageData = extractPageData(await fetchPage(p.url));
      scraped++;
      await delay(800);
    }

    // Enrichir la classification avec la description
    if (pageData?.description) {
      const fullClass = classifyProduct(p.name, pageData.description);
      classification.category = fullClass.category;
      classification.keywords = [...new Set([...classification.keywords, ...fullClass.keywords])];
    }

    progress[key] = {
      ref: p.ref,
      name: p.name,
      brand: p.brand,
      price: p.price,
      supplier: p.supplier,
      category: classification.category,
      packaging: classification.packaging,
      qty: classification.qty,
      keywords: classification.keywords,
      description: pageData?.description || null,
      specs: pageData?.specs || null,
      jsonld: pageData?.jsonld || null
    };
    enriched++;

    if ((enriched) % 100 === 0) {
      console.log(`[${Math.round(i / products.length * 100)}%] ${enriched} enrichis | ${scraped} scrapés | ${skipped} skip`);
      fs.writeFileSync(progressFile, JSON.stringify(progress));
    }
  }

  fs.writeFileSync(progressFile, JSON.stringify(progress));

  // Stats
  const all = Object.values(progress);
  const cats = {};
  for (const p of all) { cats[p.category] = (cats[p.category] || 0) + 1; }

  console.log(`\n=== RÉSUMÉ ===`);
  console.log(`Enrichis: ${enriched}`);
  console.log(`Avec description: ${all.filter(p => p.description).length}`);
  console.log(`Avec mots-clés: ${all.filter(p => p.keywords?.length > 0).length}`);
  console.log(`\n--- Catégories ---`);
  for (const [cat, n] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(6)} | ${cat}`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
