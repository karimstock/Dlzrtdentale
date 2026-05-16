#!/usr/bin/env node
// =============================================
// JADOMI — Audit prix Venta (DoctorStrong/DoctorAI/MegaDental)
//
// Compare les prix en base Supabase vs l'API DoctorStrong
// pour détecter les produits où le prix remisé n'a pas été capté.
//
// Usage: node scripts/fix-venta-prices.js
// =============================================

require('dotenv').config();

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// API DoctorStrong — même endpoint que le scraper
const API_BASE = 'https://www.doctorstrong.fr/search/ajax/suggest?q=';

function fetchJSON(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function extractPriceInfo(raw) {
  // Extraire TOUS les champs prix pour analyse
  const priceArray = raw.price || [];
  const group0 = priceArray.find(p => p.customer_group_id === 0) || {};
  const group1 = priceArray.find(p => p.customer_group_id === 1) || {};
  const allGroups = priceArray.map(p => ({
    customer_group_id: p.customer_group_id,
    price: p.price,
    final_price: p.final_price,
    original_price: p.original_price,
    is_discount: p.is_discount,
    discount_percent: p.discount_percent,
    min_price: p.min_price,
    max_price: p.max_price,
  }));

  return {
    name: Array.isArray(raw.name) ? raw.name[0] : raw.name || '',
    entity_id: raw.entity_id,
    sku: raw.sku || [],
    special_price: raw.special_price || [],
    price_groups: allGroups,
    group0_final: group0.final_price || null,
    group0_price: group0.price || null,
    group0_original: group0.original_price || null,
    group0_discount: group0.is_discount || false,
    group1_final: group1.final_price || null,
    group1_price: group1.price || null,
    code_strong: raw.code_strong || [],
    code_drai: raw.code_drai || [],
  };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  JADOMI — Audit Prix Venta (DoctorStrong)               ║');
  console.log('║  Compare prix base Supabase vs API suggest              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // 1. Récupérer un échantillon de produits DoctorStrong en base
  console.log('[1] Récupération d\'un échantillon de produits DoctorStrong en base...');

  const { data: sampleProducts, error } = await sb
    .from('scraped_prices')
    .select('id, product_name, reference, price, price_original, brand, supplier_name')
    .in('supplier_name', ['doctorstrong', 'DoctorStrong'])
    .not('reference', 'is', null)
    .not('reference', 'eq', '')
    .order('scraped_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Erreur Supabase:', error.message);
    process.exit(1);
  }

  console.log(`  -> ${sampleProducts.length} produits trouvés en base`);

  // Prendre 10 produits variés (certains avec remise, certains sans)
  const withDiscount = sampleProducts.filter(p => p.price !== p.price_original && p.price_original);
  const withoutDiscount = sampleProducts.filter(p => p.price === p.price_original || !p.price_original);

  const sample = [
    ...withDiscount.slice(0, 5),
    ...withoutDiscount.slice(0, 5),
  ].slice(0, 10);

  if (sample.length === 0) {
    console.log('Aucun produit avec référence trouvé. Tentative avec des refs manuelles...');
    // Fallback: utiliser des refs connues
    const fallbackRefs = ['895-5290', '895-5295', '770-6025', '770-6030', '560-6895'];
    for (const ref of fallbackRefs) {
      sample.push({ reference: ref, price: null, price_original: null, product_name: '(non en base)', brand: '' });
    }
  }

  console.log(`  -> Échantillon: ${sample.length} produits sélectionnés`);
  console.log(`     (${withDiscount.length >= 5 ? 5 : withDiscount.length} avec remise, ${Math.min(withoutDiscount.length, 5)} sans remise)\n`);

  // 2. Interroger l'API pour chaque référence
  console.log('[2] Interrogation de l\'API DoctorStrong pour chaque référence...\n');

  const results = [];

  for (const product of sample) {
    const ref = product.reference;
    console.log(`  Requête API: ${API_BASE}${ref}`);

    const apiResponse = await fetchJSON(API_BASE + encodeURIComponent(ref));
    await new Promise(r => setTimeout(r, 300)); // Respect rate limit

    if (!apiResponse || !Array.isArray(apiResponse)) {
      console.log(`    -> Pas de réponse valide`);
      results.push({
        ref,
        db_name: product.product_name,
        db_price: product.price,
        db_price_original: product.price_original,
        api_status: 'NO_RESPONSE',
      });
      continue;
    }

    // Chercher le produit correspondant
    const productResults = apiResponse.filter(r => r.type === 'product');
    let matched = null;

    for (const raw of productResults) {
      const codes = [...(raw.code_strong || []), ...(raw.code_drai || []), ...(raw.sku || [])];
      if (codes.some(c => c && c.toString().includes(ref))) {
        matched = raw;
        break;
      }
    }

    // Si pas de match exact, prendre le premier résultat produit
    if (!matched && productResults.length > 0) {
      matched = productResults[0];
    }

    if (!matched) {
      console.log(`    -> Aucun produit trouvé dans l'API`);
      results.push({
        ref,
        db_name: product.product_name,
        db_price: product.price,
        db_price_original: product.price_original,
        api_status: 'NOT_FOUND',
      });
      continue;
    }

    const info = extractPriceInfo(matched);

    // Déterminer le "vrai" prix remisé
    const apiCatalogue = info.group0_original || info.group0_price || null;
    const apiRemise = info.special_price[0] || info.group0_final || info.group0_price || null;
    const hasRealDiscount = apiCatalogue && apiRemise && apiCatalogue !== apiRemise;

    const result = {
      ref,
      db_name: (product.product_name || '').substring(0, 60),
      db_price: product.price,
      db_price_original: product.price_original,
      api_name: info.name.substring(0, 60),
      api_catalogue: apiCatalogue,
      api_remise: apiRemise,
      api_special_price: info.special_price[0] || null,
      api_group0_final: info.group0_final,
      api_group0_original: info.group0_original,
      api_group0_discount: info.group0_discount,
      api_has_discount: hasRealDiscount,
      price_groups_count: info.price_groups.length,
      all_groups: info.price_groups,
      ecart_db_vs_api: product.price && apiRemise ? ((product.price - apiRemise) / apiRemise * 100).toFixed(1) + '%' : 'N/A',
    };

    results.push(result);

    // Log résumé inline
    const discountTag = hasRealDiscount ? ' [REMISÉ]' : ' [CATALOGUE]';
    console.log(`    -> ${info.name.substring(0, 50)}${discountTag}`);
    console.log(`       DB: ${product.price}€ (original: ${product.price_original}€)`);
    console.log(`       API: catalogue=${apiCatalogue}€, remisé=${apiRemise}€, special_price=${info.special_price[0] || 'null'}`);
    if (info.price_groups.length > 1) {
      console.log(`       ${info.price_groups.length} groupes de prix dans l'API`);
    }
    console.log('');
  }

  // 3. Rapport final
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RAPPORT — Comparaison prix base vs API DoctorStrong');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Stats globales de la base
  const { count: totalDS } = await sb
    .from('scraped_prices')
    .select('id', { count: 'exact', head: true })
    .in('supplier_name', ['doctorstrong', 'DoctorStrong']);

  const { count: samePrice } = await sb
    .from('scraped_prices')
    .select('id', { count: 'exact', head: true })
    .in('supplier_name', ['doctorstrong', 'DoctorStrong'])
    .filter('price', 'eq', 'price_original');

  console.log(`  Total produits DoctorStrong en base : ${totalDS || '?'}`);

  // Compter ceux avec price = price_original via une requête différente
  const { data: priceStats } = await sb
    .from('scraped_prices')
    .select('price, price_original')
    .in('supplier_name', ['doctorstrong', 'DoctorStrong'])
    .limit(5000);

  if (priceStats) {
    const total = priceStats.length;
    const samePriceCount = priceStats.filter(p => p.price === p.price_original).length;
    const noPriceOriginal = priceStats.filter(p => !p.price_original).length;
    const withRealDiscount = priceStats.filter(p => p.price_original && p.price < p.price_original).length;

    console.log(`  Échantillon analysé (5000 max) : ${total}`);
    console.log(`  - price = price_original (pas de remise captée) : ${samePriceCount} (${(samePriceCount/total*100).toFixed(1)}%)`);
    console.log(`  - price_original NULL : ${noPriceOriginal}`);
    console.log(`  - price < price_original (remise captée) : ${withRealDiscount} (${(withRealDiscount/total*100).toFixed(1)}%)`);
  }

  console.log('\n  --- Détail par produit ---\n');

  const header = [
    'Réf'.padEnd(12),
    'Prix DB'.padStart(9),
    'Orig DB'.padStart(9),
    'Cat API'.padStart(9),
    'Rem API'.padStart(9),
    'Special'.padStart(9),
    'Écart'.padStart(8),
    'Status',
  ].join(' | ');

  console.log('  ' + header);
  console.log('  ' + '-'.repeat(header.length));

  for (const r of results) {
    if (r.api_status) {
      console.log(`  ${(r.ref || '').padEnd(12)} | ${String(r.db_price || '-').padStart(9)} | ${String(r.db_price_original || '-').padStart(9)} | ${r.api_status}`);
      continue;
    }

    const status = [];
    if (r.db_price === r.db_price_original && r.api_has_discount) {
      status.push('PRIX CATALOGUE EN BASE — REMISE DISPO');
    } else if (r.db_price === r.api_remise) {
      status.push('OK');
    } else if (r.db_price && r.api_remise && Math.abs(r.db_price - r.api_remise) > 0.01) {
      status.push(`ÉCART ${r.ecart_db_vs_api}`);
    } else {
      status.push('~OK');
    }

    console.log(`  ${(r.ref || '').padEnd(12)} | ${String(r.db_price || '-').padStart(9)} | ${String(r.db_price_original || '-').padStart(9)} | ${String(r.api_catalogue || '-').padStart(9)} | ${String(r.api_remise || '-').padStart(9)} | ${String(r.api_special_price || '-').padStart(9)} | ${String(r.ecart_db_vs_api).padStart(8)} | ${status.join(', ')}`);
  }

  // 4. Analyse du raw price array d'un produit pour comprendre la structure
  console.log('\n  --- Structure brute price[] du premier produit API ---\n');

  const firstWithGroups = results.find(r => r.all_groups && r.all_groups.length > 0);
  if (firstWithGroups) {
    console.log(`  Produit: ${firstWithGroups.api_name || firstWithGroups.ref}`);
    console.log(`  Nombre de customer_group_id: ${firstWithGroups.all_groups.length}`);
    for (const g of firstWithGroups.all_groups) {
      console.log(`    group_id=${g.customer_group_id}: price=${g.price}, final_price=${g.final_price}, original_price=${g.original_price}, is_discount=${g.is_discount}, discount_percent=${g.discount_percent}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CONCLUSION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Le scraper actuel (scrape-venta-api.js) utilise :');
  console.log('    price = specialPrice || finalPrice (group0)');
  console.log('    price_original = originalPrice || price');
  console.log('');
  console.log('  Problème potentiel : l\'API suggest ne retourne pas toujours');
  console.log('  le special_price ou is_discount pour tous les produits.');
  console.log('  Le prix catalogue est alors stocké comme prix final.');
  console.log('');
  console.log('  Pour corriger en masse, il faudrait :');
  console.log('  1. Re-scraper les produits via la page produit (pas suggest)');
  console.log('  2. Ou utiliser l\'API Magento REST si disponible');
  console.log('  3. Ou parser le JSON-LD des fiches produit individuelles');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
