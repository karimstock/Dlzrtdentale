// SSE Scan Factures — extrait du copilot pour clarté
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

module.exports = async function scanFacturesSSE(req, res, db) {
  // Auth manuelle (EventSource ne supporte pas les headers)
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  const sid = req.query.sid || req.headers['x-societe-id'];
  if (!token || !sid) { res.status(401).json({ error: 'auth manquante' }); return; }

  const { createClient } = require('@supabase/supabase-js');
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) { res.status(401).json({ error: 'invalid_token' }); return; }

  const mois = parseInt(req.query.mois) || new Date().getMonth() + 1;
  const annee = parseInt(req.query.annee) || new Date().getFullYear();

  // SSE
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  function send(data) { try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) {} }

  try {
    const { data: accs } = await db().from('comptes_email_societe').select('*').eq('societe_id', sid).eq('actif', true).limit(1);
    if (!accs || accs.length === 0) { send({ done: true, error: 'Aucun compte connecte' }); res.end(); return; }
    const account = accs[0];

    // Decrypt
    const encKey = process.env.ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 32) || 'jadomi_default_enc_key__32chars!';
    const key = Buffer.from(encKey.padEnd(32, '0').substring(0, 32));
    const iv = Buffer.from(account.password_iv, 'hex');
    const tag = Buffer.from(account.password_tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let pass = decipher.update(account.password_chiffre, 'hex', 'utf8') + decipher.final('utf8');

    const IMAP = { gmail:{host:'imap.gmail.com',port:993}, outlook:{host:'outlook.office365.com',port:993}, yahoo:{host:'imap.mail.yahoo.com',port:993}, ovh:{host:'ssl0.ovh.net',port:993}, orange:{host:'imap.orange.fr',port:993}, free:{host:'imap.free.fr',port:993} };
    const prov = (account.provider || '').toLowerCase();
    const conf = IMAP[prov] || {};

    send({ status: 'connecting', progress: 0, message: 'Connexion...' });

    const client = new ImapFlow({
      host: account.custom_host || conf.host || 'imap.' + account.email.split('@')[1],
      port: account.custom_port || conf.port || 993,
      secure: true, auth: { user: account.email, pass },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
      logger: false, connTimeout: 60000
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const sinceDate = new Date(annee, mois - 1, 1);
    const untilDate = new Date(annee, mois, 1);
    const seqs = await client.search({ since: sinceDate });

    send({ status: 'scanning', progress: 5, message: seqs.length + ' mails...' });

    const FIN = ['facture','invoice','commande','order','paiement','payment','avoir','bordereau','quittance'];
    const FOUR = ['gacd','henry schein','mega dental','dpi','septodont','anthogyr','straumann','edf','engie','ovh','free','orange','anthropic'];

    const documents = [];
    let done = 0, claudeCalls = 0, MAX = 50;

    for (let i = 0; i < seqs.length; i += 30) {
      if (claudeCalls >= MAX) break;
      const batch = seqs.slice(i, i + 30);

      for await (const msg of client.fetch(batch.join(','), { source: true, flags: true }, { uid: false })) {
        try {
          const parsed = await simpleParser(msg.source, { skipTextToHtml: true, skipImageLinks: true });
          const mailDate = parsed.date ? new Date(parsed.date) : null;
          if (mailDate && (mailDate < sinceDate || mailDate >= untilDate)) { done++; continue; }

          const subject = (parsed.subject || '').toLowerCase();
          const from = (parsed.from?.text || '').toLowerCase();
          const atts = parsed.attachments || [];
          const hasPDF = atts.some(a => String(a.contentType||'').includes('pdf') || String(a.filename||'').endsWith('.pdf'));
          const isFin = FIN.some(k => subject.includes(k)) || FOUR.some(f => from.includes(f));
          done++;
          if (!hasPDF && !isFin) continue;

          send({ status: 'analyzing', progress: Math.round((done/seqs.length)*90)+5, message: (parsed.from?.value?.[0]?.name || '').substring(0,30), found: documents.length, done, total: seqs.length });

          for (const att of atts) {
            if (!String(att.contentType||'').includes('pdf') && !String(att.filename||'').endsWith('.pdf')) continue;
            if (claudeCalls >= MAX) break;

            const base64 = att.content.toString('base64');

            // Mistral pre-tri
            let isReal = true;
            try {
              const iaRouter = require('../../lib/ia-router');
              const chk = await iaRouter.mistralVision(base64, 'Document comptable (facture/devis/avoir) ? OUI ou NON.', { maxTokens: 10 });
              isReal = !/\bNON\b/i.test(chk);
              if (!isReal) continue;
            } catch (_) {}

            claudeCalls++;
            send({ status: 'analyzing', progress: Math.round((done/seqs.length)*90)+5, message: 'JADOMI IA analyse ' + (att.filename||'PDF'), found: documents.length, claude: claudeCalls });

            const Anthropic = require('@anthropic-ai/sdk');
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const resp = await anthropic.messages.create({
              model: 'claude-sonnet-4-6', max_tokens: 3000,
              system: 'Expert-comptable dentaire FR. JSON uniquement.',
              messages: [{ role: 'user', content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: 'JSON: {"type_document":"facture|devis|avoir|charge|note_frais|salaire|honoraires|autre","fournisseur_ou_etablissement":"","date":"AAAA-MM-JJ","numero_facture":"","total_ht":0,"tva":0,"total_ttc":0,"selectionne":true,"produits":[{"designation":"","ref":"","quantite":1,"prix_unitaire":0}]}' }
              ]}]
            });
            const text = resp.content?.[0]?.text || '';
            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
              const a = JSON.parse(m[0]);
              documents.push({ from: parsed.from?.text||'', date_mail: parsed.date?.toISOString()?.slice(0,10)||'', subject: parsed.subject||'', filename: att.filename||'doc.pdf', analyse: a, selectionne: a.selectionne !== false });
              send({ status: 'found', progress: Math.round((done/seqs.length)*90)+5, message: (a.fournisseur_ou_etablissement||'?') + ' — ' + (a.total_ttc||'?') + ' EUR', found: documents.length });
            }
          }
        } catch (_) { done++; }
      }
    }

    lock.release();
    await client.logout();

    const moisNom = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][mois-1];
    send({ done: true, status: 'complete', progress: 100, mois: moisNom + ' ' + annee, documents, total_scanned: done, claude_calls: claudeCalls, total_factures: documents.length });
    res.end();
  } catch (e) {
    send({ done: true, error: e.message });
    res.end();
  }
};
