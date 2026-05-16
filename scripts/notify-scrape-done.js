#!/usr/bin/env node
// JADOMI — Verifie si tous les scrapers sont finis et envoie un rapport par email
const fs = require('fs');
const path = require('path');

// Charger l'env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sendMail } = require('../api/emailService');

const LOGS = [
  { name: 'GACD', file: '/tmp/gacd-rerun.log' },
  { name: 'Mega Dental', file: '/tmp/mega-sitemap-rerun.log' },
  { name: 'Doctor AI', file: '/tmp/doctorai-sitemap.log' },
  { name: 'Dentaltix', file: '/tmp/dentaltix-sitemap.log' },
  { name: 'Doctor Strong', file: '/tmp/doctorstrong-vps.log' },
  { name: 'DentalClick', file: '/tmp/dentalclick-vps.log' },
  { name: 'Henry Schein', file: '/tmp/henryschein-vps.log' },
  { name: 'Promodentaire', file: '/tmp/promodentaire-vps.log' },
  { name: 'DentalGoodDeal', file: '/tmp/dentalgooddeal-vps.log' },
  { name: 'DPI Dental', file: '/tmp/dpidental-vps.log' },
  { name: 'Dental Express', file: '/tmp/dentalexpress-vps.log' },
];

function checkLog(logFile) {
  if (!fs.existsSync(logFile)) return { done: false, products: 0, status: 'Fichier absent' };
  const content = fs.readFileSync(logFile, 'utf8');
  const done = content.includes('Termine') || content.includes('TERMINE') || content.includes('Import:') || content.includes('IMPORT TERMINE');

  // Extraire le nombre de produits
  let products = 0;
  const m = content.match(/TERMINE:\s*(\d+)/) || content.match(/(\d+)\s*produits?\s*(unique|en\s|import)/i) || content.match(/total=(\d+)/g);
  if (m) {
    if (Array.isArray(m) && m[0].includes('total=')) {
      // Get last total=N
      const last = m[m.length-1];
      products = parseInt(last.replace('total=',''));
    } else {
      products = parseInt(m[1]);
    }
  }
  // Also try =N pattern from alphabetical scrapers
  if (products === 0) {
    const eqMatches = content.match(/=(\d+)/g);
    if (eqMatches && eqMatches.length > 0) {
      const lastEq = eqMatches[eqMatches.length - 1];
      const n = parseInt(lastEq.replace('=',''));
      if (n > products) products = n;
    }
  }

  // Extraire import
  let imported = 0;
  const im = content.match(/Import.*?:\s*(\d+)/);
  if (im) imported = parseInt(im[1]);

  // Derniere ligne utile
  const lines = content.trim().split('\n').filter(l => l.startsWith('[JADOMI'));
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

  return { done, products, imported, lastLine, status: done ? 'TERMINE' : 'EN COURS' };
}

async function main() {
  const results = LOGS.map(l => ({ ...l, ...checkLog(l.file) }));
  const allDone = results.every(r => r.done);

  const fullResults = results;

  const totalProducts = fullResults.reduce((s, r) => s + (r.products || 0), 0);
  const totalImported = fullResults.reduce((s, r) => s + (r.imported || 0), 0);

  const statusEmoji = allDone ? '✅' : '⏳';
  const subject = `${statusEmoji} JADOMI Comparateur — ${allDone ? 'TERMINE' : 'Rapport'} — ${totalProducts} produits`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a2e; border-bottom: 3px solid #0066ff; padding-bottom: 10px;">
    JADOMI — Rapport Comparateur Prix
  </h2>
  <p style="color: #666;">Date : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <thead>
      <tr style="background: #1a1a2e; color: white;">
        <th style="padding: 10px; text-align: left;">Fournisseur</th>
        <th style="padding: 10px; text-align: center;">Status</th>
        <th style="padding: 10px; text-align: right;">Produits</th>
        <th style="padding: 10px; text-align: right;">Importés</th>
      </tr>
    </thead>
    <tbody>
      ${fullResults.map((r, i) => `
      <tr style="background: ${i % 2 === 0 ? '#f8f9fa' : 'white'};">
        <td style="padding: 8px; font-weight: 600;">${r.name}</td>
        <td style="padding: 8px; text-align: center;">
          <span style="padding: 2px 8px; border-radius: 12px; font-size: 12px; background: ${r.status === 'IMPORTE' || r.status === 'TERMINE' ? '#d4edda' : '#fff3cd'}; color: ${r.status === 'IMPORTE' || r.status === 'TERMINE' ? '#155724' : '#856404'};">
            ${r.status}
          </span>
        </td>
        <td style="padding: 8px; text-align: right; font-weight: 600;">${(r.products || 0).toLocaleString('fr-FR')}</td>
        <td style="padding: 8px; text-align: right;">${(r.imported || 0).toLocaleString('fr-FR')}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr style="background: #1a1a2e; color: white; font-weight: 700;">
        <td style="padding: 10px;">TOTAL</td>
        <td style="padding: 10px; text-align: center;">${allDone ? 'COMPLET' : 'EN COURS'}</td>
        <td style="padding: 10px; text-align: right;">${totalProducts.toLocaleString('fr-FR')}</td>
        <td style="padding: 10px; text-align: right;">${totalImported.toLocaleString('fr-FR')}</td>
      </tr>
    </tfoot>
  </table>

  ${!allDone ? '<p style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 8px;">⏳ Certains scrapers sont encore en cours. Un nouveau rapport sera envoyé quand tout sera terminé.</p>' : ''}

  <p style="color: #666; font-size: 13px; margin-top: 20px;">
    Les prix sont mis à jour automatiquement chaque dimanche à 3h du matin.<br>
    Prochaine mise à jour : dimanche prochain.
  </p>

  <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
    JADOMI IA — Comparateur prix multi-fournisseurs<br>
    <a href="https://jadomi.fr" style="color: #0066ff;">jadomi.fr</a>
  </div>
</div>`;

  console.log('=== Rapport scraping ===');
  fullResults.forEach(r => console.log(`  ${r.name}: ${r.status} — ${r.products || 0} produits`));
  console.log(`  TOTAL: ${totalProducts} produits`);
  console.log(`  Tous finis: ${allDone}`);

  // Envoyer email
  const result = await sendMail({
    to: 'karim_bahmed@yahoo.fr',
    subject,
    html
  });

  if (result.ok) {
    console.log('Email envoye!');
  } else {
    console.log('Email erreur:', result.error);
  }
}

main().catch(e => console.error(e));
