// =============================================
// JADOMI AVOCAT — Stratégie de Départ & Optimisation
// Régime social et fiscal de CHAQUE type de rupture
// Optimise pour que le salarié paie le MOINS de charges
//
// 7 scénarios : démission, licenciement CRS, licenciement SCR,
// rupture conventionnelle, transaction, PSE, retraite
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

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
// CONSTANTES 2026
// ================================================
const PASS = 47100;
const CSG_TAUX = 0.092;
const CSG_DEDUCTIBLE = 0.068;
const CRDS_TAUX = 0.005;
const FORFAIT_SOCIAL_RC = 0.20; // Rupture conv. côté employeur

// Barème Macron
const BAREME = [
  [0,0,1],[1,1,2],[2,3,3.5],[3,3,4],[4,3,5],[5,3,6],[6,3,7],[7,3,8],[8,3,8],
  [9,3,9],[10,3,10],[11,3,10.5],[12,3,11],[13,3,11.5],[14,3,12],[15,3,13],
  [16,3,13.5],[17,3,14],[18,3,14.5],[19,3,15],[20,3,15.5],[21,3,16],
  [22,3,16.5],[23,3,17],[24,3,17.5],[25,3,18],[26,3,18.5],[27,3,19],
  [28,3,19.5],[29,3,20],[30,3,20]
];

function r2(n) { return Math.round(n * 100) / 100; }

function indLegale(anc, sal) {
  if (anc < 0.67) return 0;
  return anc <= 10
    ? r2(0.25 * sal * anc)
    : r2(0.25 * sal * 10 + (1/3) * sal * (anc - 10));
}

function getMacron(anc) {
  const i = Math.min(Math.floor(anc), 30);
  const row = BAREME[i] || BAREME[30];
  return { plancher: row[1], plafond: row[2] };
}

// ================================================
// RÉGIMES FISCAUX ET SOCIAUX PAR TYPE DE RUPTURE
// ================================================

function regimeDemission(sal, anc, params) {
  // Démission = aucune indemnité légale, tout est négocié
  // Si transaction après démission : art. 80 duodecies NE S'APPLIQUE PAS
  // L'indemnité transactionnelle post-démission = 100% imposable + 100% charges
  return {
    type: 'demission',
    label: 'Démission',
    indemnite_legale: 0,
    preavis: { mois: params.cadre ? 3 : (anc >= 2 ? 2 : 1), a_effectuer: true },
    regime_fiscal: {
      exoneration_ir: 0,
      raison: 'La démission n\'ouvre droit à aucune indemnité légale. Tout montant négocié est imposable.',
      reference: 'Art. 80 duodecies CGI — ne s\'applique pas à la démission'
    },
    regime_social: {
      exoneration_csg: 0,
      exoneration_cotisations: 0,
      raison: 'Indemnité transactionnelle post-démission = salaire = charges sociales intégrales'
    },
    assedic: false,
    assedic_detail: 'Pas de droit au chômage sauf démission légitime (art. L.5422-1)',
    optimisation: [
      'ÉVITER la démission si possible — le régime fiscal est le PIRE',
      'Négocier une rupture conventionnelle à la place (exonération possible)',
      'Si démission déjà actée : la transaction post-démission est 100% imposable + chargée',
      'Seule exception : requalification en licenciement par le CPH'
    ]
  };
}

function regimeLicenciementCRS(sal, anc, params) {
  // Licenciement pour cause réelle et sérieuse
  const indLeg = indLegale(anc, sal);
  const indConv = params.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);

  return {
    type: 'licenciement_crs',
    label: 'Licenciement pour cause réelle et sérieuse',
    indemnite_legale: indLeg,
    indemnite_conventionnelle: indConv,
    indemnite_retenue: indRetenue,
    preavis: { mois: params.cadre ? 3 : (anc >= 2 ? 2 : 1), a_effectuer: !params.dispense_preavis },
    regime_fiscal: {
      // Exonération IR = indemnité légale ou conventionnelle (la partie obligatoire)
      exoneration_ir: indRetenue,
      raison: 'L\'indemnité légale/conventionnelle de licenciement est exonérée d\'IR (art. 80 duodecies, 1°)',
      reference: 'Art. 80 duodecies du CGI'
    },
    regime_social: {
      exoneration_csg: indRetenue,
      exoneration_cotisations: Math.min(indRetenue, 2 * PASS),
      raison: 'CSG/CRDS exonérées sur la part légale/conventionnelle. Cotisations exonérées dans la limite de 2 PASS.'
    },
    assedic: true,
    assedic_detail: 'Droit au chômage ouvert (7 mois min de travail sur 24 derniers mois)',
    dommages_interets: null,
    optimisation: [
      'Pas de dommages-intérêts si cause réelle et sérieuse confirmée',
      'Négocier un départ → rupture conventionnelle peut être plus intéressant',
      'Vérifier la convention collective pour une indemnité conventionnelle plus favorable'
    ]
  };
}

function regimeLicenciementSCR(sal, anc, params) {
  // Licenciement SANS cause réelle et sérieuse
  const indLeg = indLegale(anc, sal);
  const indConv = params.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const macron = getMacron(anc);
  const remN1 = params.remuneration_n1 || sal * 12;

  // DI barème Macron
  const diPlancher = r2(macron.plancher * sal);
  const diPlafond = r2(macron.plafond * sal);
  const diMedian = r2(((macron.plancher + macron.plafond) / 2) * sal);

  // Total indemnitaire
  const totalBrut = r2(indRetenue + diMedian);

  // Exonération IR (art. 80 duodecies) — le plus élevé des 3 options
  const opt1 = indRetenue; // légale ou conventionnelle
  const opt2 = 2 * remN1;
  const opt3 = totalBrut * 0.5;
  const exonerationIR = r2(Math.min(Math.max(opt1, opt2, opt3), 6 * PASS));
  const imposable = r2(Math.max(0, totalBrut - exonerationIR));

  // CSG/CRDS sur la part > indemnité légale
  const assietteCsg = r2(Math.max(0, totalBrut - indRetenue));
  const csg = r2(assietteCsg * CSG_TAUX);
  const crds = r2(assietteCsg * CRDS_TAUX);

  // Cotisations sociales
  let cotisations = 0;
  if (totalBrut > 10 * PASS) {
    cotisations = r2(totalBrut * 0.22);
  } else if (totalBrut > 2 * PASS) {
    cotisations = r2((totalBrut - 2 * PASS) * 0.22);
  }

  return {
    type: 'licenciement_scr',
    label: 'Licenciement sans cause réelle et sérieuse',
    indemnite_legale: indLeg,
    indemnite_conventionnelle: indConv,
    indemnite_retenue: indRetenue,
    bareme_macron: { plancher: diPlancher, plafond: diPlafond, median: diMedian, mois_plancher: macron.plancher, mois_plafond: macron.plafond },
    total_brut_median: totalBrut,
    regime_fiscal: {
      exoneration_ir: exonerationIR,
      part_imposable: imposable,
      detail: { option1_legale: r2(opt1), option2_double_rem: r2(opt2), option3_moitie: r2(opt3), plafond_6pass: 6 * PASS },
      reference: 'Art. 80 duodecies du CGI — le plus élevé des 3 options, plafonné à 6 PASS'
    },
    regime_social: { csg, crds, cotisations, assiette_csg: assietteCsg },
    assedic: true,
    optimisation: [
      'Le barème Macron encadre les DI — négocier dans la fourchette haute si dossier solide',
      'L\'exonération IR est très favorable (jusqu\'à 6 PASS = ' + (6 * PASS) + ' €)',
      'Pour les hauts salaires : attention au seuil 10 PASS (' + (10 * PASS) + ' €) → charges sur la totalité',
      'Stratégie : décomposer l\'indemnité pour maximiser la part exonérée'
    ]
  };
}

function regimeRuptureConventionnelle(sal, anc, params) {
  const indLeg = indLegale(anc, sal);
  const indConv = params.indemnite_conventionnelle || 0;
  const indMin = Math.max(indLeg, indConv); // minimum = légale ou conv
  const indNegociee = params.indemnite_negociee || indMin;
  const remN1 = params.remuneration_n1 || sal * 12;

  // Part légale/conv vs supra-légal
  const partLegale = indMin;
  const partSupraLegale = r2(Math.max(0, indNegociee - indMin));

  // Exonération IR — MÊME RÉGIME que licenciement (art. 80 duodecies)
  const opt1 = indMin;
  const opt2 = 2 * remN1;
  const opt3 = indNegociee * 0.5;
  const exonerationIR = r2(Math.min(Math.max(opt1, opt2, opt3), 6 * PASS));
  const imposable = r2(Math.max(0, indNegociee - exonerationIR));

  // CSG/CRDS : exonération sur la part légale/conventionnelle uniquement
  const assietteCsg = r2(Math.max(0, indNegociee - indMin));
  const csg = r2(assietteCsg * CSG_TAUX);
  const crds = r2(assietteCsg * CRDS_TAUX);

  // Cotisations : exonérées dans la limite de 2 PASS
  let cotisations = 0;
  if (indNegociee > 10 * PASS) {
    cotisations = r2(indNegociee * 0.22);
  } else if (indNegociee > 2 * PASS) {
    cotisations = r2((indNegociee - 2 * PASS) * 0.22);
  }

  // Forfait social 20% côté employeur (sur la part exonérée de cotisations)
  const forfaitSocial = r2(Math.min(indNegociee, 2 * PASS) * FORFAIT_SOCIAL_RC);

  return {
    type: 'rupture_conventionnelle',
    label: 'Rupture conventionnelle',
    indemnite_minimum: indMin,
    indemnite_negociee: indNegociee,
    part_legale: partLegale,
    part_supra_legale: partSupraLegale,
    regime_fiscal: {
      exoneration_ir: exonerationIR,
      part_imposable: imposable,
      detail: { option1_legale: r2(opt1), option2_double_rem: r2(opt2), option3_moitie: r2(opt3) },
      reference: 'Art. 80 duodecies CGI — même régime que licenciement'
    },
    regime_social: {
      csg, crds, cotisations,
      forfait_social_employeur: forfaitSocial,
      note: 'Le forfait social 20% est à la charge de l\'employeur, pas du salarié'
    },
    assedic: true,
    assedic_detail: 'Droit au chômage ouvert après le délai de carence (max 150 jours)',
    delai_carence_pole_emploi: {
      carence_cp: params.jours_cp_restants ? Math.min(30, params.jours_cp_restants) : 0,
      carence_supra_legal: Math.min(150, Math.floor(partSupraLegale / (sal / 30))),
      carence_fixe: 7,
      explication: 'Délai avant versement ARE = 7j fixe + carence CP + carence supra-légal (plafonné 150j)'
    },
    optimisation: [
      '✅ MEILLEUR RÉGIME dans la plupart des cas — exonérations + chômage',
      'Négocier au-dessus du minimum légal : la part supra-légale est exonérée d\'IR (dans les limites)',
      'ATTENTION au délai de carence Pôle Emploi : plus le supra-légal est élevé, plus le délai est long',
      'Stratégie : si le supra-légal est élevé, envisager de ventiler en indemnité de non-concurrence (régime différent)',
      'Vérifier si le salarié est proche de la retraite → régime différent (art. L.1237-9)',
      'Le forfait social 20% est à la charge de l\'employeur — argument de négociation'
    ]
  };
}

function regimeTransaction(sal, anc, params) {
  const indLeg = indLegale(anc, sal);
  const indConv = params.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const montantTransaction = params.montant_transaction || 0;
  const remN1 = params.remuneration_n1 || sal * 12;

  // La transaction intervient APRÈS un licenciement (ou rupture conv.)
  // L'indemnité transactionnelle = le supra-légal négocié
  const dejaPercu = params.indemnite_deja_percue || indRetenue;
  const totalIndemnitaire = r2(dejaPercu + montantTransaction);

  // Exonération IR sur le TOTAL (légal + transactionnel)
  const opt1 = indRetenue;
  const opt2 = 2 * remN1;
  const opt3 = totalIndemnitaire * 0.5;
  const exonerationIR = r2(Math.min(Math.max(opt1, opt2, opt3), 6 * PASS));
  const imposable = r2(Math.max(0, totalIndemnitaire - exonerationIR));

  // CSG/CRDS sur la part > légale
  const assietteCsg = r2(Math.max(0, totalIndemnitaire - indRetenue));
  const csg = r2(assietteCsg * CSG_TAUX);
  const crds = r2(assietteCsg * CRDS_TAUX);

  // Cotisations
  let cotisations = 0;
  if (totalIndemnitaire > 10 * PASS) {
    cotisations = r2(totalIndemnitaire * 0.22);
  } else if (totalIndemnitaire > 2 * PASS) {
    cotisations = r2((totalIndemnitaire - 2 * PASS) * 0.22);
  }

  // Impôt sur le revenu
  const tmi = params.tmi_client || 0.30;
  const ir = r2(imposable * tmi);

  // Net
  const honoraires = params.honoraires_avocat_ht || 0;
  const honorairesTTC = r2(honoraires * 1.20);
  const netClient = r2(totalIndemnitaire - csg - crds - cotisations - ir - honorairesTTC);

  return {
    type: 'transaction',
    label: 'Protocole transactionnel (art. 2044 Code civil)',
    indemnite_licenciement: dejaPercu,
    indemnite_transactionnelle: montantTransaction,
    total_indemnitaire: totalIndemnitaire,
    regime_fiscal: {
      exoneration_ir: exonerationIR,
      part_imposable: imposable,
      impot_revenu: ir,
      tmi_applique: tmi,
      reference: 'Art. 80 duodecies CGI'
    },
    regime_social: { csg, crds, cotisations },
    honoraires: { ht: honoraires, ttc: honorairesTTC },
    net_client: netClient,
    taux_prelevement_effectif: r2(((totalIndemnitaire - netClient) / totalIndemnitaire) * 100),
    optimisation: [
      'Décomposer le montant : indemnité de licenciement (exonérée) + DI (partiellement exonérés) + indemnité non-concurrence (régime propre)',
      'Si la transaction fait suite à un licenciement : le cumul légal + transactionnel bénéficie de l\'exonération',
      'Si la transaction fait suite à une DÉMISSION : PAS d\'exonération → tout est imposable + chargé',
      'Stratégie clause de non-concurrence : peut être exonérée de cotisations si renoncée dans le protocole',
      'Négocier la prise en charge des frais d\'outplacement par l\'employeur (non imposable pour le salarié)',
      'Épargne salariale : si le salarié a de la participation/intéressement, le déblocage anticipé est exonéré d\'IR'
    ]
  };
}

function regimePSE(sal, anc, params) {
  const indLeg = indLegale(anc, sal);
  const indConv = params.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const indPSE = params.indemnite_pse || 0;
  const totalIndemnitaire = r2(indRetenue + indPSE);

  return {
    type: 'pse',
    label: 'Plan de Sauvegarde de l\'Emploi (PSE)',
    indemnite_legale: indRetenue,
    indemnite_pse: indPSE,
    total: totalIndemnitaire,
    regime_fiscal: {
      exoneration_ir: r2(Math.min(totalIndemnitaire, 6 * PASS)),
      raison: 'Exonération TOTALE d\'IR dans la limite de 6 PASS pour les indemnités versées dans le cadre d\'un PSE',
      reference: 'Art. 80 duodecies, 1° CGI — exonération renforcée PSE'
    },
    regime_social: {
      exoneration_csg: r2(Math.min(totalIndemnitaire, 2 * PASS)),
      csg_due: r2(Math.max(0, totalIndemnitaire - 2 * PASS) * CSG_TAUX),
      raison: 'CSG/CRDS exonérées dans la limite de 2 PASS'
    },
    assedic: true,
    assedic_detail: 'Droit au chômage immédiat (pas de carence supra-légal en PSE)',
    optimisation: [
      '✅ RÉGIME LE PLUS FAVORABLE — exonération IR totale jusqu\'à 6 PASS',
      'Pas de carence Pôle Emploi sur le supra-légal (contrairement à la rupture conv.)',
      'Mesures d\'accompagnement (reclassement, formation) = non imposables',
      'Congé de reclassement : allocation exonérée d\'IR et de cotisations',
      'Le PSE est le meilleur scénario fiscalement — si l\'entreprise le propose, l\'accepter'
    ]
  };
}

function regimeRetraite(sal, anc, params) {
  const indLeg = indLegale(anc, sal);
  const miseRetraite = params.mise_a_la_retraite; // true = employeur, false = départ volontaire

  if (miseRetraite) {
    return {
      type: 'mise_retraite',
      label: 'Mise à la retraite par l\'employeur',
      indemnite: Math.max(indLeg, params.indemnite_conventionnelle || 0),
      regime_fiscal: {
        exoneration_ir: Math.max(indLeg, params.indemnite_conventionnelle || 0),
        raison: 'Même régime que le licenciement (art. 80 duodecies)',
        reference: 'Art. 80 duodecies CGI'
      },
      regime_social: {
        contribution_patronale: '50% sur la part > 5 PASS (art. L.137-12 CSS)',
        csg_crds: 'Sur la part > indemnité légale/conventionnelle'
      },
      assedic: false,
      optimisation: ['Régime proche du licenciement — relativement favorable pour le salarié']
    };
  }

  return {
    type: 'depart_retraite',
    label: 'Départ volontaire à la retraite',
    indemnite: r2(sal * (anc >= 30 ? 2 : anc >= 20 ? 1.5 : anc >= 15 ? 1 : anc >= 10 ? 0.5 : 0)),
    regime_fiscal: {
      exoneration_ir: 0,
      raison: '⚠️ AUCUNE exonération — l\'indemnité de départ en retraite est INTÉGRALEMENT imposable',
      reference: 'Art. 80 duodecies, 2° CGI'
    },
    regime_social: {
      cotisations: 'Intégralement soumise aux cotisations sociales',
      csg_crds: 'Intégralement soumise'
    },
    assedic: false,
    optimisation: [
      '⚠️ RÉGIME LE PIRE — tout est imposable et chargé',
      'Si possible : faire en sorte que ce soit l\'EMPLOYEUR qui prenne l\'initiative (mise à la retraite)',
      'Négocier un licenciement ou une rupture conventionnelle AVANT l\'âge de la retraite',
      'Utiliser le système de quotient (art. 163-0 A CGI) pour lisser l\'imposition',
      'Placer le maximum sur le PERCO/PER avant le départ (déduction fiscale)'
    ]
  };
}

// ================================================
// POST /comparer — Compare TOUS les scénarios de départ
// ================================================
router.post('/comparer', requireAvocat, async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.salaire_reference || !p.anciennete_annees) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees requis' });
    }

    const sal = p.salaire_reference;
    const anc = (p.anciennete_annees || 0) + (p.anciennete_mois || 0) / 12;

    const scenarios = {
      demission: regimeDemission(sal, anc, p),
      licenciement_crs: regimeLicenciementCRS(sal, anc, p),
      licenciement_scr: regimeLicenciementSCR(sal, anc, p),
      rupture_conventionnelle: regimeRuptureConventionnelle(sal, anc, p),
      pse: regimePSE(sal, anc, p),
      mise_retraite: regimeRetraite(sal, anc, { ...p, mise_a_la_retraite: true }),
      depart_retraite: regimeRetraite(sal, anc, { ...p, mise_a_la_retraite: false })
    };

    if (p.montant_transaction) {
      scenarios.transaction = regimeTransaction(sal, anc, p);
    }

    // Classement par avantage fiscal pour le salarié
    const classement = Object.entries(scenarios)
      .filter(([, s]) => s.regime_fiscal)
      .map(([key, s]) => ({
        scenario: key,
        label: s.label,
        exoneration_ir: s.regime_fiscal.exoneration_ir || 0,
        assedic: s.assedic,
        verdict: s.optimisation?.[0] || ''
      }))
      .sort((a, b) => b.exoneration_ir - a.exoneration_ir);

    return res.json({
      parametres: { salaire: sal, anciennete: r2(anc), cadre: !!p.cadre },
      scenarios,
      classement_fiscal: classement,
      recommandation: classement[0]
        ? 'Le scénario le plus favorable fiscalement est : ' + classement[0].label
        : null,
      references: [
        'Art. 80 duodecies CGI — Régime fiscal des indemnités de rupture',
        'Art. L.136-2 CSS — CSG/CRDS',
        'Art. L.242-1 CSS — Cotisations sociales',
        'Art. L.1235-3 Code du travail — Barème Macron',
        'Art. L.1237-11 à L.1237-16 — Rupture conventionnelle',
        'Art. 2044 Code civil — Transaction',
        'Art. L.1233-61 à L.1233-63 — PSE'
      ],
      garde_fou: 'Cette comparaison est indicative. Le régime applicable dépend de la convention collective, de la situation personnelle du salarié, et des conditions exactes de la rupture. Elle doit être validée par l\'avocat.'
    });
  } catch (err) {
    console.error('[strategie-depart/comparer]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// ================================================
// POST /optimiser — Trouve le montage optimal
// ================================================
router.post('/optimiser', requireAvocat, async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.salaire_reference || !p.anciennete_annees || !p.montant_negociable) {
      return res.status(400).json({ error: 'salaire_reference, anciennete_annees et montant_negociable requis' });
    }

    const sal = p.salaire_reference;
    const anc = (p.anciennete_annees || 0) + (p.anciennete_mois || 0) / 12;
    const montant = p.montant_negociable;
    const remN1 = p.remuneration_n1 || sal * 12;
    const indLeg = indLegale(anc, sal);
    const indConv = p.indemnite_conventionnelle || 0;
    const indMin = Math.max(indLeg, indConv);
    const tmi = p.tmi_client || 0.30;

    // Tester plusieurs ventilations du montant
    const strategies = [];

    // Stratégie 1 : Tout en indemnité de rupture conv.
    const rc = regimeRuptureConventionnelle(sal, anc, {
      ...p,
      indemnite_negociee: montant
    });
    const csgRc = r2(Math.max(0, montant - indMin) * (CSG_TAUX + CRDS_TAUX));
    const exoIrRc = Math.min(Math.max(indMin, 2 * remN1, montant * 0.5), 6 * PASS);
    const irRc = r2(Math.max(0, montant - exoIrRc) * tmi);
    const netRc = r2(montant - csgRc - irRc);
    strategies.push({
      label: 'Rupture conventionnelle — tout en indemnité',
      montant_brut: montant,
      csg_crds: csgRc,
      ir: irRc,
      net: netRc,
      taux_prelevement: r2(((montant - netRc) / montant) * 100),
      chômage: true,
      delai_carence_jours: 7 + Math.min(150, Math.floor(Math.max(0, montant - indMin) / (sal / 30)))
    });

    // Stratégie 2 : Indemnité min + non-concurrence
    const partNonConc = r2(Math.max(0, montant - indMin));
    // La clause de non-concurrence a un régime propre (imposable + CSG mais pas de cotisations si renoncée)
    const csgNc = r2(partNonConc * (CSG_TAUX + CRDS_TAUX));
    const irNc = r2(partNonConc * tmi);
    const netNc = r2(montant - csgNc - irNc);
    strategies.push({
      label: 'Indemnité minimum + clause non-concurrence (renoncée)',
      montant_brut: montant,
      decomposition: { indemnite: indMin, non_concurrence: partNonConc },
      csg_crds: csgNc,
      ir: irNc,
      net: netNc,
      taux_prelevement: r2(((montant - netNc) / montant) * 100),
      chômage: true,
      note: 'La renonciation à la clause de non-concurrence dans le protocole évite les cotisations sociales sur cette part'
    });

    // Stratégie 3 : Indemnité + outplacement payé par employeur
    const outplacement = Math.min(5000, montant * 0.15); // ~15% en outplacement
    const indApresOutplacement = r2(montant - outplacement);
    const csgOut = r2(Math.max(0, indApresOutplacement - indMin) * (CSG_TAUX + CRDS_TAUX));
    const exoIrOut = Math.min(Math.max(indMin, 2 * remN1, indApresOutplacement * 0.5), 6 * PASS);
    const irOut = r2(Math.max(0, indApresOutplacement - exoIrOut) * tmi);
    const netOut = r2(indApresOutplacement - csgOut - irOut);
    strategies.push({
      label: 'Indemnité réduite + outplacement employeur (' + r2(outplacement) + ' €)',
      montant_brut: montant,
      decomposition: { indemnite: indApresOutplacement, outplacement },
      csg_crds: csgOut,
      ir: irOut,
      net_indemnite: netOut,
      valeur_reelle: r2(netOut + outplacement),
      taux_prelevement: r2(((indApresOutplacement - netOut) / indApresOutplacement) * 100),
      note: 'L\'outplacement payé par l\'employeur n\'est pas imposable pour le salarié — c\'est du net en plus'
    });

    // Stratégie 4 : Épargne salariale (si applicable)
    if (p.epargne_salariale) {
      strategies.push({
        label: 'Déblocage épargne salariale anticipé',
        montant: p.epargne_salariale,
        regime: 'Exonéré d\'IR (sauf plus-values). CSG/CRDS à 9,7% sur les plus-values.',
        reference: 'Art. L.3324-10 Code du travail',
        note: 'Le licenciement/rupture conventionnelle est un motif de déblocage anticipé du PEE/PERCO'
      });
    }

    // Trouver la meilleure stratégie
    const meilleure = strategies
      .filter(s => s.net || s.valeur_reelle)
      .sort((a, b) => (b.valeur_reelle || b.net) - (a.valeur_reelle || a.net))[0];

    return res.json({
      parametres: { salaire: sal, anciennete: r2(anc), montant_negociable: montant, tmi },
      indemnite_minimum_legale: indMin,
      strategies,
      meilleure_strategie: meilleure ? meilleure.label : null,
      ecart_min_max: strategies.length >= 2
        ? r2(Math.max(...strategies.filter(s => s.net).map(s => s.net)) - Math.min(...strategies.filter(s => s.net).map(s => s.net)))
        : 0,
      conseil: 'La ventilation optimale dépend de la situation personnelle du salarié (TMI, situation familiale, projet professionnel). Ces stratégies doivent être adaptées par l\'avocat.',
      references: [
        'Art. 80 duodecies CGI',
        'Art. L.1237-13 Code du travail — Rupture conventionnelle',
        'Art. L.1237-3 Code du travail — Clause de non-concurrence',
        'Art. L.3324-10 Code du travail — Déblocage épargne salariale'
      ]
    });
  } catch (err) {
    console.error('[strategie-depart/optimiser]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// ================================================
// GET /regimes — Tableau récapitulatif des régimes
// ================================================
router.get('/regimes', requireAvocat, async (req, res) => {
  return res.json({
    regimes: [
      { type: 'demission', ir: '100% imposable', csg: '100%', cotisations: '100%', chomage: false, verdict: '⚠️ Le pire' },
      { type: 'licenciement_crs', ir: 'Exonéré (part légale/conv)', csg: 'Exonérée (part légale)', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, verdict: 'Correct' },
      { type: 'licenciement_scr', ir: 'Exonéré (max 3 options, ≤ 6 PASS)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, verdict: '✅ Favorable' },
      { type: 'rupture_conv', ir: 'Exonéré (même régime que licenciement)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, verdict: '✅ Très favorable' },
      { type: 'transaction', ir: 'Exonéré (cumul avec ind. licenciement)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, verdict: '✅ Favorable si post-licenciement' },
      { type: 'pse', ir: 'Exonéré TOTAL ≤ 6 PASS', csg: 'Exonérée ≤ 2 PASS', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, verdict: '✅✅ Le meilleur' },
      { type: 'mise_retraite', ir: 'Exonéré (régime licenciement)', csg: 'Sur part > légale', cotisations: 'Contribution 50% > 5 PASS', chomage: false, verdict: 'Correct' },
      { type: 'depart_retraite', ir: '100% imposable', csg: '100%', cotisations: '100%', chomage: false, verdict: '⚠️ Très mauvais' },
    ],
    pass_2026: PASS,
    references: ['Art. 80 duodecies CGI', 'Art. L.242-1, L.136-2 CSS']
  });
});

module.exports = router;
