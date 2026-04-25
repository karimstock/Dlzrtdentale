// =============================================
// JADOMI — Dentiste Pro : Chat Direct praticien/patient
// Messagerie temps reel SSE + historique
// Fonctionne pour TOUTES les professions de sante
// =============================================
const express = require('express');
const { admin, verifyPatientToken, requirePatient, requireCabinet, requirePermission } = require('./shared');

const router = express.Router();

// ===== Helper : identifier l'auth (patient JWT ou Supabase praticien) =====
async function identifyAuth(req) {
  // 1) Essayer JWT patient (query param ou header)
  const tokenRaw = req.query.access_token || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!tokenRaw) return null;

  // Tenter patient JWT d'abord
  const patientPayload = verifyPatientToken(tokenRaw);
  if (patientPayload) {
    return { type: 'patient', id: patientPayload.id, cabinet_id: patientPayload.cabinet_id };
  }

  // Tenter Supabase JWT (praticien)
  try {
    const { data, error } = await admin().auth.getUser(tokenRaw);
    if (!error && data?.user) {
      // Trouver le cabinet du praticien
      const { data: membership } = await admin()
        .from('societes_membres')
        .select('societe_id')
        .eq('user_id', data.user.id)
        .limit(1)
        .maybeSingle();
      if (membership) {
        const { data: cabinet } = await admin()
          .from('dentiste_pro_cabinets')
          .select('id')
          .eq('societe_id', membership.societe_id)
          .maybeSingle();
        if (cabinet) {
          return { type: 'praticien', id: data.user.id, cabinet_id: cabinet.id };
        }
      }
    }
  } catch (e) {
    // Not a valid Supabase token
  }

  return null;
}

// =========================================================
// GET /chat/stream — SSE real-time messages
// Auth via ?access_token= (patient JWT or Supabase JWT)
// =========================================================
router.get('/stream', async (req, res) => {
  try {
    const auth = await identifyAuth(req);
    if (!auth) return res.status(401).end('missing_or_invalid_token');

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();

    // Envoyer un event de connexion
    res.write(`data: ${JSON.stringify({ type: 'connected', sender_type: auth.type })}\n\n`);

    let lastChecked = new Date().toISOString();
    let alive = true;

    // Poll DB toutes les 3s pour nouveaux messages
    const pollInterval = setInterval(async () => {
      if (!alive) return;
      try {
        let query = admin()
          .from('dentiste_pro_messages')
          .select('*')
          .eq('cabinet_id', auth.cabinet_id)
          .gt('created_at', lastChecked)
          .order('created_at', { ascending: true });

        // Patient: seulement ses messages
        if (auth.type === 'patient') {
          query = query.eq('patient_id', auth.id);
        }

        const { data: messages, error } = await query;
        if (error) {
          console.error('[chat/stream] poll error:', error.message);
          return;
        }

        if (messages && messages.length > 0) {
          for (const msg of messages) {
            res.write(`data: ${JSON.stringify({ type: 'message', ...msg })}\n\n`);
          }
          lastChecked = messages[messages.length - 1].created_at;
        }
      } catch (e) {
        console.error('[chat/stream] poll exception:', e.message);
      }
    }, 3000);

    // Heartbeat toutes les 15s
    const heartbeatInterval = setInterval(() => {
      if (!alive) return;
      try {
        res.write(`: heartbeat\n\n`);
      } catch (e) {
        alive = false;
      }
    }, 15000);

    // Cleanup a la deconnexion
    req.on('close', () => {
      alive = false;
      clearInterval(pollInterval);
      clearInterval(heartbeatInterval);
    });

  } catch (err) {
    console.error('[chat/stream]', err);
    if (!res.headersSent) res.status(500).end('server_error');
  }
});

// =========================================================
// POST /chat/send — Envoyer un message
// Body: { content, patient_id?, media_url?, media_type? }
// Auth: patient JWT ou Supabase JWT
// =========================================================
router.post('/send', async (req, res) => {
  try {
    // Identifier l'expediteur
    const auth = await identifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Non autorise' });

    const { content, patient_id, media_url, media_type } = req.body || {};

    if (!content && !media_url) {
      return res.status(400).json({ error: 'Contenu ou media requis' });
    }
    if (content && content.length > 5000) {
      return res.status(400).json({ error: 'Message trop long (5000 caracteres max)' });
    }

    // Determiner le patient_id cible
    let targetPatientId;
    if (auth.type === 'patient') {
      targetPatientId = auth.id;
    } else {
      // Praticien doit specifier le patient
      if (!patient_id) {
        return res.status(400).json({ error: 'patient_id requis pour un praticien' });
      }
      targetPatientId = patient_id;
    }

    const messageData = {
      cabinet_id: auth.cabinet_id,
      patient_id: targetPatientId,
      sender_type: auth.type,
      sender_id: auth.id,
      content: content ? content.trim() : null,
      media_url: media_url || null,
      media_type: media_type || null,
      created_at: new Date().toISOString()
    };

    const { data: message, error } = await admin()
      .from('dentiste_pro_messages')
      .insert(messageData)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({ ok: true, message });

  } catch (err) {
    console.error('[chat/send]', err);
    return res.status(500).json({ error: 'Erreur envoi message' });
  }
});

// =========================================================
// PUT /chat/read/:messageId — Marquer un message comme lu
// =========================================================
router.put('/read/:messageId', async (req, res) => {
  try {
    const auth = await identifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Non autorise' });

    const { messageId } = req.params;
    if (!messageId) {
      return res.status(400).json({ error: 'messageId requis' });
    }

    const { data, error } = await admin()
      .from('dentiste_pro_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('cabinet_id', auth.cabinet_id)
      .select('id, read_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Message introuvable' });

    return res.json({ ok: true, message: data });

  } catch (err) {
    console.error('[chat/read]', err);
    return res.status(500).json({ error: 'Erreur mise a jour' });
  }
});

// =========================================================
// GET /chat/history/:patientId — Historique messages (admin)
// Query: ?page=1&limit=50
// Auth: requireCabinet
// =========================================================
router.get('/history/:patientId', requireCabinet(), requirePermission('chat'), async (req, res) => {
  try {
    if (!req.cabinet) {
      return res.status(404).json({ error: 'Cabinet introuvable' });
    }

    const { patientId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Compter le total
    const { count, error: countErr } = await admin()
      .from('dentiste_pro_messages')
      .select('id', { count: 'exact', head: true })
      .eq('cabinet_id', req.cabinet.id)
      .eq('patient_id', patientId);

    if (countErr) throw countErr;

    // Recuperer les messages pagines
    const { data: messages, error } = await admin()
      .from('dentiste_pro_messages')
      .select('*')
      .eq('cabinet_id', req.cabinet.id)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      ok: true,
      messages: messages || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[chat/history]', err);
    return res.status(500).json({ error: 'Erreur chargement historique' });
  }
});

// =========================================================
// GET /chat/conversations — Liste conversations (admin)
// Auth: requireCabinet
// Retourne: [{patient_id, patient_nom, last_message, unread_count, last_activity}]
// =========================================================
router.get('/conversations', requireCabinet(), requirePermission('chat'), async (req, res) => {
  try {
    if (!req.cabinet) {
      return res.status(404).json({ error: 'Cabinet introuvable' });
    }

    // Recuperer tous les messages du cabinet groupes par patient
    const { data: rawMessages, error } = await admin()
      .from('dentiste_pro_messages')
      .select('id, patient_id, content, sender_type, read_at, created_at')
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Grouper par patient
    const convMap = new Map();
    for (const msg of (rawMessages || [])) {
      if (!convMap.has(msg.patient_id)) {
        convMap.set(msg.patient_id, {
          patient_id: msg.patient_id,
          last_message: msg.content,
          last_message_sender: msg.sender_type,
          last_activity: msg.created_at,
          unread_count: 0,
          total_messages: 0
        });
      }
      const conv = convMap.get(msg.patient_id);
      conv.total_messages++;
      // Compter non lus envoyes par le patient (a destination du praticien)
      if (msg.sender_type === 'patient' && !msg.read_at) {
        conv.unread_count++;
      }
    }

    // Recuperer les noms des patients
    const patientIds = Array.from(convMap.keys());
    let patientsMap = {};
    if (patientIds.length > 0) {
      const { data: patients } = await admin()
        .from('dentiste_pro_patients')
        .select('id, nom, prenom, telephone')
        .in('id', patientIds);

      if (patients) {
        for (const p of patients) {
          patientsMap[p.id] = p;
        }
      }
    }

    // Construire la reponse
    const conversations = Array.from(convMap.values()).map(conv => ({
      ...conv,
      patient_nom: patientsMap[conv.patient_id]
        ? `${patientsMap[conv.patient_id].prenom || ''} ${patientsMap[conv.patient_id].nom || ''}`.trim()
        : 'Patient inconnu',
      patient_telephone: patientsMap[conv.patient_id]?.telephone || null
    }));

    // Trier par derniere activite
    conversations.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));

    return res.json({ ok: true, conversations });

  } catch (err) {
    console.error('[chat/conversations]', err);
    return res.status(500).json({ error: 'Erreur chargement conversations' });
  }
});

module.exports = router;
