// =============================================
// JADOMI — Module Groupage Regional (Groupon dentaire)
// Routes /api/groupage/*
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

module.exports = function mountGroupage(app) {
  const auth = authSupabase();

  require('./campaigns')(app, admin, auth);
  require('./scheduler');

  console.log('[JADOMI] Module Groupage Regional monte');
};
