// =============================================
// JADOMI LABO — Feature gating middleware
// Controle d'acces par formule d'abonnement
// 3 tiers: essentiel (49€), pro (99€), premium (179€)
// =============================================

const { admin } = require('../../api/multiSocietes/middleware');

// ---- Formules et leurs limites ----
const FORMULES = {
  essentiel: {
    nom: 'Essentiel',
    prix: 49,
    max_techniciens: 5,
    max_bl_mois: 200,
    niveau: 1
  },
  pro: {
    nom: 'Pro',
    prix: 99,
    max_techniciens: 15,
    max_bl_mois: 1000,
    niveau: 2
  },
  premium: {
    nom: 'Premium',
    prix: 179,
    max_techniciens: null, // illimite
    max_bl_mois: null,     // illimite
    niveau: 3
  }
};

// ---- Features et leur formule minimale requise ----
const FEATURES = {
  // -- Essentiel (inclus pour tous) --
  profil: 'essentiel',
  catalogue: 'essentiel',
  bons_livraison: 'essentiel',
  factures: 'essentiel',
  dentistes: 'essentiel',
  stock: 'essentiel',
  declarations_ce: 'essentiel',
  portail_dentiste: 'essentiel',
  teintiers: 'essentiel',

  // -- Pro --
  production: 'pro',
  qr_tracking: 'pro',
  remakes: 'pro',
  garanties: 'pro',
  kpi: 'pro',
  planning: 'pro',
  expeditions: 'pro',
  chat: 'pro',
  reseau_annuaire: 'pro',
  reseau_soustraitance: 'pro',
  import_grille_ia: 'pro',

  // -- Premium --
  scan_ia: 'premium',
  shade_ia: 'premium',
  fichiers_3d: 'premium',
  portail_patient: 'premium',
  voice_bl: 'premium',
  achats_groupes: 'premium',
  entraide: 'premium',
  maintenance: 'premium',
  facturx: 'premium',
  kpi_export: 'premium'
};

// ---- Liste des features par formule (pour affichage) ----
function getFeaturesForPlan(formule) {
  const niveau = FORMULES[formule]?.niveau || 1;
  const included = {};
  for (const [feature, requiredPlan] of Object.entries(FEATURES)) {
    included[feature] = FORMULES[requiredPlan].niveau <= niveau;
  }
  return included;
}

// ---- Verifier si un plan a acces a une feature ----
function hasFeature(planName, feature) {
  const requiredPlan = FEATURES[feature];
  if (!requiredPlan) return true; // Feature inconnue → pas de restriction
  const planNiveau = FORMULES[planName]?.niveau || 1;
  const requiredNiveau = FORMULES[requiredPlan]?.niveau || 1;
  return planNiveau >= requiredNiveau;
}

// ---- Charger le plan du labo ----
async function getLabPlan(prothesisteId) {
  if (!prothesisteId) return 'essentiel';

  try {
    const { data } = await admin()
      .from('labo_abonnements')
      .select('formule, statut')
      .eq('prothesiste_id', prothesisteId)
      .eq('statut', 'actif')
      .maybeSingle();

    if (!data) return 'essentiel'; // Fallback gracieux pendant beta
    return data.formule || 'essentiel';
  } catch (e) {
    console.error('[feature-gate] Erreur chargement plan:', e.message);
    return 'essentiel'; // Fallback en cas d'erreur
  }
}

// ---- Middleware feature gate ----
function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const plan = await getLabPlan(req.prothesisteId);
      req.laboPlan = plan; // Rendre dispo pour la route

      if (!hasFeature(plan, feature)) {
        const requiredPlan = FEATURES[feature];
        const formuleInfo = FORMULES[requiredPlan];
        return res.status(403).json({
          error: 'upgrade_required',
          message: `Cette fonctionnalité nécessite la formule ${formuleInfo.nom}. Veuillez mettre à niveau votre abonnement pour y accéder.`,
          formule_requise: requiredPlan,
          formule_actuelle: plan,
          prix_formule_requise: formuleInfo.prix
        });
      }
      next();
    } catch (e) {
      console.error('[feature-gate] Erreur middleware:', e.message);
      // En cas d'erreur, laisser passer (graceful pendant beta)
      next();
    }
  };
}

// ---- Middleware limite techniciens ----
function requireTechnicienSlot() {
  return async (req, res, next) => {
    try {
      const plan = await getLabPlan(req.prothesisteId);
      const formule = FORMULES[plan];
      if (formule.max_techniciens === null) return next(); // Illimite

      const { count } = await admin()
        .from('labo_techniciens')
        .select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', req.prothesisteId)
        .eq('actif', true);

      if (count >= formule.max_techniciens) {
        return res.status(403).json({
          error: 'limite_techniciens',
          message: `Votre formule ${formule.nom} est limitée à ${formule.max_techniciens} techniciens. Veuillez passer à une formule supérieure.`,
          limite: formule.max_techniciens,
          actuel: count,
          formule_actuelle: plan
        });
      }
      next();
    } catch (e) {
      console.error('[feature-gate] Erreur limite techniciens:', e.message);
      next();
    }
  };
}

// ---- Middleware limite BL/mois ----
function requireBLSlot() {
  return async (req, res, next) => {
    try {
      const plan = await getLabPlan(req.prothesisteId);
      const formule = FORMULES[plan];
      if (formule.max_bl_mois === null) return next(); // Illimite

      // Compter les BL du mois en cours
      const debut = new Date();
      debut.setDate(1);
      debut.setHours(0, 0, 0, 0);

      const { count } = await admin()
        .from('labo_bons_livraison')
        .select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', req.prothesisteId)
        .gte('created_at', debut.toISOString());

      if (count >= formule.max_bl_mois) {
        return res.status(403).json({
          error: 'limite_bl',
          message: `Votre formule ${formule.nom} est limitée à ${formule.max_bl_mois} bons de livraison par mois. Veuillez passer à une formule supérieure.`,
          limite: formule.max_bl_mois,
          actuel: count,
          formule_actuelle: plan
        });
      }
      next();
    } catch (e) {
      console.error('[feature-gate] Erreur limite BL:', e.message);
      next();
    }
  };
}

module.exports = {
  FORMULES,
  FEATURES,
  requireFeature,
  requireTechnicienSlot,
  requireBLSlot,
  hasFeature,
  getLabPlan,
  getFeaturesForPlan
};
