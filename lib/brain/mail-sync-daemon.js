// =============================================
// JADOMI MAIL SYNC DAEMON
// Tourne en fond via node-cron.
// Toutes les 5 minutes, sync tous les comptes actifs.
// Classe, indexe, détecte les mails qui attendent une réponse.
// Le dentiste ne touche à rien.
// =============================================

const cron = require('node-cron');
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const scorer = require('./mail-scorer');

let _supabase = null;
function db() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  }
  return _supabase;
}

// Config IMAP par provider
const IMAP_CONFIGS = {
  gmail:   { host: 'imap.gmail.com',       port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
  yahoo:   { host: 'imap.mail.yahoo.com',  port: 993 },
  ovh:     { host: 'ssl0.ovh.net',         port: 993 },
  orange:  { host: 'imap.orange.fr',       port: 993 },
  free:    { host: 'imap.free.fr',         port: 993 },
};

// Déchiffrement AES-GCM (même algo que comptes_email_societe)
function decryptPassword(row) {
  try {
    const encKey = process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 32) || 'jadomi_default_enc_key__32chars!';
    const key = Buffer.from(encKey.padEnd(32, '0').substring(0, 32));
    const iv = Buffer.from(row.password_iv, 'hex');
    const tag = Buffer.from(row.password_tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(row.password_chiffre, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return null;
  }
}

// Sync UN compte
async function syncAccount(account) {
  const password = decryptPassword(account);
  if (!password) {
    console.warn('[MAIL-DAEMON] Cannot decrypt account', account.email);
    await db().from('comptes_email_societe').update({ derniere_erreur: 'Déchiffrement impossible' }).eq('id', account.id);
    return 0;
  }

  const provKey = (account.provider || '').toLowerCase();
  const conf = IMAP_CONFIGS[provKey] || {};
  const imapConfig = {
    host: account.custom_host || conf.host || 'imap.' + (account.email || '').split('@')[1],
    port: account.custom_port || conf.port || 993,
    secure: true,
    auth: { user: account.email, pass: password },
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
    logger: false,
    connTimeout: 30000,
    authTimeout: 30000,
  };

  const client = new ImapFlow(imapConfig);
  let synced = 0;

  const since = account.dernier_scan
    ? new Date(new Date(account.dernier_scan).getTime() - 3600000)
    : new Date('2026-01-01T00:00:00Z');

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {

      // Sequence numbers (pas UIDs — Yahoo refuse UID FETCH)
      const seqs = await client.search({ since });
      // Max 30 mails par sync cycle — les doublons sont ignorés (upsert)
      const batch = seqs.slice(-30);
      if (batch.length === 0) { lock.release(); await client.logout(); return synced; }

      for await (const msg of client.fetch(batch.join(','), { source: true, flags: true }, { uid: false })) {
        try {
          const parsed = await simpleParser(msg.source);
          const mailUid = crypto.createHash('md5').update((parsed.messageId || msg.seq.toString()) + account.email).digest('hex');

          const mail = {
            from: parsed.from?.value?.[0]?.address || '',
            fromName: parsed.from?.value?.[0]?.name || '',
            to: parsed.to?.value?.[0]?.address || '',
            subject: parsed.subject || '(sans objet)',
            text: (parsed.text || '').substring(0, 1000),
            html: parsed.html || '',
            date: parsed.date?.toISOString() || new Date().toISOString(),
            seen: msg.flags?.has('\\Seen') || false,
            attachments: (parsed.attachments || []).map(a => ({
              filename: a.filename || '', contentType: a.contentType || '', size: a.size || 0
            })),
            headers: {
              'list-unsubscribe': parsed.headers?.get('list-unsubscribe') || null,
              'list-id': parsed.headers?.get('list-id') || null,
              'precedence': parsed.headers?.get('precedence') || null,
            }
          };

          const cat = scorer.classifyMailAdvanced(mail, account.societe_id);

          // Upsert dans mails_inbox (ignore doublons)
          const { error } = await db().from('mails_inbox').upsert({
            societe_id: account.societe_id,
            account_id: account.id,
            mail_uid: mailUid,
            message_id: parsed.messageId,
            from_address: mail.from,
            from_name: mail.fromName,
            to_address: mail.to,
            subject: mail.subject,
            body_preview: (mail.text || '').substring(0, 500),
            date_received: mail.date,
            is_read: mail.seen,
            category: cat.category,
            priority: cat.priority,
            financial_type: cat.financial?.type || null,
            financial_montant: cat.financial?.montant || null,
            has_attachments: mail.attachments.length > 0,
            has_pdf: cat.has_pdf || false,
            needs_response: cat.needs_response || false,
            response_urgency: cat.response_urgency || 'none',
            response_type: cat.response_type || null,
            is_spam: cat.is_spam || false,
            is_newsletter: cat.is_newsletter || false,
            metadata: {
              attachments: mail.attachments.map(a => ({ filename: a.filename, size: a.size })),
              reason: cat.reason,
              confidence: cat.confidence,
              response_signals: cat.response_signals || []
            }
          }, { onConflict: 'societe_id,mail_uid' });

          if (!error) synced++;

          // Si facture détectée → indexer dans brain_documents
          if ((cat.has_invoice || cat.has_devis || cat.has_avoir) && cat.has_pdf) {
            const pdfAtt = mail.attachments.find(a =>
              String(a.contentType || '').includes('pdf') || String(a.filename || '').endsWith('.pdf')
            );
            try {
              const docChecksum = crypto.createHash('md5').update('mail:' + mailUid).digest('hex');
              await db().from('cabinet_brain_documents').upsert({
                societe_id: account.societe_id,
                title: (pdfAtt?.filename || mail.subject),
                doc_type: cat.has_invoice ? 'facture' : cat.has_devis ? 'devis' : 'avoir',
                source: 'mail',
                content_text: (cat.financial?.type || '') + ' de ' + (mail.fromName || mail.from) + ' — ' + mail.subject +
                  (cat.financial?.montant ? ' — ' + cat.financial.montant + ' €' : ''),
                metadata: {
                  from: mail.from, subject: mail.subject, date_mail: mail.date,
                  filename: pdfAtt?.filename, montant: cat.financial?.montant,
                  financial_type: cat.financial?.type
                },
                checksum: docChecksum
              }, { onConflict: 'societe_id,checksum' });
            } catch (_) {}
          }

        } catch (parseErr) {
          // Un mail mal formé ne doit pas crasher le daemon
        }
      }
    } finally {
      lock.release();
    }

    // Scan Envoyés désactivé du daemon 5min (trop lent pour Yahoo)
    // Le check des répondus est fait dans le bulk import à la place

    await client.logout();

    // Mettre à jour le compte
    await db().from('comptes_email_societe').update({
      dernier_scan: new Date().toISOString(),
      derniere_erreur: null,
      updated_at: new Date().toISOString()
    }).eq('id', account.id);

  } catch (e) {
    console.error('[MAIL-DAEMON] sync error', account.email, ':', e.message);
    await db().from('comptes_email_societe').update({
      derniere_erreur: e.message,
      updated_at: new Date().toISOString()
    }).eq('id', account.id);
    try { await client.logout(); } catch (_) {}
  }

  return synced;
}

// Sync TOUS les comptes actifs
async function syncAllAccounts() {
  try {
    const { data: accounts, error } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('actif', true)
      .not('password_chiffre', 'is', null);

    if (error || !accounts || accounts.length === 0) return;

    let totalSynced = 0;
    for (const account of accounts) {
      // Vérifier la fréquence (défaut 5 min)
      const freq = (account.frequence_minutes || 5) * 60 * 1000;
      const lastScan = account.dernier_scan ? new Date(account.dernier_scan).getTime() : 0;
      if (Date.now() - lastScan < freq) continue; // pas encore le moment

      const synced = await syncAccount(account);
      totalSynced += synced;

      // Petit délai entre les comptes pour pas surcharger
      if (accounts.length > 1) await new Promise(r => setTimeout(r, 2000));
    }

    if (totalSynced > 0) {
      console.log(`[MAIL-DAEMON] ${totalSynced} mails synchronisés sur ${accounts.length} compte(s)`);
    }
  } catch (e) {
    console.error('[MAIL-DAEMON] syncAll error:', e.message);
  }
}

// =============================================
// SCAN FACTURES AUTOMATIQUE QUOTIDIEN
// Tourne à 6h du matin, analyse les PDF de la veille
// =============================================
async function dailyInvoiceScan() {
  try {
    const { data: accounts } = await db()
      .from('comptes_email_societe')
      .select('*')
      .eq('actif', true)
      .not('password_chiffre', 'is', null);

    if (!accounts || accounts.length === 0) return;

    for (const account of accounts) {
      const password = decryptPassword(account);
      if (!password) continue;

      const provKey = (account.provider || '').toLowerCase();
      const conf = IMAP_CONFIGS[provKey] || {};
      const client = new ImapFlow({
        host: account.custom_host || conf.host || 'imap.' + (account.email || '').split('@')[1],
        port: account.custom_port || conf.port || 993,
        secure: true, auth: { user: account.email, pass: password },
        tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
        logger: false, connTimeout: 60000
      });

      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');

        // Mails des dernières 24h
        const yesterday = new Date(Date.now() - 86400000);
        const seqs = await client.search({ since: yesterday });

        const FINANCIER = ['facture', 'invoice', 'commande', 'order', 'paiement', 'payment', 'avoir', 'quittance'];
        const FOURNISSEURS = ['gacd', 'henry schein', 'mega dental', 'dpi', 'septodont', 'anthogyr', 'straumann', 'edf', 'engie', 'ovh', 'anthropic'];

        let facturesFound = 0;

        for (let i = 0; i < seqs.length; i += 20) {
          const batch = seqs.slice(i, i + 20);
          if (batch.length === 0) break;

          for await (const msg of client.fetch(batch.join(','), { source: true }, { uid: false })) {
            try {
              const parsed = await simpleParser(msg.source, { skipTextToHtml: true });
              const subject = (parsed.subject || '').toLowerCase();
              const from = (parsed.from?.text || '').toLowerCase();
              const atts = parsed.attachments || [];
              const hasPDF = atts.some(a => String(a.contentType || '').includes('pdf') || String(a.filename || '').endsWith('.pdf'));
              const isFin = FINANCIER.some(k => subject.includes(k)) || FOURNISSEURS.some(f => from.includes(f));

              if (!hasPDF || !isFin) continue;

              for (const att of atts) {
                if (!String(att.contentType || '').includes('pdf') && !String(att.filename || '').endsWith('.pdf')) continue;

                const base64 = att.content.toString('base64');
                const msgId = parsed.messageId || '';

                // Vérifier si déjà indexé
                const checksum = crypto.createHash('md5').update('autoscan:' + msgId + ':' + (att.filename || '')).digest('hex');
                const { data: existing } = await db().from('cabinet_brain_documents')
                  .select('id').eq('societe_id', account.societe_id).eq('checksum', checksum).maybeSingle();
                if (existing) continue; // déjà scanné

                // Mistral pré-tri
                let isReal = true;
                try {
                  const iaRouter = require('../ia-router');
                  const chk = await iaRouter.mistralVision(base64, 'Document comptable (facture/devis/avoir) ? OUI ou NON.', { maxTokens: 10 });
                  isReal = !/\bNON\b/i.test(chk);
                } catch (_) {}
                if (!isReal) continue;

                // Claude extraction
                try {
                  const Anthropic = require('@anthropic-ai/sdk');
                  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                  const resp = await anthropic.messages.create({
                    model: 'claude-sonnet-4-6', max_tokens: 3000,
                    system: 'Expert-comptable dentaire FR. JSON uniquement.',
                    messages: [{ role: 'user', content: [
                      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                      { type: 'text', text: 'JSON: {"type_document":"facture|devis|avoir|charge|autre","fournisseur":"","date":"AAAA-MM-JJ","numero":"","total_ht":0,"tva":0,"total_ttc":0}' }
                    ]}]
                  });
                  const text = resp.content?.[0]?.text || '';
                  const m = text.match(/\{[\s\S]*\}/);
                  if (m) {
                    const analyse = JSON.parse(m[0]);
                    await db().from('cabinet_brain_documents').upsert({
                      societe_id: account.societe_id,
                      title: att.filename || analyse.fournisseur || parsed.subject,
                      doc_type: analyse.type_document || 'facture',
                      source: 'auto_scan',
                      content_text: (analyse.fournisseur || '') + ' — ' + (analyse.total_ttc ? analyse.total_ttc + ' EUR TTC' : '') + ' — ' + (analyse.date || ''),
                      metadata: {
                        ...analyse,
                        from: parsed.from?.value?.[0]?.address,
                        from_name: parsed.from?.value?.[0]?.name,
                        subject: parsed.subject,
                        filename: att.filename,
                        auto_scanned: true,
                        scan_date: new Date().toISOString()
                      },
                      checksum
                    }, { onConflict: 'societe_id,checksum' });
                    facturesFound++;
                  }
                } catch (claudeErr) {
                  console.warn('[AUTO-SCAN] Claude error:', claudeErr.message);
                }
              }
            } catch (_) {}
          }
        }

        lock.release();
        await client.logout();

        if (facturesFound > 0) {
          console.log('[AUTO-SCAN] ' + facturesFound + ' facture(s) capturée(s) pour ' + account.email);
          // Créer une tâche Brain pour notifier le dentiste
          await db().from('cabinet_brain_tasks').insert({
            societe_id: account.societe_id,
            title: facturesFound + ' nouvelle(s) facture(s) triée(s) automatiquement',
            description: 'JADOMI a analysé vos mails et trouvé ' + facturesFound + ' facture(s) PDF. Consultez "Mes documents" pour les valider.',
            category: 'compta',
            priority: 'normal',
            created_by: 'brain',
            source_type: 'auto_scan'
          });
        }
      } catch (e) {
        console.error('[AUTO-SCAN] error', account.email, ':', e.message);
        try { await client.logout(); } catch (_) {}
      }
    }
  } catch (e) {
    console.error('[AUTO-SCAN] global error:', e.message);
  }
}

// Démarrer le daemon
function startMailDaemon() {
  // Sync mails toutes les 5 minutes
  cron.schedule('*/5 * * * *', () => {
    syncAllAccounts().catch(e => console.error('[MAIL-DAEMON] cron error:', e.message));
  });

  // Scan factures automatique à 6h du matin (Europe/Paris)
  cron.schedule('0 6 * * *', () => {
    console.log('[AUTO-SCAN] Lancement scan factures quotidien...');
    dailyInvoiceScan().catch(e => console.error('[AUTO-SCAN] cron error:', e.message));
  }, { timezone: 'Europe/Paris' });

  // Premier sync 30s après le démarrage
  setTimeout(() => {
    syncAllAccounts().catch(e => console.error('[MAIL-DAEMON] initial sync error:', e.message));
  }, 30000);

  console.log('[JADOMI] Mail Daemon démarré (sync 5min + scan factures 6h quotidien)');
}

module.exports = { startMailDaemon, syncAllAccounts, syncAccount };
