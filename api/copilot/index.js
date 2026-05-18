// =============================================
// JADOMI COPILOT — API backend global
// UN seul endpoint qui gère tout : mails, stock,
// commandes, questions, écriture, vocal
// =============================================
const express = require('express');
const router = express.Router();
const { buildSystemPrompt, validateResponse } = require('../../lib/ai-studio/jadomi-brain');
const { sanitizeForExternalAPI } = require('../../lib/ai-studio/data-guard');

// Auth
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
const buckets = new Map();
function rateLimit() {
  return (req, res, next) => {
    const k = req.user?.id || req.ip;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || now - b.s > 60000) { b = { s: now, c: 0 }; buckets.set(k, b); }
    if (++b.c > 120) return res.status(429).json({ error: 'Trop de requêtes.' });
    next();
  };
}

router.use(requireAuth(), rateLimit());

// Scan factures POST (après auth middleware)
router.post('/scan-factures', async (req, res) => {
  req.setTimeout(600000); res.setTimeout(600000);
  try {
    const sid = req.societe?.id || req.societeId;
    const { account_id, mois, annee } = req.body;
    let aid = account_id;
    if (!aid) { const { data: accs } = await db().from('comptes_email_societe').select('id').eq('societe_id', sid).eq('actif', true).limit(1); if (!accs?.length) return res.json({ error: 'Aucun compte connecte' }); aid = accs[0].id; }
    const http = require('http');
    const body = JSON.stringify({ account_id: aid, mois, annee });
    const pReq = http.request({ hostname: 'localhost', port: 3001, path: '/api/brain/mail/scan-factures', method: 'POST', timeout: 600000,
      headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization, 'X-Societe-Id': sid, 'Content-Length': Buffer.byteLength(body) }
    }, pRes => { let d = ''; pRes.on('data', c => d += c); pRes.on('end', () => { try { res.json(JSON.parse(d)); } catch (_) { res.json({ error: 'Erreur parse' }); } }); });
    pReq.setTimeout(600000); pReq.on('error', e => res.json({ error: e.message })); pReq.write(body); pReq.end();
  } catch (e) { res.json({ error: e.message }); }
});

// =============================================
// DEEPSEEK INTENT PARSER (pour requêtes ambiguës)
// Coût : ~0.00003€ par requête. Quasi gratuit.
// =============================================
async function deepseekParseIntent(message) {
  try {
    if (!process.env.DEEPSEEK_API_KEY) return null;
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' });

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 200,
      temperature: 0,
      messages: [
        { role: 'system', content: `Tu es un parseur d'intent pour un assistant de cabinet dentaire. Tu retournes UNIQUEMENT du JSON.

ACTIONS POSSIBLES :
- search_mail : chercher des mails (par expéditeur, sujet, catégorie)
- list_mail : lister les mails d'une période
- compose_mail : écrire/envoyer un mail
- search_patient : chercher un patient
- check_agenda : consulter le planning
- check_stock : consulter le stock
- check_factures : voir les factures/devis
- greeting : salutation
- help : demande d'aide
- general : question générale

CATÉGORIES MAIL : fournisseur, comptable, banque, labo, patient, assurance, facture, juridique, rh, formation, ordre, impots, commercial, notaire, cpam, mutuelle, informatique, immobilier, maintenance

FORMAT JSON :
{"action":"search_mail","search_term":"nom ou mot-clé","category":"notaire","since":"2026-01-01","until":null}
{"action":"compose_mail","to_role":"comptable","instruction":"dire que j'envoie les docs vendredi"}
{"action":"list_mail","period":"today","filter":"important"}
{"action":"check_agenda","date":"demain"}

RÈGLES :
- "mon notaire" / "mon comptable" / "ma banque" → category, PAS search_term
- "depuis 2026" → since: "2026-01-01"
- "depuis 2 semaines" → calcule la date
- "du mois" → since: premier jour du mois en cours
- JAMAIS de texte avant ou après le JSON` },
        { role: 'user', content: message }
      ]
    });

    const text = response.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.warn('[COPILOT] DeepSeek parse error:', e.message);
    return null;
  }
}

// =============================================
// DÉTECTION D'INTENT (local, 0€)
// =============================================
function detectIntent(text) {
  const lower = (text || '').toLowerCase();
  var norm = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // === SALUTATIONS (seulement si c'est JUSTE une salutation, pas "salut peux tu trouver...") ===
  if (/^(bonjour|salut|hello|bonsoir|coucou|hey|yo|bjr|slt)\s*[,.!?]?\s*$/i.test(norm))
    return 'greeting';
  // Salutation + question → on strip la salutation et on continue
  if (/^(bonjour|salut|hello|bonsoir|coucou|hey|yo|bjr|slt)\b/i.test(norm)) {
    norm = norm.replace(/^(bonjour|salut|hello|bonsoir|coucou|hey|yo|bjr|slt)\s*[,.!?]?\s*/i, '');
  }
  if (/^(merci|thanks|parfait|super|top|genial|excellent|ok\s*merci|c\s*bon)\s*[,.!?]?\s*$/i.test(norm))
    return 'merci';

  // === COMPOSER / ENVOYER un mail (AVANT les catégories) ===
  if (/\b(envoie|ecris|reponds|redige|dis.lui|dis.leur|contacte|previens|informe)\b/i.test(norm) && !/\bmail.*jour|mes\s*mail|donne.*mail|montre.*mail/i.test(norm))
    return 'compose';

  // === AIDE / CAPACITÉS ===
  if (/\b(aide|help|comment.*faire|qu.?est.?ce.*tu|que.*peux.*faire|tes.*capacite|fonctionnalit|tu\s+fais\s+quoi|tu\s+sers\s+a\s+quoi)\b/i.test(norm))
    return 'aide';

  // === MAILS ===
  if (/\b(mail|mails|mel|meil|boite|inbox)\b|resume.*mail|facture.*mail|attendent.*reponse|mes\s+mail|mail.*jour|mail.*important|mail.*comptable|mail.*banque|mail.*hier|mail.*semaine|mail.*fournisseur|mail.*labo|mail.*patient/i.test(norm))
    return 'mail';

  // === AGENDA / PLANNING / ANALYSE JOURNÉE ===
  if (/\b(agenda|rdv|rendez.?vous|creneau|planning)\b|programme.*jour|analyse.*journ|optimise.*journ|optimise.*planning|score.*journ|trou.*agenda|chevauche|meilleur.*creneau|journee\s+de|combien.*rdv|rdv.*demain|rdv.*lundi|rdv.*mardi|prochain.*rdv/i.test(norm))
    return 'agenda';

  // === PATIENTS ===
  if (/\b(patient|cherche.*patient|fiche.*patient|score.*fiabilit|no.?show|risque.*venir|dernier.*visite|quand.*venu|dossier.*patient|m\.\s|mme\s|monsieur\s|madame\s)\b/i.test(norm))
    return 'patient';

  // === URGENCES / WAITLIST ===
  if (/\b(urgence|triage|liste.*attente|waitlist)\b|patient.*douleur|douleur.*patient|gonfle|abces|saigne|casse.*dent/i.test(norm))
    return 'urgence';

  // === STOCK / COMMANDE / PÉREMPTION ===
  if (/\b(stock|stok|commande|commende|commander|panier|rupture)\b|peremption|alerte.*stock|combien.*reste|produit.*manque|il\s+manque|expire|perime|composite|gant|anesthesi/i.test(norm))
    return 'stock';

  // === COMPARATEUR / PRIX ===
  if (/\b(comparateur|compare.*prix|moins\s*cher|moin\s*cher|meilleur.*prix)\b|fournisseur.*prix|economie|combien.*coute/i.test(norm))
    return 'comparateur';

  // === COMPTA / FACTURES / DEVIS ===
  if (/\b(compta|comptabilit|tva|bilan|declaration|urssaf|cfe)\b|chiffre.*affaire|mes\s*facture|les\s*facture|ya\s*des\s*devis|ya\s*des\s*facture|devis\s*en\s*cours|recette|depense|ca\s+du\s+mois|impot|tresor|scan.*factur|scaner.*factur|scanner.*factur|recuper.*factur|import.*factur|capter.*factur/i.test(norm))
    return 'compta';

  // === LABO / CAS PROTHÉTIQUE ===
  if (/\b(labo|prothese|protese|ceramique|zircone|shade|teinte)\b|couronne(?!.*mail)|bridge(?!.*mail)|empreinte|cas\s+\d|cas\s+de|ou\s+en\s+est.*cas|livraison.*labo/i.test(norm))
    return 'labo';

  // === RAPPELS / COMMUNICATION PATIENTS ===
  if (/\b(rappel|rappels|sms.*patient|notifi.*patient|prevenir.*patient)\b|confirme.*rdv|confirmation.*rdv/i.test(norm))
    return 'rappels';

  // === PLAN DE TRAITEMENT ===
  if (/plan.*traitement|traitement.*complet|combien.*seance|duree.*traitement|sequence.*acte|prochain.*acte|apres.*empreinte/i.test(norm))
    return 'traitement';

  // === STATISTIQUES / KPI ===
  if (/\b(statistique|kpi|performance)\b|taux.*occupation|taux.*no.show|nombre.*rdv|mon\s+ca|chiffre.*affaire/i.test(norm))
    return 'stats';

  // === ÉQUIPE ===
  if (/\b(equipe|assistant|secretaire|remplacant|salarie|employe|personnel)\b|mon\s+equipe/i.test(norm))
    return 'equipe';

  // === DOCUMENTS ===
  if (/\b(document|certificat|ordonnance|courrier|attestation|contrat|dossier|piece|justificatif)\b/i.test(norm))
    return 'document';

  // === SITE VITRINE ===
  if (/site.*vitrine|mon\s+site|visite.*site|cms|modifier.*site/i.test(norm))
    return 'site';

  return 'general';
}

// =============================================
// PARSING DATE langage naturel
// =============================================
function parseDate(text) {
  const n = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/hier|d.?hier/.test(n)) { const d = new Date(today); d.setDate(d.getDate() - 1); return { since: d, until: today, label: 'hier' }; }
  if (/avant.?hier/.test(n)) { const d = new Date(today); d.setDate(d.getDate() - 2); const u = new Date(today); u.setDate(u.getDate() - 1); return { since: d, until: u, label: 'avant-hier' }; }
  if (/cette\s*semaine/.test(n)) { const d = new Date(today); d.setDate(d.getDate() - d.getDay() + 1); return { since: d, label: 'cette semaine' }; }
  if (/semaine\s*derni/.test(n)) { const d = new Date(today); d.setDate(d.getDate() - d.getDay() - 6); const u = new Date(today); u.setDate(u.getDate() - u.getDay() + 1); return { since: d, until: u, label: 'semaine dernière' }; }
  if (/ce\s*mois/.test(n)) return { since: new Date(now.getFullYear(), now.getMonth(), 1), label: 'ce mois' };
  // "depuis X jours/semaines/mois"
  var depuisMatch = n.match(/depuis\s+(\d+)\s*(jour|semaine|mois)/);
  if (depuisMatch) {
    var num = parseInt(depuisMatch[1]);
    var unit = depuisMatch[2];
    var d = new Date(today);
    if (unit.startsWith('jour')) d.setDate(d.getDate() - num);
    else if (unit.startsWith('semaine')) d.setDate(d.getDate() - num * 7);
    else if (unit.startsWith('mois')) d.setMonth(d.getMonth() - num);
    return { since: d, label: 'depuis ' + num + ' ' + unit + (num > 1 ? 's' : '') };
  }
  const jours = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
  for (const [nom, idx] of Object.entries(jours)) {
    if (n.includes(nom)) { const d = new Date(today); d.setDate(d.getDate() - ((d.getDay() - idx + 7) % 7 || 7)); const u = new Date(d); u.setDate(u.getDate() + 1); return { since: d, until: u, label: nom }; }
  }
  return { since: today, label: 'aujourd\'hui' };
}

// =============================================
// FILTRAGE : virer le bruit (pubs, notifs, sondages)
// =============================================
function isNoiseMail(m) {
  const sub = (m.subject || '').toLowerCase();
  const from = ((m.from_name || '') + ' ' + (m.from_address || '')).toLowerCase();
  // Newsletters / promos / marketing
  if (/prix exclusifs|offre sp[eé]ciale|profitez|soldes|promo|r[eé]duction|code promo|ne.*ratez|derni[eè]re chance|flash|sp[eé]cialement r[eé]serv[eé]/.test(sub)) return true;
  // Newsletters éditoriales (actus, digest, roundup)
  if (/toutes les actus|actus.*en.*minutes|newsletter|bulletin|infolettre|news digest|this week|roundup|les nouveaut[eé]s/.test(sub)) return true;
  // Sondages / enquêtes
  if (/votre avis|enqu[eê]te|sondage|satisfaction|donnez votre/.test(sub)) return true;
  // Notifications système (Yahoo, Google, Microsoft, OVH auto)
  if (/mot de passe.*appli|password.*app|security alert|connexion.*tierce|g[eé]n[eé]r[eé].*mot de passe|un mot de passe.*a [eé]t[eé]/.test(sub)) return true;
  // Webinaires / events marketing / invitations mass
  if (/webinaire|d[eé]couvrez.*prochains|invitation exclusive|summary for|nouvel ouvrage|tout savoir sur/.test(sub)) return true;
  // Charité / crowdfunding / religieux
  if (/cotizup|cagnotte|don|mosque|construire.*mosqu|dhul|ramadan/.test(sub)) return true;
  // Rapports auto JADOMI
  if (/rapport hebdomadaire|weekly report/.test(sub) && from.includes('jadomi')) return true;
  // Indisponibilité / maintenance de services tiers
  if (/indisponibilit[eé].*ponctuelle|maintenance pr[eé]vue|service.*temporairement/.test(sub)) return true;
  // Résumés automatiques d'outils (ClearCorrect, etc.)
  if (/summary for|daily digest|weekly summary/.test(sub)) return true;
  // DEKRA, France Travail, etc. (pas lié au cabinet)
  if (/dekra|france travail/.test(from)) return true;
  // Messagerie vocale / répondeur
  if (/messagerie vocale|nouveau message re[cç]u.*\d|message vocal|voicemail|messages? audio/.test(sub)) return true;
  // Promos évidentes (marques non dentaires)
  if (/vistaprint|aliexpress|wish\.com|temu|shein|groupon|vente.priv|showroom|cdiscount|lidl|auchan|carrefour/.test(from)) return true;
  if (/offre myst[eè]re|gagnez|tirage|jeu concours|loterie|grattez|juste pour vous/.test(sub)) return true;
  // Actualités / news génériques (pas lié au cabinet directement)
  if (/mesures.*soutien|crise.*moyen.orient|actualit[eé].*professionnel|pour [eê]tre s[uû]r de ne rater/.test(sub)) return true;
  // TGS France newsletters génériques (sauf si c'est vraiment comptable)
  if (/tgs france/.test(from) && !/votre d[eé]claration|vos comptes|bilan|liasse|votre cabinet/.test(sub)) return true;
  // noreply + contenu non pertinent
  if (/noreply|no.reply|ne.pas.repondre/.test(from) && !/facture|commande|confirmation|paiement|r[eè]glement/.test(sub)) return true;
  return false;
}

// =============================================
// POST /api/copilot/message — Point d'entrée unique
// =============================================
router.post('/message', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    const uid = req.user?.id;
    const { message, context } = req.body;

    if (!message || message.trim().length < 2) {
      return res.status(400).json({ error: 'Message trop court' });
    }

    const intent = detectIntent(message);

    // Récupérer le contexte Brain
    const { data: brain } = await db()
      .from('cabinet_brain')
      .select('identity, contacts, preferences')
      .eq('societe_id', sid)
      .maybeSingle();

    const identity = brain?.identity || {};
    const contacts = brain?.contacts || [];
    const prenom = identity.nom_cabinet
      ? identity.nom_cabinet.replace(/Cabinet (du )?Dr /i, '').split(' ')[0]
      : '';

    // Construire le contexte selon l'intent
    let extraContext = '';
    let actionResult = null;

    switch (intent) {
      case 'mail': {
        // RÉPONDRE DIRECTEMENT avec les données de la base — pas besoin d'IA
        try {
          const lower = message.toLowerCase();
          const norm = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

          // RECHERCHE INTELLIGENTE — DeepSeek comprend "mon notaire", "depuis 2026", etc.
          // Regex uniquement pour les cas SIMPLES (mes mails, résumé, importants)
          // Tout le reste → DeepSeek parse l'intention
          const isSimple = /^(mes\s*mail|donne.*mail|montre.*mail|check.*mail|mail\s*du\s*jour|mail\s*important|mail\s*urgent|resum|combien.*mail|mail.*attendent|boite)/i.test(norm) || /\bresum/i.test(norm);
          if (!isSimple) {
            // Requête complexe → DeepSeek
            const parsed = await deepseekParseIntent(message);
            if (parsed && (parsed.action === 'search_mail' || parsed.action === 'list_mail')) {
              let query = db().from('mails_inbox')
                .select('id, from_name, from_address, subject, date_received, category, priority, needs_response, has_pdf, financial_type, financial_montant, body_preview, response_type')
                .eq('societe_id', sid).eq('is_spam', false).eq('is_newsletter', false);
              if (parsed.category) query = query.eq('category', parsed.category);
              if (parsed.search_term) query = query.or('from_name.ilike.%' + parsed.search_term + '%,from_address.ilike.%' + parsed.search_term + '%,subject.ilike.%' + parsed.search_term + '%');
              if (parsed.since) query = query.gte('date_received', parsed.since);
              if (parsed.until) query = query.lt('date_received', parsed.until);
              if (parsed.filter === 'important') query = query.eq('needs_response', true);
              query = query.order('date_received', { ascending: false }).limit(20);
              const { data: found } = await query;
              const filtered = (found || []).filter(m => !isNoiseMail(m));
              const label = parsed.category || parsed.search_term || 'recherche';
              if (filtered.length > 0) return res.json({ reply: filtered.length + ' mail(s) trouvé(s) (' + label + ').', intent, mails: filtered });
              // Expliquer pourquoi 0 résultat
              const { count: totalMails } = await db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid);
              const { data: acc } = await db().from('comptes_email_societe').select('dernier_scan').eq('societe_id', sid).limit(1).maybeSingle();
              let hint = 'Aucun mail trouvé pour "' + label + '", Docteur.';
              if ((totalMails || 0) < 100) hint += '\n\nNote : JADOMI a indexé ' + (totalMails||0) + ' mails pour l\'instant. La synchronisation continue automatiquement toutes les 5 minutes et remonte progressivement dans le temps.';
              return res.json({ reply: hint, intent });
            }
            // Si DeepSeek retourne compose_mail → rediriger vers compose
            if (parsed && parsed.action === 'compose_mail') {
              try {
                const agents = require('../../lib/brain/agents');
                actionResult = await agents.composeMail(parsed.instruction || message, brain || {});
              } catch (e) { /* fallback */ }
              if (actionResult) break;
            }
          }

          // "Résumé" / "combien"
          if (/resum|combien.*mail|statut|status/.test(norm)) {
            const { count: total } = await db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid).eq('is_spam', false).eq('is_newsletter', false);
            const { count: unread } = await db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid).eq('is_read', false).eq('is_spam', false).eq('is_newsletter', false);
            const { count: needsResp } = await db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid).eq('needs_response', true).eq('replied', false);
            const { count: factures } = await db().from('mails_inbox').select('id', { count: 'exact', head: true }).eq('societe_id', sid).not('financial_type', 'is', null);
            return res.json({
              reply: 'Docteur, voici le résumé de votre boîte mail :\n\n- ' + (total||0) + ' mails indexés au total\n- ' + (unread||0) + ' non lus\n- ' + (needsResp||0) + ' attendent une réponse de votre part\n- ' + (factures||0) + ' documents financiers détectés\n\nDemandez-moi "mes mails importants" ou "mes factures" pour plus de détails.',
              intent
            });
          }

          // "Mes mails du jour" / "donne mes mails" / "hier"
          if (/mes\s*mail|mail.*jour|donne.*mail|montre.*mail|voir.*mail|affiche.*mail|check.*mail|consulter.*mail|mail.*hier|mail.*semaine|mail.*lundi|mail.*mardi|mail.*mercredi|mail.*jeudi|mail.*vendredi|boite|inbox|mel/.test(norm)) {
            const dateRange = parseDate(message);
            let query = db().from('mails_inbox')
              .select('id, from_name, from_address, subject, date_received, category, priority, needs_response, has_pdf, financial_type, financial_montant, body_preview, response_type')
              .eq('societe_id', sid).eq('is_spam', false).eq('is_newsletter', false)
              .gte('date_received', dateRange.since.toISOString())
              .order('date_received', { ascending: false }).limit(30);
            if (dateRange.until) query = query.lt('date_received', dateRange.until.toISOString());

            const { data: rawMails } = await query;
            // Filtrer le bruit (pubs, notifs, sondages)
            const mails = (rawMails || []).filter(m => !isNoiseMail(m));

            // Séparer : importants (needs_response) vs reste
            const important = mails.filter(m => m.needs_response || m.priority === 'urgent' || m.priority === 'high' || m.financial_type);
            const autres = mails.filter(m => !m.needs_response && m.priority !== 'urgent' && m.priority !== 'high' && !m.financial_type);

            if (mails.length === 0) {
              return res.json({ reply: 'Aucun mail important ' + dateRange.label + '. Votre boîte est en ordre, Docteur.', intent });
            }

            let reply = 'Docteur, voici vos mails ' + dateRange.label + ' :\n\n';
            if (important.length > 0) {
              reply += '--- IMPORTANTS (' + important.length + ') ---\n\n';
              important.forEach(m => { reply += formatMailCard(m); });
            }
            if (autres.length > 0) {
              reply += '\n--- AUTRES (' + autres.length + ') ---\n\n';
              autres.forEach(m => { reply += formatMailLine(m); });
            }
            return res.json({ reply, intent, mails: important.concat(autres) });
          }

          // (résumé géré plus haut)

          // "Mails importants" / "attendent une réponse" / "urgent"
          if (/important|urgent|priorit|attendent.*reponse|a\s*repondre|en\s*attente/.test(norm)) {
            const { data: mails } = await db().from('mails_inbox')
              .select('from_name, from_address, subject, date_received, category, priority, response_type, body_preview')
              .eq('societe_id', sid).eq('needs_response', true).eq('replied', false)
              .order('date_received', { ascending: false }).limit(10);
            if (!mails || mails.length === 0) return res.json({ reply: 'Bonne nouvelle Docteur, aucun mail n\'attend de réponse. Tout est traité.', intent });
            return res.json({ reply: mails.length + ' mails attendent votre réponse.', intent, mails });
          }

          // "Factures" / "devis" / "avoir"
          if (/facture|devis|avoir|comptab/.test(norm)) {
            const { data: mails } = await db().from('mails_inbox')
              .select('from_name, from_address, subject, financial_type, financial_montant, date_received, has_pdf')
              .eq('societe_id', sid).not('financial_type', 'is', null)
              .order('date_received', { ascending: false }).limit(15);
            if (!mails || mails.length === 0) return res.json({ reply: 'Aucun document financier détecté dans vos mails récents.', intent });
            let reply = mails.length + ' documents financiers trouvés :\n\n';
            mails.forEach(function(m) {
              reply += '- ' + (m.from_name || m.from_address) + ' : ' + (m.financial_type || '') + ' "' + m.subject + '"';
              if (m.financial_montant) reply += ' — ' + m.financial_montant + ' EUR';
              if (m.has_pdf) reply += ' [PDF]';
              reply += '\n';
            });
            return res.json({ reply, intent });
          }

          // "Mails de [fournisseur/banque/comptable]"
          const catMatch = norm.match(/mail.*(fournisseur|banque|comptable|labo|patient|assurance|ordre|impot|commercial)/);
          if (catMatch) {
            const catMap = { fournisseur:'fournisseur', banque:'banque', comptable:'comptable', labo:'labo', patient:'patient', assurance:'assurance', ordre:'ordre', impot:'impots', commercial:'commercial' };
            const cat = catMap[catMatch[1]] || catMatch[1];
            const { data: mails } = await db().from('mails_inbox')
              .select('from_name, from_address, subject, date_received, needs_response, has_pdf')
              .eq('societe_id', sid).eq('category', cat)
              .order('date_received', { ascending: false }).limit(10);
            if (!mails || mails.length === 0) return res.json({ reply: 'Aucun mail de catégorie "' + cat + '" trouvé.', intent });
            return res.json({ reply: mails.length + ' mails ' + cat + '.', intent, mails });
          }

          // Recherche par mots-clés ("retrouve le mail de...", "cherche reservation voiture")
          // Si aucun pattern spécifique matché, chercher dans les sujets/expéditeurs
          const searchTerms = norm.replace(/\b(mes|mail|mails|mel|donne|montre|retrouve|cherche|trouve|ou|est|le|la|les|de|du|mon|ma|un|une|des|stp|svp|please)\b/g, '').trim();
          if (searchTerms.length >= 3) {
            const { data: found } = await db().from('mails_inbox')
              .select('from_name, from_address, subject, date_received, category, body_preview, has_pdf, financial_type')
              .eq('societe_id', sid)
              .or('subject.ilike.%' + searchTerms + '%,from_name.ilike.%' + searchTerms + '%,body_preview.ilike.%' + searchTerms + '%')
              .order('date_received', { ascending: false }).limit(10);
            if (found && found.length > 0) {
              return res.json({ reply: found.length + ' mail(s) trouvé(s) pour "' + searchTerms + '".', intent, mails: found });
            }
          }

          // DEEPSEEK FALLBACK : si aucun pattern regex n'a matché, demander à DeepSeek
          const parsed = await deepseekParseIntent(message);
          if (parsed && parsed.action === 'search_mail') {
            let query = db().from('mails_inbox')
              .select('id, from_name, from_address, subject, date_received, category, priority, needs_response, has_pdf, financial_type, financial_montant, body_preview, response_type')
              .eq('societe_id', sid).eq('is_spam', false).eq('is_newsletter', false);

            // Filtre par catégorie
            if (parsed.category) query = query.eq('category', parsed.category);
            // Filtre par mot-clé
            if (parsed.search_term) query = query.or('from_name.ilike.%' + parsed.search_term + '%,from_address.ilike.%' + parsed.search_term + '%,subject.ilike.%' + parsed.search_term + '%');
            // Filtre par date
            if (parsed.since) query = query.gte('date_received', parsed.since);
            if (parsed.until) query = query.lt('date_received', parsed.until);

            query = query.order('date_received', { ascending: false }).limit(20);
            const { data: found } = await query;
            const filtered = (found || []).filter(m => !isNoiseMail(m));

            if (filtered.length > 0) {
              const label = parsed.category ? 'catégorie ' + parsed.category : (parsed.search_term || 'recherche');
              return res.json({ reply: filtered.length + ' mail(s) trouvé(s) (' + label + ').', intent, mails: filtered });
            }
            return res.json({ reply: 'Aucun mail trouvé pour cette recherche, Docteur.', intent });
          }

          // Fallback final : montrer les derniers mails
          const { data: recent } = await db().from('mails_inbox')
            .select('id, from_name, from_address, subject, date_received, category, priority, needs_response, has_pdf, financial_type, financial_montant, body_preview')
            .eq('societe_id', sid).eq('is_spam', false).eq('is_newsletter', false)
            .order('date_received', { ascending: false }).limit(10);
          return res.json({ reply: 'Voici vos derniers mails.', intent, mails: recent || [] });

        } catch (e) {
          console.error('[COPILOT] mail error:', e.message);
          extraContext = 'Module mail indisponible : ' + e.message;
        }
        break;
      }

      case 'compose': {
        // Composer un mail via l'agent
        try {
          const agents = require('../../lib/brain/agents');
          actionResult = await agents.composeMail(message, brain || {});
        } catch (e) { extraContext = 'Erreur composition mail : ' + e.message; }
        break;
      }

      case 'compta': {
        // Détecter si c'est un scan de factures ou juste une question
        const normC = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/scan|scann|scaner|scanner|importer.*factur|recuper.*factur|capter.*factur|toutes.*factur|capture.*factur|cherch.*factur|trouv.*factur|analys.*factur/.test(normC)) {
          // Lancer le scan automatique
          try {
            const { data: accs } = await db().from('comptes_email_societe').select('id').eq('societe_id', sid).eq('actif', true).limit(1);
            if (!accs || accs.length === 0) {
              return res.json({ reply: 'Docteur, vous devez d\'abord connecter votre boîte mail dans "Mes mails" pour scanner les factures automatiquement.', intent });
            }
            // Parser le mois demandé
            let scanMois = new Date().getMonth() + 1;
            let scanAnnee = new Date().getFullYear();
            const moisMatch = normC.match(/(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/);
            if (moisMatch) {
              const moisMap = { janvier:1, fevrier:2, mars:3, avril:4, mai:5, juin:6, juillet:7, aout:8, septembre:9, octobre:10, novembre:11, decembre:12 };
              scanMois = moisMap[moisMatch[1]] || scanMois;
            }
            const anneeMatch = normC.match(/20\d{2}/);
            if (anneeMatch) scanAnnee = parseInt(anneeMatch[0]);

            const moisNom = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][scanMois - 1];
            return res.json({
              reply: 'Je lance le scan des factures de ' + moisNom + ' ' + scanAnnee + '. Les résultats apparaîtront dans le panneau avec des cases à cocher pour valider.',
              intent,
              action: 'scan_factures',
              scan_params: { account_id: accs[0].id, mois: scanMois, annee: scanAnnee }
            });
          } catch (e) {
            return res.json({ reply: 'Erreur : ' + e.message, intent });
          }
        }

        // Question compta simple → rediriger
        return res.json({
          reply: 'Docteur, pour vos factures je peux :\n\n' +
            '- "Scanne mes factures de mai" → je scan et analyse les PDF automatiquement\n' +
            '- "Scanne mes factures de janvier à mai" → scan multi-mois\n' +
            '- "Les mails de GACD" → retrouver un mail fournisseur\n\n' +
            'Vous pouvez aussi utiliser le module Comptabilité : jadomi.fr → Comptabilité → Scanner mes mails',
          intent
        });
      }

      case 'greeting': {
        // Salutation directe, pas besoin d'IA
        const greetings = [
          'Bonjour Docteur, comment puis-je vous aider aujourd\'hui ?',
          'Bonjour Docteur. Que puis-je faire pour vous ?',
          'Bonjour Docteur, je suis à votre disposition.',
        ];
        return res.json({ reply: greetings[Math.floor(Math.random() * greetings.length)], intent: 'greeting' });
      }

      case 'merci':
        return res.json({ reply: 'Avec plaisir, Docteur. N\'hésitez pas si vous avez besoin d\'autre chose.', intent });

      case 'aide':
        return res.json({ reply: 'Docteur, voici ce que je peux faire pour vous :\n\n' +
          '- "Mes mails du jour" / "d\'hier" / "de la semaine"\n' +
          '- "Mails importants" / "qui attendent une réponse"\n' +
          '- "Mes factures" / "devis"\n' +
          '- "Envoie un mail au comptable que..."\n' +
          '- "Résumé de ma boîte mail"\n' +
          '- "Mail de la banque" / "du labo" / "des fournisseurs"\n' +
          '- "Retrouve le mail de..." (recherche par mots-clés)\n' +
          '- Questions sur votre cabinet, stock, agenda\n\n' +
          'Parlez naturellement, je comprends le français courant.', intent });

      case 'patient':
        extraContext = 'L\'utilisateur cherche un patient ou demande des infos patient. Pour chercher un patient : Précision Dentaire → onglet Patients. Pour le score de fiabilité, consultez l\'agenda IA.';
        break;
      case 'urgence':
        extraContext = 'Urgence détectée. Pour le triage d\'urgence et la liste d\'attente : Précision Dentaire → onglet Agenda → bouton Triage. Niveaux : critique (cellulite, avulsion = immédiat), urgent (abcès = 24h), semi-urgent (douleur provoquée = 72h).';
        break;
      case 'stock':
        extraContext = 'Stock et commandes. Accédez au dashboard Stock : jadomi.fr → Stock. Alertes péremption, ruptures, panier intelligent et comparateur prix sont dans ce module.';
        break;
      case 'agenda':
        extraContext = 'Agenda et planning. Accédez à Précision Dentaire : jadomi.fr/admin/dentiste-pro → Agenda. Analyse journée, optimisation, trous, créneaux disponibles, et copilot vocal sont dans ce module.';
        break;
      case 'comparateur':
        extraContext = 'Comparateur de prix fournisseurs. Accédez à : jadomi.fr → Achats & Fournisseurs → Comparateur prix. 172 000 produits, 16 fournisseurs FR comparés.';
        break;
      case 'labo':
        extraContext = 'Laboratoire et cas prothétiques. Accédez à Précision Dentaire → onglet Mon Labo. Suivi des cas, liaison cabinet-labo, photos teinte, messagerie labo.';
        break;
      case 'rappels':
        extraContext = 'Rappels patients. Les rappels SMS/email sont gérés automatiquement dans Précision Dentaire → Rappels. Confirmation, relance non-répondus, statistiques.';
        break;
      case 'traitement':
        extraContext = 'Plans de traitement. Utilisez l\'agenda IA dans Précision Dentaire pour générer un plan de traitement (couronne : 4 séances, implant : 5 séances, parodontite : 5 séances). Délais inter-séances automatiques.';
        break;
      case 'stats':
        extraContext = 'Statistiques et KPIs. Accédez au dashboard principal → Analytics. CA objectif 1 500 EUR/jour, taux occupation idéal 85%, max 5% no-show.';
        break;
      case 'equipe':
        extraContext = 'Gestion de l\'équipe. Accédez à Précision Dentaire → Mon Équipe. 6 rôles (praticien, associé, secrétaire, assistante, comptable, stagiaire) avec permissions granulaires.';
        break;
      case 'site':
        extraContext = 'Votre site vitrine. Gérez votre site dans le Hub Organisation → JADOMI Studio → Mon site internet. 3 forfaits : Classic 19 EUR/mois, Pro 39 EUR, Expert 69 EUR.';
        break;
      case 'document':
        extraContext = 'Documents du cabinet. Accédez au Hub Organisation → Documents & Signature pour vos documents juridiques. Pour les documents patients (certificats, ordonnances), utilisez l\'IA Documentaire dans Précision Dentaire.';
        break;
    }

    // Si actionResult (mail composé), retourner directement
    if (actionResult) {
      return res.json({
        reply: formatMailAction(actionResult),
        intent,
        action: 'mail_composed',
        data: actionResult
      });
    }

    // Construire le system prompt
    const systemPrompt = `Vous êtes JADOMI Copilot, l'assistant intelligent du cabinet "${identity.nom_cabinet || 'Cabinet dentaire'}".
Vous accompagnez le praticien dans toutes ses tâches : mails, stock, agenda, commandes, documents.

IDENTITÉ CABINET :
- Nom : ${identity.nom_cabinet || 'Non renseigné'}
- Ville : ${identity.ville || ''}
- Contacts : ${contacts.map(c => c.role + ' : ' + c.nom).join(', ') || 'aucun'}

PAGE ACTUELLE : ${context || 'inconnue'}

RÈGLES ABSOLUES :
- Vouvoiement TOUJOURS
- Zéro emoji
- Réponse concise (3 à 8 lignes max)
- Si vous ne savez pas, dites-le honnêtement
- JAMAIS inventer des données (montants, noms, dates)
- JAMAIS donner de conseil médical
- Quand vous renvoyez vers un module, indiquez le chemin précis
- Adressez-vous au praticien avec respect ("Docteur", "Bonjour Docteur")

${extraContext ? 'CONTEXTE :\n' + extraContext : ''}`;

    // Appel IA (Mistral d'abord)
    const iaRouter = require('../../lib/ia-router');
    const { cleaned } = sanitizeForExternalAPI(message, 'mistral');

    let reply;
    try {
      reply = await iaRouter.mistralGenerate(systemPrompt, cleaned || message, {
        temperature: 0.3, maxTokens: 500
      });
    } catch (_) {
      try {
        reply = await iaRouter.claudeGenerate(systemPrompt, message, { temperature: 0.3 });
      } catch (__) {
        reply = 'Service temporairement indisponible. Veuillez réessayer.';
      }
    }

    // Valider
    const v = validateResponse(reply);
    if (!v.ok) reply = 'Je prépare une réponse adaptée. Veuillez reformuler.';

    res.json({ reply, intent });
  } catch (e) {
    console.error('[COPILOT] message error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// GET /api/copilot/notifications — Notifications en attente (pour le badge clignotant)
router.get('/notifications', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;

    const [mailsRes, tasksRes] = await Promise.all([
      db().from('mails_inbox').select('id', { count: 'exact', head: true })
        .eq('societe_id', sid).eq('needs_response', true).eq('replied', false),
      db().from('cabinet_brain_tasks').select('id', { count: 'exact', head: true })
        .eq('societe_id', sid).eq('status', 'todo').in('priority', ['urgent', 'high'])
    ]);

    const total = (mailsRes.count || 0) + (tasksRes.count || 0);

    res.json({
      count: total,
      mails_pending: mailsRes.count || 0,
      tasks_urgent: tasksRes.count || 0,
      has_notifications: total > 0
    });
  } catch (e) {
    res.status(500).json({ count: 0, has_notifications: false });
  }
});

function formatMailCard(m) {
  const date = m.date_received ? new Date(m.date_received).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const from = m.from_name || m.from_address || '?';
  let line = '';
  if (m.priority === 'urgent') line += '[URGENT] ';
  line += from + '\n';
  line += '"' + (m.subject || '(sans objet)') + '"\n';
  if (m.category && m.category !== 'autre') line += 'Catégorie : ' + m.category + ' | ';
  if (m.financial_type && m.financial_type !== 'inconnu') line += m.financial_type + (m.financial_montant ? ' ' + m.financial_montant + ' EUR' : '') + ' | ';
  if (m.has_pdf) line += 'PDF joint | ';
  line += date + '\n';
  if (m.needs_response) line += 'ACTION : Ce mail attend votre réponse';
  if (m.response_type === 'document_demande') line += ' (document demandé)';
  else if (m.response_type === 'paiement_demande') line += ' (paiement demandé)';
  else if (m.response_type === 'validation_demande') line += ' (validation demandée)';
  line += '\n\n';
  return line;
}

function formatMailLine(m) {
  const date = m.date_received ? new Date(m.date_received).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return '- ' + (m.from_name || m.from_address || '?') + ' : "' + (m.subject || '') + '" — ' + date + '\n';
}

function formatMailList(mails, title) {
  if (!mails || mails.length === 0) return title || 'Aucun mail trouvé.';
  let reply = (title || '') + '\n\n';
  mails.forEach(function(m) {
    const date = m.date_received ? new Date(m.date_received).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    reply += '- ';
    if (m.needs_response) reply += '[REPONSE ATTENDUE] ';
    if (m.priority === 'urgent') reply += '[URGENT] ';
    reply += (m.from_name || m.from_address || '?') + ' : "' + (m.subject || '(sans objet)') + '"';
    if (m.category && m.category !== 'autre') reply += ' (' + m.category + ')';
    if (m.financial_type) reply += ' [' + m.financial_type + (m.financial_montant ? ' ' + m.financial_montant + ' EUR' : '') + ']';
    if (m.has_pdf) reply += ' [PDF]';
    reply += ' — ' + date;
    reply += '\n';
  });
  return reply;
}

function formatMailAction(result) {
  let html = 'Voici le mail que j\'ai préparé :\n\n';
  html += 'Destinataire : ' + (result.to || '(à renseigner)') + '\n';
  html += 'Objet : ' + (result.subject || '') + '\n\n';
  html += result.body || '';
  if (result.need_email) {
    html += '\n\nJe ne connais pas l\'email du destinataire. Renseignez-le dans Mon cabinet.';
  }
  return html;
}

module.exports = router;
