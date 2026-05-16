// =============================================
// JADOMI — RAW FETCHER (scraper brut)
//
// Récupère le HTML brut des pages fournisseurs
// SANS aucune analyse. Stocke dans /tmp/scrape-raw/
//
// Méthodes : HTTP simple (Cheerio-style) ou Puppeteer
// =============================================

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAW_DIR = '/tmp/scrape-raw';
const LOG_FILE = '/tmp/scrape-ia-fetcher.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// CONFIG FOURNISSEURS — URLs et pagination
// =============================================

const SUPPLIERS = {
  gacd: {
    name: 'GACD',
    type: 'algolia',
    baseUrl: 'https://www.gacd.fr',
    algolia: {
      appId: 'KCFXGPCHAV',
      index: 'MAGENTO2_PRODdefault_products',
      // Clé API à récupérer dynamiquement
    },
  },
  dgd: {
    name: 'DentalGoodDeal',
    type: 'categories',
    baseUrl: 'https://www.dentalgooddeal.com',
    categories: {
      cfao: '/categorie_cfao_68174.html',
      empreintes: '/categorie_empreintes_67637.html',
      labo: '/categorie_laboratoire_67447.html',
      couronnes: '/categorie_couronnes_67120.html',
      ciments: '/categorie_ciments_66751.html',
      anesthesie: '/categorie_anesthesie_66644.html',
      radio: '/categorie_radiographie_66432.html',
      hygiene: '/categorie_hygiene_et_sterilisation_65436.html',
      restauration: '/categorie_restauration_64571.html',
      ortho: '/categorie_orthodontie_64086.html',
      implanto: '/categorie_implantologie_63768.html',
      prophylaxie: '/categorie_prophylaxie_63522.html',
      fraises: '/categorie_fraises_62701.html',
      endo: '/categorie_endodontie_61498.html',
      chirurgie: '/categorie_chirurgie_68169.html',
      paro: '/categorie_parodontologie_63090.html',
      instruments: '/categorie_petits_instruments_60529.html',
      usage_unique: '/categorie_usage_unique_62124.html',
      pivots: '/categorie_pivots_63348.html',
    },
    pagination: (catPath, page) =>
      page === 1 ? catPath : catPath.replace('.html', '__' + page + '.html'),
  },
  doctorstrong: {
    name: 'DoctorStrong',
    type: 'search_api',
    baseUrl: 'https://www.doctorstrong.fr',
    searchUrl: 'https://www.doctorstrong.fr/search/ajax/suggest?q=',
  },
  doctorai: {
    name: 'DoctorAI',
    type: 'search_api',
    baseUrl: 'https://www.doctor-ai.fr',
    searchUrl: 'https://www.doctor-ai.fr/search/ajax/suggest?q=',
  },
  megadental: {
    name: 'MegaDental',
    type: 'search_api',
    baseUrl: 'https://www.megadental.fr',
    searchUrl: 'https://www.megadental.fr/search/ajax/suggest?q=',
  },
  henryschein: {
    name: 'HenrySchein',
    type: 'categories',
    baseUrl: 'https://www.henryschein-dental.fr',
    categories: {
      all: '/c/dentaire',
    },
  },
  dentalclick: {
    name: 'DentalClick',
    type: 'categories',
    baseUrl: 'https://www.dentalclick.fr',
    categories: {
      all: '/fr/',
    },
  },
  dpi: {
    name: 'DentalPromotion',
    type: 'sitemap',
    baseUrl: 'https://www.dentalpromotion.fr',
    sitemaps: [
      '/sitemap.xml?page=1',
      '/sitemap.xml?page=2',
      '/sitemap.xml?page=3',
      '/sitemap.xml?page=4',
      '/sitemap.xml?page=5',
    ],
    // DPI met les produits à la racine (pas de /produit/), tout sauf /shop et homepage
    productUrlFilter: (url) => {
      const path = url.replace('https://www.dentalpromotion.fr', '');
      return path !== '/' && path !== '/shop' && !path.includes('/page/') && path.length > 2;
    },
  },
  praxisdienst: {
    name: 'Praxisdienst',
    type: 'categories',
    baseUrl: 'https://www.praxisdienst.com',
    categories: {
      empreinte: '/fr-fr/dentaire/traitement/empreinte/',
      endodontie: '/fr-fr/dentaire/traitement/endodontie/',
      obturation: '/fr-fr/dentaire/traitement/materiaux-d-obturation/',
      prothese: '/fr-fr/dentaire/traitement/prothese-dentaire/',
      prophylaxie: '/fr-fr/dentaire/traitement/prophylaxie/',
      orthodontie: '/fr-fr/dentaire/traitement/orthodontie/',
      chirurgie: '/fr-fr/dentaire/traitement/chirurgie/',
      implantologie: '/fr-fr/dentaire/traitement/implantologie/',
      paro: '/fr-fr/dentaire/traitement/parodontologie/',
      instruments_rotatifs: '/fr-fr/dentaire/instruments/instruments-rotatifs/',
      instruments_manuels: '/fr-fr/dentaire/instruments/instruments-a-main/',
      hygiene: '/fr-fr/dentaire/hygiene+et+sterilisation/',
      radiologie: '/fr-fr/dentaire/diagnostic/radiologie/',
      equipement: '/fr-fr/dentaire/cabinet-dentaire/',
      consommables: '/fr-fr/dentaire/consommables-dentaires/',
    },
    pagination: (catPath, page) =>
      page === 1 ? catPath : catPath + '?p=' + page,
  },
};

// =============================================
// HTTP FETCH (simple, pas de Puppeteer)
// =============================================

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
];

function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const headers = {
      'User-Agent': ua,
      'Accept': options.json ? 'application/json' : 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      ...(options.headers || {}),
    };

    proto.get(url, { headers, timeout: options.timeout || 15000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirect = res.headers.location;
        if (redirect.startsWith('/')) {
          const u = new URL(url);
          redirect = u.origin + redirect;
        }
        return resolve(fetchHttp(redirect, options));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, url }));
    }).on('error', reject)
      .on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

// =============================================
// SAUVEGARDER LE HTML BRUT
// =============================================

function saveRaw(supplier, pageId, content) {
  const dir = path.join(RAW_DIR, supplier);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = pageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100) + '.html';
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

// =============================================
// FETCHER PAR TYPE DE SITE
// =============================================

/**
 * Fetch toutes les pages catégorie d'un fournisseur
 * @param {string} supplierId - Clé dans SUPPLIERS
 * @param {Object} options - { maxPages, delayMs, category }
 * @returns {Array<{ file, url, supplier }>} Fichiers HTML sauvegardés
 */
async function fetchSupplier(supplierId, options = {}) {
  const config = SUPPLIERS[supplierId];
  if (!config) throw new Error(`Fournisseur inconnu: ${supplierId}`);

  const maxPages = options.maxPages || 10;
  const delayMs = options.delayMs || 3000;
  const results = [];

  log(`\n=== FETCH ${config.name} (${config.type}) ===`);

  if (config.type === 'categories') {
    const cats = options.category
      ? { [options.category]: config.categories[options.category] }
      : config.categories;

    for (const [catName, catPath] of Object.entries(cats)) {
      if (!catPath) continue;
      log(`  Catégorie: ${catName}`);
      let prevHash = null;

      for (let page = 1; page <= maxPages; page++) {
        const pagePath = config.pagination
          ? config.pagination(catPath, page)
          : catPath + (page > 1 ? `?p=${page}` : '');
        const url = config.baseUrl + pagePath;

        try {
          const { status, body } = await fetchHttp(url);
          if (status !== 200 || body.length < 1000) {
            log(`    Page ${page}: stop (${status}, ${body.length} bytes)`);
            break;
          }

          // Détection fin de pagination : contenu identique = on boucle
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(body).digest('hex');
          if (hash === prevHash) {
            log(`    Page ${page}: stop (contenu identique à page ${page - 1})`);
            break;
          }
          prevHash = hash;

          const file = saveRaw(supplierId, `${catName}_p${page}`, body);
          results.push({ file, url, supplier: config.name, category: catName, page });
          log(`    Page ${page}: ${body.length} bytes → ${path.basename(file)}`);

          // Délai humain
          await new Promise(r => setTimeout(r, delayMs + Math.random() * 2000));
        } catch (err) {
          log(`    Page ${page} erreur: ${err.message}`);
          break;
        }
      }
    }
  }

  if (config.type === 'sitemap') {
    // Parcourir les sitemaps XML, extraire les URLs produit, fetcher chaque page
    const cheerio = require('cheerio');
    const productUrls = new Set();

    for (const sitemapPath of (config.sitemaps || ['/sitemap.xml'])) {
      const url = config.baseUrl + sitemapPath;
      try {
        const { status, body } = await fetchHttp(url);
        if (status !== 200) continue;

        // Parser le XML du sitemap
        const $ = cheerio.load(body, { xmlMode: true });
        $('url > loc').each(function() {
          const loc = $(this).text().trim();
          // Garder seulement les pages produit
          if (loc && (
            (config.productUrlFilter && config.productUrlFilter(loc)) ||
            (config.productUrlPattern && config.productUrlPattern.test(loc)) ||
            (!config.productUrlPattern && !config.productUrlFilter && (loc.includes('/produit') || loc.includes('/product') || loc.includes('/p/')))
          )) {
            productUrls.add(loc);
          }
        });
        // Si c'est un sitemap index, chercher les sous-sitemaps
        $('sitemap > loc').each(function() {
          const loc = $(this).text().trim();
          if (loc) productUrls.add('SITEMAP:' + loc);
        });
        log(`  Sitemap ${sitemapPath}: ${productUrls.size} URLs`);
      } catch (err) {
        log(`  Sitemap ${sitemapPath} erreur: ${err.message}`);
      }
    }

    // Si on a trouvé des sous-sitemaps, les parser aussi
    const subSitemaps = [...productUrls].filter(u => u.startsWith('SITEMAP:'));
    for (const sub of subSitemaps) {
      productUrls.delete(sub);
      try {
        const { status, body } = await fetchHttp(sub.replace('SITEMAP:', ''));
        if (status !== 200) continue;
        const $ = cheerio.load(body, { xmlMode: true });
        $('url > loc').each(function() {
          const loc = $(this).text().trim();
          if (loc) productUrls.add(loc);
        });
        log(`  Sub-sitemap: +${productUrls.size} URLs`);
      } catch {}
    }

    // Fetcher les pages produit (limité à maxPages)
    const urls = [...productUrls].filter(u => !u.startsWith('SITEMAP:')).slice(0, maxPages * 10);
    log(`  ${urls.length} pages produit à fetcher (sur ${productUrls.size} total)`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const { status, body } = await fetchHttp(url);
        if (status !== 200 || body.length < 500) continue;

        const pageId = url.replace(config.baseUrl, '').replace(/[^a-zA-Z0-9]/g, '_');
        const file = saveRaw(supplierId, `product_${i}`, body);
        results.push({ file, url, supplier: config.name });

        if ((i + 1) % 20 === 0) log(`    ${i + 1}/${urls.length} pages fetched`);
        await new Promise(r => setTimeout(r, delayMs + Math.random() * 1000));
      } catch (err) {
        log(`  Page ${i} erreur: ${err.message}`);
      }
    }
  }

  if (config.type === 'search_api') {
    // Recherche alphabétique A-Z + 0-9 + mots-clés dentaires
    const queries = [
      ...('abcdefghijklmnopqrstuvwxyz'.split('')),
      ...'0123456789'.split(''),
      'composite', 'ciment', 'fraise', 'implant', 'prothese', 'endo',
      'detartrage', 'anesthesie', 'seringue', 'gant', 'masque',
    ];
    const filterQueries = options.queries || queries;

    for (const q of filterQueries) {
      const url = config.searchUrl + encodeURIComponent(q);
      try {
        const { status, body } = await fetchHttp(url, { json: true });
        if (status !== 200) continue;

        const file = saveRaw(supplierId, `search_${q}`, body);
        results.push({ file, url, supplier: config.name, query: q });
        log(`  Search "${q}": ${body.length} bytes`);

        await new Promise(r => setTimeout(r, delayMs + Math.random() * 1000));
      } catch (err) {
        log(`  Search "${q}" erreur: ${err.message}`);
      }
    }
  }

  log(`  Total ${config.name}: ${results.length} pages fetched`);
  return results;
}

/**
 * Fetch une seule URL et retourne le HTML brut
 */
async function fetchSinglePage(url, supplier) {
  const { status, body } = await fetchHttp(url);
  if (status !== 200) return null;

  const pageId = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_');
  const file = saveRaw(supplier || 'unknown', pageId, body);
  return { file, url, body, supplier };
}

/**
 * Liste les fichiers bruts déjà téléchargés
 */
function listRawFiles(supplierId) {
  const dir = path.join(RAW_DIR, supplierId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(dir, f));
}

module.exports = {
  SUPPLIERS,
  fetchSupplier,
  fetchSinglePage,
  listRawFiles,
  fetchHttp,
  saveRaw,
};
