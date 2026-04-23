// =============================================
// JADOMI — Module Mon site internet
// publish.js — Publication finale
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
  // POST /publish — Publier le site
  // ------------------------------------------
  router.post('/publish', requireSociete(), async (req, res) => {
    try {
      const { siteId } = req.body;
      if (!siteId) return res.status(400).json({ error: 'siteId requis' });

      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('*')
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      // Verifier qu'il y a des sections
      const { data: sections, error: secErr } = await admin()
        .from('vitrines_sections')
        .select('*')
        .eq('site_id', siteId)
        .eq('is_visible', true)
        .order('position');
      if (secErr) throw secErr;
      if (!sections || sections.length === 0) {
        return res.status(400).json({ error: 'Le site doit avoir au moins une section pour etre publie' });
      }

      // Recuperer les medias
      const { data: medias } = await admin()
        .from('vitrines_medias')
        .select('*')
        .eq('site_id', siteId);

      // Creer un snapshot (version)
      const { data: lastVersion } = await admin()
        .from('vitrines_versions')
        .select('version_number')
        .eq('site_id', siteId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (lastVersion ? lastVersion.version_number : 0) + 1;

      const snapshot = {
        site: {
          palette: site.palette,
          typography: site.typography,
          languages: site.languages,
          custom_domain: site.custom_domain
        },
        sections: sections,
        medias: medias || []
      };

      const { data: version, error: versionErr } = await admin()
        .from('vitrines_versions')
        .insert({
          site_id: siteId,
          version_number: nextVersion,
          snapshot: snapshot,
          published_at: new Date().toISOString(),
          published_by: req.user.id
        })
        .select('*')
        .single();
      if (versionErr) throw versionErr;

      // Mettre a jour le site
      const { data: updatedSite, error: updateErr } = await admin()
        .from('vitrines_sites')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          current_version_id: version.id
        })
        .eq('id', siteId)
        .select('*')
        .single();
      if (updateErr) throw updateErr;

      // Creer le quota mensuel si absent
      const now = new Date();
      await admin()
        .from('vitrines_usage_quotas')
        .upsert({
          site_id: siteId,
          period_year: now.getFullYear(),
          period_month: now.getMonth() + 1
        }, { onConflict: 'site_id,period_year,period_month' });

      const publicUrl = '/site/' + site.slug;

      res.json({
        success: true,
        site: updatedSite,
        version: version,
        public_url: publicUrl
      });
    } catch (err) {
      console.error('[vitrines/publish]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /unpublish — Depublier le site
  // ------------------------------------------
  router.post('/unpublish', requireSociete(), async (req, res) => {
    try {
      const { siteId } = req.body;
      if (!siteId) return res.status(400).json({ error: 'siteId requis' });

      const { data, error } = await admin()
        .from('vitrines_sites')
        .update({ status: 'archived' })
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .select('*')
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Site introuvable' });

      res.json({ success: true, site: data });
    } catch (err) {
      console.error('[vitrines/publish]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /preview/:siteId — Donnees pour l'apercu
  // ------------------------------------------
  router.get('/preview/:siteId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('*')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const [sectionsRes, mediasRes] = await Promise.all([
        admin().from('vitrines_sections').select('*').eq('site_id', site.id).eq('is_visible', true).order('position'),
        admin().from('vitrines_medias').select('*').eq('site_id', site.id).order('category').order('position')
      ]);

      res.json({
        success: true,
        site: site,
        sections: sectionsRes.data || [],
        medias: mediasRes.data || []
      });
    } catch (err) {
      console.error('[vitrines/publish]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
