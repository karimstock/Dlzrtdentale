// =============================================
// JADOMI — Groupage Scheduler (polling 60s)
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { triggerCampaign, expireCampaign } = require('./actions');

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

async function processCampaigns() {
  try {
    const now = new Date().toISOString();

    // 1. Campagnes qui ont atteint le min avant deadline
    const { data: active, error: err1 } = await admin()
      .from('group_purchase_campaigns')
      .select('*')
      .eq('status', 'collecting')
      .gte('collection_deadline', now);

    if (!err1 && active) {
      for (const c of active) {
        if (c.current_cabinets_count >= c.min_cabinets_required) {
          await triggerCampaign(() => admin(), c.id);
        }
      }
    }

    // 2. Campagnes dont deadline est depassee
    const { data: expired, error: err2 } = await admin()
      .from('group_purchase_campaigns')
      .select('*')
      .eq('status', 'collecting')
      .lt('collection_deadline', now);

    if (!err2 && expired) {
      for (const c of expired) {
        if (c.current_cabinets_count >= c.min_cabinets_required) {
          await triggerCampaign(() => admin(), c.id);
        } else {
          await expireCampaign(() => admin(), c.id);
        }
      }
    }
  } catch (e) {
    console.error('[Groupage Scheduler]', e.message);
  }
}

let _interval = null;
function startScheduler() {
  if (_interval) return;
  _interval = setInterval(processCampaigns, 60000);
  _interval.unref();
  console.log('[Groupage Scheduler] Demarre — polling toutes les 60s');
}

startScheduler();

module.exports = { processCampaigns };
