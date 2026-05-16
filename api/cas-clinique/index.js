// =============================================
// JADOMI — Cas Clinique : dossier visuel par patient
// Dentiste, prothesiste et patient voient photos/videos/documents
// Auth Supabase + rate limiting + multer disk storage
// =============================================
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

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

// ===== Auth middleware (Supabase JWT) =====
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

// ===== Rate limiter (in-memory, 60 req/min/user) =====
const _rateBuckets = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

function rateLimit() {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip || 'unknown';
    const now = Date.now();
    let bucket = _rateBuckets.get(userId);
    if (!bucket || now - bucket.start > RATE_WINDOW) {
      bucket = { start: now, count: 0 };
      _rateBuckets.set(userId, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_LIMIT) {
      return res.status(429).json({ error: 'Trop de requêtes, veuillez patienter.' });
    }
    next();
  };
}
// Nettoyage periodique des buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of _rateBuckets) {
    if (now - bucket.start > RATE_WINDOW * 2) _rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

// ===== Rate limiter pour endpoints publics =====
const _publicRateMap = new Map();
function publicRateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    if (!_publicRateMap.has(ip)) _publicRateMap.set(ip, []);
    const hits = _publicRateMap.get(ip).filter(t => now - t < 60000);
    if (hits.length >= maxPerMin) {
      return res.status(429).json({ error: 'Trop de requêtes, veuillez patienter.' });
    }
    hits.push(now);
    _publicRateMap.set(ip, hits);
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of _publicRateMap.entries()) {
    const valid = hits.filter(t => now - t < 60000);
    if (valid.length === 0) _publicRateMap.delete(key);
    else _publicRateMap.set(key, valid);
  }
}, 5 * 60 * 1000);

// ===== Multer config (25MB, photos/videos/documents, disk storage) =====
const UPLOAD_BASE = path.join(__dirname, '../../uploads/cas-clinique');
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const casId = req.params.id || 'tmp';
      const dir = path.join(UPLOAD_BASE, casId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const prefix = (req.body.type || 'media').replace(/[^a-z_]/g, '');
      cb(null, prefix + '_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm',
      'application/pdf'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|webp|heic|mp4|mov|webm|pdf)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. JPEG, PNG, WebP, HEIC, MP4, MOV, WebM ou PDF uniquement.'));
    }
  }
});

// ===== Validation constantes =====
const CAS_TYPES = ['couronne', 'bridge', 'implant', 'facettes', 'blanchiment', 'orthodontie', 'extraction', 'endodontie', 'parodontie', 'autre'];
const CAS_STATUTS = ['en_cours', 'en_attente_labo', 'essayage', 'termine', 'annule'];
const MEDIA_TYPES = ['photo_initiale', 'photo_preparation', 'photo_essayage', 'photo_finale', 'radio_avant', 'radio_apres', 'video', 'shade', 'empreinte', 'produit_fini', 'autre'];
const NOTE_ROLES = ['dentiste', 'prothesiste', 'assistant'];

// =============================================
// 1. POST /create — Creer un nouveau cas clinique
// =============================================
router.post('/create', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { patient_id, titre, type, dents, notes } = req.body;
    const userId = req.user.id;
    const societeId = req.societe?.id || req.headers['x-societe-id'];

    // Validations
    if (!patient_id) return res.status(400).json({ error: 'patient_id requis' });
    if (!titre || typeof titre !== 'string' || titre.trim().length === 0) {
      return res.status(400).json({ error: 'titre requis' });
    }
    if (!type || !CAS_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type invalide. Valeurs : ' + CAS_TYPES.join(', ') });
    }
    if (!societeId) return res.status(400).json({ error: 'societe_id manquant' });

    // Valider les numeros de dents (1-48 en notation FDI)
    let dentArray = [];
    if (dents && Array.isArray(dents)) {
      dentArray = dents.filter(d => Number.isInteger(d) && d >= 11 && d <= 48);
    }

    // Verifier que le patient existe
    const { data: patient, error: pErr } = await admin()
      .from('patients_jadomi')
      .select('id, nom, prenom')
      .eq('id', patient_id)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    // Creer le cas
    const { data, error } = await admin()
      .from('cas_cliniques')
      .insert({
        societe_id: societeId,
        patient_id,
        created_by: userId,
        titre: titre.trim(),
        type,
        dents: dentArray,
        notes: notes || null,
        statut: 'en_cours'
      })
      .select('id')
      .single();

    if (error) throw error;

    console.log('[cas-clinique] Cas créé:', data.id, '— patient:', patient_id, '— type:', type);
    res.status(201).json({ ok: true, cas_id: data.id });
  } catch (e) {
    console.error('[cas-clinique] POST /create error:', e.message);
    res.status(500).json({ error: 'Erreur création cas clinique' });
  }
});

// =============================================
// 2. GET /list — Liste des cas du cabinet
// =============================================
router.get('/list', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const societeId = req.societe?.id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id manquant' });

    const { patient_id, type, statut, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 200);
    const offset = parseInt(rawOffset) || 0;

    // Construire la requete
    let query = admin()
      .from('cas_cliniques')
      .select('id, patient_id, titre, type, dents, statut, notes, labo_id, created_at, updated_at, patients_jadomi:patient_id(nom, prenom)')
      .eq('societe_id', societeId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (patient_id) query = query.eq('patient_id', patient_id);
    if (type && CAS_TYPES.includes(type)) query = query.eq('type', type);
    if (statut && CAS_STATUTS.includes(statut)) query = query.eq('statut', statut);

    const { data: cas, error } = await query;
    if (error) throw error;

    // Compter les medias par cas
    const casIds = (cas || []).map(c => c.id);
    let mediaCounts = {};
    if (casIds.length > 0) {
      const { data: counts } = await admin()
        .from('cas_clinique_medias')
        .select('cas_id')
        .in('cas_id', casIds);

      if (counts) {
        for (const m of counts) {
          mediaCounts[m.cas_id] = (mediaCounts[m.cas_id] || 0) + 1;
        }
      }
    }

    const result = (cas || []).map(c => ({
      id: c.id,
      patient_id: c.patient_id,
      patient_nom: c.patients_jadomi ? (c.patients_jadomi.prenom + ' ' + c.patients_jadomi.nom).trim() : '',
      titre: c.titre,
      type: c.type,
      dents: c.dents,
      statut: c.statut,
      notes: c.notes,
      labo_id: c.labo_id,
      nb_medias: mediaCounts[c.id] || 0,
      created_at: c.created_at,
      updated_at: c.updated_at
    }));

    console.log('[cas-clinique] list —', result.length, 'cas');
    res.json({ ok: true, cas: result, total: result.length });
  } catch (e) {
    console.error('[cas-clinique] GET /list error:', e.message);
    res.status(500).json({ error: 'Erreur récupération cas cliniques' });
  }
});

// =============================================
// 3. GET /:id — Detail complet d'un cas
// =============================================
router.get('/:id', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const casId = req.params.id;
    const societeId = req.societe?.id || req.headers['x-societe-id'];
    if (!societeId) return res.status(400).json({ error: 'societe_id manquant' });

    // Charger le cas
    const { data: cas, error } = await admin()
      .from('cas_cliniques')
      .select('*, patients_jadomi:patient_id(id, nom, prenom, date_naissance, telephone, email)')
      .eq('id', casId)
      .eq('societe_id', societeId)
      .maybeSingle();

    if (error) throw error;
    if (!cas) return res.status(404).json({ error: 'Cas clinique introuvable' });

    // Charger les medias
    const { data: medias } = await admin()
      .from('cas_clinique_medias')
      .select('id, type, file_url, mimetype, file_size, note, uploaded_by, created_at')
      .eq('cas_id', casId)
      .order('created_at', { ascending: true });

    // Charger les notes
    const { data: notes } = await admin()
      .from('cas_clinique_notes')
      .select('id, auteur, auteur_role, texte, etape, created_at')
      .eq('cas_id', casId)
      .order('created_at', { ascending: true });

    // Charger les snap_photos liees au patient (meme societe)
    const { data: snapPhotos } = await admin()
      .from('snap_photos')
      .select('id, seance_number, passeport_type, photo_url, taken_at')
      .eq('patient_id', cas.patient_id)
      .eq('societe_id', societeId)
      .order('taken_at', { ascending: true });

    // Construire la timeline
    const timeline = [];

    // Evenement creation
    timeline.push({
      type: 'creation',
      date: cas.created_at,
      description: 'Cas clinique créé'
    });

    // Medias dans la timeline
    for (const m of (medias || [])) {
      timeline.push({
        type: 'media',
        date: m.created_at,
        media_type: m.type,
        media_id: m.id,
        description: 'Média ajouté : ' + m.type.replace(/_/g, ' ')
      });
    }

    // Notes dans la timeline
    for (const n of (notes || [])) {
      timeline.push({
        type: 'note',
        date: n.created_at,
        auteur_role: n.auteur_role,
        etape: n.etape,
        description: n.texte.substring(0, 100) + (n.texte.length > 100 ? '...' : '')
      });
    }

    // Trier la timeline par date
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log('[cas-clinique] detail —', casId, '—', (medias || []).length, 'médias,', (notes || []).length, 'notes');
    res.json({
      ok: true,
      cas: {
        id: cas.id,
        titre: cas.titre,
        type: cas.type,
        dents: cas.dents,
        statut: cas.statut,
        notes: cas.notes,
        labo_id: cas.labo_id,
        metadata: cas.metadata,
        created_at: cas.created_at,
        updated_at: cas.updated_at
      },
      patient: cas.patients_jadomi || null,
      medias: medias || [],
      notes_cliniques: notes || [],
      snap_photos: snapPhotos || [],
      timeline
    });
  } catch (e) {
    console.error('[cas-clinique] GET /:id error:', e.message);
    res.status(500).json({ error: 'Erreur récupération cas clinique' });
  }
});

// =============================================
// 4. POST /:id/add-media — Ajouter photo/video au cas
// =============================================
router.post('/:id/add-media', requireAuth(), rateLimit(), uploadMedia.single('file'), async (req, res) => {
  try {
    const casId = req.params.id;
    const societeId = req.societe?.id || req.headers['x-societe-id'];
    const userId = req.user.id;

    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const mediaType = req.body.type || 'autre';
    if (!MEDIA_TYPES.includes(mediaType)) {
      // Supprimer le fichier uploade
      try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
      return res.status(400).json({ error: 'Type de média invalide. Valeurs : ' + MEDIA_TYPES.join(', ') });
    }

    // Verifier que le cas existe et appartient a la societe
    const { data: cas, error: cErr } = await admin()
      .from('cas_cliniques')
      .select('id, statut')
      .eq('id', casId)
      .eq('societe_id', societeId)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!cas) {
      try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
      return res.status(404).json({ error: 'Cas clinique introuvable' });
    }

    const fileUrl = '/uploads/cas-clinique/' + casId + '/' + path.basename(req.file.path);

    const { data, error } = await admin()
      .from('cas_clinique_medias')
      .insert({
        cas_id: casId,
        type: mediaType,
        file_path: req.file.path,
        file_url: fileUrl,
        mimetype: req.file.mimetype,
        file_size: req.file.size,
        note: req.body.note || null,
        uploaded_by: userId
      })
      .select('id, file_url, created_at')
      .single();

    if (error) throw error;

    console.log('[cas-clinique] média ajouté —', casId, '— type:', mediaType, '— taille:', Math.round(req.file.size / 1024), 'Ko');
    res.status(201).json({
      ok: true,
      media_id: data.id,
      file_url: data.file_url,
      created_at: data.created_at
    });
  } catch (e) {
    console.error('[cas-clinique] POST /:id/add-media error:', e.message);
    if (e.message?.includes('File too large') || e.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Fichier trop volumineux (max 25 Mo)' });
    }
    res.status(500).json({ error: 'Erreur ajout média' });
  }
});

// =============================================
// 5. POST /:id/add-note — Ajouter une note au cas
// =============================================
router.post('/:id/add-note', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const casId = req.params.id;
    const societeId = req.societe?.id || req.headers['x-societe-id'];
    const userId = req.user.id;

    const { texte, etape, auteur_role } = req.body;

    if (!texte || typeof texte !== 'string' || texte.trim().length === 0) {
      return res.status(400).json({ error: 'texte requis' });
    }

    const role = auteur_role && NOTE_ROLES.includes(auteur_role) ? auteur_role : 'dentiste';

    // Verifier que le cas existe et appartient a la societe
    const { data: cas, error: cErr } = await admin()
      .from('cas_cliniques')
      .select('id')
      .eq('id', casId)
      .eq('societe_id', societeId)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!cas) return res.status(404).json({ error: 'Cas clinique introuvable' });

    const { data, error } = await admin()
      .from('cas_clinique_notes')
      .insert({
        cas_id: casId,
        auteur: userId,
        auteur_role: role,
        texte: texte.trim(),
        etape: etape || null
      })
      .select('id, created_at')
      .single();

    if (error) throw error;

    console.log('[cas-clinique] note ajoutée —', casId, '— rôle:', role);
    res.status(201).json({ ok: true, note_id: data.id, created_at: data.created_at });
  } catch (e) {
    console.error('[cas-clinique] POST /:id/add-note error:', e.message);
    res.status(500).json({ error: 'Erreur ajout note' });
  }
});

// =============================================
// 6. PATCH /:id/status — Changer le statut du cas
// =============================================
router.patch('/:id/status', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const casId = req.params.id;
    const societeId = req.societe?.id || req.headers['x-societe-id'];
    const { statut } = req.body;

    if (!statut || !CAS_STATUTS.includes(statut)) {
      return res.status(400).json({ error: 'statut invalide. Valeurs : ' + CAS_STATUTS.join(', ') });
    }

    // Verifier que le cas existe et appartient a la societe
    const { data: cas, error: cErr } = await admin()
      .from('cas_cliniques')
      .select('id, statut')
      .eq('id', casId)
      .eq('societe_id', societeId)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!cas) return res.status(404).json({ error: 'Cas clinique introuvable' });

    const oldStatut = cas.statut;

    const { error } = await admin()
      .from('cas_cliniques')
      .update({ statut })
      .eq('id', casId);

    if (error) throw error;

    console.log('[cas-clinique] statut changé —', casId, ':', oldStatut, '→', statut);
    res.json({ ok: true, old_statut: oldStatut, new_statut: statut });
  } catch (e) {
    console.error('[cas-clinique] PATCH /:id/status error:', e.message);
    res.status(500).json({ error: 'Erreur changement statut' });
  }
});

// =============================================
// 7. GET /:id/share/:role — Generer un lien de partage
// =============================================
router.get('/:id/share/:role', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const casId = req.params.id;
    const role = req.params.role;
    const societeId = req.societe?.id || req.headers['x-societe-id'];

    if (!['prothesiste', 'patient'].includes(role)) {
      return res.status(400).json({ error: 'rôle invalide. Valeurs : prothesiste, patient' });
    }

    // Verifier que le cas existe et appartient a la societe
    const { data: cas, error: cErr } = await admin()
      .from('cas_cliniques')
      .select('id, share_token_prothesiste, share_token_patient')
      .eq('id', casId)
      .eq('societe_id', societeId)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!cas) return res.status(404).json({ error: 'Cas clinique introuvable' });

    const tokenField = role === 'prothesiste' ? 'share_token_prothesiste' : 'share_token_patient';
    let token = cas[tokenField];

    // Si pas encore de token, en generer un
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      const { error } = await admin()
        .from('cas_cliniques')
        .update({ [tokenField]: token })
        .eq('id', casId);

      if (error) throw error;
    }

    // Stocker la date d'expiration dans metadata
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin()
      .from('cas_cliniques')
      .update({
        metadata: admin().rpc ? undefined : undefined // on met l'expiration dans le token lui-meme
      })
      .eq('id', casId);

    const shareUrl = 'https://jadomi.fr/cas-clinique/partage/' + token;

    console.log('[cas-clinique] lien partage généré —', casId, '— rôle:', role);
    res.json({
      ok: true,
      role,
      token,
      share_url: shareUrl,
      expires_at: expiresAt
    });
  } catch (e) {
    console.error('[cas-clinique] GET /:id/share/:role error:', e.message);
    res.status(500).json({ error: 'Erreur génération lien de partage' });
  }
});

// =============================================
// 8. GET /shared/:token — Acces partage (PUBLIC)
// =============================================
router.get('/shared/:token', publicRateLimit(20), async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 16) {
      return res.status(400).json({ error: 'Token invalide' });
    }

    // Chercher le cas par token prothesiste ou patient
    let role = null;
    let cas = null;

    // Essayer token prothesiste
    const { data: casProth } = await admin()
      .from('cas_cliniques')
      .select('*, patients_jadomi:patient_id(nom, prenom)')
      .eq('share_token_prothesiste', token)
      .maybeSingle();

    if (casProth) {
      role = 'prothesiste';
      cas = casProth;
    } else {
      // Essayer token patient
      const { data: casPat } = await admin()
        .from('cas_cliniques')
        .select('*, patients_jadomi:patient_id(nom, prenom)')
        .eq('share_token_patient', token)
        .maybeSingle();

      if (casPat) {
        role = 'patient';
        cas = casPat;
      }
    }

    if (!cas) {
      return res.status(404).json({ error: 'Lien de partage introuvable ou expiré' });
    }

    // Verifier expiration (30 jours depuis updated_at du token)
    // On utilise updated_at comme proxy pour la date de generation du token
    const tokenAge = Date.now() - new Date(cas.updated_at).getTime();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
    if (tokenAge > maxAge) {
      return res.status(410).json({ error: 'Ce lien de partage a expiré. Veuillez demander un nouveau lien à votre praticien.' });
    }

    // Charger les medias
    const { data: allMedias } = await admin()
      .from('cas_clinique_medias')
      .select('id, type, file_url, mimetype, note, created_at')
      .eq('cas_id', cas.id)
      .order('created_at', { ascending: true });

    let medias = allMedias || [];

    if (role === 'prothesiste') {
      // Le prothesiste voit : toutes les photos, bon de labo, shade, notes techniques
      // Pas de filtre sur les medias, il voit tout

      // Charger les notes
      const { data: notes } = await admin()
        .from('cas_clinique_notes')
        .select('id, auteur_role, texte, etape, created_at')
        .eq('cas_id', cas.id)
        .order('created_at', { ascending: true });

      res.json({
        ok: true,
        role: 'prothesiste',
        cas: {
          id: cas.id,
          titre: cas.titre,
          type: cas.type,
          dents: cas.dents,
          statut: cas.statut,
          notes: cas.notes
        },
        patient_nom: cas.patients_jadomi ? (cas.patients_jadomi.prenom + ' ' + cas.patients_jadomi.nom).trim() : '',
        medias,
        notes_cliniques: notes || []
      });
    } else {
      // Le patient voit : photos avant/apres seulement
      const patientVisibleTypes = ['photo_initiale', 'photo_finale', 'photo_essayage'];
      medias = medias.filter(m => patientVisibleTypes.includes(m.type));

      res.json({
        ok: true,
        role: 'patient',
        cas: {
          titre: cas.titre,
          type: cas.type,
          dents: cas.dents,
          statut: cas.statut
        },
        patient_nom: cas.patients_jadomi ? (cas.patients_jadomi.prenom + ' ' + cas.patients_jadomi.nom).trim() : '',
        medias
      });
    }

    console.log('[cas-clinique] accès partagé —', cas.id, '— rôle:', role);
  } catch (e) {
    console.error('[cas-clinique] GET /shared/:token error:', e.message);
    res.status(500).json({ error: 'Erreur accès partagé' });
  }
});

module.exports = router;
