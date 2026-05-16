#!/usr/bin/env node
/**
 * JADOMI — Matching produits cross-fournisseur
 * Compare les produits entre fournisseurs pour trouver les equivalences
 * Matching par : reference, code barre (GTIN), nom normalise
 *
 * Usage: node scripts/match-products-cross-supplier.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Normaliser un nom de produit pour le matching
function normalizeProductName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i').replace(/ç/g, 'c')
    .replace(/\b(le|la|les|de|du|des|un|une|et|ou|en|au|aux|par|pour|sur|avec|dans|x\d+|lot|boite|bte|pcs?|pieces?|sachet|flacon|tube|coffret)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extraire la reference nettoyee
function normalizeRef(ref) {
  if (!ref) return '';
  return ref.replace(/[\s.-]/g, '').toUpperCase();
}

// Score de similarite Jaccard entre 2 strings
function jaccard(a, b) {
  if (!a || !b) return 0;
  const setA = new Set(a.split(' ').filter(w => w.length > 2));
  const setB = new Set(b.split(' ').filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

async function main() {
  console.log('=== MATCHING CROSS-FOURNISSEUR ===\n');

  // Charger tous les produits par lots
  let allProducts = [];
  let offset = 0;
  const PAGE = 10000;

  console.log('Chargement des produits...');
  while (true) {
    const { data, error } = await db
      .from('scraped_prices')
      .select('id, supplier_name, product_name, brand, reference, price')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Erreur:', error.message); break; }
    if (!data || data.length === 0) break;
    allProducts = allProducts.concat(data);
    offset += PAGE;
    if (offset % 50000 === 0) console.log('  ...', allProducts.length, 'charges');
  }
  console.log('Total charge:', allProducts.length.toLocaleString(), 'produits\n');

  // Grouper par fournisseur
  const bySupplier = {};
  allProducts.forEach(p => {
    if (!bySupplier[p.supplier_name]) bySupplier[p.supplier_name] = [];
    bySupplier[p.supplier_name].push(p);
  });

  const suppliers = Object.keys(bySupplier);
  console.log('Fournisseurs:', suppliers.length);
  suppliers.forEach(s => console.log('  ' + s + ': ' + bySupplier[s].length));
  console.log('');

  // Index par reference normalisee
  const refIndex = {};
  allProducts.forEach(p => {
    const ref = normalizeRef(p.reference);
    if (ref && ref.length >= 4) {
      if (!refIndex[ref]) refIndex[ref] = [];
      refIndex[ref].push(p);
    }
  });

  // Index par nom normalise
  const nameIndex = {};
  allProducts.forEach(p => {
    const name = normalizeProductName(p.product_name);
    if (name && name.length >= 5) {
      if (!nameIndex[name]) nameIndex[name] = [];
      nameIndex[name].push(p);
    }
  });

  let matchedByRef = 0;
  let matchedByName = 0;
  let totalMatches = 0;
  const matchedPairs = new Set();

  // PASS 1 : Matching par reference (exact match cross-supplier)
  console.log('Pass 1 : Matching par reference...');
  for (const [ref, products] of Object.entries(refIndex)) {
    if (products.length < 2) continue;

    // Verifier que c'est cross-supplier
    const supplierSet = new Set(products.map(p => p.supplier_name));
    if (supplierSet.size < 2) continue;

    // Trouver le moins cher
    const withPrice = products.filter(p => p.price && p.price > 0);
    if (withPrice.length < 2) continue;

    withPrice.sort((a, b) => a.price - b.price);
    const cheapest = withPrice[0];

    // Marquer le match sur tous les produits du groupe
    for (const p of withPrice) {
      const pairKey = [p.id, cheapest.id].sort().join('_');
      if (matchedPairs.has(pairKey)) continue;
      matchedPairs.add(pairKey);

      if (p.id !== cheapest.id) {
        await db.from('scraped_prices')
          .update({
            matched_gtin: ref,
            matched_product_id: cheapest.id
          })
          .eq('id', p.id);
        matchedByRef++;
        totalMatches++;
      }
    }
  }
  console.log('  Matches par reference:', matchedByRef);

  // PASS 2 : Matching par nom (fuzzy cross-supplier)
  console.log('Pass 2 : Matching par nom...');
  for (const [name, products] of Object.entries(nameIndex)) {
    if (products.length < 2) continue;

    const supplierSet = new Set(products.map(p => p.supplier_name));
    if (supplierSet.size < 2) continue;

    const withPrice = products.filter(p => p.price && p.price > 0);
    if (withPrice.length < 2) continue;

    withPrice.sort((a, b) => a.price - b.price);
    const cheapest = withPrice[0];

    for (const p of withPrice) {
      const pairKey = [p.id, cheapest.id].sort().join('_');
      if (matchedPairs.has(pairKey)) continue;
      matchedPairs.add(pairKey);

      if (p.id !== cheapest.id) {
        await db.from('scraped_prices')
          .update({
            matched_gtin: 'NAME:' + name.substring(0, 50),
            matched_product_id: cheapest.id
          })
          .eq('id', p.id);
        matchedByName++;
        totalMatches++;
      }
    }

    if (totalMatches % 1000 === 0 && totalMatches > 0) {
      console.log('  ...', totalMatches, 'matches');
    }
  }
  console.log('  Matches par nom:', matchedByName);

  // PASS 3 : Matching fuzzy par marque + mots-cles (Jaccard > 0.6)
  console.log('Pass 3 : Matching fuzzy (Jaccard > 0.6)...');
  let fuzzyMatches = 0;

  // Pour chaque paire de fournisseurs
  for (let i = 0; i < suppliers.length; i++) {
    for (let j = i + 1; j < suppliers.length; j++) {
      const s1 = suppliers[i];
      const s2 = suppliers[j];
      const prods1 = bySupplier[s1].filter(p => p.brand && p.price > 0).slice(0, 5000);
      const prods2 = bySupplier[s2].filter(p => p.brand && p.price > 0).slice(0, 5000);

      for (const p1 of prods1) {
        const name1 = normalizeProductName(p1.product_name);
        if (name1.length < 8) continue;

        for (const p2 of prods2) {
          // Meme marque obligatoire pour le fuzzy
          if (p1.brand && p2.brand &&
              p1.brand.toLowerCase() !== p2.brand.toLowerCase()) continue;

          const name2 = normalizeProductName(p2.product_name);
          if (name2.length < 8) continue;

          const score = jaccard(name1, name2);
          if (score >= 0.6) {
            const pairKey = [p1.id, p2.id].sort().join('_');
            if (matchedPairs.has(pairKey)) continue;
            matchedPairs.add(pairKey);

            const cheapest = p1.price <= p2.price ? p1 : p2;
            const other = p1.price <= p2.price ? p2 : p1;

            await db.from('scraped_prices')
              .update({
                matched_gtin: 'FUZZY:' + score.toFixed(2),
                matched_product_id: cheapest.id
              })
              .eq('id', other.id);
            fuzzyMatches++;
            totalMatches++;
          }
        }
      }

      if (prods1.length > 0 && prods2.length > 0) {
        console.log('  ' + s1 + ' x ' + s2 + ': ' + fuzzyMatches + ' fuzzy');
      }
    }
  }

  console.log('\n=== RESULTAT ===');
  console.log('Matches par reference:', matchedByRef);
  console.log('Matches par nom exact:', matchedByName);
  console.log('Matches fuzzy (Jaccard):', fuzzyMatches);
  console.log('TOTAL MATCHES:', totalMatches);

  // Stats finales
  const { count: totalMatched } = await db.from('scraped_prices')
    .select('*', { count: 'exact', head: true })
    .not('matched_product_id', 'is', null);
  const { count: total } = await db.from('scraped_prices')
    .select('*', { count: 'exact', head: true });

  console.log('\nEn base: ' + (totalMatched || 0).toLocaleString() + ' / ' + (total || 0).toLocaleString() + ' matches (' + Math.round((totalMatched || 0) / (total || 1) * 100) + '%)');
  console.log('Done');
}

main().catch(e => console.error('Fatal:', e.message));
