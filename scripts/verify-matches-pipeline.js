#!/usr/bin/env node
// =============================================
// JADOMI — PIPELINE DE VÉRIFICATION DES MATCHES PRIX
//
// Architecture 5 équipes en cascade :
//   1. NORMALISATEURS  → structurent chaque produit (marque, gamme, conditionnement, quantité, type)
//   2. MATCHERS        → ré-évaluent chaque association avec les données structurées
//   3. CONTRÔLEURS     → premier filtre (règles métier dentaire)
//   4. EXPERTS         → ré-analysent les uncertain + rejected (calcul prix/unité, sous-refs)
//   5. RAPPORT         → résultat final propre, uniquement du fiable
//
// Usage :
//   node scripts/verify-matches-pipeline.js
//   node scripts/verify-matches-pipeline.js --report
//   node scripts/verify-matches-pipeline.js --email
// =============================================

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, '..', 'tmp', 'cross-search-v2-results.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'tmp', 'verified-matches.json');
const REPORT_FILE = path.join(__dirname, '..', 'tmp', 'verification-report.json');
const LOG_FILE = '/tmp/verify-matches-pipeline.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// EQUIPE 1 : NORMALISATEURS
// Extraient la structure réelle de chaque nom produit
// =============================================

const NORMALIZER = {
  // Conditionnements reconnus (du plus grand au plus petit)
  PACKAGING_PATTERNS: [
    // Coffrets / Kits / Sets
    { regex: /coffret\s*(de\s*)?\d*/i, type: 'coffret' },
    { regex: /kit\s*(de\s*)?\w*/i, type: 'coffret' },
    { regex: /set\s*(de\s*)?\w*/i, type: 'coffret' },
    { regex: /starter\s*kit/i, type: 'coffret' },
    { regex: /assortiment/i, type: 'coffret' },
    { regex: /intro(duction)?/i, type: 'coffret' },
    { regex: /bo[iî]te?\s*d['']?(intro|essai)/i, type: 'coffret' },
    // Packs / Lots
    { regex: /pack\s*(de\s*)?\d+/i, type: 'lot' },
    { regex: /lot\s*(de\s*)?\d+/i, type: 'lot' },
    { regex: /bo[iî]te?\s*triple/i, type: 'lot', multiplier: 3 },
    { regex: /(\d+)\s*x\s*\d+/i, type: 'lot' },
    // Recharges / Refills
    { regex: /r[eé](assort|charge|fill)/i, type: 'recharge' },
    { regex: /refill/i, type: 'recharge' },
    // Unitaire
    { regex: /seringue\s*(de\s*)?[\d,.]+\s*(g|ml)/i, type: 'unitaire' },
    { regex: /tube\s*(de\s*)?[\d,.]+\s*(g|ml)/i, type: 'unitaire' },
    { regex: /flacon\s*(de\s*)?[\d,.]+\s*(g|ml)/i, type: 'unitaire' },
    { regex: /cartouche/i, type: 'unitaire' },
    { regex: /capsule/i, type: 'unitaire' },
  ],

  // Accessoires / Consommables (PAS le produit principal)
  ACCESSORY_PATTERNS: [
    /embout(s)?\s*(de\s*)?m[eé]lang/i,
    /embout(s)?\s*jetable/i,
    /housse(s)?\s*(de\s*)?protection/i,
    /gaine(s)?\s*(de\s*)?protection/i,
    /canule(s)?(\s+\w+)?\s*(refill|recharge)?/i,
    /adaptateur/i,
    /capuchon/i,
    /bouchon/i,
    /couvercle/i,
    /support\s*(pour|de)/i,
    /protection\s*(pour|de)/i,
    /manchon/i,
    /pinceau/i,
    /bonding\s*pad/i,
    /tray\s*(de\s*)?(cristallisation|crystallization)/i,
  ],

  // Extraction de quantité depuis le nom
  QUANTITY_PATTERNS: [
    // "3 seringues de 9 g" → qty=3, unit_size=9g
    { regex: /(\d+)\s*seringues?\s*(de\s*)?([\d,.]+)\s*(g|ml|gr)/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: parseFloat(m[3].replace(',','.')), unitMeasure: m[4] }) },
    // "Seringue de 3 g" → qty=1, unit_size=3g
    { regex: /seringue\s*(de\s*)?([\d,.]+)\s*(g|ml|gr)/i, extract: (m) => ({ qty: 1, unitSize: parseFloat(m[2].replace(',','.')), unitMeasure: m[3] }) },
    // "2 flacons de 5 g"
    { regex: /(\d+)\s*flacons?\s*(de\s*)?([\d,.]+)\s*(g|ml)/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: parseFloat(m[3].replace(',','.')), unitMeasure: m[4] }) },
    // "Flacon de 5 g"
    { regex: /flacon\s*(de\s*)?([\d,.]+)\s*(g|ml)/i, extract: (m) => ({ qty: 1, unitSize: parseFloat(m[2].replace(',','.')), unitMeasure: m[3] }) },
    // "Tube de 7 G"
    { regex: /tube\s*(de\s*)?([\d,.]+)\s*(g|ml)/i, extract: (m) => ({ qty: 1, unitSize: parseFloat(m[2].replace(',','.')), unitMeasure: m[3] }) },
    // "Boîte de 100"
    { regex: /bo[iî]te?\s*(de\s*)?(\d+)(?!\s*(g|ml|mm))/i, extract: (m) => ({ qty: parseInt(m[2]), unitSize: null, unitMeasure: 'pcs' }) },
    // "5 blocs"
    { regex: /(\d+)\s*blocs?/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'blocs' }) },
    // "25 capsules"
    { regex: /(\d+)\s*capsules?/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'capsules' }) },
    // "5 cartouches"
    { regex: /(\d+)\s*cartouches?/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'cartouches' }) },
    // "3 paires"
    { regex: /(\d+)\s*paires?/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'paires' }) },
    // Formats Venta : "16 X 0,25g"
    { regex: /(\d+)\s*x\s*([\d,.]+)\s*(g|ml)/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: parseFloat(m[2].replace(',','.')), unitMeasure: m[3] }) },
    // "Caps 16 X 0,25g"
    { regex: /caps?\s*(\d+)\s*x\s*([\d,.]+)\s*(g|ml)/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: parseFloat(m[2].replace(',','.')), unitMeasure: m[3] }) },
    // Coffret MC 64 / BC 64
    { regex: /coffret\s*\w+\s*(\d+)/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'pcs' }) },
    // "80 capsules"
    { regex: /(\d+)\s*(capsules?|caps)/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'capsules' }) },
    // "(50)" ou "(100)" en fin de nom
    { regex: /\((\d+)\)\s*$/i, extract: (m) => ({ qty: parseInt(m[1]), unitSize: null, unitMeasure: 'pcs' }) },
  ],

  // Extraire la gamme produit (le vrai nom commercial)
  extractProductLine(name) {
    // Enlever le conditionnement pour garder le nom du produit
    let clean = name
      .replace(/\s*-\s*(Seringue|Flacon|Tube|Bo[iî]te|Coffret|Kit|Set|Pack|Lot|Recharge|Refill|Réassort).*$/i, '')
      .replace(/\s*(Seringue|Flacon|Tube|Bo[iî]te|Coffret|Kit|Set|Pack|Lot|Recharge|Refill|Réassort)\s*(de\s*)?\d.*$/i, '')
      .replace(/\s*\d+\s*(seringues?|flacons?|tubes?|bo[iî]tes?|capsules?|blocs?)\s*(de\s*)?.*$/i, '')
      .replace(/\s*-\s*L[''].*$/i, '')  // "- L'Embout Turbo 8 mm"
      .replace(/\s*-\s*Le\s+.*$/i, '')   // "- Le set Dispenser"
      .replace(/\s*-\s*La\s+.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return clean;
  },

  // Normaliser un nom produit en objet structuré
  normalize(name, brand) {
    const result = {
      originalName: name,
      brand: (brand || '').trim(),
      productLine: '',
      packaging: 'unknown',     // coffret, lot, recharge, unitaire, unknown
      isAccessory: false,
      quantity: null,            // { qty, unitSize, unitMeasure }
      totalVolume: null,         // qty * unitSize (en g ou ml)
    };

    // 1. Détecter si c'est un accessoire
    for (const pat of this.ACCESSORY_PATTERNS) {
      if (pat.test(name)) {
        result.isAccessory = true;
        break;
      }
    }

    // 2. Extraire le conditionnement
    for (const p of this.PACKAGING_PATTERNS) {
      if (p.regex.test(name)) {
        result.packaging = p.type;
        break;
      }
    }

    // 3. Extraire la quantité
    for (const p of this.QUANTITY_PATTERNS) {
      const m = name.match(p.regex);
      if (m) {
        result.quantity = p.extract(m);
        if (result.quantity.qty && result.quantity.unitSize) {
          result.totalVolume = result.quantity.qty * result.quantity.unitSize;
        }
        break;
      }
    }

    // 4. Extraire la gamme produit
    result.productLine = this.extractProductLine(name);

    return result;
  },
};


// =============================================
// EQUIPE 2 : MATCHERS
// Ré-évaluent chaque match avec les données structurées
// =============================================

const MATCHER = {
  // Normaliser pour comparaison
  norm(str) {
    return (str || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Jaccard sur les mots significatifs (> 2 chars)
  jaccard(a, b) {
    const wordsA = new Set(this.norm(a).split(' ').filter(w => w.length > 2));
    const wordsB = new Set(this.norm(b).split(' ').filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
    return intersection / (wordsA.size + wordsB.size - intersection);
  },

  // Comparer deux gammes produit
  productLinesMatch(lineA, lineB) {
    const normA = this.norm(lineA);
    const normB = this.norm(lineB);
    if (!normA || !normB) return 0;

    // Exact
    if (normA === normB) return 100;

    // Jaccard
    const j = this.jaccard(lineA, lineB);
    return Math.round(j * 100);
  },

  // Vérifier compatibilité de conditionnement
  packagingCompatible(gacdNorm, ventaNorm) {
    // Même type = compatible
    if (gacdNorm.packaging === ventaNorm.packaging) return 'same';

    // Coffret GACD vs Recharge Venta = PAS le même produit
    if (gacdNorm.packaging === 'coffret' && ventaNorm.packaging === 'recharge') return 'different_packaging';
    if (gacdNorm.packaging === 'coffret' && ventaNorm.packaging === 'unitaire') return 'different_packaging';
    if (gacdNorm.packaging === 'lot' && ventaNorm.packaging === 'unitaire') return 'different_packaging';
    if (gacdNorm.packaging === 'lot' && ventaNorm.packaging === 'recharge') return 'different_packaging';

    // Unknown = on ne sait pas
    if (gacdNorm.packaging === 'unknown' || ventaNorm.packaging === 'unknown') return 'unknown';

    return 'different_packaging';
  },

  // Calculer le ratio de quantité pour expliquer l'écart de prix
  quantityRatio(gacdNorm, ventaNorm) {
    if (!gacdNorm.quantity || !ventaNorm.quantity) return null;

    // Si on a le volume total des deux côtés
    if (gacdNorm.totalVolume && ventaNorm.totalVolume) {
      return gacdNorm.totalVolume / ventaNorm.totalVolume;
    }

    // Si même unité de mesure
    if (gacdNorm.quantity.unitMeasure === ventaNorm.quantity.unitMeasure) {
      if (gacdNorm.quantity.qty && ventaNorm.quantity.qty) {
        return gacdNorm.quantity.qty / ventaNorm.quantity.qty;
      }
    }

    return null;
  },

  // Score de match amélioré
  computeScore(gacdNorm, ventaNorm) {
    let score = 0;
    let reasons = [];

    // 1. Comparaison gamme produit (0-50 points)
    const lineScore = this.productLinesMatch(gacdNorm.productLine, ventaNorm.productLine);
    const linePoints = Math.round(lineScore * 0.5);
    score += linePoints;
    if (lineScore >= 80) reasons.push('gamme_identique');
    else if (lineScore >= 50) reasons.push('gamme_similaire');
    else reasons.push('gamme_differente');

    // 2. Même marque (0-25 points)
    const brandMatch = gacdNorm.brand && ventaNorm.brand &&
      this.norm(gacdNorm.brand) === this.norm(ventaNorm.brand);
    if (brandMatch) { score += 25; reasons.push('marque_identique'); }
    else if (gacdNorm.brand && ventaNorm.brand) {
      // Marque contenue dans l'autre
      const bA = this.norm(gacdNorm.brand);
      const bB = this.norm(ventaNorm.brand);
      if (bA.includes(bB) || bB.includes(bA)) { score += 15; reasons.push('marque_proche'); }
      else reasons.push('marque_differente');
    }

    // 3. Conditionnement compatible (0-15 points)
    const packCompat = this.packagingCompatible(gacdNorm, ventaNorm);
    if (packCompat === 'same') { score += 15; reasons.push('conditionnement_identique'); }
    else if (packCompat === 'unknown') { score += 5; reasons.push('conditionnement_inconnu'); }
    else { score -= 10; reasons.push('conditionnement_different'); }

    // 4. Accessoire vs produit principal (gros malus)
    if (gacdNorm.isAccessory !== ventaNorm.isAccessory) {
      score -= 30;
      reasons.push('accessoire_vs_produit');
    }

    // 5. Bonus cohérence quantité/prix
    const qtyRatio = this.quantityRatio(gacdNorm, ventaNorm);
    if (qtyRatio !== null) {
      reasons.push(`ratio_quantite:${qtyRatio.toFixed(2)}`);
      if (qtyRatio >= 0.8 && qtyRatio <= 1.2) {
        score += 10;
        reasons.push('quantite_coherente');
      }
    }

    return { score: Math.max(0, Math.min(100, score)), reasons };
  },
};


// =============================================
// EQUIPE 3 : CONTRÔLEURS (premier filtre)
// Règles métier pour valider/rejeter
// =============================================

const CONTROLLER = {
  // Vérifier un match et attribuer un verdict
  verify(gacdNorm, ventaNorm, matchData, matcherResult) {
    const verdict = {
      status: 'uncertain',  // verified, probable, uncertain, rejected
      confidence: 0,        // 0-100
      reasons: [...matcherResult.reasons],
      warnings: [],
      priceAnalysis: null,
    };

    const gacdPrice = matchData.gacd_price;
    const ventaPrice = matchData.matches[0].special_price || matchData.matches[0].price;
    const priceDiffPct = gacdPrice > 0 ? ((ventaPrice - gacdPrice) / gacdPrice * 100) : null;

    verdict.priceAnalysis = {
      gacdPrice,
      ventaPrice,
      diffPct: priceDiffPct ? parseFloat(priceDiffPct.toFixed(1)) : null,
      pricePerUnit: null,
    };

    // ── REJETS AUTOMATIQUES ──

    // R1: Accessoire matché au produit principal
    if (gacdNorm.isAccessory !== ventaNorm.isAccessory) {
      verdict.status = 'rejected';
      verdict.reasons.push('REJET: accessoire ≠ produit principal');
      return verdict;
    }

    // R2: Score matcher < 30
    if (matcherResult.score < 30) {
      verdict.status = 'rejected';
      verdict.reasons.push('REJET: score trop faible (' + matcherResult.score + ')');
      return verdict;
    }

    // R3: Marques totalement différentes + écart > 30%
    if (verdict.reasons.includes('marque_differente') && Math.abs(priceDiffPct) > 30) {
      verdict.status = 'rejected';
      verdict.reasons.push('REJET: marques différentes + écart prix > 30%');
      return verdict;
    }

    // R4: Écart > 80% sans justification par le conditionnement
    if (Math.abs(priceDiffPct) > 80 && !verdict.reasons.includes('conditionnement_different')) {
      if (matcherResult.score < 70) {
        verdict.status = 'rejected';
        verdict.reasons.push('REJET: écart > 80% et score < 70');
        return verdict;
      }
    }

    // R5: Gamme différente
    if (verdict.reasons.includes('gamme_differente') && matcherResult.score < 40) {
      verdict.status = 'rejected';
      verdict.reasons.push('REJET: gammes différentes + score faible');
      return verdict;
    }

    // ── CLASSIFICATION ──

    // V1: Score élevé + écart raisonnable = verified
    if (matcherResult.score >= 70 && Math.abs(priceDiffPct) <= 25) {
      verdict.status = 'verified';
      verdict.confidence = 95;
      verdict.reasons.push('VERIFIED: score élevé + prix cohérent');
    }
    // V2: Score élevé + conditionnement identique
    else if (matcherResult.score >= 65 && verdict.reasons.includes('conditionnement_identique') && Math.abs(priceDiffPct) <= 35) {
      verdict.status = 'verified';
      verdict.confidence = 90;
      verdict.reasons.push('VERIFIED: même conditionnement + prix proche');
    }
    // P1: Score moyen + écart modéré = probable
    else if (matcherResult.score >= 50 && Math.abs(priceDiffPct) <= 35) {
      verdict.status = 'probable';
      verdict.confidence = 70;
      verdict.reasons.push('PROBABLE: score correct + prix raisonnable');
    }
    // P2: Score bon mais écart notable (30-50%)
    else if (matcherResult.score >= 60 && Math.abs(priceDiffPct) <= 50) {
      verdict.status = 'probable';
      verdict.confidence = 55;
      verdict.warnings.push('Écart prix notable (' + priceDiffPct.toFixed(1) + '%) — vérifier conditionnement');
    }
    // Tout le reste = uncertain (remonte aux experts)
    else {
      verdict.status = 'uncertain';
      verdict.confidence = 30;
      if (Math.abs(priceDiffPct) > 50) {
        verdict.warnings.push('Écart prix suspect: ' + priceDiffPct.toFixed(1) + '%');
      }
      if (matcherResult.score < 50) {
        verdict.warnings.push('Score matching faible: ' + matcherResult.score);
      }
    }

    // Calcul prix/unité si possible
    if (gacdNorm.quantity && ventaNorm.quantity) {
      const gacdPerUnit = gacdNorm.quantity.qty > 0 ? gacdPrice / gacdNorm.quantity.qty : null;
      const ventaPerUnit = ventaNorm.quantity && ventaNorm.quantity.qty > 0 ? ventaPrice / ventaNorm.quantity.qty : null;
      if (gacdPerUnit && ventaPerUnit) {
        verdict.priceAnalysis.pricePerUnit = {
          gacd: parseFloat(gacdPerUnit.toFixed(2)),
          venta: parseFloat(ventaPerUnit.toFixed(2)),
          diffPct: parseFloat(((ventaPerUnit - gacdPerUnit) / gacdPerUnit * 100).toFixed(1)),
        };
      }
    }

    return verdict;
  },
};


// =============================================
// EQUIPE 4 : EXPERTS (ré-analysent uncertain + rejected)
// Les meilleurs contrôleurs — analyse approfondie
// =============================================

const EXPERT = {

  // Dictionnaire de produits connus avec leurs sous-références types
  KNOWN_PRODUCT_FAMILIES: {
    'relyx': { mainProducts: ['ciment', 'fiber post', 'unicem'], accessories: ['embout', 'tip'] },
    'tetric': { mainProducts: ['evoceram', 'evoflow', 'powerfill', 'prime'], accessories: ['embout'] },
    'bluephase': { mainProducts: ['lampe', 'led'], accessories: ['housse', 'gaine', 'protection', 'batterie'] },
    'maxcem': { mainProducts: ['elite', 'ciment'], accessories: ['embout'] },
    'impregum': { mainProducts: ['penta', 'soft', 'medium', 'heavy'], accessories: ['embout', 'tip'] },
    'ketac': { mainProducts: ['cem', 'molar', 'fil'], accessories: ['applicap', 'capsule'] },
    'emax': { mainProducts: ['cad', 'press', 'ceram'], accessories: ['glaze', 'stain', 'paste', 'spray'] },
    'structur': { mainProducts: ['provisional', 'temporaire'], accessories: ['embout', 'melangeur'] },
    'iso-form': { mainProducts: ['couronne'], accessories: [] },
    'viscalor': { mainProducts: ['bulk', 'dispenser'], accessories: ['capsule'] },
    'transbond': { mainProducts: ['plus', 'xt', 'adhesif'], accessories: ['embout'] },
    'herculite': { mainProducts: ['xrv', 'ultra'], accessories: [] },
    'filtek': { mainProducts: ['supreme', 'z250', 'z350', 'bulk', 'one'], accessories: ['embout'] },
    'scotchbond': { mainProducts: ['universal', 'adhesif'], accessories: ['embout', 'applicateur'] },
    'adhese': { mainProducts: ['universal', 'one'], accessories: ['canule', 'embout'] },
    'variolink': { mainProducts: ['esthetic', 'veneer', 'dc', 'lc'], accessories: ['embout'] },
  },

  // Analyse experte d'un match uncertain ou rejected
  reAnalyze(gacdNorm, ventaNorm, matchData, originalVerdict) {
    const expertVerdict = {
      status: originalVerdict.status,  // sera potentiellement changé
      confidence: originalVerdict.confidence,
      reasons: [...originalVerdict.reasons],
      warnings: [...originalVerdict.warnings],
      priceAnalysis: { ...originalVerdict.priceAnalysis },
      expertNotes: [],
    };

    const gacdPrice = matchData.gacd_price;
    const ventaMatch = matchData.matches[0];
    const ventaPrice = ventaMatch.special_price || ventaMatch.price;
    const priceDiffPct = gacdPrice > 0 ? ((ventaPrice - gacdPrice) / gacdPrice * 100) : 0;
    const absDiff = Math.abs(priceDiffPct);

    // ── ANALYSE EXPERTE 1 : Détection sous-référence par famille produit ──

    const gacdLower = gacdNorm.originalName.toLowerCase();
    const ventaLower = ventaNorm.originalName.toLowerCase();

    for (const [family, info] of Object.entries(this.KNOWN_PRODUCT_FAMILIES)) {
      const familyInGacd = gacdLower.includes(family);
      const familyInVenta = ventaLower.includes(family);

      if (familyInGacd && familyInVenta) {
        // Même famille ! Vérifier si l'un est un accessoire de l'autre
        const gacdIsAccessory = info.accessories.some(a => gacdLower.includes(a));
        const ventaIsAccessory = info.accessories.some(a => ventaLower.includes(a));

        if (!gacdIsAccessory && ventaIsAccessory) {
          expertVerdict.status = 'rejected';
          expertVerdict.confidence = 95;
          expertVerdict.expertNotes.push(
            `EXPERT REJET: "${family}" — GACD = produit principal, Venta = accessoire/consommable`
          );
          return expertVerdict;
        }
        if (gacdIsAccessory && !ventaIsAccessory) {
          expertVerdict.status = 'rejected';
          expertVerdict.confidence = 95;
          expertVerdict.expertNotes.push(
            `EXPERT REJET: "${family}" — GACD = accessoire, Venta = produit principal`
          );
          return expertVerdict;
        }

        // Même famille, même type → vérifier le conditionnement
        expertVerdict.expertNotes.push(`Famille "${family}" identifiée des deux côtés`);
        break;
      }
    }

    // ── ANALYSE EXPERTE 2 : Prix/unité si conditionnement différent ──

    if (gacdNorm.quantity && ventaNorm.quantity && gacdNorm.quantity.qty && ventaNorm.quantity.qty) {
      const gacdPerUnit = gacdPrice / gacdNorm.quantity.qty;
      const ventaPerUnit = ventaPrice / ventaNorm.quantity.qty;
      const perUnitDiff = ((ventaPerUnit - gacdPerUnit) / gacdPerUnit * 100);

      expertVerdict.priceAnalysis.pricePerUnit = {
        gacd: parseFloat(gacdPerUnit.toFixed(2)),
        venta: parseFloat(ventaPerUnit.toFixed(2)),
        diffPct: parseFloat(perUnitDiff.toFixed(1)),
      };

      // Si le prix/unité colle (< 30%), c'est probablement le même produit en quantités différentes
      if (Math.abs(perUnitDiff) <= 30) {
        expertVerdict.expertNotes.push(
          `Prix/unité cohérent : GACD ${gacdPerUnit.toFixed(2)}€/u vs Venta ${ventaPerUnit.toFixed(2)}€/u (${perUnitDiff.toFixed(1)}%)`
        );
        if (originalVerdict.status === 'uncertain') {
          expertVerdict.status = 'probable';
          expertVerdict.confidence = 65;
          expertVerdict.expertNotes.push('EXPERT UPGRADE: prix/unité cohérent malgré conditionnement différent');
        }
      }
      // Si le prix/unité est totalement incohérent → pas le même produit
      else if (Math.abs(perUnitDiff) > 100) {
        expertVerdict.expertNotes.push(
          `Prix/unité INCOHÉRENT : GACD ${gacdPerUnit.toFixed(2)}€/u vs Venta ${ventaPerUnit.toFixed(2)}€/u (${perUnitDiff.toFixed(1)}%)`
        );
        if (originalVerdict.status !== 'rejected') {
          expertVerdict.status = 'rejected';
          expertVerdict.confidence = 85;
          expertVerdict.expertNotes.push('EXPERT REJET: prix/unité totalement incohérent');
        }
      }
    }

    // ── ANALYSE EXPERTE 3 : Ratio prix brut et bon sens ──

    if (absDiff > 70 && expertVerdict.status !== 'rejected') {
      // Écart > 70% → très probablement pas le même conditionnement
      // Vérifier si le ratio est un multiplicateur entier (2x, 3x, 5x, 10x)
      const ratio = gacdPrice > ventaPrice ? gacdPrice / ventaPrice : ventaPrice / gacdPrice;
      const nearMultiple = [2, 3, 4, 5, 6, 8, 10, 12, 20, 25, 50, 100].find(m => Math.abs(ratio - m) < m * 0.15);

      if (nearMultiple) {
        expertVerdict.expertNotes.push(
          `Ratio prix ≈ ${nearMultiple}x — probablement ${nearMultiple} unités vs 1 unité`
        );
        // C'est PEUT-ÊTRE le même produit en quantité différente, mais on ne peut pas confirmer
        if (originalVerdict.status === 'rejected') {
          expertVerdict.status = 'uncertain';
          expertVerdict.confidence = 40;
          expertVerdict.warnings.push(`Ratio ≈ ${nearMultiple}x détecté — vérifier manuellement`);
          expertVerdict.expertNotes.push('EXPERT RECONSIDÉRÉ: ratio multiplicateur détecté, à vérifier');
        }
      } else {
        // Pas un multiple entier → c'est probablement un faux match
        expertVerdict.status = 'rejected';
        expertVerdict.confidence = 80;
        expertVerdict.expertNotes.push(`EXPERT REJET: écart ${absDiff.toFixed(0)}% sans ratio multiplicateur clair`);
      }
    }

    // ── ANALYSE EXPERTE 4 : Vérification cross-codes fournisseur ──

    if (ventaMatch.code_fournisseur && ventaMatch.code_fournisseur.length > 3) {
      // Si on a un code fournisseur, c'est un signal fort
      expertVerdict.expertNotes.push(`Code fournisseur: ${ventaMatch.code_fournisseur}`);

      if (ventaMatch.cross_codes) {
        const codes = ventaMatch.cross_codes;
        const hasCrossCode = codes.code_drai || codes.code_strong || codes.code_mega;
        if (hasCrossCode) {
          expertVerdict.expertNotes.push(
            `Cross-codes: DRAI=${codes.code_drai || '-'} STRONG=${codes.code_strong || '-'} MEGA=${codes.code_mega || '-'}`
          );
        }
      }
    }

    // ── ANALYSE EXPERTE 5 : Noms presque identiques mais prix très différent ──
    // → probablement un problème de conditionnement, pas un faux match

    const nameJaccard = MATCHER.jaccard(gacdNorm.productLine, ventaNorm.productLine);
    if (nameJaccard >= 0.7 && absDiff > 40 && expertVerdict.status === 'rejected') {
      // Les noms sont très similaires — c'est probablement le bon produit mais en conditionnement différent
      expertVerdict.status = 'uncertain';
      expertVerdict.confidence = 45;
      expertVerdict.expertNotes.push(
        `EXPERT RECONSIDÉRÉ: noms très similaires (Jaccard ${(nameJaccard*100).toFixed(0)}%) — même produit, conditionnement différent probable`
      );
      expertVerdict.warnings.push('Même produit probable — vérifier quantités');
    }

    // ── ANALYSE EXPERTE 6 : Matches uncertain avec bon score original ──

    if (expertVerdict.status === 'uncertain' && matchData.matches[0].match_score >= 60 && absDiff <= 50) {
      expertVerdict.status = 'probable';
      expertVerdict.confidence = 60;
      expertVerdict.expertNotes.push(
        `EXPERT UPGRADE: score original ${matchData.matches[0].match_score} + écart ${absDiff.toFixed(0)}% acceptable`
      );
    }

    return expertVerdict;
  },
};


// =============================================
// EQUIPE 5 : RAPPORT
// =============================================

function generateReport(allResults) {
  const stats = {
    total: allResults.length,
    verified: 0,
    probable: 0,
    uncertain: 0,
    rejected: 0,
    byReason: {},
  };

  const verified = [];
  const probable = [];
  const uncertain = [];
  const rejected = [];

  for (const r of allResults) {
    stats[r.finalVerdict.status]++;

    const entry = {
      gacd: { name: r.gacdNorm.originalName, brand: r.gacdNorm.brand, price: r.matchData.gacd_price, ref: r.matchData.gacd_ref },
      venta: { name: r.ventaNorm.originalName, brand: r.ventaNorm.brand, price: r.matchData.matches[0].special_price || r.matchData.matches[0].price },
      priceDiff: r.finalVerdict.priceAnalysis.diffPct,
      confidence: r.finalVerdict.confidence,
      reasons: r.finalVerdict.reasons,
      expertNotes: r.finalVerdict.expertNotes || [],
      warnings: r.finalVerdict.warnings,
      pricePerUnit: r.finalVerdict.priceAnalysis.pricePerUnit,
      matchScore: {
        original: r.matchData.matches[0].match_score,
        pipeline: r.matcherResult.score,
      },
    };

    switch (r.finalVerdict.status) {
      case 'verified': verified.push(entry); break;
      case 'probable': probable.push(entry); break;
      case 'uncertain': uncertain.push(entry); break;
      case 'rejected': rejected.push(entry); break;
    }

    // Compter les raisons
    for (const reason of r.finalVerdict.reasons) {
      stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
    }
  }

  // Trier par écart de prix
  const sortByDiff = (a, b) => (a.priceDiff || 0) - (b.priceDiff || 0);
  verified.sort(sortByDiff);
  probable.sort(sortByDiff);

  return { stats, verified, probable, uncertain, rejected };
}


// =============================================
// MAIN — Exécution du pipeline
// =============================================

async function main() {
  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║  JADOMI — PIPELINE VÉRIFICATION MATCHES PRIX                ║');
  log('║  5 équipes : Normalisateurs → Matchers → Contrôleurs        ║');
  log('║              → Experts → Rapport                             ║');
  log('╚═══════════════════════════════════════════════════════════════╝');

  // Charger les résultats
  if (!fs.existsSync(RESULTS_FILE)) {
    log('ERREUR: Fichier résultats introuvable: ' + RESULTS_FILE);
    process.exit(1);
  }

  const rawResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  log(`Chargé: ${rawResults.length} matches à vérifier`);

  const allResults = [];
  let e1_normalized = 0, e2_matched = 0, e3_verified = 0, e3_uncertain = 0, e3_rejected = 0;
  let e4_upgraded = 0, e4_confirmed_reject = 0, e4_reconsidered = 0;

  for (const matchData of rawResults) {
    if (!matchData.matches || matchData.matches.length === 0) continue;

    // ── EQUIPE 1 : Normalisation ──
    const gacdNorm = NORMALIZER.normalize(matchData.gacd_name, matchData.gacd_brand);
    const ventaNorm = NORMALIZER.normalize(
      matchData.matches[0].name,
      // Extraire la marque du nom Venta si pas explicite
      matchData.gacd_brand  // On utilise la marque GACD comme référence
    );
    e1_normalized++;

    // ── EQUIPE 2 : Matching structuré ──
    const matcherResult = MATCHER.computeScore(gacdNorm, ventaNorm);
    e2_matched++;

    // ── EQUIPE 3 : Contrôle ──
    const controlVerdict = CONTROLLER.verify(gacdNorm, ventaNorm, matchData, matcherResult);
    if (controlVerdict.status === 'verified' || controlVerdict.status === 'probable') e3_verified++;
    else if (controlVerdict.status === 'uncertain') e3_uncertain++;
    else e3_rejected++;

    // ── EQUIPE 4 : Experts (uncertain + rejected seulement) ──
    let finalVerdict = controlVerdict;

    if (controlVerdict.status === 'uncertain' || controlVerdict.status === 'rejected') {
      const expertVerdict = EXPERT.reAnalyze(gacdNorm, ventaNorm, matchData, controlVerdict);

      // Tracking des changements
      if (expertVerdict.status !== controlVerdict.status) {
        if (expertVerdict.status === 'probable' || expertVerdict.status === 'verified') {
          e4_upgraded++;
        } else if (controlVerdict.status === 'uncertain' && expertVerdict.status === 'rejected') {
          e4_confirmed_reject++;
        } else {
          e4_reconsidered++;
        }
      }

      finalVerdict = expertVerdict;
    }

    allResults.push({
      gacdNorm,
      ventaNorm,
      matchData,
      matcherResult,
      controlVerdict,
      finalVerdict,
    });
  }

  // ── EQUIPE 5 : Rapport ──
  log('\n═══ RÉSULTATS DU PIPELINE ═══');
  log(`Equipe 1 (Normalisateurs): ${e1_normalized} produits structurés`);
  log(`Equipe 2 (Matchers): ${e2_matched} ré-évalués`);
  log(`Equipe 3 (Contrôleurs): ${e3_verified} OK | ${e3_uncertain} uncertain | ${e3_rejected} rejected`);
  log(`Equipe 4 (Experts): ${e4_upgraded} upgradés | ${e4_confirmed_reject} rejets confirmés | ${e4_reconsidered} reconsidérés`);

  const report = generateReport(allResults);

  log(`\n═══ VERDICT FINAL ═══`);
  log(`VERIFIED (fiable):    ${report.stats.verified}`);
  log(`PROBABLE (bon):       ${report.stats.probable}`);
  log(`UNCERTAIN (douteux):  ${report.stats.uncertain}`);
  log(`REJECTED (faux):      ${report.stats.rejected}`);
  log(`TOTAL:                ${report.stats.total}`);
  log(`Taux de fiabilité:    ${((report.stats.verified + report.stats.probable) / report.stats.total * 100).toFixed(1)}%`);

  // Sauvegarder
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    generated: new Date().toISOString(),
    stats: report.stats,
    verified: report.verified,
    probable: report.probable,
  }, null, 2));

  fs.writeFileSync(REPORT_FILE, JSON.stringify({
    generated: new Date().toISOString(),
    stats: report.stats,
    verified_count: report.verified.length,
    probable_count: report.probable.length,
    uncertain: report.uncertain,
    rejected: report.rejected,
  }, null, 2));

  log(`\nFichier fiable: ${OUTPUT_FILE}`);
  log(`Rapport complet: ${REPORT_FILE}`);

  // ── Affichage des pires incohérences détectées ──

  if (process.argv.includes('--report') || !process.argv.includes('--quiet')) {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  TOP 30 REJETS (faux matches confirmés par les experts)       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    for (const r of report.rejected.slice(0, 30)) {
      console.log(`  GACD: ${r.gacd.name} [${r.gacd.brand}] = ${r.gacd.price}€`);
      console.log(`  VS:   ${r.venta.name} = ${r.venta.price}€ (${r.priceDiff > 0 ? '+' : ''}${r.priceDiff}%)`);
      console.log(`  Score: original=${r.matchScore.original} pipeline=${r.matchScore.pipeline} | Confiance: ${r.confidence}%`);
      if (r.expertNotes.length) console.log(`  Expert: ${r.expertNotes[0]}`);
      console.log('');
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  TOP 20 MEILLEURES ÉCONOMIES VÉRIFIÉES                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const bestDeals = [...report.verified, ...report.probable]
      .filter(r => r.priceDiff < 0)
      .sort((a, b) => a.priceDiff - b.priceDiff);

    for (const r of bestDeals.slice(0, 20)) {
      const status = report.verified.includes(r) ? '✓ VERIFIED' : '~ PROBABLE';
      console.log(`  ${status} | ${r.priceDiff}% | GACD: ${r.gacd.price}€ → Venta: ${r.venta.price}€`);
      console.log(`  ${r.gacd.name}`);
      console.log(`  ${r.venta.name}`);
      if (r.pricePerUnit) console.log(`  Prix/unité: GACD ${r.pricePerUnit.gacd}€ vs Venta ${r.pricePerUnit.venta}€`);
      console.log('');
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  UNCERTAIN — À VÉRIFIER MANUELLEMENT                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`  ${report.uncertain.length} matches restent douteux après analyse experte.`);
    for (const r of report.uncertain.slice(0, 15)) {
      console.log(`  ? | ${r.priceDiff}% | GACD: ${r.gacd.price}€ → Venta: ${r.venta.price}€`);
      console.log(`    ${r.gacd.name}`);
      console.log(`    ${r.venta.name}`);
      if (r.expertNotes.length) console.log(`    Expert: ${r.expertNotes[0]}`);
      console.log('');
    }
  }

  // ── Envoi email si demandé ──

  if (process.argv.includes('--email')) {
    await sendVerificationEmail(report);
  }
}

// ── EMAIL ──

async function sendVerificationEmail(report) {
  try {
    require('dotenv').config();
    const nodemailer = require('nodemailer');

    const bestDeals = [...report.verified, ...report.probable]
      .filter(r => r.priceDiff < 0)
      .sort((a, b) => a.priceDiff - b.priceDiff)
      .slice(0, 30);

    const dealRows = bestDeals.map(r => {
      const status = report.verified.includes(r) ? '✓' : '~';
      return `<tr>
        <td style="padding:6px;border-bottom:1px solid #222;">${status}</td>
        <td style="padding:6px;border-bottom:1px solid #222;font-size:12px;">${r.gacd.name}</td>
        <td style="padding:6px;border-bottom:1px solid #222;">${r.gacd.price}€</td>
        <td style="padding:6px;border-bottom:1px solid #222;font-size:12px;">${r.venta.name}</td>
        <td style="padding:6px;border-bottom:1px solid #222;">${r.venta.price}€</td>
        <td style="padding:6px;border-bottom:1px solid #222;color:#22c55e;font-weight:bold;">${r.priceDiff}%</td>
        <td style="padding:6px;border-bottom:1px solid #222;">${r.confidence}%</td>
      </tr>`;
    }).join('');

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:900px;margin:0 auto;background:#0a0a0f;color:#e5e5e5;padding:32px;border-radius:16px;">
        <h1 style="color:#0d9488;font-size:24px;">JADOMI — Rapport Vérification Prix</h1>
        <p style="color:#737373;">Pipeline 5 équipes — ${new Date().toLocaleDateString('fr-FR')}</p>

        <div style="display:flex;gap:16px;margin:20px 0;">
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;text-align:center;">
            <div style="color:#22c55e;font-size:32px;font-weight:bold;">${report.stats.verified}</div>
            <div style="color:#737373;">Vérifiés</div>
          </div>
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;text-align:center;">
            <div style="color:#3b82f6;font-size:32px;font-weight:bold;">${report.stats.probable}</div>
            <div style="color:#737373;">Probables</div>
          </div>
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;text-align:center;">
            <div style="color:#f59e0b;font-size:32px;font-weight:bold;">${report.stats.uncertain}</div>
            <div style="color:#737373;">Incertains</div>
          </div>
          <div style="background:#16161f;border-radius:12px;padding:16px;flex:1;text-align:center;">
            <div style="color:#ef4444;font-size:32px;font-weight:bold;">${report.stats.rejected}</div>
            <div style="color:#737373;">Rejetés</div>
          </div>
        </div>

        <div style="background:#16161f;border-radius:12px;padding:20px;margin:16px 0;">
          <h3 style="color:#fff;margin-top:0;">Top 30 économies vérifiées</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="color:#737373;">
              <th style="text-align:left;padding:6px;">OK</th>
              <th style="text-align:left;padding:6px;">Produit GACD</th>
              <th style="padding:6px;">GACD</th>
              <th style="text-align:left;padding:6px;">Produit Venta</th>
              <th style="padding:6px;">Venta</th>
              <th style="padding:6px;">Éco.</th>
              <th style="padding:6px;">Conf.</th>
            </tr>
            ${dealRows}
          </table>
        </div>

        <p style="color:#525252;font-size:11px;margin-top:24px;">
          JADOMI Pipeline Vérification — ${report.stats.total} matches analysés par 5 équipes
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
      subject: `JADOMI Vérification Prix — ${report.stats.verified} vérifiés / ${report.stats.rejected} rejetés`,
      html,
    });

    log('[EMAIL] Rapport vérification envoyé à karim_bahmed@yahoo.fr');
  } catch (e) {
    log('[EMAIL] Erreur: ' + e.message);
  }
}


main().catch(err => {
  log('ERREUR FATALE: ' + err.message);
  log(err.stack);
  process.exit(1);
});
