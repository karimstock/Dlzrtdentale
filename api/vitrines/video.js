// =============================================
// JADOMI — Module Mon site internet
// video.js — Generation parametres video Reels
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');
const { getPresignedUrl } = require('../../services/r2-storage');

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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = function(router) {

  // ------------------------------------------
  // POST /video/params — Generer les parametres video Reels
  // ------------------------------------------
  router.post('/video/params', requireSociete(), async (req, res) => {
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

      // Recuperer les sections et medias
      const [sectionsRes, mediasRes, societeRes] = await Promise.all([
        admin().from('vitrines_sections').select('*').eq('site_id', siteId).order('position'),
        admin().from('vitrines_medias').select('*').eq('site_id', siteId).order('position'),
        admin().from('societes').select('nom, ville, adresse_ville').eq('id', req.societe.id).single()
      ]);

      const sections = sectionsRes.data || [];
      const medias = mediasRes.data || [];
      const societe = societeRes.data;

      const profConfig = getProfession(site.profession_id);

      // Generer les URLs presignees pour les medias
      const mediaUrls = await Promise.all(medias.slice(0, 6).map(async (m) => {
        try {
          return { category: m.category, url: await getPresignedUrl(m.storage_path, 3600) };
        } catch (e) {
          return null;
        }
      }));

      // Demander a Claude de generer les parametres video
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Genere les parametres pour une video Reels Instagram/TikTok de 15 secondes pour un ${profConfig ? profConfig.description_courte : 'professionnel'}.

Nom : ${societe.nom}
Ville : ${societe.ville || societe.adresse_ville || ''}
Sections du site : ${sections.map(s => s.type).join(', ')}
Photos disponibles : ${medias.map(m => m.category).join(', ')}
Palette : ${site.palette}

Reponds en JSON :
{
  "duration_seconds": 15,
  "scenes": [
    {
      "order": 1,
      "duration_ms": 3000,
      "type": "image|text|transition",
      "media_category": "categorie de la photo a utiliser (ou null)",
      "text_overlay": "texte a afficher",
      "animation": "fadeIn|slideLeft|zoomIn|kenBurns",
      "text_position": "center|bottom|top"
    }
  ],
  "music_mood": "calme|dynamique|elegant|inspirant",
  "color_scheme": {
    "primary": "#hex",
    "secondary": "#hex",
    "text": "#hex"
  },
  "caption_instagram": "texte de la legende Instagram (avec hashtags)",
  "caption_tiktok": "texte de la legende TikTok"
}`
        }]
      });

      let videoParams;
      try {
        const content = response.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        videoParams = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
      } catch (e) {
        videoParams = { raw: response.content[0].text };
      }

      // Associer les URLs presignees aux scenes
      if (videoParams.scenes) {
        videoParams.scenes = videoParams.scenes.map(scene => {
          if (scene.media_category) {
            const media = mediaUrls.find(m => m && m.category === scene.media_category);
            scene.media_url = media ? media.url : null;
          }
          return scene;
        });
      }

      res.json({ success: true, video_params: videoParams });
    } catch (err) {
      console.error('[vitrines/video]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
