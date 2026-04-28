// =============================================
// JADOMI LABO — Index routes
// Monte toutes les sous-routes du module Labo
// =============================================

const express = require('express');
const { authSupabase, requireSociete, admin } = require('../../api/multiSocietes/middleware');

function createLaboRouter() {
  const router = express.Router();

  // Auth obligatoire sur toutes les routes labo
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

      if (roleErr || !role) return res.status(403).json({ error: 'Acces interdit a cette societe' });

      req.societeId = societeId;
      req.userRole = role.role;

      // Charger le prothesiste lie a cette societe
      const { data: prothesiste } = await admin()
        .from('labo_prothesistes')
        .select('*')
        .eq('societe_id', societeId)
        .maybeSingle();

      req.prothesiste = prothesiste; // peut etre null si pas encore configure
      req.prothesisteId = prothesiste?.id || null;

      next();
    } catch (e) {
      console.error('[LABO middleware]', e.message);
      res.status(500).json({ error: 'Erreur middleware labo' });
    }
  });

  // Monte les sous-routes
  router.use('/profil', require('./profil'));
  router.use('/catalogue', require('./catalogue'));
  router.use('/import-grille', require('./import-grille'));
  router.use('/dentistes', require('./dentistes'));
  router.use('/bons-livraison', require('./bons-livraison'));
  router.use('/factures', require('./factures-labo'));
  router.use('/declarations', require('./declaration-conformite'));
  router.use('/teintiers', require('./teintiers'));
  router.use('/portail-dentiste', require('./portail-dentiste'));
  router.use('/stock', require('./stock'));
  router.use('/remakes', require('./remakes'));
  router.use('/production', require('./production'));
  router.use('/garanties', require('./garanties'));
  router.use('/planning', require('./planning'));
  router.use('/expeditions', require('./expeditions'));
  router.use('/shade', require('./shade'));
  const techniciens = require('./techniciens');
  router.use('/techniciens', techniciens.router);
  router.use('/', techniciens.kpiRouter);
  const { chatRouter, portailChatRouter } = require('./chat');
  router.use('/chat', chatRouter);
  router.use('/portail-chat', portailChatRouter);

  return router;
}

module.exports = { createLaboRouter };
