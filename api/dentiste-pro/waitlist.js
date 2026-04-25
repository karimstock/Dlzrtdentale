// =============================================
// JADOMI — Dentiste Pro : Waitlist intelligente
// Liste d'attente, detection annulation, urgence
// Fonctionne pour toutes professions de sante
// =============================================
const express = require('express');
const { admin, requirePatient, requireCabinet, requirePermission, formatDateFR } = require('./shared');
const { sendSmsOTP } = require('../../services/otp-sender');

const router = express.Router();

// ===== Helpers =====

function daysSince(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function matchesPreferences(patient, slot) {
  // Verifie si le creneau correspond aux preferences du patient
  if (patient.appointment_type_id && slot.appointment_type_id) {
    if (patient.appointment_type_id !== slot.appointment_type_id) return false;
  }
  if (patient.preferred_time_start && slot.start_time) {
    if (slot.start_time < patient.preferred_time_start) return false;
  }
  if (patient.preferred_time_end && slot.end_time) {
    if (slot.end_time > patient.preferred_time_end) return false;
  }
  return true;
}

function scorePatient(patient, slot) {
  let score = 0;
  // Urgence (max 40)
  score += ((patient.urgency_score || 5) / 10) * 40;
  // Anciennete en liste d'attente (max 30)
  const waitDays = daysSince(patient.wait_since || patient.created_at);
  score += Math.min(waitDays * 1.5, 30);
  // Correspondance preferences (max 20)
  if (matchesPreferences(patient, slot)) score += 20;
  // Proximite (max 10)
  score += Math.max(0, 10 - (patient.proximity_km || 10));
  return Math.round(score);
}

// Envoie une notification push via web-push
async function sendPushNotification(subscription, payload) {
  try {
    const webpush = require('web-push');
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:contact@jadomi.fr';

    if (!vapidPublic || !vapidPrivate) {
      console.warn('[waitlist] VAPID keys non configurees');
      return { success: false, error: 'VAPID non configure' };
    }

    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    console.error('[waitlist] push error:', err.message);
    return { success: false, error: err.message };
  }
}

// =========================================================
// POST /waitlist/join — Patient rejoint la liste d'attente
// =========================================================
router.post('/join', requirePatient(), async (req, res) => {
  try {
    const { id: patient_id, cabinet_id } = req.patient;
    const { appointment_type_id, preferred_dates, preferred_time_start, preferred_time_end, urgency_note } = req.body;

    // Verifier que le patient n'est pas deja en attente pour ce type
    const { data: existing } = await admin()
      .from('dentiste_pro_waitlist')
      .select('id')
      .eq('patient_id', patient_id)
      .eq('cabinet_id', cabinet_id)
      .eq('status', 'waiting')
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Vous etes deja en liste d\'attente' });
    }

    const { data, error } = await admin()
      .from('dentiste_pro_waitlist')
      .insert({
        patient_id,
        cabinet_id,
        appointment_type_id: appointment_type_id || null,
        preferred_dates: preferred_dates || null,
        preferred_time_start: preferred_time_start || null,
        preferred_time_end: preferred_time_end || null,
        urgency_note: urgency_note || null,
        urgency_score: 5,
        status: 'waiting',
        wait_since: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, waitlist_entry: data });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/join:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /waitlist/my-position — Patient consulte sa position
// =========================================================
router.get('/my-position', requirePatient(), async (req, res) => {
  try {
    const { id: patient_id, cabinet_id } = req.patient;

    // Recuperer l'entree du patient
    const { data: myEntry, error: myErr } = await admin()
      .from('dentiste_pro_waitlist')
      .select('*')
      .eq('patient_id', patient_id)
      .eq('cabinet_id', cabinet_id)
      .eq('status', 'waiting')
      .maybeSingle();

    if (myErr) throw myErr;
    if (!myEntry) {
      return res.status(404).json({ error: 'Vous n\'etes pas en liste d\'attente' });
    }

    // Compter les patients avec un score plus eleve ou en attente depuis plus longtemps
    const { data: ahead, error: aErr } = await admin()
      .from('dentiste_pro_waitlist')
      .select('id')
      .eq('cabinet_id', cabinet_id)
      .eq('status', 'waiting')
      .lt('wait_since', myEntry.wait_since);

    if (aErr) throw aErr;

    const position = (ahead || []).length + 1;
    const estimatedWaitDays = Math.max(1, Math.ceil(position * 2));

    res.json({
      success: true,
      position,
      estimated_wait_days: estimatedWaitDays,
      wait_since: myEntry.wait_since,
      urgency_score: myEntry.urgency_score
    });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/my-position:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// DELETE /waitlist/leave — Patient quitte la liste d'attente
// =========================================================
router.delete('/leave', requirePatient(), async (req, res) => {
  try {
    const { id: patient_id, cabinet_id } = req.patient;

    const { data, error } = await admin()
      .from('dentiste_pro_waitlist')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('patient_id', patient_id)
      .eq('cabinet_id', cabinet_id)
      .eq('status', 'waiting')
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Aucune entree en liste d\'attente trouvee' });
    }

    res.json({ success: true, message: 'Vous avez quitte la liste d\'attente' });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/leave:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /waitlist/admin — Vue complete de la liste d'attente
// =========================================================
router.get('/admin', requireCabinet(), requirePermission('waitlist'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const { data, error } = await admin()
      .from('dentiste_pro_waitlist')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email)')
      .eq('cabinet_id', cabinetId)
      .eq('status', 'waiting')
      .order('urgency_score', { ascending: false })
      .order('wait_since', { ascending: true });

    if (error) throw error;

    // Calculer le score composite pour chaque patient
    const enriched = (data || []).map((entry, idx) => ({
      ...entry,
      computed_score: scorePatient(entry, {}),
      position: idx + 1
    }));

    // Trier par score composite descendant
    enriched.sort((a, b) => b.computed_score - a.computed_score);
    enriched.forEach((e, i) => { e.position = i + 1; });

    res.json({ success: true, waitlist: enriched, total: enriched.length });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/admin:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// PATCH /waitlist/:id/urgency — Admin met a jour l'urgence
// =========================================================
router.patch('/:id/urgency', requireCabinet(), requirePermission('waitlist'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const { urgency_score } = req.body;
    if (urgency_score === undefined || urgency_score < 1 || urgency_score > 10) {
      return res.status(400).json({ error: 'urgency_score requis (1-10)' });
    }

    const { data, error } = await admin()
      .from('dentiste_pro_waitlist')
      .update({
        urgency_score,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('cabinet_id', cabinetId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, waitlist_entry: data });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/urgency:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /waitlist/cancellation-detected — Detection d'annulation
// Cree un creneau urgence, notifie les meilleurs patients
// =========================================================
router.post('/cancellation-detected', requireCabinet(), requirePermission('waitlist'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const { appointment_id, date, start_time, end_time, appointment_type_id } = req.body;
    if (!date || !start_time || !end_time) {
      return res.status(400).json({ error: 'date, start_time et end_time requis' });
    }

    const BASE_URL = process.env.BASE_URL || 'https://jadomi.fr';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // +30 min

    // 1. Creer le creneau urgence
    const { data: slot, error: slotErr } = await admin()
      .from('dentiste_pro_urgence_slots')
      .insert({
        cabinet_id: cabinetId,
        original_appointment_id: appointment_id || null,
        date,
        start_time,
        end_time,
        appointment_type_id: appointment_type_id || null,
        status: 'open',
        expires_at: expiresAt,
        notified_patient_ids: [],
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (slotErr) throw slotErr;

    // 2. Recuperer la waitlist active avec infos patient
    const { data: waitlist, error: wlErr } = await admin()
      .from('dentiste_pro_waitlist')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email, push_subscription)')
      .eq('cabinet_id', cabinetId)
      .eq('status', 'waiting');

    if (wlErr) throw wlErr;

    if (!waitlist || waitlist.length === 0) {
      return res.json({
        success: true,
        urgence_slot: slot,
        notified: 0,
        message: 'Creneau urgence cree, aucun patient en attente'
      });
    }

    // 3. Scorer et selectionner le top 5
    const slotInfo = { appointment_type_id, start_time, end_time, date };
    const scored = waitlist.map(entry => ({
      ...entry,
      computed_score: scorePatient(entry, slotInfo)
    }));
    scored.sort((a, b) => b.computed_score - a.computed_score);
    const top5 = scored.slice(0, 5);

    // 4. Notifier chaque patient (push + SMS)
    const notifiedIds = [];
    const dateFR = formatDateFR(date);
    const claimLink = `${BASE_URL}/dentiste-pro/claim/${slot.id}`;

    for (const entry of top5) {
      const patient = entry.patient;
      if (!patient) continue;

      notifiedIds.push(patient.id);
      const message = `Creneau disponible le ${dateFR} a ${start_time} — Acceptez en premier : ${claimLink}`;

      // Push notification
      if (patient.push_subscription) {
        await sendPushNotification(patient.push_subscription, {
          title: 'Creneau disponible !',
          body: `Le ${dateFR} a ${start_time}`,
          data: { type: 'urgence_slot', slot_id: slot.id, link: claimLink }
        });
      }

      // SMS
      if (patient.telephone) {
        try {
          await sendSmsOTP(patient.telephone, message);
        } catch (smsErr) {
          console.warn('[waitlist] SMS failed for', patient.telephone, smsErr.message);
        }
      }
    }

    // 5. Mettre a jour le slot avec les IDs notifies
    await admin()
      .from('dentiste_pro_urgence_slots')
      .update({ notified_patient_ids: notifiedIds })
      .eq('id', slot.id);

    // 6. Loguer l'evenement
    await admin()
      .from('dentiste_pro_events')
      .insert({
        cabinet_id: cabinetId,
        event_type: 'cancellation_detected',
        event_category: 'urgence',
        source: 'system',
        metadata: { slot_id: slot.id, notified: notifiedIds.length, date, start_time },
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      urgence_slot: slot,
      notified: notifiedIds.length,
      notified_patient_ids: notifiedIds,
      expires_at: expiresAt
    });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/cancellation-detected:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /waitlist/claim/:urgenceSlotId — Patient reclame un creneau
// Atomique : premier arrive, premier servi
// =========================================================
router.post('/claim/:urgenceSlotId', requirePatient(), async (req, res) => {
  try {
    const { id: patient_id, cabinet_id } = req.patient;
    const slotId = req.params.urgenceSlotId;

    // 1. Tenter de reclamer le creneau (atomique)
    const { data: claimed, error: claimErr } = await admin()
      .from('dentiste_pro_urgence_slots')
      .update({
        claimed_by: patient_id,
        status: 'claimed',
        claimed_at: new Date().toISOString()
      })
      .eq('id', slotId)
      .eq('status', 'open')
      .select()
      .maybeSingle();

    if (claimErr) throw claimErr;

    if (!claimed) {
      return res.status(409).json({ error: 'Ce creneau a deja ete pris ou a expire' });
    }

    // 2. Creer le rendez-vous
    const { data: rdv, error: rdvErr } = await admin()
      .from('dentiste_pro_appointments')
      .insert({
        cabinet_id: claimed.cabinet_id,
        patient_id,
        date: claimed.date,
        start_time: claimed.start_time,
        end_time: claimed.end_time,
        appointment_type_id: claimed.appointment_type_id,
        status: 'confirmed',
        source: 'waitlist_urgence',
        urgence_slot_id: claimed.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (rdvErr) {
      console.error('[waitlist] appointment creation error:', rdvErr);
      // Rollback le claim
      await admin()
        .from('dentiste_pro_urgence_slots')
        .update({ claimed_by: null, status: 'open', claimed_at: null })
        .eq('id', slotId);
      throw rdvErr;
    }

    // 3. Mettre a jour le statut waitlist du patient
    await admin()
      .from('dentiste_pro_waitlist')
      .update({ status: 'booked', updated_at: new Date().toISOString() })
      .eq('patient_id', patient_id)
      .eq('cabinet_id', claimed.cabinet_id)
      .eq('status', 'waiting');

    // 4. Notifier les autres patients que le creneau est pris
    const otherPatientIds = (claimed.notified_patient_ids || []).filter(id => id !== patient_id);
    if (otherPatientIds.length > 0) {
      const { data: otherPatients } = await admin()
        .from('dentiste_pro_patients')
        .select('id, push_subscription')
        .in('id', otherPatientIds);

      for (const other of (otherPatients || [])) {
        if (other.push_subscription) {
          await sendPushNotification(other.push_subscription, {
            title: 'Creneau pris',
            body: 'Desole, ce creneau a ete pris par un autre patient.',
            data: { type: 'slot_taken', slot_id: slotId }
          });
        }
      }
    }

    // 5. Loguer l'evenement
    await admin()
      .from('dentiste_pro_events')
      .insert({
        cabinet_id: claimed.cabinet_id,
        event_type: 'urgence_slot_claimed',
        event_category: 'urgence',
        source: 'system',
        metadata: { slot_id: slotId, patient_id, appointment_id: rdv.id },
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      appointment: rdv,
      message: 'Creneau confirme ! Votre rendez-vous est reserve.'
    });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/claim:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /waitlist/urgence-history — Historique des creneaux urgence
// =========================================================
router.get('/urgence-history', requireCabinet(), requirePermission('waitlist'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await admin()
      .from('dentiste_pro_urgence_slots')
      .select('*, claimer:dentiste_pro_patients!claimed_by(id, nom, prenom, telephone)', { count: 'exact' })
      .eq('cabinet_id', cabinetId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Stats recapitulatives
    const total = count || 0;
    const claimed = (data || []).filter(s => s.status === 'claimed').length;
    const expired = (data || []).filter(s => s.status === 'expired').length;

    res.json({
      success: true,
      slots: data || [],
      total,
      stats: {
        total_slots: total,
        claimed,
        expired,
        recovery_rate: total > 0 ? Math.round((claimed / total) * 100) : 0
      }
    });
  } catch (err) {
    console.error('[dentiste-pro] waitlist/urgence-history:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
