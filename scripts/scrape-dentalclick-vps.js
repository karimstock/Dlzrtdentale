#!/usr/bin/env node
// JADOMI — Scraper DentalClick via Puppeteer Stealth (search)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.dentalclick.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP = '/home/ubuntu/jadomi/tmp/dentalclick-vps-' + new Date().toISOString().slice(0, 10) + '.json';
const PROGRESS = '/home/ubuntu/jadomi/tmp/dentalclick-progress.json';
const T = Date.now();
const P = {};

function el() { return Math.round((Date.now() - T) / 1000) + 's'; }
function log(m) { console.log(`[JADOMI ${el()}] ${m}`); }

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.product-card,.product-item,.product,.card,[class*=product]').forEach(el => {
      const linkEl = el.querySelector('a[href*="/products/"],a[href*="/product/"],h2 a,h3 a,.product-name a,.card-title a');
      let name = '';
      const nameEl = el.querySelector('h2,h3,.product-name,.card-title,.name');
      if (nameEl) name = nameEl.textContent.trim();
      if (!name && linkEl) name = linkEl.textContent.trim().split('\n')[0].trim();
      const pe = el.querySelector('.price,.product-price,.current-price');
      let price = null;
      if (pe) { price = parseFloat(pe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(price)) price = null; }
      if (!price) {
        const txt = el.innerText || '';
        const m = txt.match(/(\d[\d\s]*[.,]\d{2})\s*\u20ac/);
        if (m) price = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      }
      const oe = el.querySelector('.old-price,.original-price,.was-price');
      let oldPrice = null;
      if (oe) { oldPrice = parseFloat(oe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(oldPrice)) oldPrice = null; }
      const url = linkEl ? linkEl.href : '';
      const ref = '';
      if (name && name.length > 2 && price) items.push({ name, price, ref, oldPrice, url });
    });
    return items;
  });
}

async function getMaxPage(page) {
  return page.evaluate(() => {
    let m = 1;
    document.querySelectorAll('a[href*="page="],.pagination a,.pager a').forEach(a => {
      const h = (a.getAttribute('href') || '').match(/page=(\d+)/);
      if (h) { const n = parseInt(h[1]); if (n > m) m = n; }
      const r = a.textContent.match(/^(\d+)$/);
      if (r) { const n = parseInt(r[1]); if (n > m) m = n; }
    });
    return m;
  });
}

async function searchQuery(page, q) {
  const url = BASE + '/products/search?q=' + encodeURIComponent(q) + '&subfamilies=true';
  let added = 0;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const products = await extractProducts(page);
    for (const p of products) { const k = p.name + '|' + p.ref; if (!P[k]) { P[k] = p; added++; } }
    const maxPage = await getMaxPage(page);
    for (let pg = 2; pg <= maxPage; pg++) {
      await page.goto(url + '&page=' + pg, { waitUntil: 'networkidle2', timeout: 15000 });
      const pp = await extractProducts(page);
      for (const p of pp) { const k = p.name + '|' + p.ref; if (!P[k]) { P[k] = p; added++; } }
      await new Promise(r => setTimeout(r, 300));
    }
    if (added > 0) log(`  "${q}" ${maxPage}p +${added} = ${Object.keys(P).length}`);
  } catch(e) {}
  return added;
}

async function main() {
  log('=== DENTALCLICK VPS (Puppeteer) ===\n');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    log('Warmup...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });

    // Build queries
    const queries = [];
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    for (const c of alpha) queries.push(c);
    for (const c1 of alpha) for (const c2 of alpha) queries.push(c1 + c2);
    const dentaire = ['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone','alginate','adhesif','seringue','turbine','contre-angle','detartreur','autoclave','radiographie','blanchiment','prothese','empreinte','polissage','matrice','obturation','chirurgie','prophylaxie','desinfection','sterilisation','membrane','greffon','laser','scanner','ceramique','zircone','resine','amalgame','digue','lime','insert','scellement'];
    for (const w of dentaire) queries.push(w);

    // Resume
    let startIdx = 0;
    if (fs.existsSync(PROGRESS)) {
      try {
        const prog = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
        startIdx = prog.idx || 0;
        Object.assign(P, prog.products || {});
        log(`REPRISE #${startIdx}, ${Object.keys(P).length} produits`);
      } catch(e) {}
    }

    log(`${queries.length} requetes, debut #${startIdx}\n`);

    for (let i = startIdx; i < queries.length; i++) {
      if (i % 26 === 0) {
        log(`--- ${i}/${queries.length}, ${Object.keys(P).length} produits ---`);
        fs.writeFileSync(PROGRESS, JSON.stringify({ idx: i, products: P }));
      }
      await searchQuery(page, queries[i]);
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
      const data = JSON.stringify({ source: 'dentalclick', products: chunk.map(p => ({ name: p.name, price: p.price, ref: p.ref || '', price_original: p.oldPrice || null })), page: 'dc-vps-' + bn });
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
    if (fs.existsSync(PROGRESS)) fs.unlinkSync(PROGRESS);
  } catch(e) { log(`ERREUR: ${e.message}`); } finally { await browser.close(); }
  log(`Termine en ${el()}`);
}
main();
