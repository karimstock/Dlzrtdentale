// =============================================
// JADOMI — Module Services & Marketplace
// Routes /api/services/*
// =============================================
const express = require('express');
const path = require('path');
const { authSupabase } = require('../multiSocietes/middleware');

module.exports = function mountServices(app) {
  // --- Routes publiques (sans auth) — monter EN PREMIER ---
  const publicRouter = express.Router();
  require('./public')(publicRouter);
  app.use('/api/services/public', publicRouter);

  // --- Routes authentifiées ---
  const router = express.Router();
  router.use(authSupabase());

  require('./profil')(router);
  require('./prestations')(router);
  require('./agenda')(router);
  require('./reservations')(router);
  require('./liste-attente')(router);
  require('./marketplace')(router);
  require('./stock')(router);
  require('./comptabilite')(router);
  require('./clients')(router);
  require('./avis')(router);

  app.use('/api/services', router);

  // --- Pages publiques (HTML) ---
  app.get('/booking/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/booking/index.html'));
  });

  console.log('[JADOMI] Routes /api/services montées');
};
