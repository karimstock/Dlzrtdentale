// =============================================
// JADOMI — Multi-sociétés : middleware (auth + requireSociete + audit)
// =============================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let _admin = null;
function admin() {
  if (!_admin) {
    if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Valide le JWT Supabase dans Authorization: Bearer <token>, met req.user
function authSupabase() {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'missing_token' });
      const { data, error } = await admin().auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: 'invalid_token' });
      req.user = data.user;
      req.accessToken = token;
      next();
    } catch (e) {
      console.error('[authSupabase]', e.message);
      res.status(401).json({ error: 'auth_error' });
    }
  };
}

// Vérifie que l'user courant a un rôle sur la société demandée (header X-Societe-Id ou :id param)
function requireSociete({ paramName = 'id' } = {}) {
  return async (req, res, next) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.params[paramName] || req.body?.societe_id;
      if (!societeId) return res.status(400).json({ error: 'missing_societe_id' });
      if (!req.user?.id) return res.status(401).json({ error: 'unauth' });

      const { data, error } = await admin()
        .from('user_societe_roles')
        .select('role, societe_id, societes:societe_id(id, nom, type, plan, actif)')
        .eq('user_id', req.user.id)
        .eq('societe_id', societeId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(403).json({ error: 'forbidden_societe' });
      if (!data.societes?.actif) return res.status(403).json({ error: 'societe_inactive' });

      req.societe = data.societes;
      req.role = data.role;
      next();
    } catch (e) {
      console.error('[requireSociete]', e.message);
      res.status(500).json({ error: 'require_societe_error' });
    }
  };
}

// Log une action dans audit_log (best-effort, jamais bloquant)
async function auditLog({ userId, societeId, action, entity, entityId, meta, req }) {
  try {
    await admin().from('audit_log').insert({
      user_id: userId || null,
      societe_id: societeId || null,
      action, entity: entity || null, entity_id: entityId ? String(entityId) : null,
      meta: meta || null,
      ip: req?.ip || null,
      user_agent: req?.headers?.['user-agent'] || null
    });
  } catch (e) {
    console.warn('[auditLog] skip:', e.message);
  }
}

module.exports = { admin, authSupabase, requireSociete, auditLog };
