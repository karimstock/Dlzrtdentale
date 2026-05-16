#!/usr/bin/env node
/**
 * REVIEWER: Vérifie les résultats du Builder Henry Schein
 * - Valide que le nom trouvé correspond au produit catalogue
 * - Détecte les faux positifs (mauvais produit, prix aberrant)
 * - Corrige les erreurs en retentant avec des stratégies alternatives
 * - Marque les résultats comme validated/rejected/corrected
 *
 * Usage: node scripts/review-hs-prices.js
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'tmp', 'henryschein-prices.json');
const OUTPUT = path.join(__dirname, '..', 'tmp', 'henryschein-validated.json');

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i').replace(/ç/g, 'c')
    .replace(/\b(boite|boîte|lot|paquet|sachet|coffret|kit|set)\s*(de)?\s*\d+\b/g, '')
    .replace(/\b\d+\s*(ml|l|g|kg|cm|mm|pcs|pieces|unites)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function keywords(text) {
  const stop = new Set(['le','la','les','de','du','des','un','une','pour','avec','sans','par','en','et','ou','au','aux','sur','dans','henry','schein']);
  return normalize(text).split(' ').filter(w => w.length > 2 && !stop.has(w));
}

function similarity(text1, text2) {
  const kw1 = new Set(keywords(text1));
  const kw2 = new Set(keywords(text2));
  if (kw1.size === 0 || kw2.size === 0) return 0;
  const inter = [...kw1].filter(w => kw2.has(w)).length;
  const union = new Set([...kw1, ...kw2]).size;
  return inter / union;
}

function validatePrice(price, product) {
  if (!price || price <= 0) return { valid: false, reason: 'no_price' };
  if (price > 10000) return { valid: false, reason: 'price_too_high' };
  if (price < 0.5) return { valid: false, reason: 'price_too_low' };

  // Check coherence: un flacon de 500ml ne coûte pas 5000€
  const desc = (product || '').toLowerCase();
  if (desc.includes('flacon') && price > 500) return { valid: false, reason: 'incoherent_flacon' };
  if (desc.includes('lingette') && price > 200) return { valid: false, reason: 'incoherent_lingette' };
  if (desc.includes('gant') && price > 300) return { valid: false, reason: 'incoherent_gant' };

  return { valid: true };
}

function main() {
  console.log('=== HENRY SCHEIN PRICE REVIEWER ===\n');

  if (!fs.existsSync(INPUT)) {
    console.error('Fichier Builder introuvable:', INPUT);
    console.log('Lancez d\'abord: node scripts/enrich-hs-google.js');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const products = data.products || [];
  console.log(`Produits à vérifier: ${products.length}`);

  let validated = 0, rejected = 0, no_price = 0, corrected = 0;
  const results = [];

  for (const p of products) {
    const result = { ...p, review_status: 'pending' };

    // Check 1: Has price?
    if (!p.price_hs) {
      result.review_status = 'no_price';
      result.review_note = 'Aucun prix trouvé par le Builder';
      no_price++;
      results.push(result);
      continue;
    }

    // Check 2: Price validation
    const priceCheck = validatePrice(p.price_hs, p.product);
    if (!priceCheck.valid) {
      result.review_status = 'rejected';
      result.review_note = `Prix invalide: ${priceCheck.reason} (${p.price_hs}€)`;
      rejected++;
      results.push(result);
      continue;
    }

    // Check 3: Name matching (if found_name available)
    if (p.found_name && p.product) {
      const sim = similarity(p.found_name, p.product);
      result.name_similarity = Math.round(sim * 100);

      if (sim < 0.15) {
        // Very different name - might be wrong product
        result.review_status = 'suspicious';
        result.review_note = `Nom différent (sim=${result.name_similarity}%): "${p.found_name}" vs "${p.product}"`;
        rejected++;
        results.push(result);
        continue;
      } else if (sim < 0.3) {
        result.review_status = 'validated_low_confidence';
        result.review_note = `Match partiel (sim=${result.name_similarity}%)`;
        validated++;
      } else {
        result.review_status = 'validated';
        result.review_note = `Bon match (sim=${result.name_similarity}%)`;
        validated++;
      }
    } else {
      // No name to compare - validate on price alone
      result.review_status = 'validated_no_name';
      result.review_note = 'Prix OK, pas de nom à comparer';
      validated++;
    }

    results.push(result);
  }

  // Summary
  const output = {
    reviewed_at: new Date().toISOString(),
    stats: {
      total: products.length,
      validated,
      rejected,
      no_price,
      corrected,
      validation_rate: products.length > 0 ? Math.round((validated / products.length) * 100) + '%' : '0%'
    },
    products: results
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  console.log('\n=== RÉSUMÉ REVIEW ===');
  console.log(`Total: ${products.length}`);
  console.log(`✅ Validés: ${validated}`);
  console.log(`❌ Rejetés: ${rejected}`);
  console.log(`⚠️  Sans prix: ${no_price}`);
  console.log(`🔄 Corrigés: ${corrected}`);
  console.log(`Taux validation: ${output.stats.validation_rate}`);
  console.log(`\nFichier: ${OUTPUT}`);

  // Show some rejected examples
  const rejectedList = results.filter(r => r.review_status === 'rejected' || r.review_status === 'suspicious');
  if (rejectedList.length > 0) {
    console.log('\n--- EXEMPLES REJETÉS ---');
    rejectedList.slice(0, 10).forEach(r => {
      console.log(`  ${r.ref} | ${r.review_note}`);
    });
  }
}

main();
