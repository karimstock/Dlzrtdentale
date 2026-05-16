#!/usr/bin/env node
/**
 * VÉRIFICATEUR UNIVERSEL DE REFS
 * Prend chaque ref de chaque fournisseur et la vérifie sur le net
 * pour enrichir : nom complet, prix actuel, variantes, stock
 *
 * Stratégie par fournisseur :
 * - CAP Dentaire : capdentaire.com/recherche?s=REF
 * - Go-Dentaire : go-dentaire.com/recherche?s=REF
 * - DPI : dentalpromotion.fr/shop?search_api_fulltext=REF
 * - Dextashop : dextashop.com/recherche?s=REF
 * - Cecsmo : cecsmo.com search
 *
 * Usage: node scripts/verify-all-refs.js --supplier="CAP Dentaire"
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

async function fetchPage(url) {
  const ua = UAS[Math.floor(Math.random() * UAS.length)];
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html' }, signal: c.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : null;
  } catch (e) { return null; }
}

// Extracteur universel : JSON-LD + HTML prix + variantes
function extractAll(html, searchRef) {
  if (!html) return null;
  const results = [];

  // 1. JSON-LD (le plus fiable)
  const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m.replace(/<\/?script[^>]*>/g, ''));
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          const offers = Array.isArray(item.offers) ? item.offers : [item.offers || {}];
          for (const offer of offers) {
            results.push({
              ref: item.sku || item.mpn || item.productID || '',
              name: item.name || '',
              brand: item.brand?.name || item.brand || '',
              price: offer.price ? parseFloat(offer.price) : null,
              currency: offer.priceCurrency || 'EUR',
              inStock: (offer.availability || '').includes('InStock'),
              image: typeof item.image === 'string' ? item.image : (Array.isArray(item.image) ? item.image[0] : ''),
              source: 'json-ld'
            });
          }
        }
      }
    } catch (e) {}
  }

  // 2. HTML data-price-amount (Magento/PrestaShop)
  const priceMatches = [...html.matchAll(/data-price-amount="([0-9.]+)"/g)];
  const nameMatches = [...html.matchAll(/product-item-link[^>]*>([^<]+)|data-product-name="([^"]*)"|<h2[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)/g)];

  // 3. PrestaShop combinaisons (variantes)
  const combMatch = html.match(/combinations\s*[:=]\s*(\{[\s\S]*?\})\s*[,;]/);
  if (combMatch) {
    try {
      const combs = JSON.parse(combMatch[1]);
      for (const [id, comb] of Object.entries(combs)) {
        results.push({
          ref: comb.reference || comb.sku || `${searchRef}-${id}`,
          name: comb.name || '',
          price: comb.price ? parseFloat(comb.price) : null,
          attributes: comb.attributes_values || comb.attributes || {},
          source: 'prestashop-combination'
        });
      }
    } catch (e) {}
  }

  // 4. Prix barré + promo (DPI style)
  const promoPattern = /promo-price-crossed[^>]*>[^<]*<s>([0-9]+[,.]?[0-9]*)\s*€[\s\S]*?product-price-value[^>]*>([0-9]+[,.]?[0-9]*)\s*€/g;
  let promoMatch;
  while ((promoMatch = promoPattern.exec(html)) !== null) {
    results.push({
      price_catalogue: parseFloat(promoMatch[1].replace(',', '.')),
      price_promo: parseFloat(promoMatch[2].replace(',', '.')),
      source: 'promo-price'
    });
  }

  return results.length > 0 ? results : null;
}

// Rechercher une ref sur le site du fournisseur
const SEARCH_URLS = {
  'CAP Dentaire': (q) => `https://www.capdentaire.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
  'Go-Dentaire': (q) => `https://www.go-dentaire.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
  'DPI': (q) => `https://www.dentalpromotion.fr/shop?search_api_fulltext=${encodeURIComponent(q)}`,
  'Dextashop': (q) => `https://dextashop.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
  'Cecsmo': (q) => `https://www.cecsmo.com/catalogue?search=${encodeURIComponent(q)}`,
  'Henry Schein': (q) => `https://dents.henryschein.fr/catalogsearch/result/?q=${encodeURIComponent(q)}`,
};

async function verifyRef(ref, productName, supplier) {
  const searchFn = SEARCH_URLS[supplier];
  if (!searchFn) return null;

  // Chercher par ref d'abord
  const url1 = searchFn(ref);
  let html = await fetchPage(url1);
  let results = extractAll(html, ref);

  // Si pas trouvé, chercher par nom (premiers mots)
  if (!results && productName) {
    const shortName = productName.split(/[\s\-,]/g).filter(w => w.length > 2).slice(0, 3).join(' ');
    if (shortName.length > 5) {
      await delay(500);
      const url2 = searchFn(shortName);
      html = await fetchPage(url2);
      results = extractAll(html, ref);
    }
  }

  return results;
}

async function main() {
  const supplierArg = process.argv.find(a => a.startsWith('--supplier='))?.split('=')[1];

  console.log('=== VÉRIFICATEUR UNIVERSEL DE REFS ===');
  console.log(`Fournisseur: ${supplierArg || 'TOUS'}\n`);

  // Charger les refs à vérifier
  const progressFile = path.join(TMP, `verify-${(supplierArg || 'all').toLowerCase().replace(/\s/g, '-')}-progress.json`);
  const outputFile = path.join(TMP, `verified-${(supplierArg || 'all').toLowerCase().replace(/\s/g, '-')}.json`);

  let progress = {};
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    console.log(`Reprise: ${Object.keys(progress).length} déjà vérifiés`);
  }

  // Charger les produits du fournisseur
  const sourceFiles = {
    'CAP Dentaire': 'capdentaire-products-progress.json',
    'Go-Dentaire': 'godentaire-products-progress.json',
    'Dextashop': 'dextashop-progress.json',
    'Cecsmo': 'cecsmo-progress.json',
  };

  const srcFile = sourceFiles[supplierArg];
  if (!srcFile || !fs.existsSync(path.join(TMP, srcFile))) {
    console.log('Source non trouvée. Fournisseurs disponibles:', Object.keys(sourceFiles).join(', '));
    return;
  }

  const srcData = JSON.parse(fs.readFileSync(path.join(TMP, srcFile), 'utf8'));
  const products = Object.values(srcData)
    .filter(p => typeof p === 'object' && p.name && !p.error)
    .map(p => ({ ref: p.ref || '', name: p.name, price: p.price, supplier: supplierArg }));

  console.log(`Produits à vérifier: ${products.length}\n`);

  let verified = 0, enriched = 0, errors = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const key = p.ref || p.name;
    if (progress[key]) continue;

    const results = await verifyRef(p.ref, p.name, supplierArg);

    if (results && results.length > 0) {
      progress[key] = {
        original: p,
        verified: results,
        nb_variants: results.length,
        verified_at: new Date().toISOString()
      };
      enriched++;
    } else {
      progress[key] = { original: p, verified: null, error: 'not_found' };
      errors++;
    }
    verified++;

    if ((verified) % 20 === 0) {
      const totalVariants = Object.values(progress).reduce((s, v) => s + (v.nb_variants || 0), 0);
      console.log(`[${Math.round(verified / products.length * 100)}%] ${verified}/${products.length} | Enrichis: ${enriched} | Variantes: ${totalVariants} | Err: ${errors}`);
      fs.writeFileSync(progressFile, JSON.stringify(progress));
    }

    await delay(1200);
  }

  // Save final
  const totalVariants = Object.values(progress).reduce((s, v) => s + (v.nb_variants || 0), 0);
  fs.writeFileSync(progressFile, JSON.stringify(progress));
  fs.writeFileSync(outputFile, JSON.stringify({
    supplier: supplierArg,
    verified_at: new Date().toISOString(),
    stats: { products: products.length, verified, enriched, total_variants: totalVariants, errors }
  }, null, 2));

  console.log(`\n=== RÉSUMÉ ===`);
  console.log(`Produits: ${products.length}`);
  console.log(`Enrichis: ${enriched}`);
  console.log(`Variantes trouvées: ${totalVariants}`);
  console.log(`Erreurs: ${errors}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
