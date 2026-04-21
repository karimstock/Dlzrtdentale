// =============================================
// JADOMI Admin — Module Email complet
// Boite reception IMAP + Campagnes mailing + Stats
// Ne touche PAS admin.js — fichier separe
// =============================================

const express = require('express');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'jadomi_admin_karim_2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karim_bahmed@yahoo.fr';

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

// Mailer reutilisable
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
function fetchInbox({ limit = 50, since } = {}) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      host: 'pro2.mail.ovh.net',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000
    });

    const messages = [];
    const timeout = setTimeout(() => {
      try { imap.end(); } catch (e) {}
      resolve(messages);
    }, 15000);

    imap.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) { clearTimeout(timeout); imap.end(); return reject(err); }

        const criteria = since ? [['SINCE', since]] : ['ALL'];
        imap.search(criteria, (err, uids) => {
          if (err) { clearTimeout(timeout); imap.end(); return reject(err); }
          if (!uids || !uids.length) { clearTimeout(timeout); imap.end(); return resolve([]); }

          // Prendre les derniers messages
          const toFetch = uids.slice(-limit).reverse();
          const f = imap.fetch(toFetch, { bodies: '', struct: true });
          let pending = toFetch.length;

          f.on('message', (msg, seqno) => {
            let buffer = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
            });
            msg.once('attributes', (attrs) => {
              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  messages.push({
                    uid: attrs.uid,
                    seqno,
                    date: parsed.date || attrs.date,
                    from: parsed.from?.text || '',
                    from_address: parsed.from?.value?.[0]?.address || '',
                    to: parsed.to?.text || '',
                    subject: parsed.subject || '(sans objet)',
                    text: (parsed.text || '').slice(0, 500),
                    html: parsed.html || null,
                    flags: attrs.flags || [],
                    seen: (attrs.flags || []).includes('\\Seen'),
                    attachments: (parsed.attachments || []).map(a => ({
                      filename: a.filename, size: a.size, contentType: a.contentType
                    }))
                  });
                } catch (e) {}
                pending--;
                if (pending <= 0) { clearTimeout(timeout); imap.end(); resolve(messages); }
              });
            });
          });

          f.once('error', () => { clearTimeout(timeout); imap.end(); resolve(messages); });
          f.once('end', () => {
            if (pending <= 0) { clearTimeout(timeout); imap.end(); resolve(messages); }
          });
        });
      });
    });

    imap.connect();
  });
}

// Marquer lu/non lu via IMAP
function setFlags(uid, flags, add = true) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASS,
      host: 'pro2.mail.ovh.net',
      port: 993, tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000
    });

    imap.once('error', reject);
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err); }
        const method = add ? 'addFlags' : 'delFlags';
        imap[method](uid, flags, (err) => {
          imap.end();
          if (err) reject(err); else resolve(true);
        });
      });
    });
    imap.connect();
  });
}

// ===== MOUNT ROUTES =====
function mountAdminEmail(app, supabase) {
  // ------- BOITE RECEPTION -------

  // GET /api/admin/email/inbox — Lire boite reception
  app.get('/api/admin/email/inbox', requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const since = req.query.since || null;
      const messages = await fetchInbox({ limit, since });
      // Trier par date decroissante
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
      const unread = messages.filter(m => !m.seen).length;
      res.json({ success: true, messages, total: messages.length, unread });
    } catch (e) {
      console.error('[ADMIN email inbox]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/email/reply — Repondre a un email
  app.post('/api/admin/email/reply', requireAdmin, async (req, res) => {
    try {
      const { to, subject, html, in_reply_to } = req.body;
      if (!to || !html) return res.status(400).json({ error: 'to et html requis' });
      const mailer = getMailer();
      if (!mailer) return res.status(503).json({ error: 'SMTP non configure' });

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
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/admin/email/:uid/read — Marquer lu
  app.patch('/api/admin/email/:uid/read', requireAdmin, async (req, res) => {
    try {
      await setFlags(parseInt(req.params.uid), ['\\Seen'], true);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/admin/email/:uid/unread — Marquer non lu
  app.patch('/api/admin/email/:uid/unread', requireAdmin, async (req, res) => {
    try {
      await setFlags(parseInt(req.params.uid), ['\\Seen'], false);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
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
        prothesiste: { label: 'Prothesistes', icon: '🔬', users: [] },
        veterinaire: { label: 'Veterinaires', icon: '🐾', users: [] },
        dirigeant: { label: 'Dirigeants societe', icon: '🏢', users: [] },
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

      // Stats resume
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
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/email/campagne — Envoyer campagne mailing
  app.post('/api/admin/email/campagne', requireAdmin, async (req, res) => {
    try {
      const { sujet, html, segment, destinataires_override } = req.body;
      if (!sujet || !html) return res.status(400).json({ error: 'sujet et html requis' });

      const mailer = getMailer();
      if (!mailer) return res.status(503).json({ error: 'SMTP non configure' });

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
        resultats: resultats.slice(0, 20) // Limiter la reponse
      });
    } catch (e) {
      console.error('[ADMIN email campagne]', e.message);
      res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[JADOMI] Module Admin Email monte (inbox, campagnes, segments, export)');
}

module.exports = { mountAdminEmail };
