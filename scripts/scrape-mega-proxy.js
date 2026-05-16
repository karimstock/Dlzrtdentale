// JADOMI — Scraper Mega Dental via ScraperAPI (cote serveur)
// Usage: SCRAPER_API_KEY=votre_cle node scripts/scrape-mega-proxy.js
// Inscrivez-vous sur https://www.scraperapi.com (5000 requetes gratuites pour tester)

const https = require('https');
const http = require('http');
const fs = require('fs');

const API_KEY = process.env.SCRAPER_API_KEY;
if (!API_KEY) {
  console.log('Usage: SCRAPER_API_KEY=votre_cle node scripts/scrape-mega-proxy.js');
  console.log('Inscrivez-vous sur https://www.scraperapi.com (5000 requetes gratuites)');
  process.exit(1);
}

const SAVE_FILE = '/tmp/jadomi-mega-products.json';
const DELAY_BETWEEN = 2000; // 2s entre requetes (ScraperAPI gere la rotation)

let P = {};
let qi = 0;
let totalPages = 0;

// Restore
if (fs.existsSync(SAVE_FILE)) {
  try {
    const s = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    P = s.P || {};
    qi = s.qi || 0;
    console.log(`[REPRISE] query #${qi}, ${Object.keys(P).length} produits en cache`);
  } catch (e) {}
}

function save() {
  fs.writeFileSync(SAVE_FILE, JSON.stringify({ P, qi }));
}

function scraperUrl(targetUrl) {
  return `http://api.scraperapi.com?api_key=${API_KEY}&url=${encodeURIComponent(targetUrl)}&country_code=fr`;
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    http.get(scraperUrl(url), { timeout: 60000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', (e) => reject(e));
  });
}

// Parse HTML avec regex (pas de DOM cote serveur)
function parseProducts(html) {
  let added = 0;
  // Chercher les blocs product-item
  const blocks = html.split(/product-item\b/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].substring(0, 3000);
    // Nom
    const nameMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
    if (name.length < 3) continue;
    // Prix
    const priceMatch = block.match(/data-price-type="finalPrice"[\s\S]*?(\d[\d\s]*[.,]\d{2})/);
    const priceAlt = block.match(/class="price"[^>]*>[^<]*?(\d[\d\s]*[.,]\d{2})/);
    const pm = priceMatch || priceAlt;
    if (!pm) continue;
    const price = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (isNaN(price)) continue;
    // Old price
    let oldPrice = null;
    const oldMatch = block.match(/data-price-type="oldPrice"[\s\S]*?(\d[\d\s]*[.,]\d{2})/);
    if (oldMatch) oldPrice = parseFloat(oldMatch[1].replace(/\s/g, '').replace(',', '.'));
    // SKU
    const skuMatch = block.match(/data-sku="([^"]+)"/);
    const sku = skuMatch ? skuMatch[1] : '';
    // Discount
    let discount = null;
    const discMatch = block.match(/class="discount"[^>]*>[^<]*?(-?\d+)/);
    if (discMatch) discount = Math.abs(parseInt(discMatch[1]));

    const key = name + '|' + sku;
    if (!P[key]) {
      P[key] = { name, price, ref: sku, oldPrice, discount };
      added++;
    }
  }
  return added;
}

function getMaxPage(html) {
  let max = 1;
  const matches = html.match(/[?&]p=(\d+)/g) || [];
  matches.forEach(m => {
    const n = parseInt(m.replace(/[^0-9]/g, ''));
    if (n > max) max = n;
  });
  return max;
}

// Generer requetes
const queries = [];
const alpha = 'abcdefghijklmnopqrstuvwxyz';
for (let i = 0; i < alpha.length; i++) queries.push(alpha[i]);
for (let i = 0; i < alpha.length; i++)
  for (let j = 0; j < alpha.length; j++) queries.push(alpha[i] + alpha[j]);
['composite','gant','fraise','ciment','endo','paro','ortho','implant','silicone',
 'alginate','adhesif','seringue','turbine','contre-angle','detartreur','autoclave',
 'radiographie','blanchiment','prothese','empreinte','polissage','matrice',
 'obturation','chirurgie','prophylaxie','desinfection','sterilisation','membrane',
 'greffon','laser','scanner','ceramique','zircone','resine','amalgame','digue',
 'lime','insert','scellement'].forEach(w => queries.push(w));

console.log(`=== MEGA DENTAL via ScraperAPI === ${queries.length} requetes, reprise #${qi}`);

async function searchQuery(q) {
  const baseUrl = `https://www.megadental.fr/catalogsearch/result/?q=${encodeURIComponent(q)}`;
  try {
    const { status, body } = await fetchPage(baseUrl);
    if (status !== 200) {
      console.log(`  "${q}" -> HTTP ${status}`);
      return;
    }
    const added = parseProducts(body);
    const maxPage = getMaxPage(body);
    totalPages++;
    if (added > 0) console.log(`  "${q}" p1/${maxPage} +${added} = ${Object.keys(P).length}`);

    for (let p = 2; p <= maxPage; p++) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN));
      try {
        const pg = await fetchPage(baseUrl + '&p=' + p);
        if (pg.status === 200) {
          const pa = parseProducts(pg.body);
          totalPages++;
          if (pa > 0) console.log(`  "${q}" p${p}/${maxPage} +${pa} = ${Object.keys(P).length}`);
        }
      } catch (e) {
        console.log(`  "${q}" p${p} erreur: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  "${q}" erreur: ${e.message}`);
  }
}

async function run() {
  for (; qi < queries.length; qi++) {
    if (qi % 26 === 0) {
      save();
      console.log(`--- ${qi}/${queries.length}, ${Object.keys(P).length} produits [sauvegarde] ---`);
    }
    await searchQuery(queries[qi]);
    await new Promise(r => setTimeout(r, DELAY_BETWEEN));
  }

  save();
  console.log('========================================');
  console.log(`TERMINE: ${Object.keys(P).length} produits uniques`);
  console.log(`${totalPages} pages scrapees`);
  console.log('========================================');

  // Envoyer a jadomi.fr
  const products = Object.values(P).map(p => ({
    name: p.name, price: p.price, ref: p.ref || '',
    price_original: p.oldPrice || null, discount: p.discount || null
  }));

  const postData = JSON.stringify({ source: 'megadental', products });
  const req = https.request({
    hostname: 'jadomi.fr',
    path: '/api/import-products',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => console.log('Import:', res.statusCode, d.substring(0, 200)));
  });
  req.write(postData);
  req.end();
}

run().catch(e => { console.error(e); save(); });
