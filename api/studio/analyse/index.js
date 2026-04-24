// =============================================
// JADOMI Studio — Scanner analyse de sites existants
// Passe 36 — 24 avril 2026
// Routes /api/studio/analyse/*
// =============================================
const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');

module.exports = function mountAnalyse(app, supabase) {
  // --- Auth middleware (meme pattern que studio/index.js) ---
  async function requireAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });
      req.userId = user.id;
      req.userEmail = user.email;
      const { data: membership } = await supabase
        .from('user_societe_roles')
        .select('societe_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      req.societeId = membership ? membership.societe_id : null;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Authentification echouee' });
    }
  }

  // ================================================
  // POST /api/studio/analyse/scan
  // Analyse un site web existant (URL)
  // ================================================
  router.post('/scan', requireAuth, async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url) return res.status(400).json({ error: 'url requis' });

      // Normaliser l'URL
      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      const rapport = {
        url_analysee: targetUrl,
        plateforme_detectee: null,
        type_site: null,
        theme_detecte: null,
        plugins_detectes: [],
        nb_pages: 0,
        nb_produits: 0,
        has_ecommerce: false,
        has_stripe: false,
        score_performance: 0,
        score_seo: 0,
        score_complexite: 0,
        recommandation: null,
        details: {}
      };

      // 1. Fetch du site
      const startTime = Date.now();
      let html = '';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'JADOMI-Analyser/1.0 (https://jadomi.fr)',
            'Accept': 'text/html,application/xhtml+xml'
          },
          signal: controller.signal,
          redirect: 'follow'
        });
        clearTimeout(timeout);
        html = await response.text();
        rapport.details.load_time_ms = Date.now() - startTime;
        rapport.details.status_code = response.status;
        rapport.details.page_size_kb = Math.round(html.length / 1024);
      } catch (fetchErr) {
        return res.status(400).json({
          error: 'site_inaccessible',
          message: 'Impossible d\'acceder au site : ' + fetchErr.message
        });
      }

      const $ = cheerio.load(html);

      // 2. Detection plateforme
      const htmlLower = html.toLowerCase();

      if (htmlLower.includes('/wp-content/') || htmlLower.includes('/wp-json/') || htmlLower.includes('wp-embed.min.js')) {
        rapport.plateforme_detectee = 'wordpress';
        rapport.type_site = 'cms';

        // Theme WordPress
        const themeMatch = html.match(/\/wp-content\/themes\/([^/'"]+)/);
        if (themeMatch) rapport.theme_detecte = themeMatch[1];

        // Plugins WordPress (depuis le HTML)
        const pluginMatches = [...html.matchAll(/\/wp-content\/plugins\/([^/'"]+)/g)];
        const plugins = [...new Set(pluginMatches.map(m => m[1]))];
        rapport.plugins_detectes = plugins;

        // WooCommerce ?
        if (plugins.includes('woocommerce') || htmlLower.includes('woocommerce') || htmlLower.includes('wc-ajax')) {
          rapport.has_ecommerce = true;
          rapport.type_site = 'ecommerce_wordpress';
        }

        // Compter pages via WP REST API
        try {
          const wpApiUrl = new URL('/wp-json/wp/v2/pages?per_page=1', targetUrl).href;
          const pagesRes = await fetch(wpApiUrl, {
            headers: { 'User-Agent': 'JADOMI-Analyser/1.0' },
            signal: AbortSignal.timeout(5000)
          });
          if (pagesRes.ok) {
            const totalPages = parseInt(pagesRes.headers.get('x-wp-total') || '0');
            rapport.nb_pages = totalPages;
          }
        } catch { /* ignore */ }

        // Compter produits WooCommerce
        if (rapport.has_ecommerce) {
          try {
            const wcUrl = new URL('/wp-json/wc/v3/products?per_page=1', targetUrl).href;
            const wcRes = await fetch(wcUrl, {
              headers: { 'User-Agent': 'JADOMI-Analyser/1.0' },
              signal: AbortSignal.timeout(5000)
            });
            if (wcRes.ok) {
              rapport.nb_produits = parseInt(wcRes.headers.get('x-wp-total') || '0');
            }
          } catch { /* ignore */ }
        }

      } else if (htmlLower.includes('cdn.shopify.com') || htmlLower.includes('shopify.theme')) {
        rapport.plateforme_detectee = 'shopify';
        rapport.type_site = 'ecommerce_shopify';
        rapport.has_ecommerce = true;

      } else if (htmlLower.includes('wix.com') || htmlLower.includes('static.wixstatic.com') || htmlLower.includes('_wix_browser_sess')) {
        rapport.plateforme_detectee = 'wix';
        rapport.type_site = 'site_builder';

      } else if (htmlLower.includes('squarespace.com') || htmlLower.includes('static1.squarespace.com')) {
        rapport.plateforme_detectee = 'squarespace';
        rapport.type_site = 'site_builder';

      } else if (htmlLower.includes('webflow.com') || htmlLower.includes('assets.website-files.com') || /class="w-/.test(html)) {
        rapport.plateforme_detectee = 'webflow';
        rapport.type_site = 'site_builder';

      } else if (htmlLower.includes('jimdo.com') || htmlLower.includes('jimdocdn.com')) {
        rapport.plateforme_detectee = 'jimdo';
        rapport.type_site = 'site_builder';

      } else if (htmlLower.includes('prestashop') || htmlLower.includes('presta')) {
        rapport.plateforme_detectee = 'prestashop';
        rapport.type_site = 'ecommerce_prestashop';
        rapport.has_ecommerce = true;

      } else {
        rapport.plateforme_detectee = 'custom';
        rapport.type_site = 'custom';
      }

      // 3. Detection paiement
      if (htmlLower.includes('stripe.com') || htmlLower.includes('stripe.js')) {
        rapport.has_stripe = true;
      }
      if (htmlLower.includes('paypal')) {
        rapport.details.has_paypal = true;
      }

      // 4. Analyse SEO basique
      let seoScore = 50;
      const title = $('title').text().trim();
      const metaDesc = $('meta[name="description"]').attr('content') || '';
      const h1s = $('h1').length;
      const images = $('img').length;
      const imagesWithAlt = $('img[alt]').length;
      const hasViewport = $('meta[name="viewport"]').length > 0;
      const hasCanonical = $('link[rel="canonical"]').length > 0;
      const hasOg = $('meta[property="og:title"]').length > 0;

      if (title && title.length > 10 && title.length < 70) seoScore += 10;
      if (metaDesc && metaDesc.length > 50) seoScore += 10;
      if (h1s === 1) seoScore += 5;
      if (images > 0 && imagesWithAlt / images > 0.7) seoScore += 10;
      if (hasViewport) seoScore += 5;
      if (hasCanonical) seoScore += 5;
      if (hasOg) seoScore += 5;
      rapport.score_seo = Math.min(100, seoScore);
      rapport.details.seo = { title, meta_description: metaDesc, h1_count: h1s, images_count: images, images_with_alt: imagesWithAlt };

      // 5. Score performance (simplifie)
      let perfScore = 70;
      const loadTime = rapport.details.load_time_ms || 0;
      const pageSize = rapport.details.page_size_kb || 0;

      if (loadTime < 1000) perfScore += 15;
      else if (loadTime < 2000) perfScore += 10;
      else if (loadTime < 3000) perfScore += 5;
      else if (loadTime > 5000) perfScore -= 15;

      if (pageSize < 200) perfScore += 10;
      else if (pageSize < 500) perfScore += 5;
      else if (pageSize > 2000) perfScore -= 10;

      // Scripts et CSS externes
      const scripts = $('script[src]').length;
      const stylesheets = $('link[rel="stylesheet"]').length;
      if (scripts > 20) perfScore -= 10;
      if (stylesheets > 10) perfScore -= 5;

      rapport.score_performance = Math.max(0, Math.min(100, perfScore));

      // 6. Score complexite
      let complexite = 0;

      // Nombre de pages
      if (rapport.nb_pages === 0) {
        // Compter les liens internes comme approximation
        const links = new Set();
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            links.add(href.split('?')[0].split('#')[0]);
          }
        });
        rapport.nb_pages = Math.max(1, links.size);
      }

      if (rapport.nb_pages <= 5) complexite += 5;
      else if (rapport.nb_pages <= 15) complexite += 20;
      else if (rapport.nb_pages <= 50) complexite += 40;
      else complexite += 60;

      if (rapport.has_ecommerce) complexite += 25;
      if (rapport.nb_produits > 50) complexite += 10;
      if (rapport.nb_produits > 500) complexite += 15;
      if (rapport.has_stripe) complexite += 5;
      if (rapport.plugins_detectes.length > 10) complexite += 10;
      if (rapport.plateforme_detectee === 'custom') complexite += 15;

      // Detecter app web complexe (React, Angular, Vue)
      if (htmlLower.includes('__next') || htmlLower.includes('react') || htmlLower.includes('angular') || htmlLower.includes('vue-app')) {
        complexite += 20;
        rapport.details.is_spa = true;
      }

      rapport.score_complexite = Math.min(100, complexite);

      // 7. Recommandation
      if (complexite <= 30) {
        rapport.recommandation = 'reconstruire';
      } else if (complexite <= 70) {
        rapport.recommandation = 'ameliorer';
      } else {
        rapport.recommandation = 'refuser';
      }

      // 8. Assembler le rapport complet
      const rapportComplet = {
        ...rapport,
        rapport_complet: {
          plateforme: rapport.plateforme_detectee,
          theme: rapport.theme_detecte,
          plugins: rapport.plugins_detectes,
          pages: rapport.nb_pages,
          produits: rapport.nb_produits,
          ecommerce: rapport.has_ecommerce,
          stripe: rapport.has_stripe,
          performance: {
            score: rapport.score_performance,
            load_time_ms: rapport.details.load_time_ms,
            page_size_kb: rapport.details.page_size_kb
          },
          seo: rapport.details.seo,
          complexite: rapport.score_complexite,
          recommandation: rapport.recommandation,
          is_spa: rapport.details.is_spa || false
        }
      };

      // 9. Sauvegarder en BDD
      try {
        const { error: insertErr } = await supabase
          .from('site_analyses')
          .insert({
            societe_id: req.societeId || null,
            url_analysee: targetUrl,
            type_site: rapport.type_site,
            plateforme_detectee: rapport.plateforme_detectee,
            theme_detecte: rapport.theme_detecte,
            plugins_detectes: rapport.plugins_detectes,
            nb_pages: rapport.nb_pages,
            nb_produits: rapport.nb_produits,
            has_ecommerce: rapport.has_ecommerce,
            has_stripe: rapport.has_stripe,
            score_performance: rapport.score_performance,
            score_seo: rapport.score_seo,
            score_complexite: rapport.score_complexite,
            recommandation: rapport.recommandation,
            rapport_complet: rapportComplet.rapport_complet
          });
        if (insertErr) console.warn('[analyse] Insert error:', insertErr.message);
      } catch (dbErr) {
        console.warn('[analyse] DB save failed:', dbErr.message);
      }

      return res.json(rapportComplet);

    } catch (err) {
      console.error('[analyse/scan]', err);
      return res.status(500).json({ error: 'Erreur analyse', details: err.message });
    }
  });

  // ================================================
  // GET /api/studio/analyse/:id
  // Recupere une analyse sauvegardee
  // ================================================
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('site_analyses')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error || !data) return res.status(404).json({ error: 'Analyse non trouvee' });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur', details: err.message });
    }
  });

  // ================================================
  // GET /api/studio/analyse/history
  // Liste les analyses de l'organisation
  // ================================================
  router.get('/history/list', requireAuth, async (req, res) => {
    try {
      if (!req.societeId) return res.json([]);
      const { data, error } = await supabase
        .from('site_analyses')
        .select('id, url_analysee, plateforme_detectee, score_complexite, recommandation, analysee_le')
        .eq('societe_id', req.societeId)
        .order('analysee_le', { ascending: false })
        .limit(20);

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/studio/analyse', router);
};
