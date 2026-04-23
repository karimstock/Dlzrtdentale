// =============================================
// JADOMI — Module GPO Smart Queue Auction
// Routes /api/gpo/*
// =============================================
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
const rateLimit = require('express-rate-limit');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

module.exports = function mountGpo(app) {
  const auth = authSupabase();

  // Rate limit sur les endpoints publics fournisseurs
  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requetes, reessayez dans 1 minute' }
  });

  // --- REQUESTS (dentiste, auth) ---
  require('./requests')(app, admin, auth);

  // --- SUPPLIERS (admin) ---
  require('./suppliers')(app, admin, auth);

  // --- PUBLIC (fournisseur, sans auth, par token) ---
  require('./public')(app, admin, publicLimiter);

  // --- TARGET PRICES ---
  require('./target-prices')(app, admin, auth);

  // --- RATINGS ---
  require('./ratings')(app, admin, auth);

  console.log('[JADOMI] Module GPO Smart Queue monte');
};
