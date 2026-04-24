// =============================================
// JADOMI AVOCAT EXPERT — Espace Client (cote client)
// Login par invitation, dossiers, upload docs, commentaires
// Auth separee de Supabase (clients d'avocats, pas users JADOMI)
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
const COFFRE_KEY = process.env.SITE_CREDENTIALS_KEY;

// === Crypto utils ===
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

function generateClientToken(clientId) {
  const payload = clientId + ':' + Date.now();
  const hmac = crypto.createHmac('sha256', COFFRE_KEY).update(payload).digest('hex');
  return Buffer.from(payload + ':' + hmac).toString('base64url');
}

function verifyClientToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const clientId = parts[0];
    const timestamp = parseInt(parts[1]);
    const hmac = parts.slice(2).join(':');
    // Verifier HMAC
    const expected = crypto.createHmac('sha256', COFFRE_KEY).update(clientId + ':' + timestamp).digest('hex');
    if (hmac !== expected) return null;
    // Verifier expiration (24h)
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;
    return clientId;
  } catch { return null; }
}

// === Auth middleware client ===
async function requireClient(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token client requis' });
  const clientId = verifyClientToken(token);
  if (!clientId) return res.status(401).json({ error: 'Session expiree, reconnectez-vous' });
  const { data: client } = await admin().from('avocat_clients').select('*').eq('id', clientId).single();
  if (!client || client.statut === 'archive') return res.status(401).json({ error: 'Compte desactive' });
  req.clientId = clientId;
  req.client = client;
  next();
}

// === Audit ===
async function logAudit(userId, role, action, targetType, targetId, req, success, details) {
  try {
    await admin().from('avocat_coffre_audit').insert({
      user_id: userId, user_role: role, action, target_type: targetType, target_id: targetId,
      ip_address: req.ip, user_agent: req.headers['user-agent'], success, details
    });
  } catch {}
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ================================================
// LOGIN — Par invitation ou email/password
// ================================================

// GET /espace-client/invitation/:token — Verifier invitation
router.get('/invitation/:token', async (req, res) => {
  const { data: invite } = await admin().from('avocat_client_invitations')
    .select('*, avocat_clients(nom, prenom, email, avocat_societe_id)')
    .eq('token', req.params.token).single();

  if (!invite) return res.status(404).json({ error: 'Invitation invalide ou expiree' });
  if (invite.used) return res.json({ valid: true, used: true, client_email: invite.avocat_clients?.email, message: 'Cette invitation a deja ete utilisee. Connectez-vous avec vos identifiants.' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invitation expiree. Contactez votre avocat.' });

  return res.json({
    valid: true,
    used: false,
    client_email: invite.avocat_clients?.email,
    client_nom: invite.avocat_clients?.nom,
    client_prenom: invite.avocat_clients?.prenom,
    requires_password_change: true
  });
});

// POST /espace-client/login — Connexion client
router.post('/login', async (req, res) => {
  const { email, password, invitation_token } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  // Trouver le client
  const { data: client } = await admin().from('avocat_clients')
    .select('*').eq('email', email).single();

  if (!client) {
    await logAudit(null, 'client', 'login_fail', 'client', null, req, false, { email, reason: 'not_found' });
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  // Check lock
  if (client.locked_until && new Date(client.locked_until) > new Date()) {
    return res.status(423).json({ error: 'Compte temporairement verrouille. Reessayez dans quelques minutes.' });
  }

  // Verifier password
  if (!verifyPassword(password, client.password_hash)) {
    const attempts = (client.failed_login_attempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await admin().from('avocat_clients').update({ failed_login_attempts: attempts, locked_until: lockUntil }).eq('id', client.id);
    await logAudit(client.id, 'client', 'login_fail', 'client', client.id, req, false, { attempt: attempts });
    return res.status(401).json({ error: 'Mot de passe incorrect' + (attempts >= 4 ? '. Attention, compte bientot verrouille.' : '') });
  }

  // Si invitation_token : marquer comme utilise
  if (invitation_token) {
    await admin().from('avocat_client_invitations').update({ used: true, used_at: new Date().toISOString() }).eq('token', invitation_token);
  }

  // Reset failed attempts, update login
  await admin().from('avocat_clients').update({
    failed_login_attempts: 0, locked_until: null,
    last_login: new Date().toISOString(),
    statut: client.statut === 'invite' ? 'actif' : client.statut
  }).eq('id', client.id);

  // Generer token de session
  const sessionToken = generateClientToken(client.id);

  await logAudit(client.id, 'client', 'login_success', 'client', client.id, req, true);

  return res.json({
    success: true,
    token: sessionToken,
    client: { id: client.id, nom: client.nom, prenom: client.prenom, email: client.email },
    requires_password_change: !client.password_changed,
    requires_rgpd_consent: !client.rgpd_consent
  });
});

// POST /espace-client/change-password
router.post('/change-password', requireClient, async (req, res) => {
  const { new_password } = req.body || {};
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Nouveau mot de passe requis (8+ caracteres)' });

  await admin().from('avocat_clients').update({
    password_hash: hashPassword(new_password),
    password_changed: true
  }).eq('id', req.clientId);

  await logAudit(req.clientId, 'client', 'password_change', 'client', req.clientId, req, true);
  return res.json({ success: true });
});

// POST /espace-client/rgpd-consent
router.post('/rgpd-consent', requireClient, async (req, res) => {
  await admin().from('avocat_clients').update({
    rgpd_consent: true,
    rgpd_consent_date: new Date().toISOString(),
    rgpd_consent_ip: req.ip
  }).eq('id', req.clientId);

  await logAudit(req.clientId, 'client', 'rgpd_consent', 'client', req.clientId, req, true);
  return res.json({ success: true });
});

// ================================================
// DOSSIERS — Vue client
// ================================================

// GET /espace-client/mes-dossiers
router.get('/mes-dossiers', requireClient, async (req, res) => {
  const { data } = await admin().from('avocat_dossiers')
    .select('id, reference, titre, type, statut, date_ouverture')
    .eq('client_id', req.clientId)
    .order('created_at', { ascending: false });

  // Compter documents et commentaires non lus par dossier
  const dossiers = [];
  for (const d of (data || [])) {
    const { count: docCount } = await admin().from('avocat_coffre_documents').select('*', { count: 'exact', head: true }).eq('dossier_id', d.id);
    const { count: unreadCount } = await admin().from('avocat_coffre_commentaires').select('*', { count: 'exact', head: true })
      .eq('author_role', 'avocat').eq('read_by_other', false)
      .in('document_id', (await admin().from('avocat_coffre_documents').select('id').eq('dossier_id', d.id)).data?.map(x => x.id) || []);
    dossiers.push({ ...d, nb_documents: docCount || 0, nb_non_lus: unreadCount || 0 });
  }

  return res.json(dossiers);
});

// GET /espace-client/dossier/:id
router.get('/dossier/:id', requireClient, async (req, res) => {
  const { data: dossier } = await admin().from('avocat_dossiers')
    .select('*').eq('id', req.params.id).eq('client_id', req.clientId).single();
  if (!dossier) return res.status(404).json({ error: 'Dossier non trouve' });

  const { data: docs } = await admin().from('avocat_coffre_documents')
    .select('id, filename, file_type, file_size_kb, mime_type, note_client, statut_validation, uploaded_by_role, created_at')
    .eq('dossier_id', dossier.id).order('created_at', { ascending: false });

  const { data: comments } = await admin().from('avocat_coffre_commentaires')
    .select('*').in('document_id', (docs || []).map(d => d.id)).order('created_at');

  // Marquer les commentaires avocat comme lus
  const avocatCommentIds = (comments || []).filter(c => c.author_role === 'avocat' && !c.read_by_other).map(c => c.id);
  if (avocatCommentIds.length) {
    await admin().from('avocat_coffre_commentaires').update({ read_by_other: true, read_at: new Date().toISOString() }).in('id', avocatCommentIds);
  }

  return res.json({ dossier, documents: docs || [], commentaires: comments || [] });
});

// ================================================
// DOCUMENTS — Upload et download cote client
// ================================================

// POST /espace-client/documents/upload
router.post('/documents/upload', requireClient, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
    const { dossier_id, note } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    // Verifier que le dossier appartient au client
    const { data: dossier } = await admin().from('avocat_dossiers').select('id, avocat_societe_id').eq('id', dossier_id).eq('client_id', req.clientId).single();
    if (!dossier) return res.status(403).json({ error: 'Dossier non autorise' });

    // Chiffrer
    const { encrypted, iv, tag } = encryptBuffer(req.file.buffer);

    // Stocker
    const fileDir = path.join(COFFRE_DIR, dossier.avocat_societe_id, dossier_id);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    const fileId = crypto.randomUUID();
    fs.writeFileSync(path.join(fileDir, fileId), encrypted);

    // DB
    const { data: doc } = await admin().from('avocat_coffre_documents').insert({
      dossier_id, uploaded_by: req.clientId, uploaded_by_role: 'client',
      filename: req.file.originalname, file_type: req.file.originalname.split('.').pop(),
      file_size_kb: Math.round(req.file.size / 1024), mime_type: req.file.mimetype,
      storage_path: path.join(fileDir, fileId), encrypted: true,
      encryption_iv: iv, encryption_tag: tag, note_client: note || null
    }).select().single();

    await logAudit(req.clientId, 'client', 'document_upload', 'document', doc.id, req, true, { filename: req.file.originalname });

    return res.status(201).json({ document: { id: doc.id, filename: doc.filename, file_size_kb: doc.file_size_kb } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /espace-client/documents/:id/download
router.get('/documents/:id/download', requireClient, async (req, res) => {
  try {
    const { data: doc } = await admin().from('avocat_coffre_documents').select('*').eq('id', req.params.id).single();
    if (!doc) return res.status(404).json({ error: 'Document non trouve' });

    // Verifier que le client a acces au dossier
    const { data: dossier } = await admin().from('avocat_dossiers').select('id').eq('id', doc.dossier_id).eq('client_id', req.clientId).single();
    if (!dossier) return res.status(403).json({ error: 'Acces refuse' });

    const encrypted = fs.readFileSync(doc.storage_path);
    const decrypted = decryptBuffer(encrypted, doc.encryption_iv, doc.encryption_tag);

    await logAudit(req.clientId, 'client', 'document_download', 'document', doc.id, req, true);

    res.setHeader('Content-Disposition', 'attachment; filename="' + doc.filename + '"');
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    return res.send(decrypted);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ================================================
// COMMENTAIRES — Cote client
// ================================================

// POST /espace-client/documents/:id/comment
router.post('/documents/:id/comment', requireClient, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'Contenu requis' });

  const { data } = await admin().from('avocat_coffre_commentaires').insert({
    document_id: req.params.id, author_id: req.clientId, author_role: 'client', content
  }).select().single();

  await logAudit(req.clientId, 'client', 'comment_add', 'document', req.params.id, req, true);
  return res.status(201).json(data);
});

// PATCH /espace-client/documents/:id/note — Modifier la note client
router.patch('/documents/:id/note', requireClient, async (req, res) => {
  const { note } = req.body || {};
  await admin().from('avocat_coffre_documents').update({ note_client: note }).eq('id', req.params.id);
  return res.json({ success: true });
});

module.exports = router;
