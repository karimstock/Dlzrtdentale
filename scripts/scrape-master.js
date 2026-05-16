#!/usr/bin/env node
// =============================================
// JADOMI — MASTER SCRAPER AUTONOME
// Tourne tout seul sur le VPS, gère la RAM,
// adapte sa stratégie par site, envoie des emails.
// Usage: node scripts/scrape-master.js
// =============================================

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SCRIPTS_DIR = path.join(__dirname);
const LOG_FILE = '/tmp/scrape-master.log';
const EMAIL_TO = 'karim_bahmed@yahoo.fr';

// SMTP config
const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

// =============================================
// LOGGING & EMAIL
// =============================================

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function sendEmail(subject, html) {
  try {
    await transporter.sendMail({
      from: 'JADOMI Scraper <noreply@jadomi.fr>',
      to: EMAIL_TO,
      subject,
      html,
    });
    log(`📧 Email envoyé: ${subject}`);
  } catch (e) {
    log(`❌ Email erreur: ${e.message}`);
  }
}

function getProductCount(siteName) {
  const files = [
    `/tmp/search-progress-${siteName}.json`,
  ];
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        const p = d.products || {};
        return typeof p === 'object' && !Array.isArray(p) ? Object.keys(p).length : 0;
      } catch (e) {}
    }
  }
  return 0;
}

function getGrandTotal() {
  let total = 0;
  const skip = ['backup', 'dentalpromotion', 'dbidental'];
  for (const f of fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json'))) {
    if (skip.some(s => f.includes(s))) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join('/tmp', f), 'utf8'));
      const p = d.products || {};
      total += typeof p === 'object' && !Array.isArray(p) ? Object.keys(p).length : 0;
    } catch (e) {}
  }
  return total;
}

function buildReport() {
  const skip = ['backup', 'dentalpromotion', 'dbidental'];
  const sites = [];
  for (const f of fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json'))) {
    if (skip.some(s => f.includes(s))) continue;
    const name = f.replace('search-progress-', '').replace('.json', '');
    const count = getProductCount(name);
    if (count > 0) sites.push({ name, count });
  }
  sites.sort((a, b) => b.count - a.count);

  const total = sites.reduce((s, r) => s + r.count, 0);
  const mem = execSync('free -h').toString().match(/Mem:\s+(\S+)\s+(\S+)/);

  let html = `<h2>🦷 JADOMI Comparateur — Rapport Scraping</h2>`;
  html += `<p><b>Heure:</b> ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>`;
  html += `<p><b>RAM:</b> ${mem ? mem[2] + '/' + mem[1] : '?'}</p>`;
  html += `<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:Arial">`;
  html += `<tr style="background:#1a1a2e;color:white"><th>Site</th><th>Produits</th></tr>`;
  sites.forEach((s, i) => {
    const bg = i % 2 === 0 ? '#f8f8f8' : '#ffffff';
    html += `<tr style="background:${bg}"><td>${s.name}</td><td><b>${s.count.toLocaleString()}</b></td></tr>`;
  });
  html += `<tr style="background:#16213e;color:white;font-size:1.2em"><td><b>TOTAL</b></td><td><b>${total.toLocaleString()}</b></td></tr>`;
  html += `</table>`;
  return html;
}

// =============================================
// RAM MANAGEMENT
// =============================================

function getAvailableRamMB() {
  try {
    const mem = execSync('free -m').toString();
    const match = mem.match(/Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
    return match ? parseInt(match[1]) : 10000;
  } catch (e) { return 10000; }
}

function killChrome() {
  try { execSync('killall -9 chrome 2>/dev/null || true'); } catch (e) {}
}

// =============================================
// SCRAPER RUNNER — 1 at a time, with crash recovery
// =============================================

function runScript(scriptPath, args = [], timeoutMinutes = 45) {
  return new Promise((resolve) => {
    killChrome();

    const proc = spawn('node', [scriptPath, ...args], {
      cwd: SCRIPTS_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });

    let lastLine = '';
    const timeout = setTimeout(() => {
      log(`  ⏰ Timeout ${timeoutMinutes}min, killing...`);
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }, timeoutMinutes * 60 * 1000);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.includes('Progression:') || line.includes('IMPORT') ||
            line.includes('FIN SCRAPE') || line.includes('DEBUT SCRAPE') ||
            line.includes('Total produits') || line.includes('ERREUR FATALE')) {
          log(`  ${line.trim()}`);
        }
        lastLine = line;
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('Experimental') && !text.includes('Deprecation')) {
        log(`  [ERR] ${text.substring(0, 150)}`);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      killChrome();
      resolve(code);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      killChrome();
      resolve(1);
    });
  });
}

// =============================================
// RESET CRASHED QUERIES for a search-progress file
// =============================================

function resetCrashedQueries(siteName) {
  const progressPath = `/tmp/search-progress-${siteName}.json`;
  if (!fs.existsSync(progressPath)) return;

  try {
    const d = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    const goodQueries = new Set();
    for (const [key, p] of Object.entries(d.products || {})) {
      if (p.searchQuery) goodQueries.add(p.searchQuery);
    }

    const oldCount = (d.completedQueries || []).length;
    d.completedQueries = Array.from(goodQueries);
    fs.writeFileSync(progressPath, JSON.stringify(d, null, 2));
    log(`  Reset ${siteName}: ${oldCount} → ${goodQueries.size} queries (${Object.keys(d.products || {}).length} produits conservés)`);
  } catch (e) {
    log(`  Reset ${siteName} erreur: ${e.message}`);
  }
}

// =============================================
// SITE STRATEGIES
// =============================================

const SITES_TO_SCRAPE = [
  // Search-based sites (Puppeteer) — reset crashes and re-run
  { name: 'doctorai', method: 'search', timeout: 45 },
  { name: 'doctorstrong', method: 'search', timeout: 45 },
  { name: 'megadental', method: 'search', timeout: 45 },
  { name: 'b2b-dental', method: 'search', timeout: 45 },
  // PrestaShop sites already done — skip unless low count
  { name: 'dentalprive', method: 'search', timeout: 30, minProducts: 800 },
  { name: 'dentalachat', method: 'search', timeout: 30, minProducts: 700 },
  { name: 'godentaire', method: 'search', timeout: 30, minProducts: 1000 },
  { name: 'topdentaire', method: 'search', timeout: 20, minProducts: 150 },
  { name: 'dental-france', method: 'search', timeout: 20, minProducts: 200 },
  { name: 'dentalevolution', method: 'search', timeout: 15, minProducts: 25 },
  // Custom sites
  { name: 'dentalgooddeal', method: 'custom-dgd', timeout: 20, minProducts: 2000 },
  // API sites (already done)
  { name: 'gacd', method: 'algolia', timeout: 10, minProducts: 30000 },
];

// =============================================
// MAIN EXECUTION
// =============================================

async function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║     JADOMI MASTER SCRAPER — MODE AUTONOME              ║');
  log('╚══════════════════════════════════════════════════════════╝');

  const startTotal = getGrandTotal();
  log(`Total de départ: ${startTotal} produits`);

  await sendEmail(
    `🦷 JADOMI Scraper démarré — ${startTotal.toLocaleString()} produits`,
    buildReport() + `<p>Le scraper autonome est lancé. Tu recevras un rapport après chaque site.</p>`
  );

  for (const site of SITES_TO_SCRAPE) {
    const currentCount = getProductCount(site.name);

    // Skip if already has enough products
    if (site.minProducts && currentCount >= site.minProducts) {
      log(`\n⏭️ SKIP ${site.name}: déjà ${currentCount} produits (min: ${site.minProducts})`);
      continue;
    }

    // Check RAM
    const ram = getAvailableRamMB();
    if (ram < 2000) {
      log(`⚠️ RAM basse (${ram} Mo), pause 30s...`);
      killChrome();
      await new Promise(r => setTimeout(r, 30000));
    }

    log(`\n${'═'.repeat(50)}`);
    log(`🚀 ${site.name} (méthode: ${site.method}, actuel: ${currentCount})`);
    log(`${'═'.repeat(50)}`);

    const startTime = Date.now();

    try {
      switch (site.method) {
        case 'search':
          // Reset crashed queries first
          resetCrashedQueries(site.name);
          await runScript('scrape-by-search.js', ['--site', site.name], site.timeout);
          break;

        case 'algolia':
          // GACD Algolia — already have the script
          if (currentCount < 30000) {
            await runScript('scrape-gacd-algolia-v2.js', [], site.timeout);
          }
          break;

        case 'custom-dgd':
          if (currentCount < 2000) {
            await runScript('scrape-dentalgooddeal.js', [], site.timeout);
          }
          break;

        default:
          log(`  Méthode inconnue: ${site.method}`);
      }
    } catch (err) {
      log(`  ❌ ${site.name} erreur: ${err.message}`);
    }

    // Post-scrape cleanup
    killChrome();
    await new Promise(r => setTimeout(r, 5000));

    const newCount = getProductCount(site.name);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const gained = newCount - currentCount;
    log(`✅ ${site.name}: ${currentCount} → ${newCount} (+${gained}) en ${Math.floor(elapsed/60)}m${elapsed%60}s`);

    // Send progress email
    const total = getGrandTotal();
    await sendEmail(
      `🦷 ${site.name} terminé — ${newCount.toLocaleString()} produits (total: ${total.toLocaleString()})`,
      buildReport() + `<p><b>${site.name}</b>: ${currentCount} → ${newCount} (+${gained})</p>`
    );
  }

  // =============================================
  // FINAL REPORT
  // =============================================

  const finalTotal = getGrandTotal();
  log(`\n${'═'.repeat(50)}`);
  log(`🏆 SCRAPING TERMINE — ${finalTotal} produits au total`);
  log(`${'═'.repeat(50)}`);

  await sendEmail(
    `🏆 JADOMI Scraping TERMINÉ — ${finalTotal.toLocaleString()} produits`,
    buildReport() +
    `<h3>✅ Tous les scrapers sont terminés!</h3>` +
    `<p>Le comparateur JADOMI dispose de <b>${finalTotal.toLocaleString()} produits</b>.</p>` +
    `<p>Pour Henry Schein (50 000+ produits), il faut d'abord débloquer le compte en appelant le 02 47 68 90 00.</p>` +
    `<p><i>Rapport généré automatiquement par le VPS JADOMI.</i></p>`
  );
}

main().catch(async (err) => {
  log(`ERREUR FATALE: ${err.message}`);
  await sendEmail('❌ JADOMI Scraper CRASH', `<h2>Erreur fatale</h2><p>${err.message}</p>${buildReport()}`);
  process.exit(1);
});
