// =============================================
// JADOMI Studio — Module Hébergement OVH
// Routes /api/studio/ovh/*
// Câblé en production avec API OVH réelle
// =============================================

'use strict';

const express = require('express');
const router = express.Router();
const { getOvhClient } = require('../../lib/ovh-client');

const OVH_MODE = process.env.JADOMI_OVH_MODE || 'simulation';

// Formules JADOMI Sites (pas les plans OVH hébergement)
const FORMULES = [
  {
    id: 'classic',
    name: 'Classic',
    price: '19€/mois',
    price_creation: '0€',
    features: ['Site vitrine hébergé', 'Domaine .fr inclus', 'SSL/HTTPS', '1 boîte mail', '2 modifs/mois']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '39€/mois',
    price_creation: '149€',
    features: ['Site vitrine hébergé', 'Domaine .fr inclus', 'SSL/HTTPS', '3 boîtes mail', 'CMS complet', 'Blog']
  },
  {
    id: 'expert',
    name: 'Expert',
    price: '69€/mois',
    price_creation: '299€',
    features: ['Site vitrine hébergé', 'Domaine .fr inclus', 'SSL/HTTPS', '5 boîtes mail', 'CMS avancé', 'A/B testing', 'Multi-langue']
  }
];

// Progression simulée des statuts (simulation uniquement)
const STATUTS_PROGRESSION = ['provisioning', 'configuring', 'deploying', 'active'];

module.exports = function mountOvhHosting(app, supabase) {

  // --- Auth middleware ---
  async function requireAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });
      req.userId = user.id;
      req.userEmail = user.email;
      req.userMeta = user.user_metadata || {};
      const societeId = req.headers['x-societe-id'];
      if (societeId) {
        const { data: role } = await supabase.from('user_societe_roles')
          .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
        if (role) req.societeId = role.societe_id;
      }
      if (!req.societeId) {
        const { data: first } = await supabase.from('user_societe_roles')
          .select('societe_id').eq('user_id', user.id).limit(1).single();
        if (first) req.societeId = first.societe_id;
      }
      if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Authentification échouée' });
    }
  }

  // ================================================
  // GET /api/studio/ovh/plans
  // Lister les formules JADOMI Sites
  // ================================================
  router.get('/plans', requireAuth, (req, res) => {
    return res.json(FORMULES);
  });

  // ================================================
  // POST /api/studio/ovh/check-domain
  // Vérifier disponibilité via OVH API (production) ou simulation
  // Body : { domain: "cabinet-dupont.fr" }
  // ================================================
  router.post('/check-domain', requireAuth, async (req, res) => {
    try {
      const { domain } = req.body || {};
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Le paramètre domain est requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?\.[a-z]{2,}$/.test(domainPropre)) {
        return res.status(400).json({ error: 'Format de domaine invalide' });
      }

      if (OVH_MODE === 'production') {
        const ovh = getOvhClient();
        if (!ovh) return res.status(503).json({ error: 'API OVH non configurée' });

        const cart = await ovh.requestPromised('POST', '/order/cart', {
          ovhSubsidiary: 'FR', description: 'JADOMI check'
        });

        const results = await ovh.requestPromised('GET',
          `/order/cart/${cart.cartId}/domain?domain=${encodeURIComponent(domainPropre)}`
        );

        let available = false;
        let priceHt = null;
        if (results && results.length > 0) {
          available = results[0].action === 'create';
          const total = (results[0].prices || []).find(p => p.label === 'TOTAL') || (results[0].prices || [])[0];
          priceHt = total ? total.price.value : null;
        }

        try { await ovh.requestPromised('DELETE', `/order/cart/${cart.cartId}`); } catch (_) {}

        return res.json({ available, domain: domainPropre, price_ht: priceHt, mode: 'live' });
      }

      // Mode simulation
      return res.json({ available: true, domain: domainPropre, price_ht: 7.99, mode: 'simulation' });

    } catch (err) {
      console.error('[OVH] check-domain error:', err.message);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // ================================================
  // POST /api/studio/ovh/provision
  // Lancer le provisioning complet (délègue à l'orchestrateur)
  // Body : { site_id, domain, plan: "classic|pro|expert" }
  // ================================================
  router.post('/provision', requireAuth, async (req, res) => {
    try {
      const { site_id, domain, plan } = req.body || {};
      if (!site_id || !domain || !plan) {
        return res.status(400).json({ error: 'site_id, domain et plan sont requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      const formuleValide = FORMULES.find(f => f.id === plan);
      if (!formuleValide) {
        return res.status(400).json({ error: `Formule inconnue : ${plan}` });
      }

      // Vérifier site
      const { data: site, error: siteError } = await supabase
        .from('sites_jadomi')
        .select('id, societe_id')
        .eq('id', site_id)
        .eq('societe_id', req.societeId)
        .single();
      if (siteError || !site) {
        return res.status(404).json({ error: 'Site introuvable ou accès refusé' });
      }

      // Vérifier doublon
      const { data: existant } = await supabase
        .from('site_hebergements')
        .select('id, statut')
        .eq('domain', domainPropre)
        .neq('statut', 'cancelled')
        .maybeSingle();
      if (existant) {
        return res.status(409).json({
          error: `Le domaine ${domainPropre} est déjà en cours d'utilisation`,
          statut: existant.statut
        });
      }

      if (OVH_MODE === 'production') {
        // Déléguer à l'orchestrateur (interne)
        // L'orchestrateur est monté sur /api/studio/orchestrator
        // On fait l'appel directement ici pour éviter un HTTP interne
        const orchestrator = require('./site-orchestrator');
        // L'orchestrateur est déjà monté, on redirige
        req.body.formule = plan;
        // Forward vers l'orchestrateur
        return res.redirect(307, '/api/studio/orchestrator/provision');
      }

      // Mode simulation : insérer dans site_hebergements
      const { data: hebergement, error: insertError } = await supabase
        .from('site_hebergements')
        .insert({
          site_id,
          societe_id: req.societeId,
          domain: domainPropre,
          plan,
          statut: 'provisioning',
          provider: 'ovh',
          mode: 'simulation',
          created_by: req.userId
        })
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ error: 'Erreur lors de la création' });
      }

      return res.json({
        ok: true,
        domain: domainPropre,
        status: 'provisioning',
        hebergement_id: hebergement.id,
        message: 'Hébergement en cours de configuration...',
        mode: 'simulation'
      });

    } catch (err) {
      console.error('[OVH] provision error:', err.message);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // ================================================
  // GET /api/studio/ovh/status/:site_id
  // Statut hébergement
  // ================================================
  router.get('/status/:site_id', requireAuth, async (req, res) => {
    try {
      const { site_id } = req.params;
      const { data: hebergement, error } = await supabase
        .from('site_hebergements')
        .select('*')
        .eq('site_id', site_id)
        .eq('societe_id', req.societeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !hebergement) {
        return res.json({ hebergement: null, message: 'Aucun hébergement trouvé' });
      }

      // Simulation : progression auto
      if (hebergement.mode === 'simulation' && hebergement.statut !== 'active' && hebergement.statut !== 'cancelled') {
        const age = Date.now() - new Date(hebergement.updated_at || hebergement.created_at).getTime();
        const indexActuel = STATUTS_PROGRESSION.indexOf(hebergement.statut);
        const etapesSince = Math.floor(age / 30000);
        const nouvelIndex = Math.min(indexActuel + etapesSince, STATUTS_PROGRESSION.length - 1);
        const nouveauStatut = STATUTS_PROGRESSION[nouvelIndex];

        if (nouveauStatut !== hebergement.statut) {
          const updates = { statut: nouveauStatut, updated_at: new Date().toISOString() };
          if (nouveauStatut === 'active') {
            updates.url = `https://${hebergement.domain}`;
            updates.deployed_at = new Date().toISOString();
          }
          await supabase.from('site_hebergements').update(updates).eq('id', hebergement.id);
          Object.assign(hebergement, updates);
        }
      }

      return res.json({
        hebergement,
        statut: hebergement.statut,
        domain: hebergement.domain,
        url: hebergement.url || null,
        mode: hebergement.mode || OVH_MODE
      });
    } catch (err) {
      console.error('[OVH] status error:', err.message);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // ================================================
  // POST /api/studio/ovh/deploy/:site_id
  // Déployer le site
  // ================================================
  router.post('/deploy/:site_id', requireAuth, async (req, res) => {
    try {
      const { site_id } = req.params;
      const { data: hebergement, error } = await supabase
        .from('site_hebergements')
        .select('*')
        .eq('site_id', site_id)
        .eq('societe_id', req.societeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !hebergement) {
        return res.status(404).json({ error: 'Aucun hébergement trouvé' });
      }

      if (hebergement.statut === 'cancelled') {
        return res.status(400).json({ error: 'Cet hébergement a été annulé' });
      }

      const urlSite = `https://${hebergement.domain}`;
      await supabase.from('site_hebergements').update({
        statut: 'active',
        url: urlSite,
        deployed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', hebergement.id);

      return res.json({
        ok: true,
        url: urlSite,
        domain: hebergement.domain,
        status: 'active',
        message: 'Site déployé avec succès'
      });
    } catch (err) {
      console.error('[OVH] deploy error:', err.message);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // Monter les sous-modules OVH (domaine, DNS, mail)
  const mountOvhDomain = require('./ovh-domain');
  const mountOvhDns = require('./ovh-dns');
  const mountOvhMail = require('./ovh-mail');
  const mountOrchestrator = require('./site-orchestrator');

  mountOvhDomain(app, supabase, requireAuth);
  mountOvhDns(app, supabase, requireAuth);
  mountOvhMail(app, supabase, requireAuth);
  mountOrchestrator(app, supabase, requireAuth);

  app.use('/api/studio/ovh', router);
};
