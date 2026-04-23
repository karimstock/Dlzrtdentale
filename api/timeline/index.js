// =============================================
// JADOMI — Module Timeline (Suivi de traitement)
// Routes /api/timeline/*
// Praticien: creation/gestion timelines, etapes, photos
// Patient: consultation, consentement
// Public: portfolio anonymise
// =============================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { uploadToR2, getPresignedUrl, deleteFromR2 } = require('../../services/r2-storage');
const { authSupabase, requireSociete } = require('../multiSocietes/middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const anthropic = new Anthropic();

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
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return _transporter;
}

// --- JWT helpers (client portal auth) ---
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

function requireClient(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorise' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Token invalide' });
  req.client = payload;
  next();
}

// =========================================================
// PRACTITIONER ROUTES
// =========================================================
router.use('/practitioner', authSupabase(), requireSociete());

// --- 1. POST /practitioner/timelines — Create timeline ---
router.post('/practitioner/timelines', async (req, res) => {
  try {
    const {
      site_id, patient_info, treatment_type, treatment_label,
      treatment_description, start_date, estimated_end_date,
      practitioner_name, practitioner_email, patient_account_id
    } = req.body;

    if (!site_id || !treatment_type || !start_date) {
      return res.status(400).json({ error: 'Champs obligatoires: site_id, treatment_type, start_date' });
    }

    const { data, error } = await admin()
      .from('timelines')
      .insert({
        societe_id: req.societe.id,
        site_id,
        patient_info: patient_info || {},
        patient_account_id: patient_account_id || null,
        treatment_type,
        treatment_label: treatment_label || treatment_type,
        treatment_description: treatment_description || null,
        start_date,
        estimated_end_date: estimated_end_date || null,
        practitioner_name: practitioner_name || null,
        practitioner_email: practitioner_email || null,
        status: 'en_cours',
        visibility: 'private',
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[timeline] POST /practitioner/timelines', err);
    res.status(500).json({ error: 'Erreur creation timeline' });
  }
});

// --- 2. GET /practitioner/timelines — List timelines ---
router.get('/practitioner/timelines', async (req, res) => {
  try {
    const { status, type, search } = req.query;

    let query = admin()
      .from('timelines')
      .select('*, timeline_steps(count), timeline_photos(count)')
      .eq('societe_id', req.societe.id)
      .neq('status', 'supprime')
      .order('updated_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('treatment_type', type);
    if (search) query = query.or(`patient_info->>last_name.ilike.%${search}%,patient_info->>first_name.ilike.%${search}%,treatment_label.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const timelines = (data || []).map(t => ({
      ...t,
      step_count: t.timeline_steps?.[0]?.count || 0,
      photo_count: t.timeline_photos?.[0]?.count || 0,
      timeline_steps: undefined,
      timeline_photos: undefined
    }));

    res.json(timelines);
  } catch (err) {
    console.error('[timeline] GET /practitioner/timelines', err);
    res.status(500).json({ error: 'Erreur liste timelines' });
  }
});

// --- 3. GET /practitioner/timelines/:id — Detail ---
router.get('/practitioner/timelines/:id', async (req, res) => {
  try {
    const { data: timeline, error } = await admin()
      .from('timelines')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societe.id)
      .single();

    if (error || !timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    const { data: steps } = await admin()
      .from('timeline_steps')
      .select('*')
      .eq('timeline_id', timeline.id)
      .order('step_order', { ascending: true });

    const stepIds = (steps || []).map(s => s.id);
    let photos = [];
    if (stepIds.length > 0) {
      const { data: photoData } = await admin()
        .from('timeline_photos')
        .select('*')
        .in('step_id', stepIds);
      photos = photoData || [];
    }

    // Attach photos to each step
    const stepsWithPhotos = (steps || []).map(step => ({
      ...step,
      photos: photos.filter(p => p.step_id === step.id)
    }));

    res.json({ ...timeline, steps: stepsWithPhotos });
  } catch (err) {
    console.error('[timeline] GET /practitioner/timelines/:id', err);
    res.status(500).json({ error: 'Erreur detail timeline' });
  }
});

// --- 4. PATCH /practitioner/timelines/:id — Update ---
router.patch('/practitioner/timelines/:id', async (req, res) => {
  try {
    const allowed = [
      'status', 'visibility', 'treatment_label', 'treatment_description',
      'estimated_end_date', 'practitioner_name', 'practitioner_email',
      'patient_info', 'patient_account_id'
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('timelines')
      .update(updates)
      .eq('id', req.params.id)
      .eq('societe_id', req.societe.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Timeline introuvable' });
    res.json(data);
  } catch (err) {
    console.error('[timeline] PATCH /practitioner/timelines/:id', err);
    res.status(500).json({ error: 'Erreur mise a jour timeline' });
  }
});

// --- 5. DELETE /practitioner/timelines/:id — Soft delete ---
router.delete('/practitioner/timelines/:id', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('timelines')
      .update({ status: 'abandonne', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('societe_id', req.societe.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Timeline introuvable' });
    res.json({ ok: true, status: 'abandonne' });
  } catch (err) {
    console.error('[timeline] DELETE /practitioner/timelines/:id', err);
    res.status(500).json({ error: 'Erreur suppression timeline' });
  }
});

// --- 6. POST /practitioner/timelines/:id/steps — Add step ---
router.post('/practitioner/timelines/:id/steps', async (req, res) => {
  try {
    // Verify timeline ownership
    const { data: timeline } = await admin()
      .from('timelines')
      .select('id')
      .eq('id', req.params.id)
      .eq('societe_id', req.societe.id)
      .single();

    if (!timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    // Get next step_order
    const { data: lastStep } = await admin()
      .from('timeline_steps')
      .select('step_order')
      .eq('timeline_id', timeline.id)
      .order('step_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (lastStep?.step_order || 0) + 1;

    const { step_date, step_label, clinical_notes, measurements, next_appointment_date, visible_to_patient } = req.body;

    const { data, error } = await admin()
      .from('timeline_steps')
      .insert({
        timeline_id: timeline.id,
        step_order: nextOrder,
        step_date: step_date || new Date().toISOString().slice(0, 10),
        step_label: step_label || `Etape ${nextOrder}`,
        clinical_notes: clinical_notes || null,
        measurements: measurements || null,
        next_appointment_date: next_appointment_date || null,
        visible_to_patient: visible_to_patient !== false,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    // Touch timeline updated_at
    await admin().from('timelines').update({ updated_at: new Date().toISOString() }).eq('id', timeline.id);

    res.status(201).json(data);
  } catch (err) {
    console.error('[timeline] POST /practitioner/timelines/:id/steps', err);
    res.status(500).json({ error: 'Erreur ajout etape' });
  }
});

// --- 7. PATCH /practitioner/steps/:id — Update step ---
router.patch('/practitioner/steps/:id', async (req, res) => {
  try {
    // Verify ownership via timeline
    const { data: step } = await admin()
      .from('timeline_steps')
      .select('*, timelines!inner(societe_id)')
      .eq('id', req.params.id)
      .single();

    if (!step || step.timelines?.societe_id !== req.societe.id) {
      return res.status(404).json({ error: 'Etape introuvable' });
    }

    const allowed = ['step_date', 'step_label', 'clinical_notes', 'measurements', 'next_appointment_date', 'visible_to_patient'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('timeline_steps')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[timeline] PATCH /practitioner/steps/:id', err);
    res.status(500).json({ error: 'Erreur mise a jour etape' });
  }
});

// --- 8. DELETE /practitioner/steps/:id — Delete step + cascade photos ---
router.delete('/practitioner/steps/:id', async (req, res) => {
  try {
    const { data: step } = await admin()
      .from('timeline_steps')
      .select('*, timelines!inner(societe_id)')
      .eq('id', req.params.id)
      .single();

    if (!step || step.timelines?.societe_id !== req.societe.id) {
      return res.status(404).json({ error: 'Etape introuvable' });
    }

    // Delete photos from R2 first
    const { data: photos } = await admin()
      .from('timeline_photos')
      .select('id, r2_key, r2_key_thumbnail')
      .eq('step_id', step.id);

    for (const photo of (photos || [])) {
      try {
        if (photo.r2_key) await deleteFromR2(photo.r2_key);
        if (photo.r2_key_thumbnail) await deleteFromR2(photo.r2_key_thumbnail);
      } catch (e) {
        console.error('[timeline] R2 delete error', e.message);
      }
    }

    // Delete photos from DB
    await admin().from('timeline_photos').delete().eq('step_id', step.id);

    // Delete step
    const { error } = await admin().from('timeline_steps').delete().eq('id', step.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[timeline] DELETE /practitioner/steps/:id', err);
    res.status(500).json({ error: 'Erreur suppression etape' });
  }
});

// --- 9. POST /practitioner/steps/:stepId/photos — Upload photos ---
router.post('/practitioner/steps/:stepId/photos', upload.array('photos', 10), async (req, res) => {
  try {
    // Verify step ownership
    const { data: step } = await admin()
      .from('timeline_steps')
      .select('*, timelines!inner(id, societe_id)')
      .eq('id', req.params.stepId)
      .single();

    if (!step || step.timelines?.societe_id !== req.societe.id) {
      return res.status(404).json({ error: 'Etape introuvable' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier envoye' });
    }

    const timelineId = step.timelines.id;
    const results = [];

    for (const file of req.files) {
      const fileId = crypto.randomUUID();
      const r2Key = `timelines/${timelineId}/${step.id}/${fileId}.webp`;
      const r2KeyThumb = `timelines/${timelineId}/${step.id}/${fileId}_thumb.webp`;

      // Convert to webp
      const webpBuffer = await sharp(file.buffer)
        .webp({ quality: 85 })
        .toBuffer();

      // Generate thumbnail (400px wide)
      const thumbBuffer = await sharp(file.buffer)
        .resize(400)
        .webp({ quality: 75 })
        .toBuffer();

      // Upload both to R2
      await uploadToR2(r2Key, webpBuffer, 'image/webp');
      await uploadToR2(r2KeyThumb, thumbBuffer, 'image/webp');

      // Save metadata
      const { data: photo, error } = await admin()
        .from('timeline_photos')
        .insert({
          step_id: step.id,
          timeline_id: timelineId,
          r2_key: r2Key,
          r2_key_thumbnail: r2KeyThumb,
          original_filename: file.originalname,
          mime_type: 'image/webp',
          file_size: webpBuffer.length,
          uploaded_by: req.user.id
        })
        .select()
        .single();

      if (error) throw error;
      results.push(photo);
    }

    // Touch timeline updated_at
    await admin().from('timelines').update({ updated_at: new Date().toISOString() }).eq('id', timelineId);

    res.status(201).json(results);
  } catch (err) {
    console.error('[timeline] POST /practitioner/steps/:stepId/photos', err);
    res.status(500).json({ error: 'Erreur upload photos' });
  }
});

// --- 10. DELETE /practitioner/photos/:id — Delete photo ---
router.delete('/practitioner/photos/:id', async (req, res) => {
  try {
    const { data: photo } = await admin()
      .from('timeline_photos')
      .select('*, timelines!inner(societe_id)')
      .eq('id', req.params.id)
      .single();

    if (!photo || photo.timelines?.societe_id !== req.societe.id) {
      return res.status(404).json({ error: 'Photo introuvable' });
    }

    // Delete from R2
    try {
      if (photo.r2_key) await deleteFromR2(photo.r2_key);
      if (photo.r2_key_thumbnail) await deleteFromR2(photo.r2_key_thumbnail);
    } catch (e) {
      console.error('[timeline] R2 delete error', e.message);
    }

    // Delete from DB
    const { error } = await admin().from('timeline_photos').delete().eq('id', photo.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[timeline] DELETE /practitioner/photos/:id', err);
    res.status(500).json({ error: 'Erreur suppression photo' });
  }
});

// --- 11. POST /practitioner/photos/:id/analyze — Claude Vision analysis ---
router.post('/practitioner/photos/:id/analyze', async (req, res) => {
  try {
    const { data: photo } = await admin()
      .from('timeline_photos')
      .select('*, timelines!inner(societe_id)')
      .eq('id', req.params.id)
      .single();

    if (!photo || photo.timelines?.societe_id !== req.societe.id) {
      return res.status(404).json({ error: 'Photo introuvable' });
    }

    const presignedUrl = await getPresignedUrl(photo.r2_key);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: presignedUrl }
          },
          {
            type: 'text',
            text: 'Analyze this dental/medical photo. Detect: 1) Is a patient face visible? 2) Suggest optimal crop region (x,y,w,h as percentages) to show only the treatment area for anonymization. 3) Generate descriptive clinical labels. Return JSON with keys: patient_face_detected (boolean), crop_region_suggested ({x,y,w,h} percentages), claude_vision_labels (array of strings).'
          }
        ]
      }],
      system: 'You are a dental/medical image analysis assistant. Always respond with valid JSON only, no markdown wrapping.'
    });

    let analysis;
    try {
      const text = response.content[0]?.text || '{}';
      analysis = JSON.parse(text);
    } catch {
      analysis = { raw_response: response.content[0]?.text, parse_error: true };
    }

    // Update photo record
    const { data: updated, error } = await admin()
      .from('timeline_photos')
      .update({
        patient_face_detected: analysis.patient_face_detected || false,
        crop_region_suggested: analysis.crop_region_suggested || null,
        claude_vision_labels: analysis.claude_vision_labels || [],
        analyzed_at: new Date().toISOString()
      })
      .eq('id', photo.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ photo: updated, analysis });
  } catch (err) {
    console.error('[timeline] POST /practitioner/photos/:id/analyze', err);
    res.status(500).json({ error: 'Erreur analyse photo' });
  }
});

// --- 12. POST /practitioner/steps/:id/ai-notes — Generate AI clinical notes ---
router.post('/practitioner/steps/:id/ai-notes', async (req, res) => {
  try {
    const { data: step } = await admin()
      .from('timeline_steps')
      .select('*, timelines!inner(societe_id, treatment_type, treatment_label)')
      .eq('id', req.params.id)
      .single();

    if (!step || step.timelines?.societe_id !== req.societe.id) {
      return res.status(404).json({ error: 'Etape introuvable' });
    }

    const { data: photos } = await admin()
      .from('timeline_photos')
      .select('r2_key')
      .eq('step_id', step.id);

    if (!photos || photos.length === 0) {
      return res.status(400).json({ error: 'Aucune photo pour cette etape' });
    }

    // Build image content for Claude
    const imageContent = [];
    for (const photo of photos.slice(0, 5)) {
      const url = await getPresignedUrl(photo.r2_key);
      imageContent.push({ type: 'image', source: { type: 'url', url } });
    }
    imageContent.push({
      type: 'text',
      text: `Treatment: ${step.timelines.treatment_label || step.timelines.treatment_type}. Step: ${step.step_label}. Based on these clinical photos, provide detailed clinical observations and notes in French. Be concise and professional.`
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: imageContent }],
      system: 'You are a dental/medical assistant helping practitioners write clinical notes. Respond in French with professional clinical observations based on the provided photos.'
    });

    const suggestedNotes = response.content[0]?.text || '';
    res.json({ suggested_notes: suggestedNotes });
  } catch (err) {
    console.error('[timeline] POST /practitioner/steps/:id/ai-notes', err);
    res.status(500).json({ error: 'Erreur generation notes IA' });
  }
});

// --- 13. POST /practitioner/timelines/:id/request-consent — Send consent email ---
router.post('/practitioner/timelines/:id/request-consent', async (req, res) => {
  try {
    const { data: timeline } = await admin()
      .from('timelines')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societe.id)
      .single();

    if (!timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    const patientEmail = timeline.patient_info?.email;
    if (!patientEmail) {
      return res.status(400).json({ error: 'Email patient manquant dans patient_info' });
    }

    const consentUrl = `${process.env.APP_URL || 'https://app.jadomi.fr'}/patient/timeline/${timeline.id}/consent`;

    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || '"JADOMI" <ne-pas-repondre@jadomi.fr>',
      to: patientEmail,
      subject: 'Consentement pour votre suivi de traitement - JADOMI',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Suivi de traitement</h2>
          <p>Bonjour,</p>
          <p>Votre praticien vous invite a consulter et donner votre consentement pour le partage
          de votre suivi de traitement <strong>${timeline.treatment_label || timeline.treatment_type}</strong>.</p>
          <p style="margin: 24px 0;">
            <a href="${consentUrl}"
               style="background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
              Consulter et donner mon consentement
            </a>
          </p>
          <p style="color: #666; font-size: 13px;">Si vous n'etes pas concerne par ce message, veuillez l'ignorer.</p>
        </div>
      `
    });

    // Mark consent requested
    await admin()
      .from('timelines')
      .update({ consent_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', timeline.id);

    res.json({ ok: true, sent_to: patientEmail });
  } catch (err) {
    console.error('[timeline] POST /practitioner/timelines/:id/request-consent', err);
    res.status(500).json({ error: 'Erreur envoi email consentement' });
  }
});

// --- 14. POST /practitioner/timelines/:id/generate-pdf — Generate PDF report ---
router.post('/practitioner/timelines/:id/generate-pdf', async (req, res) => {
  try {
    const { data: timeline } = await admin()
      .from('timelines')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societe.id)
      .single();

    if (!timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    const { data: steps } = await admin()
      .from('timeline_steps')
      .select('*')
      .eq('timeline_id', timeline.id)
      .order('step_order', { ascending: true });

    const stepIds = (steps || []).map(s => s.id);
    let photos = [];
    if (stepIds.length > 0) {
      const { data: p } = await admin()
        .from('timeline_photos')
        .select('*')
        .in('step_id', stepIds);
      photos = p || [];
    }

    // Build PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));

    const pdfReady = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // Header
    const patientName = timeline.patient_info
      ? `${timeline.patient_info.first_name || ''} ${timeline.patient_info.last_name || ''}`.trim()
      : 'Patient';

    doc.fontSize(20).font('Helvetica-Bold').text('Rapport de suivi de traitement', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Genere le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('Patient : ', { continued: true });
    doc.font('Helvetica').text(patientName);

    doc.font('Helvetica-Bold').text('Traitement : ', { continued: true });
    doc.font('Helvetica').text(timeline.treatment_label || timeline.treatment_type);

    if (timeline.practitioner_name) {
      doc.font('Helvetica-Bold').text('Praticien : ', { continued: true });
      doc.font('Helvetica').text(timeline.practitioner_name);
    }

    doc.font('Helvetica-Bold').text('Debut : ', { continued: true });
    doc.font('Helvetica').text(timeline.start_date || '-');

    if (timeline.estimated_end_date) {
      doc.font('Helvetica-Bold').text('Fin estimee : ', { continued: true });
      doc.font('Helvetica').text(timeline.estimated_end_date);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
    doc.moveDown(1);

    // Steps
    for (const step of (steps || [])) {
      if (doc.y > 700) doc.addPage();

      doc.fontSize(14).font('Helvetica-Bold')
        .text(`Etape ${step.step_order} — ${step.step_label}`);
      doc.fontSize(10).font('Helvetica').fillColor('#666')
        .text(step.step_date || '');
      doc.fillColor('#000');
      doc.moveDown(0.3);

      if (step.clinical_notes) {
        doc.fontSize(10).font('Helvetica').text(step.clinical_notes);
        doc.moveDown(0.3);
      }

      // Photo thumbnails (download from R2 and embed)
      const stepPhotos = photos.filter(p => p.step_id === step.id);
      if (stepPhotos.length > 0) {
        let xPos = 50;
        for (const photo of stepPhotos.slice(0, 4)) {
          try {
            const url = await getPresignedUrl(photo.r2_key_thumbnail || photo.r2_key);
            // Fetch thumbnail for embedding
            const resp = await fetch(url);
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              if (doc.y > 650) doc.addPage();
              doc.image(buf, xPos, doc.y, { width: 110, height: 80 });
              xPos += 120;
              if (xPos > 450) { xPos = 50; doc.moveDown(5.5); }
            }
          } catch (e) {
            console.error('[timeline] PDF photo embed error', e.message);
          }
        }
        if (xPos > 50) doc.moveDown(5.5);
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#eee');
      doc.moveDown(0.5);
    }

    doc.end();
    const pdfBuffer = await pdfReady;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="timeline-${timeline.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[timeline] POST /practitioner/timelines/:id/generate-pdf', err);
    res.status(500).json({ error: 'Erreur generation PDF' });
  }
});

// =========================================================
// PATIENT ROUTES
// =========================================================

// --- 15. GET /patient/my-timelines — List patient timelines ---
router.get('/patient/my-timelines', requireClient, async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('timelines')
      .select('*, timeline_steps(count), timeline_photos(count)')
      .eq('patient_account_id', req.client.id)
      .in('visibility', ['shared_with_patient', 'portfolio_anonymized'])
      .neq('status', 'supprime')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const timelines = (data || []).map(t => {
      const stepCount = t.timeline_steps?.[0]?.count || 0;
      // Estimate progress: if estimated_end_date exists, use date-based progress
      let progress = null;
      if (t.start_date && t.estimated_end_date) {
        const start = new Date(t.start_date).getTime();
        const end = new Date(t.estimated_end_date).getTime();
        const now = Date.now();
        if (end > start) {
          progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
        }
      }
      return {
        ...t,
        step_count: stepCount,
        photo_count: t.timeline_photos?.[0]?.count || 0,
        progress,
        timeline_steps: undefined,
        timeline_photos: undefined
      };
    });

    res.json(timelines);
  } catch (err) {
    console.error('[timeline] GET /patient/my-timelines', err);
    res.status(500).json({ error: 'Erreur liste timelines patient' });
  }
});

// --- 16. GET /patient/timelines/:id — Timeline detail (patient view) ---
router.get('/patient/timelines/:id', requireClient, async (req, res) => {
  try {
    const { data: timeline, error } = await admin()
      .from('timelines')
      .select('*')
      .eq('id', req.params.id)
      .eq('patient_account_id', req.client.id)
      .in('visibility', ['shared_with_patient', 'portfolio_anonymized'])
      .single();

    if (error || !timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    // Only visible steps
    const { data: steps } = await admin()
      .from('timeline_steps')
      .select('*')
      .eq('timeline_id', timeline.id)
      .eq('visible_to_patient', true)
      .order('step_order', { ascending: true });

    const stepIds = (steps || []).map(s => s.id);
    let photos = [];
    if (stepIds.length > 0) {
      const { data: p } = await admin()
        .from('timeline_photos')
        .select('id, step_id, original_filename, r2_key, r2_key_thumbnail, claude_vision_labels, created_at')
        .in('step_id', stepIds);
      photos = p || [];
    }

    // Generate presigned URLs for photos
    const photosWithUrls = [];
    for (const photo of photos) {
      try {
        const url = await getPresignedUrl(photo.r2_key);
        const thumbUrl = photo.r2_key_thumbnail ? await getPresignedUrl(photo.r2_key_thumbnail) : url;
        photosWithUrls.push({ ...photo, url, thumbnail_url: thumbUrl, r2_key: undefined, r2_key_thumbnail: undefined });
      } catch {
        photosWithUrls.push({ ...photo, url: null, thumbnail_url: null, r2_key: undefined, r2_key_thumbnail: undefined });
      }
    }

    const stepsWithPhotos = (steps || []).map(step => ({
      ...step,
      photos: photosWithUrls.filter(p => p.step_id === step.id)
    }));

    res.json({ ...timeline, steps: stepsWithPhotos });
  } catch (err) {
    console.error('[timeline] GET /patient/timelines/:id', err);
    res.status(500).json({ error: 'Erreur detail timeline patient' });
  }
});

// --- 17. POST /patient/timelines/:id/consent — Sign consent ---
router.post('/patient/timelines/:id/consent', requireClient, async (req, res) => {
  try {
    const { signature_data } = req.body;
    if (!signature_data) {
      return res.status(400).json({ error: 'signature_data requis' });
    }

    const { data: timeline } = await admin()
      .from('timelines')
      .select('id')
      .eq('id', req.params.id)
      .eq('patient_account_id', req.client.id)
      .single();

    if (!timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    const { data, error } = await admin()
      .from('timelines')
      .update({
        consent_patient_signed: true,
        consent_signed_at: new Date().toISOString(),
        consent_signature_data: { data: signature_data, ip: req.ip, user_agent: req.headers['user-agent'] },
        updated_at: new Date().toISOString()
      })
      .eq('id', timeline.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, consent_signed_at: data.consent_signed_at });
  } catch (err) {
    console.error('[timeline] POST /patient/timelines/:id/consent', err);
    res.status(500).json({ error: 'Erreur signature consentement' });
  }
});

// --- 18. POST /patient/timelines/:id/revoke-consent — Revoke consent ---
router.post('/patient/timelines/:id/revoke-consent', requireClient, async (req, res) => {
  try {
    const { data: timeline } = await admin()
      .from('timelines')
      .select('id')
      .eq('id', req.params.id)
      .eq('patient_account_id', req.client.id)
      .single();

    if (!timeline) return res.status(404).json({ error: 'Timeline introuvable' });

    const { error } = await admin()
      .from('timelines')
      .update({
        consent_patient_signed: false,
        visibility: 'shared_with_patient',
        updated_at: new Date().toISOString()
      })
      .eq('id', timeline.id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[timeline] POST /patient/timelines/:id/revoke-consent', err);
    res.status(500).json({ error: 'Erreur revocation consentement' });
  }
});

// =========================================================
// PUBLIC ROUTES
// =========================================================

// --- 19. GET /public/portfolio/:siteId — Anonymized portfolio ---
router.get('/public/portfolio/:siteId', async (req, res) => {
  try {
    const { data: timelines, error } = await admin()
      .from('timelines')
      .select('id, treatment_type, treatment_label, start_date, estimated_end_date, created_at')
      .eq('site_id', req.params.siteId)
      .eq('visibility', 'portfolio_anonymized')
      .eq('consent_patient_signed', true)
      .neq('status', 'supprime')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch anonymized photos for each timeline
    const results = [];
    for (const t of (timelines || [])) {
      const { data: photos } = await admin()
        .from('timeline_photos')
        .select('id, r2_key_thumbnail, claude_vision_labels, created_at')
        .eq('timeline_id', t.id)
        .limit(6);

      const photoUrls = [];
      for (const p of (photos || [])) {
        try {
          const url = await getPresignedUrl(p.r2_key_thumbnail || p.r2_key);
          photoUrls.push({ id: p.id, url, labels: p.claude_vision_labels || [] });
        } catch { /* skip */ }
      }

      const duration = t.start_date && t.estimated_end_date
        ? Math.round((new Date(t.estimated_end_date) - new Date(t.start_date)) / (1000 * 60 * 60 * 24))
        : null;

      results.push({
        id: t.id,
        treatment_type: t.treatment_type,
        treatment_label: t.treatment_label,
        duration_days: duration,
        photos: photoUrls
      });
    }

    res.json(results);
  } catch (err) {
    console.error('[timeline] GET /public/portfolio/:siteId', err);
    res.status(500).json({ error: 'Erreur portfolio' });
  }
});

// --- 20. GET /public/portfolio/:siteId/stats — Portfolio stats ---
router.get('/public/portfolio/:siteId/stats', async (req, res) => {
  try {
    const { data: timelines, error } = await admin()
      .from('timelines')
      .select('id, treatment_type, start_date, estimated_end_date')
      .eq('site_id', req.params.siteId)
      .eq('visibility', 'portfolio_anonymized')
      .eq('consent_patient_signed', true)
      .neq('status', 'supprime');

    if (error) throw error;

    // Count by treatment type
    const byType = {};
    const durations = [];
    for (const t of (timelines || [])) {
      byType[t.treatment_type] = (byType[t.treatment_type] || 0) + 1;
      if (t.start_date && t.estimated_end_date) {
        const days = Math.round((new Date(t.estimated_end_date) - new Date(t.start_date)) / (1000 * 60 * 60 * 24));
        if (days > 0) durations.push(days);
      }
    }

    // Total photos
    const timelineIds = (timelines || []).map(t => t.id);
    let totalPhotos = 0;
    if (timelineIds.length > 0) {
      const { count } = await admin()
        .from('timeline_photos')
        .select('id', { count: 'exact', head: true })
        .in('timeline_id', timelineIds);
      totalPhotos = count || 0;
    }

    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    res.json({
      total_cases: (timelines || []).length,
      cases_by_type: byType,
      total_photos: totalPhotos,
      average_duration_days: avgDuration
    });
  } catch (err) {
    console.error('[timeline] GET /public/portfolio/:siteId/stats', err);
    res.status(500).json({ error: 'Erreur stats portfolio' });
  }
});

module.exports = router;
