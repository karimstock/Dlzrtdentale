// =============================================
// JADOMI MAIL COPILOT — branché sur le scanner existant
// Utilise comptes_email_societe (existant) + ajoute
// classification, réponses, composition, digest
// ZÉRO duplication avec le scanner server.js
// =============================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const agents = require('../../lib/brain/agents');
const scorer = require('../../lib/brain/mail-scorer');

// ===== Auth =====
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

let _supabase = null;
function db() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  }
  return _supabase;
}

// Rate limit
const rateBuckets = new Map();
function rateLimit() {
  return (req, res, next) => {
    const k = req.user?.id || req.ip;
    const now = Date.now();
    let b = rateBuckets.get(k);
    if (!b || now - b.s > 60000) { b = { s: now, c: 0 }; rateBuckets.set(k, b); }
    if (++b.c > 30) return res.status(429).json({ error: 'Trop de requêtes.' });
    next();
  };
}

router.use(requireAuth(), rateLimit());

// =============================================
// IMAP config (même que server.js)
// =============================================
const IMAP_CONFIGS = {
  gmail:   { host: 'imap.gmail.com',       port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
  yahoo:   { host: 'imap.mail.yahoo.com',  port: 993 },
  ovh:     { host: 'ssl0.ovh.net',         port: 993 },
  orange:  { host: 'imap.orange.fr',       port: 993 },
  free:    { host: 'imap.free.fr',         port: 993 },
};

const SMTP_CONFIGS = {
  gmail:   { host: 'smtp.gmail.com',        port: 587 },
  outlook: { host: 'smtp-mail.outlook.com', port: 587 },
  yahoo:   { host: 'smtp.mail.yahoo.com',   port: 587 },
  ovh:     { host: 'pro1.mail.ovh.net',     port: 587 },
  orange:  { host: 'smtp.orange.fr',        port: 587 },
  free:    { host: 'smtp.free.fr',          port: 587 },
};

// =============================================
// HELPERS : chiffrement/déchiffrement AES-GCM
// (même algo que comptes_email_societe existant)
// =============================================
function getEncKey() {
  return process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 32) || 'jadomi_default_enc_key__32chars!';
}

function encryptPassword(password) {
  const key = Buffer.from(getEncKey().padEnd(32, '0').substring(0, 32));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(password, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return { password_chiffre: enc, password_iv: iv.toString('hex'), password_tag: tag.toString('hex') };
}

function decryptPassword(row) {
  try {
    const key = Buffer.from(getEncKey().padEnd(32, '0').substring(0, 32));
    const iv = Buffer.from(row.password_iv, 'hex');
    const tag = Buffer.from(row.password_tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(row.password_chiffre, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    console.error('[MAIL] decrypt error:', e.message);
    return null;
  }
}

function buildImapConfig(account, password) {
  const provKey = (account.provider || '').toLowerCase();
  const conf = IMAP_CONFIGS[provKey] || {};
  return {
    host: account.custom_host || conf.host || 'imap.' + (account.email || '').split('@')[1],
    port: account.custom_port || conf.port || 993,
    secure: true,
    auth: { user: account.email, pass: password },
    tls: { rejectUnauthorized: false },
    logger: false
  };
}

// =============================================
// 1. COMPTES — utilise comptes_email_societe
// =============================================

// GET /api/brain/mail/status — état du daemon + dernière sync
router.get('/status', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const [accountsRes, unreadRes, needsRes] = await Promise.all([
      db().from('comptes_email_societe').select('id, email, provider, actif, dernier_scan, derniere_erreur').eq('societe_id', sid),
      db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid).eq('is_read', false).eq('is_spam', false).eq('is_newsletter', false),
      db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid).eq('needs_response', true).eq('replied', false)
    ]);
    res.json({
      accounts: accountsRes.data || [],
      unread: unreadRes.count || 0,
      needs_response: needsRes.count || 0,
      daemon: 'active'
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/brain/mail/accounts — comptes connectés de cette société
router.get('/accounts', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { data, error } = await db()
      .from('comptes_email_societe')
      .select('id, email, provider, actif, dernier_scan, derniere_erreur, custom_host')
      .eq('societe_id', sid)
      .order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/brain/mail/connect — tester + sauvegarder un compte dans comptes_email_societe
router.post('/connect', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const uid = req.user?.id;
    const { provider, email, password, host, port } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    // Mapping minuscule → valeur acceptée par le CHECK constraint
    const PROVIDER_MAP = {
      gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo',
      ovh: 'OVH', orange: 'Orange', free: 'Free',
      sfr: 'SFR', laposte: 'Laposte', custom: 'custom'
    };
    const provKey = (provider || 'custom').toLowerCase();
    const provDB = PROVIDER_MAP[provKey] || 'custom';
    const imapConf = IMAP_CONFIGS[provKey] || {};
    const imapConfig = {
      host: host || imapConf.host || 'imap.' + email.split('@')[1],
      port: port || imapConf.port || 993,
      secure: true,
      auth: { user: email, pass: password },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
      logger: false
    };

    // Test connexion IMAP
    const client = new ImapFlow(imapConfig);
    try {
      await client.connect();
      const mailbox = await client.status('INBOX', { messages: true, unseen: true });
      await client.logout();

      // Chiffrer et sauvegarder dans comptes_email_societe
      const enc = encryptPassword(password);
      const { error: upsertErr } = await db()
        .from('comptes_email_societe')
        .upsert({
          societe_id: sid,
          user_id: uid,
          email,
          provider: provDB,
          password_chiffre: enc.password_chiffre,
          password_iv: enc.password_iv,
          password_tag: enc.password_tag,
          custom_host: host || null,
          custom_port: port || null,
          actif: true,
          dernier_scan: new Date().toISOString(),
          derniere_erreur: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'societe_id,email', ignoreDuplicates: false });

      if (upsertErr) throw upsertErr;

      res.json({ ok: true, total_messages: mailbox.messages, unseen: mailbox.unseen });
    } catch (connErr) {
      let hint = 'Vérifiez vos identifiants.';
      if (connErr.message?.includes('AUTHENTICATIONFAILED')) {
        hint = provKey === 'gmail'
          ? 'Pour Gmail, créez un mot de passe d\'application sur myaccount.google.com → Sécurité → Mots de passe des applications.'
          : 'Mot de passe incorrect ou accès IMAP désactivé.';
      }
      res.status(401).json({ error: 'Connexion échouée', hint });
    }
  } catch (e) {
    console.error('[MAIL] connect error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/brain/mail/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    await db().from('comptes_email_societe').delete().eq('id', req.params.id).eq('societe_id', sid);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// =============================================
// 2. LIRE LES MAILS (depuis mails_inbox rempli par le daemon)
// =============================================

// GET /api/brain/mail/inbox — boîte de réception (lecture daemon)
router.get('/inbox', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { category, priority, unread, needs_response, limit: lim, offset } = req.query;

    let query = db()
      .from('mails_inbox')
      .select('*', { count: 'exact' })
      .eq('societe_id', sid)
      .eq('is_spam', false)
      .eq('is_newsletter', false)
      .order('date_received', { ascending: false });

    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);
    if (unread === 'true') query = query.eq('is_read', false);
    if (needs_response === 'true') query = query.eq('needs_response', true).eq('replied', false);

    query = query.range(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(lim) || 30) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ mails: data || [], total: count });
  } catch (e) {
    console.error('[MAIL-COPILOT] inbox error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/brain/mail/sync — forcer une sync maintenant
router.post('/sync', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { account_id, days } = req.body;

    // Récupérer le compte depuis comptes_email_societe
    const { data: account, error: accErr } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('id', account_id)
      .eq('societe_id', sid)
      .single();
    if (accErr || !account) return res.status(404).json({ error: 'Compte non trouvé' });

    const password = decryptPassword(account);
    if (!password) return res.status(500).json({ error: 'Impossible de déchiffrer les identifiants' });

    const imapConfig = buildImapConfig(account, password);
    const sinceDays = Math.min(parseInt(days) || 7, 30);
    const since = new Date(Date.now() - sinceDays * 86400000);

    // Lire les mails
    const mails = await fetchRecentMails(imapConfig, since, 50);

    // Classifier et sauvegarder dans cabinet_brain_documents (les factures)
    // + dans cabinet_brain_events (chaque mail lu)
    const classified = [];
    for (const mail of mails) {
      // Classification complète locale (spam + newsletter + catégorie + document financier)
      // Gratuit, < 1ms. Si "autre" → agent Mistral pour affiner
      let cat = scorer.classifyMailAdvanced(mail, sid);

      // Filtrer spam et newsletter
      if (cat.is_spam) { continue; } // on skip les spams

      // Si "autre" et le mail a du contenu → agent Mistral pour affiner
      if (cat.category === 'autre' && mail.subject && mail.subject.length > 5) {
        try { cat = { ...cat, ...await agents.classifyMailIA(mail) }; } catch (_) {}
      }
      classified.push({
        from: mail.fromName || mail.from,
        from_address: mail.from,
        subject: mail.subject,
        date: mail.date,
        category: cat.category,
        priority: cat.priority,
        has_pdf: cat.has_pdf || false,
        has_invoice: cat.has_invoice || false,
        has_devis: cat.has_devis || false,
        has_avoir: cat.has_avoir || false,
        is_newsletter: cat.is_newsletter || false,
        is_suspicious: cat.is_suspicious || false,
        financial_type: cat.financial?.type || null,
        financial_montant: cat.financial?.montant || null,
        spam_score: cat.spam_score || 0,
        needs_response: cat.needs_response || false,
        response_urgency: cat.response_urgency || 'none',
        response_type: cat.response_type || null,
        confidence: cat.confidence || 0,
        reason: cat.reason || '',
        is_read: mail.seen,
        preview: (mail.text || '').substring(0, 150),
        body_text: (mail.text || '').substring(0, 1000)
      });

      // Si c'est une facture PDF → indexer dans brain_documents
      if (cat.category === 'facture' || cat.category === 'fournisseur') {
        const pdfAtt = (mail.attachments || []).find(a => isPdf(a));
        if (pdfAtt) {
          try {
            const checksum = crypto.createHash('md5').update(mail.messageId || mail.date + mail.from).digest('hex');
            await db().from('cabinet_brain_documents').upsert({
              societe_id: sid,
              title: pdfAtt.filename || mail.subject,
              doc_type: 'facture',
              source: 'mail',
              content_text: 'Facture reçue par mail de ' + (mail.fromName || mail.from) + ' — ' + mail.subject,
              metadata: { from: mail.from, subject: mail.subject, date_mail: mail.date, filename: pdfAtt.filename },
              checksum
            }, { onConflict: 'societe_id,checksum' });
          } catch (_) { /* doublon ou erreur, on continue */ }
        }
      }
    }

    // Mettre à jour le compte
    await db().from('comptes_email_societe').update({
      dernier_scan: new Date().toISOString(),
      derniere_erreur: null
    }).eq('id', account.id);

    res.json({ synced: classified.length, mails: classified });
  } catch (e) {
    console.error('[MAIL] sync error:', e.message);
    // Sauvegarder l'erreur
    if (req.body?.account_id) {
      try { await db().from('comptes_email_societe').update({ derniere_erreur: e.message }).eq('id', req.body.account_id); } catch (_) {}
    }
    res.status(500).json({ error: 'Erreur de synchronisation : ' + e.message });
  }
});

// =============================================
// 3. PRÉPARER UNE RÉPONSE
// =============================================

// POST /api/brain/mail/draft — brouillon de réponse
router.post('/draft', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { from_address, subject, body_preview, instruction } = req.body;

    if (!from_address || !subject) return res.status(400).json({ error: 'Expéditeur et objet requis' });

    // Contexte Brain du cabinet
    const { data: brain } = await db()
      .from('cabinet_brain')
      .select('identity, contacts, preferences')
      .eq('societe_id', sid)
      .maybeSingle();

    // Agent Rédacteur spécialisé
    const mailData = { from_address, from_name: from_address, subject, body_preview };
    let draft = await agents.draftReply(mailData, instruction, brain || {});

    const { validateResponse } = require('../../lib/ai-studio/jadomi-brain');
    if (!validateResponse(draft).ok) draft = 'Brouillon en cours de vérification.';

    res.json({
      draft,
      to: from_address,
      subject: 'Re: ' + (subject || '').replace(/^Re:\s*/i, '')
    });
  } catch (e) {
    console.error('[MAIL] draft error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 4. ENVOYER UN MAIL
// =============================================

router.post('/send', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { account_id, to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'Destinataire, objet et contenu requis' });

    const { data: account } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('id', account_id)
      .eq('societe_id', sid)
      .single();
    if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

    const password = decryptPassword(account);
    if (!password) return res.status(500).json({ error: 'Erreur déchiffrement' });

    const provKey = (account.provider || '').toLowerCase();
    const smtp = SMTP_CONFIGS[provKey] || { host: (account.custom_host || '').replace('imap', 'smtp'), port: 587 };

    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: false,
      auth: { user: account.email, pass: password },
      tls: { rejectUnauthorized: false }
    });

    const info = await transporter.sendMail({
      from: account.email, to, subject,
      text: body,
      html: body.replace(/\n/g, '<br>')
    });

    // Logger dans brain events
    await db().from('cabinet_brain_events').insert({
      societe_id: sid, user_id: req.user?.id,
      event_type: 'mail_sent',
      context: { to, subject, message_id: info.messageId, account: account.email }
    });

    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    console.error('[MAIL] send error:', e.message);
    res.status(500).json({ error: 'Erreur d\'envoi : ' + e.message });
  }
});

// =============================================
// 5. COMPOSER — JADOMI écrit un mail from scratch
// =============================================

router.post('/compose', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { instruction } = req.body;
    if (!instruction) return res.status(400).json({ error: 'Instruction requise' });

    const { data: brain } = await db()
      .from('cabinet_brain')
      .select('identity, contacts, preferences')
      .eq('societe_id', sid)
      .maybeSingle();

    // Agent Compositeur spécialisé
    const result = await agents.composeMail(instruction, brain || {});

    res.json(result);
  } catch (e) {
    console.error('[MAIL] compose error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// LIRE UN MAIL — télécharge le contenu complet à la demande
// =============================================
router.post('/read', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { mail_id } = req.body;
    if (!mail_id) return res.status(400).json({ error: 'mail_id requis' });

    // Récupérer le mail en base
    const { data: mail } = await db().from('mails_inbox')
      .select('*')
      .eq('id', mail_id)
      .eq('societe_id', sid)
      .single();
    if (!mail) return res.status(404).json({ error: 'Mail non trouvé' });

    // Si on a déjà le body, le retourner
    if (mail.body_preview && mail.body_preview.length > 100) {
      return res.json({ id: mail.id, body: mail.body_preview, html: null, from: mail.from_name || mail.from_address, subject: mail.subject, date: mail.date_received, attachments: mail.metadata?.attachments || [] });
    }

    // Sinon, télécharger le contenu depuis IMAP
    const { data: account } = await db().from('comptes_email_societe')
      .select('*')
      .eq('id', mail.account_id)
      .single();
    if (!account) return res.json({ id: mail.id, body: '(Contenu non disponible — compte déconnecté)', from: mail.from_name, subject: mail.subject, date: mail.date_received });

    const password = decryptPassword(account);
    if (!password) return res.json({ id: mail.id, body: '(Erreur déchiffrement)', from: mail.from_name, subject: mail.subject, date: mail.date_received });

    const imapConfig = buildImapConfig(account, password);
    const client = new ImapFlow({ ...imapConfig, logger: false });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      // Chercher le mail par date (approximation) puis matcher par message_id
      const searchDate = mail.date_received ? new Date(new Date(mail.date_received).getTime() - 86400000) : new Date('2024-01-01');
      const seqs = await client.search({ since: searchDate });
      const recent = seqs.slice(-200); // chercher dans les 200 plus récents depuis cette date

      let foundBody = null;
      let foundHtml = null;
      let foundAttachments = [];

      for await (const msg of client.fetch(recent.join(','), { source: true }, { uid: false })) {
        try {
          const parsed = await simpleParser(msg.source);
          if (parsed.messageId === mail.message_id ||
              (parsed.from?.value?.[0]?.address === mail.from_address &&
               parsed.subject === mail.subject &&
               Math.abs(new Date(parsed.date) - new Date(mail.date_received)) < 60000)) {
            foundBody = parsed.text || '';
            foundHtml = parsed.html || null;
            foundAttachments = (parsed.attachments || []).map(a => ({
              filename: a.filename,
              contentType: a.contentType,
              size: a.size
            }));
            break;
          }
        } catch (_) {}
      }

      lock.release();
      await client.logout();

      // Sauvegarder le body en base pour pas re-fetcher
      if (foundBody) {
        await db().from('mails_inbox').update({
          body_preview: foundBody.substring(0, 2000),
          has_attachments: foundAttachments.length > 0,
          has_pdf: foundAttachments.some(a => a.contentType?.includes('pdf') || a.filename?.endsWith('.pdf')),
          metadata: { ...mail.metadata, attachments: foundAttachments }
        }).eq('id', mail.id);
      }

      res.json({
        id: mail.id,
        body: foundBody || '(Contenu non trouvé)',
        html: foundHtml,
        from: mail.from_name || mail.from_address,
        subject: mail.subject,
        date: mail.date_received,
        category: mail.category,
        attachments: foundAttachments
      });
    } catch (imapErr) {
      try { await client.logout(); } catch (_) {}
      res.json({ id: mail.id, body: '(Erreur IMAP : ' + imapErr.message + ')', from: mail.from_name, subject: mail.subject, date: mail.date_received });
    }
  } catch (e) {
    console.error('[MAIL-COPILOT] read error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// SCAN FACTURES AUTO — réutilise analyserDocumentIA de server.js
// Même résultat que le scanner compta mais automatique
// =============================================
router.post('/scan-factures', async (req, res) => {
  req.setTimeout(600000); // 10 min
  res.setTimeout(600000);
  try {
    const sid = req.societe?.id || req.societeId;
    const { account_id, mois, annee } = req.body;

    const { data: account } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('id', account_id)
      .eq('societe_id', sid)
      .single();
    if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

    const password = decryptPassword(account);
    if (!password) return res.status(500).json({ error: 'Erreur déchiffrement' });

    // Période
    const m = parseInt(mois) || new Date().getMonth() + 1;
    const y = parseInt(annee) || new Date().getFullYear();
    const sinceDate = new Date(y, m - 1, 1);
    const untilDate = new Date(y, m, 1);

    const imapConfig = buildImapConfig(account, password);
    imapConfig.connTimeout = 60000;
    const client = new ImapFlow({ ...imapConfig, logger: false });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    // Chercher les mails de ce mois (sequence numbers)
    const seqs = await client.search({ since: sinceDate });

    const documents = [];
    let scanned = 0;
    let claudeCalls = 0;
    const MAX_CLAUDE = 50; // max 50 analyses Claude par scan

    // Mots-clés financiers pour pré-filtrer
    const FINANCIER = ['facture', 'invoice', 'reçu', 'receipt', 'commande', 'order', 'paiement', 'payment', 'règlement', 'quittance', 'échéance', 'avoir', 'bordereau'];
    const FOURNISSEURS = ['gacd', 'henry schein', 'mega dental', 'dpi', 'septodont', 'anthogyr', 'straumann', 'promodentaire', 'dentalclick', 'dental evolution', 'edf', 'engie', 'ovh', 'free', 'orange'];

    // Fetch par batch de 30 (source complète pour analyser les PDF)
    for (let i = 0; i < seqs.length; i += 30) {
      if (claudeCalls >= MAX_CLAUDE) break;

      const batch = seqs.slice(i, i + 30);
      if (batch.length === 0) break;

      for await (const msg of client.fetch(batch.join(','), { source: true, flags: true }, { uid: false })) {
        try {
          const parsed = await simpleParser(msg.source, { skipTextToHtml: true, skipImageLinks: true });

          // Filtre par date (mois exact)
          const mailDate = parsed.date ? new Date(parsed.date) : null;
          if (mailDate && (mailDate < sinceDate || mailDate >= untilDate)) continue;

          const subject = (parsed.subject || '').toLowerCase();
          const from = (parsed.from?.text || '').toLowerCase();
          const atts = parsed.attachments || [];
          const hasPDF = atts.some(a => String(a.contentType || '').includes('pdf') || String(a.filename || '').endsWith('.pdf'));

          // Pré-filtre : vaut la peine d'analyser ?
          const isFinancier = FINANCIER.some(k => subject.includes(k)) || FOURNISSEURS.some(f => from.includes(f));
          if (!hasPDF && !isFinancier) continue;

          scanned++;

          // Analyser les PJ PDF avec Claude (même fonction que le scanner existant)
          for (const att of atts) {
            if (!String(att.contentType || '').includes('pdf') && !String(att.filename || '').endsWith('.pdf')) continue;
            if (claudeCalls >= MAX_CLAUDE) break;

            try {
              const base64 = att.content.toString('base64');

              // NIVEAU 1 : Mistral Pixtral pre-tri (0.001 EUR) — "c'est une facture ?"
              let isRealInvoice = true;
              try {
                const iaRouter = require('../../lib/ia-router');
                const preCheck = await iaRouter.mistralVision(base64,
                  'Ce document est-il une facture, un devis, un avoir ou un document comptable ? Reponds OUI ou NON uniquement.',
                  { maxTokens: 10 });
                isRealInvoice = !/\bNON\b/i.test(preCheck);
                if (!isRealInvoice) { console.log('[SCAN] Skip:', att.filename, '(pas facture)'); continue; }
              } catch (_) {} // Mistral echoue → on analyse quand meme

              // NIVEAU 2 : Claude extraction (uniquement les vraies factures)
              const Anthropic = require('@anthropic-ai/sdk');
              const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
              claudeCalls++;
              const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 1500,
                system: 'Tu es un expert-comptable cabinet dentaire FR. Réponds UNIQUEMENT en JSON valide.',
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                    { type: 'text', text: 'Analyse cette facture/document. Retourne en JSON: {"type_document":"facture|devis|avoir|charge_cabinet|note_frais|salaire|honoraires|autre","fournisseur_ou_etablissement":"nom","date":"AAAA-MM-JJ","numero_facture":"ref ou null","total_ht":0,"tva":0,"total_ttc":0,"selectionne":true,"ajouter_au_stock":false,"produits":[{"designation":"nom","ref":"ref","quantite":1,"prix_unitaire":0}]}' }
                  ]
                }]
              });

              const text = response.content?.[0]?.text || '';
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const analyse = JSON.parse(jsonMatch[0]);
                documents.push({
                  from: parsed.from?.text || '',
                  date_mail: parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : '',
                  subject: parsed.subject || '',
                  filename: att.filename || 'document.pdf',
                  analyse,
                  selectionne: analyse.selectionne !== false
                });
              }
            } catch (claudeErr) {
              console.warn('[SCAN-FACTURES] Claude error:', claudeErr.message);
            }
          }

          // Si pas de PDF mais mail financier, analyser le texte du body
          if (!hasPDF && isFinancier && parsed.text && claudeCalls < MAX_CLAUDE) {
            const bodyText = (parsed.text || '').substring(0, 2000);
            if (/facture\s*n|montant|total.*ttc|total.*ht/i.test(bodyText)) {
              documents.push({
                from: parsed.from?.text || '',
                date_mail: parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : '',
                subject: parsed.subject || '',
                filename: '(dans le corps du mail)',
                analyse: {
                  type_document: 'facture',
                  fournisseur_ou_etablissement: parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address || '',
                  date: parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : null,
                  selectionne: true
                },
                selectionne: true
              });
            }
          }
        } catch (_) {}
      }
    }

    lock.release();
    await client.logout();

    const moisNom = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][m - 1];

    res.json({
      ok: true,
      mois: moisNom + ' ' + y,
      documents,
      total_scanned: scanned,
      claude_calls: claudeCalls,
      total_factures: documents.length
    });
  } catch (e) {
    console.error('[SCAN-FACTURES] error:', e.message);
    res.status(500).json({ error: 'Erreur : ' + e.message });
  }
});

// =============================================
// IMPORT BULK — charge TOUS les mails d'un coup (headers only)
// 1000 mails en ~1 seconde. Classification locale instantanée.
// =============================================
router.post('/bulk-import', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const { account_id } = req.body;

    const { data: account, error: accErr } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('id', account_id)
      .eq('societe_id', sid)
      .single();
    if (accErr || !account) return res.status(404).json({ error: 'Compte non trouvé' });

    const password = decryptPassword(account);
    if (!password) return res.status(500).json({ error: 'Erreur déchiffrement' });

    const imapConfig = buildImapConfig(account, password);
    imapConfig.connTimeout = 60000;

    const client = new ImapFlow({ ...imapConfig, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    const seqs = await client.search({ since: new Date('2026-01-01') });
    const total = seqs.length;

    // Fetch tous les headers en bulk
    const mails = [];
    for await (const msg of client.fetch(seqs.join(','), {
      headers: ['from', 'subject', 'date', 'message-id'],
      flags: true
    }, { uid: false })) {
      try {
        const parsed = await simpleParser(msg.headers);
        const fromAddr = parsed.from?.value?.[0]?.address || '';
        const fromName = parsed.from?.value?.[0]?.name || '';
        const subject = parsed.subject || '(sans objet)';
        const date = parsed.date?.toISOString() || new Date().toISOString();
        const messageId = parsed.messageId || msg.seq.toString();
        const mailUid = crypto.createHash('md5').update(messageId + account.email).digest('hex');

        // Classification locale (instantanée, 0€)
        const mail = { from: fromAddr, fromName, subject, text: '', attachments: [], headers: {} };
        const cat = scorer.classifyMailAdvanced(mail, sid);

        mails.push({
          societe_id: sid,
          account_id: account.id,
          mail_uid: mailUid,
          message_id: messageId,
          from_address: fromAddr,
          from_name: fromName,
          subject,
          body_preview: '',
          date_received: date,
          is_read: msg.flags?.has('\\Seen') || false,
          category: cat.category,
          priority: cat.priority,
          has_attachments: false,
          has_pdf: false,
          needs_response: cat.needs_response || false,
          response_urgency: cat.response_urgency || 'none',
          response_type: cat.response_type || null,
          is_spam: cat.is_spam || false,
          is_newsletter: cat.is_newsletter || false,
          financial_type: cat.financial?.type || null,
          financial_montant: cat.financial?.montant || null,
          metadata: { reason: cat.reason, confidence: cat.confidence }
        });
      } catch (_) {}
    }

    lock.release();

    // Aussi scanner les Envoyés pour marquer les répondus
    const sentMails = [];
    try {
      const folders = await client.list();
      const sentFolder = folders.find(f => f.specialUse === '\\Sent' || /^(Sent|Envoy)/i.test(f.path));
      if (sentFolder) {
        const sentLock = await client.getMailboxLock(sentFolder.path);
        const sentSeqs = await client.search({ since: new Date('2026-01-01') });
        for await (const msg of client.fetch(sentSeqs.join(','), {
          headers: ['to', 'subject', 'date'],
          flags: true
        }, { uid: false })) {
          try {
            const parsed = await simpleParser(msg.headers);
            sentMails.push({
              to: parsed.to?.value?.[0]?.address || '',
              subject: (parsed.subject || '').replace(/^Re:\s*/i, '').toLowerCase().trim()
            });
          } catch (_) {}
        }
        sentLock.release();
      }
    } catch (_) {}

    await client.logout();

    // Marquer les mails répondus
    if (sentMails.length > 0) {
      for (const m of mails) {
        const inboxSubject = (m.subject || '').replace(/^Re:\s*/i, '').toLowerCase().trim();
        if (sentMails.some(s => s.subject === inboxSubject && s.to === m.from_address)) {
          m.replied = true;
          m.needs_response = false;
        }
      }
    }

    // Insert en bulk par batch de 100 (upsert)
    let inserted = 0;
    for (let i = 0; i < mails.length; i += 100) {
      const batch = mails.slice(i, i + 100);
      const { error } = await db().from('mails_inbox').upsert(batch, { onConflict: 'societe_id,mail_uid' });
      if (!error) inserted += batch.length;
    }

    // Mettre à jour le compte
    await db().from('comptes_email_societe').update({
      dernier_scan: new Date().toISOString(),
      derniere_erreur: null
    }).eq('id', account.id);

    res.json({
      ok: true,
      total_found: total,
      imported: inserted,
      sent_checked: sentMails.length,
      replied_marked: mails.filter(m => m.replied).length
    });
  } catch (e) {
    console.error('[MAIL-COPILOT] bulk-import error:', e.message);
    res.status(500).json({ error: 'Erreur import : ' + e.message });
  }
});

// =============================================
// CAPTURE FACTURES AUTO — 2ème passe
// Télécharge le contenu complet UNIQUEMENT des mails
// classés facture/fournisseur, extrait les PDF, indexe
// =============================================
router.post('/capture-factures', async (req, res) => {
  req.setTimeout(300000); // 5 min max
  res.setTimeout(300000);
  try {
    const sid = req.societe?.id || req.societeId;
    const { account_id } = req.body;

    const { data: account } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('id', account_id)
      .eq('societe_id', sid)
      .single();
    if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

    const password = decryptPassword(account);
    if (!password) return res.status(500).json({ error: 'Erreur déchiffrement' });

    // Récupérer les mails facture/fournisseur pas encore scannés pour PDF
    const { data: mailsToScan } = await db()
      .from('mails_inbox')
      .select('id, mail_uid, message_id, from_address, from_name, subject, date_received, category')
      .eq('societe_id', sid)
      .eq('account_id', account.id)
      .in('category', ['facture', 'fournisseur', 'comptable', 'banque', 'assurance', 'labo'])
      .eq('has_pdf', false)
      .order('date_received', { ascending: false })
      .limit(100);

    if (!mailsToScan || mailsToScan.length === 0) {
      return res.json({ ok: true, scanned: 0, factures_found: 0, message: 'Aucun mail à scanner.' });
    }

    // Se connecter IMAP
    const imapConfig = buildImapConfig(account, password);
    imapConfig.connTimeout = 60000;
    const client = new ImapFlow({ ...imapConfig, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    // Chercher les mails par message-id et télécharger le contenu complet
    let facturesFound = 0;
    let scanned = 0;

    // On doit retrouver ces mails par leur sujet+date (pas d'UID fiable sur Yahoo)
    // Stratégie : search par date, fetch avec source, matcher par message_id
    const dates = [...new Set(mailsToScan.map(m => m.date_received?.split('T')[0]).filter(Boolean))];
    const oldestDate = dates.sort()[0] || '2026-01-01';

    const seqs = await client.search({ since: new Date(oldestDate) });

    // Fetch par batch de 20 (avec source complète cette fois)
    for (let i = 0; i < seqs.length; i += 20) {
      const batch = seqs.slice(i, i + 20);
      if (batch.length === 0) break;

      for await (const msg of client.fetch(batch.join(','), { source: true, flags: true }, { uid: false })) {
        try {
          const parsed = await simpleParser(msg.source);
          const msgId = parsed.messageId || '';

          // Est-ce que ce mail est dans notre liste à scanner ?
          const match = mailsToScan.find(m => m.message_id === msgId);
          if (!match) continue;

          scanned++;

          // Chercher les PJ PDF
          const pdfAttachments = (parsed.attachments || []).filter(a =>
            String(a.contentType || '').includes('pdf') || String(a.filename || '').endsWith('.pdf')
          );

          const hasAnyAttachment = (parsed.attachments || []).length > 0;

          // Mettre à jour le mail dans mails_inbox
          const updates = {
            has_attachments: hasAnyAttachment,
            has_pdf: pdfAttachments.length > 0,
            body_preview: (parsed.text || '').substring(0, 500)
          };

          // Détecter le type financier plus précisément avec le body
          if (parsed.text) {
            const bodyLower = (parsed.text || '').toLowerCase();
            if (/facture|invoice/.test(bodyLower) && !/proforma|pro.forma/.test(bodyLower)) {
              updates.financial_type = 'facture';
            } else if (/devis|quote|proposition/.test(bodyLower)) {
              updates.financial_type = 'devis';
            } else if (/avoir|credit.note/.test(bodyLower)) {
              updates.financial_type = 'avoir';
            }
            // Extraire le montant
            const montantMatch = bodyLower.match(/(?:total|montant|ttc|net)\s*[:\s]*(\d[\d\s]*[.,]\d{2})\s*(?:€|eur)/i);
            if (montantMatch) {
              const montant = parseFloat(montantMatch[1].replace(/\s/g, '').replace(',', '.'));
              if (montant > 0 && montant < 500000) updates.financial_montant = montant;
            }
          }

          await db().from('mails_inbox').update(updates).eq('id', match.id);

          // Facture dans le CORPS du mail (pas de PDF joint)
          if (pdfAttachments.length === 0 && parsed.text) {
            const bodyText = (parsed.text || '').substring(0, 3000);
            const isInvoiceInBody = /facture\s*n[°o]|invoice\s*#|montant\s*ttc|total\s*[àa]\s*r[eé]gler|r[eé]f[eé]rence\s*commande|bon\s*de\s*commande/i.test(bodyText);
            if (isInvoiceInBody) {
              facturesFound++;
              const checksum = crypto.createHash('md5').update('body:' + msgId).digest('hex');
              await db().from('cabinet_brain_documents').upsert({
                societe_id: sid,
                title: 'Facture (corps mail) — ' + (match.from_name || match.from_address),
                doc_type: updates.financial_type || 'facture',
                source: 'mail',
                content_text: bodyText.substring(0, 1000),
                metadata: {
                  from: match.from_address,
                  from_name: match.from_name,
                  subject: match.subject,
                  date_mail: match.date_received,
                  type: 'inline_invoice',
                  montant: updates.financial_montant,
                  mail_id: match.id
                },
                checksum
              }, { onConflict: 'societe_id,checksum' });
            }
          }

          // Si PDF trouvé → indexer dans cabinet_brain_documents
          if (pdfAttachments.length > 0) {
            for (const pdf of pdfAttachments) {
              facturesFound++;
              const checksum = crypto.createHash('md5').update('pdf:' + msgId + ':' + (pdf.filename || '')).digest('hex');
              await db().from('cabinet_brain_documents').upsert({
                societe_id: sid,
                title: pdf.filename || match.subject,
                doc_type: updates.financial_type || 'facture',
                source: 'mail',
                content_text: (match.from_name || match.from_address) + ' — ' + match.subject +
                  (updates.financial_montant ? ' — ' + updates.financial_montant + ' EUR' : ''),
                metadata: {
                  from: match.from_address,
                  from_name: match.from_name,
                  subject: match.subject,
                  date_mail: match.date_received,
                  filename: pdf.filename,
                  size: pdf.size,
                  montant: updates.financial_montant,
                  mail_id: match.id
                },
                file_size: pdf.size,
                mime_type: 'application/pdf',
                checksum
              }, { onConflict: 'societe_id,checksum' });
            }
          }
        } catch (_) {}
      }

      // Log progression
      if (i > 0 && i % 100 === 0) console.log('[CAPTURE-FACTURES] ' + scanned + '/' + mailsToScan.length + ' scannés, ' + facturesFound + ' factures PDF trouvées');
    }

    lock.release();
    await client.logout();

    res.json({
      ok: true,
      scanned,
      factures_found: facturesFound,
      total_to_scan: mailsToScan.length
    });
  } catch (e) {
    console.error('[MAIL-COPILOT] capture-factures error:', e.message);
    res.status(500).json({ error: 'Erreur : ' + e.message });
  }
});

// =============================================
// HELPERS
// =============================================

async function fetchRecentMails(imapConfig, since, maxMails) {
  const mails = [];
  const client = new ImapFlow({ ...imapConfig, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ since }, { uid: true });
      const recent = uids.slice(-maxMails);
      for await (const msg of client.fetch(recent, { envelope: true, source: true, flags: true })) {
        try {
          const parsed = await simpleParser(msg.source);
          mails.push({
            messageId: parsed.messageId || msg.uid.toString(),
            from: parsed.from?.value?.[0]?.address || '',
            fromName: parsed.from?.value?.[0]?.name || '',
            to: parsed.to?.value?.[0]?.address || '',
            subject: parsed.subject || '(sans objet)',
            text: parsed.text || '',
            date: parsed.date?.toISOString() || new Date().toISOString(),
            seen: msg.flags?.has('\\Seen') || false,
            attachments: (parsed.attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size }))
          });
        } catch (_) {}
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    console.error('[MAIL] fetch error:', e.message);
    try { await client.logout(); } catch (_) {}
  }
  return mails;
}

function isPdf(att) {
  return String(att?.contentType || '').includes('pdf') || String(att?.filename || '').endsWith('.pdf');
}

// Classification locale (0€, instantané)
function classifyMail(mail) {
  const all = ((mail.from || '') + ' ' + (mail.fromName || '') + ' ' + (mail.subject || '') + ' ' + (mail.text || '').substring(0, 300)).toLowerCase();

  const rules = [
    { keys: ['gacd','henry schein','mega dental','dpi','septodont','anthogyr','straumann','promodentaire','dentalclick','dental evolution','leone','godentaire'], cat: 'fournisseur', pri: 'normal' },
    { keys: ['comptable','expert-comptable','bilan','liasse','déclaration tva','cotisations','urssaf','cfe','trésor public'], cat: 'comptable', pri: 'high' },
    { keys: ['banque','cic','credit mutuel','bnp','societe generale','caisse epargne','lcl','prelevement','virement','solde','releve'], cat: 'banque', pri: 'normal' },
    { keys: ['laboratoire','prothes','labo','ceramique','zircone','couronne','bridge','empreinte'], cat: 'labo', pri: 'normal' },
    { keys: ['rendez-vous','rdv','annulation','doctolib','patient'], cat: 'patient', pri: 'normal' },
    { keys: ['macsf','assurance','rcp','sinistre','attestation'], cat: 'assurance', pri: 'normal' },
    { keys: ['facture','invoice','paiement','règlement','échéance','reçu'], cat: 'facture', pri: 'normal' },
    { keys: ['urgent','rappel','relance','impayé','mise en demeure','dernier avis'], cat: 'urgent', pri: 'urgent' },
  ];

  for (const r of rules) {
    if (r.keys.some(k => all.includes(k))) return { category: r.cat, priority: r.pri };
  }
  return { category: 'autre', priority: 'low' };
}

module.exports = router;
