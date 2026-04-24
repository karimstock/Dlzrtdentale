// =============================================
// JADOMI — Crawler multi-pages pour sites vitrines
// Passe 44A — 24 avril 2026
// Cheerio only (pas de Puppeteer)
// =============================================
const cheerio = require('cheerio');

const REALISTIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Referer': 'https://www.google.com/'
};

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: REALISTIC_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return null;
  return await res.text();
}

// === EXTRACTION INFOS BUSINESS ===
function extractPhones(text) {
  const p = /(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}/g;
  return [...new Set((text.match(p) || []))].slice(0, 5);
}

function extractEmails(text) {
  const p = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return [...new Set((text.match(p) || []).filter(e => !e.includes('wixpress') && !e.includes('sentry') && !e.includes('example')))].slice(0, 5);
}

function extractAddress(text) {
  const m = text.match(/\b\d{1,4}[\s,]+(?:rue|avenue|boulevard|place|impasse|chemin|allée|passage)[^,\n]{3,60},?\s*\d{5}\s+[A-ZÀ-Ü][a-zà-ÿ\s-]+/i);
  if (m) return m[0].trim();
  const cp = text.match(/\d{5}\s+[A-ZÀ-Ü][a-zà-ÿ\s-]{2,30}/);
  return cp ? cp[0].trim() : null;
}

function extractHours(text) {
  const h = [];
  const p = /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[\s:–-]+\d{1,2}[h:]\d{0,2}[\s–-]+\d{1,2}[h:]\d{0,2}/gi;
  (text.match(p) || []).forEach(m => h.push(m.trim()));
  return [...new Set(h)].slice(0, 14);
}

// === EXTRACTION MEDIAS ===
function extractImages($, baseUrl) {
  const imgs = [];
  $('img').each((i, el) => {
    if (i >= 60) return false;
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    if (!src || src.startsWith('data:') || src.length < 5) return;
    try {
      const fullUrl = new URL(src, baseUrl).href;
      if (fullUrl.includes('gravatar.com') || fullUrl.includes('wp-emoji')) return;
      imgs.push({ url: fullUrl, alt: $(el).attr('alt') || '', width: $(el).attr('width') || '', height: $(el).attr('height') || '' });
    } catch {}
  });
  return imgs;
}

function extractVideos($, baseUrl, html) {
  const vids = [];
  $('video').each((i, el) => {
    const src = $(el).attr('src') || $(el).find('source').attr('src') || '';
    if (src) { try { vids.push({ url: new URL(src, baseUrl).href, type: 'direct', poster: $(el).attr('poster') || '' }); } catch {} }
  });
  $('iframe').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src.includes('youtube.com/embed/') || src.includes('youtu.be/')) {
      const vid = src.match(/(?:embed\/|youtu\.be\/)([^?&]+)/)?.[1];
      vids.push({ url: src, type: 'youtube', embed: true, video_id: vid, thumbnail: vid ? `https://img.youtube.com/vi/${vid}/maxresdefault.jpg` : null });
    } else if (src.includes('vimeo.com')) {
      const vid = src.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
      vids.push({ url: src, type: 'vimeo', embed: true, video_id: vid });
    }
  });
  return vids;
}

function extractPdfs($, baseUrl) {
  const pdfs = [];
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (href.match(/\.pdf(\?|$)/i)) {
      try { pdfs.push({ url: new URL(href, baseUrl).href, title: $(el).text().trim() || 'Document PDF' }); } catch {}
    }
  });
  return pdfs;
}

// === DETECTION COMPROMISSION ===
function detectCompromission(html) {
  const alerts = [];
  if (/i am not a robot.*cloudflare.*powershell/i.test(html) || /verify you are human.*ctrl\+v/i.test(html) || /captcha.*powershell/i.test(html)) {
    alerts.push({ severity: 'critical', type: 'fake_captcha_clickfix', message: 'Fake CAPTCHA malveillant detecte (arnaque ClickFix). Votre site est probablement pirate.' });
  }
  if (/eval\s*\(\s*base64_decode|eval\s*\(\s*gzuncompress|eval\s*\(\s*str_rot13/i.test(html)) {
    alerts.push({ severity: 'critical', type: 'obfuscated_code', message: 'Code malveillant obfusque detecte dans le HTML.' });
  }
  if (/<meta[^>]*refresh[^>]*https?:\/\/[^"']*\.(xyz|tk|top|buzz|click)/i.test(html)) {
    alerts.push({ severity: 'high', type: 'suspicious_redirect', message: 'Redirection suspecte vers un domaine douteux.' });
  }
  if (/document\.write\s*\(\s*unescape|String\.fromCharCode.*eval/i.test(html)) {
    alerts.push({ severity: 'high', type: 'js_injection', message: 'Injection JavaScript suspecte detectee.' });
  }
  return { compromis: alerts.length > 0, alerts };
}

// === EXTRACTION CONTENU PAGE ===
function extractPageContent(html, url) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ');

  return {
    title: $('title').text().trim(),
    h1: $('h1').first().text().trim(),
    meta_description: $('meta[name="description"]').attr('content') || '',
    textes: {
      hero: $('h1').first().text().trim(),
      sous_titre: $('h1').first().next('p, h2').first().text().trim(),
      paragraphs: $('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 40 && t.length < 2000).slice(0, 20),
      titres_h2: $('h2').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 3).slice(0, 15),
      listes: $('ul li, ol li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 5).slice(0, 30)
    },
    infos: {
      telephones: extractPhones(bodyText),
      emails: extractEmails(bodyText),
      adresse: extractAddress(bodyText),
      horaires: extractHours(bodyText)
    },
    medias: {
      images: extractImages($, url),
      videos: extractVideos($, url, html),
      pdfs: extractPdfs($, url)
    },
    design: {
      logo: findLogo($, url),
      couleurs_css: extractCssColors($)
    },
    securite: detectCompromission(html)
  };
}

function findLogo($, url) {
  let logo = null;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = ($(el).attr('alt') || '').toLowerCase();
    if (!logo && (alt.includes('logo') || src.toLowerCase().includes('logo') || $(el).parents('header, nav, .header, .navbar').length > 0)) {
      try { logo = new URL(src, url).href; } catch {}
    }
  });
  return logo;
}

function extractCssColors($) {
  const colors = new Set();
  const styleText = $('style').text() + ' ' + ($('[style]').map((_, el) => $(el).attr('style') || '').get().join(' '));
  const hexMatches = styleText.match(/#[0-9a-fA-F]{3,8}/g) || [];
  hexMatches.forEach(c => { if (c.length === 4 || c.length === 7) colors.add(c.toLowerCase()); });
  return [...colors].slice(0, 10);
}

// === CRAWLER MULTI-PAGES ===
async function crawlSite(baseUrl, maxPages = 20) {
  const visited = new Set();
  const toVisit = [baseUrl];
  const results = {
    url: baseUrl,
    pages: [],
    medias: { images: [], videos: [], pdfs: [] },
    textes_principaux: {},
    infos: {},
    design: {},
    securite: { compromis: false, alerts: [] },
    stats: { pages_crawled: 0, total_images: 0, total_videos: 0 }
  };

  // Essayer sitemap.xml
  try {
    const sitemapHtml = await fetchPage(baseUrl.replace(/\/$/, '') + '/sitemap.xml');
    if (sitemapHtml && sitemapHtml.includes('<loc>')) {
      const $ = cheerio.load(sitemapHtml, { xmlMode: true });
      $('loc').each((_, el) => {
        const u = $(el).text().trim();
        if (u && !visited.has(u)) toVisit.push(u);
      });
    }
  } catch {}

  // Crawler
  while (toVisit.length > 0 && visited.size < maxPages) {
    const url = toVisit.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const html = await fetchPage(url);
      if (!html) continue;

      const pageData = extractPageContent(html, url);
      results.pages.push({ url, ...pageData });

      // Accumuler medias (dedup par URL)
      const existingImgUrls = new Set(results.medias.images.map(i => i.url));
      pageData.medias.images.forEach(img => { if (!existingImgUrls.has(img.url)) { results.medias.images.push(img); existingImgUrls.add(img.url); } });
      const existingVidUrls = new Set(results.medias.videos.map(v => v.url));
      pageData.medias.videos.forEach(v => { if (!existingVidUrls.has(v.url)) { results.medias.videos.push(v); existingVidUrls.add(v.url); } });
      pageData.medias.pdfs.forEach(p => results.medias.pdfs.push(p));

      // Accumuler securite
      if (pageData.securite.compromis) {
        results.securite.compromis = true;
        results.securite.alerts.push(...pageData.securite.alerts);
      }

      // Extraire liens internes
      const $page = cheerio.load(html);
      const baseHost = new URL(baseUrl).hostname;
      $page('a[href]').each((_, el) => {
        const href = $page(el).attr('href') || '';
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
        try {
          const fullUrl = new URL(href, url).href;
          const linkHost = new URL(fullUrl).hostname;
          if (linkHost === baseHost && !visited.has(fullUrl) && !toVisit.includes(fullUrl)) {
            toVisit.push(fullUrl);
          }
        } catch {}
      });

      // Pause 500ms entre pages (politesse)
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.warn(`[crawler] Skip ${url}: ${err.message}`);
    }
  }

  // Premier résultat = page d'accueil → infos principales
  if (results.pages.length > 0) {
    const home = results.pages[0];
    results.textes_principaux = home.textes;
    results.infos = home.infos;
    results.design = home.design;
  }

  results.stats = {
    pages_crawled: results.pages.length,
    total_images: results.medias.images.length,
    total_videos: results.medias.videos.length,
    total_pdfs: results.medias.pdfs.length
  };

  return results;
}

module.exports = { crawlSite, extractPageContent, detectCompromission, fetchPage };
