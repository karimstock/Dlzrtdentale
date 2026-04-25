// =============================================
// JADOMI — Triangle Photo : Communication 3 parties
// Patient <-> Praticien <-> Labo (Prothesiste)
// WORLD FIRST : routage triangulaire photo
// Patient et Labo ne communiquent JAMAIS directement
// =============================================
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { admin, requirePatient, requireCabinet, requirePermission, requireLabo } = require('./shared');

const router = express.Router();

// ===== Multer : upload photo max 15 Mo =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/triangle'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `tri_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format photo non supporte. Formats acceptes : JPEG, PNG, WebP, HEIC'));
    }
  }
});

// ===== Helper : URL publique de la photo uploadee =====
function photoUrl(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/uploads/triangle/${filename}`;
}

// ===== Helper : creer notification (event) =====
async function createPhotoEvent(cabinetId, eventType, metadata) {
  try {
    await admin()
      .from('dentiste_pro_events')
      .insert({
        cabinet_id: cabinetId,
        event_type: eventType,
        event_category: 'general',
        source: 'system',
        metadata
      });
  } catch (e) {
    console.error('[triangle] event creation error:', e.message);
  }
}

// =========================================================
// PATIENT ENDPOINTS
// =========================================================

// ---------------------------------------------------------
// POST /triangle/patient/send-photo
// Patient envoie une photo d'urgence/suivi au praticien
// REGLE : recipient_type = 'praticien' (force, pas de choix)
// ---------------------------------------------------------
router.post('/patient/send-photo', requirePatient(), upload.single('photo'), async (req, res) => {
  try {
    const { description, photo_type, case_id } = req.body || {};

    if (!req.file) {
      return res.status(400).json({ error: 'Photo requise' });
    }

    const validTypes = ['urgence', 'suivi', 'question'];
    const type = validTypes.includes(photo_type) ? photo_type : 'question';

    const photoData = {
      case_id: case_id || null,
      cabinet_id: req.patient.cabinet_id,
      sender_type: 'patient',
      sender_id: req.patient.id,
      recipient_type: 'praticien', // FORCE : patient ne peut envoyer qu'au praticien
      photo_url: photoUrl(req, req.file.filename),
      photo_type: type,
      description: description ? description.trim().substring(0, 1000) : null,
      metadata: {
        original_name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    };

    const { data: photo, error } = await admin()
      .from('dentiste_pro_photos')
      .insert(photoData)
      .select('*')
      .single();

    if (error) throw error;

    // Notification pour le praticien
    await createPhotoEvent(req.patient.cabinet_id, 'triangle_photo_received', {
      photo_id: photo.id,
      from: 'patient',
      patient_id: req.patient.id,
      photo_type: type
    });

    return res.json({ ok: true, photo });

  } catch (err) {
    console.error('[triangle/patient/send-photo]', err);
    return res.status(500).json({ error: 'Erreur envoi photo' });
  }
});

// ---------------------------------------------------------
// GET /triangle/patient/my-photos
// Patient voit les photos que le praticien lui a partagees
// ---------------------------------------------------------
router.get('/patient/my-photos', requirePatient(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // Photos envoyees par le praticien au patient
    const { data: received, error: errR } = await admin()
      .from('dentiste_pro_photos')
      .select('*')
      .eq('cabinet_id', req.patient.cabinet_id)
      .eq('recipient_type', 'patient')
      .eq('sender_type', 'praticien')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (errR) throw errR;

    // Photos envoyees par le patient
    const { data: sent, error: errS } = await admin()
      .from('dentiste_pro_photos')
      .select('*')
      .eq('cabinet_id', req.patient.cabinet_id)
      .eq('sender_type', 'patient')
      .eq('sender_id', req.patient.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (errS) throw errS;

    return res.json({
      ok: true,
      received: received || [],
      sent: sent || [],
      page,
      limit
    });

  } catch (err) {
    console.error('[triangle/patient/my-photos]', err);
    return res.status(500).json({ error: 'Erreur chargement photos' });
  }
});

// =========================================================
// PRATICIEN ENDPOINTS
// =========================================================

// ---------------------------------------------------------
// POST /triangle/praticien/send-to-labo
// Praticien envoie photo de teinte/clinique au labo
// ---------------------------------------------------------
router.post('/praticien/send-to-labo', requireCabinet(), requirePermission('triangle'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });
    if (!req.file) return res.status(400).json({ error: 'Photo requise' });

    const { case_id, photo_type, description } = req.body || {};
    if (!case_id) return res.status(400).json({ error: 'case_id requis' });

    const validTypes = ['teinte', 'clinique', 'empreinte', 'instruction'];
    const type = validTypes.includes(photo_type) ? photo_type : 'clinique';

    // Verifier que le cas existe et appartient au cabinet
    const { data: cas, error: casErr } = await admin()
      .from('dentiste_pro_cases')
      .select('id, labo_id')
      .eq('id', case_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (casErr) throw casErr;
    if (!cas) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!cas.labo_id) return res.status(400).json({ error: 'Aucun labo assigne a ce dossier' });

    const photoData = {
      case_id,
      cabinet_id: req.cabinet.id,
      sender_type: 'praticien',
      sender_id: req.user.id,
      recipient_type: 'labo',
      photo_url: photoUrl(req, req.file.filename),
      photo_type: type,
      description: description ? description.trim().substring(0, 1000) : null,
      metadata: {
        original_name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    };

    const { data: photo, error } = await admin()
      .from('dentiste_pro_photos')
      .insert(photoData)
      .select('*')
      .single();

    if (error) throw error;

    await createPhotoEvent(req.cabinet.id, 'triangle_photo_to_labo', {
      photo_id: photo.id,
      case_id,
      labo_id: cas.labo_id,
      photo_type: type
    });

    return res.json({ ok: true, photo });

  } catch (err) {
    console.error('[triangle/praticien/send-to-labo]', err);
    return res.status(500).json({ error: 'Erreur envoi photo au labo' });
  }
});

// ---------------------------------------------------------
// POST /triangle/praticien/send-to-patient
// Praticien envoie photo avant/apres au patient
// ---------------------------------------------------------
router.post('/praticien/send-to-patient', requireCabinet(), requirePermission('triangle'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });
    if (!req.file) return res.status(400).json({ error: 'Photo requise' });

    const { patient_id, case_id, photo_type, description } = req.body || {};
    if (!patient_id) return res.status(400).json({ error: 'patient_id requis' });

    const validTypes = ['avant_apres', 'resultat', 'explication'];
    const type = validTypes.includes(photo_type) ? photo_type : 'resultat';

    // Verifier que le patient appartient au cabinet
    const { data: patient, error: patErr } = await admin()
      .from('dentiste_pro_patients')
      .select('id')
      .eq('id', patient_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (patErr) throw patErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    const photoData = {
      case_id: case_id || null,
      cabinet_id: req.cabinet.id,
      sender_type: 'praticien',
      sender_id: req.user.id,
      recipient_type: 'patient',
      photo_url: photoUrl(req, req.file.filename),
      photo_type: type,
      description: description ? description.trim().substring(0, 1000) : null,
      metadata: {
        original_name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        patient_id
      }
    };

    const { data: photo, error } = await admin()
      .from('dentiste_pro_photos')
      .insert(photoData)
      .select('*')
      .single();

    if (error) throw error;

    await createPhotoEvent(req.cabinet.id, 'triangle_photo_to_patient', {
      photo_id: photo.id,
      patient_id,
      photo_type: type
    });

    return res.json({ ok: true, photo });

  } catch (err) {
    console.error('[triangle/praticien/send-to-patient]', err);
    return res.status(500).json({ error: 'Erreur envoi photo au patient' });
  }
});

// ---------------------------------------------------------
// POST /triangle/praticien/forward-to-labo
// Praticien forwarde une photo patient vers le labo
// (sans que le patient sache)
// ---------------------------------------------------------
router.post('/praticien/forward-to-labo', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { photo_id, case_id, note } = req.body || {};
    if (!photo_id) return res.status(400).json({ error: 'photo_id requis' });
    if (!case_id) return res.status(400).json({ error: 'case_id requis' });

    // Recuperer la photo originale
    const { data: original, error: origErr } = await admin()
      .from('dentiste_pro_photos')
      .select('*')
      .eq('id', photo_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (origErr) throw origErr;
    if (!original) return res.status(404).json({ error: 'Photo originale introuvable' });

    // Verifier que le cas a un labo assigne
    const { data: cas, error: casErr } = await admin()
      .from('dentiste_pro_cases')
      .select('id, labo_id')
      .eq('id', case_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (casErr) throw casErr;
    if (!cas) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!cas.labo_id) return res.status(400).json({ error: 'Aucun labo assigne a ce dossier' });

    // Creer une copie avec sender=praticien, recipient=labo
    const forwardData = {
      case_id,
      cabinet_id: req.cabinet.id,
      sender_type: 'praticien',
      sender_id: req.user.id,
      recipient_type: 'labo',
      photo_url: original.photo_url,
      thumbnail_url: original.thumbnail_url,
      photo_type: original.photo_type,
      description: note ? note.trim().substring(0, 1000) : original.description,
      metadata: {
        ...original.metadata,
        forwarded_from: original.id,
        forwarded_original_sender: original.sender_type,
        forwarded_at: new Date().toISOString()
      }
    };

    const { data: forwarded, error } = await admin()
      .from('dentiste_pro_photos')
      .insert(forwardData)
      .select('*')
      .single();

    if (error) throw error;

    await createPhotoEvent(req.cabinet.id, 'triangle_photo_forwarded', {
      photo_id: forwarded.id,
      original_photo_id: original.id,
      case_id,
      labo_id: cas.labo_id
    });

    return res.json({ ok: true, photo: forwarded });

  } catch (err) {
    console.error('[triangle/praticien/forward-to-labo]', err);
    return res.status(500).json({ error: 'Erreur transfert photo au labo' });
  }
});

// ---------------------------------------------------------
// GET /triangle/praticien/inbox
// Toutes les photos recues (patients + labos)
// ---------------------------------------------------------
router.get('/praticien/inbox', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const filterType = req.query.sender_type; // 'patient' ou 'labo'
    const unreadOnly = req.query.unread === 'true';

    let query = admin()
      .from('dentiste_pro_photos')
      .select('*', { count: 'exact' })
      .eq('cabinet_id', req.cabinet.id)
      .eq('recipient_type', 'praticien')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filterType && ['patient', 'labo'].includes(filterType)) {
      query = query.eq('sender_type', filterType);
    }
    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data: photos, error, count } = await query;
    if (error) throw error;

    // Enrichir avec les noms des patients
    const patientIds = [...new Set((photos || [])
      .filter(p => p.sender_type === 'patient' && p.sender_id)
      .map(p => p.sender_id))];

    let patientsMap = {};
    if (patientIds.length > 0) {
      const { data: patients } = await admin()
        .from('dentiste_pro_patients')
        .select('id, nom, prenom')
        .in('id', patientIds);
      if (patients) {
        for (const p of patients) {
          patientsMap[p.id] = `${p.prenom || ''} ${p.nom || ''}`.trim();
        }
      }
    }

    const enriched = (photos || []).map(p => ({
      ...p,
      sender_name: p.sender_type === 'patient'
        ? (patientsMap[p.sender_id] || 'Patient')
        : p.sender_type === 'labo'
        ? 'Laboratoire'
        : 'Praticien'
    }));

    return res.json({
      ok: true,
      photos: enriched,
      pagination: {
        page, limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[triangle/praticien/inbox]', err);
    return res.status(500).json({ error: 'Erreur chargement inbox' });
  }
});

// ---------------------------------------------------------
// GET /triangle/praticien/case/:caseId/photos
// Toutes les photos d'un dossier (toutes directions)
// ---------------------------------------------------------
router.get('/praticien/case/:caseId/photos', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { caseId } = req.params;

    // Verifier que le cas appartient au cabinet
    const { data: cas, error: casErr } = await admin()
      .from('dentiste_pro_cases')
      .select('*')
      .eq('id', caseId)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (casErr) throw casErr;
    if (!cas) return res.status(404).json({ error: 'Dossier introuvable' });

    const { data: photos, error } = await admin()
      .from('dentiste_pro_photos')
      .select('*')
      .eq('case_id', caseId)
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      ok: true,
      case: cas,
      photos: photos || []
    });

  } catch (err) {
    console.error('[triangle/praticien/case/photos]', err);
    return res.status(500).json({ error: 'Erreur chargement photos du dossier' });
  }
});

// =========================================================
// LABO ENDPOINTS
// =========================================================

// ---------------------------------------------------------
// POST /triangle/labo/auth/request-otp
// Labo demande un OTP par email
// ---------------------------------------------------------
router.post('/labo/auth/request-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const normalizedEmail = email.trim().toLowerCase();

    // Trouver le labo par auth_email
    const { data: labo, error } = await admin()
      .from('dentiste_pro_labos')
      .select('id, cabinet_id, nom, auth_email')
      .eq('auth_email', normalizedEmail)
      .eq('actif', true)
      .maybeSingle();

    if (error) throw error;

    // Toujours repondre OK pour ne pas reveler si le labo existe
    if (!labo) {
      return res.json({ ok: true, message: 'Si ce compte existe, un code vous sera envoye.' });
    }

    // Generer OTP 6 chiffres
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    await admin()
      .from('dentiste_pro_labos')
      .update({
        otp_code: otp,
        otp_expires_at: expiresAt,
        otp_attempts: 0
      })
      .eq('id', labo.id);

    // TODO: envoyer email avec OTP via emailService
    console.log(`[triangle/labo-auth] OTP for ${normalizedEmail}: ${otp} (DEV ONLY)`);

    return res.json({ ok: true, message: 'Si ce compte existe, un code vous sera envoye.' });

  } catch (err) {
    console.error('[triangle/labo/auth/request-otp]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------
// POST /triangle/labo/auth/verify-otp
// Labo verifie OTP et recoit un JWT
// ---------------------------------------------------------
router.post('/labo/auth/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

    const normalizedEmail = email.trim().toLowerCase();

    const { data: labo, error } = await admin()
      .from('dentiste_pro_labos')
      .select('id, cabinet_id, nom, otp_code, otp_expires_at, otp_attempts')
      .eq('auth_email', normalizedEmail)
      .eq('actif', true)
      .maybeSingle();

    if (error) throw error;
    if (!labo) return res.status(401).json({ error: 'Code invalide' });

    // Verifier tentatives
    if ((labo.otp_attempts || 0) >= 5) {
      return res.status(429).json({ error: 'Trop de tentatives. Veuillez redemander un code.' });
    }

    // Incrementer tentatives
    await admin()
      .from('dentiste_pro_labos')
      .update({ otp_attempts: (labo.otp_attempts || 0) + 1 })
      .eq('id', labo.id);

    // Verifier OTP
    if (!labo.otp_code || labo.otp_code !== code.trim()) {
      return res.status(401).json({ error: 'Code invalide' });
    }

    // Verifier expiration
    if (new Date(labo.otp_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Code expire. Veuillez redemander un code.' });
    }

    // Creer JWT labo
    const JWT_SECRET = process.env.JWT_SECRET || 'jadomi-dentiste-pro-secret';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      labo_id: labo.id,
      cabinet_id: labo.cabinet_id,
      type: 'labo',
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 jours
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET)
      .update(header + '.' + body).digest('base64url');
    const token = header + '.' + body + '.' + sig;

    // Nettoyer OTP + MAJ derniere connexion
    await admin()
      .from('dentiste_pro_labos')
      .update({
        otp_code: null,
        otp_expires_at: null,
        otp_attempts: 0,
        derniere_connexion: new Date().toISOString()
      })
      .eq('id', labo.id);

    return res.json({
      ok: true,
      token,
      labo: { id: labo.id, nom: labo.nom, cabinet_id: labo.cabinet_id }
    });

  } catch (err) {
    console.error('[triangle/labo/auth/verify-otp]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------
// POST /triangle/labo/send-photo
// Labo envoie photo de fabrication au praticien
// REGLE : recipient_type = 'praticien' (force)
// ---------------------------------------------------------
router.post('/labo/send-photo', requireLabo(), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Photo requise' });

    const { case_id, photo_type, description } = req.body || {};
    if (!case_id) return res.status(400).json({ error: 'case_id requis' });

    const validTypes = ['fabrication', 'essayage', 'produit_fini', 'question'];
    const type = validTypes.includes(photo_type) ? photo_type : 'fabrication';

    // Verifier que le cas est assigne a ce labo
    const { data: cas, error: casErr } = await admin()
      .from('dentiste_pro_cases')
      .select('id, cabinet_id')
      .eq('id', case_id)
      .eq('labo_id', req.labo.labo_id)
      .eq('cabinet_id', req.labo.cabinet_id)
      .maybeSingle();

    if (casErr) throw casErr;
    if (!cas) return res.status(404).json({ error: 'Dossier introuvable ou non assigne a votre laboratoire' });

    const photoData = {
      case_id,
      cabinet_id: req.labo.cabinet_id,
      sender_type: 'labo',
      sender_id: req.labo.labo_id,
      recipient_type: 'praticien', // FORCE : labo ne peut envoyer qu'au praticien
      photo_url: photoUrl(req, req.file.filename),
      photo_type: type,
      description: description ? description.trim().substring(0, 1000) : null,
      metadata: {
        original_name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    };

    const { data: photo, error } = await admin()
      .from('dentiste_pro_photos')
      .insert(photoData)
      .select('*')
      .single();

    if (error) throw error;

    await createPhotoEvent(req.labo.cabinet_id, 'triangle_photo_from_labo', {
      photo_id: photo.id,
      case_id,
      labo_id: req.labo.labo_id,
      photo_type: type
    });

    return res.json({ ok: true, photo });

  } catch (err) {
    console.error('[triangle/labo/send-photo]', err);
    return res.status(500).json({ error: 'Erreur envoi photo' });
  }
});

// ---------------------------------------------------------
// GET /triangle/labo/my-cases
// Labo voit les dossiers qui lui sont assignes
// ---------------------------------------------------------
router.get('/labo/my-cases', requireLabo(), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const statut = req.query.statut;

    let query = admin()
      .from('dentiste_pro_cases')
      .select('*', { count: 'exact' })
      .eq('labo_id', req.labo.labo_id)
      .eq('cabinet_id', req.labo.cabinet_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statut) {
      query = query.eq('statut', statut);
    }

    const { data: cases, error, count } = await query;
    if (error) throw error;

    return res.json({
      ok: true,
      cases: cases || [],
      pagination: {
        page, limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[triangle/labo/my-cases]', err);
    return res.status(500).json({ error: 'Erreur chargement dossiers' });
  }
});

// ---------------------------------------------------------
// GET /triangle/labo/case/:caseId/photos
// Labo voit les photos d'un dossier (seulement celles
// ou il est sender ou recipient)
// ---------------------------------------------------------
router.get('/labo/case/:caseId/photos', requireLabo(), async (req, res) => {
  try {
    const { caseId } = req.params;

    // Verifier que le cas est assigne a ce labo
    const { data: cas, error: casErr } = await admin()
      .from('dentiste_pro_cases')
      .select('*')
      .eq('id', caseId)
      .eq('labo_id', req.labo.labo_id)
      .eq('cabinet_id', req.labo.cabinet_id)
      .maybeSingle();

    if (casErr) throw casErr;
    if (!cas) return res.status(404).json({ error: 'Dossier introuvable' });

    // Le labo ne voit que les photos qui le concernent :
    // - Photos envoyees par le labo (sender_type=labo)
    // - Photos envoyees au labo (recipient_type=labo)
    const { data: photos, error } = await admin()
      .from('dentiste_pro_photos')
      .select('*')
      .eq('case_id', caseId)
      .eq('cabinet_id', req.labo.cabinet_id)
      .or('sender_type.eq.labo,recipient_type.eq.labo')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      ok: true,
      case: cas,
      photos: photos || []
    });

  } catch (err) {
    console.error('[triangle/labo/case/photos]', err);
    return res.status(500).json({ error: 'Erreur chargement photos' });
  }
});

// =========================================================
// CASE MANAGEMENT (PRATICIEN)
// =========================================================

// ---------------------------------------------------------
// POST /triangle/cases
// Creer un nouveau dossier (lier patient + labo)
// ---------------------------------------------------------
router.post('/cases', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { patient_id, labo_id, titre, type, dent_numero, teinte, instructions,
            date_empreinte, date_livraison_prevue } = req.body || {};

    if (!titre) return res.status(400).json({ error: 'Titre requis' });

    // Verifier patient si fourni
    if (patient_id) {
      const { data: patient } = await admin()
        .from('dentiste_pro_patients')
        .select('id')
        .eq('id', patient_id)
        .eq('cabinet_id', req.cabinet.id)
        .maybeSingle();
      if (!patient) return res.status(404).json({ error: 'Patient introuvable' });
    }

    // Verifier labo si fourni
    if (labo_id) {
      const { data: labo } = await admin()
        .from('dentiste_pro_labos')
        .select('id')
        .eq('id', labo_id)
        .eq('cabinet_id', req.cabinet.id)
        .eq('actif', true)
        .maybeSingle();
      if (!labo) return res.status(404).json({ error: 'Laboratoire introuvable' });
    }

    const caseData = {
      cabinet_id: req.cabinet.id,
      patient_id: patient_id || null,
      labo_id: labo_id || null,
      titre: titre.trim().substring(0, 200),
      type: type || null,
      dent_numero: dent_numero || null,
      teinte: teinte || null,
      instructions: instructions ? instructions.trim() : null,
      date_empreinte: date_empreinte || null,
      date_livraison_prevue: date_livraison_prevue || null
      // reference sera generee par le trigger SQL
    };

    const { data: newCase, error } = await admin()
      .from('dentiste_pro_cases')
      .insert(caseData)
      .select('*')
      .single();

    if (error) throw error;

    await createPhotoEvent(req.cabinet.id, 'triangle_case_created', {
      case_id: newCase.id,
      reference: newCase.reference,
      type: newCase.type
    });

    return res.json({ ok: true, case: newCase });

  } catch (err) {
    console.error('[triangle/cases/create]', err);
    return res.status(500).json({ error: 'Erreur creation dossier' });
  }
});

// ---------------------------------------------------------
// GET /triangle/cases
// Liste tous les dossiers du cabinet
// ---------------------------------------------------------
router.get('/cases', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const statut = req.query.statut;
    const search = req.query.search;

    let query = admin()
      .from('dentiste_pro_cases')
      .select('*', { count: 'exact' })
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statut) {
      query = query.eq('statut', statut);
    }
    if (search) {
      query = query.or(`titre.ilike.%${search}%,reference.ilike.%${search}%`);
    }

    const { data: cases, error, count } = await query;
    if (error) throw error;

    // Enrichir avec noms patient et labo
    const patientIds = [...new Set((cases || []).filter(c => c.patient_id).map(c => c.patient_id))];
    const laboIds = [...new Set((cases || []).filter(c => c.labo_id).map(c => c.labo_id))];

    let patientsMap = {};
    let labosMap = {};

    if (patientIds.length > 0) {
      const { data: patients } = await admin()
        .from('dentiste_pro_patients')
        .select('id, nom, prenom')
        .in('id', patientIds);
      if (patients) {
        for (const p of patients) {
          patientsMap[p.id] = `${p.prenom || ''} ${p.nom || ''}`.trim();
        }
      }
    }

    if (laboIds.length > 0) {
      const { data: labos } = await admin()
        .from('dentiste_pro_labos')
        .select('id, nom')
        .in('id', laboIds);
      if (labos) {
        for (const l of labos) {
          labosMap[l.id] = l.nom;
        }
      }
    }

    const enriched = (cases || []).map(c => ({
      ...c,
      patient_nom: c.patient_id ? (patientsMap[c.patient_id] || 'Patient') : null,
      labo_nom: c.labo_id ? (labosMap[c.labo_id] || 'Laboratoire') : null
    }));

    return res.json({
      ok: true,
      cases: enriched,
      pagination: {
        page, limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[triangle/cases/list]', err);
    return res.status(500).json({ error: 'Erreur chargement dossiers' });
  }
});

// ---------------------------------------------------------
// GET /triangle/cases/:id
// Detail d'un dossier avec toutes les photos
// ---------------------------------------------------------
router.get('/cases/:id', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { id } = req.params;

    const { data: cas, error: casErr } = await admin()
      .from('dentiste_pro_cases')
      .select('*')
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (casErr) throw casErr;
    if (!cas) return res.status(404).json({ error: 'Dossier introuvable' });

    // Charger photos
    const { data: photos, error: photosErr } = await admin()
      .from('dentiste_pro_photos')
      .select('*')
      .eq('case_id', id)
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: true });

    if (photosErr) throw photosErr;

    // Charger infos patient et labo
    let patient = null;
    let labo = null;

    if (cas.patient_id) {
      const { data: p } = await admin()
        .from('dentiste_pro_patients')
        .select('id, nom, prenom, telephone, email')
        .eq('id', cas.patient_id)
        .maybeSingle();
      patient = p;
    }

    if (cas.labo_id) {
      const { data: l } = await admin()
        .from('dentiste_pro_labos')
        .select('id, nom, email, telephone, ville, specialites')
        .eq('id', cas.labo_id)
        .maybeSingle();
      labo = l;
    }

    // Stats photos par direction
    const stats = {
      total: (photos || []).length,
      from_patient: (photos || []).filter(p => p.sender_type === 'patient').length,
      from_praticien: (photos || []).filter(p => p.sender_type === 'praticien').length,
      from_labo: (photos || []).filter(p => p.sender_type === 'labo').length,
      unread: (photos || []).filter(p => !p.read_at && p.recipient_type === 'praticien').length
    };

    return res.json({
      ok: true,
      case: cas,
      patient,
      labo,
      photos: photos || [],
      stats
    });

  } catch (err) {
    console.error('[triangle/cases/detail]', err);
    return res.status(500).json({ error: 'Erreur chargement dossier' });
  }
});

// ---------------------------------------------------------
// PUT /triangle/cases/:id
// Mettre a jour un dossier (statut, teinte, instructions...)
// ---------------------------------------------------------
router.put('/cases/:id', requireCabinet(), requirePermission('triangle'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { id } = req.params;
    const { statut, teinte, instructions, titre, type, dent_numero,
            date_empreinte, date_livraison_prevue, date_livraison_reelle,
            labo_id, patient_id } = req.body || {};

    // Verifier que le dossier existe
    const { data: existing, error: exErr } = await admin()
      .from('dentiste_pro_cases')
      .select('id')
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: 'Dossier introuvable' });

    // Construire les champs a mettre a jour
    const updates = { updated_at: new Date().toISOString() };

    if (statut !== undefined) updates.statut = statut;
    if (teinte !== undefined) updates.teinte = teinte;
    if (instructions !== undefined) updates.instructions = instructions;
    if (titre !== undefined) updates.titre = titre;
    if (type !== undefined) updates.type = type;
    if (dent_numero !== undefined) updates.dent_numero = dent_numero;
    if (date_empreinte !== undefined) updates.date_empreinte = date_empreinte;
    if (date_livraison_prevue !== undefined) updates.date_livraison_prevue = date_livraison_prevue;
    if (date_livraison_reelle !== undefined) updates.date_livraison_reelle = date_livraison_reelle;
    if (labo_id !== undefined) updates.labo_id = labo_id;
    if (patient_id !== undefined) updates.patient_id = patient_id;

    const { data: updated, error } = await admin()
      .from('dentiste_pro_cases')
      .update(updates)
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({ ok: true, case: updated });

  } catch (err) {
    console.error('[triangle/cases/update]', err);
    return res.status(500).json({ error: 'Erreur mise a jour dossier' });
  }
});

// =========================================================
// SHARED: Mark photo as read
// =========================================================
router.put('/photos/:photoId/read', async (req, res) => {
  try {
    // Identify auth (patient, praticien, or labo via token)
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorise' });
    }

    const { photoId } = req.params;

    const { data, error } = await admin()
      .from('dentiste_pro_photos')
      .update({ read_at: new Date().toISOString() })
      .eq('id', photoId)
      .select('id, read_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Photo introuvable' });

    return res.json({ ok: true, photo: data });

  } catch (err) {
    console.error('[triangle/photos/read]', err);
    return res.status(500).json({ error: 'Erreur mise a jour' });
  }
});

module.exports = router;
