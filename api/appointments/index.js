// =============================================
// JADOMI — Module Appointments (Prise de rendez-vous)
// Routes /api/appointments/*
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const { authSupabase, requireSociete } = require('../multiSocietes/middleware');

// --- Supabase admin client (lazy) ---
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

// --- Nodemailer transporter (lazy) ---
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

// --- Helpers ---

/** Day-of-week index (0=dimanche, 1=lundi, ..., 6=samedi) */
function getDayOfWeek(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay();
}

/** Parse "HH:MM" to minutes since midnight */
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight to "HH:MM" */
function fromMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format date for display: "Jeudi 22 avril 2026" */
function formatDateFR(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

/** Generate ICS content for an appointment */
function generateICS(appointment) {
  const dtStart = appointment.date.replace(/-/g, '') + 'T' + appointment.start_time.replace(/:/g, '') + '00';
  const dtEnd = appointment.date.replace(/-/g, '') + 'T' + appointment.end_time.replace(/:/g, '') + '00';
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${appointment.id}@jadomi.fr`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JADOMI//Appointments//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${(appointment.type_name || 'Rendez-vous').replace(/,/g, '\\,')}`,
    appointment.location ? `LOCATION:${appointment.location.replace(/,/g, '\\,')}` : '',
    `DESCRIPTION:${(appointment.notes || 'Rendez-vous JADOMI').replace(/\n/g, '\\n').replace(/,/g, '\\,')}`,
    `STATUS:CONFIRMED`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
}

/** Build Google Calendar link */
function googleCalendarLink(appointment) {
  const dtStart = appointment.date.replace(/-/g, '') + 'T' + appointment.start_time.replace(/:/g, '') + '00';
  const dtEnd = appointment.date.replace(/-/g, '') + 'T' + appointment.end_time.replace(/:/g, '') + '00';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: appointment.type_name || 'Rendez-vous',
    dates: `${dtStart}/${dtEnd}`,
    details: appointment.notes || '',
    location: appointment.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Send confirmation email to client */
async function sendConfirmationEmail(appointment, siteInfo) {
  try {
    const baseUrl = process.env.BASE_URL || 'https://jadomi.fr';
    const icsUrl = `${baseUrl}/api/appointments/public/ics/${appointment.id}`;
    const gcalUrl = googleCalendarLink(appointment);
    const dateFR = formatDateFR(appointment.date);

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 600;">Confirmation de votre rendez-vous</h1>
  </div>
  <div style="background: #fff; border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; line-height: 1.6;">Bonjour <strong>${appointment.client_name}</strong>,</p>
    <p style="font-size: 15px; line-height: 1.6; color: #475569;">Votre rendez-vous a bien ete enregistre. Voici les details :</p>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; width: 140px;">Type</td>
          <td style="padding: 8px 0; font-weight: 500;">${appointment.type_name || 'Rendez-vous'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Date</td>
          <td style="padding: 8px 0; font-weight: 500;">${dateFR}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Horaire</td>
          <td style="padding: 8px 0; font-weight: 500;">${appointment.start_time} - ${appointment.end_time}</td>
        </tr>
        ${appointment.mode ? `<tr>
          <td style="padding: 8px 0; color: #64748b;">Mode</td>
          <td style="padding: 8px 0; font-weight: 500;">${appointment.mode === 'visio' ? 'Visioconference' : appointment.mode === 'phone' ? 'Telephone' : 'En cabinet'}</td>
        </tr>` : ''}
        ${appointment.location ? `<tr>
          <td style="padding: 8px 0; color: #64748b;">Lieu</td>
          <td style="padding: 8px 0; font-weight: 500;">${appointment.location}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${gcalUrl}" target="_blank" style="display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; margin: 4px;">Ajouter a Google Calendar</a>
      <a href="${icsUrl}" style="display: inline-block; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; margin: 4px;">Telecharger .ics</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8; text-align: center; margin-top: 32px;">
      ${siteInfo?.name || 'JADOMI'} &mdash; Prise de rendez-vous en ligne
    </p>
  </div>
</body>
</html>`;

    await getTransporter().sendMail({
      from: process.env.SMTP_USER,
      to: appointment.client_email,
      subject: `Confirmation de rendez-vous - ${dateFR} a ${appointment.start_time}`,
      html
    });
    console.log('[appointments] Email de confirmation envoye a', appointment.client_email);
  } catch (err) {
    console.error('[appointments] Erreur envoi email:', err.message);
    // Non-bloquant : on ne fait pas echouer la reservation
  }
}

/**
 * Compute available sub-slots for a given date, appointment type, and site.
 * Returns array of { start, end, available }
 */
async function computeAvailableSlots(siteId, date, typeId) {
  const dayOfWeek = getDayOfWeek(date);

  // 1) Fetch appointment type for duration
  const { data: apptType, error: typeErr } = await admin()
    .from('appointment_types')
    .select('id, duration_min, name')
    .eq('id', typeId)
    .eq('site_id', siteId)
    .eq('enabled', true)
    .maybeSingle();

  if (typeErr) throw typeErr;
  if (!apptType) return { slots: [], type: null };

  const duration = apptType.duration_min || 30;

  // 2) Fetch settings for buffer
  const { data: settings } = await admin()
    .from('appointment_settings')
    .select('buffer_minutes, max_daily_appointments')
    .eq('site_id', siteId)
    .maybeSingle();

  const buffer = settings?.buffer_minutes || 0;
  const maxDaily = settings?.max_daily_appointments || 0;

  // 3) Fetch recurring availability slots for this day_of_week
  const { data: recurringSlots } = await admin()
    .from('availability_slots')
    .select('id, start_time, end_time')
    .eq('site_id', siteId)
    .eq('day_of_week', dayOfWeek)
    .eq('recurring', true);

  // 4) Fetch specific_date slots for this exact date
  const { data: specificSlots } = await admin()
    .from('availability_slots')
    .select('id, start_time, end_time')
    .eq('site_id', siteId)
    .eq('specific_date', date)
    .eq('recurring', false);

  const allSlots = [...(recurringSlots || []), ...(specificSlots || [])];
  if (allSlots.length === 0) return { slots: [], type: apptType };

  // 5) Fetch existing appointments for this date (confirmed or pending)
  const { data: existingAppts } = await admin()
    .from('appointments')
    .select('start_time, end_time')
    .eq('site_id', siteId)
    .eq('date', date)
    .in('status', ['confirmed', 'pending']);

  const booked = (existingAppts || []).map(a => ({
    start: toMinutes(a.start_time),
    end: toMinutes(a.end_time)
  }));

  // 6) Check max daily limit
  if (maxDaily > 0 && booked.length >= maxDaily) {
    return { slots: [], type: apptType, maxReached: true };
  }

  // 7) Generate sub-slots
  const subSlots = [];
  const slotStep = duration + buffer;

  for (const slot of allSlots) {
    const slotStart = toMinutes(slot.start_time);
    const slotEnd = toMinutes(slot.end_time);

    for (let cursor = slotStart; cursor + duration <= slotEnd; cursor += slotStep) {
      const subStart = cursor;
      const subEnd = cursor + duration;

      // Check overlap with booked appointments
      const isBooked = booked.some(b => subStart < b.end && subEnd > b.start);

      subSlots.push({
        start: fromMinutes(subStart),
        end: fromMinutes(subEnd),
        available: !isBooked
      });
    }
  }

  // Sort by start time
  subSlots.sort((a, b) => a.start.localeCompare(b.start));

  return { slots: subSlots, type: apptType };
}


// =============================================
// PUBLIC ENDPOINTS (no auth - for website visitors)
// =============================================

// 1) GET /public/:siteId/types — List enabled appointment types
router.get('/public/:siteId/types', async (req, res) => {
  try {
    const { siteId } = req.params;

    const { data, error } = await admin()
      .from('appointment_types')
      .select('id, name, duration_min, price_eur, mode, description')
      .eq('site_id', siteId)
      .eq('enabled', true)
      .order('name');

    if (error) throw error;
    res.json({ types: data || [] });
  } catch (err) {
    console.error('[appointments] GET /public/:siteId/types', err.message);
    res.status(500).json({ error: 'erreur_types' });
  }
});

// 2) GET /public/:siteId/slots?date=YYYY-MM-DD&typeId=xxx — Available time slots
router.get('/public/:siteId/slots', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { date, typeId } = req.query;

    if (!date || !typeId) {
      return res.status(400).json({ error: 'date et typeId requis' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'format_date_invalide (YYYY-MM-DD)' });
    }

    const { slots, type, maxReached } = await computeAvailableSlots(siteId, date, typeId);

    if (!type) {
      return res.status(404).json({ error: 'type_introuvable' });
    }

    res.json({
      date,
      type: { id: type.id, name: type.name, duration_min: type.duration_min },
      max_reached: maxReached || false,
      slots
    });
  } catch (err) {
    console.error('[appointments] GET /public/:siteId/slots', err.message);
    res.status(500).json({ error: 'erreur_slots' });
  }
});

// 3) POST /public/:siteId/book — Book an appointment
router.post('/public/:siteId/book', async (req, res) => {
  try {
    const { siteId } = req.params;
    const {
      appointment_type_id, date, start_time,
      client_name, client_email, client_phone, notes
    } = req.body;

    // Validate required fields
    if (!appointment_type_id || !date || !start_time || !client_name || !client_email) {
      return res.status(400).json({ error: 'champs_requis_manquants' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'format_date_invalide' });
    }
    if (!/^\d{2}:\d{2}$/.test(start_time)) {
      return res.status(400).json({ error: 'format_heure_invalide (HH:MM)' });
    }

    // Fetch type to get duration and mode
    const { data: apptType, error: typeErr } = await admin()
      .from('appointment_types')
      .select('id, name, duration_min, mode, price_eur')
      .eq('id', appointment_type_id)
      .eq('site_id', siteId)
      .eq('enabled', true)
      .maybeSingle();

    if (typeErr) throw typeErr;
    if (!apptType) return res.status(404).json({ error: 'type_introuvable' });

    const duration = apptType.duration_min || 30;
    const endMinutes = toMinutes(start_time) + duration;
    const end_time = fromMinutes(endMinutes);

    // Validate that the slot is still available (prevent double-booking)
    const { data: conflict } = await admin()
      .from('appointments')
      .select('id')
      .eq('site_id', siteId)
      .eq('date', date)
      .in('status', ['confirmed', 'pending'])
      .lt('start_time', end_time)
      .gt('end_time', start_time)
      .limit(1);

    if (conflict && conflict.length > 0) {
      return res.status(409).json({ error: 'creneau_indisponible' });
    }

    // Check max daily limit
    const { data: settings } = await admin()
      .from('appointment_settings')
      .select('max_daily_appointments, auto_confirm')
      .eq('site_id', siteId)
      .maybeSingle();

    if (settings?.max_daily_appointments > 0) {
      const { count } = await admin()
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('date', date)
        .in('status', ['confirmed', 'pending']);

      if (count >= settings.max_daily_appointments) {
        return res.status(409).json({ error: 'limite_quotidienne_atteinte' });
      }
    }

    const status = settings?.auto_confirm ? 'confirmed' : 'pending';

    // Fetch site info for email
    const { data: siteInfo } = await admin()
      .from('vitrines_sites')
      .select('id, name, slug')
      .eq('id', siteId)
      .maybeSingle();

    // Create appointment record
    const { data: appointment, error: insertErr } = await admin()
      .from('appointments')
      .insert({
        site_id: siteId,
        appointment_type_id,
        date,
        start_time,
        end_time,
        client_name,
        client_email,
        client_phone: client_phone || null,
        notes: notes || null,
        status,
        mode: apptType.mode || 'cabinet'
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Enrich for email
    const enriched = {
      ...appointment,
      type_name: apptType.name,
      location: siteInfo?.name || null
    };

    // Send confirmation email (non-blocking)
    sendConfirmationEmail(enriched, siteInfo);

    const baseUrl = process.env.BASE_URL || 'https://jadomi.fr';
    res.status(201).json({
      appointment: {
        id: appointment.id,
        date: appointment.date,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
        type_name: apptType.name,
        mode: appointment.mode
      },
      ics_url: `${baseUrl}/api/appointments/public/ics/${appointment.id}`,
      google_calendar_url: googleCalendarLink(enriched)
    });
  } catch (err) {
    console.error('[appointments] POST /public/:siteId/book', err.message);
    res.status(500).json({ error: 'erreur_reservation' });
  }
});

// 4) GET /public/ics/:appointmentId — Download .ics file
router.get('/public/ics/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const { data: appt, error } = await admin()
      .from('appointments')
      .select('*, appointment_types(name)')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) throw error;
    if (!appt) return res.status(404).json({ error: 'rendez_vous_introuvable' });

    const enriched = {
      ...appt,
      type_name: appt.appointment_types?.name || 'Rendez-vous'
    };

    const ics = generateICS(enriched);
    const filename = `rdv-${appt.date}-${appt.start_time.replace(':', 'h')}.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ics);
  } catch (err) {
    console.error('[appointments] GET /public/ics/:appointmentId', err.message);
    res.status(500).json({ error: 'erreur_ics' });
  }
});


// =============================================
// ADMIN ENDPOINTS (require Supabase auth)
// =============================================
router.use('/admin', authSupabase(), requireSociete());

// 5) GET /admin/types — List all appointment types
router.get('/admin/types', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.query.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { data, error } = await admin()
      .from('appointment_types')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ types: data || [] });
  } catch (err) {
    console.error('[appointments] GET /admin/types', err.message);
    res.status(500).json({ error: 'erreur_types' });
  }
});

// 6) POST /admin/types — Create appointment type
router.post('/admin/types', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.body.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { name, duration_min, price_eur, mode, description } = req.body;
    if (!name || !duration_min) {
      return res.status(400).json({ error: 'name et duration_min requis' });
    }

    const { data, error } = await admin()
      .from('appointment_types')
      .insert({
        site_id: siteId,
        name,
        duration_min: parseInt(duration_min),
        price_eur: price_eur != null ? parseFloat(price_eur) : null,
        mode: mode || 'cabinet',
        description: description || null,
        enabled: true
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ type: data });
  } catch (err) {
    console.error('[appointments] POST /admin/types', err.message);
    res.status(500).json({ error: 'erreur_creation_type' });
  }
});

// 7) PUT /admin/types/:id — Update appointment type
router.put('/admin/types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, duration_min, price_eur, mode, description, enabled } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (duration_min !== undefined) updates.duration_min = parseInt(duration_min);
    if (price_eur !== undefined) updates.price_eur = price_eur != null ? parseFloat(price_eur) : null;
    if (mode !== undefined) updates.mode = mode;
    if (description !== undefined) updates.description = description;
    if (enabled !== undefined) updates.enabled = enabled;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'aucune_modification' });
    }

    const { data, error } = await admin()
      .from('appointment_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ type: data });
  } catch (err) {
    console.error('[appointments] PUT /admin/types/:id', err.message);
    res.status(500).json({ error: 'erreur_maj_type' });
  }
});

// 8) DELETE /admin/types/:id — Soft delete (set enabled=false)
router.delete('/admin/types/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await admin()
      .from('appointment_types')
      .update({ enabled: false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ type: data, disabled: true });
  } catch (err) {
    console.error('[appointments] DELETE /admin/types/:id', err.message);
    res.status(500).json({ error: 'erreur_suppression_type' });
  }
});

// 9) GET /admin/slots — List availability slots
router.get('/admin/slots', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.query.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { data, error } = await admin()
      .from('availability_slots')
      .select('*')
      .eq('site_id', siteId)
      .order('day_of_week')
      .order('start_time');

    if (error) throw error;
    res.json({ slots: data || [] });
  } catch (err) {
    console.error('[appointments] GET /admin/slots', err.message);
    res.status(500).json({ error: 'erreur_slots' });
  }
});

// 10) POST /admin/slots — Create availability slot
router.post('/admin/slots', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.body.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { day_of_week, start_time, end_time, recurring, specific_date } = req.body;

    if (start_time === undefined || end_time === undefined) {
      return res.status(400).json({ error: 'start_time et end_time requis' });
    }
    if (recurring && (day_of_week === undefined || day_of_week === null)) {
      return res.status(400).json({ error: 'day_of_week requis pour slot recurrent' });
    }
    if (!recurring && !specific_date) {
      return res.status(400).json({ error: 'specific_date requis pour slot ponctuel' });
    }

    const isRecurring = recurring !== false;

    const { data, error } = await admin()
      .from('availability_slots')
      .insert({
        site_id: siteId,
        day_of_week: isRecurring ? parseInt(day_of_week) : getDayOfWeek(specific_date),
        start_time,
        end_time,
        recurring: isRecurring,
        specific_date: isRecurring ? null : specific_date
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ slot: data });
  } catch (err) {
    console.error('[appointments] POST /admin/slots', err.message);
    res.status(500).json({ error: 'erreur_creation_slot' });
  }
});

// 11) DELETE /admin/slots/:id — Remove availability slot
router.delete('/admin/slots/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await admin()
      .from('availability_slots')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    console.error('[appointments] DELETE /admin/slots/:id', err.message);
    res.status(500).json({ error: 'erreur_suppression_slot' });
  }
});

// 12) GET /admin/appointments?from=&to= — List appointments in date range
router.get('/admin/appointments', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.query.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { from, to, status } = req.query;

    let query = admin()
      .from('appointments')
      .select('*, appointment_types(name, duration_min, mode)')
      .eq('site_id', siteId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ appointments: data || [] });
  } catch (err) {
    console.error('[appointments] GET /admin/appointments', err.message);
    res.status(500).json({ error: 'erreur_liste_rdv' });
  }
});

// 13) PUT /admin/appointments/:id — Update appointment status
router.put('/admin/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['confirmed', 'cancelled', 'completed', 'no_show', 'pending'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'statut_invalide', valid: validStatuses });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'aucune_modification' });
    }

    const { data, error } = await admin()
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .select('*, appointment_types(name, duration_min, mode)')
      .single();

    if (error) throw error;
    res.json({ appointment: data });
  } catch (err) {
    console.error('[appointments] PUT /admin/appointments/:id', err.message);
    res.status(500).json({ error: 'erreur_maj_rdv' });
  }
});

// 14) POST /admin/settings — Update appointment settings
router.post('/admin/settings', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.body.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { buffer_minutes, max_daily_appointments, auto_confirm, reminder_hours } = req.body;

    const payload = { site_id: siteId };
    if (buffer_minutes !== undefined) payload.buffer_minutes = parseInt(buffer_minutes);
    if (max_daily_appointments !== undefined) payload.max_daily_appointments = parseInt(max_daily_appointments);
    if (auto_confirm !== undefined) payload.auto_confirm = !!auto_confirm;
    if (reminder_hours !== undefined) payload.reminder_hours = parseInt(reminder_hours);

    // Upsert on site_id
    const { data, error } = await admin()
      .from('appointment_settings')
      .upsert(payload, { onConflict: 'site_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ settings: data });
  } catch (err) {
    console.error('[appointments] POST /admin/settings', err.message);
    res.status(500).json({ error: 'erreur_settings' });
  }
});

// 15) GET /admin/settings — Get appointment settings
router.get('/admin/settings', async (req, res) => {
  try {
    const siteId = req.headers['x-site-id'] || req.query.site_id;
    if (!siteId) return res.status(400).json({ error: 'site_id requis' });

    const { data, error } = await admin()
      .from('appointment_settings')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle();

    if (error) throw error;

    // Return defaults if no settings exist yet
    res.json({
      settings: data || {
        site_id: siteId,
        buffer_minutes: 0,
        max_daily_appointments: 0,
        auto_confirm: true,
        reminder_hours: 24
      }
    });
  } catch (err) {
    console.error('[appointments] GET /admin/settings', err.message);
    res.status(500).json({ error: 'erreur_settings' });
  }
});

module.exports = router;
