// =============================================
// JADOMI AVOCAT — Simulateur Droit du Travail
// Calculs automatiques : indemnités, barème Macron,
// impact fiscal, négociation transactionnelle
// Spécialité épouse du fondateur = PRIORITAIRE
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

// === AUTH MIDDLEWARE ===
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
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

// ================================================
// CONSTANTES LÉGALES 2026
// ================================================
const PASS_2026 = 47100; // Plafond Annuel Sécurité Sociale
const CSG_TAUX = 0.092;
const CSG_DEDUCTIBLE = 0.068;
const CRDS_TAUX = 0.005;
const TVA_AVOCAT = 0.20;

// Barème Macron — art. L.1235-3 (entreprises >= 11 salariés)
const BAREME_MACRON = [
  { annees: 0,  plancher: 0,   plafond: 1 },
  { annees: 1,  plancher: 1,   plafond: 2 },
  { annees: 2,  plancher: 3,   plafond: 3.5 },
  { annees: 3,  plancher: 3,   plafond: 4 },
  { annees: 4,  plancher: 3,   plafond: 5 },
  { annees: 5,  plancher: 3,   plafond: 6 },
  { annees: 6,  plancher: 3,   plafond: 7 },
  { annees: 7,  plancher: 3,   plafond: 8 },
  { annees: 8,  plancher: 3,   plafond: 8 },
  { annees: 9,  plancher: 3,   plafond: 9 },
  { annees: 10, plancher: 3,   plafond: 10 },
  { annees: 11, plancher: 3,   plafond: 10.5 },
  { annees: 12, plancher: 3,   plafond: 11 },
  { annees: 13, plancher: 3,   plafond: 11.5 },
  { annees: 14, plancher: 3,   plafond: 12 },
  { annees: 15, plancher: 3,   plafond: 13 },
  { annees: 16, plancher: 3,   plafond: 13.5 },
  { annees: 17, plancher: 3,   plafond: 14 },
  { annees: 18, plancher: 3,   plafond: 14.5 },
  { annees: 19, plancher: 3,   plafond: 15 },
  { annees: 20, plancher: 3,   plafond: 15.5 },
  { annees: 21, plancher: 3,   plafond: 16 },
  { annees: 22, plancher: 3,   plafond: 16.5 },
  { annees: 23, plancher: 3,   plafond: 17 },
  { annees: 24, plancher: 3,   plafond: 17.5 },
  { annees: 25, plancher: 3,   plafond: 18 },
  { annees: 26, plancher: 3,   plafond: 18.5 },
  { annees: 27, plancher: 3,   plafond: 19 },
  { annees: 28, plancher: 3,   plafond: 19.5 },
  { annees: 29, plancher: 3,   plafond: 20 },
  { annees: 30, plancher: 3,   plafond: 20 },
];

// Barème TPE (< 11 salariés) — plancher réduit
const BAREME_TPE_PLANCHER = [
  { annees: 0, plancher: 0 },
  { annees: 1, plancher: 0.5 },
  { annees: 2, plancher: 0.5 },
  { annees: 3, plancher: 1 },
  { annees: 4, plancher: 1 },
  { annees: 5, plancher: 1.5 },
  { annees: 6, plancher: 1.5 },
  { annees: 7, plancher: 1.5 },
  { annees: 8, plancher: 1.5 },
  { annees: 9, plancher: 1.5 },
  { annees: 10, plancher: 2.5 },
];

// Tranches impôt sur le revenu 2026
const TRANCHES_IR = [
  { min: 0,      max: 11294,  taux: 0 },
  { min: 11294,  max: 28797,  taux: 0.11 },
  { min: 28797,  max: 82341,  taux: 0.30 },
  { min: 82341,  max: 177106, taux: 0.41 },
  { min: 177106, max: Infinity, taux: 0.45 },
];

// ================================================
// HELPERS DE CALCUL
// ================================================

function round2(n) { return Math.round(n * 100) / 100; }

function getBaremeMacron(annees, petiteEntreprise) {
  const idx = Math.min(Math.floor(annees), 30);
  const row = BAREME_MACRON[idx] || BAREME_MACRON[30];
  let plancher = row.plancher;

  if (petiteEntreprise) {
    const tpeIdx = Math.min(Math.floor(annees), 10);
    const tpeRow = BAREME_TPE_PLANCHER[tpeIdx] || BAREME_TPE_PLANCHER[10];
    plancher = tpeRow.plancher;
  }

  return { plancher, plafond: row.plafond };
}

function calculIndemniteLeagale(ancienneteAnnees, salaireRef) {
  if (ancienneteAnnees < 0.67) return 0; // 8 mois minimum (art. L.1234-9)

  let indemnite = 0;
  if (ancienneteAnnees <= 10) {
    indemnite = (1 / 4) * salaireRef * ancienneteAnnees;
  } else {
    indemnite = (1 / 4) * salaireRef * 10 + (1 / 3) * salaireRef * (ancienneteAnnees - 10);
  }
  return round2(indemnite);
}

function calculSalaireReference(salaires3mois, salaires12mois, primesAnnuelles) {
  // Méthode 3 mois (avec prorata primes annuelles)
  const total3 = salaires3mois.reduce((s, v) => s + v, 0);
  const prorataPrimes = (primesAnnuelles || 0) / 4; // 3 mois = 1/4 année
  const methode3 = (total3 + prorataPrimes) / 3;

  // Méthode 12 mois
  const total12 = salaires12mois.reduce((s, v) => s + v, 0);
  const methode12 = total12 / 12;

  return {
    methode3mois: round2(methode3),
    methode12mois: round2(methode12),
    salaireRef: round2(Math.max(methode3, methode12)),
    methodeRetenue: methode3 > methode12 ? '3 derniers mois' : '12 derniers mois'
  };
}

function calculPreavis(ancienneteAnnees, cadre, dureeConventionnelle) {
  if (dureeConventionnelle) return dureeConventionnelle;
  if (cadre) return 3; // 3 mois cadre (convention usuelle)
  if (ancienneteAnnees >= 2) return 2;
  if (ancienneteAnnees >= 0.5) return 1;
  return 0;
}

function calculCP(remunerationBruteAnnuelle, joursRestants, salaireMensuel) {
  // Méthode du 10e
  const totalCP = remunerationBruteAnnuelle * 0.10;
  const parJour10e = totalCP / 30;
  const methode10e = round2(parJour10e * joursRestants);

  // Méthode du maintien
  const parJourMaintien = salaireMensuel / 26; // 26 jours ouvrables/mois
  const methodeMaintien = round2(parJourMaintien * joursRestants);

  return {
    methode10e,
    methodeMaintien,
    montant: round2(Math.max(methode10e, methodeMaintien)),
    methodeRetenue: methode10e > methodeMaintien ? '10ème' : 'maintien de salaire'
  };
}

function calculImpactFiscal(indemniteTotale, indemniteLeagale, remunerationN1, tmi) {
  // Part exonérée IR (art. 80 duodecies)
  const option1 = indemniteLeagale;
  const option2 = 2 * remunerationN1;
  const option3 = indemniteTotale * 0.5;
  const plafond6PASS = 6 * PASS_2026;

  const partExonereeIR = round2(Math.min(Math.max(option1, option2, option3), plafond6PASS));
  const partImposableIR = round2(Math.max(0, indemniteTotale - partExonereeIR));

  // CSG/CRDS
  const assietteCsgCrds = round2(Math.max(0, indemniteTotale - indemniteLeagale));
  const csg = round2(assietteCsgCrds * CSG_TAUX);
  const csgDeductible = round2(assietteCsgCrds * CSG_DEDUCTIBLE);
  const crds = round2(assietteCsgCrds * CRDS_TAUX);

  // Cotisations sociales
  let cotisationsSociales = 0;
  if (indemniteTotale > 10 * PASS_2026) {
    cotisationsSociales = indemniteTotale * 0.22; // taux approximatif salarié
  } else if (indemniteTotale > 2 * PASS_2026) {
    cotisationsSociales = round2((indemniteTotale - 2 * PASS_2026) * 0.22);
  }

  // IR sur la part imposable (selon TMI)
  const tauxIR = tmi || 0.30; // Par défaut TMI 30%
  const impotRevenu = round2(partImposableIR * tauxIR);

  const totalPrelevements = round2(csg + crds + cotisationsSociales + impotRevenu);
  const netClient = round2(indemniteTotale - totalPrelevements);

  return {
    indemnite_totale: indemniteTotale,
    part_exoneree_ir: partExonereeIR,
    part_imposable_ir: partImposableIR,
    detail_exoneration: {
      option1_legale: round2(option1),
      option2_double_remuneration: round2(option2),
      option3_moitie_indemnite: round2(option3),
      plafond_6pass: plafond6PASS,
      retenue: partExonereeIR
    },
    csg,
    csg_deductible: csgDeductible,
    crds,
    cotisations_sociales: cotisationsSociales,
    impot_revenu: impotRevenu,
    tmi_applique: tauxIR,
    total_prelevements: totalPrelevements,
    net_client: netClient,
    taux_effectif: round2((totalPrelevements / indemniteTotale) * 100)
  };
}

// ================================================
// POST /indemnite-licenciement — Calcul indemnité
// ================================================
router.post('/indemnite-licenciement', requireAvocat, async (req, res) => {
  try {
    const {
      salaire_reference, anciennete_annees, anciennete_mois,
      salaires_3mois, salaires_12mois, primes_annuelles,
      indemnite_conventionnelle
    } = req.body || {};

    let salaireRef = salaire_reference;
    let detailSalaire = null;

    // Calcul du salaire de référence si fiches de paie fournies
    if (salaires_3mois && salaires_12mois) {
      detailSalaire = calculSalaireReference(salaires_3mois, salaires_12mois, primes_annuelles);
      salaireRef = detailSalaire.salaireRef;
    }

    if (!salaireRef || !anciennete_annees && !anciennete_mois) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees (ou anciennete_mois) requis' });
    }

    const anciennete = (anciennete_annees || 0) + (anciennete_mois || 0) / 12;
    const indLegale = calculIndemniteLeagale(anciennete, salaireRef);

    // Comparer avec conventionnelle si fournie
    const indConv = indemnite_conventionnelle || 0;
    const indemniteRetenue = Math.max(indLegale, indConv);

    return res.json({
      salaire_reference: salaireRef,
      detail_salaire: detailSalaire,
      anciennete_totale: round2(anciennete),
      indemnite_legale: indLegale,
      indemnite_conventionnelle: indConv,
      indemnite_retenue: indemniteRetenue,
      base_retenue: indLegale >= indConv ? 'légale' : 'conventionnelle',
      formule: anciennete <= 10
        ? '1/4 × ' + salaireRef + ' × ' + round2(anciennete)
        : '(1/4 × ' + salaireRef + ' × 10) + (1/3 × ' + salaireRef + ' × ' + round2(anciennete - 10) + ')',
      references: ['Art. L.1234-9 Code du travail', 'Art. R.1234-2 Code du travail']
    });
  } catch (err) {
    console.error('[simulateur/indemnite]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// ================================================
// POST /bareme-macron — Dommages-intérêts barème
// ================================================
router.post('/bareme-macron', requireAvocat, async (req, res) => {
  try {
    const { salaire_reference, anciennete_annees, petite_entreprise } = req.body || {};
    if (!salaire_reference || anciennete_annees == null) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees requis' });
    }

    const bareme = getBaremeMacron(anciennete_annees, petite_entreprise);

    return res.json({
      anciennete: anciennete_annees,
      salaire_reference,
      petite_entreprise: !!petite_entreprise,
      plancher_mois: bareme.plancher,
      plafond_mois: bareme.plafond,
      plancher_euros: round2(bareme.plancher * salaire_reference),
      plafond_euros: round2(bareme.plafond * salaire_reference),
      median_euros: round2(((bareme.plancher + bareme.plafond) / 2) * salaire_reference),
      references: ['Art. L.1235-3 Code du travail', 'Ordonnances du 22 septembre 2017']
    });
  } catch (err) {
    console.error('[simulateur/bareme]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// ================================================
// POST /simulation-complete — LE simulateur complet
// Calcule TOUT : indemnités + barème + fiscal + net
// ================================================
router.post('/simulation-complete', requireAvocat, async (req, res) => {
  try {
    const {
      salaire_reference,
      anciennete_annees,
      anciennete_mois,
      cadre,
      petite_entreprise,
      preavis_effectue,
      jours_cp_restants,
      remuneration_brute_annuelle,
      remuneration_n1,
      indemnite_conventionnelle,
      heures_sup_non_payees,
      taux_horaire,
      montant_transaction,
      honoraires_avocat_ht,
      tmi_client,
      duree_preavis_conventionnel
    } = req.body || {};

    if (!salaire_reference || !anciennete_annees) {
      return res.status(400).json({ error: 'salaire_reference et anciennete_annees requis' });
    }

    const anciennete = (anciennete_annees || 0) + (anciennete_mois || 0) / 12;
    const salaireRef = salaire_reference;
    const remN1 = remuneration_n1 || salaireRef * 12;
    const remBruteAnnuelle = remuneration_brute_annuelle || salaireRef * 12;

    // 1. Indemnité de licenciement
    const indLegale = calculIndemniteLeagale(anciennete, salaireRef);
    const indConv = indemnite_conventionnelle || 0;
    const indemniteLicenciement = Math.max(indLegale, indConv);

    // 2. Préavis
    const moisPreavis = calculPreavis(anciennete, cadre, duree_preavis_conventionnel);
    const indPreavis = preavis_effectue ? 0 : round2(salaireRef * moisPreavis);

    // 3. Congés payés
    const cp = jours_cp_restants
      ? calculCP(remBruteAnnuelle, jours_cp_restants, salaireRef)
      : { montant: 0 };

    // 4. Barème Macron
    const bareme = getBaremeMacron(anciennete, petite_entreprise);
    const dmgPlancher = round2(bareme.plancher * salaireRef);
    const dmgPlafond = round2(bareme.plafond * salaireRef);
    const dmgMedian = round2(((bareme.plancher + bareme.plafond) / 2) * salaireRef);

    // 5. Heures supplémentaires
    const rappelHS = heures_sup_non_payees && taux_horaire
      ? round2(heures_sup_non_payees * taux_horaire * 1.25)
      : 0;

    // ===================== OPTION A : TRIBUNAL =====================
    const gainTribunalPlancher = round2(indemniteLicenciement + indPreavis + cp.montant + dmgPlancher + rappelHS);
    const gainTribunalPlafond = round2(indemniteLicenciement + indPreavis + cp.montant + dmgPlafond + rappelHS);
    const gainTribunalMedian = round2(indemniteLicenciement + indPreavis + cp.montant + dmgMedian + rappelHS);

    const fiscalTribunalMedian = calculImpactFiscal(gainTribunalMedian, indemniteLicenciement, remN1, tmi_client);

    // Honoraires avocat sur gain tribunal
    const honoTribunal = honoraires_avocat_ht || round2(gainTribunalMedian * 0.10); // 10% par défaut
    const honoTribunalTTC = round2(honoTribunal * (1 + TVA_AVOCAT));

    const netTribunalMedian = round2(fiscalTribunalMedian.net_client - honoTribunalTTC);

    // Décote aléa judiciaire (20-30%)
    const netTribunalAvecAlea = round2(netTribunalMedian * 0.75); // -25% décote

    // ===================== OPTION B : TRANSACTION =====================
    let optionTransaction = null;
    if (montant_transaction) {
      const fiscalTransaction = calculImpactFiscal(montant_transaction, indemniteLicenciement, remN1, tmi_client);
      const honoTransaction = honoraires_avocat_ht || round2(montant_transaction * 0.10);
      const honoTransactionTTC = round2(honoTransaction * (1 + TVA_AVOCAT));
      const netTransaction = round2(fiscalTransaction.net_client - honoTransactionTTC);

      optionTransaction = {
        montant_brut: montant_transaction,
        fiscal: fiscalTransaction,
        honoraires_ht: honoTransaction,
        honoraires_ttc: honoTransactionTTC,
        net_client: netTransaction,
        immediat: true,
        delai_mois: 0
      };
    }

    // ===================== RÉSULTAT =====================
    return res.json({
      parametres: {
        salaire_reference: salaireRef,
        anciennete: round2(anciennete),
        cadre: !!cadre,
        petite_entreprise: !!petite_entreprise
      },

      detail: {
        indemnite_licenciement: {
          legale: indLegale,
          conventionnelle: indConv,
          retenue: indemniteLicenciement,
          base: indLegale >= indConv ? 'légale' : 'conventionnelle'
        },
        preavis: {
          mois: moisPreavis,
          effectue: !!preavis_effectue,
          indemnite: indPreavis
        },
        conges_payes: cp,
        bareme_macron: {
          plancher_mois: bareme.plancher,
          plafond_mois: bareme.plafond,
          plancher_euros: dmgPlancher,
          plafond_euros: dmgPlafond,
          median_euros: dmgMedian
        },
        heures_supplementaires: rappelHS
      },

      option_tribunal: {
        gain_brut_plancher: gainTribunalPlancher,
        gain_brut_plafond: gainTribunalPlafond,
        gain_brut_median: gainTribunalMedian,
        fiscal: fiscalTribunalMedian,
        honoraires_ht: honoTribunal,
        honoraires_ttc: honoTribunalTTC,
        net_client_median: netTribunalMedian,
        net_avec_alea_25pct: netTribunalAvecAlea,
        delai_estime_mois: '12-24',
        alea: 'Le montant dépend de l\'appréciation du juge dans le cadre du barème.'
      },

      option_transaction: optionTransaction,

      comparaison: montant_transaction ? {
        tribunal_net: netTribunalAvecAlea,
        transaction_net: optionTransaction.net_client,
        difference: round2(optionTransaction.net_client - netTribunalAvecAlea),
        recommandation: optionTransaction.net_client >= netTribunalAvecAlea
          ? 'La transaction semble favorable compte tenu de l\'aléa judiciaire et du délai.'
          : 'Le passage au tribunal pourrait être plus favorable si le dossier est solide.',
        avertissement: 'Cette simulation est indicative. Les montants réels dépendent de l\'appréciation du juge, de la convention collective applicable, et de la situation fiscale exacte du client.'
      } : null,

      references_legales: [
        'Art. L.1234-9, R.1234-2 — Indemnité de licenciement',
        'Art. L.1234-1, L.1234-5 — Préavis',
        'Art. L.3141-24 à L.3141-31 — Congés payés',
        'Art. L.1235-3 — Barème Macron (ordonnances 22/09/2017)',
        'Art. 80 duodecies CGI — Régime fiscal des indemnités',
        'Art. L.136-2 CSS — CSG/CRDS'
      ],

      garde_fou: 'Cette simulation est une aide au calcul. Elle ne constitue pas un conseil juridique. Les résultats doivent être vérifiés par l\'avocat au regard de la convention collective applicable et de la situation personnelle du client.'
    });
  } catch (err) {
    console.error('[simulateur/simulation-complete]', err.message);
    return res.status(500).json({ error: 'Erreur de calcul' });
  }
});

// ================================================
// POST /lecture-fiche-paie — Extraction IA depuis fiche de paie
// ================================================
router.post('/lecture-fiche-paie', requireAvocat, async (req, res) => {
  try {
    const { texte_extrait } = req.body || {};
    if (!texte_extrait) return res.status(400).json({ error: 'texte_extrait requis (OCR de la fiche de paie)' });

    const { callMistral } = require('../../lib/legal-providers/legal-ia-router');

    const system = `Tu es un expert en lecture de fiches de paie françaises. Analyse ce bulletin et extrais TOUS les éléments. Retourne UNIQUEMENT du JSON strict :
{
  "salaire_base": 0,
  "primes": [{"nom":"","montant":0}],
  "heures_sup": {"nombre":0,"montant":0},
  "avantages_nature": 0,
  "brut_mensuel": 0,
  "net_imposable": 0,
  "net_a_payer": 0,
  "cumul_brut_annuel": 0,
  "anciennete_detectee": "",
  "convention_collective": "",
  "idcc": "",
  "date_entree": "",
  "qualification": "",
  "coefficient": "",
  "statut": "cadre|non_cadre|employé|agent_de_maitrise",
  "employeur": "",
  "salarie": "",
  "periode": "",
  "conges_restants": 0,
  "observations": []
}`;

    const result = await callMistral(system, texte_extrait.substring(0, 5000), { maxTokens: 1500, json: true });
    const match = result.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    if (!parsed) {
      return res.status(422).json({ error: 'Impossible d\'extraire les données de cette fiche de paie.' });
    }

    return res.json({
      extraction: parsed,
      salaire_reference_estime: parsed.brut_mensuel || parsed.salaire_base || 0,
      message: 'Extraction terminée. Vérifiez les montants avant de les utiliser dans le simulateur.',
      garde_fou: 'L\'extraction automatique peut contenir des erreurs. Comparez avec le bulletin original.'
    });
  } catch (err) {
    console.error('[simulateur/lecture-fiche-paie]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la lecture' });
  }
});

// ================================================
// GET /bareme-macron-table — Table complète du barème
// ================================================
router.get('/bareme-macron-table', requireAvocat, async (req, res) => {
  return res.json({
    pass_2026: PASS_2026,
    entreprises_11_plus: BAREME_MACRON,
    entreprises_moins_11: BAREME_TPE_PLANCHER,
    tranches_ir: TRANCHES_IR,
    references: ['Art. L.1235-3 Code du travail', 'Ordonnances n° 2017-1387 du 22 septembre 2017']
  });
});

module.exports = router;
