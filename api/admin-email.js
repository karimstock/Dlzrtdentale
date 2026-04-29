// =============================================
// JADOMI Admin — Module Email complet
// Boîte réception IMAP + Campagnes mailing + Stats
// Ne touche PAS admin.js — fichier séparé
// =============================================

const express = require('express');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'jadomi_admin_karim_2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'contact@jadomi.fr';

async function requireAdmin(req, res, next) {
  // Method 1: legacy X-Admin-Token header or query param
  const tok = req.headers['x-admin-token'] || req.query?.token;
  if (tok && tok === ADMIN_TOKEN) return next();

  // Method 2: Supabase JWT — check if user is admin
  const authHeader = req.headers['authorization'];
  const jwtFromQuery = req.query?.token;
  const rawJwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : jwtFromQuery;
  if (rawJwt && rawJwt !== tok) {
    const jwt = rawJwt;
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: { user }, error } = await sb.auth.getUser(jwt);
      if (!error && user && user.email === ADMIN_EMAIL) {
        req.adminUser = user;
        return next();
      }
    } catch {}
  }

  return res.status(401).json({ error: 'admin_token_required' });
}

// Mailer réutilisable
let _mailer = null;
function getMailer() {
  if (_mailer) return _mailer;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  _mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return _mailer;
}

// ===== IMAP : lire boite reception =====
async function fetchInbox({ limit = 50, since } = {}) {
  const client = new ImapFlow({
    host: 'pro2.mail.ovh.net',
    port: 993,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
    logger: false
  });

  const messages = [];
  const timeout = setTimeout(() => {
    try { client.close(); } catch (e) {}
  }, 15000);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Build search criteria
      const criteria = since ? { since: new Date(since) } : { all: true };
      const uids = [];
      for await (const msg of client.fetch(criteria, { uid: true })) {
        uids.push(msg.uid);
      }
      if (!uids.length) { clearTimeout(timeout); return []; }

      // Prendre les derniers messages
      const toFetch = uids.slice(-limit).reverse();
      const uidRange = toFetch.join(',');

      for await (const msg of client.fetch(uidRange, { source: true, flags: true, uid: true }, { uid: true })) {
        try {
          const parsed = await simpleParser(msg.source);
          messages.push({
            uid: msg.uid,
            seqno: msg.seq,
            date: parsed.date || null,
            from: parsed.from?.text || '',
            from_address: parsed.from?.value?.[0]?.address || '',
            to: parsed.to?.text || '',
            subject: parsed.subject || '(sans objet)',
            text: (parsed.text || '').slice(0, 500),
            html: parsed.html || null,
            flags: Array.from(msg.flags || []),
            seen: (msg.flags || new Set()).has('\\Seen'),
            attachments: (parsed.attachments || []).map(a => ({
              filename: a.filename, size: a.size, contentType: a.contentType
            }))
          });
        } catch (e) {}
      }
    } finally {
      lock.release();
    }
    clearTimeout(timeout);
    await client.logout();
  } catch (e) {
    clearTimeout(timeout);
    try { await client.logout(); } catch (_) {}
    throw e;
  }
  return messages;
}

// Marquer lu/non lu via IMAP
async function setFlags(uid, flags, add = true) {
  const client = new ImapFlow({
    host: 'pro2.mail.ovh.net',
    port: 993,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
    logger: false
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      if (add) {
        await client.messageFlagsAdd(String(uid), flags, { uid: true });
      } else {
        await client.messageFlagsRemove(String(uid), flags, { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return true;
  } catch (e) {
    try { await client.logout(); } catch (_) {}
    throw e;
  }
}

// ===== MOUNT ROUTES =====
function mountAdminEmail(app, supabase) {
  // ------- AUTH -------
  // POST /api/admin/auth — Verify admin password and return token
  app.post('/api/admin/auth', (req, res) => {
    const { password } = req.body || {};
    if (password && password === ADMIN_TOKEN) {
      return res.json({ ok: true, token: ADMIN_TOKEN });
    }
    res.status(401).json({ error: 'Mot de passe incorrect' });
  });

  // ------- BOITE RECEPTION -------

  // GET /api/admin/email/inbox — Lire boîte réception
  app.get('/api/admin/email/inbox', requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const since = req.query.since || null;
      const messages = await fetchInbox({ limit, since });
      // Trier par date décroissante
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
      const unread = messages.filter(m => !m.seen).length;
      res.json({ success: true, messages, total: messages.length, unread });
    } catch (e) {
      console.error('[ADMIN email inbox]', e.message);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // POST /api/admin/email/reply — Répondre à un email
  app.post('/api/admin/email/reply', requireAdmin, async (req, res) => {
    try {
      const { to, subject, html, in_reply_to } = req.body;
      if (!to || !html) return res.status(400).json({ error: 'to et html requis' });
      const mailer = getMailer();
      if (!mailer) return res.status(503).json({ error: 'SMTP non configuré' });

      const info = await mailer.sendMail({
        from: `"JADOMI" <contact@jadomi.fr>`,
        to,
        subject: subject || 'Re: ',
        html,
        inReplyTo: in_reply_to || undefined
      });
      res.json({ success: true, messageId: info.messageId });
    } catch (e) {
      console.error('[ADMIN email reply]', e.message);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // PATCH /api/admin/email/:uid/read — Marquer lu
  app.patch('/api/admin/email/:uid/read', requireAdmin, async (req, res) => {
    try {
      await setFlags(parseInt(req.params.uid), ['\\Seen'], true);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // PATCH /api/admin/email/:uid/unread — Marquer non lu
  app.patch('/api/admin/email/:uid/unread', requireAdmin, async (req, res) => {
    try {
      await setFlags(parseInt(req.params.uid), ['\\Seen'], false);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // ------- CAMPAGNES MAILING -------

  // GET /api/admin/email/segments — Stats par profession
  app.get('/api/admin/email/segments', requireAdmin, async (req, res) => {
    try {
      // Compter users par profession via Supabase auth admin
      const { createClient } = require('@supabase/supabase-js');
      const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Lister tous les users (pagination 1000 max)
      let allUsers = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 10) {
        const { data: { users }, error } = await admin.auth.admin.listUsers({
          page, perPage: 1000
        });
        if (error || !users || users.length === 0) { hasMore = false; break; }
        allUsers = allUsers.concat(users);
        hasMore = users.length === 1000;
        page++;
      }

      // Segmenter par profession
      const segments = {
        chirurgien_dentiste: { label: 'Chirurgiens-dentistes', icon: '🦷', users: [] },
        orthodontiste: { label: 'Orthodontistes', icon: '🦴', users: [] },
        prothesiste: { label: 'Prothésistes', icon: '🔬', users: [] },
        veterinaire: { label: 'Vétérinaires', icon: '🐾', users: [] },
        dirigeant: { label: 'Dirigeants société', icon: '🏢', users: [] },
        auto_entrepreneur: { label: 'Auto-entrepreneurs', icon: '📊', users: [] },
        autre: { label: 'Autres', icon: '👥', users: [] }
      };

      for (const u of allUsers) {
        const prof = u.user_metadata?.profession || 'autre';
        const entry = {
          id: u.id,
          email: u.email,
          prenom: u.user_metadata?.prenom || '',
          nom: u.user_metadata?.nom || '',
          profession: prof,
          created_at: u.created_at
        };

        if (prof === 'chirurgien_dentiste') segments.chirurgien_dentiste.users.push(entry);
        else if (prof === 'orthodontiste') segments.orthodontiste.users.push(entry);
        else if (prof === 'prothesiste') segments.prothesiste.users.push(entry);
        else if (prof === 'veterinaire') segments.veterinaire.users.push(entry);
        else if (['dirigeant', 'gerant'].includes(prof)) segments.dirigeant.users.push(entry);
        else if (prof === 'auto_entrepreneur') segments.auto_entrepreneur.users.push(entry);
        else segments.autre.users.push(entry);
      }

      // Stats résumé
      const stats = Object.entries(segments).map(([key, seg]) => ({
        segment: key,
        label: seg.label,
        icon: seg.icon,
        count: seg.users.length,
        emails: seg.users.map(u => u.email)
      }));

      res.json({
        success: true,
        segments: stats,
        total_users: allUsers.length,
        total_emails: allUsers.filter(u => u.email).length
      });
    } catch (e) {
      console.error('[ADMIN email segments]', e.message);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // POST /api/admin/email/campagne — Envoyer campagne mailing
  app.post('/api/admin/email/campagne', requireAdmin, async (req, res) => {
    try {
      const { sujet, html, segment, destinataires_override } = req.body;
      if (!sujet || !html) return res.status(400).json({ error: 'sujet et html requis' });

      const mailer = getMailer();
      if (!mailer) return res.status(503).json({ error: 'SMTP non configuré' });

      // Si destinataires explicites, les utiliser
      let destinataires = destinataires_override || [];

      // Sinon charger le segment
      if (!destinataires.length && segment) {
        const { createClient } = require('@supabase/supabase-js');
        const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false }
        });

        let allUsers = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 10) {
          const { data: { users } } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (!users || users.length === 0) break;
          allUsers = allUsers.concat(users);
          hasMore = users.length === 1000;
          page++;
        }

        if (segment === 'tous') {
          destinataires = allUsers.map(u => ({ email: u.email, prenom: u.user_metadata?.prenom || '' }));
        } else {
          destinataires = allUsers
            .filter(u => (u.user_metadata?.profession || '') === segment)
            .map(u => ({ email: u.email, prenom: u.user_metadata?.prenom || '' }));
        }
      }

      if (!destinataires.length) return res.status(400).json({ error: 'Aucun destinataire pour ce segment' });

      // Envoi avec rate limit (50/min = 1 toutes les 1200ms)
      const DELAY = 1200;
      let envoyes = 0, erreurs = 0;
      const resultats = [];

      for (const dest of destinataires) {
        const email = typeof dest === 'string' ? dest : dest.email;
        const prenom = typeof dest === 'object' ? dest.prenom : '';
        // Personnaliser le HTML
        const htmlPerso = html
          .replace(/\{prenom\}/g, prenom || 'Cher professionnel')
          .replace(/\{email\}/g, email);

        try {
          await mailer.sendMail({
            from: `"JADOMI" <noreply@jadomi.fr>`,
            to: email,
            subject: sujet,
            html: htmlPerso
          });
          envoyes++;
          resultats.push({ email, status: 'ok' });
        } catch (e) {
          erreurs++;
          resultats.push({ email, status: 'error', error: e.message });
        }

        // Rate limit
        if (envoyes + erreurs < destinataires.length) {
          await new Promise(r => setTimeout(r, DELAY));
        }
      }

      // Sauvegarder campagne en DB
      try {
        await supabase.from('mailing_campagnes').insert({
          sujet,
          profession_cible: segment || 'custom',
          nb_destinataires: destinataires.length,
          nb_envoyes: envoyes,
          nb_erreurs: erreurs,
          statut: 'envoye',
          type: 'campagne'
        });
      } catch (e) {}

      res.json({
        success: true,
        envoyes,
        erreurs,
        total: destinataires.length,
        resultats: resultats.slice(0, 20) // Limiter la réponse
      });
    } catch (e) {
      console.error('[ADMIN email campagne]', e.message);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // GET /api/admin/email/campagnes — Historique campagnes
  app.get('/api/admin/email/campagnes', requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('mailing_campagnes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      res.json({ success: true, campagnes: data || [] });
    } catch (e) {
      res.json({ success: true, campagnes: [] });
    }
  });

  // GET /api/admin/email/export/:segment — Export CSV
  app.get('/api/admin/email/export/:segment', requireAdmin, async (req, res) => {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      let allUsers = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 10) {
        const { data: { users } } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (!users || users.length === 0) break;
        allUsers = allUsers.concat(users);
        hasMore = users.length === 1000;
        page++;
      }

      const segment = req.params.segment;
      let filtered = allUsers;
      if (segment !== 'tous') {
        filtered = allUsers.filter(u => (u.user_metadata?.profession || '') === segment);
      }

      // CSV
      let csv = 'Email,Prenom,Nom,Profession,Date inscription\n';
      for (const u of filtered) {
        const m = u.user_metadata || {};
        csv += `${u.email},${m.prenom || ''},${m.nom || ''},${m.profession || ''},${u.created_at}\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="jadomi_${segment}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (e) {
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  console.log('[JADOMI] Module Admin Email monté (inbox, campagnes, segments, export)');
}

module.exports = { mountAdminEmail };
