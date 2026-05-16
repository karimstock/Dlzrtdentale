#!/usr/bin/env node
// JADOMI — Scraper Henry Schein FR via Puppeteer Stealth
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.henryschein.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP = '/home/ubuntu/jadomi/tmp/henryschein-' + new Date().toISOString().slice(0, 10) + '.json';
const T = Date.now();
const P = {};

function el() { return Math.round((Date.now() - T) / 1000) + 's'; }
function log(m) { console.log(`[JADOMI ${el()}] ${m}`); }

async function waitOk(page) {
  for (let i = 0; i < 20; i++) {
    const t = await page.title();
    if (!t.includes('moment') && !t.includes('security') && !t.includes('Performing') && !t.includes('challenge') && !t.includes('Checking')) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = [];
    // Henry Schein uses various product card selectors
    document.querySelectorAll('.product-card,.product-item,.productCard,.search-result-item,[class*=product][class*=card],[class*=product][class*=item],.item-product').forEach(el => {
      let name = '';
      const nameEl = el.querySelector('h2,h3,h4,.product-name,.productName,.item-name,[class*=product][class*=name],[class*=item][class*=name],a[class*=name]');
      if (nameEl) name = nameEl.textContent.trim();
      if (!name) {
        const a = el.querySelector('a[href]');
        if (a) name = a.textContent.trim().split('\n')[0].trim();
      }
      const pe = el.querySelector('.price,.product-price,.productPrice,[class*=price]');
      let price = null;
      if (pe) {
        const txt = pe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.');
        price = parseFloat(txt);
        if (isNaN(price)) price = null;
      }
      if (!price) {
        const txt = el.innerText || '';
        const m = txt.match(/(\d[\d\s]*[.,]\d{2})\s*\u20ac/);
        if (m) price = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      }
      const ref = (el.querySelector('[data-sku],[data-ref],[data-product-id]') || {}).getAttribute?.('data-sku') || '';
      const url = (el.querySelector('a[href]') || {}).href || '';
      if (name && name.length > 2 && price) items.push({ name, price, ref, url });
    });
    return items;
  });
}

async function scrapePage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    if (!await waitOk(page)) return 0;
    await new Promise(r => setTimeout(r, 2000));
    const products = await extractProducts(page);
    let added = 0;
    for (const p of products) {
      const k = p.name + '|' + p.ref;
      if (!P[k]) { P[k] = p; added++; }
    }
    return added;
  } catch(e) { return 0; }
}

async function main() {
  log('=== HENRY SCHEIN FR VPS (Puppeteer) ===\n');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    log('Warmup...');
    await page.goto(BASE + '/fr-fr/dentaire/c/1', { waitUntil: 'networkidle2', timeout: 60000 });
    await waitOk(page);
    await new Promise(r => setTimeout(r, 3000));

    // Discover all category links
    log('Decouverte categories...');
    const catUrls = await page.evaluate((base) => {
      const urls = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const h = a.href;
        if (h.startsWith(base) && (h.includes('/c/') || h.includes('/dentaire/')) && !h.includes('login') && !h.includes('cart'))
          urls.add(h);
      });
      return Array.from(urls);
    }, BASE);
    log(`${catUrls.length} categories\n`);

    // Also use search
    const queries = [];
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    for (const c of alpha) queries.push(c);
    for (const c1 of alpha) for (const c2 of alpha) queries.push(c1 + c2);
    const dentaire = ['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone','alginate','adhesif','seringue','turbine','contre-angle','detartreur','autoclave','radiographie','blanchiment','prothese','empreinte','polissage','matrice','obturation','chirurgie','prophylaxie','desinfection','sterilisation','membrane','laser','scanner','ceramique','zircone','resine','digue','lime','insert','scellement'];
    for (const w of dentaire) queries.push(w);

    // Scrape categories first
    let idx = 0;
    for (const url of catUrls) {
      idx++;
      const added = await scrapePage(page, url);
      if (added > 0) log(`  CAT ${url.replace(BASE, '').substring(0, 60)} +${added} = ${Object.keys(P).length}`);
      if (idx % 20 === 0) log(`--- ${idx}/${catUrls.length} cats, ${Object.keys(P).length} produits ---`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Then search
    log(`\nRecherche alphabetique: ${queries.length} requetes...`);
    for (let i = 0; i < queries.length; i++) {
      const url = BASE + '/fr-fr/search?text=' + encodeURIComponent(queries[i]);
      const added = await scrapePage(page, url);
      if (added > 0) log(`  "${queries[i]}" +${added} = ${Object.keys(P).length}`);
      if (i % 50 === 0 && i > 0) log(`--- ${i}/${queries.length}, ${Object.keys(P).length} produits ---`);
      await new Promise(r => setTimeout(r, 1500));
    }

    const products = Object.values(P);
    log(`\n=== TERMINE: ${products.length} produits ===\n`);
    fs.writeFileSync(BACKUP, JSON.stringify(products, null, 2));

    // Import
    log('Import...');
    let imported = 0;
    for (let i = 0; i < products.length; i += 500) {
      const chunk = products.slice(i, i + 500);
      const bn = Math.floor(i / 500) + 1;
      const data = JSON.stringify({ source: 'henryschein', products: chunk.map(p => ({ name: p.name, price: p.price, ref: p.ref || '' })), page: 'hs-vps-' + bn });
      try {
        const r = await new Promise((res, rej) => {
          const u = new URL(IMPORT_URL);
          const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, rr => { let b = ''; rr.on('data', d => b += d); rr.on('end', () => { try { res(JSON.parse(b)); } catch(e) { res({}); } }); });
          req.on('error', rej); req.write(data); req.end();
        });
        imported += r.imported || 0;
        log(`  Lot ${bn}: ${r.imported || 0}`);
      } catch(e) { log(`  ERR: ${e.message}`); }
    }
    log(`Import: ${imported}/${products.length}`);
  } catch(e) { log(`ERREUR: ${e.message}`); console.error(e); } finally { await browser.close(); }
  log(`Termine en ${el()}`);
}
main();
