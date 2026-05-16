#!/usr/bin/env node
// JADOMI — Scraper Doctor Strong via Puppeteer Stealth (categories)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.doctorstrong.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP = '/home/ubuntu/jadomi/tmp/doctorstrong-vps-' + new Date().toISOString().slice(0, 10) + '.json';
const PROGRESS = '/home/ubuntu/jadomi/tmp/doctorstrong-progress.json';
const T = Date.now();
const P = {};
const visited = new Set();

function el() { return Math.round((Date.now() - T) / 1000) + 's'; }
function log(m) { console.log(`[JADOMI ${el()}] ${m}`); }

async function waitOk(page) {
  for (let i = 0; i < 15; i++) {
    const t = await page.title();
    if (!t.includes('moment') && !t.includes('security') && !t.includes('Performing')) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('form.product-item,.product-item').forEach(el => {
      const h3 = el.querySelector('h3');
      const linkEl = el.querySelector('a.product-item-link');
      const sku = el.getAttribute('data-sku') || '';
      let name = h3 ? h3.textContent.trim() : '';
      if (!name && linkEl) name = linkEl.textContent.trim().split('\n')[0].trim();
      const pe = el.querySelector('[data-price-type="finalPrice"] .price, .special-price .price, .price');
      let price = null;
      if (pe) { price = parseFloat(pe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(price)) price = null; }
      const oe = el.querySelector('[data-price-type="oldPrice"] .price, .old-price .price');
      let oldPrice = null;
      if (oe) { oldPrice = parseFloat(oe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(oldPrice)) oldPrice = null; }
      const url = linkEl ? linkEl.href : '';
      if (name && name.length > 2 && price) items.push({ name, price, ref: sku, oldPrice, url });
    });
    return items;
  });
}

async function getMaxPage(page) {
  return page.evaluate(() => {
    let m = 1;
    document.querySelectorAll('.pages a').forEach(a => {
      const r = a.textContent.match(/(\d+)/); if (r) { const n = parseInt(r[1]); if (n > m) m = n; }
      const h = (a.getAttribute('href') || '').match(/p=(\d+)/); if (h) { const n = parseInt(h[1]); if (n > m) m = n; }
    });
    return m;
  });
}

async function scrapeCat(page, url) {
  if (visited.has(url)) return 0;
  visited.add(url);
  let added = 0;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    if (!await waitOk(page)) return 0;
    const products = await extractProducts(page);
    if (products.length === 0) return 0;
    for (const p of products) { const k = p.name + '|' + p.ref; if (!P[k]) { P[k] = p; added++; } }
    const maxPage = await getMaxPage(page);
    for (let pg = 2; pg <= maxPage; pg++) {
      await page.goto(url + (url.includes('?') ? '&' : '?') + 'p=' + pg, { waitUntil: 'networkidle2', timeout: 20000 });
      if (!await waitOk(page)) break;
      const pp = await extractProducts(page);
      for (const p of pp) { const k = p.name + '|' + p.ref; if (!P[k]) { P[k] = p; added++; } }
      await new Promise(r => setTimeout(r, 500));
    }
    if (added > 0) log(`  ${url.replace(BASE, '').padEnd(60)} ${maxPage}p +${added} = ${Object.keys(P).length}`);
  } catch(e) {}
  return added;
}

async function main() {
  log('=== DOCTOR STRONG VPS (Puppeteer) ===\n');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    log('Warmup...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitOk(page);

    // Discover categories from nav
    log('Decouverte categories...');
    const catUrls = await page.evaluate((base) => {
      const urls = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const h = a.href;
        if (h.startsWith(base) && h.endsWith('.html') && !h.includes('customer') && !h.includes('checkout') && !h.includes('cookie'))
          urls.add(h);
      });
      return Array.from(urls);
    }, BASE);
    log(`${catUrls.length} categories trouvees\n`);

    // Also do alphabetical search to catch more
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    const searchUrls = [];
    for (const c of alpha) searchUrls.push(BASE + '/catalogsearch/result/?q=' + c);
    for (const c1 of alpha) for (const c2 of alpha) searchUrls.push(BASE + '/catalogsearch/result/?q=' + c1 + c2);
    const dentaire = ['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone','alginate','adhesif','seringue','turbine','contre-angle','detartreur','autoclave','radiographie','blanchiment','prothese','empreinte','polissage','matrice','obturation','chirurgie','prophylaxie','desinfection','sterilisation','membrane','greffon','laser','scanner','ceramique','zircone','resine','amalgame','digue','lime','insert','scellement'];
    for (const w of dentaire) searchUrls.push(BASE + '/catalogsearch/result/?q=' + w);

    const allUrls = [...catUrls, ...searchUrls];
    log(`Total: ${allUrls.length} URLs a scraper\n`);

    let idx = 0;
    for (const url of allUrls) {
      idx++;
      if (idx % 50 === 0) {
        log(`--- ${idx}/${allUrls.length}, ${Object.keys(P).length} produits ---`);
        fs.writeFileSync(PROGRESS, JSON.stringify({ idx, count: Object.keys(P).length }));
      }
      await scrapeCat(page, url);
      await new Promise(r => setTimeout(r, 800));
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
      const data = JSON.stringify({ source: 'doctorstrong', products: chunk.map(p => ({ name: p.name, price: p.price, ref: p.ref || '', price_original: p.oldPrice || null })), page: 'ds-vps-' + bn });
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
  } catch(e) { log(`ERREUR: ${e.message}`); } finally { await browser.close(); }
  log(`Termine en ${el()}`);
}
main();
