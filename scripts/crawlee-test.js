#!/usr/bin/env node
/**
 * TEST CRAWLEE + PLAYWRIGHT
 * Objectif : scraper Arseus Lab (Cloudflare) et comparer avec Puppeteer
 * Si ça passe Cloudflare → on migre tout dessus
 */

const { PlaywrightCrawler, Dataset, Configuration } = require('crawlee');

async function testArseusLab() {
  console.log('=== TEST CRAWLEE — ARSEUS LAB (Cloudflare) ===\n');

  const products = [];

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 3,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 20,

    launchContext: {
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    },

    async requestHandler({ page, request, enqueueLinks, log }) {
      const url = request.url;

      // Page d'accueil ou catégorie → suivre les liens produits
      if (url.includes('/media/sitemap') || url === 'https://www.arseus-lab.fr/') {
        log.info(`Crawling page: ${url}`);
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

        // Récupérer les liens de catégories
        const links = await page.$$eval('a[href]', els =>
          els.map(e => e.href).filter(h =>
            h.includes('arseus-lab.fr/') &&
            !h.includes('/customer/') &&
            !h.includes('/checkout/') &&
            !h.includes('#')
          )
        );
        log.info(`  Found ${links.length} links`);

        await enqueueLinks({
          urls: links.slice(0, 50), // Limiter pour le test
          label: 'CATEGORY'
        });
        return;
      }

      // Page catégorie → extraire les produits
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      // Extraire les produits de la page
      const pageProducts = await page.$$eval('[data-price-amount], .product-item, .product-card', els => {
        return els.map(el => {
          const name = el.querySelector('.product-item-link, .product-name, h2, h3')?.textContent?.trim();
          const priceEl = el.querySelector('[data-price-amount]');
          const price = priceEl ? parseFloat(priceEl.getAttribute('data-price-amount')) : null;
          const link = el.querySelector('a')?.href;
          const ref = el.querySelector('.sku, .reference')?.textContent?.trim();
          return { name, price, ref, url: link };
        }).filter(p => p.name);
      });

      if (pageProducts.length > 0) {
        products.push(...pageProducts);
        log.info(`  ${url.split('/').pop()} → ${pageProducts.length} produits (total: ${products.length})`);
      }

      // Suivre la pagination
      await enqueueLinks({
        selector: '.pages a, .pagination a, a.next',
        label: 'CATEGORY'
      });
    },

    failedRequestHandler({ request, log }) {
      log.warning(`Failed: ${request.url}`);
    }
  });

  // Démarrer par les catégories Arseus Lab
  await crawler.run([
    { url: 'https://www.arseus-lab.fr/', label: 'HOME' }
  ]);

  console.log(`\n=== RÉSULTAT ===`);
  console.log(`Produits trouvés: ${products.length}`);

  if (products.length > 0) {
    console.log('\n--- Échantillon ---');
    products.slice(0, 10).forEach(p => {
      console.log(`  ${(p.ref || '?').padEnd(12)} | ${(p.name || '?').slice(0, 50)} | ${p.price || '?'}€`);
    });

    // Sauvegarder
    const fs = require('fs');
    fs.writeFileSync('/home/ubuntu/jadomi/tmp/arseus-crawlee.json', JSON.stringify({
      supplier: 'Arseus Lab',
      scraped_at: new Date().toISOString(),
      stats: { products: products.length },
      products
    }, null, 2));
    console.log(`\nSauvegardé: /home/ubuntu/jadomi/tmp/arseus-crawlee.json`);
  }
}

async function testDentalGoodDeal() {
  console.log('\n=== TEST CRAWLEE — DENTAL GOOD DEAL ===\n');

  const products = [];

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 3,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 30,

    launchContext: {
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    },

    async requestHandler({ page, request, enqueueLinks, log }) {
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      // Fermer le popup intro s'il y en a un
      await page.click('.ui-dialog-titlebar-close, .close-popup, .intro_encars_dgd a').catch(() => {});
      await page.waitForTimeout(500);

      // Extraire les produits
      const pageProducts = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.produit_bloc, .product-miniature, article').forEach(el => {
          const name = el.querySelector('.produit_titre, .product-title, h2, h3')?.textContent?.trim();
          const priceText = el.querySelector('.produit_prix, .product-price, .price')?.textContent;
          const price = priceText ? parseFloat(priceText.replace(/[^0-9,\.]/g, '').replace(',', '.')) : null;
          const ref = el.querySelector('.produit_ref, .product-reference')?.textContent?.replace(/Réf\.\s*/i, '').trim();
          const link = el.querySelector('a')?.href;
          if (name) items.push({ name, price, ref, url: link });
        });
        return items;
      });

      if (pageProducts.length > 0) {
        products.push(...pageProducts);
        log.info(`${request.url.split('?')[0].split('/').pop()} → ${pageProducts.length} produits (total: ${products.length})`);
      }

      // Pagination
      await enqueueLinks({
        selector: 'a.next, .pagination a[rel="next"], a:has-text("Suivant")',
        label: 'PAGE'
      });
    }
  });

  // Crawler les catégories DGD
  await crawler.run([
    { url: 'https://www.dentalgooddeal.com/consommable_cabinet_dentaire.php?par_page=100', label: 'PAGE' },
    { url: 'https://www.dentalgooddeal.com/petit_equipement.php?par_page=100', label: 'PAGE' },
    { url: 'https://www.dentalgooddeal.com/gros_equipement.php?par_page=100', label: 'PAGE' }
  ]);

  console.log(`\n=== RÉSULTAT DGD ===`);
  console.log(`Produits trouvés: ${products.length}`);

  if (products.length > 0) {
    const fs = require('fs');
    fs.writeFileSync('/home/ubuntu/jadomi/tmp/dentalgooddeal-crawlee.json', JSON.stringify({
      supplier: 'DentalGoodDeal',
      scraped_at: new Date().toISOString(),
      stats: { products: products.length },
      products
    }, null, 2));
  }
}

(async () => {
  // Désactiver le storage Crawlee pour ne pas polluer
  Configuration.getGlobalConfig().set('persistStateIntervalMillis', 0);

  await testArseusLab();
  await testDentalGoodDeal();
})();
