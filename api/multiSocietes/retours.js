// =============================================
// JADOMI — Demandes de retour client → fournisseur
// Routes /api/commerce/retours/*
// =============================================
const express = require('express');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
const { pushNotification } = require('./notifications');

const COUT_TRANSPORT_DEFAUT = 8; // €
const SEUIL_RENTABILITE = 15;    // €

module.exports = function mountRetours(app) {
  const router = express.Router();
  router.use(authSupabase());

  // Liste retours côté client (la société qui demande)
  router.get('/', requireSociete(), async (req, res) => {
    try {
      const sens = req.query.sens === 'fournisseur' ? 'fournisseur' : 'client';
      let qb = admin().from('demandes_retour').select(
        '*, produit:produit_id(id,designation,reference), fournisseur:fournisseur_societe_id(id,nom,logo_url), client:societe_id(id,nom,logo_url)'
      ).order('created_at', { ascending: false });
      if (sens === 'fournisseur') qb = qb.eq('fournisseur_societe_id', req.societe.id);
      else qb = qb.eq('societe_id', req.societe.id);
      const { data, error } = await qb;
      if (error) throw error;
      res.json({ success: true, retours: data || [], sens });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Créer une demande de retour
  // body: {facture_id, produit_id, designation, reference, quantite, montant,
  //        fournisseur_societe_id, fournisseur_nom, fournisseur_email,
  //        raison, deballe, utilise, emballage_intact, photo_urls, note}
  router.post('/', requireSociete(), async (req, res) => {
    try {
      const b = req.body || {};
      const qte = Math.max(1, Number(b.quantite || 1));
      const montant = Number(b.montant || 0);
      const valeurUnite = qte > 0 ? montant / qte : 0;
      const rentable = valeurUnite >= SEUIL_RENTABILITE;

      const payload = {
        societe_id: req.societe.id,
        user_id: req.user.id,
        facture_societe_id: b.facture_id || b.facture_societe_id || null,
        produit_id: b.produit_id || null,
        produit_designation: b.designation || b.produit_designation || null,
        produit_reference: b.reference || b.produit_reference || null,
        quantite: qte,
        montant,
        fournisseur_societe_id: b.fournisseur_societe_id || null,
        fournisseur_nom: b.fournisseur_nom || null,
        fournisseur_email: b.fournisseur_email || null,
        raison: b.raison || 'autre',
        deballe: !!b.deballe,
        utilise: !!b.utilise,
        emballage_intact: b.emballage_intact !== false,
        photo_urls: Array.isArray(b.photo_urls) ? b.photo_urls : [],
        note: b.note || null,
        cout_transport_estime: COUT_TRANSPORT_DEFAUT,
        rentable,
        statut: 'en_attente'
      };

      const { data, error } = await admin().from('demandes_retour')
        .insert(payload).select('*').single();
      if (error) throw error;

      // Notification fournisseur JADOMI (si applicable)
      if (payload.fournisseur_societe_id) {
        try {
          const { data: members } = await admin().from('user_societe_roles')
            .select('user_id').eq('societe_id', payload.fournisseur_societe_id)
            .in('role', ['proprietaire','associe']);
          for (const m of members || []) {
            await pushNotification({
              user_id: m.user_id,
              societe_id: payload.fournisseur_societe_id,
              type: 'retour_demande',
              urgence: 'haute',
              titre: 'Nouvelle demande de retour',
              message: `${payload.produit_designation || 'Un produit'} · motif : ${payload.raison}`,
              cta_label: 'Traiter (48h)',
              cta_url: '/commerce.html?tab=retours',
              entity_type: 'retour',
              entity_id: data.id
            });
          }
        } catch (_) {}
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create_retour', entity: 'retour', entityId: data.id,
        meta: { rentable, valeur: valeurUnite }, req });
      res.json({ success: true, retour: data, rentable, valeur_unite: valeurUnite });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Action fournisseur : accepter retour physique
  router.post('/:id/accepter', requireSociete(), async (req, res) => {
    try {
      const { data: r0 } = await admin().from('demandes_retour').select('*')
        .eq('id', req.params.id).single();
      if (!r0) return res.status(404).json({ error: 'not_found' });
      if (r0.fournisseur_societe_id !== req.societe.id)
        return res.status(403).json({ error: 'forbidden' });

      const patch = {
        statut: 'accepte_retour_physique',
        etiquette_retour_url: req.body?.etiquette_retour_url || null,
        resolution: req.body?.resolution || null,
        resolved_at: new Date().toISOString()
      };
      const { data: r, error } = await admin().from('demandes_retour')
        .update(patch).eq('id', r0.id).select('*').single();
      if (error) throw error;

      // Notif client
      try {
        await pushNotification({
          user_id: r.user_id,
          societe_id: r.societe_id,
          type: 'retour_accepte',
          urgence: 'haute',
          titre: 'Retour accepté',
          message: `Le fournisseur a accepté votre retour${r.etiquette_retour_url?' · étiquette disponible':''}.`,
          cta_label: 'Voir',
          cta_url: '/commerce.html?tab=retours',
          entity_type: 'retour', entity_id: r.id
        });
      } catch (_) {}

      res.json({ success: true, retour: r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Action fournisseur : envoyer nouveau produit (pas de retour physique)
  router.post('/:id/nouveau-produit', requireSociete(), async (req, res) => {
    try {
      const { data: r0 } = await admin().from('demandes_retour').select('*')
        .eq('id', req.params.id).single();
      if (!r0 || r0.fournisseur_societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });
      const patch = {
        statut: 'accepte_nouveau_produit',
        numero_suivi: req.body?.numero_suivi || null,
        resolution: req.body?.resolution || null,
        resolved_at: new Date().toISOString()
      };
      const { data, error } = await admin().from('demandes_retour')
        .update(patch).eq('id', r0.id).select('*').single();
      if (error) throw error;
      try {
        await pushNotification({
          user_id: data.user_id, societe_id: data.societe_id,
          type: 'retour_accepte', urgence: 'haute',
          titre: 'Nouveau produit en route',
          message: `Suivi : ${data.numero_suivi || '—'}`,
          entity_type: 'retour', entity_id: data.id
        });
      } catch (_) {}
      res.json({ success: true, retour: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Action fournisseur : refuser
  router.post('/:id/refuser', requireSociete(), async (req, res) => {
    try {
      const { data: r0 } = await admin().from('demandes_retour').select('*')
        .eq('id', req.params.id).single();
      if (!r0 || r0.fournisseur_societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });
      const patch = {
        statut: 'refuse',
        raison_refus: req.body?.raison_refus || null,
        resolved_at: new Date().toISOString()
      };
      const { data, error } = await admin().from('demandes_retour')
        .update(patch).eq('id', r0.id).select('*').single();
      if (error) throw error;
      try {
        await pushNotification({
          user_id: data.user_id, societe_id: data.societe_id,
          type: 'retour_refuse', urgence: 'urgente',
          titre: 'Retour refusé',
          message: data.raison_refus || 'Aucune raison fournie',
          cta_label: 'Voir alternatives', cta_url: '/commerce.html?tab=retours',
          entity_type: 'retour', entity_id: data.id
        });
      } catch (_) {}
      res.json({ success: true, retour: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/commerce/retours', router);
  console.log('[JADOMI] Routes /api/commerce/retours montées');
};
