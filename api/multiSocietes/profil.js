// =============================================
// JADOMI — Multi-sociétés : routes /api/profil/*
// Profil métier unique par utilisateur (table user_profils)
// =============================================
const express = require('express');
const { admin, authSupabase } = require('./middleware');

const METIERS = [
  'chirurgien_dentiste','orthodontiste','veterinaire','prothesiste',
  'medecin_paramedical','avocat_notaire',
  'professionnel_btp','esthetique','restaurateur',
  'profession_liberale','dirigeant_entreprise','auto_entrepreneur',
  'investisseur_immobilier','autre'
];

const SECTEURS = ['sante','btp','esthetique','restauration','juridique','autre'];

function sanitizeProfil(body) {
  const out = {};
  const allowed = [
    'prenom','nom','metier','sous_metier','telephone','avatar_url',
    'onboarding_termine','secteur_metier'
  ];
  for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
  if (out.metier && !METIERS.includes(out.metier)) {
    throw new Error('metier invalide');
  }
  if (out.secteur_metier !== undefined && out.secteur_metier !== null && !SECTEURS.includes(out.secteur_metier)) {
    throw new Error('secteur_metier invalide');
  }
  return out;
}

module.exports = function mountProfil(app) {
  const router = express.Router();
  router.use(authSupabase());

  // ---------- GET /api/profil — mon profil ----------
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('user_profils').select('*').eq('user_id', req.user.id).maybeSingle();
      if (error) throw error;
      res.json({
        success: true,
        profil: data || null,
        email: req.user.email,
        user_id: req.user.id,
        user_metadata: req.user.user_metadata || {}
      });
    } catch (e) {
      console.error('[GET /api/profil]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- PUT /api/profil — upsert ----------
  router.put('/', async (req, res) => {
    try {
      const payload = sanitizeProfil(req.body || {});
      payload.user_id = req.user.id;
      const { data, error } = await admin()
        .from('user_profils')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, profil: data });
    } catch (e) {
      console.error('[PUT /api/profil]', e.message);
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.use('/api/profil', router);
  console.log('[JADOMI] Routes /api/profil montées');
};
