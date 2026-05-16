#!/usr/bin/env node
// =============================================
// JADOMI SCRAPE AUDITOR — Auto-diagnostic & correction
//
// Tourne toutes les 30 min. Analyse les scrapers,
// détecte les bugs, corrige automatiquement, relance.
//
// nohup node scripts/scrape-auditor.js &
// =============================================

const fs = require('fs');
const { execSync, spawn } = require('child_process');
const path = require('path');
const nodemailer = require('nodemailer');

const AUDIT_DIR = '/tmp/jadomi-auditor';
const AUDIT_LOG = path.join(AUDIT_DIR, 'auditor.log');
const AUDIT_HISTORY = path.join(AUDIT_DIR, 'history.json');
fs.mkdirSync(AUDIT_DIR, { recursive: true });

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(AUDIT_LOG, line + '\n');
}

function loadHistory() {
  if (fs.existsSync(AUDIT_HISTORY)) {
    try { return JSON.parse(fs.readFileSync(AUDIT_HISTORY, 'utf8')); }
    catch (e) {}
  }
  return { audits: [], fixes: [], totalFixes: 0 };
}

function saveHistory(h) {
  h.lastAudit = new Date().toISOString();
  fs.writeFileSync(AUDIT_HISTORY, JSON.stringify(h, null, 2));
}

// =============================================
// CHECKS — chaque check retourne { ok, issue, fix }
// =============================================

function checkRam() {
  const m = execSync('free -m').toString().match(/Mem:\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\d+)/);
  const total = parseInt(m[1]);
  const used = parseInt(m[2]);
  const available = parseInt(m[3]);
  const pct = Math.round(used / total * 100);

  if (pct > 90) {
    return { ok: false, issue: `RAM critique: ${pct}% (${available} Mo dispo)`, fix: 'kill-chrome' };
  }
  if (pct > 80) {
    return { ok: false, issue: `RAM haute: ${pct}% (${available} Mo dispo)`, fix: 'warn' };
  }
  return { ok: true, detail: `RAM OK: ${pct}% (${available} Mo dispo)` };
}

function checkChromeZombies() {
  try {
    const count = parseInt(execSync('pgrep -c chrome 2>/dev/null || echo 0').toString().trim());
    const scraperCount = parseInt(execSync('pgrep -c -f "scrape" 2>/dev/null || echo 0').toString().trim());

    // Plus de 30 chrome = probable fuite
    if (count > 30) {
      return { ok: false, issue: `${count} processus Chrome (zombies probables)`, fix: 'kill-excess-chrome' };
    }
    // Chrome sans scraper = zombies
    if (count > 5 && scraperCount === 0) {
      return { ok: false, issue: `${count} Chrome orphelins (aucun scraper actif)`, fix: 'kill-all-chrome' };
    }
    return { ok: true, detail: `Chrome: ${count} processes, ${scraperCount} scrapers` };
  } catch (e) {
    return { ok: true, detail: 'Chrome check error' };
  }
}

function checkScrapersAlive() {
  const issues = [];
  const scrapers = [
    { name: 'master', pattern: 'scrape-master.js' },
    { name: 'engine', pattern: 'scrape-engine.js' },
    { name: 'crossref', pattern: 'scrape-crossref.js' },
    { name: 'search', pattern: 'scrape-by-search.js' },
  ];

  const alive = [];
  for (const s of scrapers) {
    try {
      const pid = execSync(`pgrep -f "${s.pattern}" 2>/dev/null`).toString().trim();
      if (pid) alive.push(s.name);
    } catch (e) {}
  }

  if (alive.length === 0) {
    return { ok: false, issue: 'Aucun scraper actif', fix: 'restart-engine' };
  }

  return { ok: true, detail: `Scrapers actifs: ${alive.join(', ')}` };
}

function checkProgressStale() {
  // Check if progress files haven't been updated in > 30 min
  const issues = [];
  const now = Date.now();

  for (const f of fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json') && !f.includes('backup'))) {
    try {
      const stat = fs.statSync(path.join('/tmp', f));
      const ageMins = Math.round((now - stat.mtimeMs) / 60000);
      const name = f.replace('search-progress-', '').replace('.json', '');

      // Only check sites that should be actively scraping
      if (ageMins > 60) {
        const d = JSON.parse(fs.readFileSync(path.join('/tmp', f), 'utf8'));
        const count = Object.keys(d.products || {}).length;
        if (count < 5000 && name !== 'topdentaire' && name !== 'dentalevolution' && name !== 'dental-france') {
          issues.push(`${name}: pas mis à jour depuis ${ageMins}min (${count} produits)`);
        }
      }
    } catch (e) {}
  }

  if (issues.length > 3) {
    return { ok: false, issue: `${issues.length} sites stagnent: ${issues[0]}...`, fix: 'reset-stale' };
  }
  if (issues.length > 0) {
    return { ok: false, issue: issues.join('; '), fix: 'warn' };
  }
  return { ok: true, detail: 'Progression OK' };
}

function checkCrossrefProgress() {
  const f = '/tmp/jadomi-crossref/crossref-doctorai.json';
  if (!fs.existsSync(f)) return { ok: true, detail: 'Crossref pas encore démarré' };

  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const matches = Object.keys(d.matches || {}).length;
    const queries = (d.completedQueries || []).length;
    const total = d.totalSearched || 0;

    if (queries > 100 && matches === 0) {
      return { ok: false, issue: `Crossref: ${queries} queries mais 0 matches (sélecteurs cassés?)`, fix: 'warn-crossref' };
    }

    const matchRate = queries > 0 ? Math.round(matches / queries * 100) / 100 : 0;
    return { ok: true, detail: `Crossref DocAI: ${matches} matches, ${queries} queries (${matchRate} matches/query)` };
  } catch (e) {
    return { ok: true, detail: 'Crossref error: ' + e.message };
  }
}

function checkDiskSpace() {
  try {
    const df = execSync("df -h /tmp | tail -1").toString();
    const match = df.match(/(\d+)%/);
    const pct = match ? parseInt(match[1]) : 0;

    if (pct > 90) {
      return { ok: false, issue: `Disque /tmp à ${pct}%`, fix: 'clean-tmp' };
    }
    return { ok: true, detail: `Disque /tmp: ${pct}%` };
  } catch (e) {
    return { ok: true, detail: 'Disk check error' };
  }
}

function checkServerAlive() {
  try {
    const resp = execSync('curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:3001/api/health 2>/dev/null').toString().trim();
    if (resp === '200') return { ok: true, detail: 'JADOMI server: UP' };
    return { ok: false, issue: `JADOMI server: HTTP ${resp}`, fix: 'restart-pm2' };
  } catch (e) {
    return { ok: false, issue: 'JADOMI server: DOWN', fix: 'restart-pm2' };
  }
}

// =============================================
// FIXES — actions correctives automatiques
// =============================================

function applyFix(fix, issue) {
  log(`  🔧 FIX: ${fix} (pour: ${issue})`);

  switch (fix) {
    case 'kill-chrome':
      try { execSync('killall -9 chrome 2>/dev/null'); } catch (e) {}
      log('    Chrome killé, RAM libérée');
      return true;

    case 'kill-excess-chrome':
      // Kill the oldest chrome processes, keep the newest 10
      try {
        const pids = execSync('pgrep chrome 2>/dev/null').toString().trim().split('\n');
        if (pids.length > 10) {
          const toKill = pids.slice(0, pids.length - 10);
          for (const pid of toKill) {
            try { execSync(`kill -9 ${pid} 2>/dev/null`); } catch (e) {}
          }
          log(`    Killé ${toKill.length} Chrome excédentaires`);
        }
      } catch (e) {}
      return true;

    case 'kill-all-chrome':
      try { execSync('killall -9 chrome 2>/dev/null'); } catch (e) {}
      log('    Tous les Chrome orphelins killés');
      return true;

    case 'restart-engine':
      log('    Relancement Engine...');
      try {
        execSync('cd /home/ubuntu/jadomi && nohup node scripts/scrape-engine.js > /tmp/jadomi-engine-output.log 2>&1 &');
        log('    Engine relancé');
      } catch (e) {
        log('    Engine relancement échoué: ' + e.message);
      }
      return true;

    case 'restart-pm2':
      log('    Restart PM2...');
      try {
        execSync('cd /home/ubuntu/jadomi && pm2 reload ecosystem.config.js 2>&1');
        log('    PM2 reloadé');
      } catch (e) {
        log('    PM2 reload échoué: ' + e.message);
      }
      return true;

    case 'clean-tmp':
      log('    Nettoyage /tmp...');
      try {
        // Remove old puppet profiles
        execSync('rm -rf /tmp/puppeteer_dev_profile-* 2>/dev/null');
        // Remove old log files > 100Mo
        execSync('find /tmp -name "*.log" -size +100M -delete 2>/dev/null');
        log('    /tmp nettoyé');
      } catch (e) {}
      return true;

    case 'reset-stale':
      log('    Reset des scrapers stagnants...');
      // This is handled by the engine's resetCrashedQueries
      return false;

    case 'warn':
    case 'warn-crossref':
      // Just log, no automatic fix
      return false;

    default:
      log('    Fix inconnu: ' + fix);
      return false;
  }
}

// =============================================
// RUN ONE AUDIT
// =============================================

async function runAudit() {
  const auditId = `audit-${Date.now()}`;
  log(`\n${'─'.repeat(50)}`);
  log(`🔍 AUDIT #${auditId}`);

  const checks = [
    { name: 'RAM', fn: checkRam },
    { name: 'Chrome zombies', fn: checkChromeZombies },
    { name: 'Scrapers vivants', fn: checkScrapersAlive },
    { name: 'Progression', fn: checkProgressStale },
    { name: 'Cross-ref', fn: checkCrossrefProgress },
    { name: 'Disque', fn: checkDiskSpace },
    { name: 'Serveur JADOMI', fn: checkServerAlive },
  ];

  const results = [];
  const issues = [];
  const fixes = [];

  for (const check of checks) {
    const result = check.fn();
    results.push({ name: check.name, ...result });

    if (result.ok) {
      log(`  ✅ ${check.name}: ${result.detail}`);
    } else {
      log(`  ❌ ${check.name}: ${result.issue}`);
      issues.push(`${check.name}: ${result.issue}`);
      if (result.fix && result.fix !== 'warn' && result.fix !== 'warn-crossref') {
        const fixed = applyFix(result.fix, result.issue);
        fixes.push({ check: check.name, fix: result.fix, applied: fixed });
      }
    }
  }

  // Product counts
  const counts = {};
  let total = 0;
  for (const f of fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json') && !f.includes('backup'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join('/tmp', f), 'utf8'));
      const p = d.products || {};
      const c = typeof p === 'object' && !Array.isArray(p) ? Object.keys(p).length : 0;
      if (c > 0) { const n = f.replace('search-progress-', '').replace('.json', ''); counts[n] = c; total += c; }
    } catch (e) {}
  }

  log(`  📊 Total produits: ${total}`);

  // Save history
  const history = loadHistory();
  history.audits.push({
    id: auditId,
    date: new Date().toISOString(),
    issues: issues.length,
    fixes: fixes.length,
    total,
    details: issues,
  });
  if (fixes.length > 0) {
    history.fixes.push(...fixes.map(f => ({ ...f, date: new Date().toISOString() })));
    history.totalFixes += fixes.length;
  }
  // Keep last 100 audits
  if (history.audits.length > 100) history.audits = history.audits.slice(-100);
  if (history.fixes.length > 200) history.fixes = history.fixes.slice(-200);
  saveHistory(history);

  // Send email if issues found
  if (issues.length > 0 || fixes.length > 0) {
    let html = `<h2>🔍 Audit Scraper</h2>`;
    html += `<p><b>${issues.length} problèmes</b> détectés, <b>${fixes.length} corrections</b> appliquées</p>`;

    if (issues.length > 0) {
      html += `<h3>Problèmes:</h3><ul>`;
      issues.forEach(i => html += `<li>${i}</li>`);
      html += `</ul>`;
    }

    if (fixes.length > 0) {
      html += `<h3>Corrections:</h3><ul>`;
      fixes.forEach(f => html += `<li>${f.check}: ${f.fix} (${f.applied ? '✅ appliqué' : '⚠️ manuel'})</li>`);
      html += `</ul>`;
    }

    // Product table
    html += `<h3>État produits:</h3><table border="1" cellpadding="4" style="border-collapse:collapse">`;
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => {
      html += `<tr><td>${n}</td><td><b>${c.toLocaleString()}</b></td></tr>`;
    });
    html += `<tr style="background:#16213e;color:white"><td><b>TOTAL</b></td><td><b>${total.toLocaleString()}</b></td></tr></table>`;

    try {
      await transporter.sendMail({
        from: 'JADOMI Auditor <noreply@jadomi.fr>',
        to: 'karim_bahmed@yahoo.fr',
        subject: `🔍 Audit: ${issues.length} problèmes, ${fixes.length} fixes — ${total.toLocaleString()} produits`,
        html,
      });
    } catch (e) {}
  }

  return { issues: issues.length, fixes: fixes.length, total };
}

// =============================================
// MAIN LOOP — audit toutes les 30 min
// =============================================

async function main() {
  if (process.argv.includes('--once')) {
    await runAudit();
    return;
  }

  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI SCRAPE AUDITOR — Surveillance auto  ║');
  log('╚══════════════════════════════════════════════╝');

  while (true) {
    try {
      const result = await runAudit();
      log(`Audit terminé: ${result.issues} problèmes, ${result.fixes} fixes, ${result.total} produits`);
    } catch (err) {
      log(`Audit erreur: ${err.message}`);
    }

    // Wait 30 min
    log(`💤 Prochain audit dans 30 min...\n`);
    await new Promise(r => setTimeout(r, 30 * 60 * 1000));
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
