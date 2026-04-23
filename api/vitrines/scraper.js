// =============================================
// JADOMI — Module Mon site internet
// scraper.js — Scrape site existant
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
  // POST /scrape — Scraper un site existant
  // ------------------------------------------
  router.post('/scrape', requireSociete(), async (req, res) => {
    try {
      const { url, siteId } = req.body;
      if (!url) return res.status(400).json({ error: 'url requis' });

      // Validation URL basique
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        return res.status(400).json({ error: 'URL invalide' });
      }

      // Fetch la page
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response;
      try {
        response = await fetch(parsedUrl.href, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JADOMI-Bot/1.0)',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return res.status(400).json({ error: 'Impossible de recuperer la page (HTTP ' + response.status + ')' });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extraction structuree
      const extracted = {
        url: parsedUrl.href,
        title: $('title').text().trim() || null,
        meta_description: $('meta[name="description"]').attr('content') || null,
        meta_keywords: $('meta[name="keywords"]').attr('content') || null,
        og_image: $('meta[property="og:image"]').attr('content') || null,
        headings: [],
        paragraphs: [],
        images: [],
        links: [],
        contact_info: {
          phones: [],
          emails: [],
          address: null
        }
      };

      // Headings
      $('h1, h2, h3').each(function() {
        const text = $(this).text().trim();
        if (text) {
          extracted.headings.push({
            level: this.tagName,
            text: text.substring(0, 500)
          });
        }
      });

      // Paragraphes (limiter a 20 pour eviter le bruit)
      $('p').each(function() {
        const text = $(this).text().trim();
        if (text && text.length > 20 && extracted.paragraphs.length < 20) {
          extracted.paragraphs.push(text.substring(0, 1000));
        }
      });

      // Images (limiter a 30)
      $('img').each(function() {
        if (extracted.images.length >= 30) return;
        const src = $(this).attr('src');
        const alt = $(this).attr('alt') || '';
        if (src) {
          const absoluteSrc = src.startsWith('http') ? src : new URL(src, parsedUrl.origin).href;
          extracted.images.push({ src: absoluteSrc, alt: alt.substring(0, 200) });
        }
      });

      // Liens internes
      $('a[href]').each(function() {
        if (extracted.links.length >= 50) return;
        const href = $(this).attr('href');
        const text = $(this).text().trim();
        if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
          extracted.links.push({
            href: href.substring(0, 500),
            text: text.substring(0, 200)
          });
        }
      });

      // Detection telephones
      const bodyText = $('body').text();
      const phoneMatches = bodyText.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g);
      if (phoneMatches) {
        extracted.contact_info.phones = [...new Set(phoneMatches)].slice(0, 5);
      }

      // Detection emails
      const emailMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (emailMatches) {
        extracted.contact_info.emails = [...new Set(emailMatches)].slice(0, 5);
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
              migration_source: 'website',
              previous_site_url: url,
              migration_data: extracted
            })
            .eq('id', siteId);
        }
      }

      res.json({ success: true, extracted: extracted });
    } catch (err) {
      console.error('[vitrines/scraper]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
