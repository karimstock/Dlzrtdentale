// =============================================
// JADOMI — Client Portal API
// Portail securise pour les clients d'avocats
// Login, dossiers, documents, messages
// =============================================

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { uploadToR2, getPresignedUrl } = require('../../services/r2-storage');

const router = express.Router();

// ===== Supabase Admin =====
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

// ===== Multer (memory storage, 20 MB max) =====
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ===== Password Hashing (crypto PBKDF2) =====
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verify;
}

// ===== JWT (crypto HMAC, no jsonwebtoken dep) =====
function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'jadomi-client-portal-secret')
    .update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || 'jadomi-client-portal-secret')
      .update(header + '.' + body).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ===== Auth Middleware =====
function requireClient(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorise' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Token invalide ou expire' });
  req.client = payload;
  next();
}

// =========================================================
// POST /register
// Body: { site_id, email, password, name, phone }
// =========================================================
router.post('/register', async (req, res) => {
  try {
    const { site_id, email, password, name, phone } = req.body;
    if (!site_id || !email || !password || !name) {
      return res.status(400).json({ error: 'Champs obligatoires: site_id, email, password, name' });
    }

    // Verifier si le client existe deja
    const { data: existing } = await admin()
      .from('client_accounts')
      .select('id')
      .eq('site_id', site_id)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Un compte avec cet email existe deja' });
    }

    // Creer le compte
    const hashed = hashPassword(password);
    const { data: client, error } = await admin()
      .from('client_accounts')
      .insert({
        site_id,
        email: email.toLowerCase().trim(),
        password_hash: hashed,
        name: name.trim(),
        phone: phone || null,
        created_at: new Date().toISOString()
      })
      .select('id, email, name, phone, created_at')
      .single();

    if (error) {
      console.error('[client-portal] register insert error:', error);
      return res.status(500).json({ error: 'Erreur lors de la creation du compte' });
    }

    const token = createToken({ id: client.id, site_id, email: client.email, name: client.name });

    res.json({ success: true, token, client });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /login
// Body: { site_id, email, password }
// =========================================================
router.post('/login', async (req, res) => {
  try {
    const { site_id, email, password } = req.body;
    if (!site_id || !email || !password) {
      return res.status(400).json({ error: 'Champs obligatoires: site_id, email, password' });
    }

    const { data: client, error } = await admin()
      .from('client_accounts')
      .select('id, email, name, phone, password_hash, created_at')
      .eq('site_id', site_id)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      console.error('[client-portal] login query error:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!client || !verifyPassword(password, client.password_hash)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = createToken({ id: client.id, site_id, email: client.email, name: client.name });

    // Ne pas renvoyer le hash
    const { password_hash, ...clientInfo } = client;

    res.json({ success: true, token, client: clientInfo });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /dossiers (auth)
// Liste des dossiers du client pour son site
// =========================================================
router.get('/dossiers', requireClient, async (req, res) => {
  try {
    const { id: client_id, site_id } = req.client;

    const { data: dossiers, error } = await admin()
      .from('client_dossiers')
      .select('id, reference, titre, statut, type, created_at, updated_at')
      .eq('site_id', site_id)
      .eq('client_id', client_id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[client-portal] dossiers list error:', error);
      return res.status(500).json({ error: 'Erreur lors de la recuperation des dossiers' });
    }

    res.json({ success: true, dossiers: dossiers || [] });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /dossiers/:id (auth)
// Detail d'un dossier avec documents et messages
// =========================================================
router.get('/dossiers/:id', requireClient, async (req, res) => {
  try {
    const { id: client_id, site_id } = req.client;
    const dossierId = req.params.id;

    // Recuperer le dossier
    const { data: dossier, error: dErr } = await admin()
      .from('client_dossiers')
      .select('*')
      .eq('id', dossierId)
      .eq('site_id', site_id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (dErr) {
      console.error('[client-portal] dossier detail error:', dErr);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }

    // Recuperer les documents
    const { data: documents } = await admin()
      .from('client_documents')
      .select('id, nom, type, taille, uploaded_by, created_at')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false });

    // Recuperer les messages
    const { data: messages } = await admin()
      .from('client_messages')
      .select('id, content, sender_type, sender_name, created_at')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true });

    res.json({
      success: true,
      dossier,
      documents: documents || [],
      messages: messages || []
    });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /dossiers/:id/documents (auth)
// Upload document vers R2
// =========================================================
router.post('/dossiers/:id/documents', requireClient, upload.single('file'), async (req, res) => {
  try {
    const { id: client_id, site_id, name: client_name } = req.client;
    const dossierId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Verifier que le dossier appartient au client
    const { data: dossier } = await admin()
      .from('client_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('site_id', site_id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }

    // Upload vers R2
    const ext = req.file.originalname.split('.').pop() || 'bin';
    const r2Result = await uploadToR2(req.file.buffer, {
      format: ext,
      contentType: req.file.mimetype,
      demandeId: `portal/${site_id}/${dossierId}`,
      compress: false,
      encrypt: true
    });

    // Enregistrer en base
    const { data: doc, error } = await admin()
      .from('client_documents')
      .insert({
        dossier_id: dossierId,
        site_id,
        nom: req.file.originalname,
        type: req.file.mimetype,
        taille: req.file.size,
        r2_key: r2Result.key,
        uploaded_by: 'client',
        uploaded_by_name: client_name,
        client_id,
        created_at: new Date().toISOString()
      })
      .select('id, nom, type, taille, uploaded_by, created_at')
      .single();

    if (error) {
      console.error('[client-portal] document insert error:', error);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement du document' });
    }

    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /documents/:id/download (auth)
// Presigned URL pour telecharger un document
// =========================================================
router.get('/documents/:id/download', requireClient, async (req, res) => {
  try {
    const { id: client_id, site_id } = req.client;
    const documentId = req.params.id;

    // Recuperer le document et verifier l'acces
    const { data: doc, error } = await admin()
      .from('client_documents')
      .select('id, nom, r2_key, dossier_id')
      .eq('id', documentId)
      .eq('site_id', site_id)
      .maybeSingle();

    if (error) {
      console.error('[client-portal] document download query error:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document non trouve' });
    }

    // Verifier que le dossier appartient au client
    const { data: dossier } = await admin()
      .from('client_dossiers')
      .select('id')
      .eq('id', doc.dossier_id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (!dossier) {
      return res.status(403).json({ error: 'Acces refuse' });
    }

    // Generer URL presignee (1h)
    const url = await getPresignedUrl(doc.r2_key, 3600);
    if (!url) {
      return res.status(500).json({ error: 'Impossible de generer le lien de telechargement' });
    }

    res.json({ success: true, url, nom: doc.nom });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /dossiers/:id/messages (auth)
// Envoyer un message { content }
// =========================================================
router.post('/dossiers/:id/messages', requireClient, async (req, res) => {
  try {
    const { id: client_id, site_id, name: client_name } = req.client;
    const dossierId = req.params.id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Le contenu du message est obligatoire' });
    }

    // Verifier que le dossier appartient au client
    const { data: dossier } = await admin()
      .from('client_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('site_id', site_id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }

    const { data: message, error } = await admin()
      .from('client_messages')
      .insert({
        dossier_id: dossierId,
        site_id,
        client_id,
        content: content.trim(),
        sender_type: 'client',
        sender_name: client_name,
        created_at: new Date().toISOString()
      })
      .select('id, content, sender_type, sender_name, created_at')
      .single();

    if (error) {
      console.error('[client-portal] message insert error:', error);
      return res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /dossiers/:id/messages (auth)
// Liste des messages d'un dossier
// =========================================================
router.get('/dossiers/:id/messages', requireClient, async (req, res) => {
  try {
    const { id: client_id, site_id } = req.client;
    const dossierId = req.params.id;

    // Verifier que le dossier appartient au client
    const { data: dossier } = await admin()
      .from('client_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('site_id', site_id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouve' });
    }

    const { data: messages, error } = await admin()
      .from('client_messages')
      .select('id, content, sender_type, sender_name, created_at')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[client-portal] messages list error:', error);
      return res.status(500).json({ error: 'Erreur lors de la recuperation des messages' });
    }

    res.json({ success: true, messages: messages || [] });
  } catch (err) {
    console.error('[client-portal]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
