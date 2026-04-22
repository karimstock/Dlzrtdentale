// =============================================
// JADOMI — Module Mon site internet
// Routes /api/vitrines/*
// =============================================
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { authSupabase } = require('../multiSocietes/middleware');
const { RESERVED_SLUGS } = require('./professions/base');

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

// Domaines systeme exclus du wildcard *.jadomi.fr
const SYSTEM_HOSTS = ['www', 'api', 'admin', 'dashboard', 'auth', 'support', 'blog', 'docs', 'mail', 'app'];

module.exports = function mountVitrines(app) {

  // --- Middleware sous-domaines *.jadomi.fr ---
  app.use(async (req, res, next) => {
    const host = req.hostname || '';
    // Detecter [slug].jadomi.fr
    const match = host.match(/^([a-z0-9-]+)\.jadomi\.fr$/);
    if (!match) return next();

    const subdomain = match[1];
    // Exclure domaines systeme
    if (SYSTEM_HOSTS.includes(subdomain) || RESERVED_SLUGS.includes(subdomain)) return next();

    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id, slug')
        .eq('slug', subdomain)
        .eq('status', 'published')
        .maybeSingle();

      if (site) {
        // Servir la page du site public
        return res.sendFile(path.join(__dirname, '../../public/site/index.html'));
      }
    } catch (err) {
      console.error('[vitrines/subdomain]', err.message);
    }

    next();
  });

  // --- Routes publiques (sans auth) ---
  const publicRouter = express.Router();
  require('./public')(publicRouter);
  try { require('./chatbot-public')(publicRouter); } catch (e) {
    console.warn('[vitrines] chatbot-public non charge:', e.message);
  }
  app.use('/api/vitrines/public', publicRouter);

  // --- Routes authentifiees ---
  const router = express.Router();
  router.use(authSupabase());

  require('./chat')(router);
  require('./scraper')(router);
  require('./gmb')(router);
  require('./photos')(router);
  require('./competitors')(router);
  require('./domains')(router);
  require('./video')(router);
  require('./publish')(router);
  require('./edit')(router);
  require('./versions')(router);
  require('./quotas')(router);
  require('./dashboard-api')(router);
  require('./infos')(router);
  require('./site-editor')(router);
  require('./dashboard-v2')(router);
  require('./upsell')(router);
  require('./themes')(router);
  require('./onboarding-ai')(router);
  require('./logo-ai')(router);
  try { require('./ai-assistants')(router); } catch (e) {
    console.warn('[vitrines] ai-assistants non charge:', e.message);
  }

  app.use('/api/vitrines', router);

  // --- Pages HTML publiques (SPA multi-pages) ---
  const siteHtml = path.join(__dirname, '../../public/site/index.html');
  app.get('/site/:slug', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/cabinet', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/equipe', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/traitements', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/traitements/:t', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/technologies', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/cas-cliniques', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/domaines', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/blog', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/blog/:a', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/contact', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/mentions-legales', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/confidentialite', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/cookies', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/rendez-vous', (req, res) => res.sendFile(siteHtml));
  app.get('/site/:slug/espace-client', (req, res) => res.sendFile(siteHtml));

  console.log('[JADOMI] Routes /api/vitrines montees');
};
