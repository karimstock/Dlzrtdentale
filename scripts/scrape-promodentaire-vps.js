#!/usr/bin/env node
// JADOMI — Scraper Promodentaire via Puppeteer Stealth
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.promodentaire.com';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP = '/home/ubuntu/jadomi/tmp/promodentaire-' + new Date().toISOString().slice(0, 10) + '.json';
const T = Date.now();
const P = {};

function el() { return Math.round((Date.now() - T) / 1000) + 's'; }
function log(m) { console.log(`[JADOMI ${el()}] ${m}`); }

async function waitOk(page) {
  for (let i = 0; i < 20; i++) {
    const t = await page.title();
    if (!t.includes('moment') && !t.includes('security') && !t.includes('Performing') && !t.includes('challenge')) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.product-card,.product-item,.product,.card,[class*=product],.item').forEach(el => {
      let name = '';
      const nameEl = el.querySelector('h2,h3,h4,.product-name,.name,a[class*=name],.title');
      if (nameEl) name = nameEl.textContent.trim();
      if (!name) { const a = el.querySelector('a[href]'); if (a) name = a.textContent.trim().split('\n')[0].trim(); }
      const pe = el.querySelector('.price,.product-price,[class*=price]');
      let price = null;
      if (pe) { price = parseFloat(pe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(price)) price = null; }
      if (!price) { const m = (el.innerText||'').match(/(\d[\d\s]*[.,]\d{2})\s*\u20ac/); if (m) price = parseFloat(m[1].replace(/\s/g,'').replace(',','.')); }
      const url = (el.querySelector('a[href]')||{}).href||'';
      if (name && name.length > 2 && price) items.push({ name, price, ref: '', url });
    });
    return items;
  });
}

async function main() {
  log('=== PROMODENTAIRE VPS (Puppeteer) ===\n');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    log('Warmup...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitOk(page);

    // Discover categories
    log('Decouverte categories...');
    const catUrls = await page.evaluate((base) => {
      const urls = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const h = a.href;
        if (h.startsWith(base) && !h.includes('login') && !h.includes('cart') && !h.includes('account') && !h.includes('contact') && h !== base + '/')
          urls.add(h);
      });
      return Array.from(urls);
    }, BASE);
    log(`${catUrls.length} liens trouves\n`);

    // Scrape categories
    const visited = new Set();
    let idx = 0;
    for (const url of catUrls) {
      if (visited.has(url)) continue;
      visited.add(url);
      idx++;
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        if (!await waitOk(page)) continue;
        const products = await extractProducts(page);
        let added = 0;
        for (const p of products) { const k = p.name; if (!P[k]) { P[k] = p; added++; } }
        if (added > 0) log(`  ${url.replace(BASE,'').substring(0,60)} +${added} = ${Object.keys(P).length}`);
      } catch(e) {}
      if (idx % 20 === 0) log(`--- ${idx}/${catUrls.length}, ${Object.keys(P).length} produits ---`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Search alphabetical
    log('\nRecherche alphabetique...');
    const alpha = 'abcdefghijklmnopqrstuvwxyz';
    const queries = [];
    for (const c of alpha) queries.push(c);
    for (const c1 of alpha) for (const c2 of alpha) queries.push(c1+c2);
    const dentaire = ['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone','alginate','seringue','turbine','autoclave','prothese','empreinte','desinfection','sterilisation','ceramique','zircone','resine'];
    for (const w of dentaire) queries.push(w);

    for (let i = 0; i < queries.length; i++) {
      try {
        await page.goto(BASE + '/recherche?q=' + encodeURIComponent(queries[i]), { waitUntil: 'networkidle2', timeout: 15000 });
        const products = await extractProducts(page);
        let added = 0;
        for (const p of products) { const k = p.name; if (!P[k]) { P[k] = p; added++; } }
        if (added > 0) log(`  "${queries[i]}" +${added} = ${Object.keys(P).length}`);
      } catch(e) {}
      if (i % 50 === 0 && i > 0) log(`--- ${i}/${queries.length}, ${Object.keys(P).length} produits ---`);
      await new Promise(r => setTimeout(r, 1000));
    }

    const products = Object.values(P);
    log(`\n=== TERMINE: ${products.length} produits ===\n`);
    fs.writeFileSync(BACKUP, JSON.stringify(products, null, 2));

    // Import
    let imported = 0;
    for (let i = 0; i < products.length; i += 500) {
      const chunk = products.slice(i, i + 500);
      const bn = Math.floor(i / 500) + 1;
      const data = JSON.stringify({ source: 'promodentaire', products: chunk.map(p => ({ name: p.name, price: p.price, ref: p.ref||'' })), page: 'promo-'+bn });
      try {
        const r = await new Promise((res,rej) => {
          const u = new URL(IMPORT_URL);
          const req = http.request({hostname:u.hostname,port:u.port,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},rr=>{let b='';rr.on('data',d=>b+=d);rr.on('end',()=>{try{res(JSON.parse(b));}catch(e){res({});}});});
          req.on('error',rej);req.write(data);req.end();
        });
        imported += r.imported || 0;
        log(`  Lot ${bn}: ${r.imported||0}`);
      } catch(e) {}
    }
    log(`Import: ${imported}/${products.length}`);
  } catch(e) { log(`ERREUR: ${e.message}`); } finally { await browser.close(); }
  log(`Termine en ${el()}`);
}
main();
