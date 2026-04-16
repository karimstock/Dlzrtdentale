// =============================================
// JADOMI — Réclamations fournisseurs
// Routes /api/commerce/reclamations/*
// =============================================
const express = require('express');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
const { pushNotification } = require('./notifications');
const mailer = require('./mailer');

// Appel direct Anthropic serveur-to-serveur (pas de proxy via /api/claude qui est user-auth)
let _anthropic = null;
function getAnthropic() {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return _anthropic;
  } catch { return null; }
}

async function generateEmailIA(rec, societe) {
  const client = getAnthropic();
  if (!client) return null;
  const prod = rec.produit?.designation || 'un produit';
  const ref = rec.produit?.reference ? ` (réf. ${rec.produit.reference})` : '';
  const prompt = `Rédige un email professionnel français, ferme mais courtois, à destination d'un fournisseur pour réclamer la prise en charge d'un produit ${rec.motif.replace('_',' ')}. Produit : ${prod}${ref}. Quantité : ${rec.quantite}. Montant : ${rec.montant}€. Description : ${rec.description || '—'}. Demande un remboursement ou un avoir. Inclus un objet concis et un corps structuré. Signe avec le nom de la société : ${societe?.nom || '—'}. Ne mentionne aucune IA. Format de sortie : objet en première ligne puis ligne vide puis corps.`;

  try {
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });
    const txt = r?.content?.[0]?.text?.trim();
    if (!txt) return null;
    const lines = txt.split('\n');
    const sujet = lines[0].replace(/^Objet\s*:\s*/i, '').trim();
    const corps = lines.slice(1).join('\n').trim();
    return { sujet: sujet || `Réclamation — ${prod}`, corps: corps || txt };
  } catch (e) {
    console.warn('[reclamations/IA]', e.message);
    return null;
  }
}

module.exports = function mountReclamations(app) {
  const router = express.Router();
  router.use(authSupabase());

  // Liste des réclamations (vue client qui réclame)
  router.get('/', requireSociete(), async (req, res) => {
    try {
      const statut = req.query.statut ? String(req.query.statut) : null;
      let qb = admin().from('reclamations_fournisseurs').select(
        '*, produit:produit_id(id,designation,reference), fournisseur:fournisseur_societe_id(id,nom,logo_url)'
      ).eq('societe_id', req.societe.id).order('created_at', { ascending: false });
      if (statut) qb = qb.eq('statut', statut);
      const { data, error } = await qb;
      if (error) throw error;
      res.json({ success: true, reclamations: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Créer une réclamation
  router.post('/', requireSociete(), async (req, res) => {
    try {
      const p = {
        societe_id: req.societe.id,
        produit_id: req.body.produit_id || null,
        facture_societe_id: req.body.facture_societe_id || null,
        fournisseur_societe_id: req.body.fournisseur_societe_id || null,
        fournisseur_nom: req.body.fournisseur_nom || null,
        fournisseur_email: req.body.fournisseur_email || null,
        motif: req.body.motif || 'autre',
        quantite: Number(req.body.quantite || 1),
        montant: Number(req.body.montant || 0),
        description: req.body.description || null,
        photo_urls: Array.isArray(req.body.photo_urls) ? req.body.photo_urls : [],
        numero_facture_fournisseur: req.body.numero_facture_fournisseur || null,
        user_id: req.user.id
      };
      const { data, error } = await admin().from('reclamations_fournisseurs')
        .insert(p).select('*, produit:produit_id(id,designation,reference)').single();
      if (error) throw error;

      // Email auto vers fournisseur externe (non-JADOMI) si email fourni
      if (!p.fournisseur_societe_id && p.fournisseur_email) {
        try {
          const { data: societe } = await admin().from('societes').select('nom, email_facturation, email').eq('id', req.societe.id).single();
          const ia = await generateEmailIA(data, societe);
          if (ia) {
            const from = societe?.email_facturation || societe?.email;
            const sentResult = await mailer.sendMail({
              to: p.fournisseur_email,
              subject: ia.sujet,
              html: `<pre style="font-family:Helvetica,Arial,sans-serif;white-space:pre-wrap;">${ia.corps.replace(/</g,'&lt;')}</pre>`,
              from: from ? `"${societe?.nom||'JADOMI'}" <${from}>` : undefined
            });
            // Log dans emails_envoyes + passer en en_cours
            const journal = {
              to: p.fournisseur_email,
              sujet: ia.sujet,
              sent_at: new Date().toISOString(),
              ok: !!sentResult?.ok,
              error: sentResult?.error || null
            };
            await admin().from('reclamations_fournisseurs').update({
              statut: sentResult?.ok ? 'en_cours' : data.statut,
              emails_envoyes: [...(data.emails_envoyes || []), journal]
            }).eq('id', data.id);
          }
        } catch (err) {
          console.warn('[reclamation/email-auto]', err.message);
        }
      }

      // Notification fournisseur (si JADOMI)
      if (p.fournisseur_societe_id) {
        try {
          const { data: members } = await admin().from('user_societe_roles')
            .select('user_id').eq('societe_id', p.fournisseur_societe_id)
            .in('role', ['proprietaire','associe']);
          for (const m of members || []) {
            await pushNotification({
              user_id: m.user_id,
              societe_id: p.fournisseur_societe_id,
              type: 'retour_demande',
              urgence: 'haute',
              titre: 'Nouvelle réclamation reçue',
              message: `Un client conteste une livraison (${p.motif}).`,
              cta_label: 'Traiter',
              cta_url: '/commerce.html?tab=reclamations',
              entity_type: 'reclamation',
              entity_id: data.id
            });
          }
        } catch (_) {}
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create_reclamation', entity: 'reclamation', entityId: data.id, req });
      res.json({ success: true, reclamation: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Mise à jour statut
  router.patch('/:id', requireSociete(), async (req, res) => {
    try {
      const patch = {};
      for (const k of ['statut','resolution_montant','resolution_note','numero_facture_fournisseur']) {
        if (req.body[k] !== undefined) patch[k] = req.body[k];
      }
      if (patch.statut && ['remboursee','avoir_recu','perte_seche','refusee'].includes(patch.statut)) {
        patch.resolved_at = new Date().toISOString();
      }
      const { data, error } = await admin().from('reclamations_fournisseurs')
        .update(patch)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, reclamation: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Générer un email fournisseur via JADOMI IA (preview avant envoi manuel)
  router.post('/:id/email-ia', requireSociete(), async (req, res) => {
    try {
      const { data: r } = await admin().from('reclamations_fournisseurs')
        .select('*, produit:produit_id(designation,reference)')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!r) return res.status(404).json({ error: 'not_found' });

      const { data: societe } = await admin().from('societes').select('nom').eq('id', req.societe.id).single();
      const ia = await generateEmailIA(r, societe);
      if (!ia) return res.status(503).json({ error: 'ia_unavailable' });
      const txt = `Objet : ${ia.sujet}\n\n${ia.corps}`;
      res.json({ success: true, email_generated: txt, sujet: ia.sujet, corps: ia.corps });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Envoyer manuellement un email fournisseur (avec sujet + corps fournis par l'UI)
  router.post('/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: r } = await admin().from('reclamations_fournisseurs')
        .select('*').eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!r) return res.status(404).json({ error: 'not_found' });
      const to = req.body?.to || r.fournisseur_email;
      const sujet = req.body?.sujet;
      const corps = req.body?.corps;
      if (!to || !sujet || !corps) return res.status(400).json({ error: 'to_sujet_corps_requis' });
      const { data: societe } = await admin().from('societes').select('nom, email_facturation, email').eq('id', req.societe.id).single();
      const from = societe?.email_facturation || societe?.email;
      const sentResult = await mailer.sendMail({
        to, subject: sujet,
        html: `<pre style="font-family:Helvetica,Arial,sans-serif;white-space:pre-wrap;">${String(corps).replace(/</g,'&lt;')}</pre>`,
        from: from ? `"${societe?.nom||'JADOMI'}" <${from}>` : undefined
      });
      const journal = {
        to, sujet, sent_at: new Date().toISOString(),
        ok: !!sentResult?.ok, error: sentResult?.error || null
      };
      await admin().from('reclamations_fournisseurs').update({
        statut: sentResult?.ok && r.statut === 'ouverte' ? 'en_cours' : r.statut,
        emails_envoyes: [...(r.emails_envoyes || []), journal]
      }).eq('id', r.id);
      res.json({ success: true, sent: !!sentResult?.ok, error: sentResult?.error || null });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Vue analytics pertes
  router.get('/analytics', requireSociete(), async (req, res) => {
    try {
      const { data } = await admin().from('v_pertes_reclamations')
        .select('*').eq('societe_id', req.societe.id).order('mois', { ascending: false });
      res.json({ success: true, analytics: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/commerce/reclamations', router);
  console.log('[JADOMI] Routes /api/commerce/reclamations montées');
};
