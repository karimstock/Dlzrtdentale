// =============================================
// JADOMI Studio — API Sites crees chez JADOMI
// Passe 38 — 24 avril 2026
// Routes /api/studio/sites-jadomi/*
// =============================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { genererSite, regenererSite } = require('../../../services/site-generator');
const { suggestText, suggestPalette, suggestPhotos, verifierSite } = require('../../../services/ia-assistant');

module.exports = function mountSitesJadomi(app, supabase) {

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
    } catch { return res.status(401).json({ error: 'Auth echouee' }); }
  }

  // Upload config
  const uploadsDir = path.join(__dirname, '../../../sites-clients');
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(uploadsDir, req.siteSlug || 'tmp', 'assets');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9._-]/gi, ''))
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('Format non autorise'));
    }
  });

  // ================================================
  // GET /api/studio/sites-jadomi/themes?metier=dentiste
  // ================================================
  router.get('/themes', async (req, res) => {
    try {
      let query = supabase.from('themes_sites').select('*').eq('actif', true).order('ordre');
      if (req.query.metier) query = query.eq('metier', req.query.metier);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/sites-jadomi/mon-site
  // ================================================
  router.get('/mon-site', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase.from('sites_jadomi')
        .select('*').eq('societe_id', req.societeId)
        .order('created_at', { ascending: false }).limit(1).single();
      if (error || !data) return res.json({ site: null });

      const { data: sections } = await supabase.from('sites_jadomi_sections')
        .select('*').eq('site_id', data.id).order('ordre');

      return res.json({ site: data, sections: sections || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-jadomi/creer
  // ================================================
  router.post('/creer', requireAuth, async (req, res) => {
    try {
      const { theme_code, nom_cabinet, slogan, adresse, telephone, email, metier, services, horaires } = req.body || {};
      if (!theme_code || !nom_cabinet) return res.status(400).json({ error: 'theme_code et nom_cabinet requis' });

      // Generer slug
      const slug = nom_cabinet.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60)
        + '-' + Date.now().toString(36);

      // Creer le site
      const { data: site, error: siteErr } = await supabase.from('sites_jadomi')
        .insert({
          societe_id: req.societeId,
          slug,
          theme_code,
          metier: metier || req.userMeta?.profession || 'dentiste',
          nom_affiche: nom_cabinet,
          url_jadomi: 'https://jadomi.fr/sites/' + slug + '/',
          statut: 'en_creation'
        })
        .select().single();

      if (siteErr) return res.status(500).json({ error: siteErr.message });

      // Creer les sections initiales
      const sectionsInit = [
        { cle: 'hero', type_section: 'hero', ordre: 1, valeur: { slogan: slogan || '', description: '', photo: '' } },
        { cle: 'about', type_section: 'content', ordre: 2, valeur: { texte: '' } },
        { cle: 'services', type_section: 'list', ordre: 3, valeur: { liste: (services || []).map(s => typeof s === 'string' ? { nom: s, description: '' } : s) } },
        { cle: 'equipe', type_section: 'list', ordre: 4, valeur: { membres: [] } },
        { cle: 'horaires', type_section: 'horaires', ordre: 5, valeur: { jours: horaires || [] } },
        { cle: 'contact', type_section: 'contact', ordre: 6, valeur: { adresse: adresse || '', telephone: telephone || '', email: email || '' } },
        { cle: 'logo', type_section: 'media', ordre: 0, valeur: { url: '' } }
      ];

      for (const sec of sectionsInit) {
        await supabase.from('sites_jadomi_sections').insert({
          site_id: site.id, societe_id: req.societeId, ...sec
        });
      }

      // Generer en arriere-plan
      genererSite(site.id, supabase)
        .then(r => console.log('[site-gen] ' + slug + ':', r.success ? 'OK' : 'FAIL'))
        .catch(e => console.error('[site-gen] Error:', e.message));

      return res.status(201).json({
        site_id: site.id, slug, url_preview: '/sites/' + slug + '/',
        message: 'Site en cours de generation...'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-jadomi/:id/upload-photo
  // ================================================
  router.post('/:id/upload-photo', requireAuth, async (req, res, next) => {
    const { data: site } = await supabase.from('sites_jadomi')
      .select('slug').eq('id', req.params.id).eq('societe_id', req.societeId).single();
    if (!site) return res.status(404).json({ error: 'Site non trouve' });
    req.siteSlug = site.slug;
    next();
  }, upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
      const url = '/sites/' + req.siteSlug + '/assets/' + req.file.filename;
      return res.json({ url, filename: req.file.filename, size: req.file.size });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // PUT /api/studio/sites-jadomi/:id/section/:section_id
  // ================================================
  router.put('/:id/section/:section_id', requireAuth, async (req, res) => {
    try {
      const { valeur } = req.body || {};
      const { data, error } = await supabase.from('sites_jadomi_sections')
        .update({ valeur, updated_at: new Date().toISOString() })
        .eq('id', req.params.section_id)
        .eq('site_id', req.params.id)
        .eq('societe_id', req.societeId)
        .select().single();
      if (error) return res.status(500).json({ error: error.message });

      // Regenerer async
      regenererSite(req.params.id, supabase, 'Modification section')
        .catch(e => console.error('[regen]', e.message));

      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-jadomi/:id/publier
  // ================================================
  router.post('/:id/publier', requireAuth, async (req, res) => {
    try {
      const issues = await verifierSite(req.params.id, supabase);
      const errors = issues.filter(i => i.type === 'error');
      if (errors.length) return res.status(400).json({ error: 'Verification echouee', issues });

      const result = await genererSite(req.params.id, supabase);
      return res.json({ ...result, issues });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/sites-jadomi/:id/versions
  // ================================================
  router.get('/:id/versions', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase.from('sites_jadomi_versions')
        .select('id, commentaire, auteur_user_id, created_at')
        .eq('site_id', req.params.id).eq('societe_id', req.societeId)
        .order('created_at', { ascending: false }).limit(30);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-jadomi/:id/rollback/:version_id
  // ================================================
  router.post('/:id/rollback/:version_id', requireAuth, async (req, res) => {
    try {
      const { data: version } = await supabase.from('sites_jadomi_versions')
        .select('*').eq('id', req.params.version_id).eq('site_id', req.params.id).single();
      if (!version || !version.snapshot?.sections) return res.status(404).json({ error: 'Version non trouvee' });

      // Supprimer sections actuelles et restaurer
      await supabase.from('sites_jadomi_sections').delete().eq('site_id', req.params.id);
      for (const sec of version.snapshot.sections) {
        await supabase.from('sites_jadomi_sections').insert({
          site_id: req.params.id, societe_id: req.societeId,
          type_section: sec.type_section, cle: sec.cle, valeur: sec.valeur, ordre: sec.ordre, actif: sec.actif
        });
      }

      await regenererSite(req.params.id, supabase, 'Rollback vers version ' + req.params.version_id);
      return res.json({ success: true, message: 'Version restauree' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/sites-jadomi/:id/changer-theme
  // ================================================
  router.post('/:id/changer-theme', requireAuth, async (req, res) => {
    try {
      const { theme_code } = req.body || {};
      if (!theme_code) return res.status(400).json({ error: 'theme_code requis' });

      await supabase.from('sites_jadomi').update({ theme_code, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('societe_id', req.societeId);
      const result = await regenererSite(req.params.id, supabase, 'Changement theme → ' + theme_code);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // IA ASSISTANT ENDPOINTS
  // ================================================

  // POST /api/studio/sites-jadomi/:id/suggest-text
  router.post('/:id/suggest-text', requireAuth, async (req, res) => {
    try {
      const { type, contexte_cabinet, texte_actuel } = req.body || {};
      const { data: site } = await supabase.from('sites_jadomi')
        .select('metier, nom_affiche').eq('id', req.params.id).single();

      const result = await suggestText(type || 'hero_titre', contexte_cabinet || site?.nom_affiche, texte_actuel, site?.metier);

      // Logger
      await supabase.from('sites_jadomi_suggestions_ia').insert({
        site_id: req.params.id, societe_id: req.societeId,
        contexte: type, propositions: result.propositions, cout_ia_centimes: result.cout_centimes
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/sites-jadomi/:id/suggest-palette
  router.post('/:id/suggest-palette', requireAuth, async (req, res) => {
    try {
      const { ambiance } = req.body || {};
      const palettes = await suggestPalette(ambiance || 'premium');
      return res.json({ palettes });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/sites-jadomi/:id/suggest-photo
  router.post('/:id/suggest-photo', requireAuth, async (req, res) => {
    try {
      const { section } = req.body || {};
      const { data: site } = await supabase.from('sites_jadomi')
        .select('metier').eq('id', req.params.id).single();
      const photos = await suggestPhotos(section || 'hero', site?.metier || 'dentiste');
      return res.json({ photos });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/sites-jadomi/:id/verifier
  router.post('/:id/verifier', requireAuth, async (req, res) => {
    try {
      const issues = await verifierSite(req.params.id, supabase);
      return res.json({ issues });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/studio/sites-jadomi/:id/migrer-ovh (STUB)
  router.post('/:id/migrer-ovh', requireAuth, (req, res) => {
    return res.json({
      disponible: false,
      raison: 'API OVH pas configuree. Migration disponible prochainement.'
    });
  });

  app.use('/api/studio/sites-jadomi', router);
};
