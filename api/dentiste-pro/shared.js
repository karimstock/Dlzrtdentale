// =============================================
// JADOMI — Dentiste Pro : utilitaires partages
// Praticiens sante (dentistes, kines, osteos...)
// Auth patient, middleware cabinet, helpers
// =============================================
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ===== Supabase Admin (lazy singleton) =====
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

// ===== JWT shared (HMAC-SHA256, 30 jours) =====
const JWT_SECRET = () => process.env.JWT_SECRET || 'jadomi-dentiste-pro-secret';
const TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 jours

// ===== Generic JWT verify (shared between patient & labo) =====
function verifyJWT(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET())
      .update(header + '.' + body).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function createPatientToken(patientId, cabinetId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    id: patientId,
    cabinet_id: cabinetId,
    exp: Date.now() + TOKEN_EXPIRY
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET())
    .update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyPatientToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET())
      .update(header + '.' + body).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ===== Middleware : requirePatient =====
// Verifie le JWT patient depuis Authorization: Bearer <token>
function requirePatient() {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorise' });
    }
    const payload = verifyPatientToken(auth.slice(7));
    if (!payload) {
      return res.status(401).json({ error: 'Token invalide ou expire' });
    }
    req.patient = payload;
    next();
  };
}

// ===== Middleware : requireLabo =====
// Verifie le JWT labo depuis Authorization: Bearer <token>
// Le JWT labo contient { labo_id, cabinet_id, type: 'labo' }
function requireLabo() {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorise' });
    }
    const payload = verifyJWT(auth.slice(7));
    if (!payload || payload.type !== 'labo') {
      return res.status(401).json({ error: 'Token labo invalide ou expire' });
    }
    req.labo = payload;
    next();
  };
}

// ===== Middleware : requireCabinet =====
// Auth Supabase (praticien) + verification societe + chargement cabinet
function requireCabinet() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');

  return async (req, res, next) => {
    // Etape 1 : auth Supabase (praticien)
    authSupabase()(req, res, async (err) => {
      if (err) return; // reponse deja envoyee
      if (res.headersSent) return;

      // Etape 2 : verification societe
      requireSociete()(req, res, async (err2) => {
        if (err2) return;
        if (res.headersSent) return;

        // Etape 3 : charger le cabinet lie a la societe
        try {
          const { data: cabinet, error } = await admin()
            .from('dentiste_pro_cabinets')
            .select('*')
            .eq('societe_id', req.societe.id)
            .maybeSingle();

          if (error) {
            console.error('[dentiste-pro] cabinet load error:', error);
            return res.status(500).json({ error: 'Erreur chargement cabinet' });
          }

          // Le cabinet peut ne pas exister encore (creation via POST /cabinet)
          req.cabinet = cabinet || null;
          next();
        } catch (e) {
          console.error('[dentiste-pro] requireCabinet:', e.message);
          res.status(500).json({ error: 'Erreur serveur' });
        }
      });
    });
  };
}

// ===== Middleware : requirePermission =====
// Verifie que l'utilisateur a la permission pour un module donne.
// Si l'utilisateur est le proprietaire de la societe (owner/admin), tout est autorise.
// Sinon, verifie dans dentiste_pro_team les permissions JSONB.
// Doit etre utilise APRES requireCabinet() dans la chaine middleware.
function requirePermission(module) {
  return async (req, res, next) => {
    try {
      // Si pas de cabinet, laisser passer (le handler gerera l'erreur)
      if (!req.cabinet || !req.user) return next();

      const userId = req.user.id;
      const cabinetId = req.cabinet.id;

      // Verifier si l'utilisateur est le proprietaire de la societe
      const { data: cabinet } = await admin()
        .from('dentiste_pro_cabinets')
        .select('societe_id')
        .eq('id', cabinetId)
        .maybeSingle();

      if (cabinet) {
        const { data: societeRole } = await admin()
          .from('user_societe_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('societe_id', cabinet.societe_id)
          .maybeSingle();

        // Proprietaire ou admin de la societe : acces total
        if (societeRole && (societeRole.role === 'owner' || societeRole.role === 'admin')) {
          return next();
        }
      }

      // Chercher le membre dans l'equipe
      const { data: member } = await admin()
        .from('dentiste_pro_team')
        .select('role, permissions, actif, invitation_accepted')
        .eq('user_id', userId)
        .eq('cabinet_id', cabinetId)
        .eq('actif', true)
        .maybeSingle();

      if (!member) {
        return res.status(403).json({
          error: 'Acces refuse',
          message: 'Vous ne faites pas partie de cette equipe'
        });
      }

      if (!member.invitation_accepted) {
        return res.status(403).json({
          error: 'Acces refuse',
          message: 'Votre invitation n\'a pas encore ete acceptee'
        });
      }

      // Verifier la permission du module
      const permissions = member.permissions || {};
      if (permissions[module] !== true) {
        return res.status(403).json({
          error: 'Permission refusee',
          message: `Vous n'avez pas acces au module "${module}". Contactez le praticien pour modifier vos permissions.`,
          module
        });
      }

      // Attacher les infos du membre au request pour usage eventuel
      req.teamMember = member;
      next();
    } catch (e) {
      console.error('[requirePermission]', e.message);
      // En cas d'erreur, laisser passer (fail-open pour ne pas bloquer le proprietaire)
      next();
    }
  };
}

// ===== Helpers =====

// Formate une date en format francais DD/MM/YYYY
function formatDateFR(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Convertit un horaire "HH:MM" en minutes depuis minuit
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Convertit des minutes depuis minuit en "HH:MM"
function fromMinutes(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = {
  admin,
  createPatientToken,
  verifyPatientToken,
  verifyJWT,
  requirePatient,
  requireLabo,
  requireCabinet,
  requirePermission,
  formatDateFR,
  toMinutes,
  fromMinutes
};
