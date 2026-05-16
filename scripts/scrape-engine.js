#!/usr/bin/env node
// =============================================
// JADOMI SCRAPE ENGINE — Système auto-évolutif
//
// Ce moteur tourne en continu sur le VPS.
// Il apprend, s'adapte, et grossit tout seul.
//
// Architecture:
//   /tmp/jadomi-engine/         — État du moteur
//   /tmp/jadomi-engine/sites/   — Fiches site (ce qui marche, ce qui fail)
//   /tmp/jadomi-engine/cycles/  — Historique des cycles
//   /tmp/jadomi-engine/brain.json — Apprentissage
//
// Lancement: nohup node scripts/scrape-engine.js &
// Analyse:   node scripts/scrape-engine.js --report
// =============================================

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const nodemailer = require('nodemailer');

const ENGINE_DIR = '/tmp/jadomi-engine';
const SITES_DIR = path.join(ENGINE_DIR, 'sites');
const CYCLES_DIR = path.join(ENGINE_DIR, 'cycles');
const BRAIN_FILE = path.join(ENGINE_DIR, 'brain.json');
const LOG_FILE = path.join(ENGINE_DIR, 'engine.log');
const SCRIPTS = path.join(__dirname);

// Ensure dirs
for (const d of [ENGINE_DIR, SITES_DIR, CYCLES_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

// =============================================
// BRAIN — Apprentissage persistant
// =============================================

function loadBrain() {
  if (fs.existsSync(BRAIN_FILE)) {
    try { return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8')); }
    catch (e) {}
  }
  return {
    version: 1,
    created: new Date().toISOString(),
    totalCycles: 0,
    totalProductsEver: 0,
    sites: {},           // Par site: { bestMethod, lastCount, lastSuccess, failures, avgTime }
    discoveredSites: [], // Sites trouvés automatiquement
    failPatterns: [],    // Patterns d'échec récurrents
    successPatterns: [], // Ce qui marche bien
  };
}

function saveBrain(brain) {
  brain.lastSaved = new Date().toISOString();
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain, null, 2));
}

// =============================================
// SITE PROFILES — Fiche par site
// =============================================

function loadSiteProfile(siteName) {
  const f = path.join(SITES_DIR, `${siteName}.json`);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) {}
  }
  return {
    name: siteName,
    created: new Date().toISOString(),
    methods: {},     // method → { tried, success, products, avgTime, lastError }
    currentProducts: 0,
    maxProducts: 0,
    status: 'new',   // new, active, done, dead, blocked
    notes: [],
  };
}

function saveSiteProfile(profile) {
  profile.lastUpdated = new Date().toISOString();
  fs.writeFileSync(path.join(SITES_DIR, `${profile.name}.json`), JSON.stringify(profile, null, 2));
}

// =============================================
// LOGGING
// =============================================

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function sendEmail(subject, html) {
  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject, html,
    });
  } catch (e) {
    log(`📧 Erreur email: ${e.message}`);
  }
}

// =============================================
// PRODUCT COUNTING
// =============================================

function getProductCount(siteName) {
  const f = `/tmp/search-progress-${siteName}.json`;
  if (!fs.existsSync(f)) return 0;
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const p = d.products || {};
    return typeof p === 'object' && !Array.isArray(p) ? Object.keys(p).length : 0;
  } catch (e) { return 0; }
}

function getAllCounts() {
  const skip = ['backup', 'dentalpromotion', 'dbidental'];
  const counts = {};
  let total = 0;
  for (const f of fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json'))) {
    if (skip.some(s => f.includes(s))) continue;
    const name = f.replace('search-progress-', '').replace('.json', '');
    const count = getProductCount(name);
    if (count > 0) { counts[name] = count; total += count; }
  }
  return { counts, total };
}

// =============================================
// RAM MANAGEMENT
// =============================================

function getAvailableRamMB() {
  try {
    const m = execSync('free -m').toString().match(/Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
    return m ? parseInt(m[1]) : 10000;
  } catch (e) { return 10000; }
}

function killChrome() {
  try { execSync('killall -9 chrome 2>/dev/null || true'); } catch (e) {}
}

// =============================================
// RESET CRASHED QUERIES
// =============================================

function resetCrashedQueries(siteName) {
  const f = `/tmp/search-progress-${siteName}.json`;
  if (!fs.existsSync(f)) return;
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const goodQueries = new Set();
    for (const p of Object.values(d.products || {})) {
      if (p.searchQuery) goodQueries.add(p.searchQuery);
    }
    const old = (d.completedQueries || []).length;
    d.completedQueries = Array.from(goodQueries);
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
    return { old, new: goodQueries.size, products: Object.keys(d.products || {}).length };
  } catch (e) { return null; }
}

// =============================================
// RUN A SCRAPER — with timeout and crash recovery
// =============================================

function runScraper(script, args = [], timeoutMin = 45) {
  return new Promise((resolve) => {
    killChrome();
    const start = Date.now();

    const proc = spawn('node', [path.join(SCRIPTS, script), ...args], {
      cwd: SCRIPTS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });

    let lastProgress = '';
    const timer = setTimeout(() => {
      log(`  ⏰ Timeout ${timeoutMin}min`);
      proc.kill('SIGTERM');
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch(e) {} }, 5000);
    }, timeoutMin * 60 * 1000);

    proc.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        if (line.includes('Progression:') || line.includes('FIN SCRAPE') || line.includes('Total produits')) {
          lastProgress = line.trim();
          log(`  ${lastProgress}`);
        }
      }
    });

    proc.stderr.on('data', (d) => {
      const t = d.toString().trim();
      if (t && !t.includes('Experimental') && !t.includes('Deprecation')) {
        log(`  [ERR] ${t.substring(0, 120)}`);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      killChrome();
      resolve({ code, elapsed: Math.round((Date.now() - start) / 1000), lastProgress });
    });

    proc.on('error', () => {
      clearTimeout(timer);
      killChrome();
      resolve({ code: 1, elapsed: 0, lastProgress: 'spawn error' });
    });
  });
}

// =============================================
// STRATEGIES PER SITE
// =============================================

async function scrapeSite(siteName, brain) {
  const profile = loadSiteProfile(siteName);
  const beforeCount = getProductCount(siteName);
  let result = { success: false, method: 'unknown', products: 0, gained: 0 };

  log(`\n${'═'.repeat(55)}`);
  log(`🔍 ${siteName} | actuel: ${beforeCount} | status: ${profile.status}`);

  if (profile.status === 'dead') {
    log(`  ☠️ Site mort, skip`);
    return result;
  }

  // Choose strategy based on site name and brain
  const siteStrategies = {
    'gacd': async () => {
      if (beforeCount >= 55000) { log('  Déjà complet'); return; }
      const r = await runScraper('scrape-gacd-algolia-v2.js', [], 30);
      return { method: 'algolia', ...r };
    },
    'dentalgooddeal': async () => {
      if (beforeCount >= 2500) { log('  Déjà OK'); return; }
      const r = await runScraper('scrape-dentalgooddeal.js', [], 20);
      return { method: 'category-scrape', ...r };
    },
    // Default: search + cross-ref from GACD
    '_default': async () => {
      // Phase A: Search classique (captures marques propres du site)
      const reset = resetCrashedQueries(siteName);
      if (reset) log(`  Reset: ${reset.old} → ${reset.new} queries (${reset.products} produits gardés)`);
      const r1 = await runScraper('scrape-by-search.js', ['--site', siteName], 45);

      // Phase B: Cross-ref GACD (trouve les produits communs + prix)
      log(`  Phase cross-ref GACD → ${siteName}...`);
      const r2 = await runScraper('scrape-crossref.js', ['--site', siteName], 60);

      return { method: 'search+crossref', code: r1.code, elapsed: (r1.elapsed || 0) + (r2.elapsed || 0), lastProgress: r2.lastProgress || r1.lastProgress };
    },
  };

  try {
    const strategy = siteStrategies[siteName] || siteStrategies['_default'];
    const r = await strategy();
    if (!r) { result.success = true; result.products = beforeCount; return result; }

    const afterCount = getProductCount(siteName);
    const gained = afterCount - beforeCount;

    result = {
      success: r.code === 0 || gained > 0,
      method: r.method,
      products: afterCount,
      gained,
      elapsed: r.elapsed,
    };

    // Update profile
    profile.currentProducts = afterCount;
    profile.maxProducts = Math.max(profile.maxProducts, afterCount);
    profile.status = afterCount > 0 ? 'active' : (profile.status === 'new' ? 'dead' : profile.status);
    if (!profile.methods[r.method]) profile.methods[r.method] = { tried: 0, success: 0, totalProducts: 0 };
    profile.methods[r.method].tried++;
    if (result.success) profile.methods[r.method].success++;
    profile.methods[r.method].totalProducts = afterCount;
    profile.methods[r.method].lastRun = new Date().toISOString();

    // Brain update
    if (!brain.sites[siteName]) brain.sites[siteName] = {};
    brain.sites[siteName].lastCount = afterCount;
    brain.sites[siteName].lastMethod = r.method;
    brain.sites[siteName].lastSuccess = result.success;
    brain.sites[siteName].lastRun = new Date().toISOString();

    // Learn from failures
    if (!result.success && r.elapsed < 60) {
      profile.notes.push(`${new Date().toISOString()}: Échec rapide avec ${r.method} (${r.elapsed}s)`);
      brain.failPatterns.push({ site: siteName, method: r.method, error: r.lastProgress, date: new Date().toISOString() });
    }

    // Learn from success
    if (gained > 100) {
      brain.successPatterns.push({ site: siteName, method: r.method, gained, date: new Date().toISOString() });
    }

  } catch (err) {
    log(`  ❌ Exception: ${err.message}`);
    profile.notes.push(`${new Date().toISOString()}: Exception: ${err.message}`);
  }

  saveSiteProfile(profile);
  log(`  ✅ ${siteName}: ${beforeCount} → ${result.products} (+${result.gained}) [${result.method}]`);

  return result;
}

// =============================================
// BUILD HTML REPORT
// =============================================

function buildReport(brain, cycleResults = []) {
  const { counts, total } = getAllCounts();
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  let html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">`;
  html += `<h2 style="color:#16213e">🦷 JADOMI Scrape Engine</h2>`;
  html += `<p>Cycle #${brain.totalCycles} — ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>`;

  // Product table
  html += `<table style="width:100%;border-collapse:collapse;margin:10px 0">`;
  html += `<tr style="background:#16213e;color:white"><th style="padding:8px;text-align:left">Site</th><th style="padding:8px;text-align:right">Produits</th><th style="padding:8px;text-align:right">Δ</th></tr>`;

  sorted.forEach(([name, count], i) => {
    const bg = i % 2 === 0 ? '#f0f4ff' : '#ffffff';
    const delta = cycleResults.find(r => r.site === name);
    const deltaStr = delta && delta.gained > 0 ? `<span style="color:green">+${delta.gained}</span>` : '';
    html += `<tr style="background:${bg}"><td style="padding:6px">${name}</td><td style="padding:6px;text-align:right"><b>${count.toLocaleString()}</b></td><td style="padding:6px;text-align:right">${deltaStr}</td></tr>`;
  });

  html += `<tr style="background:#16213e;color:white;font-size:1.1em"><td style="padding:8px"><b>TOTAL</b></td><td style="padding:8px;text-align:right"><b>${total.toLocaleString()}</b></td><td></td></tr>`;
  html += `</table>`;

  // System info
  const ram = getAvailableRamMB();
  html += `<p style="color:#666;font-size:12px">RAM dispo: ${ram} Mo | Cycles: ${brain.totalCycles} | Succès patterns: ${brain.successPatterns.length} | Fail patterns: ${brain.failPatterns.length}</p>`;

  html += `</div>`;
  return html;
}

// =============================================
// DISCOVER NEW SITES — Analyse le web
// =============================================

async function discoverNewSites(brain) {
  // Sites dentaires connus qu'on n'a peut-être pas encore
  const potentialSites = [
    { name: 'prodont-holliger', url: 'https://www.prodont-holliger.com', type: 'manufacturer' },
    { name: 'dema-dent', url: 'https://www.dema-dent.com', type: 'distributor' },
    { name: 'medistock', url: 'https://www.medistock.fr', type: 'distributor' },
    { name: 'dentaire-paris', url: 'https://www.dentaire-paris.fr', type: 'distributor' },
    { name: 'proclinic', url: 'https://www.proclinic.fr', type: 'distributor' },
    { name: 'edenta', url: 'https://www.edenta.com', type: 'manufacturer' },
    { name: 'komet', url: 'https://www.komet.com', type: 'manufacturer' },
  ];

  const newSites = [];
  for (const site of potentialSites) {
    if (brain.discoveredSites.find(s => s.name === site.name)) continue;

    try {
      const resp = await fetch(site.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        brain.discoveredSites.push({
          ...site,
          discovered: new Date().toISOString(),
          httpStatus: resp.status,
          tested: false,
        });
        newSites.push(site.name);
        log(`  🆕 Nouveau site découvert: ${site.name} (${site.url})`);
      }
    } catch (e) {
      // Site inaccessible, on ignore
    }
  }

  return newSites;
}

// =============================================
// ONE CYCLE
// =============================================

async function runCycle(brain) {
  brain.totalCycles++;
  const cycleId = `cycle-${brain.totalCycles}-${Date.now()}`;
  const cycleStart = Date.now();
  const cycleResults = [];

  log(`\n${'╔' + '═'.repeat(55) + '╗'}`);
  log(`${'║'} CYCLE #${brain.totalCycles} — ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${' '.repeat(Math.max(0, 55 - 35))}${'║'}`);
  log(`${'╚' + '═'.repeat(55) + '╝'}`);

  const { total: startTotal } = getAllCounts();
  log(`Produits au départ: ${startTotal}`);

  // Sites to scrape this cycle (prioritize low-count sites)
  const sitesToScrape = [
    'gacd',        // D'abord GACD (base de référence, Algolia = 57K produits)
    'doctorai', 'doctorstrong', 'megadental', 'b2b-dental', // Gros sites Magento (search + cross-ref GACD)
    'dentalgooddeal',                                        // Custom (catégories)
    'dentalprive', 'dentalachat', 'godentaire',              // PrestaShop (search + cross-ref GACD)
    'topdentaire', 'dental-france', 'dentalevolution',       // Petits sites
  ];

  for (const siteName of sitesToScrape) {
    // Check RAM before each site
    if (getAvailableRamMB() < 1500) {
      log(`⚠️ RAM basse, nettoyage...`);
      killChrome();
      await new Promise(r => setTimeout(r, 10000));
    }

    const result = await scrapeSite(siteName, brain);
    cycleResults.push({ site: siteName, ...result });

    // Pause between sites
    await new Promise(r => setTimeout(r, 5000));
  }

  // Discovery phase
  log(`\n🔎 Phase découverte...`);
  const newSites = await discoverNewSites(brain);
  if (newSites.length > 0) log(`  ${newSites.length} nouveaux sites trouvés`);

  // Cycle summary
  const { total: endTotal } = getAllCounts();
  const gained = endTotal - startTotal;
  const elapsed = Math.round((Date.now() - cycleStart) / 1000 / 60);

  // Save cycle history
  const cycleData = {
    id: cycleId,
    number: brain.totalCycles,
    date: new Date().toISOString(),
    startProducts: startTotal,
    endProducts: endTotal,
    gained,
    elapsedMinutes: elapsed,
    results: cycleResults,
    newSitesDiscovered: newSites,
  };
  fs.writeFileSync(path.join(CYCLES_DIR, `${cycleId}.json`), JSON.stringify(cycleData, null, 2));

  // Update brain
  brain.totalProductsEver = Math.max(brain.totalProductsEver, endTotal);
  saveBrain(brain);

  log(`\n🏁 Cycle #${brain.totalCycles} terminé: ${startTotal} → ${endTotal} (+${gained}) en ${elapsed}min`);

  // Send report
  await sendEmail(
    `🦷 Cycle #${brain.totalCycles} — ${endTotal.toLocaleString()} produits (+${gained})`,
    buildReport(brain, cycleResults)
  );

  return { gained, endTotal };
}

// =============================================
// REPORT MODE
// =============================================

function showReport() {
  const brain = loadBrain();
  const { counts, total } = getAllCounts();
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  JADOMI SCRAPE ENGINE — ÉTAT                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log(`Cycles exécutés: ${brain.totalCycles}`);
  console.log(`Max produits atteint: ${brain.totalProductsEver}`);
  console.log(`Dernière sauvegarde: ${brain.lastSaved || 'jamais'}\n`);

  console.log('Sites:');
  sorted.forEach(([name, count]) => {
    const siteInfo = brain.sites[name] || {};
    const status = siteInfo.lastSuccess === false ? '⚠️' : '✅';
    console.log(`  ${status} ${name.padEnd(20)} ${String(count).padStart(7)} produits  [${siteInfo.lastMethod || '?'}]`);
  });
  console.log(`${'─'.repeat(45)}`);
  console.log(`  TOTAL${' '.repeat(13)} ${String(total).padStart(7)} produits\n`);

  // Show failure patterns
  if (brain.failPatterns.length > 0) {
    console.log('Patterns d\'échec récents:');
    brain.failPatterns.slice(-5).forEach(p => {
      console.log(`  ${p.site}: ${p.method} — ${p.error?.substring(0, 60) || '?'}`);
    });
  }

  // Show discovered sites
  if (brain.discoveredSites.length > 0) {
    console.log('\nSites découverts (pas encore scrapés):');
    brain.discoveredSites.filter(s => !s.tested).forEach(s => {
      console.log(`  🆕 ${s.name} — ${s.url}`);
    });
  }

  console.log(`\nRAM disponible: ${getAvailableRamMB()} Mo`);
}

// =============================================
// MAIN LOOP
// =============================================

async function main() {
  // Report mode
  if (process.argv.includes('--report')) {
    showReport();
    return;
  }

  const brain = loadBrain();

  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI SCRAPE ENGINE — DÉMARRAGE                      ║');
  log('║  Système auto-évolutif autonome                        ║');
  log('╚══════════════════════════════════════════════════════════╝');

  // Wait for master scraper to finish if running
  const masterRunning = () => {
    try { return execSync('pgrep -f "scrape-master.js"').toString().trim().length > 0; }
    catch (e) { return false; }
  };

  if (masterRunning()) {
    log('⏳ Master scraper en cours, attente...');
    while (masterRunning()) {
      await new Promise(r => setTimeout(r, 30000));
    }
    log('Master scraper terminé, Engine prend le relais');
  }

  // Main loop — run cycles with increasing intervals
  let cycleNum = 0;
  while (true) {
    cycleNum++;
    try {
      const { gained, endTotal } = await runCycle(brain);

      // Adaptive wait: if we gained a lot, run again sooner
      // If diminishing returns, wait longer
      let waitMinutes;
      if (gained > 1000) {
        waitMinutes = 10;  // Gros gains, on continue vite
        log(`📈 Gros gains (+${gained}), prochain cycle dans ${waitMinutes}min`);
      } else if (gained > 100) {
        waitMinutes = 30;
        log(`📊 Gains modérés (+${gained}), prochain cycle dans ${waitMinutes}min`);
      } else if (gained > 0) {
        waitMinutes = 120; // 2h
        log(`📉 Gains faibles (+${gained}), prochain cycle dans ${waitMinutes}min`);
      } else {
        waitMinutes = 360; // 6h
        log(`⏸️ Aucun gain, prochain cycle dans ${waitMinutes}min (6h)`);
      }

      log(`💤 Pause ${waitMinutes} minutes...\n`);
      await new Promise(r => setTimeout(r, waitMinutes * 60 * 1000));

    } catch (err) {
      log(`❌ Erreur cycle: ${err.message}`);
      await sendEmail('❌ JADOMI Engine erreur', `<p>Erreur: ${err.message}</p>${buildReport(brain)}`);
      // Wait 30min before retrying
      await new Promise(r => setTimeout(r, 30 * 60 * 1000));
    }
  }
}

main().catch(async (err) => {
  log(`FATAL: ${err.message}`);
  try {
    await sendEmail('💀 JADOMI Engine CRASH', `<h2>Crash fatal</h2><p>${err.message}</p>`);
  } catch (e) {}
  process.exit(1);
});
