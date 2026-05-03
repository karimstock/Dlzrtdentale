// =============================================
// JADOMI — Cases prothétiques CRUD
// Passe 71 — Gestion cas + événements + transitions
// Le CAS-ID est auto-généré par le trigger SQL existant
// =============================================
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { admin, requireCabinet, requireLabo } = require('./shared');

const router = express.Router();

// ===== Upload photos cas =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/triangle')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `case_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video)\/(jpeg|jpg|png|webp|heic|heif|mp4|mov|quicktime)$/i;
    cb(null, ok.test(file.mimetype));
  }
});

// ===== Helper : log event =====
async function logEvent(caseId, eventType, actorUserId, actorType, payload = {}) {
  try {
    await admin().from('case_events').insert({
      case_id: caseId,
      event_type: eventType,
      actor_user_id: actorUserId || null,
      actor_type: actorType || 'system',
      payload
    });
  } catch (e) {
    console.error('[cases] event log error:', e.message);
  }
}

// =========================================================
// GET /cases — Liste filtrée des cas du cabinet
// =========================================================
router.get('/', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { statut, patient_id, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let query = admin()
      .from('dentiste_pro_cases')
      .select(`
        id, reference, titre, type, dent_numero, teinte, statut,
        date_empreinte, date_livraison_prevue, date_livraison_reelle,
        stl_transmission_method, stl_transmission_reference, stl_transmitted_at,
        closed_at, created_at, updated_at,
        patient:dentiste_pro_patients!patient_id(id, pat_id, nom, prenom, telephone),
        labo:dentiste_pro_labos!labo_id(id, nom, ville)
      `, { count: 'exact' })
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (statut) query = query.eq('statut', statut);
    if (patient_id) query = query.eq('patient_id', patient_id);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ cases: data || [], total: count || 0, page: parseInt(page) });
  } catch (e) {
    console.error('[cases] list:', e.message);
    res.status(500).json({ error: 'Erreur chargement cas' });
  }
});

// =========================================================
// POST /cases — Créer un cas + event "created"
// =========================================================
router.post('/', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { patient_id, labo_id, titre, type, dent_numero, teinte, instructions,
            date_empreinte, date_livraison_prevue,
            stl_transmission_method, stl_transmission_reference } = req.body || {};

    if (!patient_id) return res.status(400).json({ error: 'Patient requis' });
    if (!type) return res.status(400).json({ error: 'Type de travail requis' });

    // Vérifier que le patient appartient au cabinet
    const { data: pat } = await admin()
      .from('dentiste_pro_patients')
      .select('id, pat_id, nom, prenom')
      .eq('id', patient_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (!pat) return res.status(404).json({ error: 'Patient non trouvé dans ce cabinet' });

    // reference (CAS-YYYY-NNNN) auto-générée par trigger SQL
    const { data: cas, error } = await admin()
      .from('dentiste_pro_cases')
      .insert({
        cabinet_id: req.cabinet.id,
        patient_id,
        labo_id: labo_id || null,
        titre: (titre || '').trim() || `${type} ${dent_numero || ''}`.trim(),
        type,
        dent_numero: dent_numero || null,
        teinte: teinte || null,
        instructions: instructions || null,
        date_empreinte: date_empreinte || null,
        date_livraison_prevue: date_livraison_prevue || null,
        stl_transmission_method: stl_transmission_method || null,
        stl_transmission_reference: stl_transmission_reference || null,
        stl_transmitted_at: stl_transmission_reference ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (error) throw error;

    await logEvent(cas.id, 'created', req.user?.id, 'dentist', {
      patient_pat_id: pat.pat_id,
      type, dent_numero, titre: cas.titre
    });

    res.status(201).json({ case: cas, patient: pat });
  } catch (e) {
    console.error('[cases] create:', e.message);
    res.status(500).json({ error: 'Erreur création cas' });
  }
});

// =========================================================
// GET /cases/:id — Détail cas + media + events
// =========================================================
router.get('/:id', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { data: cas, error } = await admin()
      .from('dentiste_pro_cases')
      .select(`
        *,
        patient:dentiste_pro_patients!patient_id(id, pat_id, nom, prenom, telephone, email, date_naissance),
        labo:dentiste_pro_labos!labo_id(id, nom, email, telephone, ville, specialites)
      `)
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (error) throw error;
    if (!cas) return res.status(404).json({ error: 'Cas non trouvé' });

    // Photos du cas (Triangle Photo)
    const { data: photos } = await admin()
      .from('dentiste_pro_photos')
      .select('id, photo_url, thumbnail_url, photo_type, sender_type, recipient_type, description, read_at, created_at')
      .eq('case_id', cas.id)
      .order('created_at', { ascending: false });

    // Événements du cas
    const { data: events } = await admin()
      .from('case_events')
      .select('id, event_type, actor_type, payload, created_at')
      .eq('case_id', cas.id)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({ case: cas, photos: photos || [], events: events || [] });
  } catch (e) {
    console.error('[cases] get:', e.message);
    res.status(500).json({ error: 'Erreur chargement cas' });
  }
});

// =========================================================
// PATCH /cases/:id — Mise à jour + event si status change
// =========================================================
router.patch('/:id', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const allowed = ['titre', 'type', 'dent_numero', 'teinte', 'instructions', 'labo_id',
                     'date_empreinte', 'date_livraison_prevue', 'statut',
                     'stl_transmission_method', 'stl_transmission_reference'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    // Si changement de statut, vérifier ancien
    let oldStatus = null;
    if (updates.statut) {
      const { data: current } = await admin()
        .from('dentiste_pro_cases')
        .select('statut')
        .eq('id', req.params.id)
        .eq('cabinet_id', req.cabinet.id)
        .maybeSingle();
      if (!current) return res.status(404).json({ error: 'Cas non trouvé' });
      oldStatus = current.statut;
    }

    if (updates.stl_transmission_reference && !updates.stl_transmitted_at) {
      updates.stl_transmitted_at = new Date().toISOString();
    }
    if (updates.statut === 'termine' || updates.statut === 'annule') {
      updates.closed_at = new Date().toISOString();
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('dentiste_pro_cases')
      .update(updates)
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cas non trouvé' });

    if (updates.statut && updates.statut !== oldStatus) {
      await logEvent(data.id, 'status_changed', req.user?.id, 'dentist', {
        from: oldStatus, to: updates.statut
      });
    }

    res.json({ case: data });
  } catch (e) {
    console.error('[cases] update:', e.message);
    res.status(500).json({ error: 'Erreur mise à jour cas' });
  }
});

// =========================================================
// POST /cases/:id/send-to-lab — Envoi au labo
// =========================================================
router.post('/:id/send-to-lab', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { labo_id } = req.body || {};

    const updates = { statut: 'en_cours', updated_at: new Date().toISOString() };
    if (labo_id) updates.labo_id = labo_id;

    const { data, error } = await admin()
      .from('dentiste_pro_cases')
      .update(updates)
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .eq('statut', 'ouvert')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cas non trouvé ou déjà envoyé' });

    await logEvent(data.id, 'sent_to_lab', req.user?.id, 'dentist', { labo_id: data.labo_id });

    res.json({ case: data, message: 'Cas envoyé au laboratoire' });
  } catch (e) {
    console.error('[cases] send-to-lab:', e.message);
    res.status(500).json({ error: 'Erreur envoi au labo' });
  }
});

// =========================================================
// POST /cases/:id/mark-delivered — Livré
// =========================================================
router.post('/:id/mark-delivered', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { data, error } = await admin()
      .from('dentiste_pro_cases')
      .update({
        statut: 'termine',
        date_livraison_reelle: new Date().toISOString().slice(0, 10),
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .in('statut', ['en_cours', 'essayage', 'modification'])
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cas non trouvé ou statut incompatible' });

    await logEvent(data.id, 'delivered', req.user?.id, 'dentist', {});

    res.json({ case: data, message: 'Cas marqué comme livré' });
  } catch (e) {
    console.error('[cases] mark-delivered:', e.message);
    res.status(500).json({ error: 'Erreur' });
  }
});

// =========================================================
// POST /cases/:id/media — Upload photo/vidéo sur le cas
// =========================================================
router.post('/:id/media', requireCabinet(), upload.single('media'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

    // Vérifier que le cas existe et appartient au cabinet
    const { data: cas } = await admin()
      .from('dentiste_pro_cases')
      .select('id, patient_id')
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (!cas) return res.status(404).json({ error: 'Cas non trouvé' });

    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${proto}://${host}/uploads/triangle/${req.file.filename}`;

    const { description, photo_type, recipient_type } = req.body || {};

    // Insérer dans dentiste_pro_photos (Triangle Photo)
    const { data: photo, error } = await admin()
      .from('dentiste_pro_photos')
      .insert({
        case_id: cas.id,
        cabinet_id: req.cabinet.id,
        sender_type: 'praticien',
        sender_id: req.user?.id,
        recipient_type: recipient_type || 'labo',
        photo_url: url,
        photo_type: photo_type || 'clinique',
        description: description || null
      })
      .select()
      .single();

    if (error) throw error;

    await logEvent(cas.id, 'photo_uploaded', req.user?.id, 'dentist', {
      photo_id: photo.id, photo_type: photo.photo_type
    });

    res.status(201).json({ photo });
  } catch (e) {
    console.error('[cases] media upload:', e.message);
    res.status(500).json({ error: 'Erreur upload' });
  }
});

// =========================================================
// GET /cases/:id/events — Historique événements
// =========================================================
router.get('/:id/events', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    // Vérifier ownership
    const { data: cas } = await admin()
      .from('dentiste_pro_cases')
      .select('id')
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (!cas) return res.status(404).json({ error: 'Cas non trouvé' });

    const { data, error } = await admin()
      .from('case_events')
      .select('*')
      .eq('case_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ events: data || [] });
  } catch (e) {
    console.error('[cases] events:', e.message);
    res.status(500).json({ error: 'Erreur' });
  }
});

module.exports = router;
