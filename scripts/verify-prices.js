#!/usr/bin/env node
// =============================================
// JADOMI — Verification coherence prix en base vs prix reels sur les sites web
//
// Prend des produits de scraped_prices avec URL, fetch la page,
// extrait le prix reel avec Cheerio, compare avec le prix en base.
//
// Usage: node scripts/verify-prices.js
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
  process.exit(1);
}

// =============================================
// CONFIG: 1 produit par fournisseur avec URL connue
// =============================================
const SUPPLIERS_TO_CHECK = [
  'doctorstrong',
  'megadental',
  'dentalgooddeal',
  'dentalpromotion',
  'gacd',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// =============================================
// SUPABASE HELPER
// =============================================
function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const fullUrl = SUPABASE_URL + '/rest/v1/' + path;
    https.get(fullUrl, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.substring(0, 200)));
        }
      });
    }).on('error', reject);
  });
}

// =============================================
// HTTP FETCH (follows redirects, handles https/http)
// =============================================
function fetchPage(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Trop de redirections'));

    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    }, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = parsed.origin + redirectUrl;
        }
        return resolve(fetchPage(redirectUrl, maxRedirects - 1));
      }

      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve({ status: res.statusCode, html, finalUrl: url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout 15s')); });
  });
}

// =============================================
// PRICE EXTRACTION — Multi-strategy Cheerio
// =============================================
function extractPricesFromHtml(html, supplierName) {
  const $ = cheerio.load(html);
  const results = { prices: [], allFound: [] };

  // Strategy 1: JSON-LD (most reliable)
  $('script[type="application/ld+json"]').each(function () {
    try {
      const json = JSON.parse($(this).html());
      const offers = json.offers || (json['@graph'] || []).find(g => g.offers)?.offers;
      if (offers) {
        const offerList = Array.isArray(offers) ? offers : [offers];
        for (const o of offerList) {
          if (o.price) {
            const p = parseFloat(String(o.price).replace(',', '.'));
            if (!isNaN(p) && p > 0) {
              results.prices.push({ value: p, source: 'JSON-LD', label: o.priceCurrency || 'EUR' });
            }
          }
        }
      }
      // Direct Product schema
      if (json['@type'] === 'Product' && json.offers) {
        // already handled above
      }
    } catch (e) { /* ignore malformed JSON-LD */ }
  });

  // Strategy 2: data-price-amount scoped to MAIN product zone only
  // Magento pages have related/cross-sell products — we must restrict to the main product-info block
  const mainProductZones = [
    '.product-info-main',       // Magento 2 / Hyva
    '.product-info-price',      // Magento 2
    '.product-essential',       // Magento 1
    '.product-shop',            // Magento 1
    '.product-view',            // Generic
    '.product-detail',          // Generic
    'main .product',            // Generic
  ];

  let $mainZone = null;
  for (const zone of mainProductZones) {
    const $z = $(zone).first();
    if ($z.length > 0) { $mainZone = $z; break; }
  }

  // If no main zone found, use the FIRST price-box only (not all on page)
  const $priceScope = $mainZone || $('body');
  const scopeLabel = $mainZone ? 'main-zone' : 'full-page';

  // Within main zone, get data-price-amount (take only first finalPrice + first oldPrice)
  const seenTypes = new Set();
  $priceScope.find('[data-price-amount]').each(function () {
    const p = parseFloat($(this).attr('data-price-amount'));
    if (!isNaN(p) && p > 0) {
      const type = $(this).closest('[data-price-type]').attr('data-price-type') || 'unknown';
      // Only take the first occurrence of each price type in the main zone
      if (!seenTypes.has(type)) {
        seenTypes.add(type);
        results.prices.push({ value: p, source: 'data-price-amount(' + scopeLabel + ')', label: type });
      }
    }
  });

  // Strategy 3: meta itemprop price (page-level, usually unique)
  $('meta[itemprop="price"]').each(function () {
    const p = parseFloat($(this).attr('content'));
    if (!isNaN(p) && p > 0) {
      results.prices.push({ value: p, source: 'meta-itemprop', label: 'price' });
    }
  });

  // Strategy 4: class-based price selectors — scoped to main product zone
  const priceSelectors = [
    '.product-info-price .price',
    '.special-price .price',
    '.final-price .price',
    '.prix-ttc',
    '.prix_ttc',
    '.price--current',
    '.current-price .price',
    '.old-price .price',
    '.regular-price .price',
    // DGD specific
    '.priceFin',
    '.priceArt',
    '.price_art',
    // DPI / Drupal
    '.field--name-price',
    '.commerce-price',
    '.product__price',
  ];

  for (const sel of priceSelectors) {
    // Try scoped first, then global but only first match
    const $el = $mainZone ? $mainZone.find(sel).first() : $(sel).first();
    if ($el.length) {
      const text = $el.text().trim();
      const p = parsePrice(text);
      if (p !== null && p > 0) {
        results.prices.push({ value: p, source: 'css-selector(' + scopeLabel + ')', label: sel });
      }
    }
  }

  // Strategy 5: Regex scan on full HTML for price patterns near "prix" or "€"
  const priceRegex = /(\d[\d\s]*[.,]\d{2})\s*€/g;
  let match;
  let regexCount = 0;
  while ((match = priceRegex.exec(html)) !== null && regexCount < 20) {
    const p = parsePrice(match[1]);
    if (p !== null && p > 0.5 && p < 100000) {
      results.allFound.push({ value: p, source: 'regex-euro', context: html.substring(Math.max(0, match.index - 30), match.index + match[0].length + 10).replace(/\s+/g, ' ').trim() });
      regexCount++;
    }
  }

  return results;
}

function parsePrice(text) {
  if (!text) return null;
  // Remove spaces, non-breaking spaces, currency symbols
  const cleaned = text.replace(/[\s\u00A0]/g, '').replace(/[€$£]/g, '').replace(/,/g, '.');
  const p = parseFloat(cleaned);
  return isNaN(p) ? null : p;
}

// =============================================
// MAIN
// =============================================
async function main() {
  console.log('==============================================');
  console.log('  JADOMI — Verification prix base vs site web');
  console.log('  Date: ' + new Date().toISOString());
  console.log('==============================================\n');

  // Step 1: Get 1 product per supplier from Supabase (with valid URL, reasonable price)
  const products = [];
  for (const supplier of SUPPLIERS_TO_CHECK) {
    console.log(`[DB] Recherche produit ${supplier} avec URL...`);
    try {
      const data = await supabaseGet(
        `scraped_prices?select=id,supplier_name,product_name,price,price_original,url,reference` +
        `&supplier_name=eq.${supplier}&url=neq.&price=gte.5&price=lte.2000&limit=3&order=id.desc`
      );

      if (data.length > 0) {
        // Pick the one with the cleanest URL (no truncation)
        const best = data.find(r => r.url && r.url.startsWith('http') && !r.url.endsWith('.')) || data[0];
        products.push(best);
        console.log(`  -> ${best.product_name?.substring(0, 60).trim()} | ${best.price} EUR | ${best.url?.substring(0, 70)}`);
      } else {
        console.log(`  -> AUCUN produit avec URL trouve pour ${supplier}`);
      }
    } catch (e) {
      console.log(`  -> ERREUR DB pour ${supplier}: ${e.message}`);
    }
  }

  console.log(`\n[INFO] ${products.length} produits a verifier\n`);

  // Step 2: Fetch each product page and extract price
  const report = [];

  for (const product of products) {
    console.log('----------------------------------------------');
    console.log(`[CHECK] ${product.supplier_name} — ${product.product_name?.substring(0, 60).trim()}`);
    console.log(`  URL: ${product.url}`);
    console.log(`  Prix base: ${product.price} EUR | Prix original base: ${product.price_original || 'N/A'} EUR`);
    console.log(`  Reference: ${product.reference || 'N/A'}`);

    const entry = {
      supplier: product.supplier_name,
      name: product.product_name?.substring(0, 80).trim(),
      url: product.url,
      dbPrice: product.price,
      dbPriceOriginal: product.price_original,
      reference: product.reference,
      webPrice: null,
      webPriceOriginal: null,
      ecart: null,
      ecartPct: null,
      status: 'PENDING',
      details: '',
    };

    try {
      const { status, html } = await fetchPage(product.url);
      console.log(`  HTTP ${status} | HTML ${html.length} octets`);

      if (status === 200 && html.length > 500) {
        const extracted = extractPricesFromHtml(html, product.supplier_name);

        if (extracted.prices.length > 0) {
          // Deduplicate prices
          const uniquePrices = [...new Map(extracted.prices.map(p => [p.value, p])).values()];

          console.log('  Prix trouves sur le site:');
          uniquePrices.forEach(p => console.log(`    - ${p.value} EUR (via ${p.source}, type: ${p.label})`));

          // Determine the "final" price
          // Priority: CSS visible text (.final-price, .special-price) > JSON-LD > meta > data-price-amount
          // Rationale: Magento data-price-amount can contain base price even on finalPrice type
          // when tier pricing or configurable options are active. The rendered text is truth.
          const finalPriceEntry =
               extracted.prices.find(p => p.source.startsWith('css-selector') && (p.label.includes('final-price') || p.label.includes('special-price') || p.label.includes('field--name-price')))
            || extracted.prices.find(p => p.source.startsWith('css-selector') && p.label.includes('product-info-price'))
            || extracted.prices.find(p => p.source === 'JSON-LD')
            || extracted.prices.find(p => p.source === 'meta-itemprop')
            || extracted.prices.find(p => p.source.startsWith('data-price-amount') && p.label === 'finalPrice')
            || extracted.prices.find(p => p.source.startsWith('css-selector'))
            || extracted.prices[0];

          const oldPriceEntry = extracted.prices.find(p => p.label === 'oldPrice' || p.label === 'basePrice')
            || extracted.prices.find(p => p.source.startsWith('css-selector') && (p.label.includes('old') || p.label.includes('regular')));

          entry.webPrice = finalPriceEntry.value;
          entry.webPriceOriginal = oldPriceEntry ? oldPriceEntry.value : null;

          // Calculate ecart
          entry.ecart = Math.round((entry.dbPrice - entry.webPrice) * 100) / 100;
          entry.ecartPct = Math.round((entry.ecart / entry.webPrice) * 10000) / 100;

          if (Math.abs(entry.ecartPct) < 1) {
            entry.status = 'OK';
            entry.details = 'Prix coherent (ecart < 1%)';
          } else if (Math.abs(entry.ecartPct) < 5) {
            entry.status = 'WARN';
            entry.details = `Ecart leger: ${entry.ecartPct}%`;
          } else {
            entry.status = 'ERREUR';
            entry.details = `Ecart significatif: ${entry.ecartPct}%`;
          }

          console.log(`  => Prix web: ${entry.webPrice} EUR | Ecart: ${entry.ecart} EUR (${entry.ecartPct}%) | ${entry.status}`);
        } else if (extracted.allFound.length > 0) {
          console.log('  Prix trouves par regex (non structure):');
          extracted.allFound.slice(0, 5).forEach(p => console.log(`    - ${p.value} EUR | contexte: "${p.context}"`));
          entry.status = 'MANUAL';
          entry.details = `${extracted.allFound.length} prix trouves par regex, pas de selecteur structure`;
          entry.webPrice = extracted.allFound[0].value;
          entry.ecart = Math.round((entry.dbPrice - entry.webPrice) * 100) / 100;
          entry.ecartPct = Math.round((entry.ecart / entry.webPrice) * 10000) / 100;
          console.log(`  => Meilleur candidat regex: ${entry.webPrice} EUR | Ecart: ${entry.ecart} EUR (${entry.ecartPct}%)`);
        } else {
          entry.status = 'NO_PRICE';
          entry.details = 'Aucun prix extractible sur la page';
          console.log('  => AUCUN prix trouve sur la page');
        }
      } else if (status === 403 || status === 429) {
        entry.status = 'BLOQUE';
        entry.details = `HTTP ${status} — site bloque le scraping`;
        console.log(`  => BLOQUE par le site (HTTP ${status})`);
      } else if (status === 404) {
        entry.status = 'URL_MORTE';
        entry.details = 'Page 404 — produit retire ou URL invalide';
        console.log('  => PAGE 404 — URL morte');
      } else {
        entry.status = 'HTTP_ERR';
        entry.details = `HTTP ${status}, HTML trop court (${html.length} octets)`;
        console.log(`  => Erreur HTTP ${status}`);
      }
    } catch (e) {
      entry.status = 'FETCH_ERR';
      entry.details = e.message;
      console.log(`  => ERREUR fetch: ${e.message}`);
    }

    report.push(entry);

    // Delai entre requetes (politesse)
    await new Promise(r => setTimeout(r, 2000));
  }

  // Step 3: Final report
  console.log('\n\n==============================================');
  console.log('  RAPPORT FINAL — Verification des prix');
  console.log('==============================================\n');

  console.log(
    padRight('FOURNISSEUR', 18) +
    padRight('REF', 14) +
    padRight('PRIX DB', 12) +
    padRight('PRIX WEB', 12) +
    padRight('ECART', 12) +
    padRight('ECART %', 10) +
    'STATUS'
  );
  console.log('-'.repeat(90));

  for (const r of report) {
    console.log(
      padRight(r.supplier, 18) +
      padRight(r.reference || '-', 14) +
      padRight(r.dbPrice != null ? r.dbPrice.toFixed(2) : '-', 12) +
      padRight(r.webPrice != null ? r.webPrice.toFixed(2) : '-', 12) +
      padRight(r.ecart != null ? (r.ecart >= 0 ? '+' : '') + r.ecart.toFixed(2) : '-', 12) +
      padRight(r.ecartPct != null ? r.ecartPct.toFixed(1) + '%' : '-', 10) +
      r.status
    );
  }

  console.log('-'.repeat(90));

  // Summary
  const ok = report.filter(r => r.status === 'OK').length;
  const warn = report.filter(r => r.status === 'WARN').length;
  const err = report.filter(r => r.status === 'ERREUR').length;
  const other = report.length - ok - warn - err;

  console.log(`\nResume: ${ok} OK | ${warn} WARN | ${err} ERREUR | ${other} autre(s)`);

  // Detail for non-OK
  const problems = report.filter(r => r.status !== 'OK');
  if (problems.length > 0) {
    console.log('\nDetails des problemes:');
    for (const r of problems) {
      console.log(`  [${r.status}] ${r.supplier} — ${r.name}`);
      console.log(`    ${r.details}`);
      if (r.webPrice != null) {
        console.log(`    DB: ${r.dbPrice} EUR vs Web: ${r.webPrice} EUR`);
      }
    }
  }

  console.log('\n[FIN] Verification terminee.');
}

function padRight(str, len) {
  const s = String(str || '');
  return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

main().catch(e => {
  console.error('ERREUR FATALE:', e);
  process.exit(1);
});
