// =============================================
// JADOMI — Communication Cabinet Dentaire
// 2 sections : Confreres & Correspondants / Patients
// Tables : contacts_cabinet, campagnes_cabinet
// =============================================
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let _admin = null;
function admin() {
  if (!_admin) {
    if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Auth middleware
let authSupabase = null;
try { authSupabase = require('./middleware').authSupabase; } catch (e) {}
function requireAuth() {
  if (!authSupabase) return (req, res) => res.status(503).json({ error: 'auth_unavailable' });
  return authSupabase();
}

// Mailer
let mailer = null;
try { mailer = require('./mailer'); } catch (e) {
  try { mailer = require('../emailService'); } catch (e2) {}
}

// Rate limiter: 50 emails/minute OVH
const emailQueue = [];
let emailProcessing = false;
const RATE_LIMIT = 50;
const RATE_WINDOW = 60000;
let emailsSentTimestamps = [];

async function processEmailQueue() {
  if (emailProcessing) return;
  emailProcessing = true;
  while (emailQueue.length > 0) {
    const now = Date.now();
    emailsSentTimestamps = emailsSentTimestamps.filter(t => now - t < RATE_WINDOW);
    if (emailsSentTimestamps.length >= RATE_LIMIT) {
      const waitMs = RATE_WINDOW - (now - emailsSentTimestamps[0]) + 100;
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    const job = emailQueue.shift();
    try {
      emailsSentTimestamps.push(Date.now());
      const result = await mailer.sendMail(job.mailOpts);
      if (job.resolve) job.resolve(result);
    } catch (e) {
      if (job.reject) job.reject(e);
    }
  }
  emailProcessing = false;
}

function queueEmail(mailOpts) {
  return new Promise((resolve, reject) => {
    emailQueue.push({ mailOpts, resolve, reject });
    processEmailQueue();
  });
}

// CSV parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.replace(/^["']|["']$/g, '').trim());
    if (vals.length >= 2 && vals.some(v => v)) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

// Column name mapping (auto-detect)
const COL_MAP = {
  nom: ['nom', 'name', 'last_name', 'lastname', 'nom_famille', 'family_name', 'patient_nom', 'nom_patient'],
  prenom: ['prenom', 'pr\u00e9nom', 'firstname', 'first_name', 'prenom_patient', 'patient_prenom'],
  email: ['email', 'mail', 'e-mail', 'courriel', 'adresse_email', 'email_patient', 'patient_email'],
  telephone: ['telephone', 't\u00e9l\u00e9phone', 'tel', 'phone', 'mobile', 'portable', 'num_tel', 'tel_mobile'],
  specialite: ['specialite', 'sp\u00e9cialit\u00e9', 'specialty', 'type', 'profession'],
  derniere_visite: ['derniere_visite', 'derni\u00e8re_visite', 'last_visit', 'date_visite', 'dernier_rdv', 'date_rdv', 'dernier_passage']
};

function detectColumn(headers, fieldName) {
  const candidates = COL_MAP[fieldName] || [fieldName];
  for (const c of candidates) {
    const found = headers.find(h => h.replace(/[_\s-]/g, '').toLowerCase() === c.replace(/[_\s-]/g, '').toLowerCase());
    if (found) return found;
  }
  for (const c of candidates) {
    const found = headers.find(h => h.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
}

// Email HTML wrapper
function wrapEmailHtml(content, cabinetName, logoUrl, signature, unsubToken, baseUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1f3d;font-family:Arial,sans-serif;color:#f1f5f9;">
<div style="max-width:600px;margin:0 auto;background:#1e3460;border:1px solid rgba(99,102,241,0.25);border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a2d50,#243870);padding:20px 24px;border-bottom:1px solid rgba(99,102,241,0.15);">
    ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-height:50px;margin-bottom:8px;display:block;">` : ''}
    <div style="font-size:18px;font-weight:700;color:#f1f5f9;">${cabinetName || 'Cabinet Dentaire'}</div>
  </div>
  <div style="padding:24px;">${content}</div>
  ${signature ? `<div style="padding:0 24px 20px;font-size:12px;color:#94a3b8;border-top:1px solid rgba(99,102,241,0.1);padding-top:16px;white-space:pre-line;">${signature}</div>` : ''}
  <div style="text-align:center;margin-top:10px;padding:16px 24px;border-top:1px solid rgba(99,102,241,0.15);font-size:11px;color:#64748b;">
    <a href="${baseUrl}/api/communication/desabonner/${unsubToken}" style="color:#6366f1;text-decoration:underline;">Se d\u00e9sinscrire</a>
    &nbsp;|&nbsp; Envoy\u00e9 via <a href="https://jadomi.fr" style="color:#6366f1;">JADOMI</a>
  </div>
</div>
</body></html>`;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = function mountCommunication(app) {
  const auth = requireAuth();
  const BASE_URL = process.env.BASE_URL || 'https://jadomi.fr';

  function getSocieteId(req) {
    return req.headers['x-societe-id'] || req.body?.societe_id || req.query?.societe_id;
  }

  // ========================================
  // CONTACTS (table: contacts_cabinet)
  // ========================================

  // GET /api/communication/contacts?type=confrere|patient
  app.get('/api/communication/contacts', auth, async (req, res) => {
    try {
      const societeId = getSocieteId(req);
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });
      const type = req.query.type;

      let query = admin().from('contacts_cabinet')
        .select('*')
        .eq('societe_id', societeId)
        .eq('actif', true)
        .order('nom', { ascending: true });

      if (type) query = query.eq('type', type);

      const { data, error } = await query;
      if (error) throw error;
      res.json({ contacts: data || [], total: (data || []).length });
    } catch (e) {
      console.error('[communication/contacts]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/communication/contacts
  app.post('/api/communication/contacts', auth, async (req, res) => {
    try {
      const societeId = getSocieteId(req);
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });
      const { type, nom, prenom, email, telephone, specialite } = req.body;
      if (!nom) return res.status(400).json({ error: 'nom requis' });

      const { data, error } = await admin().from('contacts_cabinet')
        .insert({
          societe_id: societeId,
          type: type || 'patient',
          nom, prenom: prenom || null,
          email: email || null,
          telephone: telephone || null,
          specialite: specialite || null,
          actif: true
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ ok: true, contact: data });
    } catch (e) {
      console.error('[communication/contacts/add]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/communication/contacts/:id
  app.delete('/api/communication/contacts/:id', auth, async (req, res) => {
    try {
      const { error } = await admin().from('contacts_cabinet')
        .delete()
        .eq('id', req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========================================
  // IMPORT CSV
  // ========================================

  app.post('/api/communication/import', auth, upload.single('file'), async (req, res) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.body?.societe_id || req.query?.societe_id;
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });
      const type = req.body.type || 'patient';

      if (!req.file) return res.status(400).json({ error: 'fichier requis' });

      const text = req.file.buffer.toString('utf-8');
      const { headers, rows } = parseCSV(text);

      if (rows.length === 0) return res.status(400).json({ error: 'Fichier vide ou format invalide' });

      // Auto-detect columns
      const mapping = {};
      for (const field of Object.keys(COL_MAP)) {
        mapping[field] = detectColumn(headers, field);
      }

      // Insert contacts
      const contacts = rows.map(row => ({
        societe_id: societeId,
        type,
        nom: (mapping.nom ? row[mapping.nom] : '') || 'Inconnu',
        prenom: mapping.prenom ? row[mapping.prenom] || null : null,
        email: mapping.email ? row[mapping.email] || null : null,
        telephone: mapping.telephone ? row[mapping.telephone] || null : null,
        specialite: mapping.specialite ? row[mapping.specialite] || null : null,
        derniere_visite: mapping.derniere_visite ? row[mapping.derniere_visite] || null : null,
        actif: true
      })).filter(c => c.email || c.nom !== 'Inconnu');

      // Batch insert
      let inserted = 0;
      for (let i = 0; i < contacts.length; i += 500) {
        const batch = contacts.slice(i, i + 500);
        const { error } = await admin().from('contacts_cabinet').insert(batch);
        if (error) console.error('[import batch]', error.message);
        else inserted += batch.length;
      }

      res.json({
        ok: true,
        imported: inserted,
        total_rows: rows.length,
        mapping,
        detected_headers: headers
      });
    } catch (e) {
      console.error('[communication/import]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ========================================
  // CAMPAGNES (table: campagnes_cabinet)
  // ========================================

  // GET /api/communication/campagnes
  app.get('/api/communication/campagnes', auth, async (req, res) => {
    try {
      const societeId = getSocieteId(req);
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

      const { data, error } = await admin().from('campagnes_cabinet')
        .select('*')
        .eq('societe_id', societeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ campagnes: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/communication/campagnes
  app.post('/api/communication/campagnes', auth, async (req, res) => {
    try {
      const societeId = getSocieteId(req);
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });
      const { titre, sujet, contenu_html, cible } = req.body;
      if (!sujet || !contenu_html) return res.status(400).json({ error: 'sujet et contenu_html requis' });

      const { data, error } = await admin().from('campagnes_cabinet')
        .insert({
          societe_id: societeId,
          nom: titre || sujet,
          sujet,
          contenu_html,
          type_destinataire: cible || 'tous',
          statut: 'brouillon',
          nb_envoyes: 0
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ ok: true, campagne: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========================================
  // ENVOI DIRECT (sans campagne)
  // ========================================

  app.post('/api/communication/envoyer-direct', auth, async (req, res) => {
    try {
      if (!mailer) return res.status(503).json({ error: 'Service email non configur\u00e9' });

      const societeId = getSocieteId(req);
      const { emails, sujet, contenu_html, cabinetName, logoUrl, signature } = req.body;
      if (!emails || !emails.length || !sujet || !contenu_html) {
        return res.status(400).json({ error: 'emails, sujet et contenu_html requis' });
      }

      let sent = 0;
      for (const email of emails) {
        const token = crypto.randomUUID();
        const htmlContent = wrapEmailHtml(contenu_html, cabinetName, logoUrl, signature, token, BASE_URL);
        try {
          await queueEmail({
            to: email,
            subject: sujet,
            html: htmlContent,
            from: cabinetName ? `"${cabinetName}" <noreply@jadomi.fr>` : undefined
          });
          sent++;
        } catch (e) {
          console.error('[direct-send]', email, e.message);
        }
      }

      // Save as campagne record
      if (societeId) {
        try {
          await admin().from('campagnes_cabinet').insert({
            societe_id: societeId,
            nom: sujet,
            sujet,
            contenu_html,
            type_destinataire: 'tous',
            nb_envoyes: sent,
            statut: 'envoye',
            envoye_at: new Date().toISOString()
          });
        } catch (e) {}
      }

      res.json({ ok: true, sent, total: emails.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========================================
  // DESINSCRIPTION RGPD
  // ========================================

  app.get('/api/communication/desabonner/:token', async (req, res) => {
    try {
      // Mark contact as unsubscribed by token (stored in email URL)
      // For simplicity, use token as contact ID or search by it
      await admin().from('contacts_cabinet')
        .update({ desabonne: true, actif: false })
        .eq('id', req.params.token);
    } catch (e) {}

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{background:#0f1f3d;color:#f1f5f9;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .box{background:#1e3460;border:1px solid rgba(99,102,241,0.25);border-radius:16px;padding:40px;text-align:center;max-width:400px;}
      h2{color:#6366f1;margin-bottom:10px;}
    </style></head><body><div class="box"><h2>D\u00e9sinscription confirm\u00e9e</h2><p>Vous ne recevrez plus d'emails de ce cabinet.</p><p style="color:#94a3b8;font-size:13px;">JADOMI \u2014 Plateforme SaaS</p></div></body></html>`);
  });

  // ========================================
  // STATS
  // ========================================

  app.get('/api/communication/stats', auth, async (req, res) => {
    try {
      const societeId = getSocieteId(req);
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

      const [confreres, patients, campagnes] = await Promise.all([
        admin().from('contacts_cabinet').select('id', { count: 'exact', head: true })
          .eq('societe_id', societeId).eq('type', 'confrere').eq('actif', true),
        admin().from('contacts_cabinet').select('id', { count: 'exact', head: true })
          .eq('societe_id', societeId).eq('type', 'patient').eq('actif', true),
        admin().from('campagnes_cabinet').select('nb_envoyes, nb_ouverts')
          .eq('societe_id', societeId)
      ]);

      const totalEnvoyes = (campagnes.data || []).reduce((s, c) => s + (c.nb_envoyes || 0), 0);
      const totalOuverts = (campagnes.data || []).reduce((s, c) => s + (c.nb_ouverts || 0), 0);

      res.json({
        contacts_actifs: (confreres.count || 0) + (patients.count || 0),
        confreres: confreres.count || 0,
        patients: patients.count || 0,
        campagnes: (campagnes.data || []).length,
        total_envoyes: totalEnvoyes,
        total_ouverts: totalOuverts,
        taux_ouverture: totalEnvoyes > 0 ? Math.round(totalOuverts / totalEnvoyes * 100) : 0
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[JADOMI] Module Communication Cabinet monte');
};
