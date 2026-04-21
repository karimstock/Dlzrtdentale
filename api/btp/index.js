// =============================================
// JADOMI — Module Artisan BTP
// Routes /api/btp/*
// =============================================
const express = require('express');
const path = require('path');
const { authSupabase } = require('../multiSocietes/middleware');

module.exports = function mountBtp(app) {
  // --- Routes publiques (sans auth) — monter EN PREMIER ---
  const publicRouter = express.Router();
  require('./public')(publicRouter);
  app.use('/api/btp/public', publicRouter);

  // --- Routes authentifiees ---
  const router = express.Router();
  router.use(authSupabase());

  require('./profil')(router);
  require('./ouvriers')(router);
  require('./clients')(router);
  require('./chantiers')(router);
  require('./devis')(router);
  require('./factures')(router);
  require('./rapports')(router);
  require('./stock')(router);
  require('./comptabilite')(router);

  app.use('/api/btp', router);

  // --- Pages publiques (HTML) ---
  app.get('/artisan/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/artisan/index.html'));
  });

  console.log('[JADOMI] Routes /api/btp montees');
};
