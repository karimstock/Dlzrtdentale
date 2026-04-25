// =============================================
// JADOMI — Dentiste Pro : Dashboard Morning Huddle
// Stats, pipeline, rappels du jour, programme
// Fonctionne pour toutes professions de sante
// =============================================
const express = require('express');
const { admin, requireCabinet, requirePermission, formatDateFR } = require('./shared');

const router = express.Router();

// ===== Helpers =====

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function periodDates(period) {
  const now = new Date();
  const end = todayISO();
  let start;

  switch (period) {
    case 'week':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
    case 'quarter':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
    case 'month':
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
  }

  return { start, end };
}

// =========================================================
// GET /dashboard/today — Programme du jour
// =========================================================
router.get('/today', requireCabinet(), requirePermission('agenda'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const today = todayISO();

    // 1. RDV du jour avec infos patient
    const { data: appointments, error: rdvErr } = await admin()
      .from('appointments')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email), type:appointment_types(id, nom, duree_minutes, couleur)')
      .eq('cabinet_id', cabinetId)
      .eq('date', today)
      .order('start_time', { ascending: true });

    if (rdvErr) throw rdvErr;

    // 2. Enrichir avec progression de serie et messages
    const enriched = [];
    for (const rdv of (appointments || [])) {
      const entry = { ...rdv };

      // Progression serie (si le RDV fait partie d'une serie)
      if (rdv.series_id) {
        const { data: seriesRdvs } = await admin()
          .from('appointments')
          .select('id, status')
          .eq('series_id', rdv.series_id);

        if (seriesRdvs) {
          const total = seriesRdvs.length;
          const completed = seriesRdvs.filter(s => s.status === 'completed').length;
          entry.series_progress = { completed, total, label: `${completed}/${total}` };
        }
      }

      // Dernier message chat et messages non lus
      if (rdv.patient_id) {
        const { data: lastMsg } = await admin()
          .from('dentiste_pro_messages')
          .select('id, content, created_at, sender_type')
          .eq('cabinet_id', cabinetId)
          .eq('patient_id', rdv.patient_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsg) {
          entry.last_message = {
            preview: lastMsg.content?.substring(0, 80) + (lastMsg.content?.length > 80 ? '...' : ''),
            sender_type: lastMsg.sender_type,
            time: lastMsg.created_at
          };
        }

        const { count: unreadCount } = await admin()
          .from('dentiste_pro_messages')
          .select('id', { count: 'exact', head: true })
          .eq('cabinet_id', cabinetId)
          .eq('patient_id', rdv.patient_id)
          .eq('sender_type', 'patient')
          .is('read_at', null);

        entry.unread_messages = unreadCount || 0;
      }

      enriched.push(entry);
    }

    res.json({
      success: true,
      date: today,
      date_fr: formatDateFR(today),
      total: enriched.length,
      appointments: enriched
    });
  } catch (err) {
    console.error('[dentiste-pro] dashboard/today:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /dashboard/stats — Metriques cles
// Query: ?period=week|month|quarter
// =========================================================
router.get('/stats', requireCabinet(), requirePermission('statistiques'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const period = req.query.period || 'month';
    const { start, end } = periodDates(period);

    // 1. Stats rendez-vous
    const { data: rdvs, error: rdvErr } = await admin()
      .from('appointments')
      .select('id, status')
      .eq('cabinet_id', cabinetId)
      .gte('date', start)
      .lte('date', end);

    if (rdvErr) throw rdvErr;

    const rdvStats = {
      total: (rdvs || []).length,
      booked: (rdvs || []).filter(r => r.status === 'confirmed' || r.status === 'booked').length,
      completed: (rdvs || []).filter(r => r.status === 'completed').length,
      cancelled: (rdvs || []).filter(r => r.status === 'cancelled').length,
      no_show: (rdvs || []).filter(r => r.status === 'no_show').length
    };

    // 2. Stats waitlist
    const { data: waitlistData } = await admin()
      .from('dentiste_pro_waitlist')
      .select('id, status, wait_since, updated_at')
      .eq('cabinet_id', cabinetId)
      .gte('created_at', start + 'T00:00:00');

    const waitlistEntries = (waitlistData || []).length;
    const waitlistPlaced = (waitlistData || []).filter(w => w.status === 'booked').length;
    const waitlistWaitTimes = (waitlistData || [])
      .filter(w => w.status === 'booked' && w.wait_since && w.updated_at)
      .map(w => {
        const wait = new Date(w.updated_at) - new Date(w.wait_since);
        return Math.round(wait / (1000 * 60 * 60 * 24));
      });
    const avgWaitDays = waitlistWaitTimes.length > 0
      ? Math.round(waitlistWaitTimes.reduce((a, b) => a + b, 0) / waitlistWaitTimes.length)
      : 0;

    // 3. Stats urgence
    const { data: urgenceData } = await admin()
      .from('dentiste_pro_urgence_slots')
      .select('id, status, created_at, claimed_at')
      .eq('cabinet_id', cabinetId)
      .gte('created_at', start + 'T00:00:00');

    const urgenceTotal = (urgenceData || []).length;
    const urgenceRecovered = (urgenceData || []).filter(u => u.status === 'claimed').length;
    const reactionTimes = (urgenceData || [])
      .filter(u => u.status === 'claimed' && u.created_at && u.claimed_at)
      .map(u => {
        return Math.round((new Date(u.claimed_at) - new Date(u.created_at)) / (1000 * 60));
      });
    const avgReactionMin = reactionTimes.length > 0
      ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
      : 0;

    // 4. Stats chat
    const { count: chatMessages } = await admin()
      .from('dentiste_pro_messages')
      .select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId)
      .gte('created_at', start + 'T00:00:00');

    // Escalations IA
    const { count: iaEscalations } = await admin()
      .from('dentiste_pro_events')
      .select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId)
      .eq('event_type', 'ia_escalation')
      .gte('created_at', start + 'T00:00:00');

    res.json({
      success: true,
      period,
      date_range: { start, end },
      rdv: rdvStats,
      waitlist: {
        entries: waitlistEntries,
        placements: waitlistPlaced,
        avg_wait_days: avgWaitDays
      },
      urgence: {
        slots_total: urgenceTotal,
        slots_recovered: urgenceRecovered,
        recovery_rate: urgenceTotal > 0 ? Math.round((urgenceRecovered / urgenceTotal) * 100) : 0,
        avg_reaction_minutes: avgReactionMin
      },
      chat: {
        messages_sent: chatMessages || 0,
        ia_escalations: iaEscalations || 0
      }
    });
  } catch (err) {
    console.error('[dentiste-pro] dashboard/stats:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /dashboard/pipeline — Traitements non programmes
// Series avec seances restantes a planifier
// =========================================================
router.get('/pipeline', requireCabinet(), requirePermission('statistiques'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    // Recuperer les series actives
    const { data: series, error: serErr } = await admin()
      .from('dentiste_pro_series')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email)')
      .eq('cabinet_id', cabinetId)
      .eq('statut', 'active');

    if (serErr) throw serErr;

    // Filtrer les series avec des seances restantes
    const pipeline = [];
    for (const s of (series || [])) {
      const nbBooked = s.nb_rdv_booked || 0;
      const nbTotal = s.nb_rdv_total || 0;
      const remaining = nbTotal - nbBooked;

      if (remaining > 0) {
        pipeline.push({
          series_id: s.id,
          patient: s.patient,
          type: s.type || s.nom,
          nb_total: nbTotal,
          nb_booked: nbBooked,
          nb_remaining: remaining,
          progress_pct: nbTotal > 0 ? Math.round((nbBooked / nbTotal) * 100) : 0,
          last_rdv_date: s.last_rdv_date || null,
          created_at: s.created_at
        });
      }
    }

    // Trier par nombre de seances restantes (plus urgent en premier)
    pipeline.sort((a, b) => b.nb_remaining - a.nb_remaining);

    res.json({
      success: true,
      pipeline,
      total: pipeline.length,
      total_remaining_appointments: pipeline.reduce((sum, p) => sum + p.nb_remaining, 0)
    });
  } catch (err) {
    console.error('[dentiste-pro] dashboard/pipeline:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /dashboard/rappels-today — Rappels du jour
// =========================================================
router.get('/rappels-today', requireCabinet(), requirePermission('rappels'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const today = todayISO();
    const tomorrow = new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: rappels, error } = await admin()
      .from('dentiste_pro_rappels')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone), appointment:appointments(id, date, start_time)')
      .eq('cabinet_id', cabinetId)
      .gte('scheduled_at', today + 'T00:00:00')
      .lt('scheduled_at', tomorrow + 'T00:00:00')
      .order('scheduled_at', { ascending: true });

    if (error) throw error;

    const all = rappels || [];
    const sent = all.filter(r => r.status === 'sent');
    const confirmed = all.filter(r => r.status === 'confirmed');
    const pending = all.filter(r => r.status === 'pending');
    const failed = all.filter(r => r.status === 'failed');
    const noResponse = sent.filter(r => r.status === 'sent' && !r.confirmed_at);

    res.json({
      success: true,
      date: today,
      total: all.length,
      summary: {
        sent: sent.length,
        confirmed: confirmed.length,
        pending: pending.length,
        failed: failed.length,
        no_response: noResponse.length
      },
      rappels: all
    });
  } catch (err) {
    console.error('[dentiste-pro] dashboard/rappels-today:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
