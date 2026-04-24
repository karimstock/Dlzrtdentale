// =============================================
// JADOMI — Module Staging (copie site pour modification)
// Passe 43A — 24 avril 2026
// POST /staging/create — cree une copie staging du site
// GET /staging/:id — recupere les infos du staging
// =============================================
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

const STAGING_DIR = path.join(__dirname, '../../uploads/staging');

module.exports = function (router) {

  // POST /staging/create
  router.post('/staging/create', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error: authErr } = await admin().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Token invalide' });

      const societeId = req.headers['x-societe-id'] || req.body.societe_id;
      const { analysis_id, url, options } = req.body || {};
      if (!url) return res.status(400).json({ error: 'URL requise' });

      // Generer slug unique
      const domain = new URL(url).hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '-');
      const slug = domain + '-staging-' + Date.now().toString(36);

      // Creer le dossier
      const stagingPath = path.join(STAGING_DIR, slug);
      if (!fs.existsSync(stagingPath)) fs.mkdirSync(stagingPath, { recursive: true });

      // Creer entree DB
      const { data: staging, error: dbErr } = await admin().from('staging_sites').insert({
        societe_id: societeId,
        analysis_id: analysis_id || null,
        slug,
        url_originale: url,
        url_staging: '/sites-staging/' + slug + '/',
        statut: 'en_creation'
      }).select().single();

      if (dbErr) return res.status(500).json({ error: dbErr.message });

      // Retourner immediatement, scraping en background
      res.status(201).json({
        staging_id: staging.id,
        slug,
        url_staging: '/sites-staging/' + slug + '/',
        statut: 'en_creation',
        message: 'Staging en cours de creation...'
      });

      // Lancer le scraping en arriere-plan
      scrapeForStaging(staging.id, url, stagingPath, slug).catch(err => {
        console.error('[staging] Scraping error:', err.message);
        admin().from('staging_sites').update({ statut: 'archive' }).eq('id', staging.id);
      });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /staging/:id
  router.get('/staging/:id', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });

      const { data, error } = await admin().from('staging_sites').select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Staging non trouve' });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /staging/status/:id (pour polling frontend)
  router.get('/staging/status/:id', async (req, res) => {
    try {
      const { data } = await admin().from('staging_sites').select('statut, nombre_pages, nombre_medias, url_staging').eq('id', req.params.id).single();
      if (!data) return res.status(404).json({ error: 'Non trouve' });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
};

// === SCRAPING POUR STAGING ===
async function scrapeForStaging(stagingId, url, stagingPath, slug) {
  const log = (msg) => console.log(`[staging ${slug}] ${msg}`);
  let totalPages = 0, totalMedias = 0;

  try {
    // 1. Recuperer la page d'accueil
    log('Telechargement page accueil...');
    const mainHtml = await fetchPage(url);
    if (!mainHtml) throw new Error('Page inaccessible');

    const $ = cheerio.load(mainHtml);

    // 2. Extraire et telecharger les CSS
    log('Telechargement CSS...');
    const cssUrls = [];
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) try { cssUrls.push(new URL(href, url).href); } catch {}
    });

    let cssContent = '';
    for (const cssUrl of cssUrls.slice(0, 20)) {
      try {
        const css = await fetchPage(cssUrl);
        if (css) cssContent += '\n/* ' + cssUrl.split('/').pop() + ' */\n' + css;
      } catch {}
    }
    fs.writeFileSync(path.join(stagingPath, 'styles.css'), cssContent);

    // 3. Telecharger les images (max 30)
    log('Telechargement images...');
    const imgDir = path.join(stagingPath, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

    const imgUrls = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.startsWith('data:') && i < 30) {
        try { imgUrls.push(new URL(src, url).href); } catch {}
      }
    });

    for (const imgUrl of imgUrls) {
      try {
        const filename = imgUrl.split('/').pop().split('?')[0].substring(0, 60);
        await downloadFile(imgUrl, path.join(imgDir, filename));
        totalMedias++;
      } catch {}
    }

    // 4. Recrire le HTML pour pointer vers les resources locales
    log('Reconstruction HTML...');
    let processedHtml = mainHtml;

    // Remplacer les CSS externes par le CSS local
    processedHtml = processedHtml.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
    processedHtml = processedHtml.replace('</head>', '<link rel="stylesheet" href="styles.css">\n</head>');

    // Remplacer les src images par les chemins locaux
    for (const imgUrl of imgUrls) {
      const filename = imgUrl.split('/').pop().split('?')[0].substring(0, 60);
      processedHtml = processedHtml.split(imgUrl).join('images/' + filename);
    }

    // Injecter le badge JADOMI staging
    const badge = `<div id="jadomi-staging-badge" style="position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#C9A961,#D4AF37);color:#0A1628;padding:8px 16px;z-index:999999;font-family:Inter,sans-serif;font-size:13px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.1);display:flex;justify-content:center;gap:16px;align-items:center;">
      <span>STAGING JADOMI — Version en cours d'amelioration</span>
      <a href="${url}" target="_blank" style="color:#0A1628;text-decoration:underline;">Voir l'original</a>
      <a href="/public/vitrines/staging-modifier.html?slug=${slug}" style="color:#0A1628;font-weight:bold;">Modifier avec l'IA &rarr;</a>
    </div><style>body{padding-top:42px!important;}</style>`;
    processedHtml = processedHtml.replace(/<body[^>]*>/i, (match) => match + badge);

    fs.writeFileSync(path.join(stagingPath, 'index.html'), processedHtml);
    totalPages = 1;

    // 5. Update DB
    await admin().from('staging_sites').update({
      statut: 'pret',
      nombre_pages: totalPages,
      nombre_medias: totalMedias,
      taille_totale_mb: Math.round(calculateDirSize(stagingPath) / 1024 / 1024 * 100) / 100,
      updated_at: new Date().toISOString()
    }).eq('id', stagingId);

    log('Staging pret ! ' + totalPages + ' pages, ' + totalMedias + ' medias');

  } catch (err) {
    log('ERREUR: ' + err.message);
    await admin().from('staging_sites').update({ statut: 'archive' }).eq('id', stagingId);
  }
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JADOMI-Staging/1.0 (https://jadomi.fr)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JADOMI-Staging/1.0' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return;
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

function calculateDirSize(dir) {
  let size = 0;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      const fp = path.join(dir, f.name);
      if (f.isDirectory()) size += calculateDirSize(fp);
      else size += fs.statSync(fp).size;
    }
  } catch {}
  return size;
}
