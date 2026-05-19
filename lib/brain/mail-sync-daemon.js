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

          // Fourmilière : émettre l'événement mail_received sur le bus
          try {
            const { bus } = require('../shared-intelligence');
            bus.emit('mail_received', {
              societeId: account.societe_id,
              mailUid: mailUid,
              category: cat.category,
              priority: cat.priority,
              needsResponse: cat.needs_response,
              hasInvoice: cat.has_invoice,
              from: mail.from,
              subject: mail.subject,
            });
          } catch (_busErr) { /* fourmilière pas montée — pas bloquant */ }

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

    // Fork du worker isolé en mémoire (256MB max)
    const { fork } = require('child_process');
    const path = require('path');
    const workerPath = path.join(__dirname, '../workers/scan-factures-worker.js');

    return new Promise((resolve) => {
      const worker = fork(workerPath, [], {
        execArgv: ['--max-old-space-size=256'],
        env: process.env
      });

      worker.send({ mode: 'daemon', accounts });

      worker.on('message', async (msg) => {
        if (msg.type === 'done') {
          console.log('[AUTO-SCAN] Worker terminé :', JSON.stringify(msg.result));

          // ── POST-SCAN : auto-classification compta + rapport matinal ──
          try {
            const totalFactures = msg.result?.totalFactures || 0;
            if (totalFactures > 0) {
              // 1. Auto-catégoriser les nouvelles factures dans la compta
              const COMPTA_KEYWORDS = {
                fournisseur_dentaire: ['gacd','henry schein','mega dental','septodont','dentsply','kerr','ivoclar'],
                charge_cabinet: ['edf','engie','loyer','syndic','copropriete'],
                telecom: ['ovh','free','orange','sfr','bouygues','anthropic'],
                formation: ['formation','congres','dfcg','cerp'],
                assurance: ['macsf','axa','allianz','mma'],
                salaire: ['urssaf','carcdsf','prevoyance','mutuelle'],
              };

              const { data: newDocs } = await db()
                .from('cabinet_brain_documents')
                .select('id, title, content_text, metadata')
                .eq('source', 'auto_scan')
                .is('metadata->compta_validated', null)
                .gte('created_at', new Date(Date.now() - 86400000).toISOString())
                .limit(100);

              let categorized = 0;
              for (const doc of (newDocs || [])) {
                const text = ((doc.title || '') + ' ' + (doc.content_text || '') + ' ' + (doc.metadata?.fournisseur || '')).toLowerCase();
                let category = 'autre';
                for (const [cat, keywords] of Object.entries(COMPTA_KEYWORDS)) {
                  if (keywords.some(k => text.includes(k))) { category = cat; break; }
                }
                await db().from('cabinet_brain_documents')
                  .update({ metadata: { ...doc.metadata, compta_category: category, compta_auto_classified: true } })
                  .eq('id', doc.id);
                categorized++;
              }

              // 1bis. Extraire les prix remisés des factures → prix_cabinet
              let prixExtraits = 0;
              for (const doc of (newDocs || [])) {
                const meta = doc.metadata || {};
                const fournisseur = meta.fournisseur || meta.from_name || '';
                const produits = meta.produits || [];
                const factureDate = meta.date || null;
                const factureRef = meta.numero_facture || null;

                if (!fournisseur || produits.length === 0) continue;

                for (const p of produits) {
                  if (!p.designation || !p.prix_unitaire_ht) continue;
                  const societeId = doc.societe_id || (accounts[0] && accounts[0].societe_id);
                  if (!societeId) continue;

                  try {
                    await db().from('prix_cabinet').upsert({
                      societe_id: societeId,
                      product_name: p.designation,
                      brand: p.marque || null,
                      reference_fournisseur: p.ref_fournisseur || p.ref || null,
                      reference_fabricant: p.ref_fabricant || null,
                      supplier_name: fournisseur.toLowerCase().replace(/\s+/g, ''),
                      prix_remise_ht: parseFloat(p.prix_unitaire_ht) || 0,
                      prix_catalogue_ht: p.prix_catalogue_ht ? parseFloat(p.prix_catalogue_ht) : null,
                      remise_percent: (p.prix_catalogue_ht && p.prix_unitaire_ht)
                        ? Math.round((1 - p.prix_unitaire_ht / p.prix_catalogue_ht) * 100)
                        : null,
                      conditionnement: p.conditionnement || null,
                      source: 'facture_scan',
                      facture_date: factureDate,
                      facture_ref: factureRef,
                      document_id: doc.id,
                      derniere_maj: new Date().toISOString().substring(0, 10),
                      updated_at: new Date().toISOString(),
                    }, { onConflict: 'societe_id,supplier_name,product_name', ignoreDuplicates: false });
                    prixExtraits++;
                  } catch (_) {}
                }
              }
              if (prixExtraits > 0) console.log(`[AUTO-SCAN] ${prixExtraits} prix remisés extraits des factures`);

              // 2. Stocker le rapport matinal pour le copilot
              for (const acc of accounts) {
                await db().from('cabinet_brain_events').insert({
                  societe_id: acc.societe_id,
                  event_type: 'morning_scan_report',
                  context: {
                    total_factures: totalFactures,
                    categorized,
                    scan_date: new Date().toISOString().substring(0, 10),
                  }
                }).catch(() => {});
              }

              console.log(`[AUTO-SCAN] Post-scan : ${categorized} facture(s) auto-classée(s)`);
            }
          } catch (postErr) {
            console.warn('[AUTO-SCAN] Post-scan compta error:', postErr.message);
          }

          if (!worker.killed) worker.kill();
          resolve();
        } else if (msg.type === 'error') {
          console.error('[AUTO-SCAN] Worker error:', msg.error);
          if (!worker.killed) worker.kill();
          resolve();
        } else if (msg.type === 'progress') {
          console.log('[AUTO-SCAN] Progress:', msg.account, '—', msg.facturesFound, 'factures');
        }
      });

      worker.on('error', (err) => {
        console.error('[AUTO-SCAN] Worker process error:', err.message);
        resolve();
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error('[AUTO-SCAN] Worker exit code:', code);
        }
        resolve();
      });

      // Timeout 10 min
      setTimeout(() => {
        if (!worker.killed) {
          console.warn('[AUTO-SCAN] Worker timeout 10 min — kill');
          worker.kill();
        }
        resolve();
      }, 600000);
    });
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
