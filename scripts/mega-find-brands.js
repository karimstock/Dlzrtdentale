#!/usr/bin/env node
// Trouver la liste des marques sur Mega Dental et Doctor-AI
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  for (const site of ['https://www.megadental.fr', 'https://www.doctor-ai.fr']) {
    console.log('\n=== ' + site + ' ===');

    // 1. Chercher une page marques
    for (const path of ['/marques', '/brands', '/marques.html', '/brands.html', '/marques-coup-de-coeur.html', '/nos-marques', '/nos-marques.html']) {
      try {
        const resp = await page.goto(site + path, { waitUntil: 'networkidle2', timeout: 10000 });
        if (resp && resp.status() === 200) {
          const title = await page.title();
          if (!title.includes('404') && !title.includes('moment')) {
            const brands = await page.evaluate(() => {
              const links = [];
              document.querySelectorAll('a[href]').forEach(a => {
                if (a.textContent.trim().length > 1 && a.textContent.trim().length < 50) {
                  links.push({ text: a.textContent.trim(), href: a.href });
                }
              });
              return links.slice(0, 20);
            });
            console.log('  PAGE: ' + path + ' => ' + title);
            if (brands.length > 0) console.log('  Liens:', brands.slice(0, 10).map(b => b.text).join(', '));
          }
        }
      } catch(e) {}
    }

    // 2. Aller sur une categorie et chercher les filtres
    const catUrl = site.includes('megadental') ? '/usage-unique.html' : '/usage-unique-2.html';
    await page.goto(site + catUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const filters = await page.evaluate(() => {
      const results = {};
      // Filtres layered navigation Magento
      document.querySelectorAll('.filter-options-item, .block-layered-nav .filter, [data-role="collapsible"]').forEach(block => {
        const title = block.querySelector('.filter-options-title, dt, [data-role="title"]');
        const items = block.querySelectorAll('.filter-options-item a, .item a, li a, [data-role="content"] a');
        if (title) {
          const titleText = title.textContent.trim();
          results[titleText] = Array.from(items).slice(0, 10).map(a => ({
            text: a.textContent.trim(),
            href: a.href || '',
            count: (a.querySelector('.count') || {}).textContent || ''
          }));
        }
      });

      // Aussi chercher dans les filtres x-data Alpine
      document.querySelectorAll('[x-data*="filter"], [x-data*="Filter"]').forEach(el => {
        results['alpine-filter'] = el.outerHTML.substring(0, 500);
      });

      // Sidebar filtres
      document.querySelectorAll('.sidebar .block, .layered-navigation, #layered-filter-block').forEach(block => {
        results['sidebar'] = block.innerHTML.substring(0, 1000);
      });

      return results;
    });

    console.log('  Filtres trouvés:');
    for (const [name, items] of Object.entries(filters)) {
      if (Array.isArray(items)) {
        console.log('    ' + name + ': ' + items.length + ' options');
        items.slice(0, 5).forEach(i => console.log('      ' + i.text + ' ' + i.count));
      } else {
        console.log('    ' + name + ': ' + (typeof items === 'string' ? items.substring(0, 200) : JSON.stringify(items).substring(0, 200)));
      }
    }

    // 3. Chercher un endpoint ElasticSearch pour les marques
    console.log('  Recherche API marques...');
    const brandApi = await page.evaluate(async () => {
      try {
        const r = await fetch('/rest/V1/products/attributes/manufacturer/options', { headers: { 'Accept': 'application/json' } });
        if (r.ok) return { endpoint: 'manufacturer', data: (await r.json()).slice(0, 10) };
      } catch(e) {}
      try {
        const r = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ customAttributeMetadata(attributes:[{attribute_code:"manufacturer",entity_type:"catalog_product"}]){items{attribute_options{value label}}}}' })
        });
        if (r.ok) { const d = await r.json(); return { endpoint: 'graphql', data: d }; }
      } catch(e) {}
      return null;
    });
    if (brandApi) console.log('  API marques:', JSON.stringify(brandApi).substring(0, 500));
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
