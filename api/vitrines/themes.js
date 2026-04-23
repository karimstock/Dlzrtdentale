// =============================================
// JADOMI — Module Mon site internet
// themes.js — Gestion des thèmes couleurs
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

module.exports = function(router) {

  // ------------------------------------------
  // GET /themes — Liste tous les thèmes actifs
  // ------------------------------------------
  router.get('/themes', async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('vitrines_themes')
        .select('slug, name, description, metier_category, professions, color_primary, color_primary_dark, color_secondary, color_text, color_text_muted, color_background, color_surface, color_border, color_footer_bg, color_footer_text, font_heading, font_body, premium, min_plan, sort_order')
        .eq('active', true)
        .order('sort_order');
      if (error) throw error;
      res.json({ success: true, themes: data || [] });
    } catch (err) {
      console.error('[vitrines/themes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /themes/:slug — Détail d'un thème
  // ------------------------------------------
  router.get('/themes/:slug', async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('vitrines_themes')
        .select('*')
        .eq('slug', req.params.slug)
        .eq('active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Theme introuvable' });
      res.json({ success: true, theme: data });
    } catch (err) {
      console.error('[vitrines/themes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /themes/for-profession/:professionId — Thèmes pertinents
  // ------------------------------------------
  router.get('/themes/for-profession/:professionId', async (req, res) => {
    try {
      const profId = req.params.professionId;
      const { data, error } = await admin()
        .from('vitrines_themes')
        .select('slug, name, description, metier_category, professions, color_primary, color_primary_dark, color_secondary, color_text, color_text_muted, color_background, color_surface, color_border, color_footer_bg, color_footer_text, font_heading, font_body, premium, min_plan, sort_order')
        .eq('active', true)
        .order('sort_order');
      if (error) throw error;

      // Filter: themes with '*' in professions or matching professionId or 'all' category
      const filtered = (data || []).filter(t => {
        if (!t.professions || !t.professions.length) return true;
        if (t.professions.includes('*')) return true;
        if (t.professions.includes(profId)) return true;
        if (t.metier_category === 'all') return true;
        return false;
      });

      // Sort: matching professions first, then 'all'
      filtered.sort((a, b) => {
        const aMatch = a.professions && a.professions.includes(profId) ? 0 : 1;
        const bMatch = b.professions && b.professions.includes(profId) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      res.json({ success: true, themes: filtered });
    } catch (err) {
      console.error('[vitrines/themes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /themes/preview — Preview URL sans sauvegarder
  // ------------------------------------------
  router.post('/themes/preview', requireSociete(), async (req, res) => {
    try {
      const { site_id, theme_slug } = req.body;
      if (!site_id || !theme_slug) {
        return res.status(400).json({ success: false, error: 'site_id et theme_slug requis' });
      }

      // Vérifier que le thème existe
      const { data: theme } = await admin()
        .from('vitrines_themes')
        .select('slug')
        .eq('slug', theme_slug)
        .eq('active', true)
        .maybeSingle();
      if (!theme) return res.status(404).json({ success: false, error: 'Theme introuvable' });

      // Vérifier accès au site
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id, societe_id')
        .eq('id', site_id)
        .maybeSingle();
      if (!site) return res.status(404).json({ success: false, error: 'Site introuvable' });
      if (site.societe_id !== req.societe.id) {
        return res.status(403).json({ success: false, error: 'Acces interdit' });
      }

      res.json({
        success: true,
        preview_url: `/site/preview-${site_id}?theme=${theme_slug}`
      });
    } catch (err) {
      console.error('[vitrines/themes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /sites/:siteId/theme — Appliquer un thème
  // ------------------------------------------
  router.patch('/sites/:siteId/theme', requireSociete(), async (req, res) => {
    try {
      const { siteId } = req.params;
      const { theme_slug } = req.body;
      if (!theme_slug) {
        return res.status(400).json({ success: false, error: 'theme_slug requis' });
      }

      // Vérifier accès
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id, societe_id')
        .eq('id', siteId)
        .maybeSingle();
      if (!site) return res.status(404).json({ success: false, error: 'Site introuvable' });
      if (site.societe_id !== req.societe.id) {
        return res.status(403).json({ success: false, error: 'Acces interdit' });
      }

      // Vérifier thème existe
      const { data: theme } = await admin()
        .from('vitrines_themes')
        .select('slug, name')
        .eq('slug', theme_slug)
        .eq('active', true)
        .maybeSingle();
      if (!theme) return res.status(404).json({ success: false, error: 'Theme introuvable' });

      // Appliquer
      const { error } = await admin()
        .from('vitrines_sites')
        .update({ theme_slug: theme_slug, updated_at: new Date().toISOString() })
        .eq('id', siteId);
      if (error) throw error;

      res.json({ success: true, theme_slug: theme_slug, theme_name: theme.name });
    } catch (err) {
      console.error('[vitrines/themes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
