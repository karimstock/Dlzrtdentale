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
