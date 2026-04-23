// =============================================
// JADOMI — Module Mon site internet
// upsell.js — Suggestions contextuelles + tracking
// =============================================
var { createClient } = require('@supabase/supabase-js');
var { requireSociete } = require('../multiSocietes/middleware');

var _admin = null;
function admin() {
  if (!_admin) {
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    _admin = createClient(process.env.SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return _admin;
}

module.exports = function(router) {

  // GET /upsell/for-tab/:tabType — Cards upsell pour un onglet
  router.get('/upsell/for-tab/:tabType', requireSociete(), async function(req, res) {
    try {
      var tabType = req.params.tabType;
      var userId = req.user.id;

      // Get suggestions for this tab type
      var sugRes = await admin().from('upsell_suggestions')
        .select('*')
        .eq('trigger_tab_type', tabType)
        .eq('active', true)
        .order('priority', { ascending: false })
        .limit(5);

      var suggestions = sugRes.data || [];

      // Filter: exclude dismissed 3+ times in last 30 days
      var thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      var dismissRes = await admin().from('upsell_interactions')
        .select('suggestion_id')
        .eq('user_id', userId)
        .eq('event', 'dismissed')
        .gte('created_at', thirtyDaysAgo.toISOString());

      var dismissCounts = {};
      (dismissRes.data || []).forEach(function(d) {
        dismissCounts[d.suggestion_id] = (dismissCounts[d.suggestion_id] || 0) + 1;
      });

      var filtered = suggestions.filter(function(s) {
        return (dismissCounts[s.id] || 0) < 3;
      });

      // Return max 2
      res.json({ success: true, suggestions: filtered.slice(0, 2) });
    } catch (err) {
      console.error('[vitrines/upsell]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /upsell/interaction — Tracker evenement
  router.post('/upsell/interaction', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id').eq('societe_id', req.societe.id).order('is_primary', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();

      await admin().from('upsell_interactions').insert({
        user_id: req.user.id,
        site_id: siteRes.data ? siteRes.data.id : null,
        suggestion_id: req.body.suggestion_id,
        event: req.body.event || 'shown'
      });

      res.json({ success: true });
    } catch (err) {
      console.error('[vitrines/upsell]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
