#!/usr/bin/env node
// =============================================
// JADOMI — DeepSeek Quality Controller
//
// Surveille le fichier progress des scrapers Puppeteer
// et nettoie les données en temps réel par batch.
//
// DeepSeek vérifie :
//   - Nom produit propre (pas de HTML/prix dans le nom)
//   - Marque correcte
//   - Catégorie dentaire
//   - Prix cohérent (pas aberrant)
//   - Détection doublons avec noms légèrement différents
//
// Usage:
//   node scripts/deepseek-quality-control.js /tmp/henryschein-parallel-progress.json
//   node scripts/deepseek-quality-control.js /tmp/henryschein-parallel-progress.json --live
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const BATCH_SIZE = 50;
const LOG_FILE = '/tmp/jadomi-quality-control.log';
const QC_PROGRESS_FILE = '/tmp/jadomi-qc-progress.json';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function callDeepSeek(prompt, content) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: content },
      ],
      temperature: 0.1,
      max_tokens: 6000,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      timeout: 30000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

const QC_PROMPT = `Tu es un contrôleur qualité expert en produits dentaires.
Pour chaque produit, vérifie et corrige :

1. cleaned_name : nom PROPRE (retire HTML, prix parasites, caractères spéciaux, nom fournisseur). Garde désignation + conditionnement.
2. brand : marque CORRECTE (corrige : "3m" → "3M", "gc" → "GC", "ivoclar" → "Ivoclar Vivadent", "dentsply" → "Dentsply Sirona")
3. category : UNE SEULE parmi : endodontie, restauration, empreinte, prothese, implantologie, chirurgie, orthodontie, prophylaxie, radiologie, anesthesie, instruments, consommables, equipement, hygiene, labo
4. price_ok : true si le prix semble cohérent pour ce type de produit, false si aberrant
5. duplicate_of : si ce produit est un doublon évident d'un autre dans la liste, mettre l'index de l'original. Sinon null.

Retourne UNIQUEMENT un JSON : {"results": [{"index": 1, "cleaned_name": "...", "brand": "...", "category": "...", "price_ok": true, "duplicate_of": null}]}`;

async function processProgressFile(progressFile, liveMode) {
  log(`=== DEEPSEEK QUALITY CONTROLLER ===`);
  log(`Source: ${progressFile}`);
  log(`Mode: ${liveMode ? 'LIVE (surveille en continu)' : 'ONE-SHOT'}`);

  let qcProgress = {};
  try { qcProgress = JSON.parse(fs.readFileSync(QC_PROGRESS_FILE, 'utf8')); } catch {}
  const processedKeys = new Set(qcProgress.processedKeys || []);

  let totalProcessed = 0;
  let totalCleaned = 0;
  let totalDuplicates = 0;
  let totalPriceIssues = 0;
  let passes = 0;

  const doPass = async () => {
    // Charger le fichier progress du scraper
    let data;
    try { data = JSON.parse(fs.readFileSync(progressFile, 'utf8')); }
    catch { log('  Fichier progress non trouvé ou invalide'); return false; }

    const products = data.products || {};
    const keys = Object.keys(products).filter(k => !processedKeys.has(k));

    if (keys.length === 0) {
      if (liveMode) return true; // Continue à surveiller
      log('  Aucun nouveau produit à contrôler');
      return false;
    }

    log(`  ${keys.length} nouveaux produits à contrôler`);

    // Traiter par batch
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batchKeys = keys.slice(i, i + BATCH_SIZE);
      const batch = batchKeys.map(k => products[k]);

      const content = batch.map((p, idx) =>
        `${idx + 1}. "${(p.name || '').substring(0, 80)}" | prix: ${p.priceText || '?'} | ref: ${p.ref || '?'}`
      ).join('\n');

      const response = await callDeepSeek(QC_PROMPT, content);
      if (!response) { log('  DeepSeek erreur, skip batch'); continue; }

      let results = [];
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) results = JSON.parse(jsonMatch[0]).results || [];
      } catch { continue; }

      // Appliquer les corrections au fichier progress
      let batchCleaned = 0;
      let batchDupes = 0;
      let batchPriceIssues = 0;

      for (const r of results) {
        const idx = (r.index || 1) - 1;
        const key = batchKeys[idx];
        if (!key || !products[key]) continue;

        if (r.cleaned_name && r.cleaned_name !== products[key].name) {
          products[key].name = r.cleaned_name;
          batchCleaned++;
        }
        if (r.brand) products[key].brand = r.brand;
        if (r.category) products[key].category_qc = r.category;
        if (r.price_ok === false) { products[key].price_suspect = true; batchPriceIssues++; }
        if (r.duplicate_of !== null && r.duplicate_of !== undefined) {
          products[key].is_duplicate = true;
          batchDupes++;
        }

        processedKeys.add(key);
      }

      totalProcessed += batchKeys.length;
      totalCleaned += batchCleaned;
      totalDuplicates += batchDupes;
      totalPriceIssues += batchPriceIssues;

      log(`  [${i}-${i + batchKeys.length}] ${results.length} contrôlés: ${batchCleaned} nettoyés, ${batchDupes} doublons, ${batchPriceIssues} prix suspects`);
    }

    // Sauvegarder les corrections dans le fichier progress
    data.products = products;
    data.qc = {
      lastRun: new Date().toISOString(),
      totalProcessed,
      totalCleaned,
      totalDuplicates,
      totalPriceIssues,
    };
    fs.writeFileSync(progressFile, JSON.stringify(data));

    // Sauvegarder la progression QC
    qcProgress.processedKeys = [...processedKeys];
    qcProgress.stats = { totalProcessed, totalCleaned, totalDuplicates, totalPriceIssues };
    fs.writeFileSync(QC_PROGRESS_FILE, JSON.stringify(qcProgress));

    return true;
  };

  if (liveMode) {
    // Mode live : surveille toutes les 30s
    log('  Surveillance en continu (toutes les 30s)...');
    while (true) {
      await doPass();
      passes++;
      if (passes % 5 === 0) {
        log(`  --- Bilan intermédiaire: ${totalProcessed} contrôlés, ${totalCleaned} nettoyés, ${totalDuplicates} doublons ---`);
      }

      // Vérifier si le scraper a terminé
      try {
        const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        const allDone = data.completedKeywords?.length >= 240; // ~tous les mots-clés
        if (allDone && Object.keys(data.products || {}).length === processedKeys.size) {
          log('  Scraper terminé + tout contrôlé → stop');
          break;
        }
      } catch {}

      await new Promise(r => setTimeout(r, 30000));
    }
  } else {
    await doPass();
  }

  log(`\n=== BILAN QUALITY CONTROL ===`);
  log(`Produits contrôlés: ${totalProcessed}`);
  log(`Noms nettoyés: ${totalCleaned}`);
  log(`Doublons détectés: ${totalDuplicates}`);
  log(`Prix suspects: ${totalPriceIssues}`);
}

// CLI
const args = process.argv.slice(2);
const progressFile = args.find(a => !a.startsWith('--')) || '/tmp/henryschein-parallel-progress.json';
const liveMode = args.includes('--live');

processProgressFile(progressFile, liveMode).catch(err => {
  console.error('ERREUR:', err);
  process.exit(1);
});
