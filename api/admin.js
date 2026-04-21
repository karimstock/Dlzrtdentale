// =============================================
// JADOMI — Module Admin (routes + Stripe webhook + cron + mailing IA)
// Monte sur l'app principale via require('./api/admin')(app, supabase, anthropic)
// =============================================
const express = require('express');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'jadomi_admin_karim_2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karim_bahmed@yahoo.fr';

// --- Stripe (optionnel) ---
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('[ADMIN] Stripe initialise');
  } else {
    console.log('[ADMIN] STRIPE_SECRET_KEY absent — webhook en mode degrade');
  }
} catch (e) { console.warn('[ADMIN] Stripe non charge:', e.message); }

// --- Nodemailer (optionnel) ---
let mailer = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    console.log('[ADMIN] Mailer SMTP initialise');
  } else {
    console.log('[ADMIN] SMTP non configure — emails desactives');
  }
} catch (e) { console.warn('[ADMIN] Mailer init failed:', e.message); }

async function sendMail(to, subject, html) {
  if (!mailer) {
    console.log(`[ADMIN/MAIL][SIMULE] To=${to} Subject=${subject}`);
    return { simulated: true };
  }
  try {
    const info = await mailer.sendMail({
      from: `"JADOMI" <${process.env.SMTP_USER}>`,
      to, subject, html
    });
    return { messageId: info.messageId };
  } catch (e) {
    console.error('[ADMIN/MAIL] Error:', e.message);
    return { error: e.message };
  }
}

// =============================================
// Module export
// =============================================
module.exports = function (app, supabase, anthropic) {

  // ---- Middleware admin token ----
  function requireAdmin(req, res, next) {
    const tok = req.headers['x-admin-token'];
    if (!tok || tok !== ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized — admin token required' });
    }
    next();
  }

  // ---- Helper Claude IA ----
  async function claudeAsk(prompt, max = 1500) {
    if (!anthropic) return { content: 'IA indisponible (anthropic non initialise)' };
    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: max,
        messages: [{ role: 'user', content: prompt }]
      });
      return { content: r.content?.[0]?.text || '' };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ---- Log admin action ----
  async function logAdmin(action, cible, details) {
    try {
      await supabase.from('admin_logs').insert({
        action, cible, details: typeof details === 'string' ? details : JSON.stringify(details),
        admin_email: ADMIN_EMAIL
      });
    } catch (e) { /* table peut ne pas exister */ }
  }

  // =============================================
  // STRIPE WEBHOOK (raw body — doit etre monte AVANT express.json)
  // Note: dans server.js on monte une route express.raw() dediee
  // =============================================
  app.post('/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      let event;
      const sig = req.headers['stripe-signature'];

      if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
          console.error('[STRIPE/WEBHOOK] Signature error:', err.message);
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }
      } else {
        // Mode degrade : parse raw JSON sans verifier la signature
        try { event = JSON.parse(req.body.toString()); }
        catch (e) { return res.status(400).send('Invalid payload'); }
      }

      try {
        switch (event.type) {

          case 'invoice.payment_succeeded': {
            const inv = event.data.object;
            const email = inv.customer_email;
            const amountHt = (inv.amount_paid || 0) / 1.20 / 100;
            const amountTtc = (inv.amount_paid || 0) / 100;
            const amountTva = amountTtc - amountHt;
            const numero = `JADOMI-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

            await supabase.from('compta_factures').insert({
              numero, client_email: email, stripe_invoice_id: inv.id,
              description: 'Abonnement JADOMI',
              montant_ht: amountHt.toFixed(2),
              taux_tva: 20,
              montant_tva: amountTva.toFixed(2),
              montant_ttc: amountTtc.toFixed(2),
              statut: 'payee',
              date_paiement: new Date().toISOString().slice(0, 10),
              type_operation: 'prestation'
            });

            await supabase.from('stripe_abonnements').update({
              statut: 'actif', jours_retard: 0, nb_relances: 0
            }).eq('stripe_subscription_id', inv.subscription);

            const html = `<h2>Paiement confirme</h2><p>Bonjour, votre paiement de ${amountTtc.toFixed(2)}€ a bien ete recu. Facture ${numero} disponible.</p><p>L'equipe JADOMI</p>`;
            await sendMail(email, 'JADOMI — Paiement confirme', html);
            await logAdmin('payment_succeeded', email, { numero, montant: amountTtc });
            break;
          }

          case 'invoice.payment_failed': {
            const inv = event.data.object;
            const email = inv.customer_email;
            await supabase.from('stripe_abonnements').update({
              statut: 'impaye', jours_retard: 1, nb_relances: 1
            }).eq('stripe_subscription_id', inv.subscription);

            // Genere relance via Claude IA
            const ia = await claudeAsk(`Genere un email de relance amical en HTML (max 200 mots) pour un client JADOMI dont le paiement a echoue. Ton: empathique mais ferme. Inclure: bouton mettre a jour la carte, contact support. Pas de prix mentionne.`);
            const html = ia.content || `<p>Bonjour, votre dernier paiement a echoue. Merci de mettre a jour votre moyen de paiement.</p>`;
            await sendMail(email, 'JADOMI — Probleme de paiement', html);
            await sendMail(ADMIN_EMAIL, '[ALERTE] Impaye JADOMI', `<p>Impaye detecte pour ${email} (sub ${inv.subscription}).</p>`);
            await logAdmin('payment_failed', email, { sub: inv.subscription });
            break;
          }

          case 'customer.subscription.deleted': {
            const sub = event.data.object;
            await supabase.from('stripe_abonnements').update({ statut: 'annule' })
              .eq('stripe_subscription_id', sub.id);
            await sendMail(ADMIN_EMAIL, '[JADOMI] Abonnement annule',
              `<p>Subscription ${sub.id} annulee/supprimee.</p>`);
            await logAdmin('subscription_deleted', sub.id, sub);
            break;
          }

          case 'customer.subscription.updated': {
            const sub = event.data.object;
            await supabase.from('stripe_abonnements').update({
              plan: sub.items?.data?.[0]?.price?.nickname || 'unknown',
              statut: sub.status
            }).eq('stripe_subscription_id', sub.id);
            await logAdmin('subscription_updated', sub.id, { status: sub.status });
            break;
          }

          case 'checkout.session.completed': {
            const sess = event.data.object;
            const email = sess.customer_details?.email || sess.customer_email;
            await supabase.from('stripe_abonnements').insert({
              stripe_customer_id: sess.customer,
              stripe_subscription_id: sess.subscription,
              statut: 'actif',
              date_debut: new Date().toISOString().slice(0, 10),
              montant: (sess.amount_total || 0) / 100
            });
            const ia = await claudeAsk(`Genere un email de bienvenue HTML chaleureux (max 200 mots) pour un nouveau client JADOMI (gestion stock dentaire IA). Inclure: lien tableau de bord https://jadomi.fr, support karim_bahmed@yahoo.fr.`);
            const html = ia.content || `<h2>Bienvenue sur JADOMI</h2><p>Votre compte est actif.</p>`;
            await sendMail(email, 'Bienvenue sur JADOMI', html);
            await sendMail(ADMIN_EMAIL, '[JADOMI] Nouvel abonne', `<p>Nouveau client: ${email}</p>`);
            await logAdmin('checkout_completed', email, { customer: sess.customer });
            break;
          }

          default:
            console.log('[STRIPE] Event non gere:', event.type);
        }
      } catch (err) {
        console.error('[STRIPE/WEBHOOK] Handler error:', err.message);
      }

      res.json({ received: true });
    }
  );

  // =============================================
  // 1. DASHBOARD STATS
  // =============================================
  app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
      const out = { abonnes_actifs: 0, mrr: 0, revenus_mois: 0, nouveaux_semaine: 0,
        commissions_rush: 0, impayes: 0, taux_conversion: 0, revenus_12mois: [],
        professions: {}, inscrits_semaine: [], rush_commissions: [] };

      // Abonnes actifs
      const { data: abos } = await supabase.from('stripe_abonnements')
        .select('*').eq('statut', 'actif');
      out.abonnes_actifs = abos?.length || 0;
      out.mrr = (abos || []).reduce((s, a) => s + (parseFloat(a.montant) || 0), 0);

      // Impayes
      const { data: imp } = await supabase.from('stripe_abonnements')
        .select('*').eq('statut', 'impaye');
      out.impayes = imp?.length || 0;

      // Revenus mois (factures payees ce mois)
      const debutMois = new Date(); debutMois.setDate(1);
      const { data: facMois } = await supabase.from('compta_factures')
        .select('montant_ttc').eq('statut', 'payee')
        .gte('date_paiement', debutMois.toISOString().slice(0, 10));
      out.revenus_mois = (facMois || []).reduce((s, f) => s + (parseFloat(f.montant_ttc) || 0), 0);

      // Revenus 12 mois (graphique)
      const { data: fac12 } = await supabase.from('compta_factures')
        .select('montant_ttc, date_paiement').eq('statut', 'payee');
      const buckets = Array(12).fill(0);
      const now = new Date();
      (fac12 || []).forEach(f => {
        if (!f.date_paiement) return;
        const d = new Date(f.date_paiement);
        const diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (diffMonths >= 0 && diffMonths < 12) buckets[11 - diffMonths] += parseFloat(f.montant_ttc) || 0;
      });
      out.revenus_12mois = buckets;

      // Nouveaux inscrits semaine
      const il7 = new Date(); il7.setDate(il7.getDate() - 7);
      const { data: nv } = await supabase.from('stripe_abonnements')
        .select('id').gte('created_at', il7.toISOString());
      out.nouveaux_semaine = nv?.length || 0;

      // Commissions Rush
      try {
        const { data: rush } = await supabase.from('rush_commandes')
          .select('prix_total').gte('created_at', debutMois.toISOString());
        out.commissions_rush = (rush || []).reduce((s, r) => s + (parseFloat(r.prix_total) || 0) * 0.10, 0);
      } catch (e) { out.commissions_rush = 0; }

      res.json(out);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =============================================
  // 2. UTILISATEURS
  // =============================================
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      // Lire depuis stripe_abonnements + listing supabase auth si dispo
      const { data: abos } = await supabase.from('stripe_abonnements').select('*');
      res.json({ users: abos || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/admin/users/:id/suspendre', requireAdmin, async (req, res) => {
    try {
      await supabase.from('stripe_abonnements').update({ statut: 'suspendu' }).eq('id', req.params.id);
      await logAdmin('user_suspendu', req.params.id, {});
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/admin/users/:id/bannir', requireAdmin, async (req, res) => {
    try {
      await supabase.from('stripe_abonnements').update({ statut: 'banni' }).eq('id', req.params.id);
      await logAdmin('user_banni', req.params.id, req.body || {});
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/admin/users/:id/reactiver', requireAdmin, async (req, res) => {
    try {
      await supabase.from('stripe_abonnements').update({ statut: 'actif' }).eq('id', req.params.id);
      await logAdmin('user_reactive', req.params.id, {});
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // =============================================
  // 3. ABONNEMENTS & IMPAYES
  // =============================================
  app.get('/api/admin/abonnements', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('stripe_abonnements').select('*').order('created_at', { ascending: false });
      res.json({ abonnements: data || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/impayes', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('stripe_abonnements').select('*').eq('statut', 'impaye').order('jours_retard', { ascending: false });
      const total = (data || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0);
      res.json({ impayes: data || [], total });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/admin/relancer/:id', requireAdmin, async (req, res) => {
    try {
      const { data: abo } = await supabase.from('stripe_abonnements').select('*').eq('id', req.params.id).single();
      const ia = await claudeAsk(`Genere un email de relance JADOMI HTML (max 200 mots) pour un client en retard de paiement. Ton ferme mais respectueux. Pas de menace.`);
      // Tenter de trouver email via stripe customer
      let email = null;
      if (stripe && abo?.stripe_customer_id) {
        try { const c = await stripe.customers.retrieve(abo.stripe_customer_id); email = c.email; } catch(e){}
      }
      if (email) await sendMail(email, 'JADOMI — Rappel paiement', ia.content || 'Merci de regulariser votre paiement.');
      await supabase.from('stripe_abonnements').update({ nb_relances: (abo?.nb_relances || 0) + 1 }).eq('id', req.params.id);
      await logAdmin('relance_manuelle', req.params.id, { email });
      res.json({ ok: true, email });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/admin/impayes/:id/paye', requireAdmin, async (req, res) => {
    try {
      await supabase.from('stripe_abonnements').update({ statut: 'actif', jours_retard: 0 }).eq('id', req.params.id);
      await logAdmin('impaye_marque_paye', req.params.id, {});
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // =============================================
  // 4. RUSH
  // =============================================
  app.get('/api/admin/rush', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('rush_commandes').select('*').order('created_at', { ascending: false }).limit(100);
      const commissions = (data || []).reduce((s, r) => s + (parseFloat(r.prix_total) || 0) * 0.10, 0);
      res.json({ commandes: data || [], commissions });
    } catch (err) { res.json({ commandes: [], commissions: 0 }); }
  });

  // =============================================
  // 5. SUGGESTIONS
  // =============================================
  app.get('/api/admin/suggestions', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('suggestions').select('*').order('created_at', { ascending: false });
      res.json({ suggestions: data || [] });
    } catch (err) { res.json({ suggestions: [] }); }
  });

  app.put('/api/admin/suggestions/:id/statut', requireAdmin, async (req, res) => {
    try {
      await supabase.from('suggestions').update({ statut: req.body.statut }).eq('id', req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // =============================================
  // 6. MAILING IA
  // =============================================
  app.get('/api/admin/emails', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('stripe_abonnements').select('id, stripe_customer_id, plan');
      res.json({ emails: data || [] });
    } catch (err) { res.json({ emails: [] }); }
  });

  app.post('/api/admin/mailing/generer', requireAdmin, async (req, res) => {
    try {
      const { profession, sujet, contexte, ton } = req.body;
      const prompt = `Genere un email marketing JADOMI en HTML pour des ${profession || 'professionnels dentaires'}. Sujet: ${sujet}. Contexte: ${contexte || 'aucun'}. Ton: ${ton || 'professionnel'}. Inclure: objet (premiere ligne "OBJET: ..."), corps HTML avec CTA bouton. Variables {prenom}, {profession}, {plan} acceptees.`;
      const ia = await claudeAsk(prompt, 2000);
      res.json({ html: ia.content, error: ia.error });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/admin/mailing/envoyer', requireAdmin, async (req, res) => {
    try {
      const { sujet, html, profession_cible, destinataires } = req.body;
      let nb = 0;
      for (const email of (destinataires || [])) {
        await sendMail(email, sujet, html);
        nb++;
      }
      await supabase.from('mailing_campagnes').insert({
        sujet, profession_cible, nb_destinataires: nb, statut: 'envoye', type: 'manuel'
      });
      res.json({ ok: true, nb });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // =============================================
  // 7. BANNISSEMENTS
  // =============================================
  app.post('/api/admin/bannir', requireAdmin, async (req, res) => {
    try {
      const { email, motif, duree } = req.body;
      const ia = await claudeAsk(`Genere un email JADOMI HTML (max 150 mots) annoncant a un utilisateur la suspension de son compte. Motif: ${motif}. Duree: ${duree}. Ton respectueux. Inclure: contact recours karim_bahmed@yahoo.fr.`);
      await sendMail(email, 'JADOMI — Suspension de votre compte', ia.content || `<p>Votre compte est suspendu. Motif: ${motif}. Duree: ${duree}.</p>`);
      await logAdmin('bannissement', email, { motif, duree });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // =============================================
  // 8. COMPTABILITE
  // =============================================
  app.get('/api/admin/compta/stats', requireAdmin, async (req, res) => {
    try {
      const { data: facs } = await supabase.from('compta_factures').select('*');
      const { data: deps } = await supabase.from('compta_depenses').select('*');
      const now = new Date();
      const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
      const debutTri = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const debutAn = new Date(now.getFullYear(), 0, 1);

      const sum = (arr, key) => (arr || []).reduce((s, x) => s + (parseFloat(x[key]) || 0), 0);
      const filt = (arr, dateKey, since) => (arr || []).filter(x => x[dateKey] && new Date(x[dateKey]) >= since);

      const facsPayees = (facs || []).filter(f => f.statut === 'payee');
      const facsAttente = (facs || []).filter(f => f.statut === 'en_attente');
      const facsRetard = (facs || []).filter(f => f.statut === 'en_retard');

      const ca_mois = sum(filt(facsPayees, 'date_paiement', debutMois), 'montant_ttc');
      const ca_trimestre = sum(filt(facsPayees, 'date_paiement', debutTri), 'montant_ttc');
      const ca_annee = sum(filt(facsPayees, 'date_paiement', debutAn), 'montant_ttc');
      const depenses_mois = sum(filt(deps, 'date_depense', debutMois), 'montant_ttc');
      const tva_collectee = sum(filt(facsPayees, 'date_paiement', debutTri), 'montant_tva');
      const tva_deductible = sum(filt(deps, 'date_depense', debutTri), 'montant_tva');
      const tva_a_reverser = tva_collectee - tva_deductible;

      res.json({
        ca_mois, ca_trimestre, ca_annee,
        factures_emises: (facs || []).length,
        factures_encaissees: facsPayees.length,
        factures_en_attente: facsAttente.length,
        factures_en_retard: facsRetard.length,
        depenses_mois,
        resultat_net: ca_mois - depenses_mois,
        tva_collectee, tva_deductible, tva_a_reverser,
        tresorerie: ca_annee - sum(filt(deps, 'date_depense', debutAn), 'montant_ttc')
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/compta/factures', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('compta_factures').select('*').order('date_emission', { ascending: false });
      res.json({ factures: data || [] });
    } catch (err) { res.json({ factures: [] }); }
  });

  app.post('/api/admin/compta/factures', requireAdmin, async (req, res) => {
    try {
      const f = req.body;
      const numero = f.numero || `JADOMI-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const ht = parseFloat(f.montant_ht) || 0;
      const tva = ht * 0.20;
      const ttc = ht + tva;
      const { data } = await supabase.from('compta_factures').insert({
        numero, client_email: f.client_email, description: f.description,
        montant_ht: ht, taux_tva: 20, montant_tva: tva, montant_ttc: ttc,
        statut: f.statut || 'en_attente',
        date_echeance: f.date_echeance, type_operation: 'prestation',
        siren_client: f.siren_client
      }).select().single();
      res.json({ facture: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/admin/compta/factures/:id/statut', requireAdmin, async (req, res) => {
    try {
      const update = { statut: req.body.statut };
      if (req.body.statut === 'payee') update.date_paiement = new Date().toISOString().slice(0, 10);
      await supabase.from('compta_factures').update(update).eq('id', req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/compta/depenses', requireAdmin, async (req, res) => {
    try {
      const { data } = await supabase.from('compta_depenses').select('*').order('date_depense', { ascending: false });
      res.json({ depenses: data || [] });
    } catch (err) { res.json({ depenses: [] }); }
  });

  app.post('/api/admin/compta/depenses', requireAdmin, async (req, res) => {
    try {
      const d = req.body;
      const ht = parseFloat(d.montant_ht) || 0;
      const taux = parseFloat(d.taux_tva) || 20;
      const tva = ht * (taux / 100);
      const ttc = ht + tva;
      const { data } = await supabase.from('compta_depenses').insert({
        date_depense: d.date_depense || new Date().toISOString().slice(0, 10),
        categorie: d.categorie, description: d.description,
        montant_ht: ht, taux_tva: taux, montant_tva: tva, montant_ttc: ttc,
        justificatif_url: d.justificatif_url
      }).select().single();
      res.json({ depense: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/admin/compta/depenses/analyser-ia', requireAdmin, async (req, res) => {
    try {
      const { texte_ou_url } = req.body;
      const prompt = `Analyse cette facture/justificatif et extrait au format JSON STRICT (sans markdown): {"montant_ht": number, "taux_tva": number, "montant_tva": number, "montant_ttc": number, "categorie": string, "date": "YYYY-MM-DD", "description": string}. Categories possibles: VPS OVH, Anthropic API, Supabase, Stripe, Marketing, Frais bancaires, Developpement, Juridique, Autres. Contenu: ${texte_ou_url}`;
      const ia = await claudeAsk(prompt, 800);
      let parsed = null;
      try { parsed = JSON.parse((ia.content || '').replace(/```json|```/g, '').trim()); } catch(e){}
      res.json({ raw: ia.content, parsed });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/compta/tva', requireAdmin, async (req, res) => {
    try {
      const now = new Date();
      const debutTri = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const { data: facs } = await supabase.from('compta_factures')
        .select('montant_tva').eq('statut', 'payee').gte('date_paiement', debutTri.toISOString().slice(0, 10));
      const { data: deps } = await supabase.from('compta_depenses')
        .select('montant_tva').gte('date_depense', debutTri.toISOString().slice(0, 10));
      const collectee = (facs || []).reduce((s, f) => s + (parseFloat(f.montant_tva) || 0), 0);
      const deductible = (deps || []).reduce((s, d) => s + (parseFloat(d.montant_tva) || 0), 0);
      res.json({ collectee, deductible, a_reverser: collectee - deductible, trimestre: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/admin/compta/rapport', requireAdmin, async (req, res) => {
    try {
      const { data: facs } = await supabase.from('compta_factures').select('*');
      const { data: deps } = await supabase.from('compta_depenses').select('*');
      const ca = (facs || []).filter(f => f.statut === 'payee').reduce((s, f) => s + (parseFloat(f.montant_ttc) || 0), 0);
      const dep = (deps || []).reduce((s, d) => s + (parseFloat(d.montant_ttc) || 0), 0);
      const prompt = `Tu es expert-comptable JADOMI. Genere un commentaire de gestion professionnel HTML (max 500 mots) pour ces chiffres: CA total ${ca.toFixed(2)}€, depenses ${dep.toFixed(2)}€, resultat ${(ca - dep).toFixed(2)}€. Inclure: analyse, points forts, points d'attention, recommandations.`;
      const ia = await claudeAsk(prompt, 2500);
      res.json({ commentaire: ia.content, ca, depenses: dep, resultat: ca - dep });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // =============================================
  // TEST EMAIL (protege X-Admin-Token)
  // =============================================
  let emailSvc = null;
  try { emailSvc = require('./emailService'); } catch(e){}

  app.get('/api/admin/test-email', requireAdmin, async (req, res) => {
    try {
      if (!emailSvc) return res.status(503).json({ ok: false, error: 'emailService non charge' });
      const to = req.query.to || ADMIN_EMAIL;
      const verif = await emailSvc.verify();
      const r = await emailSvc.sendMail({
        to,
        subject: 'JADOMI — Test SMTP OVH Pro',
        html: '<h2>Test SMTP reussi</h2><p>Si tu lis ce mail, la configuration OVH Pro fonctionne.</p><p>Envoye le ' + new Date().toLocaleString('fr-FR') + '</p>'
      });
      res.json({ verify: verif, send: r, to });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =============================================
  // CRON JOBS
  // =============================================

  // 1. Verification impayes chaque nuit minuit
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[CRON] Verification impayes...');
      const { data: impayes } = await supabase.from('stripe_abonnements')
        .select('*').in('statut', ['impaye', 'actif']);
      let resume = [];
      for (const a of (impayes || [])) {
        if (a.statut !== 'impaye') continue;
        const newRetard = (a.jours_retard || 0) + 1;
        let newStatut = a.statut;
        let action = null;
        if (newRetard === 7) action = 'relance_J7';
        else if (newRetard === 15) { action = 'suspension_J15'; newStatut = 'suspendu'; }
        else if (newRetard === 30) { action = 'bannissement_J30'; newStatut = 'banni'; }

        await supabase.from('stripe_abonnements').update({
          jours_retard: newRetard, statut: newStatut,
          nb_relances: (a.nb_relances || 0) + (action ? 1 : 0)
        }).eq('id', a.id);

        if (action) {
          let email = null;
          if (stripe && a.stripe_customer_id) {
            try { const c = await stripe.customers.retrieve(a.stripe_customer_id); email = c.email; } catch(e){}
          }
          if (email) {
            const ia = await claudeAsk(`Genere un email JADOMI HTML pour ${action} (J+${newRetard} de retard). Ton adapte.`);
            await sendMail(email, `JADOMI — ${action}`, ia.content || `Action: ${action}`);
          }
          resume.push(`${a.id} ${action}`);
        }
      }
      if (resume.length) {
        await sendMail(ADMIN_EMAIL, '[JADOMI] Resume impayes nuit',
          `<h3>Actions executees</h3><ul>${resume.map(r => `<li>${r}</li>`).join('')}</ul>`);
      }
    } catch (e) { console.error('[CRON impayes]', e.message); }
  });

  // 2. Rapport hebdomadaire chaque lundi 8h
  cron.schedule('0 8 * * 1', async () => {
    try {
      console.log('[CRON] Rapport hebdomadaire...');
      const ia = await claudeAsk(`Genere un rapport hebdomadaire JADOMI HTML pour l'admin Karim. Inclure: KPIs simules, points d'attention, recommandations strategiques. 400 mots max.`, 2000);
      await sendMail(ADMIN_EMAIL, '[JADOMI] Rapport hebdomadaire', ia.content || 'Rapport indisponible');
    } catch (e) { console.error('[CRON rapport hebdo]', e.message); }
  });

  // 3. Recap TVA + rapport mensuel le 1er du mois 9h
  cron.schedule('0 9 1 * *', async () => {
    try {
      console.log('[CRON] Recap mensuel TVA + rapport...');
      const now = new Date();
      const { data: facs } = await supabase.from('compta_factures').select('*').eq('statut', 'payee');
      const { data: deps } = await supabase.from('compta_depenses').select('*');
      const tvaCollectee = (facs || []).reduce((s, f) => s + (parseFloat(f.montant_tva) || 0), 0);
      const tvaDeductible = (deps || []).reduce((s, d) => s + (parseFloat(d.montant_tva) || 0), 0);
      const tvaNet = tvaCollectee - tvaDeductible;
      const alerte = tvaNet > 500 ? '<p style="color:red"><strong>ALERTE: TVA > 500€ a reverser</strong></p>' : '';
      const prompt = `Genere un rapport mensuel comptable JADOMI HTML (500 mots) pour ${now.toLocaleDateString('fr-FR')}. TVA collectee ${tvaCollectee.toFixed(2)}€, TVA deductible ${tvaDeductible.toFixed(2)}€, TVA nette ${tvaNet.toFixed(2)}€.`;
      const ia = await claudeAsk(prompt, 2500);
      await sendMail(ADMIN_EMAIL, '[JADOMI] Rapport mensuel + TVA', alerte + (ia.content || ''));
    } catch (e) { console.error('[CRON mensuel]', e.message); }
  });

  // 4. Calcul TVA trimestrielle (1er Jan/Avr/Juil/Oct)
  cron.schedule('0 10 1 1,4,7,10 *', async () => {
    try {
      console.log('[CRON] TVA trimestrielle...');
      await sendMail(ADMIN_EMAIL, '[JADOMI] Declaration TVA trimestrielle',
        '<p>Rappel: declaration TVA CA3 a effectuer ce mois-ci. Voir admin.html section Comptabilite.</p>');
    } catch (e) { console.error('[CRON TVA tri]', e.message); }
  });

  // =============================================
  // PARAMETRES PLATEFORME
  // =============================================
  app.get('/api/admin/parametres', requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase.from('parametres_plateforme').select('*').order('cle');
      if (error) throw error;
      res.json({ ok: true, parametres: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/parametres', requireAdmin, async (req, res) => {
    try {
      const { parametres } = req.body;
      if (!parametres || !Array.isArray(parametres)) {
        return res.status(400).json({ error: 'parametres (array) requis' });
      }
      for (const p of parametres) {
        if (!p.cle) continue;
        const { error } = await supabase
          .from('parametres_plateforme')
          .upsert({ cle: p.cle, valeur: p.valeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' });
        if (error) console.error('[ADMIN parametres upsert]', p.cle, error.message);
      }
      res.json({ ok: true, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[ADMIN] Module admin charge — 4 cron jobs actifs');
};
