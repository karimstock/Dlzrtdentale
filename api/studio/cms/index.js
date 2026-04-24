// =============================================
// JADOMI Studio CMS — API CRUD contenus/photos/demandes
// Passe 36 — 24 avril 2026
// Routes /api/studio/cms/*
// Middleware forfait + quotas integre
// =============================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = function mountCMS(app, supabase) {

  // --- Auth middleware ---
  async function requireAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });
      req.userId = user.id;
      req.userEmail = user.email;

      // Chercher societe_id via user_societe_roles
      const societeId = req.headers['x-societe-id'];
      if (societeId) {
        const { data: role } = await supabase
          .from('user_societe_roles')
          .select('societe_id, role')
          .eq('user_id', user.id)
          .eq('societe_id', societeId)
          .single();
        if (role) {
          req.societeId = role.societe_id;
          req.userRole = role.role;
        }
      }
      if (!req.societeId) {
        // Fallback : prendre la premiere societe du user
        const { data: firstRole } = await supabase
          .from('user_societe_roles')
          .select('societe_id, role')
          .eq('user_id', user.id)
          .limit(1)
          .single();
        if (firstRole) {
          req.societeId = firstRole.societe_id;
          req.userRole = firstRole.role;
        }
      }
      if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation trouvee' });
      next();
    } catch (err) {
      console.error('[cms/auth]', err.message);
      return res.status(401).json({ error: 'Authentification echouee' });
    }
  }

  // --- Middleware verification forfait ---
  async function requireForfait(req, res, next) {
    try {
      const { data: abo, error } = await supabase
        .from('studio_abonnements')
        .select('*, studio_forfaits(*)')
        .eq('organisation_id', req.societeId)
        .eq('statut', 'actif')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !abo) {
        return res.status(403).json({
          error: 'no_subscription',
          message: 'Aucun abonnement JADOMI Studio actif. Souscrivez pour acceder au CMS.',
          upgrade_url: '/tarifs'
        });
      }

      req.abonnement = abo;
      req.forfait = abo.studio_forfaits;
      req.forfaitCode = abo.studio_forfaits?.code || 'classic';
      req.features = abo.studio_forfaits?.features || {};
      req.quotas = abo.studio_forfaits?.quotas || {};
      next();
    } catch (err) {
      console.error('[cms/forfait]', err.message);
      return res.status(500).json({ error: 'Erreur verification forfait' });
    }
  }

  // --- Middleware verification acces CMS (bloque Classic) ---
  function requireCMS(req, res, next) {
    if (!req.features?.cms) {
      return res.status(403).json({
        error: 'upgrade_required',
        current: req.forfaitCode,
        message: 'Passez en JADOMI Studio Pro pour modifier votre site vous-meme.',
        upgrade_to: 'pro',
        upgrade_url: '/tarifs'
      });
    }
    next();
  }

  // --- Middleware verification quotas ---
  function requireQuota(quotaKey) {
    return async (req, res, next) => {
      try {
        const maxQuota = req.quotas?.[quotaKey];
        if (maxQuota === 'illimite' || maxQuota === undefined) return next();

        let currentCount = 0;

        if (quotaKey === 'photos') {
          const { count } = await supabase
            .from('site_photos')
            .select('*', { count: 'exact', head: true })
            .eq('organisation_id', req.societeId)
            .eq('actif', true);
          currentCount = count || 0;

        } else if (quotaKey === 'pages') {
          const { count } = await supabase
            .from('site_contenus')
            .select('*', { count: 'exact', head: true })
            .eq('organisation_id', req.societeId);
          // On compte les sections distinctes comme "pages"
          currentCount = count || 0;

        } else if (quotaKey === 'modifications_mois') {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          const { count } = await supabase
            .from('site_demandes_modif')
            .select('*', { count: 'exact', head: true })
            .eq('organisation_id', req.societeId)
            .gte('demandee_le', startOfMonth.toISOString());
          currentCount = count || 0;
        }

        const max = parseInt(maxQuota) || 0;
        if (currentCount >= max) {
          // Determiner le forfait superieur
          let upgradeTo = 'expert';
          if (req.forfaitCode === 'classic') upgradeTo = 'pro';

          return res.status(403).json({
            error: 'quota_exceeded',
            quota: quotaKey,
            current: currentCount,
            max: max,
            upgrade_to: upgradeTo,
            message: `Quota ${quotaKey} atteint (${currentCount}/${max}). Passez en ${upgradeTo} pour plus de capacite.`
          });
        }

        req.quotaInfo = { key: quotaKey, current: currentCount, max: max };
        next();
      } catch (err) {
        console.error('[cms/quota]', err.message);
        next(); // En cas d'erreur quota, on laisse passer (fail-open)
      }
    };
  }

  // ================================================
  // GET /api/studio/cms/mon-forfait
  // Info abonnement (toutes formules)
  // ================================================
  router.get('/mon-forfait', requireAuth, requireForfait, async (req, res) => {
    try {
      // Calculer l'utilisation actuelle
      const [photosRes, contenusRes, demandesRes] = await Promise.all([
        supabase.from('site_photos').select('*', { count: 'exact', head: true })
          .eq('organisation_id', req.societeId).eq('actif', true),
        supabase.from('site_contenus').select('*', { count: 'exact', head: true })
          .eq('organisation_id', req.societeId),
        supabase.from('site_demandes_modif').select('*', { count: 'exact', head: true })
          .eq('organisation_id', req.societeId)
          .gte('demandee_le', new Date(new Date().setDate(1)).toISOString())
      ]);

      return res.json({
        forfait: {
          code: req.forfaitCode,
          nom: req.forfait?.nom,
          prix_mensuel_eur: req.forfait?.prix_mensuel_eur,
          features: req.features,
          quotas: req.quotas
        },
        abonnement: {
          statut: req.abonnement?.statut,
          date_debut: req.abonnement?.date_debut,
          date_fin: req.abonnement?.date_fin
        },
        utilisation: {
          photos: photosRes.count || 0,
          contenus: contenusRes.count || 0,
          demandes_ce_mois: demandesRes.count || 0
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // CONTENUS — CRUD
  // ================================================

  // GET /api/studio/cms/contenus — tous les contenus groupes par section
  router.get('/contenus', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_contenus')
        .select('*')
        .eq('organisation_id', req.societeId)
        .order('section')
        .order('cle');

      if (error) return res.status(500).json({ error: error.message });

      // Grouper par section
      const grouped = {};
      for (const item of (data || [])) {
        if (!grouped[item.section]) grouped[item.section] = [];
        grouped[item.section].push(item);
      }

      return res.json({ contenus: grouped, total: (data || []).length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/studio/cms/contenus/:section
  router.get('/contenus/:section', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_contenus')
        .select('*')
        .eq('organisation_id', req.societeId)
        .eq('section', req.params.section)
        .order('cle');

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/cms/contenus
  router.post('/contenus', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { section, cle, valeur, type } = req.body || {};
      if (!section || !cle) return res.status(400).json({ error: 'section et cle requis' });

      const { data, error } = await supabase
        .from('site_contenus')
        .insert({
          organisation_id: req.societeId,
          section,
          cle,
          valeur: valeur || '',
          type: type || 'texte',
          version: 1
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/studio/cms/contenus/:id
  router.put('/contenus/:id', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { valeur } = req.body || {};

      // Lire la valeur actuelle
      const { data: current, error: readErr } = await supabase
        .from('site_contenus')
        .select('*')
        .eq('id', req.params.id)
        .eq('organisation_id', req.societeId)
        .single();

      if (readErr || !current) return res.status(404).json({ error: 'Contenu non trouve' });

      // Sauvegarder dans l'historique
      await supabase.from('site_contenus_historique').insert({
        contenu_id: current.id,
        organisation_id: req.societeId,
        valeur_avant: current.valeur,
        valeur_apres: valeur,
        modifie_par: req.userId
      });

      // Mettre a jour le contenu
      const { data: updated, error: updateErr } = await supabase
        .from('site_contenus')
        .update({
          valeur,
          version: (current.version || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id)
        .eq('organisation_id', req.societeId)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: updateErr.message });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/studio/cms/historique/:contenu_id
  router.get('/historique/:contenu_id', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_contenus_historique')
        .select('*')
        .eq('contenu_id', req.params.contenu_id)
        .eq('organisation_id', req.societeId)
        .order('modifie_le', { ascending: false })
        .limit(50);

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/cms/rollback/:contenu_id
  router.post('/rollback/:contenu_id', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { version } = req.body || {};

      // Lire le contenu actuel
      const { data: current, error: readErr } = await supabase
        .from('site_contenus')
        .select('*')
        .eq('id', req.params.contenu_id)
        .eq('organisation_id', req.societeId)
        .single();

      if (readErr || !current) return res.status(404).json({ error: 'Contenu non trouve' });

      // Chercher la version demandee dans l'historique
      const { data: historyEntries } = await supabase
        .from('site_contenus_historique')
        .select('*')
        .eq('contenu_id', req.params.contenu_id)
        .eq('organisation_id', req.societeId)
        .order('modifie_le', { ascending: false });

      if (!historyEntries || historyEntries.length === 0) {
        return res.status(400).json({ error: 'Pas d\'historique disponible' });
      }

      // On prend la valeur_avant de l'entree demandee (ou la plus recente si pas de version specifiee)
      const targetIndex = version ? Math.min(version - 1, historyEntries.length - 1) : 0;
      const targetEntry = historyEntries[targetIndex];
      const restoredValue = targetEntry.valeur_avant;

      // Enregistrer le rollback dans l'historique
      await supabase.from('site_contenus_historique').insert({
        contenu_id: current.id,
        organisation_id: req.societeId,
        valeur_avant: current.valeur,
        valeur_apres: restoredValue,
        modifie_par: req.userId
      });

      // Appliquer le rollback
      const { data: updated, error: updateErr } = await supabase
        .from('site_contenus')
        .update({
          valeur: restoredValue,
          version: (current.version || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.contenu_id)
        .eq('organisation_id', req.societeId)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: updateErr.message });
      return res.json({ message: 'Rollback effectue', contenu: updated });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // PHOTOS — CRUD
  // ================================================

  // Config multer pour uploads
  const uploadsDir = path.join(__dirname, '../../../public/uploads');

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const orgDir = path.join(uploadsDir, req.societeId || 'unknown');
      if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
      cb(null, orgDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
      const allowed = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i;
      if (allowed.test(file.originalname)) return cb(null, true);
      cb(new Error('Type de fichier non autorise. Formats acceptes : JPG, PNG, GIF, WebP, SVG'));
    }
  });

  // GET /api/studio/cms/photos
  router.get('/photos', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_photos')
        .select('*')
        .eq('organisation_id', req.societeId)
        .eq('actif', true)
        .order('section')
        .order('ordre');

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/studio/cms/photos/:section
  router.get('/photos/:section', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_photos')
        .select('*')
        .eq('organisation_id', req.societeId)
        .eq('section', req.params.section)
        .eq('actif', true)
        .order('ordre');

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/cms/photos/upload
  router.post('/photos/upload', requireAuth, requireForfait, requireCMS, requireQuota('photos'), upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier recu' });

      const { section, titre, description } = req.body || {};
      const fileUrl = '/uploads/' + (req.societeId || 'unknown') + '/' + req.file.filename;

      // TODO: Cloudflare R2 upload si configure (fallback local OK)

      const { data, error } = await supabase
        .from('site_photos')
        .insert({
          organisation_id: req.societeId,
          url: fileUrl,
          titre: titre || req.file.originalname,
          description: description || '',
          section: section || 'general',
          ordre: 0,
          actif: true
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      return res.status(201).json({
        ...data,
        quota: req.quotaInfo
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/studio/cms/photos/:id
  router.put('/photos/:id', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { titre, description, section, ordre } = req.body || {};
      const updates = {};
      if (titre !== undefined) updates.titre = titre;
      if (description !== undefined) updates.description = description;
      if (section !== undefined) updates.section = section;
      if (ordre !== undefined) updates.ordre = ordre;

      const { data, error } = await supabase
        .from('site_photos')
        .update(updates)
        .eq('id', req.params.id)
        .eq('organisation_id', req.societeId)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/studio/cms/photos/:id (soft delete)
  router.delete('/photos/:id', requireAuth, requireForfait, requireCMS, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_photos')
        .update({ actif: false })
        .eq('id', req.params.id)
        .eq('organisation_id', req.societeId)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ message: 'Photo desactivee', photo: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // DEMANDES — Pour formule Classic
  // ================================================

  // POST /api/studio/cms/demandes
  router.post('/demandes', requireAuth, requireForfait, requireQuota('modifications_mois'), async (req, res) => {
    try {
      const { description } = req.body || {};
      if (!description || description.trim().length < 10) {
        return res.status(400).json({ error: 'Description trop courte (10 caracteres minimum)' });
      }

      const { data, error } = await supabase
        .from('site_demandes_modif')
        .insert({
          organisation_id: req.societeId,
          description: description.trim()
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // TODO: notification admin (email ou queue selon existant)

      return res.status(201).json({
        ...data,
        quota: req.quotaInfo
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/studio/cms/demandes
  router.get('/demandes', requireAuth, requireForfait, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_demandes_modif')
        .select('*')
        .eq('organisation_id', req.societeId)
        .order('demandee_le', { ascending: false })
        .limit(50);

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // FORFAITS — Liste publique
  // ================================================
  router.get('/forfaits', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('studio_forfaits')
        .select('*')
        .eq('actif', true)
        .order('ordre');

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/studio/cms', router);
};
