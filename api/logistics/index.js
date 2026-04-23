// =============================================
// JADOMI — Module Logistique
// Routes /api/logistics/*
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { authSupabase } = require('../multiSocietes/middleware');

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

module.exports = function mountLogistics(app) {
  const auth = authSupabase();

  require('./calculate')(app, admin, auth);
  require('./warehouses')(app, admin, auth);
  require('./labels')(app, admin, auth);

  console.log('[JADOMI] Module Logistique monte');
};
