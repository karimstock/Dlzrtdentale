#!/usr/bin/env node
// =============================================
// JADOMI — Scraper par Sitemap
// Télécharge le sitemap, filtre les URLs produit,
// visite chaque page pour extraire nom/prix/ref
// Usage: node scrape-by-sitemap.js --site doctorai
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const { getSiteByName } = require('./scrape-all-sites');

puppeteer.use(StealthPlugin());

// =============================================
// SITEMAP DOWNLOAD & PARSE
// =============================================

async function fetchSitemapUrls(baseUrl) {
  const sitemapUrl = baseUrl + '/sitemap.xml';
  console.log(`Fetching sitemap: ${sitemapUrl}`);

  const resp = await fetch(sitemapUrl);
  const text = await resp.text();

  // Check if it's a sitemap index
  const sitemapLocs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

  let allUrls = [];

  // If it contains .xml links, it's an index
  const xmlLinks = sitemapLocs.filter(u => u.endsWith('.xml'));
  if (xmlLinks.length > 0) {
    console.log(`Sitemap index with ${xmlLinks.length} sub-sitemaps`);
    for (const xmlUrl of xmlLinks) {
      try {
        const subResp = await fetch(xmlUrl);
        const subText = await subResp.text();
        const subUrls = [...subText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
        allUrls.push(...subUrls);
        console.log(`  ${xmlUrl}: ${subUrls.length} URLs`);
      } catch (e) {
        console.log(`  Error fetching ${xmlUrl}: ${e.message}`);
      }
    }
  } else {
    allUrls = sitemapLocs;
  }

  return allUrls;
}

function filterProductUrls(urls, baseUrl) {
  // Filter out known non-product URLs
  const excludePatterns = [
    /\/sitemap/i, /\/blog/i, /\/cms/i, /\/contact/i, /\/about/i,
    /\/policy/i, /\/terms/i, /\/faq/i, /\/customer/i, /\/account/i,
    /\/cart/i, /\/checkout/i, /\/wishlist/i, /\/newsletter/i,
    /\/catalogsearch/i, /\/search/i, /\/media\//i, /\/static\//i,
    /\/review/i, /\/privacy/i, /\/cgv/i, /\/mentions/i,
    /\.(jpg|png|gif|svg|pdf|css|js)$/i,
  ];

  return urls.filter(url => {
    if (!url.startsWith(baseUrl)) return false;
    if (url === baseUrl || url === baseUrl + '/') return false;
    for (const pat of excludePatterns) {
      if (pat.test(url)) return false;
    }
    return true;
  });
}

// =============================================
// PRODUCT EXTRACTION FROM DETAIL PAGE
// =============================================

async function extractProductFromPage(page, url, siteConfig) {
  const sel = siteConfig.selectors || {};

  return page.evaluate((sel) => {
    // Name
    let name = '';
    const nameSelectors = (sel.detailName || 'h1,.page-title,.product-info-main h1').split(',');
    for (const ns of nameSelectors) {
      const el = document.querySelector(ns.trim());
      if (el) { name = el.textContent.trim().replace(/\s+/g, ' '); if (name.length > 2) break; }
    }

    // Price
    let priceText = '';
    const priceSelectors = (sel.detailPrice || '[data-price-type="finalPrice"] .price,.price-final_price .price,.price').split(',');
    for (const ps of priceSelectors) {
      const el = document.querySelector(ps.trim());
      if (el) {
        priceText = (el.getAttribute('data-price-amount') || el.getAttribute('content') || el.textContent || '').trim();
        if (priceText) break;
      }
    }
    // Also try data-price-amount anywhere
    if (!priceText) {
      const priceEl = document.querySelector('[data-price-amount]');
      if (priceEl) priceText = priceEl.getAttribute('data-price-amount');
    }

    // Old price
    let oldPriceText = '';
    const oldPriceSelectors = (sel.detailOldPrice || '[data-price-type="oldPrice"] .price,.old-price .price').split(',');
    for (const ops of oldPriceSelectors) {
      const el = document.querySelector(ops.trim());
      if (el) { oldPriceText = (el.getAttribute('data-price-amount') || el.textContent || '').trim(); if (oldPriceText) break; }
    }

    // SKU / Reference
    let ref = '';
    const skuSelectors = (sel.detailSku || '[itemprop="sku"],.product-info-stock-sku .value').split(',');
    for (const ss of skuSelectors) {
      const el = document.querySelector(ss.trim());
      if (el) { ref = el.textContent.trim(); if (ref) break; }
    }

    // Brand
    let brand = '';
    const brandSelectors = (sel.detailBrand || '[itemprop="brand"],.product-brand').split(',');
    for (const bs of brandSelectors) {
      const el = document.querySelector(bs.trim());
      if (el) { brand = el.textContent.trim(); if (brand) break; }
    }

    // Image
    let imageUrl = '';
    const imgSelectors = (sel.detailImages || '.product-image-photo,.fotorama img,.gallery-placeholder img').split(',');
    for (const is of imgSelectors) {
      const el = document.querySelector(is.trim());
      if (el) { imageUrl = el.src || el.getAttribute('data-src') || ''; if (imageUrl) break; }
    }

    // Category from breadcrumb
    let category = '';
    const breadSelectors = (sel.breadcrumb || '.breadcrumbs a,.breadcrumb a').split(',');
    const breadLinks = document.querySelectorAll(breadSelectors[0]);
    if (breadLinks.length > 1) {
      category = Array.from(breadLinks).slice(1).map(a => a.textContent.trim()).join(' > ');
    }

    return { name, priceText, oldPriceText, ref, brand, imageUrl, category };
  }, sel);
}

// =============================================
// MAIN
// =============================================

async function main() {
  const args = process.argv.slice(2);
  let siteName = null;
  let maxPages = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site' && args[i + 1]) { siteName = args[i + 1]; i++; }
    if (args[i] === '--max' && args[i + 1]) { maxPages = parseInt(args[i + 1]); i++; }
  }

  if (!siteName) {
    console.error('Usage: node scrape-by-sitemap.js --site <name> [--max <N>]');
    process.exit(1);
  }

  const siteConfig = getSiteByName(siteName);
  if (!siteConfig) { console.error(`Unknown site: ${siteName}`); process.exit(1); }

  const logFile = `/tmp/sitemap-${siteName}.log`;
  const progressFile = `/tmp/sitemap-progress-${siteName}.json`;

  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(logFile, line + '\n');
  }

  function loadProgress() {
    if (fs.existsSync(progressFile)) {
      try { return JSON.parse(fs.readFileSync(progressFile, 'utf8')); }
      catch (e) { return { visited: [], products: {} }; }
    }
    return { visited: [], products: {} };
  }

  function saveProgress(progress) {
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  }

  log(`========== DEBUT SCRAPE SITEMAP: ${siteName} ==========`);
  log(`Site: ${siteConfig.baseUrl} (${siteConfig.type})`);

  // Fetch sitemap
  const allUrls = await fetchSitemapUrls(siteConfig.baseUrl);
  log(`Total URLs in sitemap: ${allUrls.length}`);

  const productUrls = filterProductUrls(allUrls, siteConfig.baseUrl);
  log(`Product URLs (filtered): ${productUrls.length}`);

  if (productUrls.length === 0) {
    log('No product URLs found!');
    return;
  }

  // Load progress
  const progress = loadProgress();
  const visitedSet = new Set(progress.visited || []);
  const pendingUrls = productUrls.filter(u => !visitedSet.has(u)).slice(0, maxPages);
  log(`Already visited: ${visitedSet.size}, pending: ${pendingUrls.length}`);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) req.abort();
    else req.continue();
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  let newProducts = 0;
  let errors = 0;
  const SAVE_EVERY = 50;

  for (let i = 0; i < pendingUrls.length; i++) {
    const url = pendingUrls[i];

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, 800));

      const product = await extractProductFromPage(page, url, siteConfig);

      if (product.name && product.name.length > 3) {
        const key = `${product.name}__${product.ref || product.priceText}`.toLowerCase().replace(/\s+/g, ' ');
        if (!progress.products[key]) {
          progress.products[key] = { ...product, url, searchQuery: product.category || 'sitemap' };
          newProducts++;
        }
      }

      visitedSet.add(url);

      // Progress log
      if ((i + 1) % 100 === 0) {
        const total = Object.keys(progress.products).length;
        log(`  ${i + 1}/${pendingUrls.length}: ${total} produits (${newProducts} nouveaux, ${errors} erreurs)`);
      }

      // Save
      if ((i + 1) % SAVE_EVERY === 0) {
        progress.visited = Array.from(visitedSet);
        saveProgress(progress);
      }

      // Small delay
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      errors++;
      visitedSet.add(url); // Mark as visited to skip on retry

      if (err.message.includes('detached') || err.message.includes('Target closed')) {
        log(`  Browser crash at ${i}, recreating page...`);
        try {
          await page.close().catch(() => {});
          const newPage = await browser.newPage();
          await newPage.setRequestInterception(true);
          newPage.on('request', (req) => {
            if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
            else req.continue();
          });
          await newPage.setViewport({ width: 1280, height: 800 });
          await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
          // Reassign (we can't reassign const, but the variable reference works in the loop)
          Object.assign(page, newPage);
        } catch (e) {}
      }
    }
  }

  // Final save
  progress.visited = Array.from(visitedSet);
  saveProgress(progress);

  const totalProducts = Object.keys(progress.products).length;
  log(`\n========== FIN SCRAPE SITEMAP: ${siteName} ==========`);
  log(`Total: ${totalProducts} produits, ${newProducts} nouveaux, ${errors} erreurs`);

  // Import to API
  const allProducts = Object.values(progress.products);
  if (allProducts.length > 0) {
    log('Import vers API...');
    for (let i = 0; i < allProducts.length; i += 200) {
      const batch = allProducts.slice(i, i + 200).map(p => {
        const price = p.priceText ? parseFloat(String(p.priceText).replace(/[^\d,.]/g, '').replace(',', '.')) : null;
        const oldPrice = p.oldPriceText ? parseFloat(String(p.oldPriceText).replace(/[^\d,.]/g, '').replace(',', '.')) : null;
        return {
          name: p.name,
          price: isNaN(price) ? null : price,
          price_original: isNaN(oldPrice) ? null : oldPrice,
          discount: oldPrice && price ? Math.round((1 - price / oldPrice) * 100) : null,
          ref: p.ref || '',
          category: `${siteName}: ${p.category || 'sitemap'}`,
          url: p.url || '',
          brand: p.brand || null,
          image_url: p.imageUrl || null,
        };
      });
      try {
        const resp = await fetch('http://127.0.0.1:3001/api/scan/import-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: siteName, products: batch, page: `sitemap-${Math.floor(i/200)+1}` }),
        });
        if (resp.ok) log(`  Import ${Math.floor(i/200)+1}: ${batch.length} OK`);
      } catch (err) { log(`  Import err: ${err.message}`); }
    }
  }

  await browser.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
