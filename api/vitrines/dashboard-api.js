// =============================================
// JADOMI — Module Mon site internet
// dashboard-api.js — Endpoints pour le dashboard societe
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');

var _admin = null;
function admin() {
  if (!_admin) {
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return _admin;
}

module.exports = function(router) {

  // ------------------------------------------
  // GET /dashboard/site — Donnees completes du site pour le dashboard
  // ------------------------------------------
  router.get('/dashboard/site', requireSociete(), async function(req, res) {
    try {
      var societeId = req.societe.id;

      // Chercher le site de cette societe
      var siteRes = await admin().from('vitrines_sites').select('*').eq('societe_id', societeId).order('is_primary', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (!siteRes.data) {
        return res.json({ success: true, has_site: false, creation_url: '/public/vitrines/onboarding.html' });
      }
      var site = siteRes.data;

      // Sections
      var secRes = await admin().from('vitrines_sections').select('type, is_visible').eq('site_id', site.id).order('position');
      var sections = secRes.data || [];

      // Medias count
      var mediaRes = await admin().from('vitrines_medias').select('id', { count: 'exact', head: true }).eq('site_id', site.id);
      var mediaCount = mediaRes.count || 0;

      // Contact requests count (new)
      var contactCount = 0;
      try {
        var contactRes = await admin().from('vitrines_contact_requests').select('id', { count: 'exact', head: true }).eq('site_id', site.id).eq('status', 'new');
        contactCount = contactRes.count || 0;
      } catch (e) { /* table may not exist yet */ }

      // Meta completion check
      var metaFields = ['adresse', 'telephone', 'email', 'horaires'];
      var metaComplete = metaFields.filter(function(f) { return site[f]; });
      var profConfig = getProfession(site.profession_id);

      // SEO score
      var seoChecks = [];
      seoChecks.push({ label: 'Titre du site', ok: !!sections.find(function(s) { return s.type === 'hero'; }) });
      seoChecks.push({ label: 'Photos avec alt-text', ok: mediaCount > 3 });
      seoChecks.push({ label: 'Adresse renseignee', ok: !!site.adresse });
      seoChecks.push({ label: 'Telephone visible', ok: !!site.telephone });
      seoChecks.push({ label: 'Page contact', ok: !!sections.find(function(s) { return s.type === 'contact'; }) });
      seoChecks.push({ label: 'Mentions legales', ok: !!site.siret || !!site.rpps });
      var seoScore = Math.round((seoChecks.filter(function(c) { return c.ok; }).length / seoChecks.length) * 100);

      res.json({
        success: true,
        has_site: true,
        site: site,
        sections: sections.map(function(s) { return { type: s.type, visible: s.is_visible }; }),
        media_count: mediaCount,
        contact_requests_new: contactCount,
        meta_completion: {
          complete: metaComplete,
          missing: metaFields.filter(function(f) { return !site[f]; }),
          total: metaFields.length,
          done: metaComplete.length
        },
        seo: { score: seoScore, checks: seoChecks },
        profession: profConfig ? { id: profConfig.id, label: profConfig.label, category: profConfig.category } : null
      });
    } catch (err) {
      console.error('[vitrines/dashboard-api]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /dashboard/stats/:siteId — Statistiques 30 derniers jours
  // ------------------------------------------
  router.get('/dashboard/stats/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      var statsRes = await admin().from('vitrines_analytics').select('*').eq('site_id', req.params.siteId).gte('date', thirtyDaysAgo.toISOString().split('T')[0]);
      var rows = statsRes.data || [];

      var visites = 0, demandes = 0, clicsTel = 0, rdv = 0;
      rows.forEach(function(r) {
        visites += r.page_views || 0;
        demandes += r.contact_clicks || 0;
        clicsTel += r.phone_clicks || 0;
        rdv += r.rdv_clicks || 0;
      });
      var tauxConversion = visites > 0 ? Math.round(((demandes + clicsTel + rdv) / visites) * 100) : 0;

      res.json({
        success: true,
        period: '30j',
        visites: visites,
        demandes_contact: demandes,
        clics_telephone: clicsTel,
        taux_conversion: tauxConversion
      });
    } catch (err) {
      console.error('[vitrines/dashboard-api]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /dashboard/contacts/:siteId — Demandes de contact recues
  // ------------------------------------------
  router.get('/dashboard/contacts/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var limit = parseInt(req.query.limit) || 20;
      var dataRes = await admin().from('vitrines_contact_requests').select('*').eq('site_id', req.params.siteId).order('created_at', { ascending: false }).limit(limit);

      res.json({ success: true, contacts: dataRes.data || [] });
    } catch (err) {
      console.error('[vitrines/dashboard-api]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /dashboard/site-meta — Mettre a jour les meta du site
  // ------------------------------------------
  router.patch('/dashboard/site-meta', requireSociete(), async function(req, res) {
    try {
      var siteId = req.body.siteId;
      if (!siteId) return res.status(400).json({ error: 'siteId requis' });

      var siteRes = await admin().from('vitrines_sites').select('id').eq('id', siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      // Whitelist des champs modifiables
      var allowed = ['adresse', 'telephone', 'email', 'horaires', 'siret', 'rpps', 'ordre_numero', 'barreau', 'assurance_rc', 'social_instagram', 'social_facebook', 'social_linkedin', 'footer_pitch'];
      var updates = {};
      allowed.forEach(function(f) { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ a mettre a jour' });

      var updRes = await admin().from('vitrines_sites').update(updates).eq('id', siteId).select('*').single();
      if (updRes.error) throw updRes.error;

      res.json({ success: true, site: updRes.data });
    } catch (err) {
      console.error('[vitrines/dashboard-api]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
