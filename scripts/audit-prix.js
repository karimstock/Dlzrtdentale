#!/usr/bin/env node
// =============================================
// JADOMI — Audit fiabilité prix 170K produits
// Vérifie les incohérences SANS rien modifier
// Envoie un rapport par email
// =============================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function audit() {
  console.log('=== AUDIT PRIX JADOMI ===');
  console.log('Date:', new Date().toLocaleString('fr-FR'));
  console.log('Mode: LECTURE SEULE — aucune modification\n');

  const report = { suppliers: [], issues: [], stats: {} };

  // 1. Compter par fournisseur
  console.log('1. Comptage par fournisseur...');
  const { data: allProducts } = await sb.from('scraped_prices')
    .select('supplier_name, price, price_original, product_name, brand, reference')
    .not('price', 'is', null);

  const bySupplier = {};
  for (const p of allProducts) {
    const s = p.supplier_name || 'unknown';
    if (!bySupplier[s]) bySupplier[s] = { name: s, total: 0, withPrice: 0, withRef: 0, withBrand: 0, withOriginal: 0, prices: [], issues: [] };
    bySupplier[s].total++;
    if (p.price > 0) { bySupplier[s].withPrice++; bySupplier[s].prices.push(p.price); }
    if (p.reference) bySupplier[s].withRef++;
    if (p.brand) bySupplier[s].withBrand++;
    if (p.price_original) bySupplier[s].withOriginal++;
  }

  report.stats.totalProducts = allProducts.length;
  console.log('Total produits en base:', allProducts.length);

  // 2. Analyse par fournisseur
  console.log('\n2. Analyse par fournisseur...');
  for (const [name, data] of Object.entries(bySupplier).sort((a, b) => b[1].total - a[1].total)) {
    const prices = data.prices.sort((a, b) => a - b);
    const min = prices[0] || 0;
    const max = prices[prices.length - 1] || 0;
    const median = prices[Math.floor(prices.length / 2)] || 0;
    const mean = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

    // Détecter les prix suspects
    const suspectLow = prices.filter(p => p < 0.5).length;
    const suspectHigh = prices.filter(p => p > 50000).length;
    const allSamePrice = prices.length > 10 && new Set(prices.map(p => p.toFixed(2))).size < 3;
    const suspectUniform = allSamePrice ? prices.length : 0;

    // Détecter les doublons
    const nameSet = new Set();
    let duplicates = 0;
    for (const p of allProducts.filter(x => x.supplier_name === name)) {
      const key = (p.product_name || '').substring(0, 50).toLowerCase();
      if (nameSet.has(key)) duplicates++;
      else nameSet.add(key);
    }

    // Détecter prix barré < prix final (incohérent)
    let invertedPrices = 0;
    for (const p of allProducts.filter(x => x.supplier_name === name)) {
      if (p.price_original && p.price && p.price_original < p.price) invertedPrices++;
    }

    const supplierReport = {
      name,
      total: data.total,
      withPrice: data.withPrice,
      withRef: data.withRef,
      withBrand: data.withBrand,
      withOriginal: data.withOriginal,
      priceMin: min.toFixed(2),
      priceMax: max.toFixed(2),
      priceMedian: median.toFixed(2),
      priceMean: mean.toFixed(2),
      suspectLow,
      suspectHigh,
      suspectUniform,
      duplicates,
      invertedPrices,
      fiabilite: 'OK',
    };

    // Score de fiabilité
    const issues = [];
    if (suspectUniform > 0) { issues.push('TOUS LE MEME PRIX (' + min + '€) — données FAUSSES'); supplierReport.fiabilite = 'FAUX'; }
    if (suspectLow > data.total * 0.1) { issues.push(suspectLow + ' prix < 0.50€ (' + Math.round(suspectLow / data.total * 100) + '%)'); supplierReport.fiabilite = 'SUSPECT'; }
    if (suspectHigh > 0) { issues.push(suspectHigh + ' prix > 50 000€'); supplierReport.fiabilite = 'SUSPECT'; }
    if (invertedPrices > data.total * 0.05) { issues.push(invertedPrices + ' prix barré < prix final'); supplierReport.fiabilite = 'SUSPECT'; }
    if (duplicates > data.total * 0.2) { issues.push(duplicates + ' doublons (' + Math.round(duplicates / data.total * 100) + '%)'); }
    if (data.withRef < data.total * 0.1) { issues.push('Seulement ' + data.withRef + ' refs (' + Math.round(data.withRef / data.total * 100) + '%)'); }

    supplierReport.issues = issues;
    report.suppliers.push(supplierReport);

    const status = supplierReport.fiabilite === 'OK' ? '✓' : supplierReport.fiabilite === 'SUSPECT' ? '⚠' : '✗';
    console.log(status + ' ' + name.padEnd(20) + ': ' + data.total + ' produits, prix ' + min.toFixed(2) + '-' + max.toFixed(2) + '€, median ' + median.toFixed(2) + '€');
    if (issues.length) issues.forEach(i => console.log('    → ' + i));
  }

  // 3. Analyse croisée : produits identiques chez plusieurs fournisseurs
  console.log('\n3. Analyse croisée (produits identiques multi-fournisseurs)...');
  const crossCheck = {};
  for (const p of allProducts) {
    if (!p.reference || p.reference.length < 3) continue;
    const ref = p.reference.toLowerCase().trim();
    if (!crossCheck[ref]) crossCheck[ref] = [];
    crossCheck[ref].push({ supplier: p.supplier_name, price: p.price, name: p.product_name });
  }

  let crossMatches = 0;
  let priceCoherent = 0;
  let priceIncoherent = 0;
  const worstIncoherences = [];

  for (const [ref, entries] of Object.entries(crossCheck)) {
    if (entries.length < 2) continue;
    crossMatches++;
    const prices = entries.map(e => e.price).filter(p => p > 0);
    if (prices.length < 2) continue;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const ratio = max / min;
    if (ratio <= 2.5) {
      priceCoherent++;
    } else {
      priceIncoherent++;
      if (worstIncoherences.length < 20) {
        worstIncoherences.push({ ref, ratio: ratio.toFixed(1), entries: entries.map(e => e.supplier + ': ' + e.price + '€').join(' vs '), name: entries[0].name });
      }
    }
  }

  console.log('Produits avec même ref chez 2+ fournisseurs:', crossMatches);
  console.log('Prix cohérents (ratio < 2.5x):', priceCoherent);
  console.log('Prix incohérents (ratio > 2.5x):', priceIncoherent);
  if (crossMatches > 0) {
    console.log('Taux fiabilité croisée:', Math.round(priceCoherent / crossMatches * 100) + '%');
  }

  report.cross = { matches: crossMatches, coherent: priceCoherent, incoherent: priceIncoherent, worst: worstIncoherences };

  // 4. Générer le rapport HTML
  console.log('\n4. Génération du rapport email...');

  const supplierRows = report.suppliers.map(s => {
    const color = s.fiabilite === 'OK' ? '#22c55e' : s.fiabilite === 'SUSPECT' ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #222;">${s.name}</td>
      <td style="padding:8px;border-bottom:1px solid #222;text-align:right">${s.total}</td>
      <td style="padding:8px;border-bottom:1px solid #222;text-align:right">${s.priceMin}€ — ${s.priceMax}€</td>
      <td style="padding:8px;border-bottom:1px solid #222;text-align:right">${s.priceMedian}€</td>
      <td style="padding:8px;border-bottom:1px solid #222;text-align:right">${s.withRef}</td>
      <td style="padding:8px;border-bottom:1px solid #222;text-align:right">${s.duplicates}</td>
      <td style="padding:8px;border-bottom:1px solid #222;text-align:center;color:${color};font-weight:bold">${s.fiabilite}</td>
      <td style="padding:8px;border-bottom:1px solid #222;font-size:11px;color:#999">${s.issues.join('<br>')}</td>
    </tr>`;
  }).join('');

  const worstRows = worstIncoherences.slice(0, 15).map(w => {
    return `<tr>
      <td style="padding:6px;border-bottom:1px solid #222;font-size:12px">${w.ref}</td>
      <td style="padding:6px;border-bottom:1px solid #222;font-size:12px">${(w.name || '').substring(0, 50)}</td>
      <td style="padding:6px;border-bottom:1px solid #222;font-size:12px;color:#ef4444;font-weight:bold">${w.ratio}x</td>
      <td style="padding:6px;border-bottom:1px solid #222;font-size:11px">${w.entries}</td>
    </tr>`;
  }).join('');

  const fiableCount = report.suppliers.filter(s => s.fiabilite === 'OK').reduce((a, s) => a + s.total, 0);
  const suspectCount = report.suppliers.filter(s => s.fiabilite === 'SUSPECT').reduce((a, s) => a + s.total, 0);
  const fauxCount = report.suppliers.filter(s => s.fiabilite === 'FAUX').reduce((a, s) => a + s.total, 0);

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:900px;margin:0 auto;background:#0a0a0f;color:#e5e5e5;padding:32px;border-radius:16px;">
      <h1 style="color:#0d9488;font-size:24px;margin-bottom:4px;">JADOMI — Audit Prix</h1>
      <p style="color:#737373;margin-bottom:24px;">${new Date().toLocaleDateString('fr-FR')} — Mode lecture seule, aucune modification</p>

      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:120px;text-align:center;">
          <div style="color:#fff;font-size:28px;font-weight:bold;">${report.stats.totalProducts.toLocaleString()}</div>
          <div style="color:#737373;font-size:12px;">Total produits</div>
        </div>
        <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:120px;text-align:center;">
          <div style="color:#22c55e;font-size:28px;font-weight:bold;">${fiableCount.toLocaleString()}</div>
          <div style="color:#737373;font-size:12px;">Fiables</div>
        </div>
        <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:120px;text-align:center;">
          <div style="color:#f59e0b;font-size:28px;font-weight:bold;">${suspectCount.toLocaleString()}</div>
          <div style="color:#737373;font-size:12px;">Suspects</div>
        </div>
        <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:120px;text-align:center;">
          <div style="color:#ef4444;font-size:28px;font-weight:bold;">${fauxCount.toLocaleString()}</div>
          <div style="color:#737373;font-size:12px;">Faux</div>
        </div>
      </div>

      <div style="background:#16161f;border-radius:12px;padding:20px;margin-bottom:20px;">
        <h3 style="color:#fff;margin-top:0;margin-bottom:12px;">Par fournisseur</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="color:#737373;">
            <th style="text-align:left;padding:8px;">Fournisseur</th>
            <th style="text-align:right;padding:8px;">Produits</th>
            <th style="text-align:right;padding:8px;">Prix min-max</th>
            <th style="text-align:right;padding:8px;">Médian</th>
            <th style="text-align:right;padding:8px;">Refs</th>
            <th style="text-align:right;padding:8px;">Doublons</th>
            <th style="text-align:center;padding:8px;">Fiabilité</th>
            <th style="text-align:left;padding:8px;">Problèmes</th>
          </tr>
          ${supplierRows}
        </table>
      </div>

      ${crossMatches > 0 ? `
      <div style="background:#16161f;border-radius:12px;padding:20px;margin-bottom:20px;">
        <h3 style="color:#fff;margin-top:0;margin-bottom:8px;">Vérification croisée (même ref chez 2+ fournisseurs)</h3>
        <p style="color:#737373;font-size:13px;margin-bottom:12px;">
          ${crossMatches} produits comparés —
          <span style="color:#22c55e">${priceCoherent} cohérents</span> /
          <span style="color:#ef4444">${priceIncoherent} incohérents</span>
          — Taux: <strong style="color:#fff">${Math.round(priceCoherent / crossMatches * 100)}%</strong>
        </p>
        ${worstRows ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="color:#737373;"><th style="text-align:left;padding:6px;">Ref</th><th style="text-align:left;padding:6px;">Produit</th><th style="padding:6px;">Ratio</th><th style="text-align:left;padding:6px;">Prix</th></tr>
          ${worstRows}
        </table>` : ''}
      </div>` : ''}

      <p style="color:#525252;font-size:11px;margin-top:24px;">JADOMI Audit Prix — rapport automatique — aucune donnée modifiée</p>
    </div>
  `;

  // 5. Envoyer par email
  console.log('\n5. Envoi du rapport par email...');
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: '"JADOMI Audit" <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject: `JADOMI Audit Prix — ${report.stats.totalProducts.toLocaleString()} produits — ${fiableCount.toLocaleString()} fiables / ${fauxCount.toLocaleString()} faux`,
      html,
    });

    console.log('Email envoyé à karim_bahmed@yahoo.fr');
  } catch (e) {
    console.error('Erreur email:', e.message);
  }

  console.log('\n=== AUDIT TERMINE ===');
}

audit().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
