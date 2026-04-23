// =============================================
// JADOMI — Module Mon site internet
// gmb.js — Import Google My Business
// =============================================
const cheerio = require('cheerio');
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
  // POST /gmb/import — Importer donnees Google My Business
  // ------------------------------------------
  router.post('/gmb/import', requireSociete(), async (req, res) => {
    try {
      const { placeId, url, siteId } = req.body;
      if (!placeId && !url) {
        return res.status(400).json({ error: 'placeId ou url requis' });
      }

      let gmbData = null;

      // Methode 1 : Google Places API (si cle dispo)
      if (process.env.GOOGLE_PLACES_API_KEY && placeId) {
        gmbData = await fetchFromPlacesAPI(placeId);
      }

      // Methode 2 : Scraping fallback via URL Google Maps
      if (!gmbData && url) {
        gmbData = await scrapeGmbPage(url);
      }

      if (!gmbData) {
        return res.status(400).json({ error: 'Impossible de recuperer les donnees GMB' });
      }

      // Sauvegarder dans le site si siteId fourni
      if (siteId) {
        const { data: site } = await admin()
          .from('vitrines_sites')
          .select('id')
          .eq('id', siteId)
          .eq('societe_id', req.societe.id)
          .maybeSingle();

        if (site) {
          await admin()
            .from('vitrines_sites')
            .update({
              migration_source: 'gmb',
              migration_data: gmbData
            })
            .eq('id', siteId);
        }
      }

      res.json({ success: true, gmb: gmbData });
    } catch (err) {
      console.error('[vitrines/gmb]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /gmb/search — Rechercher un etablissement
  // ------------------------------------------
  router.post('/gmb/search', requireSociete(), async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'query requis' });

      if (!process.env.GOOGLE_PLACES_API_KEY) {
        return res.status(400).json({ error: 'Google Places API non configuree' });
      }

      const apiUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
        + '?query=' + encodeURIComponent(query)
        + '&language=fr'
        + '&region=fr'
        + '&key=' + process.env.GOOGLE_PLACES_API_KEY;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.status !== 'OK') {
        return res.status(400).json({ error: 'Aucun resultat Google Places' });
      }

      const results = (data.results || []).slice(0, 5).map(r => ({
        place_id: r.place_id,
        name: r.name,
        address: r.formatted_address,
        rating: r.rating,
        total_ratings: r.user_ratings_total,
        types: r.types
      }));

      res.json({ success: true, results: results });
    } catch (err) {
      console.error('[vitrines/gmb]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};

// ------------------------------------------
// Helpers
// ------------------------------------------

async function fetchFromPlacesAPI(placeId) {
  try {
    const apiUrl = 'https://maps.googleapis.com/maps/api/place/details/json'
      + '?place_id=' + encodeURIComponent(placeId)
      + '&fields=name,formatted_address,formatted_phone_number,website,rating,reviews,opening_hours,photos,types'
      + '&language=fr'
      + '&key=' + process.env.GOOGLE_PLACES_API_KEY;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status !== 'OK' || !data.result) return null;

    const r = data.result;
    return {
      source: 'google_places_api',
      name: r.name,
      address: r.formatted_address,
      phone: r.formatted_phone_number,
      website: r.website,
      rating: r.rating,
      reviews: (r.reviews || []).slice(0, 10).map(rev => ({
        author: rev.author_name,
        rating: rev.rating,
        text: rev.text,
        time: rev.relative_time_description
      })),
      opening_hours: r.opening_hours ? r.opening_hours.weekday_text : [],
      photo_refs: (r.photos || []).slice(0, 10).map(p => p.photo_reference),
      types: r.types
    };
  } catch (err) {
    console.error('[vitrines/gmb] Erreur Places API:', err.message);
    return null;
  }
}

async function scrapeGmbPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JADOMI-Bot/1.0)',
          'Accept': 'text/html'
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extraction basique des donnees structurees (JSON-LD)
    const jsonLd = [];
    $('script[type="application/ld+json"]').each(function() {
      try {
        jsonLd.push(JSON.parse($(this).html()));
      } catch (e) { /* ignore */ }
    });

    const localBusiness = jsonLd.find(j =>
      j['@type'] === 'LocalBusiness' ||
      j['@type'] === 'Dentist' ||
      j['@type'] === 'MedicalBusiness'
    );

    return {
      source: 'scraping',
      name: localBusiness ? localBusiness.name : $('title').text().trim(),
      address: localBusiness ? localBusiness.address : null,
      phone: localBusiness ? localBusiness.telephone : null,
      website: localBusiness ? localBusiness.url : null,
      rating: localBusiness ? localBusiness.aggregateRating : null,
      opening_hours: localBusiness ? localBusiness.openingHours : [],
      raw_json_ld: jsonLd
    };
  } catch (err) {
    console.error('[vitrines/gmb] Erreur scraping GMB:', err.message);
    return null;
  }
}
