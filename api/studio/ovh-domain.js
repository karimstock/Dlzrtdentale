// =============================================
// JADOMI Studio — Module Achat Domaines OVH
// Achat automatique de domaines via API OVH
// Routes /api/studio/ovh/domain/*
// =============================================
'use strict';

const express = require('express');
const router = express.Router();
const { getOvhClient } = require('../../lib/ovh-client');

const VPS_IP = '141.94.10.182';

module.exports = function mountOvhDomain(app, supabase, requireAuth) {

  // ================================================
  // POST /api/studio/ovh/domain/check
  // Vérifier disponibilité d'un domaine via OVH API
  // Body : { domain: "cabinet-dupont.fr" }
  // ================================================
  router.post('/check', requireAuth, async (req, res) => {
    try {
      const { domain } = req.body || {};
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Le paramètre domain est requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      const ovh = getOvhClient();
      if (!ovh) {
        return res.status(503).json({ error: 'API OVH non configurée' });
      }

      // Créer un panier temporaire pour vérifier la dispo
      const cart = await ovh.requestPromised('POST', '/order/cart', {
        ovhSubsidiary: 'FR',
        description: 'JADOMI check ' + domainPropre
      });

      const results = await ovh.requestPromised('GET',
        `/order/cart/${cart.cartId}/domain?domain=${encodeURIComponent(domainPropre)}`
      );

      let available = false;
      let priceHt = null;
      let priceTtc = null;

      if (results && results.length > 0) {
        const offer = results[0];
        available = offer.action === 'create';
        if (offer.prices && offer.prices.length > 0) {
          const total = offer.prices.find(p => p.label === 'TOTAL') || offer.prices[0];
          priceHt = total ? total.price.value : null;
          // TVA 20%
          priceTtc = priceHt != null ? Math.round(priceHt * 1.2 * 100) / 100 : null;
        }
      }

      // Nettoyage panier
      try { await ovh.requestPromised('DELETE', `/order/cart/${cart.cartId}`); } catch (_) {}

      return res.json({
        domain: domainPropre,
        available,
        price_ht: priceHt,
        price_ttc: priceTtc,
        mode: 'live'
      });

    } catch (err) {
      console.error('[OVH Domain] check error:', err.message);
      return res.status(500).json({ error: 'Erreur vérification domaine' });
    }
  });

  // ================================================
  // POST /api/studio/ovh/domain/suggest
  // Suggestions multi-extensions
  // Body : { base: "cabinet-dupont" }
  // ================================================
  router.post('/suggest', requireAuth, async (req, res) => {
    try {
      const { base } = req.body || {};
      if (!base) return res.status(400).json({ error: 'Le paramètre base est requis' });

      const normalized = base.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      const extensions = ['.fr', '.com', '.eu', '.net', '.pro', '.paris'];
      const ovh = getOvhClient();

      if (!ovh) {
        return res.json({
          suggestions: extensions.map(ext => ({
            domain: normalized + ext, available: null, price_ht: null, mode: 'degraded'
          }))
        });
      }

      const cart = await ovh.requestPromised('POST', '/order/cart', {
        ovhSubsidiary: 'FR', description: 'JADOMI suggest'
      });

      const suggestions = await Promise.all(extensions.map(async ext => {
        const d = normalized + ext;
        try {
          const results = await ovh.requestPromised('GET',
            `/order/cart/${cart.cartId}/domain?domain=${encodeURIComponent(d)}`
          );
          if (results && results.length > 0) {
            const offer = results[0];
            const total = (offer.prices || []).find(p => p.label === 'TOTAL') || (offer.prices || [])[0];
            return {
              domain: d,
              available: offer.action === 'create',
              price_ht: total ? total.price.value : null,
              mode: 'live'
            };
          }
          return { domain: d, available: false, price_ht: null, mode: 'live' };
        } catch (_) {
          return { domain: d, available: null, price_ht: null, mode: 'error' };
        }
      }));

      try { await ovh.requestPromised('DELETE', `/order/cart/${cart.cartId}`); } catch (_) {}

      return res.json({ suggestions });

    } catch (err) {
      console.error('[OVH Domain] suggest error:', err.message);
      return res.status(500).json({ error: 'Erreur suggestions domaine' });
    }
  });

  // ================================================
  // POST /api/studio/ovh/domain/purchase
  // Acheter un domaine via API OVH
  // Body : { domain: "cabinet-dupont.fr", site_id: "uuid" }
  // Le domaine est acheté sur le compte JADOMI (bk1405647-ovh)
  // ================================================
  router.post('/purchase', requireAuth, async (req, res) => {
    try {
      const { domain, site_id } = req.body || {};
      if (!domain || !site_id) {
        return res.status(400).json({ error: 'domain et site_id requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      // Vérifier que le site appartient à l'utilisateur
      const { data: site, error: siteErr } = await supabase
        .from('sites_jadomi')
        .select('id, societe_id, slug')
        .eq('id', site_id)
        .eq('societe_id', req.societeId)
        .single();
      if (siteErr || !site) {
        return res.status(404).json({ error: 'Site introuvable' });
      }

      // Vérifier pas de doublon
      const { data: existant } = await supabase
        .from('site_hebergements')
        .select('id')
        .eq('domain', domainPropre)
        .neq('statut', 'cancelled')
        .maybeSingle();
      if (existant) {
        return res.status(409).json({ error: 'Ce domaine est déjà utilisé' });
      }

      console.log(`[OVH Domain] Achat domaine ${domainPropre} pour site ${site_id}`);

      // 1. Créer un panier
      const cart = await ovh.requestPromised('POST', '/order/cart', {
        ovhSubsidiary: 'FR',
        description: 'JADOMI site ' + site.slug
      });

      // 2. Assigner le panier au compte OVH
      await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);

      // 3. Ajouter le domaine au panier
      await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/domain`, {
        domain: domainPropre
      });

      // 4. Valider le bon de commande (paiement via moyen par défaut)
      const order = await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/checkout`, {
        autoPayWithPreferredPaymentMethod: true,
        waiveRetractationPeriod: true
      });

      console.log(`[OVH Domain] Commande ${order.orderId} créée pour ${domainPropre}`);

      // 5. Enregistrer en BDD
      const { data: hebergement, error: insertErr } = await supabase
        .from('site_hebergements')
        .insert({
          site_id,
          societe_id: req.societeId,
          domain: domainPropre,
          plan: 'jadomi',
          statut: 'provisioning',
          provider: 'ovh',
          mode: 'production',
          created_by: req.userId
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[OVH Domain] Insert error:', insertErr.message);
        return res.status(500).json({ error: 'Erreur enregistrement hébergement' });
      }

      return res.json({
        ok: true,
        domain: domainPropre,
        order_id: order.orderId,
        order_url: order.url,
        hebergement_id: hebergement.id,
        statut: 'provisioning',
        message: `Domaine ${domainPropre} commandé avec succès. Configuration DNS en cours...`
      });

    } catch (err) {
      console.error('[OVH Domain] purchase error:', err.message, err);
      return res.status(500).json({
        error: 'Erreur lors de l\'achat du domaine',
        detail: err.message
      });
    }
  });

  // ================================================
  // GET /api/studio/ovh/domain/list
  // Lister tous les domaines du compte OVH JADOMI
  // ================================================
  router.get('/list', requireAuth, async (req, res) => {
    try {
      const ovh = getOvhClient();
      if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

      const domains = await ovh.requestPromised('GET', '/domain');
      return res.json({ domains });
    } catch (err) {
      console.error('[OVH Domain] list error:', err.message);
      return res.status(500).json({ error: 'Erreur liste domaines' });
    }
  });

  app.use('/api/studio/ovh/domain', router);
};
