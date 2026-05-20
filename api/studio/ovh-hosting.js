// =============================================
// JADOMI Studio — Module Hébergement OVH
// Routes /api/studio/ovh/*
// Mode : SIMULATION par défaut (JADOMI_OVH_MODE=simulation)
// Pour passer en prod : JADOMI_OVH_MODE=production + OVH_APP_KEY etc.
// =============================================

'use strict';

const express = require('express');
const router = express.Router();

const OVH_MODE = process.env.JADOMI_OVH_MODE || 'simulation';

// Plans d'hébergement disponibles
const PLANS_HEBERGEMENT = [
  {
    id: 'starter',
    name: 'Starter',
    price: '3.99€/mois',
    features: ['10 Go SSD', 'SSL gratuit', '1 site']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '7.99€/mois',
    features: ['100 Go SSD', 'SSL', '10 sites', 'Email pro']
  }
];

// Progression simulée des statuts (simulation uniquement)
const STATUTS_PROGRESSION = ['provisioning', 'configuring', 'deploying', 'active'];

module.exports = function mountOvhHosting(app, supabase) {

  // --- Auth middleware (identique aux autres modules studio) ---
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
  // Lister les plans d'hébergement disponibles
  // ================================================
  router.get('/plans', requireAuth, (req, res) => {
    return res.json(PLANS_HEBERGEMENT);
  });

  // ================================================
  // POST /api/studio/ovh/check-domain
  // Vérifier si un domaine est disponible
  // Body : { domain: "cabinet-dupont.fr" }
  // ================================================
  router.post('/check-domain', requireAuth, async (req, res) => {
    try {
      const { domain } = req.body || {};
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Le paramètre domain est requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.[a-z]{2,}$/.test(domainPropre)) {
        return res.status(400).json({ error: 'Format de domaine invalide' });
      }

      if (OVH_MODE === 'production') {
        // Futur : appel OVH API /domain/check
        // const ovh = require('ovh')({ appKey: process.env.OVH_APP_KEY, ... });
        // const result = await ovh.requestPromised('GET', '/domain/check', { domain: domainPropre });
        return res.status(503).json({ error: 'Mode production non encore configuré' });
      }

      // Mode simulation : disponible par défaut
      return res.json({
        available: true,
        domain: domainPropre,
        price: '8.99€/an',
        mode: 'simulation'
      });

    } catch (err) {
      console.error('[OVH] check-domain error:', err.message);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // ================================================
  // POST /api/studio/ovh/provision
  // Commander domaine + hébergement
  // Body : { site_id, domain, plan: "starter" }
  // ================================================
  router.post('/provision', requireAuth, async (req, res) => {
    try {
      const { site_id, domain, plan } = req.body || {};
      if (!site_id || !domain || !plan) {
        return res.status(400).json({ error: 'site_id, domain et plan sont requis' });
      }

      const domainPropre = domain.trim().toLowerCase();
      const planValide = PLANS_HEBERGEMENT.find(p => p.id === plan);
      if (!planValide) {
        return res.status(400).json({ error: `Plan inconnu : ${plan}. Plans disponibles : starter, pro` });
      }

      // Vérifier que le site appartient bien à la société de l'utilisateur
      const { data: site, error: siteError } = await supabase
        .from('sites_jadomi')
        .select('id, societe_id')
        .eq('id', site_id)
        .eq('societe_id', req.societeId)
        .single();

      if (siteError || !site) {
        return res.status(404).json({ error: 'Site introuvable ou accès refusé' });
      }

      // Vérifier qu'il n'y a pas déjà un hébergement actif pour ce domaine
      const { data: existant } = await supabase
        .from('site_hebergements')
        .select('id, statut')
        .eq('domain', domainPropre)
        .neq('statut', 'cancelled')
        .single();

      if (existant) {
        return res.status(409).json({
          error: `Le domaine ${domainPropre} est déjà en cours d'utilisation`,
          statut: existant.statut
        });
      }

      if (OVH_MODE === 'production') {
        // Futur : appels OVH API commande domaine + hébergement
        return res.status(503).json({ error: 'Mode production non encore configuré' });
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
        console.error('[OVH] provision insert error:', insertError.message);
        return res.status(500).json({ error: 'Erreur lors de la création de l\'hébergement' });
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
  // Statut de l'hébergement d'un site
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
        return res.json({ hebergement: null, message: 'Aucun hébergement trouvé pour ce site' });
      }

      // En mode simulation : progression automatique du statut toutes les 30 secondes
      if (OVH_MODE === 'simulation' && hebergement.statut !== 'active' && hebergement.statut !== 'cancelled') {
        const age = Date.now() - new Date(hebergement.updated_at || hebergement.created_at).getTime();
        const indexActuel = STATUTS_PROGRESSION.indexOf(hebergement.statut);
        const etapesSince = Math.floor(age / 30000); // 30 secondes par étape
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
  // Déployer le site généré sur l'hébergement
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
        return res.status(404).json({ error: 'Aucun hébergement trouvé pour ce site. Lancez d\'abord /provision.' });
      }

      if (hebergement.statut === 'cancelled') {
        return res.status(400).json({ error: 'Cet hébergement a été annulé' });
      }

      if (OVH_MODE === 'production') {
        // Futur : transfert FTP/SSH ou API OVH deploy
        return res.status(503).json({ error: 'Mode production non encore configuré' });
      }

      // Mode simulation : passer directement en active
      const urlSite = `https://${hebergement.domain}`;
      const { error: updateError } = await supabase
        .from('site_hebergements')
        .update({
          statut: 'active',
          url: urlSite,
          deployed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', hebergement.id);

      if (updateError) {
        console.error('[OVH] deploy update error:', updateError.message);
        return res.status(500).json({ error: 'Erreur lors du déploiement' });
      }

      return res.json({
        ok: true,
        url: urlSite,
        domain: hebergement.domain,
        status: 'active',
        message: 'Site déployé avec succès',
        mode: 'simulation'
      });

    } catch (err) {
      console.error('[OVH] deploy error:', err.message);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  });

  app.use('/api/studio/ovh', router);
};
