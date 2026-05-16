#!/usr/bin/env node
// Exploration dentalclick.fr : structure, login, sélecteurs
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const BASE = 'https://www.dentalclick.fr';
const EMAIL = 'karim_bahmed@yahoo.fr';
const PASSWORD = '1987@Karim';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  // 1. Accueil
  console.log('=== 1. ACCUEIL ===');
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  // 2. Login
  console.log('\n=== 2. LOGIN ===');
  const loginLink = await page.evaluate((base) => {
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.href.includes('login') || a.href.includes('connexion') || a.href.includes('account') || a.href.includes('mon-compte')) return a.href;
    }
    return null;
  }, BASE);
  console.log('Login link:', loginLink);

  if (loginLink) {
    await page.goto(loginLink, { waitUntil: 'networkidle2', timeout: 30000 });
  } else {
    for (const path of ['/customer/account/login/', '/connexion', '/login']) {
      try {
        await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 10000 });
        const hasForm = await page.evaluate(() => !!document.querySelector('input[type="email"], input[type="password"]'));
        if (hasForm) { console.log('Login form at:', path); break; }
      } catch(e) {}
    }
  }

  console.log('Title:', await page.title());
  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({
    type: i.type, name: i.name, id: i.id, placeholder: i.placeholder
  })).filter(i => i.type !== 'hidden'));
  console.log('Inputs:', JSON.stringify(inputs, null, 2));

  // 3. Catégories
  console.log('\n=== 3. CATEGORIES ===');
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  const menuBtn = await page.$('button[aria-label*="menu"], .menu-toggle, .nav-toggle');
  if (menuBtn) { try { await menuBtn.click(); await new Promise(r => setTimeout(r, 2000)); } catch(e) {} }

  const catLinks = await page.evaluate((base) => {
    const urls = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      if (a.href.startsWith(base) && !a.href.includes('customer') && !a.href.includes('checkout') &&
          !a.href.includes('blog') && !a.href.includes('cookie') && a.href !== base + '/') {
        urls.add(a.href.replace(base, ''));
      }
    });
    return Array.from(urls).sort();
  }, BASE);
  console.log(`Liens: ${catLinks.length}`);
  catLinks.slice(0, 50).forEach(l => console.log('  ' + l));

  // 4. Page produit test
  console.log('\n=== 4. PAGE PRODUIT ===');
  // Trouver une page avec des produits
  const productPages = catLinks.filter(l => l.endsWith('.html') && !l.match(/\d{3}-\d{4}/));
  for (const pp of productPages.slice(0, 3)) {
    try {
      await page.goto(BASE + pp, { waitUntil: 'networkidle2', timeout: 15000 });
      const count = await page.evaluate(() => {
        const selectors = ['form.product-item', '.product-item', '.product-card', '.product', '[data-product-id]', '.product-item-info'];
        for (const s of selectors) {
          const n = document.querySelectorAll(s).length;
          if (n > 0) return { selector: s, count: n };
        }
        return { selector: 'none', count: 0 };
      });
      console.log(`${pp}: ${count.count} produits (${count.selector})`);

      if (count.count > 0) {
        // Extraire un produit sample
        const sample = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return {
            html: el.outerHTML.substring(0, 1000),
            text: el.textContent.trim().substring(0, 200)
          };
        }, count.selector);
        if (sample) console.log('Sample:', sample.text.substring(0, 150));
        break;
      }
    } catch(e) {}
  }

  // 5. Sitemap/robots
  console.log('\n=== 5. SITEMAP ===');
  try {
    await page.goto(BASE + '/robots.txt', { waitUntil: 'networkidle2', timeout: 10000 });
    const robots = await page.evaluate(() => document.body.innerText);
    console.log(robots.substring(0, 500));
  } catch(e) { console.log('No robots.txt'); }

  // 6. Technologie (Magento, Shopify, PrestaShop, etc.)
  console.log('\n=== 6. TECHNOLOGIE ===');
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  const tech = await page.evaluate(() => {
    const hints = [];
    if (document.querySelector('meta[name="generator"]')) hints.push('generator: ' + document.querySelector('meta[name="generator"]').content);
    if (document.querySelector('[data-shopify]') || document.querySelector('#shopify-section-header')) hints.push('Shopify');
    if (document.querySelector('.woocommerce') || document.body.classList.contains('woocommerce-page')) hints.push('WooCommerce');
    if (document.querySelector('#prestashop') || document.querySelector('[data-prestashop]')) hints.push('PrestaShop');
    if (document.querySelector('script[src*="magento"]') || document.querySelector('script[src*="mage"]')) hints.push('Magento');
    if (document.querySelector('script[src*="hyva"]')) hints.push('Hyva');
    if (window.Magento || window.require?.s?.contexts?._.config?.baseUrl?.includes('magento')) hints.push('Magento JS');

    // Check cookies
    const cookies = document.cookie;
    if (cookies.includes('PHPSESSID')) hints.push('PHP');
    if (cookies.includes('PrestaShop')) hints.push('PrestaShop cookie');

    return hints;
  });
  console.log('Tech hints:', tech);

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
