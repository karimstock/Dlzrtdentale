// =============================================
// JADOMI -- Reseau de Soins (Care Network)
// Coordination interprofessionnelle N praticiens
// autour d'un patient. Extension du Triangle Photo.
// Cercle de soins + partages + adressage patient.
// =============================================
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { admin, requirePatient, requireCabinet, requirePermission } = require('./shared');

const router = express.Router();

// ===== Multer : upload media max 25 Mo (photos + videos) =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/reseau'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `rsn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo
  fileFilter: (req, file, cb) => {
    const allowed = /^(image\/(jpeg|jpg|png|webp|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf)$/i;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporte. Formats acceptes : JPEG, PNG, WebP, HEIC, MP4, MOV, WebM, PDF'));
    }
  }
});

// ===== Helper : URL publique du media uploade =====
function mediaUrl(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/uploads/reseau/${filename}`;
}

// ===== Helper : creer evenement (notification) =====
async function createReseauEvent(cabinetId, eventType, metadata) {
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
    console.error('[reseau] event creation error:', e.message);
  }
}

// ===== Helper : verifier qu'un praticien est dans le cercle d'un patient =====
async function isInCircle(patientId, cabinetId) {
  const { data } = await admin()
    .from('dentiste_pro_care_circle')
    .select('id')
    .eq('patient_id', patientId)
    .eq('praticien_cabinet_id', cabinetId)
    .neq('statut', 'inactif')
    .maybeSingle();
  return !!data;
}

// ===== Helper : profession du cabinet dans le cercle d'un patient =====
async function getProfessionInCircle(patientId, cabinetId) {
  const { data } = await admin()
    .from('dentiste_pro_care_circle')
    .select('profession')
    .eq('patient_id', patientId)
    .eq('praticien_cabinet_id', cabinetId)
    .neq('statut', 'inactif')
    .maybeSingle();
  return data ? data.profession : null;
}

// ===== Professions valides =====
const PROFESSIONS = [
  'dentiste', 'kine', 'medecin', 'osteo', 'dermato', 'orl',
  'ophtalmo', 'cardiologue', 'radiologue', 'chirurgien',
  'orthodontiste', 'parodontiste', 'endodontiste', 'implantologue',
  'stomatologue', 'orthophoniste', 'podologue', 'psychologue',
  'nutritionniste', 'sage_femme', 'infirmier', 'autre'
];

// =========================================================
// PRATICIEN ENDPOINTS
// =========================================================

// ---------------------------------------------------------
// 1. POST /reseau/circle/add
// Ajouter un praticien au cercle de soins d'un patient
// ---------------------------------------------------------
router.post('/circle/add', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const {
      patient_id, profession, role,
      praticien_cabinet_id,
      praticien_externe_nom, praticien_externe_email,
      praticien_externe_telephone
    } = req.body || {};

    if (!patient_id) return res.status(400).json({ error: 'patient_id requis' });
    if (!profession) return res.status(400).json({ error: 'profession requise' });

    if (!PROFESSIONS.includes(profession)) {
      return res.status(400).json({
        error: 'Profession invalide',
        professions_valides: PROFESSIONS
      });
    }

    // Verifier que le patient existe et appartient a ce cabinet
    const { data: patient, error: patErr } = await admin()
      .from('dentiste_pro_patients')
      .select('id, nom, prenom')
      .eq('id', patient_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (patErr) throw patErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    // Si praticien interne, verifier qu'il existe
    if (praticien_cabinet_id) {
      const { data: cab } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet')
        .eq('id', praticien_cabinet_id)
        .maybeSingle();

      if (!cab) return res.status(404).json({ error: 'Cabinet destinataire introuvable' });
    }

    // Verifier qu'il n'est pas deja dans le cercle (pour les internes)
    if (praticien_cabinet_id) {
      const exists = await isInCircle(patient_id, praticien_cabinet_id);
      if (exists) {
        return res.status(409).json({ error: 'Ce praticien est deja dans le cercle de soins de ce patient' });
      }
    }

    // S'assurer que l'ajouteur est lui-meme dans le cercle (ou c'est le premier ajout)
    const senderInCircle = await isInCircle(patient_id, req.cabinet.id);
    if (!senderInCircle) {
      // Auto-ajout de l'initiateur comme referent
      await admin()
        .from('dentiste_pro_care_circle')
        .insert({
          patient_id,
          praticien_cabinet_id: req.cabinet.id,
          profession: 'dentiste', // sera ajuste par le praticien
          role: 'referent',
          statut: 'actif',
          invite_par: req.cabinet.id
        });
    }

    const circleData = {
      patient_id,
      praticien_cabinet_id: praticien_cabinet_id || null,
      praticien_externe_nom: praticien_externe_nom ? praticien_externe_nom.trim().substring(0, 200) : null,
      praticien_externe_email: praticien_externe_email ? praticien_externe_email.trim().toLowerCase() : null,
      praticien_externe_telephone: praticien_externe_telephone || null,
      praticien_externe_profession: !praticien_cabinet_id ? profession : null,
      profession,
      role: role && ['referent', 'membre', 'consultant'].includes(role) ? role : 'membre',
      statut: praticien_cabinet_id ? 'actif' : 'invite',
      invite_par: req.cabinet.id
    };

    const { data: circle, error } = await admin()
      .from('dentiste_pro_care_circle')
      .insert(circleData)
      .select('*')
      .single();

    if (error) throw error;

    // Notification au praticien destinataire (si interne JADOMI)
    if (praticien_cabinet_id) {
      await createReseauEvent(praticien_cabinet_id, 'reseau_circle_invitation', {
        from_cabinet_id: req.cabinet.id,
        patient_id,
        patient_nom: `${patient.prenom || ''} ${patient.nom || ''}`.trim(),
        profession,
        circle_id: circle.id
      });
    }

    // TODO: si externe, envoyer email d'invitation a rejoindre JADOMI

    return res.json({ ok: true, circle });

  } catch (err) {
    console.error('[reseau/circle/add]', err);
    return res.status(500).json({ error: 'Erreur ajout au cercle de soins' });
  }
});

// ---------------------------------------------------------
// 2. GET /reseau/circle/:patientId
// Voir le cercle de soins complet d'un patient
// ---------------------------------------------------------
router.get('/circle/:patientId', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { patientId } = req.params;

    // Verifier que le patient appartient au cabinet
    const { data: patient, error: patErr } = await admin()
      .from('dentiste_pro_patients')
      .select('id, nom, prenom')
      .eq('id', patientId)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (patErr) throw patErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    // Charger le cercle via la vue
    const { data: team, error } = await admin()
      .from('dentiste_pro_care_team_view')
      .select('*')
      .eq('patient_id', patientId)
      .order('date_ajout', { ascending: true });

    if (error) throw error;

    return res.json({
      ok: true,
      patient: { id: patient.id, nom: patient.nom, prenom: patient.prenom },
      circle: team || [],
      count: (team || []).length
    });

  } catch (err) {
    console.error('[reseau/circle/get]', err);
    return res.status(500).json({ error: 'Erreur chargement cercle de soins' });
  }
});

// ---------------------------------------------------------
// 3. DELETE /reseau/circle/:id
// Retirer un praticien du cercle de soins
// ---------------------------------------------------------
router.delete('/circle/:id', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { id } = req.params;

    // Verifier que l'entree existe et que le cabinet est l'inviteur ou est dans le meme cercle
    const { data: entry, error: entryErr } = await admin()
      .from('dentiste_pro_care_circle')
      .select('id, patient_id, invite_par')
      .eq('id', id)
      .maybeSingle();

    if (entryErr) throw entryErr;
    if (!entry) return res.status(404).json({ error: 'Entree cercle introuvable' });

    // Verifier que le patient appartient au cabinet
    const { data: patient } = await admin()
      .from('dentiste_pro_patients')
      .select('id')
      .eq('id', entry.patient_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (!patient) return res.status(403).json({ error: 'Acces refuse' });

    // Soft delete : passage en inactif
    const { data: updated, error } = await admin()
      .from('dentiste_pro_care_circle')
      .update({ statut: 'inactif' })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({ ok: true, circle: updated });

  } catch (err) {
    console.error('[reseau/circle/delete]', err);
    return res.status(500).json({ error: 'Erreur retrait du cercle de soins' });
  }
});

// ---------------------------------------------------------
// 4. POST /reseau/share
// Partager photo/video/note avec un autre praticien du cercle
// ---------------------------------------------------------
router.post('/share', requireCabinet(), requirePermission('reseau'), upload.single('media'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const {
      patient_id, recipient_cabinet_id, recipient_email,
      type, titre, description, motif_adressage, urgence
    } = req.body || {};

    if (!patient_id) return res.status(400).json({ error: 'patient_id requis' });
    if (!type) return res.status(400).json({ error: 'type requis' });

    const validTypes = ['photo', 'video', 'note', 'document', 'referral'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Type invalide', types_valides: validTypes });
    }

    // Pour photo/video/document : un fichier est requis
    if (['photo', 'video', 'document'].includes(type) && !req.file) {
      return res.status(400).json({ error: 'Fichier media requis pour ce type de partage' });
    }

    // Verifier que le patient appartient au cabinet
    const { data: patient, error: patErr } = await admin()
      .from('dentiste_pro_patients')
      .select('id, nom, prenom')
      .eq('id', patient_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (patErr) throw patErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    // Verifier que l'emetteur est dans le cercle
    const senderInCircle = await isInCircle(patient_id, req.cabinet.id);
    if (!senderInCircle) {
      return res.status(403).json({ error: 'Vous ne faites pas partie du cercle de soins de ce patient' });
    }

    // Verifier que le destinataire est dans le cercle (si interne)
    if (recipient_cabinet_id) {
      const recipientInCircle = await isInCircle(patient_id, recipient_cabinet_id);
      if (!recipientInCircle) {
        return res.status(400).json({ error: 'Le destinataire ne fait pas partie du cercle de soins de ce patient' });
      }
    }

    if (!recipient_cabinet_id && !recipient_email) {
      return res.status(400).json({ error: 'recipient_cabinet_id ou recipient_email requis' });
    }

    // Profession de l'emetteur
    const senderProfession = await getProfessionInCircle(patient_id, req.cabinet.id);

    // Profession du destinataire
    let recipientProfession = null;
    if (recipient_cabinet_id) {
      recipientProfession = await getProfessionInCircle(patient_id, recipient_cabinet_id);
    }

    // Determiner les URLs media
    let fileMediaUrl = null;
    let fileThumbnailUrl = null;
    let fileDocumentUrl = null;

    if (req.file) {
      const url = mediaUrl(req, req.file.filename);
      if (type === 'document') {
        fileDocumentUrl = url;
      } else {
        fileMediaUrl = url;
        // TODO: generer thumbnail pour videos
      }
    }

    const partageData = {
      patient_id,
      sender_cabinet_id: req.cabinet.id,
      sender_profession: senderProfession,
      recipient_cabinet_id: recipient_cabinet_id || null,
      recipient_externe_email: recipient_email ? recipient_email.trim().toLowerCase() : null,
      recipient_profession: recipientProfession,
      type,
      titre: titre ? titre.trim().substring(0, 200) : null,
      description: description ? description.trim() : null,
      media_url: fileMediaUrl,
      thumbnail_url: fileThumbnailUrl,
      document_url: fileDocumentUrl,
      motif_adressage: type === 'referral' && motif_adressage ? motif_adressage.trim() : null,
      urgence: urgence && ['routine', 'urgent', 'immediat'].includes(urgence) ? urgence : null,
      ai_analysis: {}
    };

    const { data: partage, error } = await admin()
      .from('dentiste_pro_partages')
      .insert(partageData)
      .select('*')
      .single();

    if (error) throw error;

    // Notification au destinataire (si interne)
    if (recipient_cabinet_id) {
      const eventType = type === 'referral' ? 'reseau_referral_received' : 'reseau_share_received';
      await createReseauEvent(recipient_cabinet_id, eventType, {
        partage_id: partage.id,
        from_cabinet_id: req.cabinet.id,
        from_profession: senderProfession,
        patient_id,
        patient_nom: `${patient.prenom || ''} ${patient.nom || ''}`.trim(),
        type,
        urgence: partage.urgence,
        titre: partage.titre
      });
    }

    return res.json({ ok: true, partage });

  } catch (err) {
    console.error('[reseau/share]', err);
    return res.status(500).json({ error: 'Erreur partage inter-praticien' });
  }
});

// ---------------------------------------------------------
// 5. GET /reseau/inbox
// Tous les partages recus d'autres praticiens
// ---------------------------------------------------------
router.get('/inbox', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = admin()
      .from('dentiste_pro_partages')
      .select('*', { count: 'exact' })
      .eq('recipient_cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtres optionnels
    if (req.query.patient_id) {
      query = query.eq('patient_id', req.query.patient_id);
    }
    if (req.query.type) {
      query = query.eq('type', req.query.type);
    }
    if (req.query.profession) {
      query = query.eq('sender_profession', req.query.profession);
    }
    if (req.query.unread === 'true') {
      query = query.is('read_at', null);
    }
    if (req.query.urgence) {
      query = query.eq('urgence', req.query.urgence);
    }

    const { data: partages, error, count } = await query;
    if (error) throw error;

    // Enrichir avec noms des cabinets emetteurs et patients
    const cabinetIds = [...new Set((partages || []).map(p => p.sender_cabinet_id))];
    const patientIds = [...new Set((partages || []).map(p => p.patient_id))];

    let cabinetsMap = {};
    let patientsMap = {};

    if (cabinetIds.length > 0) {
      const { data: cabinets } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet')
        .in('id', cabinetIds);
      if (cabinets) {
        for (const c of cabinets) {
          cabinetsMap[c.id] = c.nom_cabinet;
        }
      }
    }

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

    const enriched = (partages || []).map(p => ({
      ...p,
      sender_nom: cabinetsMap[p.sender_cabinet_id] || 'Praticien',
      patient_nom: patientsMap[p.patient_id] || 'Patient'
    }));

    // Stats rapides
    const unreadCount = (partages || []).filter(p => !p.read_at).length;

    return res.json({
      ok: true,
      partages: enriched,
      unread_count: unreadCount,
      pagination: {
        page, limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[reseau/inbox]', err);
    return res.status(500).json({ error: 'Erreur chargement inbox reseau' });
  }
});

// ---------------------------------------------------------
// 6. GET /reseau/sent
// Tous les partages envoyes
// ---------------------------------------------------------
router.get('/sent', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = admin()
      .from('dentiste_pro_partages')
      .select('*', { count: 'exact' })
      .eq('sender_cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.patient_id) {
      query = query.eq('patient_id', req.query.patient_id);
    }
    if (req.query.type) {
      query = query.eq('type', req.query.type);
    }

    const { data: partages, error, count } = await query;
    if (error) throw error;

    // Enrichir avec noms des cabinets destinataires et patients
    const cabinetIds = [...new Set((partages || []).filter(p => p.recipient_cabinet_id).map(p => p.recipient_cabinet_id))];
    const patientIds = [...new Set((partages || []).map(p => p.patient_id))];

    let cabinetsMap = {};
    let patientsMap = {};

    if (cabinetIds.length > 0) {
      const { data: cabinets } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet')
        .in('id', cabinetIds);
      if (cabinets) {
        for (const c of cabinets) {
          cabinetsMap[c.id] = c.nom_cabinet;
        }
      }
    }

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

    const enriched = (partages || []).map(p => ({
      ...p,
      recipient_nom: p.recipient_cabinet_id
        ? (cabinetsMap[p.recipient_cabinet_id] || 'Praticien')
        : (p.recipient_externe_email || 'Externe'),
      patient_nom: patientsMap[p.patient_id] || 'Patient'
    }));

    return res.json({
      ok: true,
      partages: enriched,
      pagination: {
        page, limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[reseau/sent]', err);
    return res.status(500).json({ error: 'Erreur chargement partages envoyes' });
  }
});

// ---------------------------------------------------------
// 7. POST /reseau/share/:id/respond
// Repondre a un partage (ex: kine repond au dentiste)
// ---------------------------------------------------------
router.post('/share/:id/respond', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { id } = req.params;
    const { reponse } = req.body || {};

    if (!reponse || !reponse.trim()) {
      return res.status(400).json({ error: 'Reponse requise' });
    }

    // Verifier que le partage existe et est destine a ce cabinet
    const { data: partage, error: partErr } = await admin()
      .from('dentiste_pro_partages')
      .select('id, sender_cabinet_id, patient_id, type, titre')
      .eq('id', id)
      .eq('recipient_cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (partErr) throw partErr;
    if (!partage) return res.status(404).json({ error: 'Partage introuvable ou non destine a vous' });

    // Marquer comme lu + repondu
    const { data: updated, error } = await admin()
      .from('dentiste_pro_partages')
      .update({
        read_at: partage.read_at || new Date().toISOString(),
        repondu_at: new Date().toISOString(),
        reponse: reponse.trim()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    // Notifier l'emetteur original
    await createReseauEvent(partage.sender_cabinet_id, 'reseau_share_responded', {
      partage_id: partage.id,
      from_cabinet_id: req.cabinet.id,
      patient_id: partage.patient_id,
      type: partage.type,
      titre: partage.titre
    });

    return res.json({ ok: true, partage: updated });

  } catch (err) {
    console.error('[reseau/share/respond]', err);
    return res.status(500).json({ error: 'Erreur reponse au partage' });
  }
});

// ---------------------------------------------------------
// 8. GET /reseau/patient/:patientId/history
// Historique interprofessionnel complet d'un patient
// ---------------------------------------------------------
router.get('/patient/:patientId/history', requireCabinet(), requirePermission('reseau'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { patientId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Verifier que le patient appartient au cabinet
    const { data: patient, error: patErr } = await admin()
      .from('dentiste_pro_patients')
      .select('id, nom, prenom')
      .eq('id', patientId)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (patErr) throw patErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    // Verifier que le praticien est dans le cercle
    const inCircle = await isInCircle(patientId, req.cabinet.id);
    if (!inCircle) {
      return res.status(403).json({ error: 'Vous ne faites pas partie du cercle de soins de ce patient' });
    }

    // Charger tous les partages pour ce patient
    // Le praticien voit uniquement les partages ou il est emetteur ou destinataire
    const { data: partages, error, count } = await admin()
      .from('dentiste_pro_partages')
      .select('*', { count: 'exact' })
      .eq('patient_id', patientId)
      .or(`sender_cabinet_id.eq.${req.cabinet.id},recipient_cabinet_id.eq.${req.cabinet.id}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Enrichir avec noms des cabinets
    const cabinetIds = [...new Set(
      (partages || [])
        .flatMap(p => [p.sender_cabinet_id, p.recipient_cabinet_id])
        .filter(Boolean)
    )];

    let cabinetsMap = {};
    if (cabinetIds.length > 0) {
      const { data: cabinets } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet')
        .in('id', cabinetIds);
      if (cabinets) {
        for (const c of cabinets) {
          cabinetsMap[c.id] = c.nom_cabinet;
        }
      }
    }

    const enriched = (partages || []).map(p => ({
      ...p,
      sender_nom: cabinetsMap[p.sender_cabinet_id] || 'Praticien',
      recipient_nom: p.recipient_cabinet_id
        ? (cabinetsMap[p.recipient_cabinet_id] || 'Praticien')
        : (p.recipient_externe_email || 'Externe')
    }));

    // Charger le cercle pour contexte
    const { data: circle } = await admin()
      .from('dentiste_pro_care_team_view')
      .select('*')
      .eq('patient_id', patientId);

    return res.json({
      ok: true,
      patient: { id: patient.id, nom: patient.nom, prenom: patient.prenom },
      circle: circle || [],
      partages: enriched,
      pagination: {
        page, limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[reseau/patient/history]', err);
    return res.status(500).json({ error: 'Erreur chargement historique interprofessionnel' });
  }
});

// =========================================================
// PATIENT ENDPOINTS
// =========================================================

// ---------------------------------------------------------
// 9. GET /reseau/my-team
// Le patient voit son equipe de soins
// Ne voit PAS les messages inter-praticiens (confidentiels)
// ---------------------------------------------------------
router.get('/my-team', requirePatient(), async (req, res) => {
  try {
    // Charger le cercle de soins du patient
    const { data: circle, error } = await admin()
      .from('dentiste_pro_care_circle')
      .select(`
        id, profession, role, statut, date_ajout,
        praticien_cabinet_id,
        praticien_externe_nom,
        praticien_externe_profession
      `)
      .eq('patient_id', req.patient.id)
      .neq('statut', 'inactif')
      .order('date_ajout', { ascending: true });

    if (error) throw error;

    // Enrichir avec noms des cabinets internes
    const cabinetIds = (circle || [])
      .filter(c => c.praticien_cabinet_id)
      .map(c => c.praticien_cabinet_id);

    let cabinetsMap = {};
    if (cabinetIds.length > 0) {
      const { data: cabinets } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet, ville')
        .in('id', cabinetIds);
      if (cabinets) {
        for (const c of cabinets) {
          cabinetsMap[c.id] = { nom: c.nom_cabinet, ville: c.ville };
        }
      }
    }

    const team = (circle || []).map(c => ({
      id: c.id,
      profession: c.profession,
      role: c.role,
      statut: c.statut,
      depuis: c.date_ajout,
      nom: c.praticien_cabinet_id
        ? (cabinetsMap[c.praticien_cabinet_id]?.nom || 'Praticien')
        : (c.praticien_externe_nom || 'Praticien externe'),
      ville: c.praticien_cabinet_id
        ? (cabinetsMap[c.praticien_cabinet_id]?.ville || null)
        : null,
      sur_jadomi: !!c.praticien_cabinet_id
    }));

    return res.json({
      ok: true,
      team,
      count: team.length
    });

  } catch (err) {
    console.error('[reseau/my-team]', err);
    return res.status(500).json({ error: 'Erreur chargement equipe de soins' });
  }
});

// ---------------------------------------------------------
// 10. POST /reseau/patient/request-referral
// Le patient demande un adressage vers un autre specialiste
// ---------------------------------------------------------
router.post('/patient/request-referral', requirePatient(), async (req, res) => {
  try {
    const { profession_needed, motif } = req.body || {};

    if (!profession_needed) {
      return res.status(400).json({ error: 'profession_needed requis' });
    }
    if (!motif || !motif.trim()) {
      return res.status(400).json({ error: 'motif requis' });
    }

    // Trouver le praticien referent du patient dans le cercle
    const { data: referent, error: refErr } = await admin()
      .from('dentiste_pro_care_circle')
      .select('praticien_cabinet_id, profession')
      .eq('patient_id', req.patient.id)
      .eq('role', 'referent')
      .neq('statut', 'inactif')
      .maybeSingle();

    if (refErr) throw refErr;

    // Si pas de referent dans le cercle, utiliser le cabinet du patient
    const targetCabinetId = referent?.praticien_cabinet_id || req.patient.cabinet_id;

    if (!targetCabinetId) {
      return res.status(400).json({ error: 'Aucun praticien referent trouve' });
    }

    // Charger le nom du patient
    const { data: patient } = await admin()
      .from('dentiste_pro_patients')
      .select('nom, prenom')
      .eq('id', req.patient.id)
      .maybeSingle();

    // Creer une notification pour le praticien referent
    await createReseauEvent(targetCabinetId, 'reseau_patient_referral_request', {
      patient_id: req.patient.id,
      patient_nom: patient ? `${patient.prenom || ''} ${patient.nom || ''}`.trim() : 'Patient',
      profession_needed,
      motif: motif.trim().substring(0, 1000)
    });

    return res.json({
      ok: true,
      message: 'Votre demande a ete transmise a votre praticien referent.'
    });

  } catch (err) {
    console.error('[reseau/patient/request-referral]', err);
    return res.status(500).json({ error: 'Erreur envoi demande adressage' });
  }
});

// =========================================================
// REFERRAL WORKFLOW ("Adresser un patient")
// =========================================================

// ---------------------------------------------------------
// 11. POST /reseau/refer
// Adresser un patient a un autre praticien avec preuves visuelles
// Workflow complet : cercle + partage + notification
// ---------------------------------------------------------
router.post('/refer', requireCabinet(), requirePermission('reseau'), upload.single('media'), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const {
      patient_id, to_profession, to_cabinet_id,
      motif, urgence
    } = req.body || {};

    if (!patient_id) return res.status(400).json({ error: 'patient_id requis' });
    if (!to_profession) return res.status(400).json({ error: 'to_profession requis' });
    if (!motif || !motif.trim()) return res.status(400).json({ error: 'motif requis' });

    if (!PROFESSIONS.includes(to_profession)) {
      return res.status(400).json({
        error: 'Profession invalide',
        professions_valides: PROFESSIONS
      });
    }

    // Verifier que le patient appartient au cabinet
    const { data: patient, error: patErr } = await admin()
      .from('dentiste_pro_patients')
      .select('id, nom, prenom')
      .eq('id', patient_id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (patErr) throw patErr;
    if (!patient) return res.status(404).json({ error: 'Patient introuvable' });

    // S'assurer que l'emetteur est dans le cercle
    const senderInCircle = await isInCircle(patient_id, req.cabinet.id);
    if (!senderInCircle) {
      // Auto-ajout comme referent
      await admin()
        .from('dentiste_pro_care_circle')
        .insert({
          patient_id,
          praticien_cabinet_id: req.cabinet.id,
          profession: 'dentiste',
          role: 'referent',
          statut: 'actif',
          invite_par: req.cabinet.id
        });
    }

    // Si un cabinet destinataire est fourni, l'ajouter au cercle s'il n'y est pas
    if (to_cabinet_id) {
      const recipientInCircle = await isInCircle(patient_id, to_cabinet_id);
      if (!recipientInCircle) {
        // Verifier que le cabinet existe
        const { data: destCab } = await admin()
          .from('dentiste_pro_cabinets')
          .select('id')
          .eq('id', to_cabinet_id)
          .maybeSingle();

        if (!destCab) return res.status(404).json({ error: 'Cabinet destinataire introuvable' });

        await admin()
          .from('dentiste_pro_care_circle')
          .insert({
            patient_id,
            praticien_cabinet_id: to_cabinet_id,
            profession: to_profession,
            role: 'consultant',
            statut: 'actif',
            invite_par: req.cabinet.id
          });
      }
    }

    // Profession de l'emetteur
    const senderProfession = await getProfessionInCircle(patient_id, req.cabinet.id);

    // Determiner media
    let fileMediaUrl = null;
    if (req.file) {
      fileMediaUrl = mediaUrl(req, req.file.filename);
    }

    // Creer le partage de type referral
    const partageData = {
      patient_id,
      sender_cabinet_id: req.cabinet.id,
      sender_profession: senderProfession,
      recipient_cabinet_id: to_cabinet_id || null,
      recipient_profession: to_profession,
      type: 'referral',
      titre: `Adressage ${to_profession} - ${patient.prenom || ''} ${patient.nom || ''}`.trim(),
      description: null,
      media_url: fileMediaUrl,
      motif_adressage: motif.trim(),
      urgence: urgence && ['routine', 'urgent', 'immediat'].includes(urgence) ? urgence : 'routine',
      ai_analysis: {}
    };

    const { data: partage, error } = await admin()
      .from('dentiste_pro_partages')
      .insert(partageData)
      .select('*')
      .single();

    if (error) throw error;

    // Notification au destinataire (si interne)
    if (to_cabinet_id) {
      await createReseauEvent(to_cabinet_id, 'reseau_referral_received', {
        partage_id: partage.id,
        from_cabinet_id: req.cabinet.id,
        from_profession: senderProfession,
        patient_id,
        patient_nom: `${patient.prenom || ''} ${patient.nom || ''}`.trim(),
        to_profession,
        motif: motif.trim().substring(0, 200),
        urgence: partage.urgence
      });
    }

    return res.json({
      ok: true,
      partage,
      message: to_cabinet_id
        ? 'Patient adresse avec succes. Le praticien a ete notifie.'
        : 'Adressage cree. Aucun praticien specifique cible - adressage en attente.'
    });

  } catch (err) {
    console.error('[reseau/refer]', err);
    return res.status(500).json({ error: 'Erreur adressage patient' });
  }
});

// =========================================================
// SHARED: Mark share as read
// =========================================================
router.put('/share/:id/read', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(404).json({ error: 'Cabinet introuvable' });

    const { id } = req.params;

    const { data, error } = await admin()
      .from('dentiste_pro_partages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_cabinet_id', req.cabinet.id)
      .select('id, read_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Partage introuvable ou non destine a vous' });

    return res.json({ ok: true, partage: data });

  } catch (err) {
    console.error('[reseau/share/read]', err);
    return res.status(500).json({ error: 'Erreur mise a jour lecture' });
  }
});

module.exports = router;
