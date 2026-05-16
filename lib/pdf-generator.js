// =============================================
// JADOMI — Générateur PDF Puppeteer centralisé
// Garantit : fonts embarquées, rendu stable, compatible WhatsApp/iOS/Android
// Utilisé par : Flyer Builder, Studio, tout HTML → PDF
// =============================================
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const LOCAL_PORT = process.env.PORT || 3001;
const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');

// Bloc @font-face à injecter dans tout HTML avant génération PDF
const FONT_FACE_CSS = `
@font-face{font-family:'Inter';font-style:normal;font-weight:300;src:url('/fonts/Inter-300.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:400;src:url('/fonts/Inter-400.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:500;src:url('/fonts/Inter-500.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:600;src:url('/fonts/Inter-600.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:700;src:url('/fonts/Inter-700.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:800;src:url('/fonts/Inter-800.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:900;src:url('/fonts/Inter-900.ttf') format('truetype')}
@font-face{font-family:'Playfair Display';font-style:normal;font-weight:400;src:url('/fonts/PlayfairDisplay-400.ttf') format('truetype')}
@font-face{font-family:'Playfair Display';font-style:italic;font-weight:400;src:url('/fonts/PlayfairDisplay-400i.ttf') format('truetype')}
@font-face{font-family:'Playfair Display';font-style:normal;font-weight:700;src:url('/fonts/PlayfairDisplay-700.ttf') format('truetype')}
`;

/**
 * Génère un PDF depuis une URL ou un chemin HTML
 * @param {Object} opts
 * @param {string} opts.htmlUrl - URL http(s) OU chemin absolu OU chemin relatif /studio/...
 * @param {string} opts.outputPath - Chemin absolu du PDF à écrire
 * @param {string} [opts.format='A4'] - Format page
 * @param {boolean} [opts.landscape=false]
 * @param {Object} [opts.margin] - Marges {top, right, bottom, left}
 * @param {boolean} [opts.injectFonts=true] - Injecter les @font-face locales
 * @returns {Promise<{ok: boolean, size?: number, error?: string}>}
 */
async function generatePDF(opts) {
  const {
    htmlUrl,
    outputPath,
    format = 'A4',
    landscape = false,
    margin = { top: 0, right: 0, bottom: 0, left: 0 },
    injectFonts = true
  } = opts;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--font-render-hinting=none']
    });
    const page = await browser.newPage();

    // Résoudre l'URL — toujours passer par HTTP pour que les @font-face locales marchent
    let fullUrl;
    if (htmlUrl.startsWith('http')) {
      fullUrl = htmlUrl;
    } else if (htmlUrl.startsWith('/home/') || htmlUrl.startsWith('/tmp/')) {
      // Chemin absolu du serveur → convertir en URL locale
      const relativePath = htmlUrl.includes('/public/')
        ? htmlUrl.replace(/^.*\/public\//, '/')
        : htmlUrl;
      fullUrl = `http://localhost:${LOCAL_PORT}${relativePath}`;
    } else {
      // Chemin relatif type /studio/...
      fullUrl = `http://localhost:${LOCAL_PORT}${htmlUrl}`;
    }

    await page.goto(fullUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Injecter les @font-face locales si pas déjà dans le HTML
    if (injectFonts) {
      await page.addStyleTag({ content: FONT_FACE_CSS });
    }

    // Attendre que TOUTES les polices soient chargées
    await page.evaluate(() => document.fonts.ready);
    // Délai supplémentaire pour le rendu final
    await new Promise(r => setTimeout(r, 500));

    await page.pdf({
      path: outputPath,
      format,
      landscape,
      printBackground: true,
      margin
    });

    await browser.close();
    const size = fs.statSync(outputPath).size;
    return { ok: true, size };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return { ok: false, error: e.message };
  }
}

/**
 * Génère un PDF depuis du HTML brut (string)
 * @param {Object} opts
 * @param {string} opts.html - Code HTML complet
 * @param {string} opts.outputPath - Chemin absolu du PDF
 * @param {string} [opts.format='A4']
 * @param {boolean} [opts.landscape=false]
 * @param {Object} [opts.margin]
 * @returns {Promise<{ok: boolean, size?: number, error?: string}>}
 */
async function generatePDFFromHTML(opts) {
  const {
    html,
    outputPath,
    format = 'A4',
    landscape = false,
    margin = { top: 0, right: 0, bottom: 0, left: 0 }
  } = opts;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--font-render-hinting=none']
    });
    const page = await browser.newPage();

    // Injecter le CSS fonts dans le HTML
    const htmlWithFonts = html.replace('</head>', `<style>${FONT_FACE_CSS}</style></head>`);
    await page.setContent(htmlWithFonts, { waitUntil: 'networkidle0', timeout: 30000 });

    // Attendre les polices
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 500));

    await page.pdf({
      path: outputPath,
      format,
      landscape,
      printBackground: true,
      margin
    });

    await browser.close();
    const size = fs.statSync(outputPath).size;
    return { ok: true, size };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return { ok: false, error: e.message };
  }
}

module.exports = { generatePDF, generatePDFFromHTML, FONT_FACE_CSS };
