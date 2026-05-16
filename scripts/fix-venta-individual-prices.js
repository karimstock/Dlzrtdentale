#!/usr/bin/env node
// =============================================
// JADOMI — Fix prix Venta par site individuel
//
// Problème: le scraper Venta utilise DoctorStrong comme source unique
// mais chaque site (DS, DAI, MD) a ses propres prix remisés.
//
// Ce script interroge l'API de CHAQUE site pour mettre à jour
// les vrais prix remisés individuels.
//
// Usage:
//   node scripts/fix-venta-individual-prices.js --test       # 10 produits test
//   node scripts/fix-venta-individual-prices.js              # Full (par batch)
//   nohup node scripts/fix-venta-individual-prices.js &      # Background
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const PROGRESS_FILE = '/tmp/venta-individual-prices-progress.json';
const LOG_FILE = '/tmp/venta-individual-prices.log';

const SITES = {
  doctorstrong: 'https://www.doctorstrong.fr',
  doctorai: 'https://www.doctor-ai.fr',
  megadental: 'https://www.megadental.fr',
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function searchAPI(baseUrl, query) {
  return new Promise(r => {
    https.get(baseUrl + '/search/ajax/suggest?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch { r(null); } });
    }).on('error', () => r(null));
  });
}

function supabaseGet(path) {
  return new Promise(r => {
    https.get(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch { r([]); } });
    }).on('error', () => r([]));
  });
}

function supabasePatch(id, updates) {
  return new Promise(r => {
    const payload = JSON.stringify(updates);
    const req = https.request({
      hostname: new URL(SUPABASE_URL).hostname,
      path: `/rest/v1/scraped_prices?id=eq.${id}`,
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => r(res.statusCode)); });
    req.on('error', () => r(500));
    req.end(payload);
  });
}

function findPrice(data, ref) {
  if (!data) return null;
  let found = null;
  function dig(obj) {
    if (!obj || found) return;
    if (Array.isArray(obj)) { obj.forEach(dig); return; }
    if (obj.name && obj.price) {
      // Vérifier si la ref correspond
      const codes = [...(obj.code_strong || []), ...(obj.code_drai || []), ...(obj.code_mega || []), ...(obj.sku || [])];
      if (codes.some(c => c && c.toString().includes(ref))) {
        const p0 = (obj.price || []).find(p => p.customer_group_id === 0) || (obj.price || [])[0] || {};
        found = {
          finalPrice: p0.final_price || null,
          originalPrice: p0.original_price || null,
          specialPrice: obj.special_price?.[0] || null,
          isDiscount: p0.is_discount || false,
        };
      }
    }
    if (typeof obj === 'object') Object.values(obj).forEach(dig);
  }
  dig(data);
  return found;
}

async function main() {
  const testMode = process.argv.includes('--test');
  const limit = testMode ? 10 : 200;

  log('=== FIX PRIX VENTA INDIVIDUELS ===');
  log(`Mode: ${testMode ? 'TEST (10)' : 'FULL'}`);

  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  const offset = progress.offset || 0;

  let totalFixed = 0;
  let totalChecked = 0;

  for (const [supplier, baseUrl] of Object.entries(SITES)) {
    log(`\n--- ${supplier} (${baseUrl}) ---`);

    // Charger les produits avec ref
    const products = await supabaseGet(
      `scraped_prices?supplier_name=eq.${supplier}&reference=not.is.null&select=id,reference,price,price_original,product_name&limit=${limit}&offset=${offset}&order=id`
    );

    if (!products || products.length === 0) { log('  Aucun produit'); continue; }
    log(`  ${products.length} produits à vérifier`);

    for (const p of products) {
      if (!p.reference || p.reference.length < 3) continue;

      // Chercher le prix sur le bon site
      const data = await searchAPI(baseUrl, p.reference);
      const priceInfo = findPrice(data, p.reference);
      totalChecked++;

      if (priceInfo && priceInfo.finalPrice) {
        const oldPrice = p.price;
        const newPrice = priceInfo.specialPrice || priceInfo.finalPrice;
        const catalogPrice = priceInfo.originalPrice;

        if (Math.abs(oldPrice - newPrice) > 0.01) {
          // Prix différent → mettre à jour
          const updates = { price: newPrice };
          if (catalogPrice && catalogPrice !== newPrice) updates.price_original = catalogPrice;

          if (!testMode) await supabasePatch(p.id, updates);
          totalFixed++;

          log(`  Réf ${p.reference}: ${oldPrice}€ → ${newPrice}€ ${catalogPrice ? '(catalogue: ' + catalogPrice + '€)' : ''} [${p.product_name?.substring(0, 30)}]`);
        }
      }

      // Délai pour pas surcharger l'API
      await new Promise(r => setTimeout(r, 500));
    }
  }

  progress.offset = offset + limit;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

  log(`\n=== BILAN ===`);
  log(`Vérifiés: ${totalChecked}`);
  log(`Prix corrigés: ${totalFixed}`);
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
