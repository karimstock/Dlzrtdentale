#!/usr/bin/env node
// =============================================
// JADOMI — Universal Scraper CLI Runner
// Usage:
//   node run-scraper.js --all                  : scrape all sites sequentially
//   node run-scraper.js --site doctor-ai       : scrape one site
//   node run-scraper.js --site doctor-ai --method brands : force method
//   node run-scraper.js --resume               : resume from progress files
//   node run-scraper.js --stats                : show current stats
//   node run-scraper.js --list                 : list all configured sites
//   node run-scraper.js --type prestashop      : scrape all PrestaShop sites
//   node run-scraper.js --dry-run --site X     : test without importing
// =============================================

const ScraperEngine = require('./scraper-engine');
const { SITES, getSiteByName, getAllSites, getSiteNames, getSitesByType } = require('./scrape-all-sites');
const fs = require('fs');
const path = require('path');
const http = require('http');

const TMP_DIR = '/home/ubuntu/jadomi/tmp';
const LOG_DIR = '/tmp';

// ========== PARSE CLI ARGS ==========

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    all: false,
    site: null,
    method: null,
    resume: false,
    stats: false,
    list: false,
    type: null,
    dryRun: false,
    level: null, // anti-bot level filter
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--all': opts.all = true; break;
      case '--site': opts.site = args[++i]; break;
      case '--method': opts.method = args[++i]; break;
      case '--resume': opts.resume = true; break;
      case '--stats': opts.stats = true; break;
      case '--list': opts.list = true; break;
      case '--type': opts.type = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--level': opts.level = args[++i]; break;
      case '--help': case '-h': printHelp(); process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
JADOMI — Scraper Universel Dentaire
====================================

Usage:
  node run-scraper.js [options]

Options:
  --all                 Scraper tous les sites sequentiellement
  --site <name>         Scraper un site specifique (ex: doctorai, gacd, dentalgooddeal)
  --method <method>     Forcer une methode: brands, categories, sitemap, search
  --resume              Reprendre depuis les fichiers de progression
  --stats               Afficher les statistiques des scrapes en cours
  --list                Lister tous les sites configures
  --type <type>         Scraper tous les sites d'un type: magento, prestashop, custom, manufacturer
  --level <level>       Scraper par niveau anti-bot: none, moderate, heavy
  --dry-run             Mode test sans import Supabase
  -h, --help            Afficher cette aide

Exemples:
  node run-scraper.js --site doctorai --method sitemap
  node run-scraper.js --type prestashop --dry-run
  node run-scraper.js --all
  node run-scraper.js --stats
  `);
}

// ========== STATS ==========

function showStats() {
  console.log('\n=== JADOMI Scraper — Statistiques ===\n');

  const names = getSiteNames();
  let totalProducts = 0;
  let totalUrls = 0;
  const rows = [];

  for (const name of names) {
    const stats = ScraperEngine.getStats(name);
    if (stats) {
      rows.push(stats);
      totalProducts += stats.totalProducts;
      totalUrls += stats.totalUrlsVisited;
    }
  }

  if (rows.length === 0) {
    console.log('Aucune donnee de progression trouvee.');
    console.log(`Verifiez le dossier: ${TMP_DIR}\n`);
    return;
  }

  // Sort by product count descending
  rows.sort((a, b) => b.totalProducts - a.totalProducts);

  console.log('Site'.padEnd(25) + 'Produits'.padStart(10) + 'URLs'.padStart(10) + '  Derniere MAJ');
  console.log('-'.repeat(70));

  for (const r of rows) {
    const name = (r.source || '').padEnd(25);
    const prods = String(r.totalProducts).padStart(10);
    const urls = String(r.totalUrlsVisited).padStart(10);
    const date = r.savedAt ? r.savedAt.slice(0, 19).replace('T', ' ') : 'N/A';
    console.log(`${name}${prods}${urls}  ${date}`);
  }

  console.log('-'.repeat(70));
  console.log(`${'TOTAL'.padEnd(25)}${String(totalProducts).padStart(10)}${String(totalUrls).padStart(10)}`);
  console.log(`\n${rows.length}/${names.length} sites avec des donnees\n`);

  // Also check for backup files
  try {
    const files = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.json') && !f.includes('progress'));
    if (files.length > 0) {
      console.log(`Fichiers backup recents:`);
      const recent = files.sort().slice(-10);
      for (const f of recent) {
        try {
          const stat = fs.statSync(path.join(TMP_DIR, f));
          const size = (stat.size / 1024).toFixed(0) + 'KB';
          console.log(`  ${f.padEnd(50)} ${size}`);
        } catch (e) { /* ignore */ }
      }
      console.log('');
    }
  } catch (e) { /* ignore */ }
}

// ========== LIST SITES ==========

function listSites() {
  console.log('\n=== JADOMI — Sites Configures ===\n');
  console.log('Nom'.padEnd(22) + 'Type'.padEnd(15) + 'Anti-bot'.padEnd(12) + 'URL');
  console.log('-'.repeat(90));

  for (const site of SITES) {
    const name = site.name.padEnd(22);
    const type = site.type.padEnd(15);
    const level = (site.antiBotLevel || 'none').padEnd(12);
    console.log(`${name}${type}${level}${site.baseUrl}`);
  }

  console.log(`\nTotal: ${SITES.length} sites`);

  // Stats by type
  const types = {};
  const levels = {};
  for (const s of SITES) {
    types[s.type] = (types[s.type] || 0) + 1;
    const l = s.antiBotLevel || 'none';
    levels[l] = (levels[l] || 0) + 1;
  }
  console.log('\nPar type:');
  for (const [t, c] of Object.entries(types)) console.log(`  ${t}: ${c}`);
  console.log('\nPar niveau anti-bot:');
  for (const [l, c] of Object.entries(levels)) console.log(`  ${l}: ${c}`);
  console.log('');
}

// ========== RUN SINGLE SITE ==========

async function runSite(siteConfig, options = {}) {
  const logFile = path.join(LOG_DIR, `${siteConfig.name}-scraper.log`);

  // Clear previous log
  try { fs.writeFileSync(logFile, ''); } catch (e) { /* ignore */ }

  const engine = new ScraperEngine(siteConfig, {
    ...options,
    logFile,
  });

  try {
    const result = await engine.run();
    return result;
  } catch (e) {
    console.error(`[ERREUR] ${siteConfig.name}: ${e.message}`);
    return { source: siteConfig.name, error: e.message, totalProducts: 0, imported: 0 };
  }
}

// ========== SEND EMAIL NOTIFICATION ==========

async function sendNotification(results) {
  try {
    const totalProducts = results.reduce((sum, r) => sum + (r.totalProducts || 0), 0);
    const totalImported = results.reduce((sum, r) => sum + (r.imported || 0), 0);
    const errors = results.filter(r => r.error);

    const subject = `JADOMI Scraper termine — ${totalProducts} produits`;
    const body = [
      'Resultats du scraping universel JADOMI:',
      '',
      `Sites scrapes: ${results.length}`,
      `Produits totaux: ${totalProducts}`,
      `Importes en base: ${totalImported}`,
      `Erreurs: ${errors.length}`,
      '',
      'Detail par site:',
      ...results.map(r => {
        if (r.error) return `  ${r.source}: ERREUR - ${r.error}`;
        return `  ${r.source}: ${r.totalProducts} produits, ${r.imported} importes (${r.elapsed})`;
      }),
    ].join('\n');

    // Try to call the notification endpoint
    const payload = JSON.stringify({
      to: 'karim_bahmed@yahoo.fr',
      subject: subject,
      text: body,
    });

    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3001,
        path: '/api/admin/notify',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 10000,
      }, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve(b));
      });
      req.on('error', () => resolve()); // Don't fail if notification fails
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.write(payload);
      req.end();
    });

    console.log(`Notification envoyee a karim_bahmed@yahoo.fr`);
  } catch (e) {
    console.log(`Notification non envoyee (${e.message})`);
  }
}

// ========== RESUME ==========

async function resumeAll(options) {
  console.log('\n=== JADOMI — Reprise des scrapes en cours ===\n');

  const progressFiles = [];
  try {
    const files = fs.readdirSync(TMP_DIR);
    for (const f of files) {
      if (f.endsWith('-progress.json')) {
        const siteName = f.replace('-progress.json', '');
        const siteConfig = getSiteByName(siteName);
        if (siteConfig) {
          progressFiles.push({ siteName, siteConfig });
        }
      }
    }
  } catch (e) {
    console.log('Aucun fichier de progression trouve');
    return;
  }

  if (progressFiles.length === 0) {
    console.log('Aucun scrape a reprendre');
    return;
  }

  console.log(`${progressFiles.length} scrapes a reprendre: ${progressFiles.map(p => p.siteName).join(', ')}\n`);

  const results = [];
  for (const { siteName, siteConfig } of progressFiles) {
    console.log(`\nReprise: ${siteName}...`);
    const result = await runSite(siteConfig, { ...options, resume: true });
    results.push(result);
  }

  return results;
}

// ========== MAIN ==========

async function main() {
  const opts = parseArgs();

  // Stats mode
  if (opts.stats) {
    showStats();
    return;
  }

  // List mode
  if (opts.list) {
    listSites();
    return;
  }

  // Resume mode
  if (opts.resume && !opts.site && !opts.all) {
    const results = await resumeAll({ dryRun: opts.dryRun, method: opts.method });
    if (results && results.length > 0) {
      await sendNotification(results);
    }
    return;
  }

  // Single site
  if (opts.site) {
    const siteConfig = getSiteByName(opts.site);
    if (!siteConfig) {
      console.error(`Site inconnu: "${opts.site}"`);
      console.log('\nSites disponibles:');
      getSiteNames().forEach(n => console.log(`  ${n}`));
      process.exit(1);
    }
    const result = await runSite(siteConfig, {
      dryRun: opts.dryRun,
      method: opts.method,
      resume: opts.resume,
    });
    await sendNotification([result]);
    return;
  }

  // Type filter
  if (opts.type) {
    const sites = getSitesByType(opts.type);
    if (sites.length === 0) {
      console.error(`Aucun site de type: "${opts.type}"`);
      console.log('Types disponibles: magento, prestashop, custom, manufacturer');
      process.exit(1);
    }
    console.log(`\n=== Scraping de ${sites.length} sites de type "${opts.type}" ===\n`);
    const results = [];
    for (const siteConfig of sites) {
      const result = await runSite(siteConfig, { dryRun: opts.dryRun, method: opts.method, resume: opts.resume });
      results.push(result);
    }
    await sendNotification(results);
    printSummary(results);
    return;
  }

  // Level filter
  if (opts.level) {
    const sites = SITES.filter(s => (s.antiBotLevel || 'none') === opts.level);
    if (sites.length === 0) {
      console.error(`Aucun site avec niveau: "${opts.level}"`);
      process.exit(1);
    }
    console.log(`\n=== Scraping de ${sites.length} sites niveau "${opts.level}" ===\n`);
    const results = [];
    for (const siteConfig of sites) {
      const result = await runSite(siteConfig, { dryRun: opts.dryRun, method: opts.method, resume: opts.resume });
      results.push(result);
    }
    await sendNotification(results);
    printSummary(results);
    return;
  }

  // All sites
  if (opts.all) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('JADOMI — Scraping UNIVERSEL — TOUS LES SITES');
    console.log(`${SITES.length} sites configures`);
    console.log(`${'='.repeat(60)}\n`);

    // Order: easy sites first (no anti-bot), then moderate, then heavy
    const ordered = [
      ...SITES.filter(s => (s.antiBotLevel || 'none') === 'none'),
      ...SITES.filter(s => s.antiBotLevel === 'moderate'),
      ...SITES.filter(s => s.antiBotLevel === 'heavy'),
    ];

    const results = [];
    for (let i = 0; i < ordered.length; i++) {
      console.log(`\n[${ i + 1}/${ordered.length}] ${ordered[i].name.toUpperCase()}...`);
      const result = await runSite(ordered[i], { dryRun: opts.dryRun, method: opts.method, resume: opts.resume });
      results.push(result);

      // Brief pause between sites to avoid global rate limits
      if (i < ordered.length - 1) {
        const pause = ordered[i].antiBotLevel === 'heavy' ? 30 : 10;
        console.log(`Pause ${pause}s avant le prochain site...`);
        await new Promise(r => setTimeout(r, pause * 1000));
      }
    }

    await sendNotification(results);
    printSummary(results);
    return;
  }

  // No valid option
  printHelp();
}

function printSummary(results) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('RESUME FINAL');
  console.log('='.repeat(60));

  const totalProducts = results.reduce((s, r) => s + (r.totalProducts || 0), 0);
  const totalImported = results.reduce((s, r) => s + (r.imported || 0), 0);
  const errors = results.filter(r => r.error);
  const successes = results.filter(r => !r.error && r.totalProducts > 0);

  console.log(`\nSites scrapes: ${results.length}`);
  console.log(`Sites reussis: ${successes.length}`);
  console.log(`Sites en erreur: ${errors.length}`);
  console.log(`\nProduits totaux: ${totalProducts}`);
  console.log(`Importes en base: ${totalImported}`);

  if (successes.length > 0) {
    console.log('\nDetail par site:');
    successes.sort((a, b) => b.totalProducts - a.totalProducts);
    for (const r of successes) {
      console.log(`  ${r.source.padEnd(22)} ${String(r.totalProducts).padStart(8)} produits  ${String(r.imported).padStart(8)} importes  ${r.elapsed}`);
    }
  }

  if (errors.length > 0) {
    console.log('\nErreurs:');
    for (const r of errors) {
      console.log(`  ${r.source}: ${r.error}`);
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

main().catch(e => {
  console.error('Erreur fatale:', e);
  process.exit(1);
});
