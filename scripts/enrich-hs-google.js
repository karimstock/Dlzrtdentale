#!/usr/bin/env node
/**
 * BUILDER: Enrichit les produits Henry Schein avec les prix
 * via dents.henryschein.fr (accès libre, prix publics)
 *
 * Stratégie:
 * 1. Pour chaque ref XXX-XXXX, tente l'URL directe sur dents.henryschein.fr
 * 2. Si pas trouvé, cherche sur henryschein.fr/fr-fr/dental/
 * 3. Extraire prix depuis le HTML (JSON-LD ou meta content)
 *
 * Usage: node scripts/enrich-hs-google.js [--batch=50] [--start=0]
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'tmp', 'henryschein-all-refs.json');
const OUTPUT = path.join(__dirname, '..', 'tmp', 'henryschein-prices.json');
const PROGRESS = path.join(__dirname, '..', 'tmp', 'hs-prices-progress.json');

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '999999');
const START = parseInt(process.argv.find(a => a.startsWith('--start='))?.split('=')[1] || '0');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugify(text) {
  return text.toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const ua = UAS[Math.floor(Math.random() * UAS.length)];
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

function extractPrice(html) {
  if (!html) return null;
  // Method 1: meta content price
  const metaMatch = html.match(/"price"\s*content="([0-9.]+)"/);
  if (metaMatch) return parseFloat(metaMatch[1]);
  // Method 2: price span with euro
  const spanMatch = html.match(/"price">([0-9]+[,.]?[0-9]*)\s*€/);
  if (spanMatch) return parseFloat(spanMatch[1].replace(',', '.'));
  // Method 3: JSON-LD
  const ldMatch = html.match(/"price"\s*:\s*"?([0-9.]+)"?/);
  if (ldMatch) return parseFloat(ldMatch[1]);
  // Method 4: any price pattern near the ref
  const anyPrice = html.match(/(\d+[,\.]\d{2})\s*€\s*(?:TTC|HT)?/);
  if (anyPrice) return parseFloat(anyPrice[1].replace(',', '.'));
  return null;
}

function extractProductName(html) {
  if (!html) return null;
  const h1 = html.match(/<h1[^>]*>([^<]+)</);
  if (h1) return h1[1].trim();
  const title = html.match(/<title>([^<]+)/);
  if (title) return title[1].replace(/ - Henry Schein.*/, '').trim();
  return null;
}

function extractFullProductInfo(html) {
  if (!html) return {};
  const info = {};

  // Nom complet du produit (h1)
  const h1 = html.match(/<h1[^>]*>([^<]+)</);
  if (h1) info.nom_complet = h1[1].trim();

  // Marque / fabricant
  const brandPatterns = [
    /data-brand="([^"]+)"/,
    /"brand"\s*:\s*"([^"]+)"/,
    /Marque\s*:\s*<[^>]*>([^<]+)/i,
    /Fabricant\s*:\s*<[^>]*>([^<]+)/i,
    /manufacturer['"]\s*:\s*['"]([ ^'"]+)/i
  ];
  for (const p of brandPatterns) {
    const m = html.match(p);
    if (m) { info.marque = m[1].trim(); break; }
  }

  // Reference fabricant
  const refPatterns = [
    /R[ée]f(?:[ée]rence)?\s*(?:fabricant)?\s*:\s*<[^>]*>([^<]+)/i,
    /data-sku="([^"]+)"/,
    /"sku"\s*:\s*"([^"]+)"/,
    /R[ée]f\.\s*([A-Z0-9][\w-]+)/i
  ];
  for (const p of refPatterns) {
    const m = html.match(p);
    if (m) { info.ref_fabricant = m[1].trim(); break; }
  }

  // Prix original (barre) et prix reduit
  const priceOriginal = html.match(/old-price[^>]*>([0-9]+[,.]?[0-9]*)\s*€/);
  if (priceOriginal) info.prix_original = parseFloat(priceOriginal[1].replace(',', '.'));

  const priceSpecial = html.match(/special-price[^>]*>([0-9]+[,.]?[0-9]*)\s*€/);
  if (priceSpecial) info.prix_reduit = parseFloat(priceSpecial[1].replace(',', '.'));

  // Reduction en %
  const discount = html.match(/(-\d+%|reduction\s*:\s*(\d+)%)/i);
  if (discount) info.reduction_pct = discount[0];

  // Description / caracteristiques
  const descPatterns = [
    /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i
  ];
  for (const p of descPatterns) {
    const m = html.match(p);
    if (m) {
      info.description = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
      break;
    }
  }

  // Categorie
  const breadcrumb = html.match(/breadcrumb[^>]*>([\s\S]*?)<\/[uo]l>/i);
  if (breadcrumb) {
    const cats = [...breadcrumb[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(m => m[1].trim()).filter(c => c.length > 1);
    if (cats.length > 0) info.categories = cats;
  }

  // Sous-references / variantes
  const subRefs = [...html.matchAll(/(\d{3}-\d{4})/g)].map(m => m[1]);
  const uniqueSubRefs = [...new Set(subRefs)].filter(r => r.length === 8);
  if (uniqueSubRefs.length > 1) info.sous_references = uniqueSubRefs.slice(0, 20);

  // Conditionnement
  const condPatterns = [
    /Conditionnement\s*:\s*([^<\n]+)/i,
    /Contenu\s*:\s*([^<\n]+)/i,
    /(bo[iî]te\s+de\s+\d+|lot\s+de\s+\d+|sachet\s+de\s+\d+|flacon\s+de\s+\d+\s*ml)/i
  ];
  for (const p of condPatterns) {
    const m = html.match(p);
    if (m) { info.conditionnement = m[1] ? m[1].trim() : m[0].trim(); break; }
  }

  // Image produit
  const img = html.match(/data-zoom-image="([^"]+)"|class="[^"]*product-image[^"]*"[^>]*src="([^"]+)"/);
  if (img) info.image_url = (img[1] || img[2]);

  return info;
}

async function findPrice(product) {
  const ref = product.ref;

  // Strategy: Magento search on dents.henryschein.fr (14000+ refs, prix publics)
  const searchUrl = `https://dents.henryschein.fr/catalogsearch/result/?q=${encodeURIComponent(ref)}`;
  const html = await fetchWithTimeout(searchUrl, 12000);
  if (!html) return { price: null, source: null, foundName: null, url: null };

  // Extract all products from search results
  const productPattern = /href="(https:\/\/dents\.henryschein\.fr\/[^"]*)"[^]*?data-price-amount="([^"]*)"/g;
  let match;
  let bestPrice = null;
  let bestUrl = null;
  let bestName = null;

  // Simple approach: find href with ref in URL + closest price
  const refNoDash = ref.replace('-', '');
  const refPattern = new RegExp(ref.replace('-', '.'), 'i');

  // Extract product URLs and prices
  const urls = [...html.matchAll(/href="(https:\/\/dents\.henryschein\.fr\/[^"]*?\.html)"/g)];
  const prices = [...html.matchAll(/data-price-amount="([0-9.]+)"/g)];

  // Find URL containing our ref
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i][1];
    if (url.includes(ref) || url.includes(refNoDash)) {
      bestUrl = url;
      // Get the name from URL slug
      const slug = url.replace('https://dents.henryschein.fr/', '').replace('.html', '').replace(/-/g, ' ');
      bestName = slug;
      // Find nearest price (prices appear after product links)
      if (prices[i]) {
        const p = parseFloat(prices[i][1]);
        if (p > 0 && p < 50000) bestPrice = p;
      }
      break;
    }
  }

  // If no exact URL match, take first result with valid price
  if (!bestPrice && prices.length > 0) {
    for (const pm of prices) {
      const p = parseFloat(pm[1]);
      if (p > 0.5 && p < 50000) {
        bestPrice = p;
        if (urls[0]) {
          bestUrl = urls[0][1];
          bestName = urls[0][1].replace('https://dents.henryschein.fr/', '').replace('.html', '').replace(/-/g, ' ');
        }
        break;
      }
    }
  }

  // Also try extracting from JSON-LD or meta on search page
  if (!bestPrice) {
    bestPrice = extractPrice(html);
  }

  return {
    price: bestPrice,
    source: bestPrice ? 'dents.henryschein.fr' : null,
    foundName: bestName,
    url: bestUrl
  };
}

async function main() {
  console.log('=== HENRY SCHEIN PRICE BUILDER ===');

  // Load products
  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const allProducts = data.products;
  console.log(`Total produits: ${allProducts.length}`);

  // Load progress
  let results = {};
  if (fs.existsSync(PROGRESS)) {
    results = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log(`Reprise: ${Object.keys(results).length} déjà traités`);
  }

  const products = allProducts.slice(START, START + BATCH_SIZE);
  let found = 0, errors = 0, skipped = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    // Skip already done
    if (results[p.ref]) { skipped++; continue; }

    try {
      const { price, source, foundName, url } = await findPrice(p);

      // Visiter la page produit pour extraire TOUT (marque, description, sous-refs, etc.)
      let fullInfo = {};
      if (url) {
        await delay(800);
        const productHtml = await fetchWithTimeout(url, 12000);
        if (productHtml) {
          fullInfo = extractFullProductInfo(productHtml);
        }
      }

      results[p.ref] = {
        ...p,
        nom_complet: fullInfo.nom_complet || foundName || p.product,
        marque: fullInfo.marque || p.brand || 'Henry Schein',
        ref_fabricant: fullInfo.ref_fabricant || null,
        prix: price || fullInfo.prix_reduit || null,
        prix_original: fullInfo.prix_original || null,
        prix_reduit: fullInfo.prix_reduit || null,
        reduction_pct: fullInfo.reduction_pct || null,
        description: fullInfo.description || null,
        categories: fullInfo.categories || [p.category],
        sous_references: fullInfo.sous_references || null,
        conditionnement: fullInfo.conditionnement || null,
        image_url: fullInfo.image_url || null,
        url_hs: url,
        price_source: source,
        enriched_at: new Date().toISOString()
      };
      if (price || fullInfo.nom_complet) found++;
    } catch (e) {
      results[p.ref] = { ...p, price_hs: null, error: e.message };
      errors++;
    }

    // Progress log
    if ((i + 1) % 10 === 0 || i === products.length - 1) {
      const pct = Math.round(((i + 1) / products.length) * 100);
      console.log(`[${pct}%] ${i + 1}/${products.length} | Prix trouvés: ${found} | Erreurs: ${errors} | Skip: ${skipped}`);
      // Save progress
      fs.writeFileSync(PROGRESS, JSON.stringify(results, null, 2));
    }

    // Polite delay (1.5s between requests)
    await delay(1500);
  }

  // Save final output
  const output = {
    source: 'Henry Schein - Catalogue Produits de Marque 2024',
    enriched_at: new Date().toISOString(),
    stats: {
      total: allProducts.length,
      processed: Object.keys(results).length,
      with_price: Object.values(results).filter(r => r.price_hs).length,
      without_price: Object.values(results).filter(r => !r.price_hs).length,
      errors
    },
    products: Object.values(results)
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log('\n=== RÉSUMÉ ===');
  console.log(`Traités: ${output.stats.processed}`);
  console.log(`Prix trouvés: ${output.stats.with_price}`);
  console.log(`Sans prix: ${output.stats.without_price}`);
  console.log(`Erreurs: ${errors}`);
  console.log(`Fichier: ${OUTPUT}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
