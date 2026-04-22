// =============================================
// JADOMI — Coach JADOMI API
// Welcome personnalise + Tooltips contextuels
// Passe 25 (22-23 avril 2026)
// =============================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { getProfessionContext } = require('../../lib/coach/profession-contexts');

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

// Auth middleware — extracts user from Supabase JWT
const { authSupabase } = require('../multiSocietes/middleware');
router.use(authSupabase());

// Helper: get or create onboarding state
async function getOrCreateState(userId, societeId) {
  const { data } = await admin()
    .from('user_onboarding_state')
    .select('*')
    .eq('user_id', userId)
    .eq('societe_id', societeId)
    .maybeSingle();

  if (data) return data;

  // Create new state
  const { data: created, error } = await admin()
    .from('user_onboarding_state')
    .insert({
      user_id: userId,
      societe_id: societeId,
      welcome_shown: false,
      welcome_completed: false,
      welcome_skipped: false,
      tooltips_enabled: true,
      tooltips_seen: [],
      coach_reminders: true
    })
    .select('*')
    .single();

  if (error) {
    // Might be unique constraint — try fetching again
    const { data: retry } = await admin()
      .from('user_onboarding_state')
      .select('*')
      .eq('user_id', userId)
      .eq('societe_id', societeId)
      .maybeSingle();
    return retry;
  }

  return created;
}

// ------------------------------------------
// GET /state — Get user's onboarding state
// ------------------------------------------
router.get('/state', async (req, res) => {
  try {
    const userId = req.user.id;
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    const state = await getOrCreateState(userId, societeId);
    res.json({ success: true, state });
  } catch (err) {
    console.error('[coach/state]', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// POST /welcome-shown — Mark welcome as shown
// ------------------------------------------
router.post('/welcome-shown', async (req, res) => {
  try {
    const userId = req.user.id;
    const { societe_id } = req.body;
    if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });

    await getOrCreateState(userId, societe_id);
    await admin()
      .from('user_onboarding_state')
      .update({ welcome_shown: true, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('societe_id', societe_id);

    res.json({ success: true });
  } catch (err) {
    console.error('[coach/welcome-shown]', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// POST /welcome-completed — Mark tour complete
// ------------------------------------------
router.post('/welcome-completed', async (req, res) => {
  try {
    const userId = req.user.id;
    const { societe_id } = req.body;
    if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });

    await admin()
      .from('user_onboarding_state')
      .update({
        welcome_completed: true,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('societe_id', societe_id);

    res.json({ success: true });
  } catch (err) {
    console.error('[coach/welcome-completed]', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// POST /welcome-skipped — Mark tour skipped
// ------------------------------------------
router.post('/welcome-skipped', async (req, res) => {
  try {
    const userId = req.user.id;
    const { societe_id } = req.body;
    if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });

    await admin()
      .from('user_onboarding_state')
      .update({
        welcome_skipped: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('societe_id', societe_id);

    res.json({ success: true });
  } catch (err) {
    console.error('[coach/welcome-skipped]', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// POST /tooltip-seen — Mark tooltip as seen
// ------------------------------------------
router.post('/tooltip-seen', async (req, res) => {
  try {
    const userId = req.user.id;
    const { societe_id, tip_id } = req.body;
    if (!societe_id || !tip_id) return res.status(400).json({ error: 'societe_id et tip_id requis' });

    const state = await getOrCreateState(userId, societe_id);
    const seen = Array.isArray(state.tooltips_seen) ? state.tooltips_seen : [];
    if (!seen.includes(tip_id)) {
      seen.push(tip_id);
      await admin()
        .from('user_onboarding_state')
        .update({ tooltips_seen: seen, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('societe_id', societe_id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[coach/tooltip-seen]', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// POST /toggle-tooltips — Enable/disable tooltips
// ------------------------------------------
router.post('/toggle-tooltips', async (req, res) => {
  try {
    const userId = req.user.id;
    const { societe_id, enabled } = req.body;
    if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });

    const updates = {
      tooltips_enabled: !!enabled,
      updated_at: new Date().toISOString()
    };
    // If re-enabling, reset seen tooltips so they all reappear
    if (enabled) {
      updates.tooltips_seen = [];
    }

    await admin()
      .from('user_onboarding_state')
      .update(updates)
      .eq('user_id', userId)
      .eq('societe_id', societe_id);

    res.json({ success: true });
  } catch (err) {
    console.error('[coach/toggle-tooltips]', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// POST /generate-welcome — Generate personalized welcome data
// ------------------------------------------
router.post('/generate-welcome', async (req, res) => {
  try {
    const userId = req.user.id;
    const { societe_id } = req.body;
    if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });

    // Get user profile
    const { data: profile } = await admin()
      .from('profiles')
      .select('nom, prenom, email')
      .eq('id', userId)
      .maybeSingle();

    // Get societe info
    const { data: societe } = await admin()
      .from('societes')
      .select('nom, type, sous_type, ville')
      .eq('id', societe_id)
      .maybeSingle();

    if (!societe) return res.status(404).json({ error: 'Societe introuvable' });

    const context = getProfessionContext(societe.type, societe.sous_type);
    const userName = profile?.nom || profile?.prenom || 'cher client';

    res.json({
      success: true,
      welcome: {
        titre: context.titre,
        nom: userName,
        greeting: `${context.titre} ${userName}, ${context.salutation.toLowerCase()}`,
        sous_titre: context.salutation,
        description: context.description,
        features: context.features,
        quickwins: context.quickwins,
        tooltips: context.tooltips || {}
      }
    });
  } catch (err) {
    console.error('[coach/generate-welcome]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
