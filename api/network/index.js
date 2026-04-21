// =============================================
// JADOMI — Module Network (Annuaire + Parrainage + Deals)
// Routes /api/network/*
// =============================================
const express = require('express');
const path = require('path');
const { authSupabase } = require('../multiSocietes/middleware');

module.exports = function mountNetwork(app) {
  // --- Routes publiques (sans auth) — monter EN PREMIER ---
  const publicRouter = express.Router();
  require('./annuaire')(publicRouter);
  app.use('/api/network/annuaire', publicRouter);

  // Routes deals publiques (listing)
  const dealsPublicRouter = express.Router();
  require('./deals').publicRoutes(dealsPublicRouter);
  app.use('/api/network/deals', dealsPublicRouter);

  // --- Routes authentifiées ---
  const router = express.Router();
  router.use(authSupabase());

  require('./parrainage')(router);
  require('./deals').authRoutes(router);

  app.use('/api/network', router);

  // --- Pages publiques (HTML) ---
  app.get('/annuaire', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/annuaire/index.html'));
  });
  app.get('/deals', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/deals/index.html'));
  });
  app.get('/pro/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/pro/index.html'));
  });

  console.log('[JADOMI] Routes /api/network montées');
};
