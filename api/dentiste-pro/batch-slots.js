// =============================================
// JADOMI — Dentiste Pro : Smart Batch Slot-Finder
// Recherche de creneaux recurrents en un clic
// Compatible toutes professions de sante
// =============================================
const express = require('express');
const router = express.Router();
const { admin, requireCabinet, requirePatient, requirePermission, toMinutes, fromMinutes } = require('./shared');

// =============================================
// HELPERS
// =============================================

/**
 * Parse une date "YYYY-MM-DD" en objet Date local (sans decalage UTC).
 */
function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Formate un objet Date en "YYYY-MM-DD".
 */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Ajoute N jours a une date.
 */
function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/**
 * Retourne le jour de la semaine (0=dimanche..6=samedi).
 */
function getDayOfWeek(dateStr) {
  return parseDate(dateStr).getDay();
}

/**
 * Genere les N dates cibles a partir d'une date de depart et d'une frequence.
 *
 * Si preferred_days est fourni, ajuste chaque date cible vers le jour
 * prefere le plus proche (dans la meme semaine). Cela permet de viser
 * par exemple "chaque mardi" meme si start_from_date est un jeudi.
 *
 * @param {string} startDate - Date de depart YYYY-MM-DD
 * @param {number} frequencyDays - Intervalle entre RDV (7, 14, etc.)
 * @param {number} count - Nombre de RDV souhaites
 * @param {number[]} preferredDays - Jours preferes (0=dim..6=sam), optionnel
 * @returns {string[]} Tableau de dates YYYY-MM-DD
 */
function generateTargetDates(startDate, frequencyDays, count, preferredDays) {
  const dates = [];

  for (let i = 0; i < count; i++) {
    // Date brute : startDate + i * frequencyDays
    const rawDate = addDays(startDate, i * frequencyDays);

    if (preferredDays && preferredDays.length > 0) {
      // Ajuster vers le jour prefere le plus proche
      const rawDay = getDayOfWeek(rawDate);
      let bestOffset = Infinity;

      for (const pref of preferredDays) {
        // Distance signee dans la semaine (-3 a +3)
        let offset = pref - rawDay;
        if (offset > 3) offset -= 7;
        if (offset < -3) offset += 7;
        if (Math.abs(offset) < Math.abs(bestOffset)) {
          bestOffset = offset;
        }
      }

      dates.push(addDays(rawDate, bestOffset));
    } else {
      dates.push(rawDate);
    }
  }

  return dates;
}

/**
 * A partir d'un tableau de RDV existants (avec start_time/end_time),
 * calcule les intervalles libres dans une fenetre horaire donnee.
 *
 * @param {Array} existingAppts - [{start_time: "HH:MM", end_time: "HH:MM"}, ...]
 * @param {string} windowStart - Debut de la fenetre "HH:MM"
 * @param {string} windowEnd - Fin de la fenetre "HH:MM"
 * @returns {Array} [{start: minutes, end: minutes}, ...] intervalles libres
 */
function computeFreeIntervals(existingAppts, windowStart, windowEnd) {
  const wStart = toMinutes(windowStart);
  const wEnd = toMinutes(windowEnd);

  if (wStart >= wEnd) return [];

  // Trier les RDV par heure de debut
  const booked = existingAppts
    .map(a => ({ start: toMinutes(a.start_time), end: toMinutes(a.end_time) }))
    .filter(b => b.end > wStart && b.start < wEnd) // Garder uniquement ceux dans la fenetre
    .sort((a, b) => a.start - b.start);

  const freeIntervals = [];
  let cursor = wStart;

  for (const b of booked) {
    if (cursor < b.start) {
      freeIntervals.push({ start: cursor, end: Math.min(b.start, wEnd) });
    }
    cursor = Math.max(cursor, b.end);
  }

  // Intervalle restant apres le dernier RDV
  if (cursor < wEnd) {
    freeIntervals.push({ start: cursor, end: wEnd });
  }

  return freeIntervals;
}

/**
 * Cherche le premier bloc libre >= durationMinutes dans les intervalles libres.
 *
 * @param {Array} freeIntervals - [{start, end}, ...] en minutes
 * @param {number} durationMinutes - Duree requise
 * @returns {{start: string, end: string}|null} Creneau trouve ou null
 */
function findFirstFreeBlock(freeIntervals, durationMinutes) {
  for (const interval of freeIntervals) {
    if (interval.end - interval.start >= durationMinutes) {
      return {
        start: fromMinutes(interval.start),
        end: fromMinutes(interval.start + durationMinutes)
      };
    }
  }
  return null;
}

/**
 * Cherche des creneaux alternatifs dans les jours voisins (tolerance).
 *
 * @param {string} targetDate - Date cible YYYY-MM-DD
 * @param {number} toleranceDays - Nombre de jours +/- a explorer
 * @param {string} windowStart - "HH:MM"
 * @param {string} windowEnd - "HH:MM"
 * @param {number} durationMinutes
 * @param {Map} apptsByDate - Map date -> [{start_time, end_time}]
 * @returns {Array} [{date, start, end}, ...] alternatives trouvees
 */
function findAlternatives(targetDate, toleranceDays, windowStart, windowEnd, durationMinutes, apptsByDate) {
  const alternatives = [];

  for (let offset = -toleranceDays; offset <= toleranceDays; offset++) {
    if (offset === 0) continue; // La date cible a deja ete testee

    const altDate = addDays(targetDate, offset);
    const dayAppts = apptsByDate.get(altDate) || [];
    const freeIntervals = computeFreeIntervals(dayAppts, windowStart, windowEnd);
    const block = findFirstFreeBlock(freeIntervals, durationMinutes);

    if (block) {
      alternatives.push({
        date: altDate,
        start: block.start,
        end: block.end,
        offset_days: offset
      });
    }
  }

  // Trier par proximite avec la date cible
  alternatives.sort((a, b) => Math.abs(a.offset_days) - Math.abs(b.offset_days));

  return alternatives;
}

/**
 * Resout le(s) site_id associe(s) a une societe.
 * La table appointments utilise site_id (vitrines_sites),
 * pas societe_id directement.
 */
async function getSiteIdsForSociete(societeId) {
  const { data, error } = await admin()
    .from('vitrines_sites')
    .select('id')
    .eq('societe_id', societeId);

  if (error) throw error;
  return (data || []).map(s => s.id);
}

/**
 * Algorithme principal : trouve N creneaux recurrents en un seul appel.
 *
 * OPTIMISATION CLE : une seule requete Supabase pour recuperer tous les
 * RDV de la plage de dates etendue (dates cibles +/- tolerance), puis
 * filtrage en memoire.
 */
async function findBatchSlots({
  cabinet_id,
  societe_id,
  nb_rdv,
  frequency_days,
  time_window_start,
  time_window_end,
  duration_minutes,
  preferred_days,
  praticien_id,
  start_from_date,
  tolerance_days = 2
}) {
  // 0. Resoudre les site_ids lies a cette societe
  const siteIds = await getSiteIdsForSociete(societe_id);

  // 1. Generer les dates cibles
  const targetDates = generateTargetDates(
    start_from_date,
    frequency_days,
    nb_rdv,
    preferred_days
  );

  // 2. Calculer la plage de dates elargie (avec tolerance)
  const allDates = [];
  for (const td of targetDates) {
    for (let offset = -tolerance_days; offset <= tolerance_days; offset++) {
      allDates.push(addDays(td, offset));
    }
  }
  const sortedDates = [...new Set(allDates)].sort();
  const rangeStart = sortedDates[0];
  const rangeEnd = sortedDates[sortedDates.length - 1];

  // 3. UNE SEULE requete : tous les RDV de la plage
  //    La table appointments utilise site_id, pas societe_id
  let query = admin()
    .from('appointments')
    .select('date, start_time, end_time')
    .gte('date', rangeStart)
    .lte('date', rangeEnd)
    .in('status', ['confirmed', 'pending']);

  if (siteIds.length > 0) {
    query = query.in('site_id', siteIds);
  } else {
    // Aucun site associe : pas de conflits possibles
    // On retourne tout comme disponible
  }

  const { data: allAppts, error } = await query;
  if (error) throw error;

  // 4. Indexer les RDV par date (Map pour acces O(1))
  const apptsByDate = new Map();
  for (const appt of (allAppts || [])) {
    if (!apptsByDate.has(appt.date)) {
      apptsByDate.set(appt.date, []);
    }
    apptsByDate.get(appt.date).push(appt);
  }

  // 5. Pour chaque date cible, chercher un creneau
  const results = [];
  let available = 0;
  let conflicts = 0;
  let unavailable = 0;

  for (let i = 0; i < targetDates.length; i++) {
    const targetDate = targetDates[i];
    const dayAppts = apptsByDate.get(targetDate) || [];
    const freeIntervals = computeFreeIntervals(dayAppts, time_window_start, time_window_end);
    const block = findFirstFreeBlock(freeIntervals, duration_minutes);

    if (block) {
      // Creneau trouve sur la date cible
      results.push({
        week: i + 1,
        target_date: targetDate,
        status: 'available',
        slot: { start: block.start, end: block.end },
        alternatives: []
      });
      available++;
    } else {
      // Chercher des alternatives dans les jours voisins
      const alts = findAlternatives(
        targetDate,
        tolerance_days,
        time_window_start,
        time_window_end,
        duration_minutes,
        apptsByDate
      );

      if (alts.length > 0) {
        results.push({
          week: i + 1,
          target_date: targetDate,
          status: 'conflict',
          slot: null,
          alternatives: alts
        });
        conflicts++;
      } else {
        results.push({
          week: i + 1,
          target_date: targetDate,
          status: 'unavailable',
          slot: null,
          alternatives: []
        });
        unavailable++;
      }
    }
  }

  return {
    slots: results,
    summary: { available, conflicts, unavailable, total: nb_rdv }
  };
}


// =============================================
// ENDPOINTS
// =============================================

// --- 1. POST /find --- Recherche de creneaux recurrents ---
router.post('/find', requireCabinet(), requirePermission('agenda'), async (req, res) => {
  try {
    const {
      nb_rdv,
      frequency_days,
      time_window_start,
      time_window_end,
      duration_minutes,
      preferred_days,
      praticien_id,
      start_from_date,
      tolerance_days
    } = req.body;

    // Validations
    if (!nb_rdv || nb_rdv < 1 || nb_rdv > 52) {
      return res.status(400).json({ error: 'nb_rdv requis (1-52)' });
    }
    if (!frequency_days || frequency_days < 1) {
      return res.status(400).json({ error: 'frequency_days requis (>= 1)' });
    }
    if (!time_window_start || !time_window_end) {
      return res.status(400).json({ error: 'time_window_start et time_window_end requis (HH:MM)' });
    }
    if (!duration_minutes || duration_minutes < 5) {
      return res.status(400).json({ error: 'duration_minutes requis (>= 5)' });
    }
    if (!start_from_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_from_date)) {
      return res.status(400).json({ error: 'start_from_date requis (YYYY-MM-DD)' });
    }

    // Verifier que la fenetre horaire est coherente
    if (toMinutes(time_window_end) - toMinutes(time_window_start) < duration_minutes) {
      return res.status(400).json({ error: 'La fenetre horaire est trop courte pour la duree demandee' });
    }

    const result = await findBatchSlots({
      cabinet_id: req.cabinet?.id,
      societe_id: req.societe.id,
      nb_rdv: parseInt(nb_rdv),
      frequency_days: parseInt(frequency_days),
      time_window_start,
      time_window_end,
      duration_minutes: parseInt(duration_minutes),
      preferred_days: preferred_days || null,
      praticien_id: praticien_id || null,
      start_from_date,
      tolerance_days: parseInt(tolerance_days) || 2
    });

    res.json(result);
  } catch (err) {
    console.error('[batch-slots] POST /find', err.message);
    res.status(500).json({ error: 'Erreur recherche creneaux' });
  }
});


// --- 2. POST /book-all --- Reservation atomique de la serie ---
router.post('/book-all', requireCabinet(), requirePermission('series'), async (req, res) => {
  try {
    const {
      series_label,
      patient_id,
      slots,
      appointment_type_id,
      praticien_id,
      notes
    } = req.body;

    // Validations
    if (!patient_id) {
      return res.status(400).json({ error: 'patient_id requis' });
    }
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'slots requis (tableau non vide)' });
    }
    if (!appointment_type_id) {
      return res.status(400).json({ error: 'appointment_type_id requis' });
    }

    const societeId = req.societe.id;
    const cabinetId = req.cabinet?.id;

    // Resoudre les site_ids (appointments utilise site_id, pas societe_id)
    const siteIds = await getSiteIdsForSociete(societeId);
    const primarySiteId = siteIds[0] || null;

    // Verifier les conflits avant de reserver (double-booking prevention)
    for (const slot of slots) {
      if (!slot.date || !slot.start_time || !slot.end_time) {
        return res.status(400).json({ error: 'Chaque slot doit avoir date, start_time, end_time' });
      }

      if (siteIds.length > 0) {
        const { data: conflict } = await admin()
          .from('appointments')
          .select('id')
          .in('site_id', siteIds)
          .eq('date', slot.date)
          .in('status', ['confirmed', 'pending'])
          .lt('start_time', slot.end_time)
          .gt('end_time', slot.start_time)
          .limit(1);

        if (conflict && conflict.length > 0) {
          return res.status(409).json({
            error: 'Conflit de creneau',
            conflict_date: slot.date,
            conflict_time: `${slot.start_time}-${slot.end_time}`
          });
        }
      }
    }

    // Creer la serie (colonnes SQL : titre, statut, nb_rdv_total, etc.)
    const durationMin = toMinutes(slots[0].end_time) - toMinutes(slots[0].start_time);
    const { data: series, error: seriesErr } = await admin()
      .from('dentiste_pro_series')
      .insert({
        cabinet_id: cabinetId,
        patient_id,
        titre: series_label || 'Serie de rendez-vous',
        motif: notes || null,
        nb_rdv_total: slots.length,
        nb_rdv_booked: slots.length,
        frequency_days: req.body.frequency_days || 7,
        time_window_start: slots[0].start_time,
        time_window_end: slots[slots.length - 1].end_time,
        duration_min: durationMin,
        statut: 'active',
        notes: notes || null
      })
      .select()
      .single();

    if (seriesErr) throw seriesErr;

    // Creer les RDV et les slots de serie
    const bookedAppointments = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      // Inserer le RDV dans la table appointments (systeme existant, utilise site_id)
      const { data: appt, error: apptErr } = await admin()
        .from('appointments')
        .insert({
          site_id: primarySiteId,
          appointment_type_id: appointment_type_id || null,
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          client_name: slot.client_name || 'Patient',
          client_email: slot.client_email || 'noreply@jadomi.fr',
          client_phone: slot.client_phone || null,
          status: 'confirmed',
          notes: `[Serie: ${series.id}] ${notes || ''}`.trim()
        })
        .select()
        .single();

      if (apptErr) {
        // Rollback : annuler les RDV deja crees
        console.error('[batch-slots] Erreur creation RDV, rollback...', apptErr.message);
        for (const booked of bookedAppointments) {
          await admin()
            .from('appointments')
            .update({ status: 'cancelled' })
            .eq('id', booked.id);
        }
        await admin()
          .from('dentiste_pro_series')
          .update({ statut: 'cancelled' })
          .eq('id', series.id);

        throw apptErr;
      }

      // Lier le RDV a la serie (colonnes SQL : serie_id, slot_order, target_date, statut)
      const { error: slotErr } = await admin()
        .from('dentiste_pro_series_slots')
        .insert({
          serie_id: series.id,
          appointment_id: appt.id,
          slot_order: i + 1,
          target_date: slot.date,
          target_time: slot.start_time,
          statut: 'confirmed'
        });

      if (slotErr) {
        console.error('[batch-slots] Erreur creation series_slot:', slotErr.message);
      }

      // Creer les rappels automatiques (j-7, j-3, j-1, h-2)
      // Schema SQL : rappel_type, channel, statut, serie_id
      const rappelsDef = [
        { rappel_type: 'j7', offset_hours: 7 * 24 },
        { rappel_type: 'j3', offset_hours: 3 * 24 },
        { rappel_type: 'j1', offset_hours: 1 * 24 },
        { rappel_type: 'h2', offset_hours: 2 }
      ];

      for (const rappel of rappelsDef) {
        // Calculer la date/heure du rappel
        const apptDateTime = new Date(`${slot.date}T${slot.start_time}:00`);
        const rappelDateTime = new Date(apptDateTime.getTime() - rappel.offset_hours * 60 * 60 * 1000);

        // Ne pas creer de rappel dans le passe
        if (rappelDateTime <= new Date()) continue;

        await admin()
          .from('dentiste_pro_rappels')
          .insert({
            serie_id: series.id,
            appointment_id: appt.id,
            patient_id,
            cabinet_id: cabinetId,
            rappel_type: rappel.rappel_type,
            channel: 'push', // Canal par defaut, ajustable
            scheduled_at: rappelDateTime.toISOString(),
            statut: 'pending'
          })
          .then(({ error: rappelErr }) => {
            if (rappelErr) console.warn('[batch-slots] Rappel creation skip:', rappelErr.message);
          });
      }

      bookedAppointments.push(appt);
    }

    res.status(201).json({
      series: {
        id: series.id,
        titre: series.titre,
        statut: series.statut,
        nb_rdv_total: series.nb_rdv_total
      },
      appointments: bookedAppointments.map(a => ({
        id: a.id,
        date: a.date,
        start_time: a.start_time,
        end_time: a.end_time,
        status: a.status
      })),
      rappels_created: true
    });
  } catch (err) {
    console.error('[batch-slots] POST /book-all', err.message);
    res.status(500).json({ error: 'Erreur reservation serie' });
  }
});


// --- 3. GET /series --- Lister les series d'un patient ou cabinet ---
router.get('/series', async (req, res) => {
  try {
    const { patient_id, status } = req.query;

    // Deux modes d'acces : praticien (requireCabinet) ou patient (requirePatient)
    // On tente d'abord l'auth praticien, sinon patient
    let societeId = null;
    let patientFilter = null;

    // Essayer l'auth praticien via headers
    const authHeader = req.headers.authorization;
    const societeHeader = req.headers['x-societe-id'];

    if (societeHeader && authHeader) {
      // Mode praticien : lister toutes les series du cabinet
      // L'auth est geree par le middleware monte en amont
      societeId = societeHeader;
      patientFilter = patient_id || null; // Optionnel : filtrer par patient
    } else if (req.patient) {
      // Mode patient (JWT patient)
      patientFilter = req.patient.id;
    } else {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    let query = admin()
      .from('dentiste_pro_series')
      .select(`
        id, titre, statut, nb_rdv_total, nb_rdv_booked, frequency_days,
        duration_min, created_at, patient_id, cabinet_id, notes, motif
      `)
      .order('created_at', { ascending: false });

    if (patientFilter) query = query.eq('patient_id', patientFilter);
    if (status) query = query.eq('statut', status);

    // Filtrer par cabinet si on a le societe_id (via le cabinet lie)
    if (societeId && req.cabinet?.id) {
      query = query.eq('cabinet_id', req.cabinet.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ series: data || [] });
  } catch (err) {
    console.error('[batch-slots] GET /series', err.message);
    res.status(500).json({ error: 'Erreur liste series' });
  }
});


// --- 4. GET /series/:id --- Detail d'une serie avec tous ses slots ---
router.get('/series/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Charger la serie
    const { data: series, error: sErr } = await admin()
      .from('dentiste_pro_series')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!series) return res.status(404).json({ error: 'Serie introuvable' });

    // Charger les slots lies (colonnes SQL : serie_id, slot_order, target_date, statut)
    const { data: seriesSlots, error: ssErr } = await admin()
      .from('dentiste_pro_series_slots')
      .select(`
        id, slot_order, target_date, target_time, statut,
        appointment_id, alternatives
      `)
      .eq('serie_id', id)
      .order('slot_order');

    if (ssErr) throw ssErr;

    // Charger les RDV lies
    const appointmentIds = (seriesSlots || [])
      .map(s => s.appointment_id)
      .filter(Boolean);

    let appointments = [];
    if (appointmentIds.length > 0) {
      const { data: appts, error: aErr } = await admin()
        .from('appointments')
        .select('id, date, start_time, end_time, status, notes')
        .in('id', appointmentIds);

      if (aErr) throw aErr;
      appointments = appts || [];
    }

    // Indexer les RDV par ID
    const apptMap = new Map(appointments.map(a => [a.id, a]));

    // Combiner slots + RDV
    const enrichedSlots = (seriesSlots || []).map(slot => ({
      ...slot,
      appointment: apptMap.get(slot.appointment_id) || null
    }));

    // Charger les rappels (colonnes SQL : rappel_type, statut, serie_id)
    const { data: rappels } = await admin()
      .from('dentiste_pro_rappels')
      .select('id, rappel_type, channel, scheduled_at, statut, appointment_id, sent_at')
      .eq('serie_id', id)
      .order('scheduled_at');

    res.json({
      series,
      slots: enrichedSlots,
      rappels: rappels || []
    });
  } catch (err) {
    console.error('[batch-slots] GET /series/:id', err.message);
    res.status(500).json({ error: 'Erreur detail serie' });
  }
});


// --- 5. PUT /series/:seriesId/slots/:slotId/reschedule ---
// Replanifier un seul creneau d'une serie
router.put('/series/:seriesId/slots/:slotId/reschedule', requireCabinet(), requirePermission('series'), async (req, res) => {
  try {
    const { seriesId, slotId } = req.params;
    const { new_date, new_start_time, new_end_time } = req.body;

    if (!new_date || !new_start_time) {
      return res.status(400).json({ error: 'new_date et new_start_time requis' });
    }

    // Charger le slot de serie (colonne SQL : serie_id)
    const { data: seriesSlot, error: ssErr } = await admin()
      .from('dentiste_pro_series_slots')
      .select('*, dentiste_pro_series(cabinet_id, dentiste_pro_cabinets(societe_id))')
      .eq('id', slotId)
      .eq('serie_id', seriesId)
      .maybeSingle();

    if (ssErr) throw ssErr;
    if (!seriesSlot) return res.status(404).json({ error: 'Slot introuvable' });

    const societeId = seriesSlot.dentiste_pro_series?.dentiste_pro_cabinets?.societe_id || req.societe.id;

    // Charger le RDV existant pour obtenir la duree
    const { data: oldAppt } = await admin()
      .from('appointments')
      .select('*')
      .eq('id', seriesSlot.appointment_id)
      .maybeSingle();

    if (!oldAppt) return res.status(404).json({ error: 'Rendez-vous original introuvable' });

    // Calculer l'heure de fin
    const duration = toMinutes(oldAppt.end_time) - toMinutes(oldAppt.start_time);
    const endTime = new_end_time || fromMinutes(toMinutes(new_start_time) + duration);

    // Verifier les conflits sur le nouveau creneau
    const siteIds = await getSiteIdsForSociete(societeId);
    let conflict = [];
    if (siteIds.length > 0) {
      const { data: conflictData } = await admin()
        .from('appointments')
        .select('id')
        .in('site_id', siteIds)
        .eq('date', new_date)
        .in('status', ['confirmed', 'pending'])
        .neq('id', oldAppt.id)
        .lt('start_time', endTime)
        .gt('end_time', new_start_time)
        .limit(1);
      conflict = conflictData || [];
    }

    if (conflict && conflict.length > 0) {
      return res.status(409).json({ error: 'Conflit sur le nouveau creneau' });
    }

    // Mettre a jour le RDV
    const { data: updatedAppt, error: updErr } = await admin()
      .from('appointments')
      .update({
        date: new_date,
        start_time: new_start_time,
        end_time: endTime
      })
      .eq('id', oldAppt.id)
      .select()
      .single();

    if (updErr) throw updErr;

    // Mettre a jour le slot de serie (colonne SQL : statut)
    await admin()
      .from('dentiste_pro_series_slots')
      .update({ statut: 'rescheduled' })
      .eq('id', slotId);

    // Mettre a jour les rappels existants (colonnes SQL : rappel_type, statut)
    const { data: existingRappels } = await admin()
      .from('dentiste_pro_rappels')
      .select('id, rappel_type')
      .eq('appointment_id', oldAppt.id)
      .eq('statut', 'pending');

    if (existingRappels && existingRappels.length > 0) {
      const offsets = { j7: 7 * 24, j3: 3 * 24, j1: 1 * 24, h2: 2 };

      for (const rappel of existingRappels) {
        const apptDateTime = new Date(`${new_date}T${new_start_time}:00`);
        const offsetHours = offsets[rappel.rappel_type] || 24;
        const newScheduled = new Date(apptDateTime.getTime() - offsetHours * 60 * 60 * 1000);

        if (newScheduled > new Date()) {
          await admin()
            .from('dentiste_pro_rappels')
            .update({ scheduled_at: newScheduled.toISOString() })
            .eq('id', rappel.id);
        } else {
          // Rappel dans le passe : marquer comme annule
          await admin()
            .from('dentiste_pro_rappels')
            .update({ statut: 'cancelled' })
            .eq('id', rappel.id);
        }
      }
    }

    res.json({
      message: 'Creneau replanifie avec succes',
      slot: {
        id: slotId,
        old_date: oldAppt.date,
        old_time: `${oldAppt.start_time}-${oldAppt.end_time}`,
        new_date: updatedAppt.date,
        new_time: `${updatedAppt.start_time}-${updatedAppt.end_time}`
      }
    });
  } catch (err) {
    console.error('[batch-slots] PUT reschedule', err.message);
    res.status(500).json({ error: 'Erreur replanification' });
  }
});


// --- 6. DELETE /series/:id --- Annuler toute la serie ---
router.delete('/series/:id', requireCabinet(), requirePermission('series'), async (req, res) => {
  try {
    const { id } = req.params;
    const today = new Date().toISOString().split('T')[0];

    // Charger la serie (colonne SQL : statut)
    const { data: series, error: sErr } = await admin()
      .from('dentiste_pro_series')
      .select('id, cabinet_id, statut')
      .eq('id', id)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!series) return res.status(404).json({ error: 'Serie introuvable' });

    if (series.statut === 'cancelled') {
      return res.status(400).json({ error: 'Serie deja annulee' });
    }

    // Charger les slots de la serie (colonne SQL : serie_id)
    const { data: seriesSlots } = await admin()
      .from('dentiste_pro_series_slots')
      .select('id, appointment_id')
      .eq('serie_id', id);

    const appointmentIds = (seriesSlots || [])
      .map(s => s.appointment_id)
      .filter(Boolean);

    // Annuler uniquement les RDV FUTURS
    let cancelledCount = 0;
    let keptCount = 0;

    if (appointmentIds.length > 0) {
      // Annuler les futurs
      const { data: cancelled } = await admin()
        .from('appointments')
        .update({ status: 'cancelled' })
        .in('id', appointmentIds)
        .gte('date', today)
        .in('status', ['confirmed', 'pending'])
        .select('id');

      cancelledCount = cancelled?.length || 0;

      // Compter les passes (deja effectues)
      const { count } = await admin()
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .in('id', appointmentIds)
        .lt('date', today);

      keptCount = count || 0;
    }

    // Annuler les rappels en attente (colonnes SQL : statut, serie_id)
    await admin()
      .from('dentiste_pro_rappels')
      .update({ statut: 'cancelled' })
      .eq('serie_id', id)
      .eq('statut', 'pending');

    // Mettre a jour le statut de la serie
    await admin()
      .from('dentiste_pro_series')
      .update({ statut: 'cancelled' })
      .eq('id', id);

    // Mettre a jour les slots de serie
    if (appointmentIds.length > 0) {
      await admin()
        .from('dentiste_pro_series_slots')
        .update({ statut: 'cancelled' })
        .eq('serie_id', id)
        .in('statut', ['confirmed', 'rescheduled']);
    }

    res.json({
      message: 'Serie annulee avec succes',
      cancelled_appointments: cancelledCount,
      past_appointments_kept: keptCount
    });
  } catch (err) {
    console.error('[batch-slots] DELETE /series/:id', err.message);
    res.status(500).json({ error: 'Erreur annulation serie' });
  }
});


module.exports = router;
