#!/usr/bin/env node
// =============================================
// JADOMI — EQUIPE 6 : RÉCUPÉRATION
//
// Reprend TOUS les rejected + uncertain du pipeline de vérification
// et re-cherche sur Venta avec des requêtes plus précises.
//
// Stratégie :
//   1. Extraire la gamme produit exacte (ex: "RelyX Fiber Post", pas juste "tenons fibre")
//   2. Re-chercher sur Venta avec la gamme + marque
//   3. Parmi TOUS les résultats Venta, choisir celui dont :
//      a) Le nom de gamme correspond le mieux
//      b) Le conditionnement est compatible (coffret ≈ coffret)
//      c) Le prix est COHÉRENT (pas 10x ou 0.1x)
//   4. Repasser le nouveau match dans le pipeline de vérification
//
// Usage :
//   node scripts/recover-matches.js
//   node scripts/recover-matches.js --dry-run   (ne sauvegarde pas)
//   node scripts/recover-matches.js --email      (envoie le rapport)
// =============================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPORT_FILE = path.join(__dirname, '..', 'tmp', 'verification-report.json');
const VERIFIED_FILE = path.join(__dirname, '..', 'tmp', 'verified-matches.json');
const RECOVERY_FILE = path.join(__dirname, '..', 'tmp', 'recovery-results.json');
const FINAL_FILE = path.join(__dirname, '..', 'tmp', 'final-verified-matches.json');
const LOG_FILE = '/tmp/recover-matches.log';

const VENTA_API = 'https://www.doctorstrong.fr/search/ajax/suggest?q=';
const RATE_LIMIT_MS = 600;
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];
let uaIdx = 0;

// =============================================
// EXTRACTION GAMME PRODUIT (plus intelligent que cross-search V2)
// =============================================

function extractProductLine(name, brand) {
  // Nettoyer les entités HTML
  let clean = name.replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  // Enlever le conditionnement pour garder la GAMME
  clean = clean
    .replace(/\s*-\s*(Seringue|Flacon|Tube|Bo[iî]te|Coffret|Kit|Set|Pack|Lot|Recharge|Refill|Réassort|L[' ]|Le |La |Les |20 canules|15 embouts|50 capsules).*$/i, '')
    .replace(/\s*(Seringue|Flacon|Tube|Bo[iî]te|Coffret|Kit|Set|Pack|Lot|Recharge|Refill)(\s+de)?\s*[\d].*$/i, '')
    .replace(/\s*(\d+)\s*(seringues?|flacons?|tubes?|capsules?|blocs?|paires?|cartouches?).*$/i, '')
    .replace(/\s*Teinte\s+\w+.*$/i, '')    // Enlever la teinte
    .replace(/\s*(dentine|émail|universel|transparent|jaune|blanc|bleu|rose|rouge|gris)$/i, '')
    .replace(/\s*\([\d]+\)\s*$/i, '')       // (100) en fin
    .replace(/\s+/g, ' ')
    .trim();

  return clean;
}

// Construire plusieurs requêtes de recherche pour maximiser les chances
function buildRecoveryQueries(name, brand) {
  const productLine = extractProductLine(name, brand);
  const queries = [];

  // Query 1 : gamme exacte
  if (productLine.length >= 4) {
    queries.push(productLine.substring(0, 50));
  }

  // Query 2 : marque + premiers mots significatifs de la gamme
  if (brand) {
    const words = productLine.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
    if (words.length > 0) {
      queries.push((brand + ' ' + words.join(' ')).substring(0, 50));
    }
  }

  // Query 3 : marque + gamme courte (2 premiers mots)
  if (brand) {
    const shortLine = productLine.split(/\s+/).slice(0, 2).join(' ');
    if (shortLine.length >= 3 && !queries.some(q => q.toLowerCase().includes(shortLine.toLowerCase()))) {
      queries.push((brand + ' ' + shortLine).substring(0, 40));
    }
  }

  // Dédup
  const seen = new Set();
  return queries.filter(q => {
    const k = q.toLowerCase().trim();
    if (seen.has(k) || k.length < 4) return false;
    seen.add(k);
    return true;
  });
}

// =============================================
// RECHERCHE VENTA (enrichie)
// =============================================

function fetchVenta(query) {
  return new Promise((resolve, reject) => {
    const url = VENTA_API + encodeURIComponent(query);
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENTS[uaIdx++ % USER_AGENTS.length],
        'Accept': 'application/json',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode === 429 || res.statusCode === 403) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve([]); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function searchVentaEnriched(query) {
  const raw = await fetchVenta(query);
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(r => r.type === 'product' && r.entity_id)
    .map(r => {
      const name = Array.isArray(r.name) ? r.name[0] : r.name || '';
      const brand = r.option_text_marque?.[0] || '';
      const priceData = (r.price || []).find(p => p.customer_group_id === 0) || r.price?.[0] || {};
      const specialPrice = r.special_price?.[0] || null;
      const price = specialPrice || priceData.final_price || priceData.price || null;

      return {
        entityId: r.entity_id,
        name,
        brand,
        price: parseFloat(price) || 0,
        specialPrice: specialPrice ? parseFloat(specialPrice) : null,
        originalPrice: priceData.original_price ? parseFloat(priceData.original_price) : null,
        sku: (r.sku || [])[0] || '',
        codeFournisseur: (r.code_art_fournisseur || [])[0] || '',
        crossCodes: {
          code_drai: (r.code_drai || [])[0] || '',
          code_strong: (r.code_strong || [])[0] || '',
          code_mega: (r.code_mega || [])[0] || '',
        },
      };
    })
    .filter(p => p.price > 0);
}

// =============================================
// SCORING INTELLIGENT (pour choisir le BON candidat)
// =============================================

function norm(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(str) {
  return new Set(norm(str).split(' ').filter(w => w.length > 1));
}

// Mots qui indiquent un accessoire (pas le produit principal)
const ACCESSORY_WORDS = new Set([
  'embout', 'embouts', 'housse', 'housses', 'gaine', 'gaines', 'canule', 'canules',
  'protection', 'adaptateur', 'capuchon', 'bouchon', 'melangeur', 'melangeurs',
  'pinceau', 'pinceaux', 'manchon', 'pad', 'tray', 'applicateur',
]);

function isAccessory(name) {
  const words = wordSet(name);
  for (const w of ACCESSORY_WORDS) {
    if (words.has(w)) return true;
  }
  return false;
}

// Mots qui indiquent un conditionnement grand
const BIG_PACKAGING_WORDS = /coffret|kit|set|starter|assortiment|jumbo|intro|pack/i;
const REFILL_WORDS = /recharge|refill|reassort|r[ée]assort/i;

function scoreCandidateForGacd(gacdName, gacdBrand, gacdPrice, candidate) {
  let score = 0;
  const reasons = [];

  const gacdLine = norm(extractProductLine(gacdName, gacdBrand));
  const candLine = norm(extractProductLine(candidate.name, candidate.brand));

  // 1. Correspondance gamme produit (0-40 points)
  const gacdWords = wordSet(gacdLine);
  const candWords = wordSet(candLine);
  let matchCount = 0;
  for (const w of gacdWords) {
    if (candWords.has(w)) matchCount++;
    else {
      // Partial match
      for (const cw of candWords) {
        if (cw.length >= 4 && w.length >= 4 && (cw.includes(w) || w.includes(cw))) {
          matchCount += 0.6;
          break;
        }
      }
    }
  }
  const lineOverlap = gacdWords.size > 0 ? matchCount / gacdWords.size : 0;
  score += Math.round(lineOverlap * 40);
  if (lineOverlap >= 0.8) reasons.push('gamme_identique');
  else if (lineOverlap >= 0.5) reasons.push('gamme_similaire');
  else reasons.push('gamme_faible');

  // 2. Marque (0-20 points)
  const gacdBrandNorm = norm(gacdBrand);
  const candBrandNorm = norm(candidate.brand);
  const candNameNorm = norm(candidate.name);
  if (gacdBrandNorm && (candBrandNorm.includes(gacdBrandNorm) || gacdBrandNorm.includes(candBrandNorm) || candNameNorm.includes(gacdBrandNorm))) {
    score += 20;
    reasons.push('marque_ok');
  } else {
    reasons.push('marque_diff');
  }

  // 3. Cohérence prix (0-25 points) — LE CRITÈRE CLÉ
  if (gacdPrice > 0 && candidate.price > 0) {
    const ratio = candidate.price / gacdPrice;
    // Ratio idéal : entre 0.5 et 2.0 (écart max 2x)
    if (ratio >= 0.7 && ratio <= 1.4) {
      score += 25;
      reasons.push('prix_coherent');
    } else if (ratio >= 0.5 && ratio <= 2.0) {
      score += 15;
      reasons.push('prix_acceptable');
    } else if (ratio >= 0.3 && ratio <= 3.0) {
      score += 5;
      reasons.push('prix_ecart_notable');
    } else {
      score -= 15;
      reasons.push('prix_incoherent');
    }
  }

  // 4. Pénalité accessoire (si GACD = produit principal et candidat = accessoire)
  const gacdIsAcc = isAccessory(gacdName);
  const candIsAcc = isAccessory(candidate.name);
  if (!gacdIsAcc && candIsAcc) {
    score -= 30;
    reasons.push('candidat_est_accessoire');
  }
  if (gacdIsAcc && !candIsAcc) {
    score -= 30;
    reasons.push('gacd_est_accessoire');
  }

  // 5. Bonus conditionnement similaire
  const gacdIsBig = BIG_PACKAGING_WORDS.test(gacdName);
  const candIsBig = BIG_PACKAGING_WORDS.test(candidate.name);
  const gacdIsRefill = REFILL_WORDS.test(gacdName);
  const candIsRefill = REFILL_WORDS.test(candidate.name);

  if (gacdIsBig && candIsBig) { score += 10; reasons.push('conditionnement_similar'); }
  if (gacdIsRefill && candIsRefill) { score += 10; reasons.push('conditionnement_similar'); }
  if (gacdIsBig && candIsRefill) { score -= 10; reasons.push('coffret_vs_refill'); }

  // 6. Bonus si même entité déjà vue (dédup cross-query)
  // (géré dans la boucle principale)

  return { score: Math.max(0, score), reasons };
}

// =============================================
// VERIFICATION DU MATCH RÉCUPÉRÉ (mini-pipeline)
// =============================================

function verifyRecoveredMatch(gacdName, gacdBrand, gacdPrice, candidate, scoreResult) {
  const ventaPrice = candidate.price;
  const diffPct = gacdPrice > 0 ? ((ventaPrice - gacdPrice) / gacdPrice * 100) : 0;

  let status, confidence;

  if (scoreResult.score >= 70 && Math.abs(diffPct) <= 25) {
    status = 'verified'; confidence = 95;
  } else if (scoreResult.score >= 60 && Math.abs(diffPct) <= 35) {
    status = 'verified'; confidence = 85;
  } else if (scoreResult.score >= 50 && Math.abs(diffPct) <= 40) {
    status = 'probable'; confidence = 70;
  } else if (scoreResult.score >= 45 && Math.abs(diffPct) <= 50) {
    status = 'probable'; confidence = 55;
  } else if (scoreResult.score >= 40) {
    status = 'uncertain'; confidence = 40;
  } else {
    status = 'rejected'; confidence = 10;
  }

  return {
    status,
    confidence,
    priceDiffPct: parseFloat(diffPct.toFixed(1)),
    recoveryScore: scoreResult.score,
    reasons: scoreResult.reasons,
  };
}

// =============================================
// MAIN
// =============================================

async function main() {
  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║  JADOMI — EQUIPE 6 : RÉCUPÉRATION                          ║');
  log('║  Re-cherche les produits sur Venta avec requêtes précises   ║');
  log('╚═══════════════════════════════════════════════════════════════╝');

  if (!fs.existsSync(REPORT_FILE)) {
    log('ERREUR: Lancer d\'abord verify-matches-pipeline.js');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const toRecover = [...report.rejected, ...report.uncertain];
  log(`À récupérer: ${toRecover.length} (${report.rejected.length} rejected + ${report.uncertain.length} uncertain)`);

  // Charger aussi les verified existants pour le merge final
  let verifiedData = { verified: [], probable: [] };
  if (fs.existsSync(VERIFIED_FILE)) {
    verifiedData = JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf8'));
  }

  const results = {
    recovered_verified: [],
    recovered_probable: [],
    still_uncertain: [],
    confirmed_rejected: [],
    not_found: [],
    stats: {
      total: toRecover.length,
      recovered: 0,
      still_uncertain: 0,
      confirmed_rejected: 0,
      not_found: 0,
      api_errors: 0,
    },
  };

  const startTime = Date.now();
  let processed = 0;

  for (const item of toRecover) {
    processed++;
    const gacdName = item.gacd.name;
    const gacdBrand = item.gacd.brand;
    const gacdPrice = item.gacd.price;
    const gacdRef = item.gacd.ref;

    // Construire les requêtes de récupération
    const queries = buildRecoveryQueries(gacdName, gacdBrand);

    if (queries.length === 0) {
      results.not_found.push({ ...item, recovery_note: 'Aucune requête constructible' });
      results.stats.not_found++;
      continue;
    }

    // Chercher sur Venta avec chaque requête
    const allCandidates = new Map(); // entityId -> candidate + score

    for (const query of queries) {
      try {
        const ventaProducts = await searchVentaEnriched(query);

        for (const candidate of ventaProducts) {
          // Si déjà vu avec meilleur score, skip
          const existing = allCandidates.get(candidate.entityId);
          const scoreResult = scoreCandidateForGacd(gacdName, gacdBrand, gacdPrice, candidate);

          if (!existing || scoreResult.score > existing.scoreResult.score) {
            allCandidates.set(candidate.entityId, { candidate, scoreResult, query });
          }
        }

        await sleep(RATE_LIMIT_MS);
      } catch (err) {
        results.stats.api_errors++;
        if (err.message.includes('429')) {
          log(`  Rate limited, pause 30s...`);
          await sleep(30000);
        }
      }
    }

    // Choisir le MEILLEUR candidat
    let bestEntry = null;
    let bestScore = -Infinity;

    for (const [, entry] of allCandidates) {
      if (entry.scoreResult.score > bestScore) {
        bestScore = entry.scoreResult.score;
        bestEntry = entry;
      }
    }

    if (!bestEntry || bestScore < 25) {
      results.not_found.push({
        ...item,
        recovery_note: `${allCandidates.size} candidats trouvés, meilleur score = ${bestScore}`,
        queries_tried: queries,
      });
      results.stats.not_found++;
    } else {
      // Vérifier le match récupéré
      const verification = verifyRecoveredMatch(gacdName, gacdBrand, gacdPrice, bestEntry.candidate, bestEntry.scoreResult);

      const recoveredEntry = {
        gacd: item.gacd,
        venta: {
          name: bestEntry.candidate.name,
          brand: bestEntry.candidate.brand,
          price: bestEntry.candidate.price,
          specialPrice: bestEntry.candidate.specialPrice,
          sku: bestEntry.candidate.sku,
          codeFournisseur: bestEntry.candidate.codeFournisseur,
          crossCodes: bestEntry.candidate.crossCodes,
        },
        priceDiff: verification.priceDiffPct,
        confidence: verification.confidence,
        status: verification.status,
        reasons: verification.reasons,
        recovery: {
          query: bestEntry.query,
          candidatesFound: allCandidates.size,
          originalStatus: item.gacd.ref === gacdRef ? 'was_rejected_or_uncertain' : 'unknown',
          previousMatch: item.venta ? item.venta.name : null,
          previousPrice: item.venta ? item.venta.price : null,
        },
      };

      switch (verification.status) {
        case 'verified':
          results.recovered_verified.push(recoveredEntry);
          results.stats.recovered++;
          break;
        case 'probable':
          results.recovered_probable.push(recoveredEntry);
          results.stats.recovered++;
          break;
        case 'uncertain':
          results.still_uncertain.push(recoveredEntry);
          results.stats.still_uncertain++;
          break;
        case 'rejected':
          results.confirmed_rejected.push(recoveredEntry);
          results.stats.confirmed_rejected++;
          break;
      }
    }

    // Log progression
    if (processed % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(2);
      const eta = rate > 0 ? (((toRecover.length - processed) / rate) / 60).toFixed(1) : '?';
      log(`[${processed}/${toRecover.length}] Récupérés: ${results.stats.recovered} | Incertains: ${results.stats.still_uncertain} | Non trouvés: ${results.stats.not_found} | ${elapsed}min | ~${eta}min restantes`);
    }
  }

  // ── MERGE FINAL ──

  const finalVerified = [
    ...(verifiedData.verified || []),
    ...results.recovered_verified,
  ];
  const finalProbable = [
    ...(verifiedData.probable || []),
    ...results.recovered_probable,
  ];

  const finalResult = {
    generated: new Date().toISOString(),
    stats: {
      original_verified: (verifiedData.verified || []).length,
      original_probable: (verifiedData.probable || []).length,
      recovered_verified: results.recovered_verified.length,
      recovered_probable: results.recovered_probable.length,
      still_uncertain: results.still_uncertain.length,
      confirmed_rejected: results.confirmed_rejected.length,
      not_found: results.not_found.length,
      total_verified: finalVerified.length,
      total_probable: finalProbable.length,
      total_fiable: finalVerified.length + finalProbable.length,
    },
    verified: finalVerified,
    probable: finalProbable,
  };

  // Sauvegarder
  if (!DRY_RUN) {
    fs.writeFileSync(FINAL_FILE, JSON.stringify(finalResult, null, 2));
    fs.writeFileSync(RECOVERY_FILE, JSON.stringify(results, null, 2));
    log(`Fichier final: ${FINAL_FILE}`);
    log(`Détail récupération: ${RECOVERY_FILE}`);
  }

  // ── RAPPORT ──

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  log('\n═══════════════════════════════════════════════════════════');
  log('RÉCUPÉRATION TERMINÉE en ' + elapsed + ' min');
  log('═══════════════════════════════════════════════════════════');
  log(`Traités:              ${results.stats.total}`);
  log(`Récupérés (verified): ${results.recovered_verified.length}`);
  log(`Récupérés (probable): ${results.recovered_probable.length}`);
  log(`Toujours incertains:  ${results.stats.still_uncertain}`);
  log(`Rejetés confirmés:    ${results.stats.confirmed_rejected}`);
  log(`Non trouvés:          ${results.stats.not_found}`);
  log(`Erreurs API:          ${results.stats.api_errors}`);
  log('');
  log('═══ BILAN FINAL (pipeline + récupération) ═══');
  log(`VERIFIED:  ${finalResult.stats.total_verified} (${finalResult.stats.original_verified} originaux + ${finalResult.stats.recovered_verified} récupérés)`);
  log(`PROBABLE:  ${finalResult.stats.total_probable} (${finalResult.stats.original_probable} originaux + ${finalResult.stats.recovered_probable} récupérés)`);
  log(`TOTAL FIABLE: ${finalResult.stats.total_fiable}`);
  log('═══════════════════════════════════════════════════════════');

  // Afficher les meilleures récupérations
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TOP 30 PRODUITS RÉCUPÉRÉS (avant: faux match, après: bon)   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const allRecovered = [...results.recovered_verified, ...results.recovered_probable]
    .sort((a, b) => a.priceDiff - b.priceDiff);

  for (const r of allRecovered.slice(0, 30)) {
    const tag = r.status === 'verified' ? 'VERIFIED' : 'PROBABLE';
    console.log(`  ${tag} | ${r.priceDiff}% | Confiance: ${r.confidence}%`);
    console.log(`    GACD: ${r.gacd.name} = ${r.gacd.price}€`);
    console.log(`    AVANT: ${r.recovery.previousMatch} = ${r.recovery.previousPrice}€ (FAUX)`);
    console.log(`    APRÈS: ${r.venta.name} = ${r.venta.price}€ (CORRECT)`);
    console.log(`    Query: "${r.recovery.query}" | ${r.recovery.candidatesFound} candidats`);
    console.log('');
  }

  // Email
  if (process.argv.includes('--email')) {
    await sendRecoveryEmail(finalResult, results);
  }
}

// ── EMAIL ──

async function sendRecoveryEmail(finalResult, recoveryResults) {
  try {
    const nodemailer = require('nodemailer');

    const allRecovered = [...recoveryResults.recovered_verified, ...recoveryResults.recovered_probable]
      .sort((a, b) => a.priceDiff - b.priceDiff)
      .slice(0, 30);

    const rows = allRecovered.map(r => {
      const tag = r.status === 'verified' ? '✓' : '~';
      return `<tr>
        <td style="padding:4px;border-bottom:1px solid #222;">${tag}</td>
        <td style="padding:4px;border-bottom:1px solid #222;font-size:11px;">${r.gacd.name}</td>
        <td style="padding:4px;border-bottom:1px solid #222;">${r.gacd.price}€</td>
        <td style="padding:4px;border-bottom:1px solid #222;font-size:11px;">${r.venta.name}</td>
        <td style="padding:4px;border-bottom:1px solid #222;">${r.venta.price}€</td>
        <td style="padding:4px;border-bottom:1px solid #222;color:${r.priceDiff < 0 ? '#22c55e' : '#ef4444'};font-weight:bold;">${r.priceDiff}%</td>
        <td style="padding:4px;border-bottom:1px solid #222;">${r.confidence}%</td>
      </tr>`;
    }).join('');

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:900px;margin:0 auto;background:#0a0a0f;color:#e5e5e5;padding:32px;border-radius:16px;">
        <h1 style="color:#0d9488;font-size:24px;">JADOMI — Récupération Matches Prix</h1>
        <p style="color:#737373;">Pipeline complet (5 équipes + récupération) — ${new Date().toLocaleDateString('fr-FR')}</p>

        <div style="display:flex;gap:12px;margin:20px 0;flex-wrap:wrap;">
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:140px;text-align:center;">
            <div style="color:#22c55e;font-size:28px;font-weight:bold;">${finalResult.stats.total_verified}</div>
            <div style="color:#737373;font-size:12px;">Vérifiés</div>
          </div>
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:140px;text-align:center;">
            <div style="color:#3b82f6;font-size:28px;font-weight:bold;">${finalResult.stats.total_probable}</div>
            <div style="color:#737373;font-size:12px;">Probables</div>
          </div>
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:140px;text-align:center;">
            <div style="color:#0d9488;font-size:28px;font-weight:bold;">${finalResult.stats.total_fiable}</div>
            <div style="color:#737373;font-size:12px;">Total fiable</div>
          </div>
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;min-width:140px;text-align:center;">
            <div style="color:#f59e0b;font-size:28px;font-weight:bold;">${recoveryResults.stats.recovered}</div>
            <div style="color:#737373;font-size:12px;">Récupérés</div>
          </div>
        </div>

        <div style="background:#16161f;border-radius:12px;padding:20px;margin:16px 0;">
          <h3 style="color:#fff;margin-top:0;">Top 30 produits récupérés</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr style="color:#737373;">
              <th style="text-align:left;padding:4px;">OK</th>
              <th style="text-align:left;padding:4px;">GACD</th>
              <th style="padding:4px;">Prix GACD</th>
              <th style="text-align:left;padding:4px;">Venta (CORRIGÉ)</th>
              <th style="padding:4px;">Prix Venta</th>
              <th style="padding:4px;">Écart</th>
              <th style="padding:4px;">Conf.</th>
            </tr>
            ${rows}
          </table>
        </div>

        <p style="color:#525252;font-size:11px;margin-top:24px;">
          JADOMI Pipeline — ${finalResult.stats.total_fiable} matches fiables sur ${recoveryResults.stats.total + (finalResult.stats.original_verified || 0) + (finalResult.stats.original_probable || 0)} analysés
        </p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: '"JADOMI Prix" <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject: `JADOMI Récupération — ${finalResult.stats.total_fiable} matches fiables (${recoveryResults.stats.recovered} récupérés)`,
      html,
    });

    log('[EMAIL] Rapport récupération envoyé');
  } catch (e) {
    log('[EMAIL] Erreur: ' + e.message);
  }
}

main().catch(err => {
  log('ERREUR FATALE: ' + err.message);
  log(err.stack);
  process.exit(1);
});
