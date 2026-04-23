// =============================================
// JADOMI — Module Mon site internet
// onboarding-ai.js — Sauvegarde sessions onboarding v2
// =============================================
const { createClient } = require('@supabase/supabase-js');

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
  // POST /onboarding/save — Sauvegarder progression
  // ------------------------------------------
  router.post('/onboarding/save', async (req, res) => {
    try {
      const userId = req.user.id;
      const { step, context } = req.body;

      if (!step || typeof step !== 'number') {
        return res.status(400).json({ success: false, error: 'step requis (number)' });
      }

      const isCompleted = step >= 8;

      const { error } = await admin()
        .from('onboarding_sessions')
        .upsert({
          user_id: userId,
          current_step: step,
          context: context || {},
          completed: isCompleted,
          updated_at: new Date().toISOString(),
          ...(isCompleted ? { completed_at: new Date().toISOString() } : {})
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('[vitrines/onboarding]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /onboarding/resume — Reprendre session existante
  // ------------------------------------------
  router.get('/onboarding/resume', async (req, res) => {
    try {
      const userId = req.user.id;

      const { data, error } = await admin()
        .from('onboarding_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('completed', false)
        .maybeSingle();

      if (error) throw error;
      res.json({ success: true, session: data || null });
    } catch (err) {
      console.error('[vitrines/onboarding]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
