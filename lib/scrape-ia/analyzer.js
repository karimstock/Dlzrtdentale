// =============================================
// JADOMI — IA ANALYZER pour scraping
//
// Cerveau IA qui analyse le HTML brut et extrait
// les produits structurés. Zéro sélecteur CSS.
//
// Priorité : Gemini Flash 2.0 (gratuit) → Mistral API (0.13€/M) → Ollama (gratuit)
// =============================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
const http = require('http');
const fs = require('fs');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
const OLLAMA_URL = 'http://127.0.0.1:11434';
// Qwen3.6 35B-A3B (MoE) — 20 tok/s local, think:false obligatoire (modèle thinking)
const OLLAMA_MODEL = 'qwen3.6:35b-a3b';

const LOG_FILE = '/tmp/scrape-ia-analyzer.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// PROMPT EXTRACTION PRODUITS
// =============================================

const EXTRACT_PROMPT = `Tu es un extracteur de données produits dentaires.
À partir du HTML brut d'une page fournisseur dentaire, extrais TOUS les produits visibles.

RÈGLES CRITIQUES :
1. Le prix doit être le prix REMISÉ/FINAL (le plus bas affiché), PAS le prix barré/catalogue
2. Si tu vois un prix barré + un prix actuel → le prix actuel est le bon
3. Le prix doit être HT (hors taxes) si indiqué
4. La référence fabricant est souvent "Réf", "SKU", "Code", "Art."
5. Normalise le nom : retire les caractères parasites, garde marque + désignation + conditionnement
6. Si plusieurs variantes/conditionnements → un produit par variante

Retourne UNIQUEMENT un JSON valide (tableau), sans markdown, sans explication :
[
  {
    "name": "Nom normalisé du produit",
    "ref": "Référence fabricant ou fournisseur",
    "price": 42.50,
    "price_original": 55.00,
    "brand": "Marque",
    "packaging": "Conditionnement (ex: boîte de 50, seringue 4g)",
    "image_url": "URL complète de l'image produit",
    "category": "Catégorie détectée"
  }
]

Si aucun produit trouvé, retourne [].
Si le prix n'est pas visible, mets null.`;

// =============================================
// PROMPT CROSS-MATCHING
// =============================================

const MATCH_PROMPT = `Tu es un expert en matching de produits dentaires.
Compare les deux produits suivants et détermine s'il s'agit du MÊME produit vendu par des fournisseurs différents.

Critères de matching :
- Même marque (ou marque connue comme synonyme)
- Même désignation produit (noms peuvent varier : français/anglais, abrégé/complet)
- Même conditionnement (ou compatible)
- La référence fabricant est le critère le plus fiable si disponible

Retourne UNIQUEMENT un JSON :
{
  "match": true/false,
  "confidence": 0.0-1.0,
  "reason": "explication courte"
}`;

// =============================================
// GEMINI FLASH (gratuit, 15 RPM)
// =============================================

let geminiModel = null;
let geminiCallCount = 0;
let geminiWindowStart = Date.now();

function getGeminiModel() {
  if (!GEMINI_KEY) return null;
  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return geminiModel;
}

async function rateLimitGemini() {
  const now = Date.now();
  if (now - geminiWindowStart > 60000) {
    geminiCallCount = 0;
    geminiWindowStart = now;
  }
  if (geminiCallCount >= 14) { // marge sous les 15 RPM
    const wait = 60000 - (now - geminiWindowStart) + 1000;
    log(`  ⏳ Rate limit Gemini — pause ${Math.round(wait / 1000)}s`);
    await new Promise(r => setTimeout(r, wait));
    geminiCallCount = 0;
    geminiWindowStart = Date.now();
  }
  geminiCallCount++;
}

async function callGemini(prompt, content) {
  const model = getGeminiModel();
  if (!model) return null;

  await rateLimitGemini();

  try {
    const result = await model.generateContent([
      { text: prompt },
      { text: content },
    ]);
    const text = result.response.text();
    return text;
  } catch (err) {
    log(`  Gemini error: ${err.message}`);
    return null;
  }
}

// =============================================
// DEEPSEEK V3 (0.27$/M input — le moins cher du marché)
// =============================================

async function callDeepSeek(prompt, content) {
  if (!DEEPSEEK_KEY) return null;

  // DATA GUARD : ne JAMAIS envoyer de prix/refs réels à DeepSeek
  const { sanitizeForExternalAPI } = require('../ai-studio/data-guard');
  const guardPrompt = sanitizeForExternalAPI(prompt, 'deepseek');
  const guardContent = sanitizeForExternalAPI(content, 'deepseek');
  if (guardPrompt.blocked || guardContent.blocked) {
    log('  [DATA-GUARD] Contenu sensible bloqué pour DeepSeek — fallback Ollama');
    return null; // Retourne null → le caller utilisera le fallback
  }

  const payload = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: guardPrompt.cleaned },
      { role: 'user', content: guardContent.cleaned },
    ],
    temperature: 0.1,
    max_tokens: 8000,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.message?.content) {
            const content = parsed.choices[0].message.content;
            log(`  DeepSeek réponse (${content.length} chars)`);
            resolve(content);
          } else if (parsed.error) {
            log(`  DeepSeek erreur: ${parsed.error.message || JSON.stringify(parsed.error)}`);
            resolve(null);
          } else {
            log(`  DeepSeek réponse inattendue: ${data.substring(0, 200)}`);
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', (err) => { log(`  DeepSeek error: ${err.message}`); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

// =============================================
// MISTRAL API FALLBACK (0.13€/M tokens — quasi gratuit)
// =============================================

async function callMistral(prompt, content, retries = 2) {
  if (!MISTRAL_KEY) return null;

  const wrappedPrompt = prompt + '\n\nIMPORTANT: Retourne un objet JSON avec une clé "products" contenant le tableau. Ex: {"products": [...]}';

  const payload = JSON.stringify({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: wrappedPrompt },
      { role: 'user', content: content },
    ],
    temperature: 0.1,
    max_tokens: 8000,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_KEY}`,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.message?.content) {
            const content = parsed.choices[0].message.content;
            log(`  Mistral réponse (${content.length} chars): ${content.substring(0, 200)}`);
            resolve(content);
          } else if (parsed.message && parsed.message.includes('capacity exceeded') && retries > 0) {
            log(`  Mistral quota atteint — pause 65s puis retry (${retries} restants)...`);
            setTimeout(async () => {
              const result = await callMistral(prompt, content, retries - 1);
              resolve(result);
            }, 65000);
            return;
          } else if (parsed.message) {
            log(`  Mistral API erreur: ${parsed.message}`);
            resolve(null);
          } else {
            log(`  Mistral API réponse inattendue: ${data.substring(0, 300)}`);
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', (err) => { log(`  Mistral API error: ${err.message}`); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

// =============================================
// OLLAMA FALLBACK (gratuit, local, lent)
// =============================================

async function callOllama(prompt, content) {
  // Ollama a un contexte limité — on envoie max 12000 chars de HTML nettoyé
  const truncated = content.substring(0, 12000);
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: '--- HTML PAGE ---\n' + truncated },
      ],
      stream: false,
      // Modèle thinking : sans ce flag, il raisonne 2000+ tokens avant de répondre
      think: false,
      options: { temperature: 0.1, num_predict: 4000 },
    });

    const req = http.request({
      hostname: '127.0.0.1', port: 11434,
      path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.message?.content || parsed.response || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', (err) => { log(`  Ollama error: ${err.message}`); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload);
  });
}

// =============================================
// EXTRACTION JSON DEPUIS REPONSE IA
// =============================================

function extractJSON(text) {
  if (!text) return null;

  // Tenter le texte brut d'abord
  try {
    const parsed = JSON.parse(text);
    // Si c'est un objet avec une clé "products" (format Mistral json_object)
    if (parsed && parsed.products && Array.isArray(parsed.products)) return parsed.products;
    if (Array.isArray(parsed)) return parsed;
    return parsed;
  } catch {}

  // Chercher un tableau JSON dans la réponse
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  // Chercher un objet JSON
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed.products && Array.isArray(parsed.products)) return parsed.products;
      return parsed;
    } catch {}
  }
  return null;
}

// =============================================
// API PUBLIQUE
// =============================================

/**
 * Analyse du HTML brut et extraction des produits
 * @param {string} html - HTML brut de la page
 * @param {string} supplier - Nom du fournisseur (pour contexte)
 * @param {string} pageUrl - URL source (pour les URLs relatives)
 * @returns {Array} Produits extraits
 */
async function analyzeProducts(html, supplier, pageUrl) {
  // Détection JSON (APIs type DoctorStrong/Venta)
  const trimmed = html.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return analyzeJSON(trimmed, supplier, pageUrl);
  }

  // =============================================
  // PHASE 1 : Cheerio pré-traite le HTML (0 token, 0 coût)
  // =============================================
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('script, style, svg, nav, noscript, iframe').remove();

  const blocks = [];
  const seen = new Set();

  // STRATÉGIE A : Détection product-box (Shopware, Magento, PrestaShop, WooCommerce)
  const productBoxSelectors = [
    '[class*="product-box"]', '[class*="product-item"]', '[class*="product-card"]',
    '[class*="product_item"]', '[class*="product-miniature"]', '.product',
    'li.item', '[class*="listing-box"]',
  ];
  let $products = $([]);
  for (const sel of productBoxSelectors) {
    const found = $(sel);
    if (found.length >= 3) { $products = found; break; }
  }

  if ($products.length >= 3) {
    // Extraction structurée par product-box
    $products.each(function() {
      const el = $(this);
      // Nom : essayer plusieurs patterns BEM
      const name = el.find('[class*="product-box__name"], [class*="product--title"], [class*="product-name"], .product-title, h2 a, h3 a').first().text().trim()
        || el.find('[class*="product-box__link"], a[title]').first().attr('title') || '';
      if (!name || name.length < 3) return;
      if (seen.has(name)) return;
      seen.add(name);

      const brand = el.find('[class*="brand"], [class*="marque"], [class*="manufacturer"]').first().text().trim();
      const priceText = el.find('[class*="price--net"], [class*="price-amount"], [class*="product-price"], .price').first().text().trim();
      const priceMatch = priceText.match(/(\d+[.,]\d{2})/);
      const img = el.find('img').first().attr('src') || el.find('img').first().attr('data-src') || '';
      const link = el.find('a[href]').first().attr('href') || '';
      const packaging = el.find('[class*="packaging"], [class*="conditionnement"], [class*="unit"]').first().text().trim();

      blocks.push(`[${brand}] ${name} | ${priceMatch ? priceMatch[1] + '€' : 'prix?'} | ${packaging} | img:${img} | url:${link}`);
    });
    log(`  Cheerio: ${blocks.length} product-box détectés (stratégie A)`);
  }

  // STRATÉGIE B : Zone après "Trier" + liens <a> avec prix (DGD style)
  if (blocks.length < 3) {
    const bodyHtml = $('body').html() || '';
    const sortMatch = bodyHtml.match(/value=['"]trier['"]|Trier\s*:|sortby|sort-by|Sortieren/i);
    const sortPos = sortMatch ? sortMatch.index : 0;
    const zoneHtml = sortPos > 0 ? bodyHtml.substring(sortPos) : bodyHtml;
    const $zone = cheerio.load('<div>' + zoneHtml + '</div>');

    $zone('a[href]').each(function() {
      const el = $zone(this);
      const text = el.text().replace(/\s+/g, ' ').trim();
      if (!text.match(/\d+[.,]\d{2}\s*€/) || text.length > 500 || text.length < 5) return;
      const key = text.substring(0, 60);
      if (seen.has(key)) return;
      seen.add(key);
      const img = el.find('img').first().attr('src') || '';
      const href = el.attr('href') || '';
      blocks.push(`${text.substring(0, 150)}|img:${img}|url:${href}`);
    });
    if (blocks.length >= 3) log(`  Cheerio: ${blocks.length} blocs (stratégie B — zone Trier)`);
  }

  // STRATÉGIE C : Fallback texte brut de toute la page
  let contentForIA;
  if (blocks.length >= 3) {
    contentForIA = blocks.join('\n').substring(0, 5000);
  } else {
    const fullText = $('body').text().replace(/\s+/g, ' ').trim();
    const sortIdx = fullText.search(/Trier|sort|Sortieren/i);
    contentForIA = (sortIdx > 0 ? fullText.substring(sortIdx) : fullText).substring(0, 5000);
    log(`  Cheerio: fallback texte brut (stratégie C), ${contentForIA.length} chars`);
  }

  log(`  → ${contentForIA.length} chars envoyés (~${Math.round(contentForIA.length / 4)} tokens)`);

  const contextPrompt = EXTRACT_PROMPT + `\n\nFournisseur: ${supplier}\nURL: ${pageUrl}`;

  // =============================================
  // PHASE 2 : IA normalise (tokens réduits de 80%)
  // =============================================
  let response = await callGemini(contextPrompt, contentForIA);
  let source = 'gemini';

  if (!response) {
    log(`  Gemini indispo → DeepSeek...`);
    response = await callDeepSeek(contextPrompt, contentForIA);
    source = 'deepseek';
  }

  if (!response) {
    log(`  DeepSeek indispo → Mistral...`);
    response = await callMistral(contextPrompt, contentForIA);
    source = 'mistral';
  }

  if (!response) {
    log(`  Mistral indispo → Ollama...`);
    response = await callOllama(contextPrompt, contentForIA.substring(0, 4000));
    source = 'ollama';
  }

  if (!response) {
    log(`  Aucune IA disponible pour analyser ${pageUrl}`);
    return [];
  }

  const products = extractJSON(response);
  if (!products || !Array.isArray(products)) {
    log(`  Réponse IA non parsable (${source}): ${(response || '').substring(0, 200)}`);
    return [];
  }

  // Post-traitement : valider et enrichir
  return products
    .filter(p => p && p.name && p.name.length > 2)
    .map(p => ({
      name: (p.name || '').trim().substring(0, 255),
      ref: (p.ref || '').trim(),
      price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || null,
      price_original: typeof p.price_original === 'number' ? p.price_original : parseFloat(p.price_original) || null,
      brand: (p.brand || '').trim(),
      packaging: (p.packaging || '').trim(),
      image_url: resolveUrl(p.image_url, pageUrl),
      category: (p.category || '').trim(),
      supplier,
      source_url: pageUrl,
      analyzed_by: source,
      analyzed_at: new Date().toISOString(),
    }));
}

/**
 * Compare deux produits pour déterminer s'ils sont identiques
 * @param {Object} productA - Produit fournisseur A
 * @param {Object} productB - Produit fournisseur B
 * @returns {Object} { match, confidence, reason }
 */
async function matchProducts(productA, productB) {
  const content = `PRODUIT A (${productA.supplier}):\n` +
    `  Nom: ${productA.name}\n` +
    `  Réf: ${productA.ref}\n` +
    `  Marque: ${productA.brand}\n` +
    `  Conditionnement: ${productA.packaging}\n` +
    `  Prix: ${productA.price}€\n\n` +
    `PRODUIT B (${productB.supplier}):\n` +
    `  Nom: ${productB.name}\n` +
    `  Réf: ${productB.ref}\n` +
    `  Marque: ${productB.brand}\n` +
    `  Conditionnement: ${productB.packaging}\n` +
    `  Prix: ${productB.price}€`;

  let response = await callGemini(MATCH_PROMPT, content);
  if (!response) response = await callOllama(MATCH_PROMPT, content);

  const result = extractJSON(response);
  if (!result) return { match: false, confidence: 0, reason: 'IA indisponible' };

  return {
    match: !!result.match,
    confidence: parseFloat(result.confidence) || 0,
    reason: result.reason || '',
  };
}

/**
 * Matching par batch — compare un produit contre une liste de candidats
 * Utilise un prompt groupé pour économiser les appels IA
 */
async function matchProductBatch(product, candidates) {
  if (candidates.length === 0) return [];

  // Grouper par paquets de 10 pour un seul appel IA
  const batchSize = 10;
  const results = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const content = `PRODUIT RÉFÉRENCE (${product.supplier}):\n` +
      `  Nom: ${product.name}\n  Réf: ${product.ref}\n  Marque: ${product.brand}\n  Conditionnement: ${product.packaging}\n\n` +
      `CANDIDATS À COMPARER :\n` +
      batch.map((c, idx) => `${idx + 1}. [${c.supplier}] ${c.name} | Réf: ${c.ref} | Marque: ${c.brand} | ${c.packaging} | ${c.price}€`).join('\n');

    const batchPrompt = `Tu es un expert en matching de produits dentaires.
Compare le PRODUIT RÉFÉRENCE avec chaque CANDIDAT. Détermine lesquels sont le MÊME produit.

Retourne UNIQUEMENT un JSON (tableau) :
[
  { "index": 1, "match": true/false, "confidence": 0.0-1.0, "reason": "..." }
]`;

    let response = await callGemini(batchPrompt, content);
    if (!response) response = await callOllama(batchPrompt, content);

    const parsed = extractJSON(response);
    if (parsed && Array.isArray(parsed)) {
      for (const r of parsed) {
        const idx = (r.index || 1) - 1;
        if (batch[idx] && r.match && r.confidence >= 0.7) {
          results.push({
            candidate: batch[idx],
            confidence: r.confidence,
            reason: r.reason,
          });
        }
      }
    }
  }

  return results;
}

// =============================================
// UTILS
// =============================================

/**
 * Analyse du JSON brut d'une API (DoctorStrong, Venta, Algolia, etc.)
 * L'IA comprend la structure JSON et extrait les produits
 */
async function analyzeJSON(json, supplier, pageUrl) {
  let data;
  try { data = JSON.parse(json); } catch { return []; }

  // Tronquer les gros JSON — garder les 15K premiers chars pour l'IA
  const jsonStr = JSON.stringify(data, null, 0).substring(0, 15000);

  const jsonPrompt = `Tu es un extracteur de données produits dentaires.
À partir de ce JSON brut d'une API fournisseur, extrais TOUS les produits.

RÈGLES :
1. Cherche les champs de type nom/name/title/label pour le nom produit
2. Cherche price/prix/final_price/special_price pour le prix — prends le prix le plus bas (remisé)
3. Cherche sku/ref/reference/code pour la référence
4. Cherche brand/marque/manufacturer pour la marque
5. Cherche image/thumbnail/photo pour l'URL image
6. Si le JSON contient des "children" ou "variants", crée un produit par variante

Retourne un objet JSON : {"products": [{...}]}
Chaque produit : name, ref, price, price_original, brand, packaging, image_url, category

Fournisseur: ${supplier}
URL: ${pageUrl}`;

  let response = await callGemini(jsonPrompt, jsonStr);
  let source = 'gemini';

  if (!response) {
    log(`  Gemini indisponible, fallback DeepSeek...`);
    response = await callDeepSeek(jsonPrompt, jsonStr);
    source = 'deepseek';
  }

  if (!response) {
    log(`  DeepSeek indisponible, fallback Mistral API...`);
    response = await callMistral(jsonPrompt, jsonStr);
    source = 'mistral';
  }

  if (!response) {
    log(`  Mistral indisponible, fallback Ollama local...`);
    response = await callOllama(jsonPrompt, jsonStr.substring(0, 6000));
    source = 'ollama';
  }

  if (!response) {
    log(`  Aucune IA disponible pour analyser JSON ${pageUrl}`);
    return [];
  }

  const products = extractJSON(response);
  if (!products || !Array.isArray(products)) {
    log(`  Réponse IA non parsable (${source}): ${(response || '').substring(0, 200)}`);
    return [];
  }

  return products
    .filter(p => p && p.name && p.name.length > 2)
    .map(p => ({
      name: (p.name || '').trim().substring(0, 255),
      ref: (p.ref || '').trim(),
      price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || null,
      price_original: typeof p.price_original === 'number' ? p.price_original : parseFloat(p.price_original) || null,
      brand: (p.brand || '').trim(),
      packaging: (p.packaging || '').trim(),
      image_url: resolveUrl(p.image_url, pageUrl),
      category: (p.category || '').trim(),
      supplier,
      source_url: pageUrl,
      analyzed_by: source,
      analyzed_at: new Date().toISOString(),
    }));
}

/**
 * Trouve le début de la zone produits/prix dans le HTML
 * Les pages catégories ont souvent 50-100K de header/menu avant les produits
 */
function findPriceZone(html) {
  // D'abord chercher la zone de listing catégorie (après le tri/filtre)
  // Ça évite le bloc "meilleures ventes" commun à toutes les catégories
  const categoryMarkers = [
    /value='trier'>Trier/i,
    /class="?category.?listing/i,
    /class="?products?.?grid/i,
    /id="?product.?list/i,
    /class="?catalog.?listing/i,
    /class="?search.?results/i,
    /sortby|sort-by|tri.*select/i,
  ];
  for (const marker of categoryMarkers) {
    const match = html.match(marker);
    if (match) return match.index;
  }

  // Fallback : chercher les premiers prix/produits
  const priceMarkers = [
    /gamme_prix/i, /article_prix/i, /prix/i, /price/i, /€/,
    /product-item/i, /product-price/i, /data-price/i, /price-box/i,
    /product-miniature/i,
  ];
  let earliest = html.length;
  for (const marker of priceMarkers) {
    const match = html.match(marker);
    if (match && match.index < earliest) {
      earliest = match.index;
    }
  }
  return earliest < html.length ? earliest : 0;
}

function resolveUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  try {
    const base = new URL(baseUrl);
    if (url.startsWith('/')) return base.origin + url;
    return base.origin + '/' + url;
  } catch {
    return url;
  }
}

module.exports = {
  analyzeProducts,
  matchProducts,
  matchProductBatch,
};
