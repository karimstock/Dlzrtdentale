#!/usr/bin/env node
// =============================================
// JADOMI — Henry Schein API Hunter
//
// Phase 1: Login Puppeteer + intercepter les appels XHR/API
// Phase 2: Identifier les endpoints catalogue
// Phase 3: Appeler l'API directement avec les cookies
//
// Le but: trouver l'API interne qui sert 80K+ produits
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const LOG_FILE = '/tmp/henryschein-api-hunt.log';
const COOKIES_FILE = '/tmp/henryschein-cookies.json';
const API_ENDPOINTS_FILE = '/tmp/henryschein-api-endpoints.json';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function main() {
  log('=== HENRY SCHEIN API HUNTER ===');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Intercepter TOUTES les requêtes réseau
  const apiCalls = [];
  await page.setRequestInterception(true);

  page.on('request', (req) => {
    const url = req.url();
    const type = req.resourceType();

    // Logger les appels XHR/fetch/API
    if (type === 'xhr' || type === 'fetch' || url.includes('/api/') || url.includes('search') || url.includes('product') || url.includes('catalog')) {
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('analytics') && !url.includes('google') && !url.includes('usercentrics')) {
        apiCalls.push({
          url: url,
          method: req.method(),
          type: type,
          headers: req.headers(),
          postData: req.postData() || null,
        });
      }
    }
    req.continue();
  });

  // Capturer les réponses aussi
  const apiResponses = [];
  page.on('response', async (res) => {
    const url = res.url();
    if ((url.includes('/api/') || url.includes('search') || url.includes('product') || url.includes('catalog')) &&
        !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('analytics') && !url.includes('google')) {
      try {
        const contentType = res.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await res.text().catch(() => '');
          apiResponses.push({
            url: url,
            status: res.status(),
            contentType: contentType,
            bodyPreview: body.substring(0, 500),
            bodySize: body.length,
          });
        }
      } catch {}
    }
  });

  // PHASE 1: LOGIN
  log('\n--- Phase 1: Login ---');
  try {
    await page.goto('https://www.henryschein.fr/fr-fr/Cabinet/Default.aspx?registered=true', {
      waitUntil: 'networkidle2', timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 3000));

    // Remplir login
    await page.evaluate(() => {
      const email = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtLogonName');
      const pass = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtPassword');
      if (email) { email.value = 'karim_bahmed@yahoo.fr'; email.dispatchEvent(new Event('change', {bubbles:true})); }
      if (pass) { pass.value = '1987@Amjad'; pass.dispatchEvent(new Event('change', {bubbles:true})); }
    });
    await new Promise(r => setTimeout(r, 500));

    await page.evaluate(() => {
      const btn = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_btnLoginCallback');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 8000));
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    // Vérifier login
    const logged = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Déconnexion') || text.includes('Mon panier') || text.includes('Bienvenue');
    });
    log(logged ? '  Login OK' : '  Login incertain');

    // Sauvegarder les cookies
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    log(`  ${cookies.length} cookies sauvegardés`);

  } catch (err) {
    log('  Login erreur: ' + err.message);
  }

  // PHASE 2: NAVIGUER LES CATÉGORIES (intercepter les API)
  log('\n--- Phase 2: Navigation catégories (interception API) ---');
  const testCategories = [
    '/fr-fr/dental/c/endodontie',
    '/fr-fr/dental/c/restauration',
  ];

  for (const cat of testCategories) {
    log(`  Catégorie: ${cat}`);
    try {
      await page.goto('https://www.henryschein.fr' + cat, {
        waitUntil: 'networkidle2', timeout: 25000,
      });
      await new Promise(r => setTimeout(r, 3000));

      // Combien de produits sur la page
      const count = await page.evaluate(() => {
        const items = document.querySelectorAll('.product-thumb, .product-item, .product-tile, [data-product-id], .search-result-item, .product, tr.product-row');
        return items.length;
      });
      log(`    ${count} produits visibles sur la page`);

      // Chercher un bouton "tout afficher" ou pagination
      const pagination = await page.evaluate(() => {
        const text = document.body.innerText;
        const totalMatch = text.match(/(\d+)\s*(?:résultat|produit|article)/i);
        return totalMatch ? totalMatch[0] : null;
      });
      if (pagination) log(`    Pagination: "${pagination}"`);

      // Scroll en bas pour déclencher lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      log(`    Erreur: ${err.message}`);
    }
  }

  // PHASE 3: TESTER LA RECHERCHE (souvent la meilleure API)
  log('\n--- Phase 3: Recherche ---');
  try {
    await page.goto('https://www.henryschein.fr/fr-fr/dental/Search.aspx?searchkeyWord=composite', {
      waitUntil: 'networkidle2', timeout: 25000,
    });
    await new Promise(r => setTimeout(r, 3000));

    const searchResults = await page.evaluate(() => {
      const items = document.querySelectorAll('.product-thumb, .product-item, .product-tile, [data-product-id], .search-result-item, .product');
      const total = document.body.innerText.match(/(\d+)\s*(?:résultat|produit|article)/i);
      return {
        visibleProducts: items.length,
        totalText: total ? total[0] : null,
      };
    });
    log(`  Recherche "composite": ${searchResults.visibleProducts} produits, ${searchResults.totalText || '?'}`);

  } catch (err) {
    log(`  Recherche erreur: ${err.message}`);
  }

  // BILAN: tous les appels API interceptés
  log('\n--- BILAN API INTERCEPTÉES ---');
  log(`  ${apiCalls.length} appels réseau interceptés`);
  log(`  ${apiResponses.length} réponses JSON captées`);

  // Filtrer les endpoints intéressants
  const uniqueEndpoints = {};
  for (const call of apiCalls) {
    const urlClean = call.url.split('?')[0];
    if (!uniqueEndpoints[urlClean]) {
      uniqueEndpoints[urlClean] = { method: call.method, fullUrl: call.url, type: call.type, count: 1 };
    } else {
      uniqueEndpoints[urlClean].count++;
    }
  }

  log('\n  Endpoints uniques:');
  Object.entries(uniqueEndpoints)
    .filter(([url]) => !url.includes('google') && !url.includes('analytics') && !url.includes('usercentrics') && !url.includes('facebook'))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .forEach(([url, info]) => {
      log(`    [${info.method}] ${url} (${info.count}x)`);
    });

  log('\n  Réponses JSON:');
  apiResponses.forEach(r => {
    log(`    ${r.url.substring(0, 80)} → ${r.status} (${r.bodySize} bytes)`);
    log(`      Preview: ${r.bodyPreview.substring(0, 150)}`);
  });

  // Sauvegarder
  fs.writeFileSync(API_ENDPOINTS_FILE, JSON.stringify({
    date: new Date().toISOString(),
    endpoints: uniqueEndpoints,
    jsonResponses: apiResponses,
    cookies: COOKIES_FILE,
  }, null, 2));

  log('\n  Résultats sauvés dans ' + API_ENDPOINTS_FILE);

  await browser.close();
  log('\nTerminé !');
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
