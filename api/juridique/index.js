// =============================================
// JADOMI — Module Professions Juridiques
// Routes /api/juridique/*
// =============================================
const express = require('express');
const path = require('path');
const { authSupabase } = require('../multiSocietes/middleware');

module.exports = function mountJuridique(app) {
  // --- Routes publiques (sans auth) — monter EN PREMIER ---
  const publicRouter = express.Router();
  require('./public')(publicRouter);
  app.use('/api/juridique/public', publicRouter);

  // --- Routes authentifiées ---
  const router = express.Router();
  router.use(authSupabase());

  require('./profil')(router);
  require('./offres')(router);
  require('./agenda')(router);
  require('./reservations')(router);
  require('./dossiers')(router);
  require('./comptabilite')(router);
  require('./avis')(router);
  require('./visio')(router);

  app.use('/api/juridique', router);

  // --- Pages publiques (HTML) ---
  app.get('/expert/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/expert/index.html'));
  });
  app.get('/visio/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/visio/index.html'));
  });

  console.log('[JADOMI] Routes /api/juridique montées');
};
