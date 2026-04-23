const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  req.token = token;
  // Extract user from JWT (simplified - in prod use supabase.auth.getUser)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    req.user = { id: payload.sub, email: payload.email };
    req.user.societe_id = req.body?.societe_id || req.query?.societe_id ||
      req.headers['x-societe-id'] || null;
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }
  next();
}

// POST /api/site-analysis/start
router.post('/start', authMiddleware, async (req, res) => {
  const { url } = req.body;
  const societe_id = req.user.societe_id ||
    req.body.societe_id ||
    (await getActiveSociete(req.user.id));

  if (!url || !url.match(/^https?:\/\//)) {
    return res.status(400).json({ error: 'URL invalide. Format attendu : https://...' });
  }

  try {
    const { data: analysis, error } = await supabase
      .from('site_analyses')
      .insert({
        societe_id,
        source_url: url,
        status: 'crawling',
        status_message: 'Exploration du site en cours...'
      })
      .select()
      .single();

    if (error) throw error;

    // Launch analysis in background
    runAnalysis(analysis.id, url, societe_id).catch(err => {
      console.error('Analysis error:', err);
      supabase.from('site_analyses').update({
        status: 'error',
        error_message: err.message
      }).eq('id', analysis.id);
    });

    res.json({
      analysis_id: analysis.id,
      status: 'started',
      message: 'Analyse démarrée. Résultats dans 30-90 secondes.'
    });
  } catch (e) {
    console.error('Start analysis error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/site-analysis/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data: analysis, error } = await supabase
      .from('site_analyses')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !analysis) return res.status(404).json({ error: 'Analyse non trouvée' });
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/site-analysis/:id/assets
router.get('/:id/assets', authMiddleware, async (req, res) => {
  try {
    const { data: assets, error } = await supabase
      .from('imported_assets')
      .select('*')
      .eq('analysis_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ assets: assets || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/site-analysis/:id/select-assets
router.post('/:id/select-assets', authMiddleware, async (req, res) => {
  const { asset_selections } = req.body;
  if (!asset_selections || !Array.isArray(asset_selections)) {
    return res.status(400).json({ error: 'asset_selections requis' });
  }

  try {
    for (const sel of asset_selections) {
      if (sel.action === 'discard') {
        await supabase.from('imported_assets')
          .delete()
          .eq('id', sel.asset_id);
      } else if (sel.action === 'keep') {
        await supabase.from('imported_assets')
          .update({ is_used: true, category: sel.category || null })
          .eq('id', sel.asset_id);
      } else if (sel.action === 'improve_ai') {
        await supabase.from('imported_assets')
          .update({ is_used: true, pending_ai_enhancement: true })
          .eq('id', sel.asset_id);
      }
    }

    const kept = asset_selections.filter(s => s.action !== 'discard').length;
    res.json({ success: true, kept });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/site-analysis/:id/auto-select (Claude choisit)
router.post('/:id/auto-select', authMiddleware, async (req, res) => {
  try {
    const { data: assets } = await supabase
      .from('imported_assets')
      .select('*')
      .eq('analysis_id', req.params.id);

    if (!assets || assets.length === 0) {
      return res.json({ total: 0, kept: 0, discarded: 0, kept_ids: [] });
    }

    // Auto-select: keep images >= 800px wide or with good context
    const goodContexts = ['hero', 'header', 'logo', 'team_member', 'gallery'];
    const toKeep = assets.filter(a => {
      const w = a.metadata?.width || 0;
      const ctx = a.metadata?.context || 'content';
      const quality = a.metadata?.ai_analysis?.quality || 'medium';

      if (a.asset_type === 'video' || a.asset_type === 'video_embed') return true;
      if (ctx === 'logo') return true;
      if (goodContexts.includes(ctx) && w >= 600) return true;
      if (w >= 1200) return true;
      if (quality === 'high' || quality === 'excellent') return true;
      return false;
    });

    res.json({
      total: assets.length,
      kept: toKeep.length,
      discarded: assets.length - toKeep.length,
      kept_ids: toKeep.map(a => a.id)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// BACKGROUND ANALYSIS
// ============================================================

async function runAnalysis(analysisId, url, societeId) {
  try {
    // Step 1: Scraping with Puppeteer + Cheerio
    await updateStatus(analysisId, 'crawling', 'Exploration du site...');
    const scraped = await scrapeSite(url);

    await supabase.from('site_analyses').update({
      scraped_data: scraped,
      pages_explored: 1
    }).eq('id', analysisId);

    // Step 2: Import assets to DB
    await updateStatus(analysisId, 'downloading', 'Téléchargement des médias...');
    await importAssetsToDB(analysisId, societeId, scraped);

    // Step 3: Audits
    await updateStatus(analysisId, 'auditing', 'Audit sécurité et SEO...');
    const [designAudit, securityAudit, seoAudit] = await Promise.all([
      auditDesign(url, scraped),
      auditSecurity(url),
      auditSEO(url, scraped)
    ]);

    // Step 4: Save results
    await supabase.from('site_analyses').update({
      status: 'done',
      design_audit: designAudit,
      security_audit: securityAudit,
      seo_audit: seoAudit,
      performance_audit: { score: null, error: 'PageSpeed API non configurée' },
      completed_at: new Date().toISOString()
    }).eq('id', analysisId);

  } catch (err) {
    console.error('Analysis pipeline error:', err);
    await supabase.from('site_analyses').update({
      status: 'error',
      error_message: err.message
    }).eq('id', analysisId);
  }
}

async function updateStatus(analysisId, status, message) {
  await supabase.from('site_analyses').update({
    status,
    status_message: message
  }).eq('id', analysisId);
}

// ============================================================
// SCRAPING
// ============================================================

async function scrapeSite(url) {
  let browser, data = {
    title: '', meta_description: '', h1: '',
    images: [], videos: [], logo: null,
    texts: { hero: '', about: '', services: [], contact: {} },
    assets: [], colors: [], fonts: [],
    has_https: url.startsWith('https://'),
    technologies: {}
  };

  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 JADOMI/1.0 (+https://jadomi.fr)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const html = await page.content();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    data.title = $('title').text().trim();
    data.meta_description = $('meta[name="description"]').attr('content') || '';
    data.h1 = $('h1').first().text().trim();

    // Images
    $('img').each((i, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt') || '';
      if (src && !src.startsWith('data:')) {
        try {
          const fullUrl = new URL(src, url).href;
          const context = detectImageContext($(el));
          data.images.push({ url: fullUrl, alt, context });
          data.assets.push({ type: 'image', url: fullUrl, alt, context });

          // Detect logo
          if (!data.logo && (
            alt.toLowerCase().includes('logo') ||
            src.toLowerCase().includes('logo') ||
            $(el).parents('header, nav').length > 0
          )) {
            data.logo = fullUrl;
          }
        } catch (e) {}
      }
    });

    // Videos
    $('video source, video[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        try {
          const fullUrl = new URL(src, url).href;
          data.videos.push({ url: fullUrl });
          data.assets.push({ type: 'video', url: fullUrl });
        } catch (e) {}
      }
    });

    // YouTube/Vimeo embeds
    $('iframe').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('youtube') || src.includes('vimeo')) {
        data.assets.push({ type: 'video_embed', url: src });
      }
    });

    // Texts
    data.texts.hero = $('.hero, .banner, header, [class*="hero"]').first().text().trim().slice(0, 500);
    data.texts.about = $('.about, [class*="about"], #about, [id*="about"]').first().text().trim().slice(0, 500);

    // Contact
    const bodyText = $('body').text();
    const emailMatch = bodyText.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = bodyText.match(/(?:\+33|0)\s?\d(?:[\s.-]?\d{2}){4}/);
    data.texts.contact.email = emailMatch ? emailMatch[0] : null;
    data.texts.contact.phone = phoneMatch ? phoneMatch[0] : null;

    // Technologies
    if (html.includes('wp-content/') || html.includes('wp-includes/')) data.technologies.cms = 'WordPress';
    else if (html.includes('wix.com') || html.includes('wixstatic')) data.technologies.cms = 'Wix';
    else if (html.includes('squarespace')) data.technologies.cms = 'Squarespace';

  } catch (err) {
    console.error('Scraping error:', err.message);
    data.error = err.message;
  } finally {
    if (browser) await browser.close();
  }

  return data;
}

function detectImageContext($el) {
  if ($el.parents('header, nav').length > 0) return 'header';
  if ($el.parents('footer').length > 0) return 'footer';
  if ($el.parents('[class*="hero"], [class*="banner"]').length > 0) return 'hero';
  if ($el.parents('[class*="gallery"], [class*="galerie"]').length > 0) return 'gallery';
  if ($el.parents('[class*="team"], [class*="equipe"]').length > 0) return 'team_member';
  return 'content';
}

// ============================================================
// IMPORT ASSETS TO DB
// ============================================================

async function importAssetsToDB(analysisId, societeId, scraped) {
  const assets = (scraped.assets || []).slice(0, 50);
  for (const asset of assets) {
    try {
      await supabase.from('imported_assets').insert({
        analysis_id: analysisId,
        societe_id: societeId,
        asset_type: asset.type,
        source: 'crawl',
        original_url: asset.url,
        r2_url: asset.url, // For now, use original URL
        metadata: {
          alt: asset.alt || '',
          context: asset.context || 'content'
        }
      });
    } catch (e) {
      console.warn('Import asset failed:', asset.url, e.message);
    }
  }
}

// ============================================================
// AUDIT DESIGN
// ============================================================

async function auditDesign(url, scraped) {
  const issues = [];
  const recommendations = [];
  let score = 100;

  if (!scraped.meta_description) {
    issues.push({ severity: 'medium', category: 'content', message: 'Meta description absente' });
    recommendations.push('Ajouter une meta description (150-160 caractères) pour améliorer le SEO.');
    score -= 10;
  }

  if (!scraped.logo) {
    issues.push({ severity: 'high', category: 'branding', message: 'Logo non identifié clairement' });
    score -= 15;
  }

  if (scraped.images.length < 3) {
    issues.push({ severity: 'medium', category: 'visual', message: `Seulement ${scraped.images.length} image(s) détectée(s)` });
    recommendations.push('Ajouter plus d\'images professionnelles pour enrichir l\'expérience visuelle.');
    score -= 10;
  }

  if (scraped.videos.length === 0) {
    recommendations.push('Envisager d\'ajouter une vidéo hero pour augmenter l\'engagement de 80% en moyenne.');
    score -= 5;
  }

  if (!scraped.h1 || scraped.h1.length < 10) {
    issues.push({ severity: 'medium', category: 'structure', message: 'H1 absent ou trop court' });
    score -= 8;
  }

  return { score: Math.max(0, score), grade: scoreToGrade(score), issues, recommendations };
}

// ============================================================
// AUDIT SÉCURITÉ
// ============================================================

async function auditSecurity(url) {
  const issues = [];
  const recommendations = [];
  let score = 100;

  // HTTPS check
  if (!url.startsWith('https://')) {
    issues.push({
      severity: 'critical', category: 'ssl',
      message: 'Site non sécurisé (HTTP au lieu de HTTPS)',
      details: 'Les données transmises ne sont pas chiffrées. Obligatoire RGPD.'
    });
    score -= 40;
  }

  // Headers check
  try {
    const axios = require('axios');
    const response = await axios.head(url, { timeout: 10000, maxRedirects: 5 });
    const headers = response.headers;

    if (!headers['strict-transport-security']) {
      issues.push({ severity: 'medium', category: 'headers', message: 'HSTS absent (Strict-Transport-Security)' });
      score -= 5;
    }
    if (!headers['content-security-policy']) {
      issues.push({ severity: 'medium', category: 'headers', message: 'CSP absent (Content-Security-Policy)' });
      score -= 10;
    }
    if (!headers['x-frame-options']) {
      issues.push({ severity: 'low', category: 'headers', message: 'X-Frame-Options absent' });
      score -= 3;
    }
  } catch (e) {}

  // Legal check
  try {
    const axios = require('axios');
    const { data: html } = await axios.get(url, { timeout: 15000 });
    const lower = html.toLowerCase();

    if (!lower.includes('mentions légales') && !lower.includes('mentions legales')) {
      issues.push({
        severity: 'high', category: 'legal',
        message: 'Mentions légales non détectées',
        details: 'Obligatoire en France. Sanctions jusqu\'à 75 000€.'
      });
      score -= 15;
    }

    if (!lower.includes('politique de confidentialité') && !lower.includes('politique de confidentialite')) {
      issues.push({
        severity: 'high', category: 'legal',
        message: 'Politique de confidentialité non détectée',
        details: 'Obligatoire RGPD. JADOMI peut la générer automatiquement.'
      });
      score -= 15;
    }

    if (!lower.includes('cookies')) {
      issues.push({ severity: 'medium', category: 'legal', message: 'Bandeau cookies non détecté' });
      score -= 5;
    }

    // WordPress version
    const wpMatch = html.match(/<meta name="generator" content="WordPress ([\d.]+)"/);
    if (wpMatch) {
      issues.push({
        severity: 'medium', category: 'cms',
        message: `WordPress ${wpMatch[1]} détecté — version visible publiquement`
      });
      score -= 10;
    }
  } catch (e) {}

  return { score: Math.max(0, score), grade: scoreToGrade(score), issues, recommendations };
}

// ============================================================
// AUDIT SEO
// ============================================================

async function auditSEO(url, scraped) {
  const issues = [];
  const recommendations = [];
  let score = 100;

  // Title
  if (!scraped.title || scraped.title.length < 30) {
    issues.push({ severity: 'high', category: 'title', message: `Title trop court (${scraped.title?.length || 0} caractères)` });
    score -= 15;
  }
  if (scraped.title && scraped.title.length > 70) {
    issues.push({ severity: 'medium', category: 'title', message: 'Title trop long (tronqué dans Google)' });
    score -= 5;
  }

  // Meta description
  if (!scraped.meta_description) { score -= 15; }

  // H1
  if (!scraped.h1 || scraped.h1.length < 10) {
    issues.push({ severity: 'high', category: 'structure', message: 'H1 absent ou trop court' });
    score -= 10;
  }

  // Images without alt
  const noAlt = scraped.images.filter(img => !img.alt || img.alt.length === 0).length;
  if (noAlt > 0) {
    issues.push({ severity: 'medium', category: 'accessibility', message: `${noAlt} image(s) sans attribut alt` });
    score -= Math.min(15, noAlt * 2);
  }

  // Sitemap
  try {
    const axios = require('axios');
    await axios.head(new URL('/sitemap.xml', url).href, { timeout: 5000 });
  } catch (e) {
    issues.push({ severity: 'medium', category: 'crawl', message: 'Sitemap.xml non trouvé' });
    score -= 10;
  }

  // Robots.txt
  try {
    const axios = require('axios');
    await axios.head(new URL('/robots.txt', url).href, { timeout: 5000 });
  } catch (e) {
    issues.push({ severity: 'low', category: 'crawl', message: 'Robots.txt non trouvé' });
    score -= 5;
  }

  return { score: Math.max(0, score), grade: scoreToGrade(score), issues, recommendations };
}

// ============================================================
// HELPERS
// ============================================================

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

async function getActiveSociete(userId) {
  try {
    const { data } = await supabase
      .from('societes')
      .select('id')
      .limit(1)
      .single();
    return data?.id || null;
  } catch (e) { return null; }
}

module.exports = router;
