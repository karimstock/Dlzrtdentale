#!/usr/bin/env node
// JADOMI — Scraper generique pour tout site dentaire via Puppeteer Stealth
// Usage: node scrape-generic-vps.js <source_name> <base_url> [search_path]
// Ex: node scrape-generic-vps.js dentalgooddeal https://www.dentalgooddeal.com /recherche?s=
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const SOURCE = process.argv[2] || 'unknown';
const BASE = process.argv[3] || '';
const SEARCH_PATH = process.argv[4] || '/recherche?q=';
if (!BASE) { console.log('Usage: node scrape-generic-vps.js <source> <base_url> [search_path]'); process.exit(1); }

const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP = `/home/ubuntu/jadomi/tmp/${SOURCE}-${new Date().toISOString().slice(0,10)}.json`;
const T = Date.now();
const P = {};

function el() { return Math.round((Date.now()-T)/1000)+'s'; }
function log(m) { console.log(`[JADOMI ${el()}] ${m}`); }

async function waitOk(page) {
  for (let i=0;i<20;i++) {
    const t = await page.title();
    if (!t.includes('moment')&&!t.includes('security')&&!t.includes('Performing')&&!t.includes('challenge')&&!t.includes('Checking')&&!t.includes('Just a moment')) return true;
    await new Promise(r=>setTimeout(r,2000));
  }
  return false;
}

async function extractProducts(page) {
  return page.evaluate(() => {
    const items = [];
    const selectors = '.product-card,.product-item,.product,.card,.item-product,.product-miniature,.product_list_item,.thumbnail,.product-layout,.products-grid li';
    document.querySelectorAll(selectors).forEach(el => {
      let name = '';
      const nameEl = el.querySelector('h2,h3,h4,.product-name,.name,.product-title,.title,a[class*=name],a[class*=title],.product_name');
      if (nameEl) name = nameEl.textContent.trim().split('\n')[0].trim();
      if (!name) { const a = el.querySelector('a[href]'); if (a && a.textContent.trim().length > 3) name = a.textContent.trim().split('\n')[0].trim(); }
      let price = null;
      const pe = el.querySelector('.price,.product-price,.current-price,.regular-price,.special-price,[class*=price]:not([class*=old]):not([class*=was])');
      if (pe) { price = parseFloat(pe.textContent.replace(/[^0-9.,]/g,'').replace(',','.')); if (isNaN(price)) price = null; }
      if (!price) { const m = (el.innerText||'').match(/(\d[\d\s]*[.,]\d{2})\s*\u20ac/); if (m) price = parseFloat(m[1].replace(/\s/g,'').replace(',','.')); }
      let oldPrice = null;
      const oe = el.querySelector('.old-price,.regular-price,.was-price,[class*=old][class*=price]');
      if (oe) { oldPrice = parseFloat(oe.textContent.replace(/[^0-9.,]/g,'').replace(',','.')); if (isNaN(oldPrice)) oldPrice = null; }
      const url = (el.querySelector('a[href]')||{}).href||'';
      const ref = (el.querySelector('[data-sku],[data-ref],[data-id-product]')||{}).getAttribute?.('data-sku')||(el.querySelector('[data-sku],[data-ref],[data-id-product]')||{}).getAttribute?.('data-id-product')||'';
      if (name && name.length > 2 && price && price > 0.01) items.push({ name: name.substring(0,300), price, ref: ref||'', oldPrice, url });
    });
    return items;
  });
}

async function getMaxPage(page) {
  return page.evaluate(() => {
    let m = 1;
    document.querySelectorAll('.pagination a,a.page,a[href*="page="],a[href*="p="],.pages a').forEach(a => {
      const r = a.textContent.match(/^(\d+)$/); if (r) { const n=parseInt(r[1]); if(n>m)m=n; }
      const h = (a.getAttribute('href')||'').match(/(?:page|p)=(\d+)/); if(h){const n=parseInt(h[1]);if(n>m)m=n;}
    });
    return Math.min(m, 10); // cap at 10 pages
  });
}

async function main() {
  log(`=== ${SOURCE.toUpperCase()} VPS (Puppeteer) ===`);
  log(`Base: ${BASE}`);
  log(`Search: ${SEARCH_PATH}\n`);

  const browser = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    log('Warmup...');
    await page.goto(BASE, { waitUntil:'networkidle2', timeout:60000 });
    await waitOk(page);

    // Phase 1: Categories from homepage
    log('Decouverte categories...');
    const catUrls = await page.evaluate((base) => {
      const urls = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const h = a.href;
        if (h.startsWith(base) && !h.includes('login') && !h.includes('cart') && !h.includes('account') && !h.includes('contact') && !h.includes('blog') && !h.includes('javascript') && h !== base+'/' && h !== base)
          urls.add(h);
      });
      return Array.from(urls).slice(0, 200);
    }, BASE);
    log(`${catUrls.length} categories\n`);

    const visited = new Set();
    for (let i = 0; i < catUrls.length; i++) {
      if (visited.has(catUrls[i])) continue;
      visited.add(catUrls[i]);
      try {
        await page.goto(catUrls[i], { waitUntil:'networkidle2', timeout:15000 });
        if (!await waitOk(page)) continue;
        const products = await extractProducts(page);
        let added = 0;
        for (const p of products) { const k=p.name+'|'+p.ref; if(!P[k]){P[k]=p;added++;} }
        if (added > 0) log(`  CAT ${catUrls[i].replace(BASE,'').substring(0,50)} +${added} = ${Object.keys(P).length}`);
        // Pagination
        const maxPage = await getMaxPage(page);
        for (let pg=2; pg<=maxPage; pg++) {
          const sep = catUrls[i].includes('?') ? '&' : '?';
          await page.goto(catUrls[i]+sep+'page='+pg, { waitUntil:'networkidle2', timeout:15000 });
          const pp = await extractProducts(page);
          for (const p of pp) { const k=p.name+'|'+p.ref; if(!P[k]){P[k]=p;added++;} }
          await new Promise(r=>setTimeout(r,500));
        }
      } catch(e) {}
      if (i%20===0&&i>0) log(`--- ${i}/${catUrls.length}, ${Object.keys(P).length} produits ---`);
      await new Promise(r=>setTimeout(r,1000));
    }

    // Phase 2: Alphabetical search
    log(`\nRecherche alphabetique...`);
    const queries = [];
    const alpha='abcdefghijklmnopqrstuvwxyz';
    for (const c of alpha) queries.push(c);
    for (const c1 of alpha) for (const c2 of alpha) queries.push(c1+c2);
    ['composite','gant','fraise','ciment','endo','implant','silicone','seringue','turbine','autoclave','prothese','empreinte','desinfection','sterilisation','ceramique','resine'].forEach(w=>queries.push(w));

    for (let i=0;i<queries.length;i++) {
      try {
        await page.goto(BASE+SEARCH_PATH+encodeURIComponent(queries[i]), { waitUntil:'networkidle2', timeout:15000 });
        if (!await waitOk(page)) continue;
        const products = await extractProducts(page);
        let added=0;
        for (const p of products) { const k=p.name+'|'+p.ref; if(!P[k]){P[k]=p;added++;} }
        if (added>0) log(`  "${queries[i]}" +${added} = ${Object.keys(P).length}`);
      } catch(e) {}
      if (i%50===0&&i>0) log(`--- search ${i}/${queries.length}, ${Object.keys(P).length} ---`);
      await new Promise(r=>setTimeout(r,1000));
    }

    const products = Object.values(P);
    log(`\n=== TERMINE: ${products.length} produits ===\n`);
    fs.writeFileSync(BACKUP, JSON.stringify(products, null, 2));

    // Import
    let imported=0;
    for (let i=0;i<products.length;i+=500) {
      const chunk=products.slice(i,i+500);
      const bn=Math.floor(i/500)+1;
      const data=JSON.stringify({source:SOURCE,products:chunk.map(p=>({name:p.name,price:p.price,ref:p.ref||'',price_original:p.oldPrice||null})),page:SOURCE+'-'+bn});
      try {
        const r = await new Promise((res,rej)=>{
          const u=new URL(IMPORT_URL);
          const req=http.request({hostname:u.hostname,port:u.port,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},rr=>{let b='';rr.on('data',d=>b+=d);rr.on('end',()=>{try{res(JSON.parse(b));}catch(e){res({});}});});
          req.on('error',rej);req.write(data);req.end();
        });
        imported+=r.imported||0;
        log(`  Lot ${bn}: ${r.imported||0}`);
      } catch(e) {}
    }
    log(`Import: ${imported}/${products.length}`);
  } catch(e) { log(`ERREUR: ${e.message}`); } finally { await browser.close(); }
  log(`Termine en ${el()}`);
}
main();
