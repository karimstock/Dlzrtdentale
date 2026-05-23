// =============================================
// JADOMI AVOCAT — Stratégie de Départ V2
// Le "Bloomberg prud'homal" : 10 scénarios, jurisprudence similaire,
// tactiques de négociation, optimisation fiscale avancée
//
// GAME CHANGER : recherche de décisions similaires (Judilibre)
// pour montrer ce que les juges ont accordé dans des cas proches
//
// Passe 94-98 — 23 mai 2026
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
// IMPORTS IA + JUDILIBRE
// ================================================
let dispatch, judilibre;
try { dispatch = require('../../lib/legal-providers/legal-ia-router').dispatch; } catch { dispatch = null; }
try { judilibre = require('../../lib/legal-providers/judilibre'); } catch { judilibre = null; }

// ================================================
// CONSTANTES 2026
// ================================================
const PASS = 47100; // Plafond Annuel Sécurité Sociale 2026
const CSG_TAUX = 0.092;
const CSG_DEDUCTIBLE = 0.068;
const CRDS_TAUX = 0.005;
const FORFAIT_SOCIAL_RC = 0.20;

// Barème Macron (art. L.1235-3) — ancienneté → [plancher mois, plafond mois]
const BAREME_MACRON = {
  0: [0, 1], 1: [1, 2], 2: [3, 3.5], 3: [3, 4], 4: [3, 5], 5: [3, 6],
  6: [3, 7], 7: [3, 8], 8: [3, 8], 9: [3, 9], 10: [3, 10], 11: [3, 10.5],
  12: [3, 11], 13: [3, 11.5], 14: [3, 12], 15: [3, 13], 16: [3, 13.5],
  17: [3, 14], 18: [3, 14.5], 19: [3, 15], 20: [3, 15.5], 21: [3, 16],
  22: [3, 16.5], 23: [3, 17], 24: [3, 17.5], 25: [3, 18], 26: [3, 18.5],
  27: [3, 19], 28: [3, 19.5], 29: [3, 20], 30: [3, 20]
};

// Barème Macron TPE (< 11 salariés)
const BAREME_MACRON_TPE = {
  0: [0, 1], 1: [0.5, 2], 2: [0.5, 3.5], 3: [1, 4], 4: [1, 5], 5: [1.5, 6],
  6: [1.5, 7], 7: [2, 8], 8: [2, 8], 9: [2.5, 9], 10: [2.5, 10]
};

function r2(n) { return Math.round(n * 100) / 100; }

// Indemnité légale de licenciement (art. R.1234-2)
function indLegale(anc, sal) {
  if (anc < 0.67) return 0; // 8 mois minimum
  return anc <= 10
    ? r2(0.25 * sal * anc)
    : r2(0.25 * sal * 10 + (1 / 3) * sal * (anc - 10));
}

// Indemnité de départ volontaire retraite (art. D.1237-1)
function indRetraiteVolontaire(anc, sal) {
  if (anc < 10) return 0;
  if (anc < 15) return r2(0.5 * sal);
  if (anc < 20) return r2(sal);
  if (anc < 30) return r2(1.5 * sal);
  return r2(2 * sal);
}

function getMacron(anc, tpe) {
  const i = Math.min(Math.floor(anc), tpe ? 10 : 30);
  const bareme = tpe ? BAREME_MACRON_TPE : BAREME_MACRON;
  const row = bareme[i] || bareme[tpe ? 10 : 30];
  return { plancher: row[0], plafond: row[1] };
}

// Préavis légal (art. L.1234-1)
function preavisLegal(anc, cadre) {
  if (cadre) return 3;
  if (anc >= 2) return 2;
  if (anc >= 0.5) return 1;
  return 0;
}

// Système du quotient (art. 163-0 A CGI)
function quotientFiscal(montantImposable, revenuAnnuelRef, tmi) {
  // Diviser par 4, calculer l'impôt marginal, multiplier par 4
  const quart = montantImposable / 4;
  const irSurQuart = quart * tmi;
  const irTotal = irSurQuart * 4;
  const irSansQuotient = montantImposable * tmi;
  return {
    ir_avec_quotient: r2(irTotal),
    ir_sans_quotient: r2(irSansQuotient),
    economie: r2(irSansQuotient - irTotal),
    applicable: montantImposable > revenuAnnuelRef,
    reference: 'Art. 163-0 A CGI'
  };
}

// Exonération IR — art. 80 duodecies (3 options, le plus élevé, plafonné 6 PASS)
function exonerationIR(indLegConv, remN1, totalBrut) {
  const opt1 = indLegConv;
  const opt2 = 2 * remN1;
  const opt3 = totalBrut * 0.5;
  const exo = r2(Math.min(Math.max(opt1, opt2, opt3), 6 * PASS));
  return {
    exoneration: exo,
    imposable: r2(Math.max(0, totalBrut - exo)),
    options: {
      option1_legale_conv: r2(opt1),
      option2_double_rem_annuelle: r2(opt2),
      option3_moitie_totale: r2(opt3),
      plafond_6pass: 6 * PASS
    },
    meilleure_option: opt1 >= opt2 && opt1 >= opt3 ? 1 : opt2 >= opt3 ? 2 : 3,
    reference: 'Art. 80 duodecies du CGI'
  };
}

// Régime social complet
function regimeSocial(totalBrut, indLegConv) {
  const assietteCsg = r2(Math.max(0, totalBrut - indLegConv));
  const csg = r2(assietteCsg * CSG_TAUX);
  const crds = r2(assietteCsg * CRDS_TAUX);
  let cotisations = 0;
  if (totalBrut > 10 * PASS) {
    cotisations = r2(totalBrut * 0.22); // Réintégration dès le 1er euro
  } else if (totalBrut > 2 * PASS) {
    cotisations = r2((totalBrut - 2 * PASS) * 0.22);
  }
  return {
    csg, crds, cotisations, assiette_csg: assietteCsg,
    total_prelevements_sociaux: r2(csg + crds + cotisations),
    seuils: { exo_cotisations: '2 PASS = ' + (2 * PASS) + ' €', reintegration_totale: '10 PASS = ' + (10 * PASS) + ' €' },
    reference: 'Art. L.242-1, L.136-2 CSS'
  };
}

// Délai de carence Pôle Emploi
function delaiCarence(partSupraLegale, salMensuel, joursCpRestants) {
  const carenceFixe = 7;
  const carenceCp = Math.min(30, joursCpRestants || 0);
  const carenceSupraLegal = Math.min(150, Math.floor(Math.max(0, partSupraLegale) / (salMensuel / 30)));
  return {
    carence_fixe: carenceFixe,
    carence_cp: carenceCp,
    carence_supra_legal: carenceSupraLegal,
    total_jours: carenceFixe + carenceCp + carenceSupraLegal,
    premier_versement_are: carenceFixe + carenceCp + carenceSupraLegal + ' jours après inscription',
    explication: 'Délai = 7j fixe + carence CP (max 30j) + carence supra-légal (max 150j)'
  };
}

// ================================================
// 10 SCÉNARIOS DE RUPTURE
// ================================================

function scenarioDemission(sal, anc, p) {
  return {
    type: 'demission', label: 'Démission',
    indemnite_legale: 0,
    preavis: { mois: preavisLegal(anc, p.cadre), a_effectuer: true, dispense_possible: false },
    regime_fiscal: { exoneration_ir: 0, imposable: 0, raison: 'La démission n\'ouvre droit à aucune indemnité légale. Tout montant négocié postérieurement est 100% imposable et chargé.', reference: 'Art. 80 duodecies CGI — inapplicable à la démission' },
    regime_social: { csg: 0, crds: 0, cotisations: 0, raison: 'Aucune indemnité = aucun prélèvement' },
    chomage: { eligible: false, exception: 'Sauf démission légitime (art. L.5422-1 : création d\'entreprise, suivi de conjoint, violences conjugales, 15 motifs listés par accord Unédic)' },
    risques: ['Aucun droit au chômage dans le cas général', 'Transaction post-démission = 100% imposable et chargée (Cass. soc., pas d\'application de l\'art. 80 duodecies)'],
    alternatives: [
      { scenario: 'rupture_conventionnelle', raison: 'Exonérations fiscales + chômage — toujours préférable à la démission' },
      { scenario: 'prise_acte', raison: 'Si l\'employeur a commis des manquements graves → requalification en licenciement SCR' },
      { scenario: 'resiliation_judiciaire', raison: 'Rester en poste + saisir le CPH → plus sûr que la prise d\'acte' }
    ],
    score_interet: 5 // Sur 100 — le pire scénario
  };
}

function scenarioLicenciementCRS(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const indConv = p.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  return {
    type: 'licenciement_crs', label: 'Licenciement pour cause réelle et sérieuse',
    indemnite_legale: indLeg, indemnite_conventionnelle: indConv, indemnite_retenue: indRetenue,
    preavis: { mois: preavisLegal(anc, p.cadre), a_effectuer: !p.dispense_preavis, indemnite_compensatrice: p.dispense_preavis ? r2(sal * preavisLegal(anc, p.cadre)) : 0 },
    regime_fiscal: { exoneration_ir: indRetenue, imposable: 0, raison: 'L\'indemnité légale/conventionnelle est intégralement exonérée d\'IR.', reference: 'Art. 80 duodecimes, 1° CGI' },
    regime_social: regimeSocial(indRetenue, indRetenue),
    chomage: { eligible: true, delai: '7 jours de carence fixe', duree: 'Selon âge et ancienneté d\'inscription (730j max pour les 53+ ans)' },
    contestation: {
      possible: true,
      motifs: ['Absence de cause réelle et sérieuse', 'Vice de procédure (entretien préalable)', 'Motif insuffisant ou imprécis'],
      si_requalifie_scr: 'Application du barème Macron → DI entre ' + getMacron(anc, p.tpe).plancher + ' et ' + getMacron(anc, p.tpe).plafond + ' mois de salaire',
      delai_contestation: '12 mois à compter de la notification (art. L.1471-1)'
    },
    score_interet: 45
  };
}

function scenarioLicenciementSCR(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const indConv = p.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const macron = getMacron(anc, p.tpe);
  const remN1 = p.remuneration_n1 || sal * 12;

  const diPlancher = r2(macron.plancher * sal);
  const diPlafond = r2(macron.plafond * sal);
  const diMedian = r2(((macron.plancher + macron.plafond) / 2) * sal);
  const totalBrut = r2(indRetenue + diMedian);

  const fiscal = exonerationIR(indRetenue, remN1, totalBrut);
  const social = regimeSocial(totalBrut, indRetenue);

  return {
    type: 'licenciement_scr', label: 'Licenciement sans cause réelle et sérieuse',
    indemnite_legale: indLeg, indemnite_conventionnelle: indConv, indemnite_retenue: indRetenue,
    bareme_macron: {
      plancher_mois: macron.plancher, plafond_mois: macron.plafond,
      plancher_euros: diPlancher, plafond_euros: diPlafond, median_euros: diMedian,
      tpe: !!p.tpe,
      reference: 'Art. L.1235-3 Code du travail'
    },
    total_brut_median: totalBrut,
    regime_fiscal: fiscal, regime_social: social,
    chomage: { eligible: true },
    net_estime: r2(totalBrut - social.total_prelevements_sociaux - fiscal.imposable * (p.tmi || 0.30)),
    negociation: {
      fourchette_negociation: { bas: r2(indRetenue + diPlancher), haut: r2(indRetenue + diPlafond) },
      conseil: 'Négocier dans la fourchette haute si le dossier est solide (preuves nombreuses, chronologie cohérente). En fourchette basse si les preuves sont fragiles.',
      levier_employeur: 'Le coût total employeur (charges + avocat + temps) est souvent supérieur au plafond Macron. Utilisez cet argument.'
    },
    score_interet: 70
  };
}

function scenarioLicenciementNul(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const indConv = p.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const remN1 = p.remuneration_n1 || sal * 12;

  // Licenciement nul = PAS de barème Macron, minimum 6 mois (art. L.1235-3-1)
  const diMinimum = r2(6 * sal);
  // En AT/MP inaptitude : doublement indemnité légale (art. L.1226-14)
  const atMp = p.cause_nullite === 'at_mp';
  const indSpeciale = atMp ? r2(indRetenue * 2) : indRetenue;

  // Estimation réaliste basée sur la jurisprudence : généralement 8-24 mois
  const diEstimeeBas = r2(Math.max(6, Math.floor(anc * 0.8)) * sal);
  const diEstimeeHaut = r2(Math.max(12, Math.ceil(anc * 1.5)) * sal);
  const diMedian = r2((diEstimeeBas + diEstimeeHaut) / 2);

  const totalBrut = r2(indSpeciale + diMedian);
  const fiscal = exonerationIR(indSpeciale, remN1, totalBrut);
  const social = regimeSocial(totalBrut, indSpeciale);

  return {
    type: 'licenciement_nul', label: 'Licenciement nul (hors barème Macron)',
    cause_nullite: p.cause_nullite || 'non précisée',
    causes_admises: [
      { cause: 'discrimination', article: 'Art. L.1132-1 à L.1132-4', minimum: '6 mois' },
      { cause: 'harcelement_moral', article: 'Art. L.1152-2 et L.1152-3', minimum: '6 mois' },
      { cause: 'harcelement_sexuel', article: 'Art. L.1153-2 et L.1153-4', minimum: '6 mois' },
      { cause: 'grossesse_maternite', article: 'Art. L.1225-5', minimum: '6 mois' },
      { cause: 'at_mp', article: 'Art. L.1226-13 et L.1226-14', minimum: '12 mois + doublement indemnité légale' },
      { cause: 'liberte_fondamentale', article: 'Jurisprudence + art. L.1235-3-1', minimum: '6 mois + pas de déduction revenus remplacement' },
      { cause: 'salarie_protege', article: 'Art. L.2411-1 et suivants', minimum: '6 mois + salaires rétroactifs' },
      { cause: 'lanceur_alerte', article: 'Art. L.1132-3-3', minimum: '6 mois' },
      { cause: 'droit_greve', article: 'Art. L.2511-1', minimum: '6 mois' },
      { cause: 'action_justice', article: 'Art. L.1134-4', minimum: '6 mois' }
    ],
    indemnite_legale: indRetenue,
    indemnite_speciale: indSpeciale,
    dommages_interets: { minimum: diMinimum, estime_bas: diEstimeeBas, estime_haut: diEstimeeHaut, median: diMedian, pas_de_plafond: true },
    total_brut_median: totalBrut,
    regime_fiscal: fiscal, regime_social: social,
    reintegration: {
      possible: true,
      consequence: 'Si réintégration demandée et accordée : salaires rétroactifs de TOUTE la période d\'éviction',
      deduction_revenus: p.cause_nullite === 'liberte_fondamentale' ? 'NON — aucune déduction des revenus de remplacement (Cass. soc., 9 juillet 2025)' : 'OUI — déduction des revenus de remplacement perçus (sauf liberté fondamentale)',
      reference: 'Art. L.1235-3-1 Code du travail'
    },
    chomage: { eligible: true },
    strategie: 'Le licenciement nul est le scénario le plus favorable pour le salarié. Si les faits le permettent (harcèlement, discrimination), TOUJOURS conclure à la nullité en principal, et au SCR en subsidiaire.',
    score_interet: 95
  };
}

function scenarioPriseActe(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const macron = getMacron(anc, p.tpe);

  return {
    type: 'prise_acte', label: 'Prise d\'acte de la rupture',
    principe: 'Le salarié rompt le contrat en imputant la rupture à l\'employeur. Effet immédiat — pas de préavis.',
    conditions_succes: [
      'Manquements GRAVES de l\'employeur empêchant la poursuite du contrat',
      'Non-paiement de salaires ou d\'heures supplémentaires',
      'Harcèlement moral ou sexuel avéré',
      'Modification unilatérale du contrat de travail',
      'Manquement à l\'obligation de sécurité',
      'Retrait de fonctions / mise au placard'
    ],
    risque: {
      si_justifiee: 'Effets d\'un licenciement sans cause réelle et sérieuse → barème Macron + indemnité de licenciement + DI + chômage',
      si_non_justifiee: 'Effets d\'une DÉMISSION → aucune indemnité, aucun chômage, et l\'employeur peut réclamer l\'indemnité de préavis (' + r2(sal * preavisLegal(anc, p.cadre)) + ' €)',
      taux_succes_estime: 'Variable — dépend de la gravité des manquements et des preuves. Environ 60-70% si les manquements sont documentés.'
    },
    si_justifiee: {
      indemnite_licenciement: indLeg,
      dommages_interets: { plancher: r2(macron.plancher * sal), plafond: r2(macron.plafond * sal) },
      indemnite_preavis: r2(sal * preavisLegal(anc, p.cadre)),
      chomage: true
    },
    si_non_justifiee: {
      indemnite_licenciement: 0,
      dommages_interets: 0,
      doit_payer_preavis: r2(sal * preavisLegal(anc, p.cadre)),
      chomage: false
    },
    procedure: 'Saisine directe du bureau de jugement (pas de BCO). Le juge doit statuer dans un délai d\'un mois (art. L.1451-1 — rarement respecté en pratique).',
    alternative_plus_sure: 'La résiliation judiciaire est PLUS SÛRE : le salarié reste en poste pendant la procédure et ne prend aucun risque.',
    score_interet: 50 // Risqué
  };
}

function scenarioResiliationJudiciaire(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const macron = getMacron(anc, p.tpe);

  return {
    type: 'resiliation_judiciaire', label: 'Résiliation judiciaire du contrat',
    principe: 'Le salarié saisit le CPH pour demander la résiliation du contrat aux torts de l\'employeur. Il RESTE EN POSTE pendant toute la procédure.',
    avantages: [
      'Le salarié conserve son salaire pendant la procédure (12-24 mois en moyenne)',
      'Aucun risque de perdre le chômage (contrairement à la prise d\'acte)',
      'Protection contre le licenciement rétorsion',
      'Pas de prescription tant que le contrat de travail est en cours (Cass. soc., 5 mars 2025, n° 23-20.277)'
    ],
    conditions: [
      'Manquements de l\'employeur suffisamment graves',
      'Non-paiement de salaires ou d\'éléments de rémunération',
      'Modification unilatérale du contrat',
      'Harcèlement moral ou discrimination',
      'Manquement à l\'obligation de sécurité'
    ],
    si_prononcee: {
      effets: 'Licenciement sans cause réelle et sérieuse (ou nul si les faits le justifient)',
      date_effet: 'Date du jugement (pas rétroactif)',
      indemnite_licenciement: indLeg,
      dommages_interets: { plancher: r2(macron.plancher * sal), plafond: r2(macron.plafond * sal) },
      indemnite_preavis: r2(sal * preavisLegal(anc, p.cadre)),
      chomage: true
    },
    si_rejetee: {
      effets: 'Le contrat de travail continue normalement. Le salarié n\'a rien perdu.',
      consequence: 'Aucune — le salarié reste en poste. C\'est l\'avantage majeur par rapport à la prise d\'acte.',
    },
    attention: 'Si l\'employeur licencie le salarié PENDANT la procédure de résiliation, le juge examine d\'abord la résiliation. Si elle est fondée, le licenciement est sans objet.',
    quand_privilegier: [
      'Le salarié ne peut pas se permettre de perdre son emploi',
      'Les manquements sont chroniques mais pas assez graves pour une prise d\'acte immédiate',
      'On veut constituer un dossier solide dans la durée (accumulation de preuves)'
    ],
    score_interet: 65
  };
}

function scenarioRuptureConventionnelle(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const indConv = p.indemnite_conventionnelle || 0;
  const indMin = Math.max(indLeg, indConv);
  const indNegociee = p.indemnite_negociee || indMin;
  const remN1 = p.remuneration_n1 || sal * 12;
  const partSupraLegale = r2(Math.max(0, indNegociee - indMin));

  const fiscal = exonerationIR(indMin, remN1, indNegociee);
  const social = regimeSocial(indNegociee, indMin);
  const carence = delaiCarence(partSupraLegale, sal, p.jours_cp_restants);

  // Forfait social employeur
  const forfaitSocial = r2(Math.min(indNegociee, 2 * PASS) * FORFAIT_SOCIAL_RC);

  return {
    type: 'rupture_conventionnelle', label: 'Rupture conventionnelle (art. L.1237-11)',
    indemnite_minimum: indMin, indemnite_negociee: indNegociee,
    part_legale: indMin, part_supra_legale: partSupraLegale,
    regime_fiscal: fiscal, regime_social: social,
    forfait_social_employeur: { montant: forfaitSocial, note: 'À la charge de l\'employeur — argument de négociation : plus vous négociez haut, plus l\'employeur paie de forfait social' },
    chomage: { eligible: true, carence: carence },
    procedure: {
      entretien: 'Au moins 1 entretien (le salarié peut se faire assister)',
      retractation: '15 jours calendaires de rétractation après signature (art. L.1237-13)',
      homologation: '15 jours ouvrables d\'instruction par la DREETS',
      delai_total: '30 jours minimum entre la signature et la date de rupture effective'
    },
    nullite: {
      vice_consentement: 'Si pression ou harcèlement → annulation avec effets d\'un licenciement SCR (Cass. soc., 30 janvier 2013)',
      dol_salarie: 'Si le salarié a dissimulé un élément déterminant → annulation avec effets d\'une DÉMISSION (Cass. soc., 19 juin 2024, n° 23-10.817)',
      contexte_harcelement: 'Une RC signée dans un contexte de harcèlement est annulable'
    },
    negociation: {
      arguments_salarie: [
        'Coût d\'un contentieux pour l\'employeur (avocat + temps + incertitude)',
        'Risque de requalification en licenciement SCR si refus de RC',
        'Le forfait social est à la charge de l\'employeur → son coût réel est indemnité + 20%',
        'Portabilité mutuelle/prévoyance (art. L.911-8) : 12 mois maximum'
      ],
      attention_carence: 'Plus le supra-légal est élevé, plus le délai de carence Pôle Emploi est long (max 150j). Évaluer si le salarié peut attendre ' + carence.total_jours + ' jours sans revenus.'
    },
    score_interet: 80
  };
}

function scenarioTransaction(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const indConv = p.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const montantTransaction = p.montant_transaction || 0;
  const dejaPercu = p.indemnite_deja_percue || indRetenue;
  const totalIndemnitaire = r2(dejaPercu + montantTransaction);
  const remN1 = p.remuneration_n1 || sal * 12;
  const tmi = p.tmi_client || 0.30;

  const fiscal = exonerationIR(indRetenue, remN1, totalIndemnitaire);
  const social = regimeSocial(totalIndemnitaire, indRetenue);

  // Net client
  const ir = r2(fiscal.imposable * tmi);
  const honoraires = p.honoraires_avocat_ht || 0;
  const honorairesTTC = r2(honoraires * 1.20);
  const netClient = r2(totalIndemnitaire - social.total_prelevements_sociaux - ir - honorairesTTC);

  // Quotient fiscal
  const qf = quotientFiscal(fiscal.imposable, remN1, tmi);

  return {
    type: 'transaction', label: 'Protocole transactionnel (art. 2044 C. civ.)',
    indemnite_licenciement: dejaPercu, indemnite_transactionnelle: montantTransaction,
    total_indemnitaire: totalIndemnitaire,
    regime_fiscal: { ...fiscal, impot_revenu: ir, tmi_applique: tmi, quotient_fiscal: qf },
    regime_social: social,
    honoraires: { ht: honoraires, ttc: honorairesTTC },
    net_client: netClient,
    taux_prelevement_effectif: r2(((totalIndemnitaire - netClient) / totalIndemnitaire) * 100),
    ventilation_optimale: {
      conseil: 'Décomposer le montant pour maximiser les exonérations :',
      postes: [
        { poste: 'Indemnité de licenciement', regime: 'Exonérée IR + cotisations', maximiser: true },
        { poste: 'Dommages-intérêts pour préjudice moral/professionnel', regime: 'Exonérés dans les limites art. 80 duodecimes', maximiser: true },
        { poste: 'Indemnité de non-concurrence (si clause)', regime: 'Imposable mais pas de cotisations si renoncée dans le protocole', utile: !!p.clause_non_concurrence },
        { poste: 'Outplacement payé par l\'employeur', regime: 'Non imposable pour le salarié', maximiser: true },
        { poste: 'Formation payée par l\'employeur', regime: 'Non imposable', maximiser: true },
        { poste: 'Indemnité de préavis', regime: '100% imposable et chargée — MINIMISER', maximiser: false }
      ]
    },
    attention: 'Si la transaction fait suite à une DÉMISSION : l\'art. 80 duodecimes NE S\'APPLIQUE PAS. Tout est 100% imposable et chargé.',
    score_interet: 75
  };
}

function scenarioPSE(sal, anc, p) {
  const indLeg = indLegale(anc, sal);
  const indConv = p.indemnite_conventionnelle || 0;
  const indRetenue = Math.max(indLeg, indConv);
  const indPSE = p.indemnite_pse || 0;
  const totalIndemnitaire = r2(indRetenue + indPSE);

  return {
    type: 'pse', label: 'Plan de Sauvegarde de l\'Emploi (art. L.1233-61)',
    indemnite_legale: indRetenue, indemnite_pse: indPSE, total: totalIndemnitaire,
    regime_fiscal: {
      exoneration_ir: r2(Math.min(totalIndemnitaire, 6 * PASS)),
      raison: 'Exonération TOTALE d\'IR dans la limite de 6 PASS (régime le plus favorable)',
      reference: 'Art. 80 duodecimes, 1° CGI'
    },
    regime_social: {
      exoneration_csg: r2(Math.min(totalIndemnitaire, 2 * PASS)),
      csg_due: r2(Math.max(0, totalIndemnitaire - 2 * PASS) * CSG_TAUX)
    },
    chomage: { eligible: true, carence: 'PAS de carence supra-légal dans le cadre d\'un PSE (contrairement à la RC)' },
    mesures_accompagnement: [
      'Congé de reclassement (exonéré IR et cotisations)',
      'Formation de reconversion (non imposable)',
      'Aide à la création d\'entreprise (non imposable)',
      'Priorité de réembauche pendant 1 an (art. L.1233-45)'
    ],
    score_interet: 90
  };
}

function scenarioRetraite(sal, anc, p) {
  const miseRetraite = p.mise_a_la_retraite;

  if (miseRetraite) {
    const indLeg = indLegale(anc, sal);
    const indConv = p.indemnite_conventionnelle || 0;
    const ind = Math.max(indLeg, indConv);
    return {
      type: 'mise_retraite', label: 'Mise à la retraite par l\'employeur',
      condition: 'Le salarié doit avoir atteint l\'âge permettant de bénéficier d\'une retraite à taux plein (67 ans, ou 62 ans + trimestres)',
      indemnite: ind,
      regime_fiscal: { exoneration_ir: ind, reference: 'Même régime que le licenciement (art. 80 duodecimes)' },
      regime_social: { contribution_patronale: '50% sur la part > 5 PASS (art. L.137-12 CSS)', csg_crds: 'Sur la part > indemnité légale/conventionnelle' },
      score_interet: 55
    };
  }

  const ind = indRetraiteVolontaire(anc, sal);
  return {
    type: 'depart_retraite', label: 'Départ volontaire à la retraite',
    indemnite: ind,
    regime_fiscal: { exoneration_ir: 0, raison: 'AUCUNE exonération — intégralement imposable (art. 80 duodecimes, 2° CGI). C\'est le régime le plus défavorable après la démission.' },
    regime_social: { cotisations: 'Intégralement soumise', csg_crds: 'Intégralement soumise' },
    alternatives: [
      'Faire en sorte que ce soit l\'EMPLOYEUR qui prenne l\'initiative (mise à la retraite → régime licenciement)',
      'Négocier une rupture conventionnelle AVANT l\'âge de la retraite',
      'Utiliser le système du quotient (art. 163-0 A CGI) pour lisser l\'imposition',
      'Maximiser les versements PER l\'année du départ (déduction jusqu\'à 35 194 € en 2026)'
    ],
    score_interet: 10
  };
}

// ================================================
// RECHERCHE JURISPRUDENCE SIMILAIRE (GAME CHANGER)
// ================================================
async function rechercherDecisionsSimilaires(params) {
  if (!judilibre || !dispatch) return { decisions: [], message: 'Service de recherche non disponible' };

  const { type_contentieux, salaire, anciennete, convention_collective } = params;

  // Construire la requête Judilibre ciblée
  const motsCles = [];
  if (type_contentieux === 'licenciement_scr' || type_contentieux === 'licenciement_crs') motsCles.push('licenciement', 'cause réelle et sérieuse');
  if (type_contentieux === 'harcelement') motsCles.push('harcèlement moral', 'obligation sécurité');
  if (type_contentieux === 'heures_supplementaires') motsCles.push('heures supplémentaires', 'rappel de salaire');
  if (type_contentieux === 'discrimination') motsCles.push('discrimination', 'nullité licenciement');
  if (type_contentieux === 'inaptitude') motsCles.push('inaptitude', 'reclassement', 'obligation');
  if (type_contentieux === 'faute_grave') motsCles.push('faute grave', 'licenciement');
  if (type_contentieux === 'rupture_conventionnelle') motsCles.push('rupture conventionnelle', 'vice consentement');
  if (type_contentieux === 'prise_acte') motsCles.push('prise acte', 'manquements graves');
  if (!motsCles.length) motsCles.push('licenciement', 'indemnité');

  try {
    // Recherche Judilibre chambre sociale
    const searchResult = await judilibre.search(motsCles.join(' '), {
      chambre: 'soc',
      pageSize: 15,
      sort: 'date',
      order: 'desc'
    });

    const decisions = (searchResult.results || []).slice(0, 8);

    if (!decisions.length) {
      return { decisions: [], message: 'Aucune décision récente trouvée pour ce type de contentieux.' };
    }

    // Analyse IA pour extraire montants et contexte de chaque décision
    const systemPrompt = `Vous êtes un expert en droit du travail français. Analysez cette décision de la Cour de cassation.
Contexte de recherche : le dossier concerne un salarié avec un salaire de ${salaire} €/mois et ${anciennete} ans d'ancienneté.
Extrayez les informations suivantes en JSON strict :
{
  "pertinence": 0-100,
  "montants_accordes": { "indemnite_licenciement": null, "dommages_interets": null, "rappel_salaire": null, "article_700": null, "total": null },
  "anciennete_salarie": null,
  "salaire_mentionne": null,
  "motif_rupture": "",
  "issue": "cassation|rejet|renvoi",
  "principe_retenu": "",
  "enseignement_cle": "",
  "utile_pour_negociation": true/false
}
Si les montants ne sont pas mentionnés, mettez null. Ne pas inventer.`;

    const analysees = [];
    for (const dec of decisions.slice(0, 5)) {
      try {
        const texte = dec.text || dec.summary || dec.titre || '';
        if (texte.length < 50) continue;

        const userPrompt = `Décision ${dec.number || ''} du ${dec.date || ''}\n${texte.substring(0, 4000)}`;
        const { result } = await dispatch('summarize_jurisprudence', systemPrompt, userPrompt, { maxTokens: 600 });

        let analyse = {};
        try {
          const match = result.match(/\{[\s\S]*\}/);
          if (match) analyse = JSON.parse(match[0]);
        } catch { /* analyse vide */ }

        if (analyse.pertinence > 20) {
          analysees.push({
            numero: dec.number || null,
            date: dec.date || null,
            id: dec.id || null,
            pertinence: analyse.pertinence || 0,
            montants: analyse.montants_accordes || {},
            anciennete_salarie: analyse.anciennete_salarie,
            salaire_mentionne: analyse.salaire_mentionne,
            motif_rupture: analyse.motif_rupture || '',
            issue: analyse.issue || '',
            principe_retenu: analyse.principe_retenu || '',
            enseignement_cle: analyse.enseignement_cle || '',
            utile_negociation: analyse.utile_pour_negociation || false
          });
        }
      } catch (err) {
        console.warn('[strategie-depart] Analyse IA échouée pour', dec.id, err.message);
      }
    }

    // Tri par pertinence
    analysees.sort((a, b) => b.pertinence - a.pertinence);

    return {
      decisions: analysees,
      total_trouvees: searchResult.total || decisions.length,
      type_contentieux,
      message: analysees.length + ' décision(s) similaire(s) trouvée(s)'
    };
  } catch (err) {
    console.error('[strategie-depart] Recherche Judilibre échouée:', err.message);
    return { decisions: [], message: 'Erreur lors de la recherche : ' + err.message };
  }
}

// ================================================
// ENDPOINTS
// ================================================

// POST /comparer — Compare les 10 scénarios
router.post('/comparer', requireAvocat, async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.salaire_reference || !p.anciennete_annees) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees requis' });
    }

    const sal = p.salaire_reference;
    const anc = (p.anciennete_annees || 0) + (p.anciennete_mois || 0) / 12;

    const scenarios = {
      demission: scenarioDemission(sal, anc, p),
      licenciement_crs: scenarioLicenciementCRS(sal, anc, p),
      licenciement_scr: scenarioLicenciementSCR(sal, anc, p),
      licenciement_nul: scenarioLicenciementNul(sal, anc, p),
      prise_acte: scenarioPriseActe(sal, anc, p),
      resiliation_judiciaire: scenarioResiliationJudiciaire(sal, anc, p),
      rupture_conventionnelle: scenarioRuptureConventionnelle(sal, anc, p),
      pse: scenarioPSE(sal, anc, p),
      mise_retraite: scenarioRetraite(sal, anc, { ...p, mise_a_la_retraite: true }),
      depart_retraite: scenarioRetraite(sal, anc, { ...p, mise_a_la_retraite: false })
    };

    if (p.montant_transaction) {
      scenarios.transaction = scenarioTransaction(sal, anc, p);
    }

    // Classement par score d'intérêt
    const classement = Object.entries(scenarios)
      .map(([key, s]) => ({
        scenario: key, label: s.label,
        score_interet: s.score_interet || 0,
        chomage: s.chomage?.eligible !== false,
        exoneration_ir: s.regime_fiscal?.exoneration_ir || s.regime_fiscal?.exoneration || 0
      }))
      .sort((a, b) => b.score_interet - a.score_interet);

    return res.json({
      parametres: { salaire: sal, anciennete: r2(anc), cadre: !!p.cadre, tpe: !!p.tpe },
      scenarios, classement,
      recommandation: classement[0] ? classement[0].label + ' (score ' + classement[0].score_interet + '/100)' : null,
      references: [
        'Art. 80 duodecimes CGI — Régime fiscal des indemnités de rupture',
        'Art. L.1235-3 Code du travail — Barème Macron',
        'Art. L.1235-3-1 Code du travail — Licenciement nul (hors barème)',
        'Art. L.1237-11 à L.1237-16 — Rupture conventionnelle',
        'Art. L.1451-1 — Prise d\'acte, saisine directe bureau de jugement',
        'Art. L.1233-61 à L.1233-63 — PSE',
        'Art. 2044 Code civil — Transaction',
        'Art. 163-0 A CGI — Système du quotient'
      ],
      garde_fou: 'Cette comparaison est indicative. Elle ne remplace pas l\'analyse personnalisée de l\'avocat. Le régime applicable dépend de la convention collective, de la situation personnelle du salarié, et des circonstances exactes de la rupture.'
    });
  } catch (err) {
    console.error('[strategie-depart/comparer]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// POST /decisions-similaires — GAME CHANGER
router.post('/decisions-similaires', requireAvocat, async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.type_contentieux) {
      return res.status(400).json({ error: 'type_contentieux requis (licenciement_scr, harcelement, heures_supplementaires, discrimination, inaptitude, faute_grave, rupture_conventionnelle, prise_acte)' });
    }

    const result = await rechercherDecisionsSimilaires({
      type_contentieux: p.type_contentieux,
      salaire: p.salaire_reference || 3000,
      anciennete: p.anciennete_annees || 5,
      convention_collective: p.convention_collective || null
    });

    // Enrichir avec le barème Macron pour comparaison
    const anc = p.anciennete_annees || 5;
    const sal = p.salaire_reference || 3000;
    const macron = getMacron(anc, p.tpe);

    return res.json({
      ...result,
      comparaison_bareme: {
        plancher_macron: r2(macron.plancher * sal),
        plafond_macron: r2(macron.plafond * sal),
        note: 'Le barème Macron encadre les DI pour licenciement SCR. Les décisions ci-dessus montrent ce que les juges ont effectivement accordé.'
      },
      conseil: 'Ces décisions sont des RÉFÉRENCES pour la négociation. Montrez-les à la partie adverse pour justifier vos demandes. Les juges regardent les précédents même s\'ils ne sont pas liés par eux.'
    });
  } catch (err) {
    console.error('[strategie-depart/decisions-similaires]', err.message);
    return res.status(500).json({ error: 'Erreur de recherche' });
  }
});

// POST /optimiser — Montage optimal avec ventilation
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

    const strategies = [];

    // Stratégie 1 : Tout en RC
    const partSupra1 = Math.max(0, montant - indMin);
    const exoIr1 = Math.min(Math.max(indMin, 2 * remN1, montant * 0.5), 6 * PASS);
    const csg1 = r2(partSupra1 * (CSG_TAUX + CRDS_TAUX));
    const ir1 = r2(Math.max(0, montant - exoIr1) * tmi);
    const net1 = r2(montant - csg1 - ir1);
    const carence1 = delaiCarence(partSupra1, sal, p.jours_cp_restants);
    strategies.push({
      label: 'Rupture conventionnelle — indemnité globale',
      montant_brut: montant, csg_crds: csg1, ir: ir1, net: net1,
      taux_prelevement: r2(((montant - net1) / montant) * 100),
      chomage: true, carence_jours: carence1.total_jours
    });

    // Stratégie 2 : Indemnité min + non-concurrence renoncée
    if (p.clause_non_concurrence || partSupra1 > 5000) {
      const partNc = partSupra1;
      const csg2 = r2(partNc * (CSG_TAUX + CRDS_TAUX));
      const ir2 = r2(partNc * tmi); // NC = imposable comme salaire
      const net2 = r2(montant - csg2 - ir2);
      strategies.push({
        label: 'Indemnité minimum + clause non-concurrence renoncée',
        montant_brut: montant, decomposition: { indemnite: indMin, non_concurrence: partNc },
        csg_crds: csg2, ir: ir2, net: net2,
        taux_prelevement: r2(((montant - net2) / montant) * 100),
        chomage: true, note: 'La renonciation dans le protocole évite les cotisations sociales sur la part NC'
      });
    }

    // Stratégie 3 : Indemnité + outplacement employeur
    const outplacement = Math.min(8000, montant * 0.15);
    const indApresOut = r2(montant - outplacement);
    const exoIr3 = Math.min(Math.max(indMin, 2 * remN1, indApresOut * 0.5), 6 * PASS);
    const csg3 = r2(Math.max(0, indApresOut - indMin) * (CSG_TAUX + CRDS_TAUX));
    const ir3 = r2(Math.max(0, indApresOut - exoIr3) * tmi);
    const net3 = r2(indApresOut - csg3 - ir3);
    strategies.push({
      label: 'Indemnité réduite + outplacement employeur (' + r2(outplacement) + ' €)',
      montant_brut: montant, decomposition: { indemnite: indApresOut, outplacement },
      csg_crds: csg3, ir: ir3, net_indemnite: net3, valeur_reelle: r2(net3 + outplacement),
      taux_prelevement: r2(((indApresOut - net3) / indApresOut) * 100),
      note: 'L\'outplacement payé par l\'employeur est non imposable pour le salarié'
    });

    // Stratégie 4 : Avec versement PER
    const plafondPER = Math.min(35194, montant * 0.3);
    const exoIr4 = Math.min(Math.max(indMin, 2 * remN1, montant * 0.5), 6 * PASS);
    const imposable4 = Math.max(0, montant - exoIr4);
    const imposableApresPER = Math.max(0, imposable4 - plafondPER);
    const ir4 = r2(imposableApresPER * tmi);
    const csg4 = r2(Math.max(0, montant - indMin) * (CSG_TAUX + CRDS_TAUX));
    const net4 = r2(montant - csg4 - ir4 - plafondPER); // PER déduit mais bloqué
    strategies.push({
      label: 'Indemnité + versement PER (' + r2(plafondPER) + ' € — bloqué retraite)',
      montant_brut: montant, decomposition: { indemnite_nette: r2(montant - plafondPER), versement_per: plafondPER },
      csg_crds: csg4, ir: ir4, net_disponible: net4, epargne_retraite: plafondPER,
      economie_ir: r2(plafondPER * tmi),
      note: 'Le versement PER réduit le revenu imposable mais les fonds sont bloqués jusqu\'à la retraite (sauf achat résidence principale)'
    });

    // Classement
    const classement = strategies
      .map(s => ({ ...s, score: s.valeur_reelle || s.net || 0 }))
      .sort((a, b) => b.score - a.score);

    // Quotient fiscal
    const qf = quotientFiscal(Math.max(0, montant - Math.min(Math.max(indMin, 2 * remN1, montant * 0.5), 6 * PASS)), remN1, tmi);

    return res.json({
      parametres: { salaire: sal, anciennete: r2(anc), montant_negociable: montant, tmi, indemnite_minimum: indMin },
      strategies: classement,
      meilleure: classement[0]?.label || null,
      quotient_fiscal: qf,
      portabilite: {
        mutuelle: 'Maintien gratuit pendant ' + Math.min(12, Math.ceil(anc)) + ' mois (art. L.911-8 CSS)',
        prevoyance: 'Idem — même durée, mêmes garanties'
      },
      conseil: 'La meilleure stratégie dépend de la situation personnelle : âge, projet professionnel, TMI, épargne existante. Adaptez avec le client.'
    });
  } catch (err) {
    console.error('[strategie-depart/optimiser]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// POST /tactiques-negociation — Plan de négociation étape par étape
router.post('/tactiques-negociation', requireAvocat, async (req, res) => {
  try {
    const p = req.body || {};
    const sal = p.salaire_reference || 3000;
    const anc = (p.anciennete_annees || 0) + (p.anciennete_mois || 0) / 12;
    const macron = getMacron(anc, p.tpe);

    return res.json({
      etapes: [
        {
          ordre: 1, nom: 'Mise en demeure',
          description: 'Courrier RAR détaillant les manquements, demandant la régularisation sous 15 jours.',
          objectif: 'Constituer une preuve + ouvrir la porte à la négociation',
          duree: '15 jours',
          cout: 'Quasi nul (LRAR + temps avocat)',
          taux_resolution: '20-30% des cas se règlent à ce stade'
        },
        {
          ordre: 2, nom: 'Négociation directe',
          description: 'Échange entre avocats ou entre le salarié et l\'employeur. Proposition chiffrée.',
          objectif: 'Rupture conventionnelle ou transaction amiable',
          fourchette: { bas: r2(macron.plancher * sal + indLegale(anc, sal)), haut: r2(macron.plafond * sal + indLegale(anc, sal)) },
          duree: '1-3 mois',
          taux_resolution: '40-50% des cas'
        },
        {
          ordre: 3, nom: 'Médiation conventionnelle',
          description: 'Médiateur indépendant (art. 1530 CPC). Confidentiel, rapide.',
          objectif: 'Accord homologable par le juge',
          duree: '2-3 mois',
          cout: '1 000-3 000 € (partagé)',
          taux_resolution: '60-70% des médiations aboutissent'
        },
        {
          ordre: 4, nom: 'Saisine CPH — Bureau de Conciliation (BCO)',
          description: 'Conciliation obligatoire avant jugement. Audience à huis clos.',
          objectif: 'Dernière tentative amiable avant jugement + demande de provision',
          provision_possible: 'Jusqu\'à 6 mois de salaire (art. R.1454-15) = ' + r2(6 * sal) + ' €',
          duree: '2-4 mois après saisine',
          conseil: 'Demander SYSTÉMATIQUEMENT la provision au BCO. Cela met la pression financière.'
        },
        {
          ordre: 5, nom: 'Bureau de jugement',
          description: 'Audience de plaidoirie. Conseillers employeurs + salariés.',
          objectif: 'Jugement avec application du barème Macron',
          fourchette_macron: { plancher: r2(macron.plancher * sal), plafond: r2(macron.plafond * sal) },
          duree: '12-24 mois après saisine (délai moyen)',
          execution_provisoire: 'De droit pour les sommes salariales ≤ 9 mois (art. R.1454-28)'
        },
        {
          ordre: 6, nom: 'Appel (si nécessaire)',
          description: 'Cour d\'appel — délai 1 mois après notification.',
          objectif: 'Réformation du jugement',
          duree: '12-18 mois supplémentaires',
          effet_suspensif: 'L\'appel suspend l\'exécution SAUF pour les sommes exécutoires de droit'
        }
      ],
      arguments_cles: [
        'Le coût total d\'un contentieux pour l\'employeur (avocat + temps + cotisations patronales sur les condamnations) dépasse souvent le plafond Macron',
        'L\'incertitude judiciaire est un levier : 50% des jugements CPH sont réformés en appel',
        'La publicité d\'une condamnation prud\'homale nuit à la marque employeur',
        'Le temps de procédure (2-4 ans avec appel) est un coût caché majeur pour l\'employeur'
      ],
      charte_sociale: {
        utilisation: 'Invoquer l\'art. 24 de la Charte sociale européenne révisée pour contester le barème Macron',
        jurisprudence: 'CEDS, 23 mars 2022 : le barème Macron viole la Charte. Mais Cass. soc., 11 mai 2022 : refus de l\'effet direct entre particuliers.',
        conseil: 'Invoquer en conclusions mais ne pas fonder toute la stratégie dessus. Le vrai levier reste la NULLITÉ du licenciement.'
      }
    });
  } catch (err) {
    console.error('[strategie-depart/tactiques]', err.message);
    return res.status(500).json({ error: 'Erreur' });
  }
});

// GET /regimes — Tableau récapitulatif enrichi
router.get('/regimes', requireAvocat, async (req, res) => {
  return res.json({
    regimes: [
      { type: 'demission', ir: '100% imposable', csg: '100%', cotisations: '100%', chomage: false, score: 5, verdict: 'Le pire' },
      { type: 'depart_retraite', ir: '100% imposable', csg: '100%', cotisations: '100%', chomage: false, score: 10, verdict: 'Très défavorable' },
      { type: 'licenciement_crs', ir: 'Exonéré (part légale/conv)', csg: 'Exonérée (part légale)', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, score: 45, verdict: 'Correct' },
      { type: 'prise_acte', ir: 'Si justifiée = SCR / Si non = démission', csg: 'Variable', cotisations: 'Variable', chomage: 'Variable', score: 50, verdict: 'Risqué' },
      { type: 'mise_retraite', ir: 'Exonéré (régime licenciement)', csg: 'Sur part > légale', cotisations: 'Contribution 50% > 5 PASS', chomage: false, score: 55, verdict: 'Correct' },
      { type: 'resiliation_judiciaire', ir: 'Si prononcée = SCR', csg: 'Variable', cotisations: 'Variable', chomage: 'Si prononcée', score: 65, verdict: 'Sûr (reste en poste)' },
      { type: 'licenciement_scr', ir: 'Exonéré (max 3 options, ≤ 6 PASS)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, score: 70, verdict: 'Favorable' },
      { type: 'transaction', ir: 'Exonéré (cumul avec ind. licenciement)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, score: 75, verdict: 'Favorable si post-licenciement' },
      { type: 'rupture_conventionnelle', ir: 'Exonéré (même régime que licenciement)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, score: 80, verdict: 'Très favorable' },
      { type: 'pse', ir: 'Exonéré TOTAL ≤ 6 PASS', csg: 'Exonérée ≤ 2 PASS', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, score: 90, verdict: 'Le meilleur (fiscal)' },
      { type: 'licenciement_nul', ir: 'Exonéré (max 3 options, ≤ 6 PASS)', csg: 'Sur part > légale', cotisations: 'Exonérées ≤ 2 PASS', chomage: true, score: 95, verdict: 'Le meilleur (montant — pas de plafond)' }
    ],
    pass_2026: PASS,
    references: ['Art. 80 duodecimes CGI', 'Art. L.242-1, L.136-2 CSS', 'Art. L.1235-3 et L.1235-3-1 Code du travail']
  });
});

module.exports = router;
