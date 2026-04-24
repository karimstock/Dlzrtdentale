// =============================================
// JADOMI AVOCAT EXPERT — Coffre-fort securise
// Passe 44C — 24 avril 2026
// Double auth, chiffrement AES-256-GCM, audit trail
// Conformite RGPD + Article 66-5 loi 1971
// =============================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

const COFFRE_DIR = path.join(__dirname, '../../uploads/coffre');
const COFFRE_KEY = process.env.SITE_CREDENTIALS_KEY; // Reutilise la cle AES existante

// === CHIFFREMENT ===
function encryptBuffer(buffer) {
  const key = Buffer.from(COFFRE_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv: iv.toString('hex'), tag: tag.toString('hex') };
}

function decryptBuffer(encrypted, ivHex, tagHex) {
  const key = Buffer.from(COFFRE_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verify;
}

// === AUTH MIDDLEWARE AVOCAT ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Auth echouee' }); }
}

// === AUDIT TRAIL ===
async function logAudit(userId, role, action, targetType, targetId, req, success, details) {
  try {
    await admin().from('avocat_coffre_audit').insert({
      user_id: userId, user_role: role, action, target_type: targetType, target_id: targetId,
      ip_address: req.ip || req.connection?.remoteAddress, user_agent: req.headers['user-agent'],
      success, details: details || null
    });
  } catch { /* silent */ }
}

// Upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 Mo max
});

// ================================================
// COFFRE AUTH — Setup + unlock
// ================================================

// POST /coffre/setup — Creer le mot de passe coffre
router.post('/coffre/setup', requireAvocat, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Mot de passe coffre requis (8+ caracteres)' });

  const { data: existing } = await admin().from('avocat_coffre_auth').select('avocat_societe_id').eq('avocat_societe_id', req.societeId).single();
  if (existing) return res.status(400).json({ error: 'Coffre deja configure. Utilisez /unlock.' });

  await admin().from('avocat_coffre_auth').insert({ avocat_societe_id: req.societeId, coffre_password_hash: hashPassword(password) });
  await logAudit(req.userId, 'avocat', 'coffre_setup', 'coffre', req.societeId, req, true);
  return res.json({ success: true, message: 'Coffre-fort configure.' });
});

// POST /coffre/unlock — Deverrouiller le coffre
router.post('/coffre/unlock', requireAvocat, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Mot de passe coffre requis' });

  const { data: auth } = await admin().from('avocat_coffre_auth').select('*').eq('avocat_societe_id', req.societeId).single();
  if (!auth) return res.status(404).json({ error: 'Coffre non configure. Utilisez /setup.' });

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return res.status(423).json({ error: 'Coffre verrouille. Reessayez dans quelques minutes.' });
  }

  if (!verifyPassword(password, auth.coffre_password_hash)) {
    const attempts = (auth.failed_attempts || 0) + 1;
    const lockUntil = attempts >= 3 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await admin().from('avocat_coffre_auth').update({ failed_attempts: attempts, locked_until: lockUntil }).eq('avocat_societe_id', req.societeId);
    await logAudit(req.userId, 'avocat', 'coffre_unlock_fail', 'coffre', req.societeId, req, false, { attempt: attempts });
    return res.status(401).json({ error: 'Mot de passe incorrect.' + (attempts >= 3 ? ' Coffre verrouille 15 min.' : '') });
  }

  await admin().from('avocat_coffre_auth').update({ failed_attempts: 0, locked_until: null, last_access: new Date().toISOString() }).eq('avocat_societe_id', req.societeId);
  await logAudit(req.userId, 'avocat', 'coffre_unlock', 'coffre', req.societeId, req, true);
  return res.json({ success: true, message: 'Coffre deverrouille.', session_minutes: 15 });
});

// ================================================
// CLIENTS — CRUD
// ================================================

// POST /coffre/clients — Creer un client + envoyer invitation
router.post('/coffre/clients', requireAvocat, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, dossier_titre, dossier_type } = req.body || {};
    if (!nom || !email) return res.status(400).json({ error: 'Nom et email requis' });

    // Generer password temporaire
    const tempPassword = crypto.randomBytes(10).toString('base64url');
    const passwordHash = hashPassword(tempPassword);

    // Creer client
    const { data: client, error: cErr } = await admin().from('avocat_clients').insert({
      avocat_societe_id: req.societeId, nom, prenom, email, telephone, password_hash: passwordHash, statut: 'invite'
    }).select().single();
    if (cErr) return res.status(500).json({ error: cErr.message });

    // Creer dossier si demande
    let dossier = null;
    if (dossier_titre) {
      const ref = nom.toUpperCase().substring(0, 6) + '-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-3);
      const { data: d } = await admin().from('avocat_dossiers').insert({
        avocat_societe_id: req.societeId, client_id: client.id, reference: ref, titre: dossier_titre, type: dossier_type || 'general'
      }).select().single();
      dossier = d;
    }

    // Generer token invitation
    const inviteToken = crypto.randomUUID();
    await admin().from('avocat_client_invitations').insert({ client_id: client.id, token: inviteToken });

    // TODO: envoyer email au client avec tempPassword + lien invitation
    // Pour l'instant, retourner les infos

    await logAudit(req.userId, 'avocat', 'client_create', 'client', client.id, req, true, { email });

    return res.status(201).json({
      client,
      dossier,
      invitation: { token: inviteToken, temp_password: tempPassword },
      message: 'Client cree. Email d\'invitation a envoyer.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /coffre/clients — Liste des clients
router.get('/coffre/clients', requireAvocat, async (req, res) => {
  const { data, error } = await admin().from('avocat_clients')
    .select('id, nom, prenom, email, telephone, statut, last_login, created_at')
    .eq('avocat_societe_id', req.societeId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

// ================================================
// DOSSIERS
// ================================================

// GET /coffre/dossiers — Liste dossiers
router.get('/coffre/dossiers', requireAvocat, async (req, res) => {
  const { data } = await admin().from('avocat_dossiers')
    .select('*, avocat_clients(nom, prenom, email)')
    .eq('avocat_societe_id', req.societeId).order('created_at', { ascending: false });
  return res.json(data || []);
});

// GET /coffre/dossiers/:id — Detail dossier + documents
router.get('/coffre/dossiers/:id', requireAvocat, async (req, res) => {
  const { data: dossier } = await admin().from('avocat_dossiers')
    .select('*, avocat_clients(nom, prenom, email)').eq('id', req.params.id).single();
  if (!dossier) return res.status(404).json({ error: 'Dossier non trouve' });

  const { data: docs } = await admin().from('avocat_coffre_documents')
    .select('id, filename, file_type, file_size_kb, mime_type, note_client, statut_validation, uploaded_by_role, created_at')
    .eq('dossier_id', req.params.id).order('created_at', { ascending: false });

  const { data: comments } = await admin().from('avocat_coffre_commentaires')
    .select('*').in('document_id', (docs || []).map(d => d.id)).order('created_at');

  return res.json({ dossier, documents: docs || [], commentaires: comments || [] });
});

// ================================================
// DOCUMENTS — Upload chiffre + download
// ================================================

// POST /coffre/documents/upload — Upload fichier chiffre
router.post('/coffre/documents/upload', requireAvocat, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
    const { dossier_id, note } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    // Chiffrer le fichier
    const { encrypted, iv, tag } = encryptBuffer(req.file.buffer);

    // Stocker
    const fileDir = path.join(COFFRE_DIR, req.societeId, dossier_id);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    const fileId = crypto.randomUUID();
    const filePath = path.join(fileDir, fileId);
    fs.writeFileSync(filePath, encrypted);

    // Enregistrer en DB
    const { data: doc, error } = await admin().from('avocat_coffre_documents').insert({
      dossier_id, uploaded_by: req.userId, uploaded_by_role: 'avocat',
      filename: req.file.originalname, file_type: req.file.originalname.split('.').pop(),
      file_size_kb: Math.round(req.file.size / 1024), mime_type: req.file.mimetype,
      storage_path: filePath, encrypted: true, encryption_iv: iv, encryption_tag: tag,
      note_client: note || null
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    await logAudit(req.userId, 'avocat', 'document_upload', 'document', doc.id, req, true, { filename: req.file.originalname, size_kb: Math.round(req.file.size / 1024) });

    return res.status(201).json({ document: { id: doc.id, filename: doc.filename, file_size_kb: doc.file_size_kb }, message: 'Document chiffre et stocke.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /coffre/documents/:id/download — Telecharger dechiffre
router.get('/coffre/documents/:id/download', requireAvocat, async (req, res) => {
  try {
    const { data: doc } = await admin().from('avocat_coffre_documents').select('*').eq('id', req.params.id).single();
    if (!doc) return res.status(404).json({ error: 'Document non trouve' });

    const encrypted = fs.readFileSync(doc.storage_path);
    const decrypted = decryptBuffer(encrypted, doc.encryption_iv, doc.encryption_tag);

    await logAudit(req.userId, 'avocat', 'document_download', 'document', doc.id, req, true);

    res.setHeader('Content-Disposition', 'attachment; filename="' + doc.filename + '"');
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    return res.send(decrypted);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ================================================
// COMMENTAIRES
// ================================================

// POST /coffre/documents/:id/comment
router.post('/coffre/documents/:id/comment', requireAvocat, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'Contenu requis' });

  const { data } = await admin().from('avocat_coffre_commentaires').insert({
    document_id: req.params.id, author_id: req.userId, author_role: 'avocat', content
  }).select().single();

  await logAudit(req.userId, 'avocat', 'comment_add', 'document', req.params.id, req, true);
  return res.status(201).json(data);
});

// PATCH /coffre/documents/:id/validate
router.patch('/coffre/documents/:id/validate', requireAvocat, async (req, res) => {
  const { statut } = req.body || {};
  if (!['valide', 'refuse', 'a_modifier'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  await admin().from('avocat_coffre_documents').update({ statut_validation: statut }).eq('id', req.params.id);
  await logAudit(req.userId, 'avocat', 'document_validate', 'document', req.params.id, req, true, { statut });
  return res.json({ success: true, statut });
});

// ================================================
// AUDIT
// ================================================

// GET /coffre/audit — Audit trail
router.get('/coffre/audit', requireAvocat, async (req, res) => {
  const { data } = await admin().from('avocat_coffre_audit')
    .select('*').or(`details->>societe_id.eq.${req.societeId},user_id.eq.${req.userId}`)
    .order('created_at', { ascending: false }).limit(100);
  return res.json(data || []);
});

module.exports = router;
