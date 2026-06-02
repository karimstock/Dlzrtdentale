// =============================================
// JADOMI AVOCAT — Simulateur Régime Social et Fiscal des Indemnités de Rupture
// Moteur de calcul basé sur la formation Stéphane Boudin (Déficab)
// Optimisation fiscale et sociale des indemnités prud'homales
//
// 4 parties :
//   1. Exonération d'impôt sur le revenu (art. 80 duodecies CGI)
//   2. Exonération de cotisations sociales (art. L.242-1 CSS)
//   3. Exonération de CSG/CRDS (art. L.136-1-1 CSS)
//   4. Contribution patronale + forfait social + différé ARE
//
// Passe 99 — 1er juin 2026
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// ================================================
// AUTHENTIFICATION (même pattern que strategie-depart.js)
// ================================================
let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// ================================================
// CONSTANTES — Formation Stéphane Boudin (Déficab)
// ================================================

// PASS (Plafond Annuel de Sécurité Sociale) par année
const PASS = {
  2020: 41136, 2021: 41136, 2022: 41136, 2023: 43992,
  2024: 46368, 2025: 47100, 2026: 48060
};

// Barème IFC (Indemnité de Fin de Carrière) — Article D.1235-21 du Code du travail
// Utilisé pour déterminer si l'IFC est dans le barème (exonération totale) ou hors barème
const BAREME_IFC = [
  { minAnciennete: 0, maxAnciennete: 1, mois: 2 },
  { minAnciennete: 1, maxAnciennete: 8, mois: 3, parAn: 1 },   // 3 + 1 par année supplémentaire jusqu'à 8 ans
  { minAnciennete: 8, maxAnciennete: 12, mois: 10 },
  { minAnciennete: 12, maxAnciennete: 15, mois: 12 },
  { minAnciennete: 15, maxAnciennete: 19, mois: 14 },
  { minAnciennete: 19, maxAnciennete: 23, mois: 16 },
  { minAnciennete: 23, maxAnciennete: 26, mois: 18 },
  { minAnciennete: 26, maxAnciennete: 30, mois: 20 },
  { minAnciennete: 30, maxAnciennete: Infinity, mois: 24 }
];

// Taux de cotisations et contributions
const TAUX_CSS_SALARIE = 0.23;           // Cotisations salariales globales (art. L.242-1 CSS)
const TAUX_CSG_CRDS = 0.097;             // 9,7% total : 6,8% CSG déductible + 2,4% CSG non déductible + 0,5% CRDS
const TAUX_CSG_DEDUCTIBLE = 0.068;       // CSG déductible de l'IR (art. 154 quinquies CGI)
const TAUX_CSG_NON_DEDUCTIBLE = 0.024;   // CSG non déductible
const TAUX_CRDS = 0.005;                 // CRDS (art. 14 ordonnance 96-50)
const TAUX_COTISATIONS_PATRONALES = 0.40; // Cotisations patronales moyennes
const TAUX_CONTRIBUTION_PATRONALE_RC = 0.40; // Contribution patronale spécifique RC / mise à la retraite
const TAUX_FORFAIT_SOCIAL = 0.20;        // Forfait social (art. L.137-15 CSS)

// Différé spécifique ARE — Constantes 2026 (circulaire Unédic)
const DIVISEUR_DIFFERE_2026 = 111.8;
const SEUIL_DIFFERE_150J = 16770;        // 150 × 111.8
const SEUIL_DIFFERE_75J = 8385;          // 75 × 111.8

// ================================================
// UTILITAIRES DE CALCUL
// ================================================

/** Arrondi à 2 décimales */
function r2(n) { return Math.round(n * 100) / 100; }

/**
 * Calcul de l'indemnité légale de licenciement
 * Art. R.1234-2 du Code du travail :
 * - 1/4 de mois par année d'ancienneté pour les 10 premières années
 * - 1/3 de mois par année d'ancienneté au-delà de 10 ans
 * Minimum 8 mois d'ancienneté requis (art. L.1234-9)
 * Base : moyenne la plus favorable entre les 3 et les 12 derniers mois
 */
function calculerIndemniteLegale(ancienneteMois, salaireMensuelBrut) {
  const ancienneteAnnees = ancienneteMois / 12;
  // Minimum 8 mois d'ancienneté ininterrompue
  if (ancienneteMois < 8) return 0;
  if (ancienneteAnnees <= 10) {
    return r2(0.25 * salaireMensuelBrut * ancienneteAnnees);
  }
  // Au-delà de 10 ans : 1/4 sur les 10 premières + 1/3 sur le surplus
  return r2(
    0.25 * salaireMensuelBrut * 10 +
    (1 / 3) * salaireMensuelBrut * (ancienneteAnnees - 10)
  );
}

/**
 * Calcul de l'indemnité spéciale d'inaptitude d'origine professionnelle (AT/MP)
 * Art. L.1226-14 du Code du travail
 *
 * RÈGLE (formation Boudin) :
 * - Inaptitude d'origine professionnelle → indemnité spéciale = indemnité légale × 2
 * - Exonérée de plein droit d'impôt sur le revenu (levier d'optimisation)
 * - Ne se cumule PAS avec l'indemnité conventionnelle si celle-ci est supérieure
 *
 * @param {number} ancienneteMois - Ancienneté en mois
 * @param {number} salaireMensuelBrut - Salaire mensuel brut de référence
 * @returns {{ montant: number, indemniteLegale: number, detail: string }}
 */
function calculerIndemniteSpecialeATMP(ancienneteMois, salaireMensuelBrut) {
  const indemniteLegale = calculerIndemniteLegale(ancienneteMois, salaireMensuelBrut);
  const montant = r2(indemniteLegale * 2);
  return {
    montant,
    indemniteLegale,
    detail: 'Indemnité spéciale AT/MP = indemnité légale (' + indemniteLegale + ' €) × 2 = ' + montant + ' € (art. L.1226-14, exonérée IR de plein droit)'
  };
}

/**
 * Calcul de l'IFC dans le barème (art. D.1235-21)
 * Retourne le nombre de mois d'indemnité prévu par le barème
 */
function calculerIFCBareme(ancienneteAnnees) {
  for (const tranche of BAREME_IFC) {
    if (ancienneteAnnees >= tranche.minAnciennete && ancienneteAnnees < tranche.maxAnciennete) {
      if (tranche.parAn) {
        // Tranches progressives : base + 1 par année supplémentaire
        const anneesSupp = Math.floor(ancienneteAnnees - tranche.minAnciennete);
        return tranche.mois + anneesSupp * tranche.parAn;
      }
      return tranche.mois;
    }
  }
  return 24; // Plafond à 24 mois pour 30+ ans
}

/**
 * Calcul du montant IFC dans le barème en euros
 */
function calculerMontantIFCBareme(ancienneteMois, salaireMensuelBrut) {
  const ancienneteAnnees = ancienneteMois / 12;
  const mois = calculerIFCBareme(ancienneteAnnees);
  return r2(mois * salaireMensuelBrut);
}

/**
 * Récupérer le PASS pour une année donnée
 * Retourne le PASS le plus récent si l'année n'est pas référencée
 */
function getPASS(annee) {
  if (PASS[annee]) return PASS[annee];
  // Année future : prendre le dernier connu
  const annees = Object.keys(PASS).map(Number).sort((a, b) => b - a);
  for (const a of annees) {
    if (a <= annee) return PASS[a];
  }
  return PASS[annees[annees.length - 1]];
}

// ================================================
// PARTIE 1 — EXONÉRATION D'IMPÔT SUR LE REVENU
// Art. 80 duodecies du CGI
// ================================================

/**
 * Détermine l'exonération IR selon le type de rupture et l'origine de l'indemnité
 *
 * RÈGLES (formation Boudin) :
 *
 * A) Exonération TOTALE (sans plafond) :
 *    - IFC dans le barème (art. D.1235-21)
 *    - Indemnité pour licenciement irrégulier, SCRS ou nul (décision de justice)
 *    - Indemnité pour licenciement économique collectif (réembauchage art. L.1235-11)
 *    - IMRT (indemnité minimale de rupture textuelle) prévue par CC ou loi
 *
 * B) Exonération PLAFONNÉE — le PLUS ÉLEVÉ des 3 montants suivants :
 *    1. Montant de l'IL, IRC ou IMR prévu par CC ou loi
 *    2. 2 × rémunération annuelle brute N-1
 *    3. 50% de l'IGR (indemnité globale de rupture) versée
 *    → Cap : 6 PASS pour IL/IRC, 5 PASS pour IMR
 *    → Le cap ne s'applique QUE si l'hypothèse retenue est 2 ou 3
 *
 * C) Cas particuliers :
 *    - PV conciliation avec IFC dans le barème → exonération totale, pas de vérification
 *    - Démission / prise d'acte / départ retraite → AUCUNE exonération
 *    - Décision de justice (SCRS, nul, irrégulier) → exonération totale
 */
function calculerExonerationIR(params) {
  const {
    typeRupture, origineIndemnite, typeDecisionJustice,
    IMRT, indemniteSupra, indemniteGlobaleRupture,
    indemniteTransactionnelle, indemniteForConciliation,
    indemniteDecisionJustice, IFCBareme,
    remunerationAnnuelleN1, droitsRetraiteOuverts,
    pass, salarieProtege,
    fauteGraveMaintenue, indemniteTheoriqueLicenciement
  } = params;

  const alertes = [];
  let partExoneree = 0;
  let methode = '';

  // --- CAS 1 : Démission, prise d'acte, départ volontaire retraite ---
  // Art. 80 duodecies — Aucune exonération : tout est imposable
  if (['demission', 'prise_acte', 'depart_retraite'].includes(typeRupture)) {
    return {
      plafond: 0,
      methode: 'Aucune exonération — ' + typeRupture + ' (art. 80 duodecies CGI)',
      partExoneree: 0,
      partImposable: r2(indemniteGlobaleRupture + (indemniteTransactionnelle || 0)),
      alertes: ['Le ' + typeRupture + ' ne bénéficie d\'aucune exonération fiscale. Tout est imposable.']
    };
  }

  // --- CAS 2 : Licenciement faute grave ---
  // Pas d'indemnité légale, mais la partie transactionnelle/décision peut être exonérée
  // BOSS n° 1750/1760, Cass. 2e civ. 15 mars et 21 juin 2018
  if (typeRupture === 'licenciement_faute_grave') {
    alertes.push('Licenciement pour faute grave : pas d\'indemnité légale de licenciement.');

    if (fauteGraveMaintenue === true && indemniteTheoriqueLicenciement > 0) {
      // Faute grave MAINTENUE + transaction claire :
      // La part de l'IT correspondant à l'IL théorique est exonérée (BOSS 1750/1760)
      alertes.push('Faute grave maintenue + transaction : la part correspondant à l\'IL théorique (' +
        r2(indemniteTheoriqueLicenciement) + ' €) est exonérée d\'IR (BOSS n° 1750/1760, Cass. 2e civ. 15 mars et 21 juin 2018).');
    } else if (fauteGraveMaintenue === false && indemniteTheoriqueLicenciement > 0) {
      // Faute grave NON maintenue (requalification) :
      // Une partie correspondant au préavis théorique est assujettie (nature salariale)
      alertes.push('Faute grave non maintenue : une partie de l\'indemnité correspondant au préavis théorique sera assujettie comme du salaire (cotisations + IR). Prévoir la ventilation préavis / DI.');
    }
  }

  // --- CAS 3 : Décision de justice ---
  // Les DI pour licenciement SCRS, nul, irrégulier, éco, réembauchage sont totalement exonérées d'IR
  if (origineIndemnite === 'decision_justice' && indemniteDecisionJustice > 0) {
    const typesExoneresTotalement = [
      'licenciement_scrs', 'licenciement_nul', 'licenciement_irregulier',
      'licenciement_eco', 'reembauchage'
    ];
    if (typesExoneresTotalement.includes(typeDecisionJustice)) {
      const totalBrut = r2(indemniteGlobaleRupture + indemniteDecisionJustice);
      return {
        plafond: totalBrut,
        methode: 'Exonération totale — décision de justice (' + typeDecisionJustice + ', art. 80 duodecies 1° CGI)',
        partExoneree: totalBrut,
        partImposable: 0,
        alertes
      };
    }
  }

  // --- CAS 4 : PV de conciliation ---
  // Si IFC dans le barème → exonération totale IR + CSS + CSG/CRDS
  if (origineIndemnite === 'pv_conciliation') {
    if (indemniteForConciliation > 0 && IFCBareme > 0 && indemniteForConciliation <= IFCBareme) {
      return {
        plafond: indemniteForConciliation + IMRT,
        methode: 'PV conciliation — IFC dans le barème (exonération totale IR, art. 80 duodecies CGI + art. D.1235-21)',
        partExoneree: r2(indemniteForConciliation + IMRT),
        partImposable: r2(Math.max(0, indemniteGlobaleRupture - indemniteForConciliation - IMRT)),
        alertes: ['PV conciliation avec IFC dans le barème : régime très favorable, pas de différé spécifique ARE.']
      };
    }
  }

  // --- CAS 5 : Exonération plafonnée (règle générale) ---
  // S'applique au licenciement, RC, mise à la retraite, transaction post-licenciement

  // Déterminer le total soumis à l'exonération plafonnée
  // IMPORTANT : Ne JAMAIS inclure l'IFC dans le barème ni les indemnités liées à l'exécution
  const totalSoumis = r2(indemniteGlobaleRupture + (indemniteTransactionnelle || 0));

  // Les 3 hypothèses (le plus élevé est retenu)
  const hyp1 = IMRT; // Montant de l'IL, IRC ou IMR prévu par CC ou loi
  const hyp2 = r2(2 * remunerationAnnuelleN1); // 2 × rémunération annuelle brute N-1
  const hyp3 = r2(totalSoumis * 0.5); // 50% de l'IGR versée

  // Déterminer le cap selon le type de rupture
  // IL/IRC (licenciement, RC) → 6 PASS
  // IMR (mise à la retraite) → 5 PASS
  const capPASS = typeRupture === 'mise_retraite' ? r2(5 * pass) : r2(6 * pass);

  // Déterminer quelle hypothèse est la plus favorable
  let plafondExo;
  let hypotheseRetenue;

  if (hyp1 >= hyp2 && hyp1 >= hyp3) {
    // Hypothèse 1 retenue : PAS de plafonnement PASS
    plafondExo = hyp1;
    hypotheseRetenue = 1;
    methode = 'Hypothèse 1 — Montant IL/IRC/IMR (CC ou loi) = ' + r2(hyp1) + ' € (pas de plafond PASS)';
  } else if (hyp2 >= hyp3) {
    // Hypothèse 2 retenue : plafonné à 6 ou 5 PASS
    plafondExo = Math.min(hyp2, capPASS);
    hypotheseRetenue = 2;
    methode = 'Hypothèse 2 — 2 × rém. annuelle N-1 = ' + r2(hyp2) + ' € (cap ' + capPASS + ' €, ' + (typeRupture === 'mise_retraite' ? '5' : '6') + ' PASS)';
    if (hyp2 > capPASS) {
      alertes.push('Attention : l\'hypothèse 2 (' + r2(hyp2) + ' €) dépasse le cap de ' + (typeRupture === 'mise_retraite' ? '5' : '6') + ' PASS (' + capPASS + ' €). Le plafond est appliqué.');
    }
  } else {
    // Hypothèse 3 retenue : plafonné à 6 ou 5 PASS
    plafondExo = Math.min(hyp3, capPASS);
    hypotheseRetenue = 3;
    methode = 'Hypothèse 3 — 50% IGR = ' + r2(hyp3) + ' € (cap ' + capPASS + ' €, ' + (typeRupture === 'mise_retraite' ? '5' : '6') + ' PASS)';
    if (hyp3 > capPASS) {
      alertes.push('Attention : l\'hypothèse 3 (' + r2(hyp3) + ' €) dépasse le cap de ' + (typeRupture === 'mise_retraite' ? '5' : '6') + ' PASS (' + capPASS + ' €). Le plafond est appliqué.');
    }
  }

  partExoneree = r2(Math.min(totalSoumis, plafondExo));
  const partImposable = r2(Math.max(0, totalSoumis - partExoneree));

  // --- RC avec droits retraite ouverts ---
  // CORRECTION (Boudin, PDF p.63-64) :
  // Anté-réforme sept 2023 : assujettissement TOTAL IR + CSS + CSG/CRDS
  // Post-réforme sept 2023 : assujettissement TOTAL IR, MAIS exonération CSS partielle (2 PASS)
  // → La part imposable = TOUT le montant soumis (pas d'exonération IR)
  if (typeRupture === 'rupture_conventionnelle' && droitsRetraiteOuverts) {
    alertes.push('RC avec droits retraite ouverts : AUCUNE exonération IR (tout est imposable, art. 80 duodecies CGI). Exonération CSS partielle (2 PASS) depuis sept. 2023. Contribution patronale de 30% applicable.');
    return {
      plafond: 0,
      methode: 'RC droits retraite ouverts — assujettissement total IR (post sept. 2023, Boudin PDF p.63-64)',
      hypotheses: {
        hyp1_IMRT: r2(hyp1),
        hyp2_doubleRemN1: r2(hyp2),
        hyp3_moitieIGR: r2(hyp3),
        capPASS,
        hypotheseRetenue: 0
      },
      partExoneree: 0,
      partImposable: totalSoumis,
      alertes
    };
  }

  return {
    plafond: r2(plafondExo),
    methode,
    hypotheses: {
      hyp1_IMRT: r2(hyp1),
      hyp2_doubleRemN1: r2(hyp2),
      hyp3_moitieIGR: r2(hyp3),
      capPASS,
      hypotheseRetenue
    },
    partExoneree,
    partImposable,
    alertes
  };
}

// ================================================
// PARTIE 2 — EXONÉRATION DE COTISATIONS SOCIALES (CSS)
// Art. L.242-1 du CSS
// ================================================

/**
 * Détermine l'exonération CSS (cotisations salariales et patronales)
 *
 * RÈGLES (formation Boudin) :
 *
 * Étape 1 : Si IGR >= 10 PASS → réintégration totale dès le 1er euro
 * Étape 2 : Plafond d'exonération = min(part exonérée IR, 2 PASS)
 * Étape 3 : Au-delà du plafond → soumis à cotisations sociales
 *
 * Cas particuliers :
 * - Décision de justice : exonéré CSS jusqu'à 2 PASS (PASS à la date de rupture)
 * - PV conciliation IFC barème : exonéré totalement
 * - Démission / prise d'acte / départ retraite : soumis à 100%
 */
function calculerExonerationCSS(params) {
  const {
    typeRupture, origineIndemnite,
    indemniteGlobaleRupture, indemniteTransactionnelle,
    indemniteDecisionJustice, indemniteForConciliation,
    IFCBareme, exonerationIR, pass
  } = params;

  const totalBrut = r2(
    indemniteGlobaleRupture +
    (indemniteTransactionnelle || 0) +
    (indemniteDecisionJustice || 0) +
    (indemniteForConciliation || 0)
  );

  // Cas démission / prise d'acte / départ retraite : 100% soumis
  if (['demission', 'prise_acte', 'depart_retraite'].includes(typeRupture)) {
    return {
      plafond: 0,
      partExoneree: 0,
      partAssujettie: totalBrut,
      methode: 'Aucune exonération CSS — ' + typeRupture
    };
  }

  // Étape 1 : Seuil de réintégration totale à 10 PASS
  const seuil10PASS = r2(10 * pass);
  if (totalBrut >= seuil10PASS) {
    return {
      plafond: 0,
      partExoneree: 0,
      partAssujettie: totalBrut,
      methode: 'Réintégration totale CSS dès le 1er euro — IGR (' + totalBrut + ' €) >= 10 PASS (' + seuil10PASS + ' €)',
      alerte: 'ATTENTION : dépassement du seuil de 10 PASS. Toutes les indemnités sont soumises à CSS dès le 1er euro.'
    };
  }

  // PV conciliation avec IFC dans le barème → exonération totale
  if (origineIndemnite === 'pv_conciliation' && indemniteForConciliation > 0 && IFCBareme > 0 && indemniteForConciliation <= IFCBareme) {
    return {
      plafond: totalBrut,
      partExoneree: totalBrut,
      partAssujettie: 0,
      methode: 'PV conciliation — IFC dans le barème : exonération totale CSS'
    };
  }

  // Décision de justice : exonéré jusqu'à 2 PASS
  if (origineIndemnite === 'decision_justice' && indemniteDecisionJustice > 0) {
    const plafond2PASS = r2(2 * pass);
    const partExoneree = r2(Math.min(totalBrut, plafond2PASS));
    return {
      plafond: plafond2PASS,
      partExoneree,
      partAssujettie: r2(Math.max(0, totalBrut - partExoneree)),
      methode: 'Décision de justice — exonération CSS dans la limite de 2 PASS (' + plafond2PASS + ' €)'
    };
  }

  // Étape 2 : Plafond = min(part exonérée IR, 2 PASS)
  const deuxPASS = r2(2 * pass);
  const plafondCSS = r2(Math.min(exonerationIR.partExoneree, deuxPASS));
  const partExoneree = r2(Math.min(totalBrut, plafondCSS));
  const partAssujettie = r2(Math.max(0, totalBrut - partExoneree));

  return {
    plafond: plafondCSS,
    partExoneree,
    partAssujettie,
    methode: 'Plafond CSS = min(exo IR ' + exonerationIR.partExoneree + ' €, 2 PASS ' + deuxPASS + ' €) = ' + plafondCSS + ' €'
  };
}

// ================================================
// PARTIE 3 — EXONÉRATION CSG/CRDS
// Art. L.136-1-1 du CSS (ex L.136-2)
// ================================================

/**
 * Détermine l'exonération CSG/CRDS
 *
 * RÈGLES (formation Boudin) :
 *
 * Étape 1 : Si IGR >= 10 PASS → CSG/CRDS dès le 1er euro (comme CSS)
 * Étape 2 : Plafond = min(IMRT [+ IFC barème le cas échéant], part exonérée CSS)
 * Étape 3 : Au-delà du plafond → soumis à CSG/CRDS à 9,7%
 *
 * Décomposition CSG/CRDS :
 * - CSG déductible : 6,8%
 * - CSG non déductible : 2,4%
 * - CRDS : 0,5%
 * Total : 9,7%
 *
 * La CSG déductible réduit la base imposable IR (art. 154 quinquies CGI)
 */
function calculerExonerationCSGCRDS(params) {
  const {
    typeRupture, origineIndemnite,
    IMRT, IFCBareme,
    indemniteGlobaleRupture, indemniteTransactionnelle,
    indemniteDecisionJustice, indemniteForConciliation,
    exonerationCSS, pass
  } = params;

  const totalBrut = r2(
    indemniteGlobaleRupture +
    (indemniteTransactionnelle || 0) +
    (indemniteDecisionJustice || 0) +
    (indemniteForConciliation || 0)
  );

  // Cas démission / prise d'acte / départ retraite : 100% soumis
  if (['demission', 'prise_acte', 'depart_retraite'].includes(typeRupture)) {
    const csgCrds = r2(totalBrut * TAUX_CSG_CRDS);
    return {
      plafond: 0,
      partExoneree: 0,
      partAssujettie: totalBrut,
      csgDeductible: r2(totalBrut * TAUX_CSG_DEDUCTIBLE),
      csgNonDeductible: r2(totalBrut * TAUX_CSG_NON_DEDUCTIBLE),
      crds: r2(totalBrut * TAUX_CRDS),
      totalCSGCRDS: csgCrds,
      methode: 'Aucune exonération CSG/CRDS — ' + typeRupture
    };
  }

  // Seuil 10 PASS : CSG/CRDS dès le 1er euro
  const seuil10PASS = r2(10 * pass);
  if (totalBrut >= seuil10PASS) {
    const csgCrds = r2(totalBrut * TAUX_CSG_CRDS);
    return {
      plafond: 0,
      partExoneree: 0,
      partAssujettie: totalBrut,
      csgDeductible: r2(totalBrut * TAUX_CSG_DEDUCTIBLE),
      csgNonDeductible: r2(totalBrut * TAUX_CSG_NON_DEDUCTIBLE),
      crds: r2(totalBrut * TAUX_CRDS),
      totalCSGCRDS: csgCrds,
      methode: 'Réintégration totale CSG/CRDS — IGR >= 10 PASS'
    };
  }

  // PV conciliation avec IFC dans le barème → exonération totale
  if (origineIndemnite === 'pv_conciliation' && indemniteForConciliation > 0 && IFCBareme > 0 && indemniteForConciliation <= IFCBareme) {
    return {
      plafond: totalBrut,
      partExoneree: totalBrut,
      partAssujettie: 0,
      csgDeductible: 0,
      csgNonDeductible: 0,
      crds: 0,
      totalCSGCRDS: 0,
      methode: 'PV conciliation — IFC dans le barème : exonération totale CSG/CRDS'
    };
  }

  // Étape 2 : Plafond = min(IMRT [+ IFC barème], part exonérée CSS)
  const baseIMRT = r2(IMRT + (IFCBareme || 0));
  const plafondCSGCRDS = r2(Math.min(baseIMRT, exonerationCSS.partExoneree));
  const partExoneree = r2(Math.min(totalBrut, plafondCSGCRDS));
  const partAssujettie = r2(Math.max(0, totalBrut - partExoneree));

  const csgDeductible = r2(partAssujettie * TAUX_CSG_DEDUCTIBLE);
  const csgNonDeductible = r2(partAssujettie * TAUX_CSG_NON_DEDUCTIBLE);
  const crds = r2(partAssujettie * TAUX_CRDS);
  const totalCSGCRDS = r2(csgDeductible + csgNonDeductible + crds);

  return {
    plafond: plafondCSGCRDS,
    partExoneree,
    partAssujettie,
    csgDeductible,
    csgNonDeductible,
    crds,
    totalCSGCRDS,
    methode: 'Plafond CSG/CRDS = min(IMRT' + (IFCBareme ? '+IFC' : '') + ' ' + baseIMRT + ' €, exo CSS ' + exonerationCSS.partExoneree + ' €) = ' + plafondCSGCRDS + ' €'
  };
}

// ================================================
// PARTIE 4 — CONTRIBUTION PATRONALE + FORFAIT SOCIAL + DIFFÉRÉ ARE
// ================================================

/**
 * Contribution patronale spécifique (art. L.137-15 CSS)
 *
 * RÈGLES :
 * - Rupture conventionnelle / mise à la retraite : 30% (anciennement 50%) sur la part
 *   d'IRC/IMR exonérée de CSS (y compris la part exonérée de CSG/CRDS)
 * - Transaction après RC : également soumise (lettre circulaire ACOSS 28 mars 2013)
 * - RC avec droits retraite ouverts (post sept. 2023) : contribution patronale de 30%
 *   → MAIS taux de 40% dans le barème de la formation Boudin pour les employeurs
 */
function calculerContributionPatronale(params) {
  const {
    typeRupture, origineIndemnite,
    exonerationCSS, droitsRetraiteOuverts
  } = params;

  // Seuls RC et mise à la retraite sont concernés
  const typesAssujettis = ['rupture_conventionnelle', 'mise_retraite'];
  const estTransaction = origineIndemnite === 'transaction' || origineIndemnite === 'transaction_execution';

  if (!typesAssujettis.includes(typeRupture) && !estTransaction) {
    return { montant: 0, taux: 0, assiette: 0, type: 'Non applicable — ' + typeRupture };
  }

  // L'assiette est la part exonérée de CSS (qui inclut la part exonérée de CSG/CRDS)
  const assiette = exonerationCSS.partExoneree;
  const taux = TAUX_CONTRIBUTION_PATRONALE_RC;
  const montant = r2(assiette * taux);

  let type = '';
  if (typeRupture === 'rupture_conventionnelle') {
    type = droitsRetraiteOuverts
      ? 'Contribution patronale RC (droits retraite ouverts, art. L.137-15 CSS)'
      : 'Contribution patronale RC (art. L.137-15 CSS)';
  } else if (typeRupture === 'mise_retraite') {
    type = 'Contribution patronale mise à la retraite (art. L.137-12 CSS)';
  } else {
    type = 'Contribution patronale transaction post-RC (lettre circ. ACOSS 28/03/2013)';
  }

  return { montant, taux, assiette: r2(assiette), type };
}

/**
 * Forfait social (art. L.137-15 CSS)
 *
 * RÈGLE : 20% sur la part d'IFC excédant le barème,
 * soumise à CSG/CRDS mais exclue des cotisations sociales
 *
 * Assiette = part soumise à CSG/CRDS MAIS exonérée de CSS
 */
function calculerForfaitSocial(params) {
  const { exonerationCSS, exonerationCSGCRDS } = params;

  // Assiette = part exonérée CSS mais soumise à CSG/CRDS
  // C'est la zone entre le plafond CSG/CRDS et le plafond CSS
  const assiette = r2(Math.max(0, exonerationCSS.partExoneree - exonerationCSGCRDS.partExoneree));

  // En réalité, le forfait social s'applique sur la part soumise à CSG/CRDS mais exonérée de CSS
  // = partAssujettie CSG/CRDS ∩ partExonérée CSS
  // Ce qui revient à : min(partAssujettie CSG/CRDS, partExonérée CSS)
  // Mais plus précisément : partExonérée CSS - partExonérée CSG/CRDS
  const montant = r2(assiette * TAUX_FORFAIT_SOCIAL);

  return {
    montant,
    taux: TAUX_FORFAIT_SOCIAL,
    assiette
  };
}

/**
 * Différé d'indemnisation chômage (ARE)
 * Circulaire Unédic n° 2014-26
 *
 * RÈGLES :
 * 1. Délai d'attente : 7 jours (incompressible)
 * 2. Différé CP : ICCP / SJR (plafonné 30 jours)
 * 3. Différé spécifique : (indemnités versées - indemnité légale) / 111,8
 *    → Plafonné 150 jours (75 jours si licenciement éco + refus CSP)
 *
 * Seuils de référence :
 * - Plafond 150 jours × 111,8 = 16 770 €
 * - Plafond 75 jours × 111,8 = 8 385 €
 *
 * Exception PV conciliation IFC barème : pas de différé spécifique
 */
function calculerDifferesChomage(params) {
  const {
    typeRupture, origineIndemnite,
    indemniteGlobaleRupture, indemniteLegale,
    indemniteForConciliation, IFCBareme,
    ICCPjours, salaireMensuelBrut,
    licenciementEcoRefusCSP
  } = params;

  // Pas de chômage pour démission (sauf cas légitimes), départ retraite
  if (['demission', 'depart_retraite'].includes(typeRupture)) {
    return {
      delaiAttente: 0,
      differeCPjours: 0,
      differeSpecifiqueJours: 0,
      totalJours: 0,
      alerte: 'Pas de droit à l\'ARE pour ' + typeRupture + ' (sauf démission légitime, art. L.5422-1)'
    };
  }

  // Délai d'attente incompressible
  const delaiAttente = 7;

  // Différé CP
  const differeCPjours = Math.min(30, ICCPjours || 0);

  // PV conciliation IFC barème → pas de différé spécifique
  if (origineIndemnite === 'pv_conciliation' && indemniteForConciliation > 0 && IFCBareme > 0 && indemniteForConciliation <= IFCBareme) {
    return {
      delaiAttente,
      differeCPjours,
      differeSpecifiqueJours: 0,
      totalJours: delaiAttente + differeCPjours,
      alerte: 'PV conciliation IFC barème : pas de différé spécifique.'
    };
  }

  // Différé spécifique
  const supraLegal = r2(Math.max(0, indemniteGlobaleRupture - indemniteLegale));
  const plafondJours = licenciementEcoRefusCSP ? 75 : 150;
  const seuilMaxEuros = licenciementEcoRefusCSP ? SEUIL_DIFFERE_75J : SEUIL_DIFFERE_150J;
  const differeSpecifiqueJours = Math.min(plafondJours, Math.floor(supraLegal / DIVISEUR_DIFFERE_2026));

  const totalJours = delaiAttente + differeCPjours + differeSpecifiqueJours;

  return {
    delaiAttente,
    differeCPjours,
    differeSpecifiqueJours,
    totalJours,
    detail: {
      supraLegal,
      diviseur: DIVISEUR_DIFFERE_2026,
      plafondJours,
      seuilMaxEuros
    }
  };
}

// ================================================
// VENTILATION — Tableau des 4 lignes de prélèvement
// ================================================

/**
 * Construit le tableau de ventilation à 4 lignes :
 * 1. Partie soumise à IR + CSS (dont CSG/CRDS)
 * 2. Partie soumise à CSS (dont CSG/CRDS) mais exonérée d'IR
 * 3. Partie soumise à CSG/CRDS uniquement (exonérée IR + CSS)
 * 4. Partie totalement exonérée
 *
 * Règle de cascade : IR → CSS → CSG/CRDS
 * Si une partie est soumise à IR → elle est aussi soumise à CSS → aussi à CSG/CRDS
 */
function calculerVentilation(params) {
  const {
    exonerationIR, exonerationCSS, exonerationCSGCRDS,
    totalBrut, tauxPAS
  } = params;

  // Ligne 1 : soumise à IR + CSS + CSG/CRDS
  // = totalBrut - partExonérée IR
  const partSoumiseIR = r2(exonerationIR.partImposable);

  // Ligne 2 : soumise à CSS + CSG/CRDS, exonérée IR
  // = partExonérée IR - partExonérée CSS
  const partSoumiseCSSseule = r2(Math.max(0, exonerationIR.partExoneree - exonerationCSS.partExoneree));

  // Ligne 3 : soumise à CSG/CRDS uniquement
  // = partExonérée CSS - partExonérée CSG/CRDS
  const partSoumiseCSGseule = r2(Math.max(0, exonerationCSS.partExoneree - exonerationCSGCRDS.partExoneree));

  // Ligne 4 : totalement exonérée
  const partExoneree = r2(exonerationCSGCRDS.partExoneree);

  // Vérification de cohérence
  const somme = r2(partSoumiseIR + partSoumiseCSSseule + partSoumiseCSGseule + partExoneree);

  // Calculs détaillés pour chaque ligne
  const lignes = [];

  // --- Ligne 1 : IR + CSS + CSG/CRDS ---
  if (partSoumiseIR > 0) {
    const css = r2(partSoumiseIR * TAUX_CSS_SALARIE);
    const csgCrds = r2(partSoumiseIR * TAUX_CSG_CRDS);
    const ir = r2(partSoumiseIR * (tauxPAS || 0));
    const csgDed = r2(partSoumiseIR * TAUX_CSG_DEDUCTIBLE);
    const netCS = r2(partSoumiseIR - css - csgCrds);
    const netIR = r2(netCS - ir + csgDed); // CSG déductible réduit la base IR
    const coutEmpl = r2(partSoumiseIR * (1 + TAUX_COTISATIONS_PATRONALES));
    lignes.push({
      ligne: 'Partie soumise à IR + CSS (dont CSG/CRDS)',
      brut: partSoumiseIR,
      cotisationsSociales: css,
      csgCrds: csgCrds,
      impotRevenu: ir,
      netChargesSociales: netCS,
      netChargesImpot: netIR,
      coutEmployeur: coutEmpl
    });
  } else {
    lignes.push({
      ligne: 'Partie soumise à IR + CSS (dont CSG/CRDS)',
      brut: 0, cotisationsSociales: 0, csgCrds: 0, impotRevenu: 0,
      netChargesSociales: 0, netChargesImpot: 0, coutEmployeur: 0
    });
  }

  // --- Ligne 2 : CSS + CSG/CRDS (pas d'IR) ---
  if (partSoumiseCSSseule > 0) {
    const css = r2(partSoumiseCSSseule * TAUX_CSS_SALARIE);
    const csgCrds = r2(partSoumiseCSSseule * TAUX_CSG_CRDS);
    const netCS = r2(partSoumiseCSSseule - css - csgCrds);
    const coutEmpl = r2(partSoumiseCSSseule * (1 + TAUX_COTISATIONS_PATRONALES));
    lignes.push({
      ligne: 'Partie soumise à CSS (dont CSG/CRDS)',
      brut: partSoumiseCSSseule,
      cotisationsSociales: css,
      csgCrds: csgCrds,
      impotRevenu: 0,
      netChargesSociales: netCS,
      netChargesImpot: netCS,
      coutEmployeur: coutEmpl
    });
  } else {
    lignes.push({
      ligne: 'Partie soumise à CSS (dont CSG/CRDS)',
      brut: 0, cotisationsSociales: 0, csgCrds: 0, impotRevenu: 0,
      netChargesSociales: 0, netChargesImpot: 0, coutEmployeur: 0
    });
  }

  // --- Ligne 3 : CSG/CRDS uniquement ---
  if (partSoumiseCSGseule > 0) {
    const csgCrds = r2(partSoumiseCSGseule * TAUX_CSG_CRDS);
    const netCS = r2(partSoumiseCSGseule - csgCrds);
    // Pas de cotisations patronales sur cette tranche, mais forfait social possible
    const coutEmpl = r2(partSoumiseCSGseule + partSoumiseCSGseule * TAUX_FORFAIT_SOCIAL);
    lignes.push({
      ligne: 'Partie soumise à CSG/CRDS uniquement',
      brut: partSoumiseCSGseule,
      cotisationsSociales: 0,
      csgCrds: csgCrds,
      impotRevenu: 0,
      netChargesSociales: netCS,
      netChargesImpot: netCS,
      coutEmployeur: coutEmpl
    });
  } else {
    lignes.push({
      ligne: 'Partie soumise à CSG/CRDS uniquement',
      brut: 0, cotisationsSociales: 0, csgCrds: 0, impotRevenu: 0,
      netChargesSociales: 0, netChargesImpot: 0, coutEmployeur: 0
    });
  }

  // --- Ligne 4 : Totalement exonérée ---
  lignes.push({
    ligne: 'Partie exonérée',
    brut: partExoneree,
    cotisationsSociales: 0,
    csgCrds: 0,
    impotRevenu: 0,
    netChargesSociales: partExoneree,
    netChargesImpot: partExoneree,
    coutEmployeur: partExoneree
  });

  // Totaux
  const totaux = {
    brut: r2(lignes.reduce((s, l) => s + l.brut, 0)),
    cotisationsSociales: r2(lignes.reduce((s, l) => s + l.cotisationsSociales, 0)),
    csgCrds: r2(lignes.reduce((s, l) => s + l.csgCrds, 0)),
    impotRevenu: r2(lignes.reduce((s, l) => s + l.impotRevenu, 0)),
    netChargesSociales: r2(lignes.reduce((s, l) => s + l.netChargesSociales, 0)),
    netChargesImpot: r2(lignes.reduce((s, l) => s + l.netChargesImpot, 0)),
    coutEmployeur: r2(lignes.reduce((s, l) => s + l.coutEmployeur, 0))
  };

  return { ventilation: lignes, totaux };
}

// ================================================
// CONSEIL STRATÉGIQUE
// ================================================

/**
 * Génère un conseil stratégique basé sur les résultats de calcul
 * Compare transaction vs PV conciliation, coût employeur, net salarié
 */
function genererConseilStrategique(params) {
  const {
    typeRupture, origineIndemnite,
    indemnites, exonerationIR, exonerationCSS, exonerationCSGCRDS,
    totaux, contributionPatronale, differes, IFCBareme,
    ancienneteMois, salaireMensuelBrut, pass
  } = params;

  const conseils = [];
  const ancienneteAnnees = ancienneteMois / 12;

  // Comparaison transaction vs PV conciliation
  if (origineIndemnite === 'transaction' || origineIndemnite === 'rupture') {
    const ifcBareme = calculerMontantIFCBareme(ancienneteMois, salaireMensuelBrut);
    if (indemnites.indemniteSupra <= ifcBareme) {
      conseils.push('STRATÉGIE OPTIMALE : Le montant supra-légal (' + indemnites.indemniteSupra + ' €) est inférieur à l\'IFC barème (' + ifcBareme + ' €). ' +
        'Un PV de conciliation serait plus avantageux : exonération totale IR + CSS + CSG/CRDS et pas de différé spécifique ARE.');
    }
  }

  // Alerte si proche du seuil 10 PASS
  const seuil10PASS = r2(10 * pass);
  const totalBrut = totaux.brut;
  if (totalBrut > seuil10PASS * 0.85 && totalBrut < seuil10PASS) {
    conseils.push('ATTENTION SEUIL : Le total brut (' + totalBrut + ' €) approche du seuil de 10 PASS (' + seuil10PASS + ' €). ' +
      'Au-delà, réintégration totale CSS + CSG/CRDS dès le 1er euro. Éviter de franchir ce seuil.');
  } else if (totalBrut >= seuil10PASS) {
    conseils.push('SEUIL FRANCHI : Le total brut (' + totalBrut + ' €) dépasse 10 PASS (' + seuil10PASS + ' €). ' +
      'Réintégration totale des cotisations et CSG/CRDS. Envisager de ventiler autrement.');
  }

  // Coût employeur
  if (contributionPatronale.montant > 0) {
    conseils.push('COÛT EMPLOYEUR : Contribution patronale de ' + contributionPatronale.montant + ' € (' +
      (contributionPatronale.taux * 100) + '%) à ajouter. ' +
      'Le coût total employeur est de ' + totaux.coutEmployeur + ' € pour ' + totaux.netChargesImpot + ' € nets pour le salarié.');
  }

  // Efficacité fiscale
  const tauxPrelevement = totalBrut > 0 ? r2(((totalBrut - totaux.netChargesImpot) / totalBrut) * 100) : 0;
  if (tauxPrelevement > 40) {
    conseils.push('OPTIMISATION NÉCESSAIRE : Le taux de prélèvement effectif est de ' + tauxPrelevement + '%. ' +
      'Explorer : PV conciliation (si IFC barème applicable), ventilation outplacement/formation, versement PER.');
  } else if (tauxPrelevement < 15) {
    conseils.push('RÉGIME FAVORABLE : Le taux de prélèvement effectif est de ' + tauxPrelevement + '%. Le montage est bien optimisé.');
  }

  // Différé ARE
  if (differes.differeSpecifiqueJours > 90) {
    conseils.push('ATTENTION DIFFÉRÉ : Le différé spécifique ARE est de ' + differes.differeSpecifiqueJours + ' jours. ' +
      'Le salarié ne percevra pas d\'ARE pendant ' + differes.totalJours + ' jours. S\'assurer qu\'il peut tenir financièrement.');
  }

  // Hypothèse IR retenue
  if (exonerationIR.hypotheses) {
    const hyp = exonerationIR.hypotheses;
    if (hyp.hypotheseRetenue === 1) {
      conseils.push('IR : L\'hypothèse 1 (montant IMRT) est la plus favorable. Pas de plafonnement PASS.');
    } else if (hyp.hypotheseRetenue === 2 && hyp.hyp2_doubleRemN1 > hyp.capPASS) {
      conseils.push('IR : L\'hypothèse 2 (2 × rém. N-1) serait la plus favorable MAIS elle est plafonnée à ' +
        (typeRupture === 'mise_retraite' ? '5' : '6') + ' PASS. Vérifier si l\'hypothèse 1 ne serait pas plus intéressante.');
    }
  }

  return conseils.length > 0
    ? conseils.join('\n\n')
    : 'Simulation standard. Aucune optimisation particulière identifiée pour ce montage.';
}

// ================================================
// ENDPOINT PRINCIPAL — POST /simuler
// ================================================

router.post('/simuler', requireAvocat, async (req, res) => {
  try {
    const p = req.body || {};

    // --- Validation des paramètres ---
    if (!p.typeRupture) {
      return res.status(400).json({ error: 'typeRupture requis (licenciement, rupture_conventionnelle, mise_retraite, depart_retraite, demission, prise_acte, licenciement_faute_grave)' });
    }
    if (!p.ancienneteMois && p.ancienneteMois !== 0) {
      return res.status(400).json({ error: 'ancienneteMois requis' });
    }
    if (!p.salaireMensuelBrut) {
      return res.status(400).json({ error: 'salaireMensuelBrut requis' });
    }

    const anneeRupture = p.anneeRupture || 2026;
    const pass = getPASS(anneeRupture);
    const ancienneteMois = p.ancienneteMois;
    const ancienneteAnnees = ancienneteMois / 12;
    const salaireMensuelBrut = p.salaireMensuelBrut;
    const remunerationAnnuelleN1 = p.remunerationAnnuelleN1 || (salaireMensuelBrut * 12);
    const tauxPAS = p.tauxPAS || 0;

    // --- Calcul de l'indemnité légale (auto si null) ---
    const indemniteLegale = (p.indemniteMinimaleLegale != null)
      ? p.indemniteMinimaleLegale
      : calculerIndemniteLegale(ancienneteMois, salaireMensuelBrut);

    const indemniteConventionnelle = p.indemniteMinimaleConventionnelle || 0;

    // IMRT = max(légale, conventionnelle) — art. R.1234-2, R.1234-4
    const IMRT = r2(Math.max(indemniteLegale, indemniteConventionnelle));

    // Supra-minimale (négociée au-delà du minimum)
    const indemniteSupra = p.indemniteSupra || 0;

    // IGR (Indemnité Globale de Rupture) = IMRT + supra + transactionnelle (sur la rupture)
    const indemniteTransactionnelle = p.indemniteTransactionnelle || 0;
    const indemniteGlobaleRupture = r2(IMRT + indemniteSupra + indemniteTransactionnelle);

    // IFC dans le barème
    const IFCBareme = calculerMontantIFCBareme(ancienneteMois, salaireMensuelBrut);

    // Indemnités spécifiques
    const indemniteForConciliation = p.indemniteForConciliation || 0;
    const indemniteDecisionJustice = p.indemniteDecisionJustice || 0;
    const origineIndemnite = p.origineIndemnite || 'rupture';
    const typeDecisionJustice = p.typeDecisionJustice || null;
    const droitsRetraiteOuverts = p.droitsRetraiteOuverts || false;

    // --- IT sur EXÉCUTION (ne fait PAS masse avec les indemnités de rupture — règle Boudin) ---
    const indemniteTransactionnelleExecution = p.indemniteTransactionnelleExecution || 0;
    const prejudiceMoralDemontre = p.prejudiceMoralDemontre || false;

    // --- Paramètres faute grave ---
    const fauteGraveMaintenue = (p.fauteGraveMaintenue != null) ? p.fauteGraveMaintenue : null;
    const indemniteTheoriqueLicenciement = p.indemniteTheoriqueLicenciement || 0;

    // --- Arrêt 30 janvier 2025 ---
    const arret30Janvier2025 = p.arret30Janvier2025 || false;

    // --- Alertes globales ---
    const alertes = [];

    if (ancienneteMois < 8 && !['demission', 'prise_acte'].includes(p.typeRupture)) {
      alertes.push('Ancienneté inférieure à 8 mois : pas de droit à l\'indemnité légale de licenciement (art. L.1234-9).');
    }

    if (p.salarieProtege) {
      alertes.push('Salarié protégé : procédure spéciale obligatoire avec autorisation de l\'inspection du travail (art. L.2411-1 et s.).');
    }

    // --- PARTIE 1 : Exonération IR ---
    const exonerationIR = calculerExonerationIR({
      typeRupture: p.typeRupture,
      origineIndemnite,
      typeDecisionJustice,
      IMRT,
      indemniteSupra,
      indemniteGlobaleRupture,
      indemniteTransactionnelle,
      indemniteForConciliation,
      indemniteDecisionJustice,
      IFCBareme,
      remunerationAnnuelleN1,
      droitsRetraiteOuverts,
      pass,
      salarieProtege: p.salarieProtege,
      fauteGraveMaintenue,
      indemniteTheoriqueLicenciement
    });
    alertes.push(...(exonerationIR.alertes || []));

    // --- PARTIE 2 : Exonération CSS ---
    const exonerationCSS = calculerExonerationCSS({
      typeRupture: p.typeRupture,
      origineIndemnite,
      indemniteGlobaleRupture,
      indemniteTransactionnelle,
      indemniteDecisionJustice,
      indemniteForConciliation,
      IFCBareme,
      exonerationIR,
      pass
    });
    if (exonerationCSS.alerte) alertes.push(exonerationCSS.alerte);

    // --- PARTIE 3 : Exonération CSG/CRDS ---
    const exonerationCSGCRDS = calculerExonerationCSGCRDS({
      typeRupture: p.typeRupture,
      origineIndemnite,
      IMRT,
      IFCBareme,
      indemniteGlobaleRupture,
      indemniteTransactionnelle,
      indemniteDecisionJustice,
      indemniteForConciliation,
      exonerationCSS,
      pass
    });

    // --- Total brut pour ventilation ---
    const totalBrut = r2(
      indemniteGlobaleRupture +
      (indemniteDecisionJustice || 0) +
      (indemniteForConciliation || 0)
    );

    // --- VENTILATION à 4 lignes ---
    const { ventilation, totaux } = calculerVentilation({
      exonerationIR, exonerationCSS, exonerationCSGCRDS,
      totalBrut, tauxPAS
    });

    // --- PARTIE 4 : Contribution patronale ---
    const contributionPatronale = calculerContributionPatronale({
      typeRupture: p.typeRupture,
      origineIndemnite,
      exonerationCSS,
      droitsRetraiteOuverts
    });

    // --- Forfait social ---
    const forfaitSocial = calculerForfaitSocial({
      exonerationCSS, exonerationCSGCRDS
    });

    // --- Différé ARE ---
    const differesChomage = calculerDifferesChomage({
      typeRupture: p.typeRupture,
      origineIndemnite,
      indemniteGlobaleRupture,
      indemniteLegale,
      indemniteForConciliation,
      IFCBareme,
      ICCPjours: p.ICCPjours || 0,
      salaireMensuelBrut,
      licenciementEcoRefusCSP: p.licenciementEcoRefusCSP || false
    });

    // --- TRAITEMENT IT SUR EXÉCUTION (séparé de la rupture — règle Boudin) ---
    let itExecution = null;
    if (indemniteTransactionnelleExecution > 0) {
      // L'IT exécution NE FAIT PAS MASSE avec les indemnités de rupture
      // Elle n'entre PAS dans l'IGR pour le calcul IR/CSS/CSG-CRDS
      let cssExecution = indemniteTransactionnelleExecution; // assujettie par défaut
      let cssExoneree = 0;
      let csgCrdsExecution = r2(indemniteTransactionnelleExecution * TAUX_CSG_CRDS);
      let csgCrdsExoneree = 0;
      let noteExecution = '';

      if (prejudiceMoralDemontre) {
        // Préjudice moral/personnel démontré → exonérée CSS (Cass. 2e civ. 17 fév. 2022, n° 20-19.516)
        cssExoneree = indemniteTransactionnelleExecution;
        cssExecution = 0;
        // CSG/CRDS : point en débat, tendance à exonérer (BOSS) sauf montant élevé
        csgCrdsExoneree = indemniteTransactionnelleExecution;
        csgCrdsExecution = 0;
        noteExecution = 'IT exécution exonérée CSS (préjudice moral démontré, Cass. 2e civ. 17 fév. 2022). CSG/CRDS : tendance à exonérer (BOSS), mais à sécuriser si montant élevé.';
      } else {
        noteExecution = 'IT exécution assujettie CSS en totalité (pas de préjudice moral démontré). CSG/CRDS assujettie.';
      }

      itExecution = {
        montantBrut: r2(indemniteTransactionnelleExecution),
        prejudiceMoralDemontre,
        cssAssujettie: r2(cssExecution),
        cssExoneree: r2(cssExoneree),
        csgCrdsAssujettie: r2(csgCrdsExecution),
        csgCrdsExoneree: r2(csgCrdsExoneree),
        // La part exécution n'entre PAS dans le net imposable de la rupture
        netExecution: prejudiceMoralDemontre
          ? r2(indemniteTransactionnelleExecution)
          : r2(indemniteTransactionnelleExecution - r2(indemniteTransactionnelleExecution * TAUX_CSS_SALARIE) - csgCrdsExecution),
        note: noteExecution,
        reference: 'Cass. 2e civ., 17 février 2022, n° 20-19.516 — Circulaire 1er avril 2025'
      };
    }

    // --- ARRÊT 30 JANVIER 2025 (option) ---
    let alerteArret30Janv = null;
    if (arret30Janvier2025 && ['licenciement', 'licenciement_scrs'].includes(p.typeRupture)) {
      alerteArret30Janv = 'Arrêt du 30 janvier 2025 (Cass. 2e civ., n° 22-18.333) : exonération IT possible si préjudice démontré. ' +
        'L\'IT peut être traitée séparément de l\'IL pour la vérification CSS (ne plus faire masse IT + IL pour les seuils CSS). ' +
        'Attention : plus le montant est élevé, plus la démonstration doit être solide. Barème Macron (3-20 mois) = limite de référence.';
      alertes.push(alerteArret30Janv);
    }

    // --- AMÉLIORATION DU NET IMPOSABLE ---
    // Calcul correct : net de charges sociales d'abord, puis réintégration CSG non déductible + CRDS
    // PAS appliqué sur le net imposable, pas sur le brut
    const partImposableIR = exonerationIR.partImposable;
    const chargesSocialesSurImposable = r2(partImposableIR * TAUX_CSS_SALARIE);
    const csgCrdsSurImposable = r2(partImposableIR * TAUX_CSG_CRDS);
    const netDeCharges = r2(partImposableIR - chargesSocialesSurImposable - csgCrdsSurImposable);
    // CSG non déductible (2,4%) et CRDS (0,5%) sont réintégrées dans le net imposable
    const csgNonDedReintegree = r2(partImposableIR * TAUX_CSG_NON_DEDUCTIBLE);
    const crdsReintegree = r2(partImposableIR * TAUX_CRDS);
    // CSG déductible (6,8%) réduit la base imposable
    const csgDedDeductible = r2(partImposableIR * TAUX_CSG_DEDUCTIBLE);
    const netImposableCorrige = r2(netDeCharges + csgNonDedReintegree + crdsReintegree);
    const impotPAS = r2(netImposableCorrige * (tauxPAS || 0));
    const netApresImpot = r2(netDeCharges - impotPAS);

    const detailNetImposable = {
      partImposableIR,
      chargesSociales: chargesSocialesSurImposable,
      csgCrds: csgCrdsSurImposable,
      netDeCharges,
      csgNonDeductibleReintegree: csgNonDedReintegree,
      crdsReintegree,
      csgDeductible: csgDedDeductible,
      netImposable: netImposableCorrige,
      tauxPAS: tauxPAS || 0,
      impotPAS,
      netApresImpot,
      note: 'Le PAS est appliqué sur le net imposable (après déduction charges sociales + CSG/CRDS, réintégration CSG non déductible + CRDS). La CSG déductible (6,8%) réduit la base IR.'
    };

    // --- Conseil stratégique ---
    const strategie = genererConseilStrategique({
      typeRupture: p.typeRupture,
      origineIndemnite,
      indemnites: { IMRT, indemniteSupra, indemniteGlobaleRupture },
      exonerationIR, exonerationCSS, exonerationCSGCRDS,
      totaux, contributionPatronale,
      differes: differesChomage,
      IFCBareme,
      ancienneteMois, salaireMensuelBrut, pass
    });

    // --- ALERTES CONTEXTUELLES (formation Boudin) ---
    // Mod. 8 : Alertes enrichies
    if (origineIndemnite === 'transaction') {
      alertes.push('RAPPEL : Toujours négocier en BRUT, jamais en net. Le contradicteur négocie en brut ou en coût employeur.');
    }

    if (p.salarieProtege) {
      alertes.push('ATTENTION : Les dossiers de salariés protégés sont les plus complexes. Un mauvais montage peut entraîner un assujettissement total. Privilégiez le licenciement + transaction.');
    }

    if (remunerationAnnuelleN1 < salaireMensuelBrut * 10) {
      alertes.push('INFO : La rémunération annuelle N-1 (' + r2(remunerationAnnuelleN1) + ' €) est inférieure au salaire habituel. Rappel : pas de reconstitution de salaire en cas d\'absence, maladie, congé parental (Cass. 2e civ. 21 sept. 2017). Le double de la rém. N-1 sera faible.');
    }

    if (p.typeRupture === 'rupture_conventionnelle' && indemniteTransactionnelle > 0) {
      alertes.push('ATTENTION : Impossible de transiger sur la RUPTURE après une RC (JP constante : Cass. soc. 2014, 2015, 2021, 2026). Transaction uniquement sur l\'EXÉCUTION.');
    }

    if (indemniteTransactionnelleExecution > 0) {
      alertes.push('CONSEIL : Prévoir 2 documents séparés — PV de conciliation sur la rupture + transaction sur l\'exécution. La transaction sur l\'exécution doit être signée AVANT le PV.');
    }

    // --- Réponse complète ---
    return res.json({
      parametres: {
        typeRupture: p.typeRupture,
        origineIndemnite,
        ancienneteMois,
        ancienneteAnnees: r2(ancienneteAnnees),
        salaireMensuelBrut,
        remunerationAnnuelleN1,
        anneeRupture,
        tauxPAS,
        droitsRetraiteOuverts,
        salarieProtege: p.salarieProtege || false,
        conventionCollective: p.conventionCollective || null,
        fauteGraveMaintenue: fauteGraveMaintenue,
        indemniteTheoriqueLicenciement: r2(indemniteTheoriqueLicenciement),
        arret30Janvier2025,
        prejudiceMoralDemontre
      },
      pass,
      indemnites: {
        indemniteMinimaleLegale: r2(indemniteLegale),
        indemniteMinimaleConventionnelle: r2(indemniteConventionnelle),
        IMRT,
        indemniteSupra: r2(indemniteSupra),
        indemniteGlobaleRupture,
        indemniteTransactionnelle: r2(indemniteTransactionnelle),
        indemniteTransactionnelleExecution: r2(indemniteTransactionnelleExecution),
        IFC: IFCBareme,
        IFCBaremeMois: calculerIFCBareme(ancienneteAnnees),
        indemniteDecisionJustice: r2(indemniteDecisionJustice),
        indemniteForConciliation: r2(indemniteForConciliation)
      },
      exonerations: {
        ir: exonerationIR,
        css: exonerationCSS,
        csgCrds: exonerationCSGCRDS
      },
      ventilation,
      totaux,
      detailNetImposable,
      itExecution,
      contributionPatronale,
      forfaitSocial,
      differesChomage,
      alertes,
      strategie,
      references: [
        'Art. 80 duodecies du CGI — Régime fiscal des indemnités de rupture',
        'Art. L.242-1 du CSS — Cotisations de sécurité sociale',
        'Art. L.136-1-1 du CSS — CSG/CRDS sur les revenus de remplacement',
        'Art. L.137-15 du CSS — Forfait social',
        'Art. L.137-12 du CSS — Contribution patronale mise à la retraite',
        'Art. R.1234-2 du Code du travail — Indemnité légale de licenciement',
        'Art. D.1235-21 du Code du travail — Barème IFC',
        'Lettre circulaire ACOSS du 28 mars 2013 — Transaction post-RC',
        'Circulaire Unédic n° 2014-26 — Différé d\'indemnisation ARE',
        'Cass. 2e civ., 15 mars et 21 juin 2018 — Faute grave et préavis',
        'Cass. 2e civ., 30 janvier 2025, n° 22-18.333 — Extension exonération CRS',
        'Cass. 2e civ., 17 février 2022, n° 20-19.516 — IT exécution et préjudice moral',
        'BOSS n° 1750 et 1760 — Faute grave maintenue',
        'BOSS n° 1901 — CSG/CRDS SCRS dans la limite de 2 PASS (déc. 2022)',
        'Circulaire 1er avril 2025 — Différé IT exécution'
      ]
    });
  } catch (err) {
    console.error('[simulateur-indemnites/simuler]', err.message, err.stack);
    return res.status(500).json({ error: 'Erreur de calcul : ' + err.message });
  }
});

// ================================================
// GET /bareme-ifc — Barème IFC complet
// ================================================

router.get('/bareme-ifc', requireAvocat, (req, res) => {
  const bareme = BAREME_IFC.map(tranche => {
    let description;
    if (tranche.parAn) {
      description = tranche.mois + ' mois + ' + tranche.parAn + ' mois par année supplémentaire';
    } else {
      description = tranche.mois + ' mois de salaire';
    }
    return {
      ancienneteMin: tranche.minAnciennete + ' ans',
      ancienneteMax: tranche.maxAnciennete === Infinity ? '30+ ans' : tranche.maxAnciennete + ' ans',
      moisIndemnite: tranche.mois,
      parAnSupp: tranche.parAn || null,
      description
    };
  });

  return res.json({
    bareme,
    reference: 'Article D.1235-21 du Code du travail',
    note: 'L\'IFC dans le barème bénéficie d\'une exonération totale IR + CSS + CSG/CRDS dans le cadre d\'un PV de conciliation.'
  });
});

// ================================================
// GET /pass/:annee — PASS pour une année donnée
// ================================================

router.get('/pass/:annee', requireAvocat, (req, res) => {
  const annee = parseInt(req.params.annee, 10);
  if (isNaN(annee) || annee < 2020 || annee > 2030) {
    return res.status(400).json({ error: 'Année invalide (2020-2030)' });
  }

  const passAnnee = getPASS(annee);
  return res.json({
    annee,
    pass: passAnnee,
    seuils: {
      '2_PASS': r2(2 * passAnnee),
      '5_PASS': r2(5 * passAnnee),
      '6_PASS': r2(6 * passAnnee),
      '10_PASS': r2(10 * passAnnee)
    },
    historique: PASS,
    reference: 'Arrêté annuel fixant le plafond de sécurité sociale'
  });
});

// ================================================
// GET /indemnite-legale — Calcul isolé de l'indemnité légale
// ================================================

router.get('/indemnite-legale', requireAvocat, (req, res) => {
  const ancienneteMois = parseInt(req.query.ancienneteMois, 10);
  const salaireMensuelBrut = parseFloat(req.query.salaireMensuelBrut);

  if (isNaN(ancienneteMois) || isNaN(salaireMensuelBrut)) {
    return res.status(400).json({ error: 'ancienneteMois et salaireMensuelBrut requis en query params' });
  }

  const ancienneteAnnees = ancienneteMois / 12;
  const indemniteLegale = calculerIndemniteLegale(ancienneteMois, salaireMensuelBrut);
  const ifcBareme = calculerMontantIFCBareme(ancienneteMois, salaireMensuelBrut);
  const ifcBaremeMois = calculerIFCBareme(ancienneteAnnees);

  return res.json({
    ancienneteMois,
    ancienneteAnnees: r2(ancienneteAnnees),
    salaireMensuelBrut,
    indemniteLegale,
    detail: {
      partMoins10ans: r2(Math.min(ancienneteAnnees, 10) * 0.25 * salaireMensuelBrut),
      partPlus10ans: ancienneteAnnees > 10 ? r2((ancienneteAnnees - 10) * (1 / 3) * salaireMensuelBrut) : 0,
      minimumAnciennete: '8 mois (art. L.1234-9)'
    },
    ifcBareme: {
      mois: ifcBaremeMois,
      montant: ifcBareme
    },
    reference: 'Art. R.1234-2 et R.1234-4 du Code du travail'
  });
});

// ================================================
// POST /comparer — Comparaison de 2 scénarios côte à côte
// ================================================

router.post('/comparer', requireAvocat, async (req, res) => {
  try {
    const scenarios = req.body;

    if (!Array.isArray(scenarios) || scenarios.length !== 2) {
      return res.status(400).json({ error: 'Le body doit contenir un tableau de exactement 2 scénarios de simulation.' });
    }

    // Simuler les 2 scénarios
    const resultats = [];
    for (const scenario of scenarios) {
      // Réutiliser la logique du simulateur
      const p = scenario;
      const anneeRupture = p.anneeRupture || 2026;
      const pass = getPASS(anneeRupture);
      const ancienneteMois = p.ancienneteMois || 0;
      const ancienneteAnnees = ancienneteMois / 12;
      const salaireMensuelBrut = p.salaireMensuelBrut || 0;
      const remunerationAnnuelleN1 = p.remunerationAnnuelleN1 || (salaireMensuelBrut * 12);

      const indemniteLegale = (p.indemniteMinimaleLegale != null)
        ? p.indemniteMinimaleLegale
        : calculerIndemniteLegale(ancienneteMois, salaireMensuelBrut);
      const indemniteConventionnelle = p.indemniteMinimaleConventionnelle || 0;
      const IMRT = r2(Math.max(indemniteLegale, indemniteConventionnelle));
      const indemniteSupra = p.indemniteSupra || 0;
      const indemniteTransactionnelle = p.indemniteTransactionnelle || 0;
      const indemniteGlobaleRupture = r2(IMRT + indemniteSupra + indemniteTransactionnelle);
      const IFCBareme = calculerMontantIFCBareme(ancienneteMois, salaireMensuelBrut);
      const indemniteForConciliation = p.indemniteForConciliation || 0;
      const indemniteDecisionJustice = p.indemniteDecisionJustice || 0;

      const exoIR = calculerExonerationIR({
        typeRupture: p.typeRupture || 'licenciement',
        origineIndemnite: p.origineIndemnite || 'rupture',
        typeDecisionJustice: p.typeDecisionJustice || null,
        IMRT, indemniteSupra, indemniteGlobaleRupture,
        indemniteTransactionnelle, indemniteForConciliation,
        indemniteDecisionJustice, IFCBareme,
        remunerationAnnuelleN1,
        droitsRetraiteOuverts: p.droitsRetraiteOuverts || false,
        pass, salarieProtege: p.salarieProtege || false
      });

      const exoCSS = calculerExonerationCSS({
        typeRupture: p.typeRupture || 'licenciement',
        origineIndemnite: p.origineIndemnite || 'rupture',
        indemniteGlobaleRupture, indemniteTransactionnelle,
        indemniteDecisionJustice, indemniteForConciliation,
        IFCBareme, exonerationIR: exoIR, pass
      });

      const exoCSGCRDS = calculerExonerationCSGCRDS({
        typeRupture: p.typeRupture || 'licenciement',
        origineIndemnite: p.origineIndemnite || 'rupture',
        IMRT, IFCBareme,
        indemniteGlobaleRupture, indemniteTransactionnelle,
        indemniteDecisionJustice, indemniteForConciliation,
        exonerationCSS: exoCSS, pass
      });

      const totalBrut = r2(indemniteGlobaleRupture + indemniteDecisionJustice + indemniteForConciliation);
      const { ventilation, totaux } = calculerVentilation({
        exonerationIR: exoIR, exonerationCSS: exoCSS, exonerationCSGCRDS: exoCSGCRDS,
        totalBrut, tauxPAS: p.tauxPAS || 0
      });

      const contrib = calculerContributionPatronale({
        typeRupture: p.typeRupture || 'licenciement',
        origineIndemnite: p.origineIndemnite || 'rupture',
        exonerationCSS: exoCSS,
        droitsRetraiteOuverts: p.droitsRetraiteOuverts || false
      });

      const differes = calculerDifferesChomage({
        typeRupture: p.typeRupture || 'licenciement',
        origineIndemnite: p.origineIndemnite || 'rupture',
        indemniteGlobaleRupture, indemniteLegale: indemniteLegale,
        indemniteForConciliation, IFCBareme,
        ICCPjours: p.ICCPjours || 0, salaireMensuelBrut,
        licenciementEcoRefusCSP: p.licenciementEcoRefusCSP || false
      });

      resultats.push({
        label: p.label || ('Scénario ' + (resultats.length + 1)),
        typeRupture: p.typeRupture,
        origineIndemnite: p.origineIndemnite || 'rupture',
        indemnites: { IMRT, indemniteSupra: r2(indemniteSupra), indemniteGlobaleRupture },
        exonerations: { ir: exoIR, css: exoCSS, csgCrds: exoCSGCRDS },
        totaux,
        contributionPatronale: contrib,
        differesChomage: differes
      });
    }

    // Comparaison
    const s1 = resultats[0];
    const s2 = resultats[1];
    const comparaison = {
      netSalarie: {
        scenario1: s1.totaux.netChargesImpot,
        scenario2: s2.totaux.netChargesImpot,
        difference: r2(s1.totaux.netChargesImpot - s2.totaux.netChargesImpot),
        meilleur: s1.totaux.netChargesImpot >= s2.totaux.netChargesImpot ? s1.label : s2.label
      },
      coutEmployeur: {
        scenario1: r2(s1.totaux.coutEmployeur + s1.contributionPatronale.montant),
        scenario2: r2(s2.totaux.coutEmployeur + s2.contributionPatronale.montant),
        difference: r2(
          (s1.totaux.coutEmployeur + s1.contributionPatronale.montant) -
          (s2.totaux.coutEmployeur + s2.contributionPatronale.montant)
        ),
        moinsCher: (s1.totaux.coutEmployeur + s1.contributionPatronale.montant) <=
                   (s2.totaux.coutEmployeur + s2.contributionPatronale.montant) ? s1.label : s2.label
      },
      differesARE: {
        scenario1: s1.differesChomage.totalJours,
        scenario2: s2.differesChomage.totalJours,
        difference: s1.differesChomage.totalJours - s2.differesChomage.totalJours,
        plusCourt: s1.differesChomage.totalJours <= s2.differesChomage.totalJours ? s1.label : s2.label
      },
      tauxPrelevementEffectif: {
        scenario1: s1.totaux.brut > 0 ? r2(((s1.totaux.brut - s1.totaux.netChargesImpot) / s1.totaux.brut) * 100) : 0,
        scenario2: s2.totaux.brut > 0 ? r2(((s2.totaux.brut - s2.totaux.netChargesImpot) / s2.totaux.brut) * 100) : 0
      }
    };

    // Recommandation
    let recommandation = '';
    if (comparaison.netSalarie.difference > 0) {
      recommandation = s1.label + ' est plus favorable pour le salarié (+' + comparaison.netSalarie.difference + ' € net). ';
    } else if (comparaison.netSalarie.difference < 0) {
      recommandation = s2.label + ' est plus favorable pour le salarié (+' + Math.abs(comparaison.netSalarie.difference) + ' € net). ';
    } else {
      recommandation = 'Les deux scénarios produisent un net identique. ';
    }

    if (comparaison.coutEmployeur.scenario1 !== comparaison.coutEmployeur.scenario2) {
      recommandation += comparaison.coutEmployeur.moinsCher + ' est moins coûteux pour l\'employeur (' +
        Math.min(comparaison.coutEmployeur.scenario1, comparaison.coutEmployeur.scenario2) + ' € vs ' +
        Math.max(comparaison.coutEmployeur.scenario1, comparaison.coutEmployeur.scenario2) + ' €). ';
    }

    if (comparaison.differesARE.scenario1 !== comparaison.differesARE.scenario2) {
      recommandation += comparaison.differesARE.plusCourt + ' offre un délai ARE plus court (' +
        Math.min(comparaison.differesARE.scenario1, comparaison.differesARE.scenario2) + ' jours vs ' +
        Math.max(comparaison.differesARE.scenario1, comparaison.differesARE.scenario2) + ' jours).';
    }

    return res.json({
      scenarios: resultats,
      comparaison,
      recommandation,
      references: [
        'Art. 80 duodecies CGI — Exonération IR',
        'Art. L.242-1 CSS — Cotisations sociales',
        'Art. L.136-1-1 CSS — CSG/CRDS',
        'Circulaire Unédic — Différé ARE'
      ]
    });
  } catch (err) {
    console.error('[simulateur-indemnites/comparer]', err.message, err.stack);
    return res.status(500).json({ error: 'Erreur de comparaison : ' + err.message });
  }
});

module.exports = router;
