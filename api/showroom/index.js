// =============================================
// JADOMI — Module Showroom Créateurs
// Routes /api/showroom/*
// =============================================
const express = require('express');
const path = require('path');
const { authSupabase } = require('../multiSocietes/middleware');

module.exports = function mountShowroom(app) {
  // --- Routes publiques (sans auth) — monter EN PREMIER ---
  const publicRouter = express.Router();
  require('./public')(publicRouter);
  app.use('/api/showroom/public', publicRouter);

  // --- Routes authentifiées ---
  const router = express.Router();
  router.use(authSupabase());

  require('./profil')(router);
  require('./produits')(router);
  require('./commandes')(router);
  require('./location')(router);
  require('./sur-mesure')(router);
  require('./avis')(router);
  require('./messages')(router);
  require('./favoris')(router);

  app.use('/api/showroom', router);

  // --- Pages publiques (HTML) — monter EN PREMIER les plus spécifiques ---
  app.get('/showroom/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/showroom/boutique/index.html'));
  });
  app.get('/showroom', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/showroom/index.html'));
  });

  console.log('[JADOMI] Routes /api/showroom montées');
};
