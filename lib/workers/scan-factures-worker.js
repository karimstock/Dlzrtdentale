// =============================================
// JADOMI — Worker child_process pour scan factures
// Isolé en mémoire (--max-old-space-size=256)
// Reçoit params via process.on('message')
// Envoie progress/done/error via process.send()
// =============================================

'use strict';

const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

// Supabase client local au worker
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

function getEncKey() {
  return process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 32) || 'jadomi_default_enc_key__32chars!';
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
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
    logger: false
  };
}

// Force GC si disponible (lancer avec --expose-gc pour activer)
function tryGC() {
  if (global.gc) {
    try { global.gc(); } catch (_) {}
  }
}

// Mots-clés financiers
const FINANCIER = ['facture', 'invoice', 'reçu', 'receipt', 'commande', 'order', 'paiement', 'payment', 'règlement', 'quittance', 'échéance', 'avoir', 'bordereau'];
const FOURNISSEURS = ['gacd', 'henry schein', 'mega dental', 'dpi', 'septodont', 'anthogyr', 'straumann', 'promodentaire', 'dentalclick', 'dental evolution', 'edf', 'engie', 'ovh', 'free', 'orange', 'anthropic'];

// =============================================
// MODE API — scan pour un compte + mois donné
// (appelé depuis POST /scan-factures)
// =============================================
async function scanApiMode(params) {
  const { societeId, accountId, mois, annee } = params;

  const { data: account } = await db()
    .from('comptes_email_societe')
    .select('*')
    .eq('id', accountId)
    .eq('societe_id', societeId)
    .single();
  if (!account) throw new Error('Compte non trouvé');

  const password = decryptPassword(account);
  if (!password) throw new Error('Erreur déchiffrement');

  const m = parseInt(mois) || new Date().getMonth() + 1;
  const y = parseInt(annee) || new Date().getFullYear();
  const sinceDate = new Date(y, m - 1, 1);
  const untilDate = new Date(y, m, 1);

  const imapConfig = buildImapConfig(account, password);
  imapConfig.connTimeout = 60000;
  const client = new ImapFlow({ ...imapConfig, logger: false });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  const seqs = await client.search({ since: sinceDate });

  const documents = [];
  let scanned = 0;
  let claudeCalls = 0;
  const MAX_CLAUDE = 50;

  for (let i = 0; i < seqs.length; i += 30) {
    if (claudeCalls >= MAX_CLAUDE) break;

    const batch = seqs.slice(i, i + 30);
    if (batch.length === 0) break;

    for await (const msg of client.fetch(batch.join(','), { source: true, flags: true }, { uid: false })) {
      try {
        const parsed = await simpleParser(msg.source, { skipTextToHtml: true, skipImageLinks: true });

        const mailDate = parsed.date ? new Date(parsed.date) : null;
        if (mailDate && (mailDate < sinceDate || mailDate >= untilDate)) continue;

        const subject = (parsed.subject || '').toLowerCase();
        const from = (parsed.from?.text || '').toLowerCase();
        const atts = parsed.attachments || [];
        const hasPDF = atts.some(a => String(a.contentType || '').includes('pdf') || String(a.filename || '').endsWith('.pdf'));

        const isFinancier = FINANCIER.some(k => subject.includes(k)) || FOURNISSEURS.some(f => from.includes(f));
        if (!hasPDF && !isFinancier) continue;

        scanned++;

        // Analyser les PJ PDF
        for (const att of atts) {
          if (!String(att.contentType || '').includes('pdf') && !String(att.filename || '').endsWith('.pdf')) continue;
          if (claudeCalls >= MAX_CLAUDE) break;

          try {
            const base64 = att.content.toString('base64');

            // NIVEAU 1 : Mistral Pixtral pre-tri
            let isRealInvoice = true;
            try {
              const iaRouter = require('../../lib/ia-router');
              const preCheck = await iaRouter.mistralVision(base64,
                'Ce document est-il une facture, un devis, un avoir ou un document comptable ? Reponds OUI ou NON uniquement.',
                { maxTokens: 10 });
              isRealInvoice = !/\bNON\b/i.test(preCheck);
              if (!isRealInvoice) { console.log('[SCAN-WORKER] Skip:', att.filename, '(pas facture)'); continue; }
            } catch (_) {}

            // NIVEAU 2 : Claude extraction
            const Anthropic = require('@anthropic-ai/sdk');
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            claudeCalls++;
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 3000,
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
              let jsonStr = jsonMatch[0];
              try {
                JSON.parse(jsonStr);
              } catch (_) {
                let opens = 0, closes = 0;
                for (const c of jsonStr) { if (c === '{' || c === '[') opens++; if (c === '}' || c === ']') closes++; }
                const lastComplete = Math.max(jsonStr.lastIndexOf('}'), jsonStr.lastIndexOf(']'));
                if (lastComplete > 10) jsonStr = jsonStr.substring(0, lastComplete + 1);
                while (opens > closes) { jsonStr += (jsonStr.includes('"produits"') && opens - closes > 1) ? ']' : '}'; closes++; }
              }
              try {
                const analyse = JSON.parse(jsonStr);
                documents.push({
                  from: parsed.from?.text || '',
                  date_mail: parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : '',
                  subject: parsed.subject || '',
                  filename: att.filename || 'document.pdf',
                  analyse,
                  selectionne: analyse.selectionne !== false
                });
              } catch (jsonErr) {
                console.warn('[SCAN-WORKER] JSON irrécupérable pour', att.filename);
              }
            }

            // Libérer la mémoire du base64 après chaque PDF
            tryGC();
          } catch (claudeErr) {
            console.warn('[SCAN-WORKER] Claude error:', claudeErr.message?.substring(0, 80));
          }
        }

        // Mail financier sans PDF
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

        // Envoyer la progression
        if (process.send) {
          process.send({ type: 'progress', scanned, claudeCalls, documents: documents.length });
        }
      } catch (_) {}
    }
  }

  lock.release();
  await client.logout();

  const moisNom = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][m - 1];

  return {
    ok: true,
    mois: moisNom + ' ' + y,
    documents,
    total_scanned: scanned,
    claude_calls: claudeCalls,
    total_factures: documents.length
  };
}

// =============================================
// MODE DAEMON — scan automatique quotidien
// (appelé depuis dailyInvoiceScan dans mail-sync-daemon)
// =============================================
async function scanDaemonMode(params) {
  const { accounts } = params;
  let totalFactures = 0;

  for (const account of accounts) {
    const password = decryptPassword(account);
    if (!password) continue;

    const imapConfig = buildImapConfig(account, password);
    imapConfig.connTimeout = 60000;
    const client = new ImapFlow({ ...imapConfig, logger: false });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      const yesterday = new Date(Date.now() - 86400000);
      const seqs = await client.search({ since: yesterday });

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
              if (existing) continue;

              // Mistral pré-tri
              let isReal = true;
              try {
                const iaRouter = require('../../lib/ia-router');
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
                console.warn('[SCAN-WORKER] Claude error:', claudeErr.message);
              }

              // Libérer mémoire entre chaque PDF
              tryGC();
            }
          } catch (_) {}
        }
      }

      lock.release();
      await client.logout();

      if (facturesFound > 0) {
        console.log('[SCAN-WORKER] ' + facturesFound + ' facture(s) capturée(s) pour ' + account.email);
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

      totalFactures += facturesFound;

      // Envoyer progression par compte
      if (process.send) {
        process.send({ type: 'progress', account: account.email, facturesFound, totalFactures });
      }
    } catch (e) {
      console.error('[SCAN-WORKER] error', account.email, ':', e.message);
      try { await client.logout(); } catch (_) {}
    }
  }

  return { ok: true, totalFactures };
}

// =============================================
// POINT D'ENTRÉE — écoute les messages du parent
// =============================================
let workerBusy = false;

process.on('message', async (msg) => {
  if (workerBusy) {
    if (process.send) process.send({ type: 'error', error: 'Worker déjà occupé' });
    return;
  }
  workerBusy = true;

  try {
    let result;
    if (msg.mode === 'daemon') {
      result = await scanDaemonMode(msg);
      if (process.send) process.send({ type: 'done', result });
    } else {
      // Mode API par défaut
      result = await scanApiMode(msg);
      if (process.send) process.send({ type: 'done', result });
    }
  } catch (e) {
    console.error('[SCAN-WORKER] Fatal:', e.message);
    if (process.send) process.send({ type: 'error', error: e.message });
  } finally {
    workerBusy = false;
    // Exit propre après le travail
    setTimeout(() => process.exit(0), 1000);
  }
});

// Timeout global : 10 minutes max puis exit propre
setTimeout(() => {
  console.warn('[SCAN-WORKER] Timeout 10 minutes — exit forcé');
  process.exit(1);
}, 600000);

// Signal de prêt
if (process.send) process.send({ type: 'ready' });
console.log('[SCAN-WORKER] Worker démarré, en attente de message...');
