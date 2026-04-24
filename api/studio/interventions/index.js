// =============================================
// JADOMI Studio — API Interventions IA
// Passe 38 — 24 avril 2026
// Routes /api/studio/interventions/*
// =============================================
const express = require('express');
const router = express.Router();
const { executerIntervention, rollbackIntervention, dechiffrerCredentials } = require('../../../services/intervention-ia');

module.exports = function mountInterventions(app, supabase) {

  // --- Auth middleware ---
  async function requireAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });
      req.userId = user.id;
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
    } catch { return res.status(401).json({ error: 'Auth echouee' }); }
  }

  // --- Rate limit : max 5/site/jour, 10/pro/jour ---
  async function checkLimits(req, res, next) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const siteId = req.body?.site_id;

    if (siteId) {
      const { count } = await supabase.from('sites_existants_interventions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId).eq('exec_automatique', true)
        .gte('executee_le', today.toISOString());
      if ((count || 0) >= 5) return res.status(429).json({ error: 'Limite 5 interventions auto/site/jour atteinte' });
    }

    const { count: countPro } = await supabase.from('sites_existants_interventions')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', req.societeId).eq('exec_automatique', true)
      .gte('executee_le', today.toISOString());
    if ((countPro || 0) >= 10) return res.status(429).json({ error: 'Limite 10 interventions auto/jour atteinte' });

    next();
  }

  // ================================================
  // POST /api/studio/interventions/demande-libre
  // ================================================
  router.post('/demande-libre', requireAuth, checkLimits, async (req, res) => {
    try {
      const { site_id, demande } = req.body || {};
      if (!site_id || !demande || demande.trim().length < 5) {
        return res.status(400).json({ error: 'site_id et demande requis (5 caracteres min)' });
      }

      // Verifier que le site appartient au pro
      const { data: site } = await supabase.from('sites_existants')
        .select('id').eq('id', site_id).eq('societe_id', req.societeId).single();
      if (!site) return res.status(404).json({ error: 'Site non trouve' });

      // Creer l'intervention
      const { data: intervention, error } = await supabase
        .from('sites_existants_interventions')
        .insert({
          site_id,
          societe_id: req.societeId,
          type_intervention: 'demande_libre',
          demande_libre: demande.trim(),
          description: demande.trim(),
          statut: 'en_cours',
          exec_automatique: true,
          executee_par: req.userId
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Lancer en arriere-plan
      executerIntervention(intervention.id, supabase)
        .then(result => console.log('[intervention] Terminee:', intervention.id.substring(0, 8), result.success ? 'OK' : 'FAIL'))
        .catch(err => console.error('[intervention] Crash:', err.message));

      return res.status(201).json({
        intervention_id: intervention.id,
        statut: 'en_cours',
        message: 'JADOMI IA analyse votre demande...'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/interventions/action-rapide
  // ================================================
  router.post('/action-rapide', requireAuth, checkLimits, async (req, res) => {
    try {
      const { site_id, action_code, parametres } = req.body || {};
      if (!site_id || !action_code) return res.status(400).json({ error: 'site_id et action_code requis' });

      // Charger l'action predefinie
      const { data: action } = await supabase.from('interventions_actions_predefinies')
        .select('*').eq('code', action_code).single();
      if (!action) return res.status(404).json({ error: 'Action inconnue: ' + action_code });

      // Verifier site
      const { data: site } = await supabase.from('sites_existants')
        .select('id').eq('id', site_id).eq('societe_id', req.societeId).single();
      if (!site) return res.status(404).json({ error: 'Site non trouve' });

      // Construire la demande a partir du prompt_ia + parametres
      let demande = action.prompt_ia;
      if (parametres) {
        for (const [k, v] of Object.entries(parametres)) {
          demande += `\nParametre "${k}" : ${v}`;
        }
      }

      // Creer l'intervention
      const { data: intervention, error } = await supabase
        .from('sites_existants_interventions')
        .insert({
          site_id,
          societe_id: req.societeId,
          type_intervention: 'action_rapide',
          type_technique: action_code,
          demande_libre: demande,
          description: action.nom + (parametres ? ' — ' + JSON.stringify(parametres) : ''),
          niveau_complexite: action.complexite,
          statut: 'en_cours',
          exec_automatique: true,
          executee_par: req.userId
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Lancer en arriere-plan
      executerIntervention(intervention.id, supabase)
        .then(result => console.log('[action-rapide] ' + action_code + ':', result.success ? 'OK' : 'FAIL'))
        .catch(err => console.error('[action-rapide] Crash:', err.message));

      return res.status(201).json({
        intervention_id: intervention.id,
        action: action.nom,
        statut: 'en_cours',
        message: 'JADOMI IA execute: ' + action.nom + '...'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/interventions/:id/status
  // ================================================
  router.get('/:id/status', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase.from('sites_existants_interventions')
        .select('id, statut, type_intervention, description, niveau_complexite, analyse_ia, duree_ms, cout_ia_centimes, rollback_effectue, exec_automatique, executee_le')
        .eq('id', req.params.id)
        .eq('societe_id', req.societeId)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Intervention non trouvee' });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/interventions/historique/:site_id
  // ================================================
  router.get('/historique/:site_id', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase.from('sites_existants_interventions')
        .select('id, type_intervention, type_technique, description, statut, niveau_complexite, duree_ms, cout_ia_centimes, rollback_effectue, rollback_possible, executee_le')
        .eq('site_id', req.params.site_id)
        .eq('societe_id', req.societeId)
        .order('executee_le', { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/interventions/:id/rollback
  // ================================================
  router.post('/:id/rollback', requireAuth, async (req, res) => {
    try {
      const { data: intervention } = await supabase.from('sites_existants_interventions')
        .select('*, sites_existants(*)')
        .eq('id', req.params.id)
        .eq('societe_id', req.societeId)
        .single();

      if (!intervention) return res.status(404).json({ error: 'Intervention non trouvee' });
      if (intervention.rollback_effectue) return res.status(400).json({ error: 'Rollback deja effectue' });

      // Dechiffrer credentials
      const { data: credRow } = await supabase.from('sites_existants_credentials')
        .select('*').eq('site_id', intervention.site_id)
        .order('created_at', { ascending: false }).limit(1).single();

      if (!credRow) return res.status(400).json({ error: 'Aucun credential pour rollback' });

      const creds = dechiffrerCredentials(credRow.donnees_chiffrees, credRow.iv, credRow.tag, process.env.SITE_CREDENTIALS_KEY);

      let ftpClient = null;
      if (credRow.type_acces === 'ftp' || credRow.type_acces === 'sftp') {
        const ftpLib = require('basic-ftp');
        ftpClient = new ftpLib.Client();
        await ftpClient.access({ host: creds.host, port: parseInt(creds.port) || 21, user: creds.user, password: creds.password });
      }

      const ok = await rollbackIntervention(req.params.id, supabase, ftpClient, creds, credRow.type_acces);
      if (ftpClient) ftpClient.close();

      return res.json({ success: ok, message: ok ? 'Rollback effectue, fichiers restaures' : 'Rollback echoue' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/interventions/actions-rapides
  // ================================================
  router.get('/actions-rapides', async (req, res) => {
    try {
      const { data, error } = await supabase.from('interventions_actions_predefinies')
        .select('*').order('ordre');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/studio/interventions', router);
};
