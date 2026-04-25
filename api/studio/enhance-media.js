// =============================================
// JADOMI Studio — Enhancement medias Expert (Remotion)
// Passe 41B — 24 avril 2026
// POST /api/studio/enhance-photos : slideshow Ken Burns (TODO)
// POST /api/studio/enhance-video : intro + outro cinematiques (TODO)
// =============================================
const express = require('express');
const router = express.Router();

// Auth middleware
async function requireAuth(req, res, next) {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    next();
  } catch { return res.status(401).json({ error: 'Auth echouee' }); }
}

// POST /api/studio/enhance-photos
router.post('/enhance-photos', requireAuth, async (req, res) => {
  // TODO: integration Remotion pour slideshow Ken Burns
  return res.status(501).json({
    error: 'Fonctionnalite en cours de developpement',
    message: 'L\'amelioration photo (slideshow cinematique) sera disponible prochainement.'
  });
});

// POST /api/studio/enhance-video
router.post('/enhance-video', requireAuth, async (req, res) => {
  // TODO: integration Remotion pour intro + outro cinematiques
  return res.status(501).json({
    error: 'Fonctionnalite en cours de developpement',
    message: 'L\'amelioration video sera disponible prochainement.'
  });
});

module.exports = router;
