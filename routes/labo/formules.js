// =============================================
// JADOMI LABO — Routes formules / abonnements
// GET /api/labo/formules — Liste publique des formules
// GET /api/labo/formules/ma-formule — Formule actuelle du labo
// POST /api/labo/formules/changer — Changer de formule
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');
const { FORMULES, FEATURES, getLabPlan, getFeaturesForPlan } = require('./feature-gate');

// ---- GET /api/labo/formules — Liste toutes les formules ----
router.get('/', async (req, res) => {
  try {
    const formules = Object.entries(FORMULES).map(([key, f]) => ({
      id: key,
      nom: f.nom,
      prix_mensuel: f.prix,
      devise: 'EUR',
      max_techniciens: f.max_techniciens,
      max_bl_mois: f.max_bl_mois,
      features: getFeaturesForPlan(key)
    }));

    // Enrichir avec les features detaillees par tier
    const featuresByTier = {
      essentiel: [
        'Profil labo + catalogue produits',
        'Bons de livraison + facturation',
        'Gestion dentistes clients',
        'Stock basique',
        'Déclarations de conformité CE',
        'Portail dentiste (magic link)',
        'Teintiers',
        'Max 5 techniciens',
        'Max 200 BL/mois'
      ],
      pro: [
        'Tout Essentiel +',
        'Suivi production par étapes + QR',
        'Analytics techniciens + KPI dashboard',
        'Expéditions avec tracking',
        'Planning techniciens + congés',
        'Chat dentiste-labo temps réel',
        'Remakes & qualité',
        'Garanties',
        'Réseau France (annuaire + sous-traitance)',
        'Import grille tarifaire IA',
        'Max 15 techniciens',
        'Max 1 000 BL/mois'
      ],
      premium: [
        'Tout Pro +',
        'Scan barcode IA (waterfall 4 niveaux)',
        'Photo shade management + analyse IA Vision',
        'Fichiers 3D + validation portail dentiste',
        'Portail patient (suivi cas)',
        'BL vocal (commande par la voix)',
        'Achats groupés',
        'Entraide forum',
        'Maintenance machines',
        'Factur-X (facturation électronique)',
        'Export KPI CSV',
        'Techniciens illimités',
        'BL illimités',
        'Support prioritaire'
      ]
    };

    formules.forEach(f => {
      f.features_liste = featuresByTier[f.id] || [];
    });

    res.json({ formules });
  } catch (e) {
    console.error('[formules GET]', e.message);
    res.status(500).json({ error: 'Erreur chargement formules' });
  }
});

// ---- GET /api/labo/formules/ma-formule — Formule actuelle + stats ----
router.get('/ma-formule', async (req, res) => {
  try {
    if (!req.prothesisteId) {
      return res.status(400).json({ error: 'Profil prothésiste requis' });
    }

    // Charger l'abonnement
    const { data: abo } = await admin()
      .from('labo_abonnements')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    const formule = abo?.formule || 'essentiel';
    const formuleInfo = FORMULES[formule];

    // Stats d'usage : techniciens actifs
    const { count: nbTechniciens } = await admin()
      .from('labo_techniciens')
      .select('id', { count: 'exact', head: true })
      .eq('prothesiste_id', req.prothesisteId)
      .eq('actif', true);

    // Stats d'usage : BL ce mois
    const debut = new Date();
    debut.setDate(1);
    debut.setHours(0, 0, 0, 0);

    const { count: nbBLMois } = await admin()
      .from('labo_bons_livraison')
      .select('id', { count: 'exact', head: true })
      .eq('prothesiste_id', req.prothesisteId)
      .gte('created_at', debut.toISOString());

    res.json({
      abonnement: abo || {
        formule: 'essentiel',
        statut: 'actif',
        prix_mensuel: 49,
        date_debut: null,
        stripe_subscription_id: null
      },
      formule: {
        id: formule,
        nom: formuleInfo.nom,
        prix_mensuel: formuleInfo.prix,
        devise: 'EUR',
        max_techniciens: formuleInfo.max_techniciens,
        max_bl_mois: formuleInfo.max_bl_mois,
        features: getFeaturesForPlan(formule)
      },
      usage: {
        techniciens: nbTechniciens || 0,
        techniciens_max: formuleInfo.max_techniciens,
        techniciens_pct: formuleInfo.max_techniciens
          ? Math.round(((nbTechniciens || 0) / formuleInfo.max_techniciens) * 100)
          : 0,
        bl_mois: nbBLMois || 0,
        bl_mois_max: formuleInfo.max_bl_mois,
        bl_mois_pct: formuleInfo.max_bl_mois
          ? Math.round(((nbBLMois || 0) / formuleInfo.max_bl_mois) * 100)
          : 0
      }
    });
  } catch (e) {
    console.error('[formules ma-formule]', e.message);
    res.status(500).json({ error: 'Erreur chargement formule' });
  }
});

// ---- POST /api/labo/formules/changer — Changer de formule ----
router.post('/changer', async (req, res) => {
  try {
    if (!req.prothesisteId) {
      return res.status(400).json({ error: 'Profil prothésiste requis' });
    }

    const { formule: nouvelleFormule } = req.body;
    if (!nouvelleFormule || !FORMULES[nouvelleFormule]) {
      return res.status(400).json({
        error: 'Formule invalide. Valeurs acceptées : essentiel, pro, premium'
      });
    }

    const nouvelleInfo = FORMULES[nouvelleFormule];

    // Charger l'abonnement actuel
    const { data: aboActuel } = await admin()
      .from('labo_abonnements')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    const ancienneFormule = aboActuel?.formule || 'essentiel';

    if (ancienneFormule === nouvelleFormule) {
      return res.status(400).json({
        error: 'Vous êtes déjà sur la formule ' + nouvelleInfo.nom
      });
    }

    // Verifier que le downgrade est possible (limites)
    if (FORMULES[nouvelleFormule].niveau < FORMULES[ancienneFormule].niveau) {
      // Check techniciens
      if (nouvelleInfo.max_techniciens !== null) {
        const { count } = await admin()
          .from('labo_techniciens')
          .select('id', { count: 'exact', head: true })
          .eq('prothesiste_id', req.prothesisteId)
          .eq('actif', true);

        if (count > nouvelleInfo.max_techniciens) {
          return res.status(400).json({
            error: `Vous avez ${count} techniciens actifs. La formule ${nouvelleInfo.nom} est limitée à ${nouvelleInfo.max_techniciens}. Veuillez désactiver des techniciens avant de changer.`
          });
        }
      }
    }

    const now = new Date().toISOString();

    // Upsert l'abonnement
    if (aboActuel) {
      await admin()
        .from('labo_abonnements')
        .update({
          formule: nouvelleFormule,
          prix_mensuel: nouvelleInfo.prix,
          max_techniciens: nouvelleInfo.max_techniciens || 9999,
          max_bl_mois: nouvelleInfo.max_bl_mois || 999999,
          updated_at: now
        })
        .eq('id', aboActuel.id);
    } else {
      await admin()
        .from('labo_abonnements')
        .insert({
          prothesiste_id: req.prothesisteId,
          formule: nouvelleFormule,
          prix_mensuel: nouvelleInfo.prix,
          max_techniciens: nouvelleInfo.max_techniciens || 9999,
          max_bl_mois: nouvelleInfo.max_bl_mois || 999999,
          statut: 'actif'
        });
    }

    // Historique
    await admin()
      .from('labo_abonnements_historique')
      .insert({
        prothesiste_id: req.prothesisteId,
        ancienne_formule: ancienneFormule,
        nouvelle_formule: nouvelleFormule,
        ancien_prix: FORMULES[ancienneFormule]?.prix || 49,
        nouveau_prix: nouvelleInfo.prix,
        raison: req.body.raison || null
      });

    const direction = FORMULES[nouvelleFormule].niveau > FORMULES[ancienneFormule].niveau
      ? 'upgrade' : 'downgrade';

    console.log(`[formules] ${direction}: ${ancienneFormule} → ${nouvelleFormule} (prothesiste ${req.prothesisteId})`);

    res.json({
      success: true,
      direction,
      ancienne_formule: ancienneFormule,
      nouvelle_formule: nouvelleFormule,
      prix_mensuel: nouvelleInfo.prix,
      message: direction === 'upgrade'
        ? `Votre abonnement a été mis à niveau vers la formule ${nouvelleInfo.nom}. Vous avez désormais accès à toutes les fonctionnalités incluses.`
        : `Votre abonnement a été rétrogradé vers la formule ${nouvelleInfo.nom}. Certaines fonctionnalités ne seront plus disponibles.`
    });
  } catch (e) {
    console.error('[formules changer]', e.message);
    res.status(500).json({ error: 'Erreur changement de formule' });
  }
});

module.exports = router;
