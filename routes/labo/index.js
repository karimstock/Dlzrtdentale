// =============================================
// JADOMI LABO — Index routes
// Monte toutes les sous-routes du module Labo
// =============================================

const express = require('express');
const { authSupabase, requireSociete, admin } = require('../../api/multiSocietes/middleware');
const { requireFeature, requireTechnicienSlot, requireBLSlot } = require('./feature-gate');

function createLaboRouter() {
  const router = express.Router();

  // Routes publiques livreur app (auth par token livreur, PAS par Supabase)
  // Montées AVANT le middleware auth Supabase
  const tourneeRouter = require('./tournees-livreur');
  router.use('/tournees', (req, res, next) => {
    // Si le path commence par /app/, skip l'auth Supabase
    if (req.path.startsWith('/app/') || req.path === '/app') {
      return tourneeRouter(req, res, next);
    }
    next();
  });

  // Auth obligatoire sur toutes les AUTRES routes labo
  router.use(authSupabase());

  // Middleware : charge le prothesiste_id depuis X-Societe-Id
  router.use(async (req, res, next) => {
    try {
      const societeId = req.headers['x-societe-id'];
      if (!societeId) return res.status(400).json({ error: 'X-Societe-Id requis' });

      // Verifier role utilisateur sur cette societe
      const { data: role, error: roleErr } = await admin()
        .from('user_societe_roles')
        .select('role, societe_id')
        .eq('user_id', req.user.id)
        .eq('societe_id', societeId)
        .maybeSingle();

      if (roleErr || !role) return res.status(403).json({ error: 'Accès interdit à cette société' });

      req.societeId = societeId;
      req.userRole = role.role;

      // Charger le prothesiste lie a cette societe
      let { data: prothesiste } = await admin()
        .from('labo_prothesistes')
        .select('*')
        .eq('societe_id', societeId)
        .maybeSingle();

      // Auto-creation profil prothesiste si inexistant (evite 404 sur toutes les pages)
      if (!prothesiste) {
        const { data: soc } = await admin().from('societes').select('nom').eq('id', societeId).maybeSingle();
        const { data: created } = await admin()
          .from('labo_prothesistes')
          .insert({ societe_id: societeId, nom_labo: soc?.nom || 'Mon laboratoire', user_id: req.user.id })
          .select()
          .maybeSingle();
        prothesiste = created;
        if (created) console.log('[LABO] Auto-creation profil prothesiste pour societe', societeId);
      }

      req.prothesiste = prothesiste;
      req.prothesisteId = prothesiste?.id || null;

      next();
    } catch (e) {
      console.error('[LABO middleware]', e.message);
      res.status(500).json({ error: 'Erreur middleware labo' });
    }
  });

  // Monte les sous-routes
  // -- Formules (pas de gate, accessible a tous) --
  router.use('/formules', require('./formules'));

  // -- Essentiel (inclus pour tous) --
  router.use('/profil', require('./profil'));
  router.use('/catalogue', require('./catalogue'));
  router.use('/dentistes', require('./dentistes'));
  router.use('/bons-livraison', requireBLSlot(), require('./bons-livraison'));
  router.use('/factures', require('./factures-labo'));
  router.use('/declarations', require('./declaration-conformite'));
  router.use('/teintiers', require('./teintiers'));
  router.use('/portail-dentiste', require('./portail-dentiste'));
  router.use('/stock', require('./stock'));

  // -- Pro (requireFeature gate) --
  router.use('/import-grille', requireFeature('import_grille_ia'), require('./import-grille'));
  router.use('/remakes', requireFeature('remakes'), require('./remakes'));
  router.use('/production', requireFeature('production'), require('./production'));
  router.use('/garanties', requireFeature('garanties'), require('./garanties'));
  router.use('/planning', requireFeature('planning'), require('./planning'));
  router.use('/expeditions', requireFeature('expeditions'), require('./expeditions'));
  router.use('/tournees', requireFeature('tournees_livreur'), require('./tournees-livreur'));
  const { chatRouter, portailChatRouter } = require('./chat');
  router.use('/chat', requireFeature('chat'), chatRouter);
  router.use('/portail-chat', portailChatRouter);
  const techniciens = require('./techniciens');
  router.use('/techniciens', techniciens.router);
  router.use('/', techniciens.kpiRouter);

  // -- Premium (requireFeature gate) --
  router.use('/shade', requireFeature('shade_ia'), require('./shade'));
  router.use('/maintenance', requireFeature('maintenance'), require('./maintenance'));
  const { authRouter: portailPatientAuth } = require('./portail-patient');
  router.use('/portail-patient', requireFeature('portail_patient'), portailPatientAuth);
  const { fichiers3dRouter } = require('./fichiers3d');
  router.use('/fichiers3d', requireFeature('fichiers_3d'), fichiers3dRouter);
  router.use('/reseau', requireFeature('reseau_annuaire'), require('./reseau'));

  // Liaison Labo ↔ Dentiste (demandes de liaison bidirectionnelle)
  router.use('/liaison-dentiste', require('./liaison-dentiste'));

  return router;
}

// Public router pour portail patient (pas d'auth, acces par token)
function createLaboPublicRouter() {
  const publicRouter = express.Router();
  const { publicRouter: portailPatientPublic } = require('./portail-patient');
  publicRouter.use('/portail-patient', portailPatientPublic);
  const { portail3dRouter } = require('./fichiers3d');
  publicRouter.use('/portail-3d', portail3dRouter);
  return publicRouter;
}

module.exports = { createLaboRouter, createLaboPublicRouter };
