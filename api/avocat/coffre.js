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
  if (hash.length !== verify.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
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
  } catch { return res.status(401).json({ error: 'Auth échouée' }); }
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
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.txt', '.zip'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 Mo max
  fileFilter: (req, file, cb) => {
    const ext = '.' + (file.originalname.split('.').pop() || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) return cb(null, true);
    cb(new Error('Type de fichier non autorisé'));
  }
});

// ================================================
// COFFRE AUTH — Setup + unlock
// ================================================

// POST /coffre/setup — Creer le mot de passe coffre
router.post('/coffre/setup', requireAvocat, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Mot de passe coffre requis (8+ caractères)' });

  const { data: existing } = await admin().from('avocat_coffre_auth').select('avocat_societe_id').eq('avocat_societe_id', req.societeId).single();
  if (existing) return res.status(400).json({ error: 'Coffre déjà configuré. Utilisez /unlock.' });

  await admin().from('avocat_coffre_auth').insert({ avocat_societe_id: req.societeId, coffre_password_hash: hashPassword(password) });
  await logAudit(req.userId, 'avocat', 'coffre_setup', 'coffre', req.societeId, req, true);
  return res.json({ success: true, message: 'Coffre-fort configuré.' });
});

// POST /coffre/unlock — Deverrouiller le coffre
router.post('/coffre/unlock', requireAvocat, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Mot de passe coffre requis' });

  const { data: auth } = await admin().from('avocat_coffre_auth').select('*').eq('avocat_societe_id', req.societeId).single();
  if (!auth) return res.status(404).json({ error: 'Coffre non configuré. Utilisez /setup.' });

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return res.status(423).json({ error: 'Coffre verrouillé. Réessayez dans quelques minutes.' });
  }

  if (!verifyPassword(password, auth.coffre_password_hash)) {
    const attempts = (auth.failed_attempts || 0) + 1;
    const lockUntil = attempts >= 3 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await admin().from('avocat_coffre_auth').update({ failed_attempts: attempts, locked_until: lockUntil }).eq('avocat_societe_id', req.societeId);
    await logAudit(req.userId, 'avocat', 'coffre_unlock_fail', 'coffre', req.societeId, req, false, { attempt: attempts });
    return res.status(401).json({ error: 'Mot de passe incorrect.' + (attempts >= 3 ? ' Coffre verrouillé 15 min.' : '') });
  }

  // Mot de passe correct → envoyer OTP pour double auth
  await admin().from('avocat_coffre_auth').update({ failed_attempts: 0, locked_until: null }).eq('avocat_societe_id', req.societeId);

  const { generateCode, sendOTP } = require('../../services/otp-sender');
  const canal = auth.otp_canal_prefere || 'email';
  const code = generateCode();

  // Determiner la destination
  let destination;
  if (canal === 'email') {
    destination = req.userEmail || req.user?.email || '';
  } else {
    destination = auth.otp_telephone || '';
  }

  if (!destination) {
    // SECURITE : bloquer si aucune destination OTP configuree (ne jamais bypass le 2FA)
    await logAudit(req.userId, 'avocat', 'coffre_unlock_blocked', 'coffre', req.societeId, req, false, { otp: 'no_destination_configured' });
    return res.status(400).json({ error: 'Aucune destination OTP configurée. Configurez votre email ou téléphone dans les préférences du coffre.' });
  }

  // Sauvegarder le code OTP
  await admin().from('avocat_otp_codes').insert({
    user_id: req.userId, user_role: 'avocat', canal, destination, code
  });

  // Envoyer le code
  const sendResult = await sendOTP(canal, destination, code, 'JADOMI Avocat');

  if (sendResult.success) {
    await logAudit(req.userId, 'avocat', 'otp_sent', 'coffre', req.societeId, req, true, { canal });
    return res.json({
      requires_otp: true,
      canal,
      destination_masked: canal === 'email' ? destination.replace(/(.{2}).*(@.*)/, '$1***$2') : destination.replace(/(\d{2}).*(\d{2})$/, '$1******$2'),
      message: 'Code envoyé par ' + canal + '. Valable 5 minutes.'
    });
  } else {
    // SECURITE : ne jamais bypass le 2FA si l'envoi echoue
    await logAudit(req.userId, 'avocat', 'otp_send_failed', 'coffre', req.societeId, req, false, { canal, error: sendResult.error });
    return res.status(503).json({ error: 'Envoi du code OTP échoué. Réessayez ou changez de canal (SMS/Email).' });
  }
});

// POST /coffre/verify-otp — Verifier le code OTP
router.post('/coffre/verify-otp', requireAvocat, async (req, res) => {
  const { code } = req.body || {};
  if (!code || code.length !== 6) return res.status(400).json({ error: 'Code 6 chiffres requis' });

  // Trouver le dernier OTP non expire
  const { data: otp } = await admin().from('avocat_otp_codes')
    .select('*')
    .eq('user_id', req.userId)
    .eq('user_role', 'avocat')
    .eq('verified', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!otp) return res.status(400).json({ error: 'Aucun code en attente ou code expiré. Réessayez.' });

  if (otp.attempts >= 3) {
    return res.status(429).json({ error: 'Trop de tentatives. Redemandez un code.' });
  }

  if (otp.code !== code) {
    await admin().from('avocat_otp_codes').update({ attempts: (otp.attempts || 0) + 1 }).eq('id', otp.id);
    await logAudit(req.userId, 'avocat', 'otp_verify_fail', 'coffre', req.societeId, req, false);
    return res.status(401).json({ error: 'Code incorrect. ' + (2 - (otp.attempts || 0)) + ' tentative(s) restante(s).' });
  }

  // Code correct
  await admin().from('avocat_otp_codes').update({ verified: true, verified_at: new Date().toISOString() }).eq('id', otp.id);
  await admin().from('avocat_coffre_auth').update({ last_access: new Date().toISOString() }).eq('avocat_societe_id', req.societeId);
  await logAudit(req.userId, 'avocat', 'coffre_unlock', 'coffre', req.societeId, req, true, { otp: 'verified' });

  return res.json({ success: true, message: 'Coffre déverrouillé.', session_minutes: 15 });
});

// POST /coffre/resend-otp — Renvoyer un nouveau code
router.post('/coffre/resend-otp', requireAvocat, async (req, res) => {
  const { canal } = req.body || {};
  const { data: auth } = await admin().from('avocat_coffre_auth').select('*').eq('avocat_societe_id', req.societeId).single();
  if (!auth) return res.status(404).json({ error: 'Coffre non configuré' });

  const { generateCode, sendOTP } = require('../../services/otp-sender');
  const chosenCanal = canal || auth.otp_canal_prefere || 'email';
  const code = generateCode();

  let destination;
  if (chosenCanal === 'email') destination = req.userEmail || '';
  else destination = auth.otp_telephone || '';

  if (!destination) return res.status(400).json({ error: 'Pas de destination pour ' + chosenCanal + '. Configurez votre téléphone.' });

  await admin().from('avocat_otp_codes').insert({ user_id: req.userId, user_role: 'avocat', canal: chosenCanal, destination, code });
  const r = await sendOTP(chosenCanal, destination, code, 'JADOMI Avocat');

  if (r.success) return res.json({ success: true, canal: chosenCanal, message: 'Nouveau code envoyé par ' + chosenCanal + '.' });
  return res.status(500).json({ error: r.error || 'Envoi échoué' });
});

// PATCH /coffre/otp-preferences — Changer canal prefere
router.patch('/coffre/otp-preferences', requireAvocat, async (req, res) => {
  const { canal, telephone } = req.body || {};
  const updates = {};
  if (canal && ['sms', 'whatsapp', 'email'].includes(canal)) updates.otp_canal_prefere = canal;
  if (telephone) updates.otp_telephone = telephone;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'canal ou telephone requis' });

  await admin().from('avocat_coffre_auth').update(updates).eq('avocat_societe_id', req.societeId);
  return res.json({ success: true });
});

// ================================================
// CLIENTS — CRUD
// ================================================

// POST /coffre/clients — Creer un client + envoyer invitation
router.post('/coffre/clients', requireAvocat, async (req, res) => {
  try {
    const { civilite, nom, prenom, email, telephone, adresse, dossier_titre, dossier_type } = req.body || {};
    if (!nom || !email) return res.status(400).json({ error: 'Nom et email requis' });

    // Generer password temporaire
    const tempPassword = crypto.randomBytes(10).toString('base64url');
    const passwordHash = hashPassword(tempPassword);

    // Creer client
    const insertData = {
      avocat_societe_id: req.societeId, nom, prenom, email, telephone,
      password_hash: passwordHash, statut: 'invite'
    };
    if (civilite) insertData.civilite = civilite;
    if (adresse) insertData.adresse = adresse;
    const { data: client, error: cErr } = await admin().from('avocat_clients').insert(insertData).select().single();
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
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /coffre/clients — Liste des clients
router.get('/coffre/clients', requireAvocat, async (req, res) => {
  const { data, error } = await admin().from('avocat_clients')
    .select('id, nom, prenom, email, telephone, statut, last_login, created_at')
    .eq('avocat_societe_id', req.societeId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erreur interne' });
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

// POST /coffre/dossiers — Creer un dossier (avec ou sans client)
router.post('/coffre/dossiers', requireAvocat, async (req, res) => {
  try {
    const { titre, type, domaine, juridiction, section_cph, numero_rg,
      convention_collective, stade_procedural, employeur_nom, employeur_adresse,
      employeur_siret, avocat_adverse, date_audience, notes, client_id } = req.body || {};
    if (!titre) return res.status(400).json({ error: 'Titre requis' });

    // Si client_id fourni, verifier qu'il appartient a la societe
    if (client_id) {
      const { data: clientCheck } = await admin().from('avocat_clients')
        .select('id').eq('id', client_id).eq('avocat_societe_id', req.societeId).single();
      if (!clientCheck) return res.status(400).json({ error: 'Client non trouvé dans votre organisation' });
    }

    const ref = (client_id ? 'DOS' : 'GEN') + '-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-4);
    const insertData = {
      avocat_societe_id: req.societeId,
      client_id: client_id || null,
      reference: ref,
      titre,
      type: type || 'general'
    };
    if (domaine) insertData.domaine = domaine;
    if (juridiction) insertData.juridiction = juridiction;
    if (section_cph) insertData.section_cph = section_cph;
    if (numero_rg) insertData.numero_rg = numero_rg;
    if (convention_collective) insertData.convention_collective = convention_collective;
    if (stade_procedural) insertData.stade_procedural = stade_procedural;
    if (employeur_nom) insertData.employeur_nom = employeur_nom;
    if (employeur_adresse) insertData.employeur_adresse = employeur_adresse;
    if (employeur_siret) insertData.employeur_siret = employeur_siret;
    if (avocat_adverse) insertData.avocat_adverse = avocat_adverse;
    if (date_audience) insertData.date_audience = date_audience;
    if (notes) insertData.notes = notes;

    const { data: d, error } = await admin().from('avocat_dossiers').insert(insertData).select().single();
    if (error) return res.status(500).json({ error: error.message });
    await logAudit(req.userId, 'avocat', 'dossier_create', 'dossier', d.id, req, true, { titre });
    return res.status(201).json(d);
  } catch (err) { return res.status(500).json({ error: 'Erreur interne' }); }
});

// GET /coffre/dossiers/:id — Detail dossier + documents
router.get('/coffre/dossiers/:id', requireAvocat, async (req, res) => {
  const { data: dossier } = await admin().from('avocat_dossiers')
    .select('*, avocat_clients(nom, prenom, email)').eq('id', req.params.id).eq('avocat_societe_id', req.societeId).single();
  if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

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

    // SECURITE : verifier que le dossier appartient a cette societe
    const { data: dossierCheck } = await admin().from('avocat_dossiers')
      .select('id').eq('id', dossier_id).eq('avocat_societe_id', req.societeId).single();
    if (!dossierCheck) return res.status(403).json({ error: 'Dossier non autorisé' });

    // Chiffrer le fichier
    const { encrypted, iv, tag } = encryptBuffer(req.file.buffer);

    // Stocker
    const fileDir = path.join(COFFRE_DIR, req.societeId, dossier_id);
    if (!fileDir.startsWith(path.resolve(COFFRE_DIR))) return res.status(400).json({ error: 'Chemin invalide' });
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

    if (error) return res.status(500).json({ error: 'Erreur interne' });

    await logAudit(req.userId, 'avocat', 'document_upload', 'document', doc.id, req, true, { filename: req.file.originalname, size_kb: Math.round(req.file.size / 1024) });

    return res.status(201).json({ document: { id: doc.id, filename: doc.filename, file_size_kb: doc.file_size_kb }, message: 'Document chiffré et stocké.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /coffre/documents/:id/download — Telecharger dechiffre
router.get('/coffre/documents/:id/download', requireAvocat, async (req, res) => {
  try {
    const { data: doc } = await admin().from('avocat_coffre_documents')
      .select('*, avocat_dossiers!inner(avocat_societe_id)')
      .eq('id', req.params.id).single();
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
    if (doc.avocat_dossiers.avocat_societe_id !== req.societeId) return res.status(403).json({ error: 'Accès refusé' });

    const encrypted = fs.readFileSync(doc.storage_path);
    const decrypted = decryptBuffer(encrypted, doc.encryption_iv, doc.encryption_tag);

    await logAudit(req.userId, 'avocat', 'document_download', 'document', doc.id, req, true);

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    return res.send(decrypted);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// COMMENTAIRES
// ================================================

// POST /coffre/documents/:id/comment
router.post('/coffre/documents/:id/comment', requireAvocat, async (req, res) => {
  try {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'Contenu requis' });

  // SECURITE : verifier ownership via dossier
  const { data: docCheck } = await admin().from('avocat_coffre_documents')
    .select('id, avocat_dossiers!inner(avocat_societe_id)')
    .eq('id', req.params.id).single();
  if (!docCheck || docCheck.avocat_dossiers.avocat_societe_id !== req.societeId)
    return res.status(403).json({ error: 'Accès refusé' });

  const { data } = await admin().from('avocat_coffre_commentaires').insert({
    document_id: req.params.id, author_id: req.userId, author_role: 'avocat', content
  }).select().single();

  await logAudit(req.userId, 'avocat', 'comment_add', 'document', req.params.id, req, true);
  return res.status(201).json(data);
  } catch (err) { console.error('[coffre/comment]', err.message); return res.status(500).json({ error: 'Erreur interne' }); }
});

// PATCH /coffre/documents/:id/validate
router.patch('/coffre/documents/:id/validate', requireAvocat, async (req, res) => {
  try {
  const { statut } = req.body || {};
  if (!['valide', 'refuse', 'a_modifier'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  // SECURITE : verifier ownership via dossier
  const { data: docVal } = await admin().from('avocat_coffre_documents')
    .select('id, avocat_dossiers!inner(avocat_societe_id)')
    .eq('id', req.params.id).single();
  if (!docVal || docVal.avocat_dossiers.avocat_societe_id !== req.societeId)
    return res.status(403).json({ error: 'Accès refusé' });

  await admin().from('avocat_coffre_documents').update({ statut_validation: statut }).eq('id', req.params.id);
  await logAudit(req.userId, 'avocat', 'document_validate', 'document', req.params.id, req, true, { statut });
  return res.json({ success: true, statut });
  } catch (err) { console.error('[coffre/validate]', err.message); return res.status(500).json({ error: 'Erreur interne' }); }
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
