// =============================================
// JADOMI — Multi-sociétés : routes /api/societes/*
// =============================================
const express = require('express');
const multer = require('multer');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');

const LOGO_MAX = 2 * 1024 * 1024;
const LOGO_MIME = new Set(['image/jpeg','image/png','image/svg+xml','image/webp']);
const uploadLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: LOGO_MAX } });

const SOCIETE_TYPES = [
  'cabinet_dentaire','sci','societe_commerciale',
  'sas','sarl','eurl','sa','snc','ei','auto_entrepreneur',
  'profession_liberale','association','autre'
];
const ROLES = ['proprietaire', 'associe', 'lecteur', 'comptable', 'employe'];
const SECTEURS_VALIDES = ['sante','btp','esthetique','restauration','juridique','autre'];

function sanitizeSocietePayload(body, isCreate = false) {
  const allowed = [
    'type','sous_type','nom','siren','siret','tva_intracom','regime_tva',
    'adresse','code_postal','ville','pays',
    'email','email_facturation','email_mailing',
    'telephone','site_web','logo_url','cgv','iban','bic','regime_fiscal',
    'conditions_paiement','penalites_retard','indemnite_recouvrement',
    'capital_social','rcs_ville','modules','couleur_accent','icone',
    'secteur','secteurs_cibles'
  ];
  const out = {};
  for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
  if (out.secteur !== undefined && out.secteur !== null && !SECTEURS_VALIDES.includes(out.secteur)) {
    throw new Error('secteur invalide: ' + out.secteur);
  }
  if (out.secteurs_cibles !== undefined) {
    if (!Array.isArray(out.secteurs_cibles)) throw new Error('secteurs_cibles doit être un tableau');
    for (const s of out.secteurs_cibles) {
      if (!SECTEURS_VALIDES.includes(s)) throw new Error('secteur invalide: ' + s);
    }
  }
  if (isCreate) {
    if (!out.type || !SOCIETE_TYPES.includes(out.type)) throw new Error('type invalide');
    if (!out.nom || !out.nom.trim()) throw new Error('nom requis');
  }
  return out;
}

module.exports = function mountSocietes(app) {
  const router = express.Router();
  router.use(authSupabase());

  // ---------- GET /api/societes — liste des sociétés de l'user ----------
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('user_societe_roles')
        .select('role, societe:societe_id(*)')
        .eq('user_id', req.user.id);
      if (error) throw error;
      const societes = (data || [])
        .map(r => ({ ...r.societe, role: r.role }))
        .filter(s => s && s.actif !== false);
      res.json({ success: true, societes });
    } catch (e) {
      console.error('[GET /api/societes]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- POST /api/societes — créer une société ----------
  router.post('/', async (req, res) => {
    try {
      const payload = sanitizeSocietePayload(req.body || {}, true);
      payload.owner_id = req.user.id;
      const { data, error } = await admin()
        .from('societes').insert(payload).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: data.id,
        action: 'create', entity: 'societe', entityId: data.id, req });
      res.json({ success: true, societe: data });
    } catch (e) {
      console.error('[POST /api/societes]', e.message);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // ---------- GET /api/societes/:id ----------
  router.get('/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('societes').select('*').eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, societe: { ...data, role: req.role } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- PATCH /api/societes/:id ----------
  router.patch('/:id', requireSociete(), async (req, res) => {
    try {
      if (!['proprietaire','associe'].includes(req.role))
        return res.status(403).json({ error: 'role_insuffisant' });
      const payload = sanitizeSocietePayload(req.body || {});
      const { data, error } = await admin()
        .from('societes').update(payload).eq('id', req.params.id).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: data.id,
        action: 'update', entity: 'societe', entityId: data.id, meta: payload, req });
      res.json({ success: true, societe: data });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // ---------- POST /api/societes/:id/logo — upload logo ----------
  router.post('/:id/logo', requireSociete(), uploadLogo.single('file'), async (req, res) => {
    try {
      if (!['proprietaire','associe'].includes(req.role))
        return res.status(403).json({ error: 'role_insuffisant' });
      if (!req.file) return res.status(400).json({ error: 'file_requis' });
      if (!LOGO_MIME.has(req.file.mimetype))
        return res.status(400).json({ error: 'mime_invalide', allowed: Array.from(LOGO_MIME) });
      if (req.file.size > LOGO_MAX)
        return res.status(400).json({ error: 'fichier_trop_lourd', max_bytes: LOGO_MAX });

      const ext = ({
        'image/jpeg':'jpg','image/png':'png','image/svg+xml':'svg','image/webp':'webp'
      })[req.file.mimetype] || 'bin';
      const path = `${req.params.id}/logo-${Date.now()}.${ext}`;

      const { error: upErr } = await admin().storage
        .from('logos-societes')
        .upload(path, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
          cacheControl: '3600'
        });
      if (upErr) throw upErr;

      const { data: pub } = admin().storage.from('logos-societes').getPublicUrl(path);
      const logo_url = pub?.publicUrl || null;
      if (!logo_url) throw new Error('url_publique_indisponible');

      const { data: soc, error: updErr } = await admin().from('societes')
        .update({ logo_url })
        .eq('id', req.params.id)
        .select('*').single();
      if (updErr) throw updErr;

      await auditLog({ userId: req.user.id, societeId: req.params.id,
        action: 'upload_logo', entity: 'societe', entityId: req.params.id,
        meta: { path, size: req.file.size, mime: req.file.mimetype }, req });
      res.json({ success: true, logo_url, societe: soc });
    } catch (e) {
      console.error('[POST logo]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- DELETE /api/societes/:id/logo — retire le logo ----------
  router.delete('/:id/logo', requireSociete(), async (req, res) => {
    try {
      if (!['proprietaire','associe'].includes(req.role))
        return res.status(403).json({ error: 'role_insuffisant' });
      const { data: soc } = await admin().from('societes')
        .update({ logo_url: null })
        .eq('id', req.params.id)
        .select('*').single();
      res.json({ success: true, societe: soc });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ---------- DELETE /api/societes/:id — owner seulement ----------
  router.delete('/:id', requireSociete(), async (req, res) => {
    try {
      const { data: soc } = await admin().from('societes').select('owner_id').eq('id', req.params.id).single();
      if (!soc || soc.owner_id !== req.user.id)
        return res.status(403).json({ error: 'only_owner_can_delete' });
      await admin().from('societes').delete().eq('id', req.params.id);
      await auditLog({ userId: req.user.id, societeId: req.params.id,
        action: 'delete', entity: 'societe', entityId: req.params.id, req });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- GET /api/societes/:id/membres ----------
  router.get('/:id/membres', requireSociete(), async (req, res) => {
    try {
      const { data: roles, error } = await admin()
        .from('user_societe_roles')
        .select('id, user_id, role, created_at, invite_par')
        .eq('societe_id', req.params.id);
      if (error) throw error;
      const ids = roles.map(r => r.user_id);
      const out = [];
      for (const r of roles) {
        try {
          const { data: u } = await admin().auth.admin.getUserById(r.user_id);
          out.push({ ...r, email: u?.user?.email || null });
        } catch {
          out.push({ ...r, email: null });
        }
      }
      res.json({ success: true, membres: out });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- POST /api/societes/:id/invite — inviter par email ----------
  router.post('/:id/invite', requireSociete(), async (req, res) => {
    try {
      if (req.role !== 'proprietaire')
        return res.status(403).json({ error: 'only_owner_can_invite' });
      const { email, role = 'associe' } = req.body || {};
      if (!email) return res.status(400).json({ error: 'email requis' });
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'role invalide' });

      // 1. cherche le user Supabase Auth par email
      const { data: users } = await admin().auth.admin.listUsers();
      const u = (users?.users || []).find(x => (x.email || '').toLowerCase() === email.toLowerCase());

      let invitedUserId = u?.id;
      if (!invitedUserId) {
        // 2. invite via Supabase Auth (envoie un mail de signup)
        const { data: inv, error: invErr } = await admin().auth.admin.inviteUserByEmail(email);
        if (invErr) throw invErr;
        invitedUserId = inv?.user?.id;
      }
      if (!invitedUserId) throw new Error('invite_failed');

      const { error: rErr } = await admin().from('user_societe_roles').insert({
        user_id: invitedUserId, societe_id: req.params.id, role,
        invite_par: req.user.id
      });
      if (rErr && !String(rErr.message).includes('duplicate')) throw rErr;

      await auditLog({ userId: req.user.id, societeId: req.params.id,
        action: 'invite', entity: 'membre', entityId: invitedUserId,
        meta: { email, role }, req });
      res.json({ success: true });
    } catch (e) {
      console.error('[invite]', e.message);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // ---------- DELETE /api/societes/:id/membres/:userId ----------
  router.delete('/:id/membres/:userId', requireSociete(), async (req, res) => {
    try {
      if (req.role !== 'proprietaire')
        return res.status(403).json({ error: 'only_owner_can_remove' });
      const { data: soc } = await admin().from('societes').select('owner_id').eq('id', req.params.id).single();
      if (req.params.userId === soc?.owner_id)
        return res.status(400).json({ error: 'cannot_remove_owner' });
      await admin().from('user_societe_roles').delete()
        .eq('societe_id', req.params.id).eq('user_id', req.params.userId);
      await auditLog({ userId: req.user.id, societeId: req.params.id,
        action: 'remove', entity: 'membre', entityId: req.params.userId, req });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- POST /api/societes/bootstrap-cabinet ----------
  // Crée silencieusement 1 société cabinet_dentaire pour un user existant qui n'en a pas.
  router.post('/bootstrap-cabinet', async (req, res) => {
    try {
      const { data: existing } = await admin()
        .from('user_societe_roles').select('id').eq('user_id', req.user.id).limit(1);
      if (existing && existing.length > 0)
        return res.json({ success: true, bootstrapped: false });
      const nom = req.body?.nom || req.user.user_metadata?.nom || req.user.email || 'Mon cabinet';
      const { data, error } = await admin().from('societes').insert({
        owner_id: req.user.id, type: 'cabinet_dentaire', nom
      }).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: data.id,
        action: 'bootstrap_cabinet', entity: 'societe', entityId: data.id, req });
      res.json({ success: true, bootstrapped: true, societe: data });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.use('/api/societes', router);
  console.log('[JADOMI] Routes /api/societes montées');
};
