// =============================================
// JADOMI — Module Mon site internet
// versions.js — Listing + rollback versions
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
  // GET /versions/:siteId — Liste des versions
  // ------------------------------------------
  router.get('/versions/:siteId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id, current_version_id')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      // Dernieres versions sur 30 jours
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await admin()
        .from('vitrines_versions')
        .select('id, version_number, published_at, published_by, created_at')
        .eq('site_id', req.params.siteId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('version_number', { ascending: false });
      if (error) throw error;

      res.json({
        success: true,
        versions: data,
        current_version_id: site.current_version_id
      });
    } catch (err) {
      console.error('[vitrines/versions]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /versions/:siteId/:versionId — Detail d'une version
  // ------------------------------------------
  router.get('/versions/:siteId/:versionId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data, error } = await admin()
        .from('vitrines_versions')
        .select('*')
        .eq('id', req.params.versionId)
        .eq('site_id', req.params.siteId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Version introuvable' });

      res.json({ success: true, version: data });
    } catch (err) {
      console.error('[vitrines/versions]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /versions/rollback — Restaurer une version
  // ------------------------------------------
  router.post('/versions/rollback', requireSociete(), async (req, res) => {
    try {
      const { siteId, versionId } = req.body;
      if (!siteId || !versionId) {
        return res.status(400).json({ error: 'siteId et versionId requis' });
      }

      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data: version, error: vErr } = await admin()
        .from('vitrines_versions')
        .select('*')
        .eq('id', versionId)
        .eq('site_id', siteId)
        .maybeSingle();
      if (vErr) throw vErr;
      if (!version) return res.status(404).json({ error: 'Version introuvable' });

      const snapshot = version.snapshot;

      // Restaurer les parametres du site
      if (snapshot.site) {
        await admin()
          .from('vitrines_sites')
          .update({
            palette: snapshot.site.palette,
            typography: snapshot.site.typography,
            languages: snapshot.site.languages,
            custom_domain: snapshot.site.custom_domain,
            current_version_id: versionId
          })
          .eq('id', siteId);
      }

      // Restaurer les sections : supprimer les actuelles et reinserer depuis snapshot
      if (snapshot.sections) {
        await admin()
          .from('vitrines_sections')
          .delete()
          .eq('site_id', siteId);

        const sectionsToInsert = snapshot.sections.map(s => ({
          site_id: siteId,
          type: s.type,
          position: s.position,
          content: s.content,
          is_visible: s.is_visible,
          ab_variant: s.ab_variant
        }));

        if (sectionsToInsert.length > 0) {
          const { error: insertErr } = await admin()
            .from('vitrines_sections')
            .insert(sectionsToInsert);
          if (insertErr) throw insertErr;
        }
      }

      res.json({ success: true, restored_version: version.version_number });
    } catch (err) {
      console.error('[vitrines/versions]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
