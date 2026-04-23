// =============================================
// JADOMI — Module Mon site internet
// competitors.js — Analyse concurrents locaux
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');

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
  // POST /competitors/analyze — Analyser les concurrents
  // ------------------------------------------
  router.post('/competitors/analyze', requireSociete(), async (req, res) => {
    try {
      const { siteId } = req.body;
      if (!siteId) return res.status(400).json({ error: 'siteId requis' });

      // Verifier acces
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('*, vitrines_conversations(extracted_data)')
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const profConfig = getProfession(site.profession_id);
      if (!profConfig) return res.status(400).json({ error: 'Profession non configuree' });

      // Recuperer la ville depuis les donnees societe
      const { data: societe } = await admin()
        .from('societes')
        .select('ville, adresse_ville, code_postal')
        .eq('id', req.societe.id)
        .single();

      const ville = societe.ville || societe.adresse_ville || '';
      if (!ville) {
        return res.status(400).json({ error: 'Ville de la societe requise pour l\'analyse concurrentielle' });
      }

      // Recherche via Google Places API si disponible
      let competitors = [];
      if (process.env.GOOGLE_PLACES_API_KEY) {
        competitors = await searchCompetitorsPlaces(profConfig, ville);
      }

      // Analyse IA des concurrents
      if (competitors.length > 0) {
        const analysis = await analyzeWithAI(profConfig, ville, competitors);

        // Sauvegarder
        for (const comp of competitors) {
          await admin()
            .from('vitrines_competitors')
            .insert({
              site_id: siteId,
              competitor_name: comp.name,
              competitor_url: comp.website || null,
              competitor_gmb_id: comp.place_id || null,
              analysis: {
                ...comp,
                ai_analysis: analysis
              }
            });
        }
      }

      res.json({ success: true, competitors: competitors, ville: ville });
    } catch (err) {
      console.error('[vitrines/competitors]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /competitors/:siteId — Liste des concurrents
  // ------------------------------------------
  router.get('/competitors/:siteId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data, error } = await admin()
        .from('vitrines_competitors')
        .select('*')
        .eq('site_id', req.params.siteId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      res.json({ success: true, competitors: data });
    } catch (err) {
      console.error('[vitrines/competitors]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};

// ------------------------------------------
// Helpers
// ------------------------------------------

async function searchCompetitorsPlaces(profConfig, ville) {
  try {
    const query = profConfig.competitor_search_query(ville);
    const apiUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
      + '?query=' + encodeURIComponent(query)
      + '&language=fr'
      + '&region=fr'
      + '&key=' + process.env.GOOGLE_PLACES_API_KEY;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status !== 'OK') return [];

    return (data.results || []).slice(0, 5).map(r => ({
      place_id: r.place_id,
      name: r.name,
      address: r.formatted_address,
      rating: r.rating,
      total_ratings: r.user_ratings_total,
      website: null
    }));
  } catch (err) {
    console.error('[vitrines/competitors] Erreur Places search:', err.message);
    return [];
  }
}

async function analyzeWithAI(profConfig, ville, competitors) {
  try {
    const competitorList = competitors.map(c =>
      `- ${c.name} (note: ${c.rating || 'N/A'}, ${c.total_ratings || 0} avis, adresse: ${c.address || 'N/A'})`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyse concurrentielle pour un ${profConfig.description_courte} a ${ville}.

Concurrents identifies :
${competitorList}

Reponds en JSON :
{
  "market_position": "synthese du positionnement local",
  "opportunities": ["opportunites de differenciation"],
  "threats": ["menaces concurrentielles"],
  "recommended_keywords": ["mots-cles SEO a cibler en priorite"],
  "tone_recommendation": "ton editorial recommande pour se demarquer"
}`
      }]
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
  } catch (err) {
    console.error('[vitrines/competitors] Erreur analyse IA:', err.message);
    return null;
  }
}
