#!/usr/bin/env node
// =============================================
// JADOMI — Orchestrateur séquentiel de scrapers
// Lance les scrapers UN par UN pour éviter la saturation RAM
// Usage: node scrape-orchestrator.js
//        node scrape-orchestrator.js --sites dentalclick,dpidental
//        node scrape-orchestrator.js --remaining   (sites pas encore scrapés)
// =============================================

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname);

// Sites à exclure (pas e-commerce ou cassés)
const EXCLUDED = new Set([
  'dbidental',        // WordPress vitrine, pas e-commerce
  'dentalpromotion',  // Drupal corporate, pas e-commerce
  // Fabricants (pas de prix distributeurs)
  'septodont', 'biotech-dental', 'bienair', 'coltene', 'hu-friedy',
  'ivoclar', 'kerrdental', 'nsk-dental', 'kulzer', 'voco', 'zhermack',
  'nobelbiocare', 'planmeca', 'straumann', 'solventum', 'zeiss-meditec',
  // Loupes/microscopes (pas dentaire consommable)
  'global-surgical', 'surgitel', 'designs-for-vision', 'orascoptic',
]);

// Sites qui ne fonctionnent PAS avec la recherche (besoin approche spéciale)
const SEARCH_BROKEN = new Set([
  'dentalgooddeal',   // 404 sur la recherche, besoin scraping par catégorie
]);

// Ordre de priorité (gros catalogues en premier)
const PRIORITY_ORDER = [
  // Pas encore scrapés — gros potentiel
  'dentalclick', 'dpidental', 'dental-express', 'dental-services',
  'promodentaire', 'discount-dentaire', 'dental-france',
  'dentaltix', 'omniumdentaire',
  // Protected/custom — tenter quand même
  'gacd', 'henryschein',
  // Déjà terminés — re-run si on veut
  'doctorai', 'doctorstrong', 'b2b-dental', 'megadental',
  'dentalprive', 'dentalachat', 'godentaire', 'topdentaire',
  'dentalevolution',
];

function getCompletedSites() {
  const completed = new Map();
  const progressFiles = fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json'));

  for (const file of progressFiles) {
    const siteName = file.replace('search-progress-', '').replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join('/tmp', file), 'utf8'));
      const productCount = data.products ? Object.keys(data.products).length : 0;
      const queryCount = data.completedQueries ? data.completedQueries.length : 0;
      completed.set(siteName, { productCount, queryCount });
    } catch (e) {
      // Corrupted file
    }
  }
  return completed;
}

function getRemainingQueries(siteName, siteType) {
  const progressPath = `/tmp/search-progress-${siteName}.json`;
  if (!fs.existsSync(progressPath)) return Infinity; // Not started

  try {
    const data = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    const completed = data.completedQueries ? data.completedQueries.length : 0;
    // Magento: ~130 queries, PrestaShop: ~840 queries
    const total = (siteType === 'magento') ? 164 : 840;
    return total - completed;
  } catch (e) {
    return Infinity;
  }
}

function runScraper(siteName, mode = 'full') {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 LANCEMENT: ${siteName} (mode: ${mode})`);
    console.log(`   Heure: ${new Date().toLocaleTimeString('fr-FR')}`);
    console.log(`${'='.repeat(60)}`);

    // Check RAM before starting
    try {
      const memInfo = execSync('free -m').toString();
      const match = memInfo.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
      if (match) {
        const total = parseInt(match[1]);
        const used = parseInt(match[2]);
        const pctUsed = Math.round(used / total * 100);
        console.log(`   RAM: ${used}/${total} Mo (${pctUsed}%)`);

        if (pctUsed > 85) {
          console.log(`   ⚠️ RAM trop haute (${pctUsed}%). Attente 10s pour libération...`);
          execSync('sleep 10');
        }
      }
    } catch (e) {}

    const args = ['scrape-by-search.js', '--site', siteName];
    if (mode !== 'full') args.push('--' + mode);

    const proc = spawn('node', args, {
      cwd: SCRIPTS_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });

    let lastLog = '';

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        // Only show progress lines, not every single query
        if (line.includes('Progression:') || line.includes('IMPORT') ||
            line.includes('FIN SCRAPE') || line.includes('DEBUT SCRAPE') ||
            line.includes('ERREUR FATALE') || line.includes('Total produits')) {
          console.log(`   ${line.trim()}`);
          lastLog = line;
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text && !text.includes('ExperimentalWarning') && !text.includes('DeprecationWarning')) {
        console.log(`   [ERR] ${text.substring(0, 200)}`);
      }
    });

    proc.on('close', (code) => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;

      // Check results
      let products = 0;
      try {
        const progress = JSON.parse(fs.readFileSync(`/tmp/search-progress-${siteName}.json`, 'utf8'));
        products = progress.products ? Object.keys(progress.products).length : 0;
      } catch (e) {}

      console.log(`\n   ✅ ${siteName} TERMINE en ${mins}m${secs}s — ${products} produits`);
      console.log(`   Code sortie: ${code}`);

      // Kill any leftover Chrome
      try { execSync('pkill -f "chrome.*puppeteer" 2>/dev/null || true'); } catch (e) {}

      resolve({ siteName, products, elapsed, code });
    });

    proc.on('error', (err) => {
      console.log(`   ❌ ERREUR lancement ${siteName}: ${err.message}`);
      reject(err);
    });

    // Safety timeout: 30 minutes per site max
    setTimeout(() => {
      console.log(`   ⏰ TIMEOUT 30min pour ${siteName}, kill...`);
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }, 30 * 60 * 1000);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let sitesToRun = [];

  if (args.includes('--remaining')) {
    // Only run sites that haven't been scraped yet
    const completed = getCompletedSites();
    sitesToRun = PRIORITY_ORDER.filter(s =>
      !EXCLUDED.has(s) &&
      !SEARCH_BROKEN.has(s) &&
      !completed.has(s)
    );
  } else if (args.includes('--sites')) {
    const idx = args.indexOf('--sites');
    sitesToRun = args[idx + 1].split(',').filter(s => !EXCLUDED.has(s));
  } else if (args.includes('--all')) {
    sitesToRun = PRIORITY_ORDER.filter(s => !EXCLUDED.has(s) && !SEARCH_BROKEN.has(s));
  } else {
    // Default: run remaining sites
    const completed = getCompletedSites();
    sitesToRun = PRIORITY_ORDER.filter(s =>
      !EXCLUDED.has(s) &&
      !SEARCH_BROKEN.has(s) &&
      !completed.has(s)
    );
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        JADOMI — Orchestrateur Séquentiel               ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║ Sites à scraper: ${sitesToRun.length.toString().padEnd(39)}║`);
  console.log(`║ Mode: séquentiel (1 navigateur à la fois)              ║`);
  console.log(`║ RAM max: ~500 Mo par scraper                           ║`);
  console.log(`║ Timeout: 30 min par site                               ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\nSites:', sitesToRun.join(', '));

  const results = [];
  const startTotal = Date.now();

  for (let i = 0; i < sitesToRun.length; i++) {
    const site = sitesToRun[i];
    console.log(`\n[${ i + 1}/${sitesToRun.length}] ${site}...`);

    try {
      const result = await runScraper(site);
      results.push(result);
    } catch (err) {
      console.log(`❌ ${site} a échoué: ${err.message}`);
      results.push({ siteName: site, products: 0, elapsed: 0, code: 1 });
    }

    // Small pause between sites for Chrome cleanup
    await new Promise(r => setTimeout(r, 3000));
  }

  // Final report
  const totalElapsed = Math.round((Date.now() - startTotal) / 1000);
  const totalMins = Math.floor(totalElapsed / 60);

  console.log('\n' + '═'.repeat(60));
  console.log('           RAPPORT FINAL — ORCHESTRATEUR');
  console.log('═'.repeat(60));

  let grandTotal = 0;
  for (const r of results) {
    const status = r.code === 0 ? '✅' : '⚠️';
    console.log(`  ${status} ${r.siteName.padEnd(25)} ${String(r.products).padStart(6)} produits  (${Math.floor(r.elapsed/60)}m${r.elapsed%60}s)`);
    grandTotal += r.products;
  }

  // Add existing progress from previously completed sites
  const completed = getCompletedSites();
  let existingTotal = 0;
  console.log('\n  Sites déjà terminés:');
  for (const [name, info] of completed) {
    if (!sitesToRun.includes(name) && !EXCLUDED.has(name)) {
      console.log(`  📦 ${name.padEnd(25)} ${String(info.productCount).padStart(6)} produits`);
      existingTotal += info.productCount;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`  Nouveaux:   ${grandTotal} produits`);
  console.log(`  Existants:  ${existingTotal} produits`);
  console.log(`  GRAND TOTAL: ${grandTotal + existingTotal} produits`);
  console.log(`  Durée totale: ${totalMins}m`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('Erreur fatale orchestrateur:', err);
  process.exit(1);
});
