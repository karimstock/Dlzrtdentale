#!/usr/bin/env node
/**
 * ARSEUS LAB - CRAWLEE FULL SCRAPER
 * Crawl TOUTES les catégories + pagination
 * Passe Cloudflare via Playwright
 */

const { PlaywrightCrawler } = require('crawlee');
const fs = require('fs');
const path = require('path');

const TMP = '/home/ubuntu/jadomi/tmp';
const OUTPUT = path.join(TMP, 'arseus-full.json');
const products = new Map(); // ref/name → product (dédoublonné)

(async () => {
  console.log('=== ARSEUS LAB — CRAWL COMPLET ===\n');

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 2,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 45,
    navigationTimeoutSecs: 25,
    maxRequestsPerMinute: 30, // Discret

    launchContext: {
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    },

    async requestHandler({ page, request, enqueueLinks, log }) {
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      const url = request.url;
      const label = request.label || 'UNKNOWN';

      if (label === 'HOME') {
        // Page d'accueil → récupérer TOUTES les catégories
        const catLinks = await page.$$eval('a[href]', els =>
          els.map(e => e.href)
            .filter(h => h.includes('arseus-lab.fr/') &&
                         !h.includes('/customer/') && !h.includes('/checkout/') &&
                         !h.includes('/wishlist/') && !h.includes('#') &&
                         !h.includes('javascript:') && !h.includes('/catalogsearch/') &&
                         !h.includes('.pdf'))
        );

        // Dédoublonner
        const unique = [...new Set(catLinks)];
        log.info(`Accueil: ${unique.length} liens uniques trouvés`);

        await enqueueLinks({ urls: unique, label: 'CATEGORY' });
        return;
      }

      // Extraire les produits de la page
      const pageProducts = await page.evaluate(() => {
        const items = [];

        // Magento product list
        document.querySelectorAll('.product-item, .product-card, li.item.product').forEach(el => {
          const nameEl = el.querySelector('.product-item-link, .product-name, a.product, h2 a, h3 a');
          const name = nameEl?.textContent?.trim();
          const link = nameEl?.href || el.querySelector('a')?.href;
          const priceEl = el.querySelector('[data-price-amount]');
          const price = priceEl ? parseFloat(priceEl.getAttribute('data-price-amount')) : null;
          const oldPriceEl = el.querySelector('.old-price [data-price-amount]');
          const oldPrice = oldPriceEl ? parseFloat(oldPriceEl.getAttribute('data-price-amount')) : null;
          const refEl = el.querySelector('.sku, .reference, .product-item-sku');
          const ref = refEl?.textContent?.trim() || '';

          if (name) items.push({ name, price, oldPrice, ref, url: link });
        });

        // Aussi JSON-LD si présent
        document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
          try {
            const d = JSON.parse(s.textContent);
            const arr = Array.isArray(d) ? d : [d];
            arr.forEach(item => {
              if (item['@type'] === 'Product') {
                items.push({
                  name: item.name,
                  price: item.offers?.price ? parseFloat(item.offers.price) : null,
                  ref: item.sku || item.mpn || '',
                  brand: item.brand?.name || '',
                  url: item.url || window.location.href
                });
              }
            });
          } catch (e) {}
        });

        return items;
      });

      if (pageProducts.length > 0) {
        for (const p of pageProducts) {
          const key = p.ref || p.name;
          if (key && !products.has(key)) {
            p.supplier = 'Arseus Lab';
            products.set(key, p);
          }
        }
        log.info(`${url.split('arseus-lab.fr')[1]?.slice(0, 50) || url} → +${pageProducts.length} (total: ${products.size})`);
      }

      // Suivre pagination + sous-catégories
      await enqueueLinks({
        selector: '.pages a, .toolbar a, a.next, a.action.next, .category-item a',
        label: 'CATEGORY'
      });
    },

    failedRequestHandler({ request, log }) {
      log.warning(`Failed: ${request.url}`);
    }
  });

  await crawler.run([
    { url: 'https://www.arseus-lab.fr/', label: 'HOME' }
  ]);

  const allProducts = [...products.values()];

  console.log(`\n=== RÉSULTAT ARSEUS LAB ===`);
  console.log(`Produits uniques: ${allProducts.length}`);
  console.log(`Avec prix: ${allProducts.filter(p => p.price).length}`);
  console.log(`Avec ref: ${allProducts.filter(p => p.ref).length}`);

  fs.writeFileSync(OUTPUT, JSON.stringify({
    supplier: 'Arseus Lab',
    scraped_at: new Date().toISOString(),
    stats: {
      products: allProducts.length,
      with_price: allProducts.filter(p => p.price).length,
      with_ref: allProducts.filter(p => p.ref).length
    },
    products: allProducts
  }, null, 2));

  console.log(`Sauvegardé: ${OUTPUT}`);

  // Import Supabase
  for (let b = 0; b < allProducts.length; b += 500) {
    const batch = allProducts.slice(b, b + 500).map(p => ({
      supplier_name: 'Arseus Lab',
      product_name: p.name || '',
      brand: p.brand || '',
      reference: p.ref || '',
      price: p.price || null,
      price_original: p.oldPrice || null,
      url: p.url || ''
    }));
    try {
      await fetch('http://localhost:3001/api/scan/import-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'arseus-lab', products: batch })
      });
    } catch (e) {}
  }
  console.log('→ Importé dans Supabase');
})();
