/**
 * JADOMI — Scan Dashboard API
 * Upload PDF flyers, parse products/prices, manage promos & paliers,
 * monitor scraper status.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const https = require('https');
const FLYERS_DIR = path.join(__dirname, '..', 'uploads', 'flyers');
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// =========================================================
// Analyse image via DeepSeek (OCR + extraction produits)
// =========================================================
async function analyzeImageWithIA(filePath, mimetype) {
  if (!DEEPSEEK_KEY) return { text: 'DeepSeek non configuré', products: [] };

  // Convertir l'image en base64
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${base64}`;

  const prompt = `Tu es un extracteur de données de catalogue dentaire. Analyse cette image et extrais :
1. Tout le texte visible (noms de produits, références, prix, specs)
2. Pour chaque produit identifiable, retourne : name, ref, price, brand

Retourne un JSON : {"text": "tout le texte visible", "products": [{"name":"...","ref":"...","price":0,"brand":"..."}]}`;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: [
          { type: 'text', text: 'Analyse cette image de catalogue/flyer dentaire :' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]}
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      timeout: 30000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          const content = parsed.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            resolve({ text: content, products: [] });
          }
        } catch {
          resolve({ text: 'Erreur analyse IA', products: [] });
        }
      });
    });
    req.on('error', () => resolve({ text: 'Erreur connexion IA', products: [] }));
    req.end(payload);
  });
}

// Ensure directory exists
if (!fs.existsSync(FLYERS_DIR)) {
  fs.mkdirSync(FLYERS_DIR, { recursive: true });
}

// Multer config — accept only PDF
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FLYERS_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 800 * 1024 * 1024 }, // 800 MB — gros catalogues Henry Schein, MegaDental, etc.
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
      'application/vnd.ms-powerpoint', // ppt
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', // vidéos
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', // audio
      'application/x-rar-compressed', 'application/vnd.rar', // rar
      'application/zip', 'application/x-zip-compressed', // zip
      'application/x-7z-compressed', // 7z
      'application/octet-stream', // fichiers binaires génériques
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formats : PDF, JPG, PNG, WebP, PPTX, PPT, MP4, WebM, MOV, AVI, MKV, MP3, WAV, RAR, ZIP, 7Z, XLSX, CSV, DOCX'));
  }
});

// Metadata file — stores brand & docType for each uploaded file
const META_FILE = path.join(FLYERS_DIR, '_metadata.json');

// Parse jobs — track async parsing progress in memory
const parseJobs = {}; // filename => { status, progress, pages, products, error }
const parseQueue = []; // Queue for sequential parsing (avoid RAM explosion)
let parseRunning = false;

function loadMeta() {
  if (fs.existsSync(META_FILE)) {
    try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
    catch (e) {}
  }
  return {};
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// =========================================================
// AUTO-DETECT brand + docType from filename + PDF content
// =========================================================
const BRAND_SIGNATURES = [
  { brand: 'GACD',                 patterns: [/gacd/i, /gacd\.fr/i] },
  { brand: 'Henry Schein',         patterns: [/henry\s*schein/i, /schein/i] },
  { brand: 'Dental Promotion (DPI)', patterns: [/dental\s*promotion/i, /\bdpi\b/i, /septaline/i, /dentalpromotion/i] },
  { brand: 'DoctorAI',             patterns: [/doctor[\s-]*ai/i, /doctor-ai/i, /docteur[\s-]*ai/i] },
  { brand: 'DoctorStrong',         patterns: [/doctor[\s-]*strong/i] },
  { brand: 'MegaDental',           patterns: [/mega[\s-]*dental/i] },
  { brand: 'DentalGoodDeal',       patterns: [/dental[\s-]*good[\s-]*deal/i, /\bdgd\b/i] },
  { brand: 'B2B-Dental',           patterns: [/b2b[\s-]*dental/i] },
  { brand: 'DentalRee',            patterns: [/dental[\s-]*ree/i] },
  { brand: 'DentalPrivé',          patterns: [/dental[\s-]*priv[eé]/i] },
  { brand: 'DentAlachat',          patterns: [/dent[\s-]*al[\s-]*achat/i, /dentalachat/i] },
  { brand: 'Go-Dentaire',          patterns: [/go[\s-]*dentaire/i] },
  { brand: 'DentalEvolution',      patterns: [/dental[\s-]*evolution/i] },
  { brand: 'Dental-France',        patterns: [/dental[\s-]*france/i] },
  { brand: 'TopDentaire',          patterns: [/top[\s-]*dentaire/i] },
  { brand: 'Kerr',                 patterns: [/\bkerr\b/i, /kerr\s*dental/i] },
  { brand: 'Dentsply Sirona',      patterns: [/dentsply/i, /sirona/i, /maillefer/i] },
  { brand: 'Ivoclar',              patterns: [/ivoclar/i, /vivadent/i] },
  { brand: 'GC',                   patterns: [/\bgc\s+dental/i, /\bgc\s+europe/i, /\bgc\s+corporation/i] },
  { brand: 'Voco',                 patterns: [/\bvoco\b/i] },
  { brand: 'Coltène',              patterns: [/colt[eè]ne/i] },
  { brand: '3M',                   patterns: [/\b3m\b/i, /solventum/i] },
  { brand: 'Hu-Friedy',            patterns: [/hu[\s-]*friedy/i] },
  { brand: 'Septodont',            patterns: [/septodont/i] },
  { brand: 'Acteon',               patterns: [/acteon/i, /satelec/i] },
  { brand: 'NSK',                  patterns: [/\bnsk\b/i] },
  { brand: 'Bien-Air',             patterns: [/bien[\s-]*air/i] },
  { brand: 'Kulzer',               patterns: [/kulzer/i, /heraeus/i] },
  { brand: 'Ultradent',            patterns: [/ultradent/i] },
  { brand: 'Zhermack',             patterns: [/zhermack/i] },
  { brand: 'Ortho-Force',          patterns: [/ortho[\s-]*force/i] },
  { brand: 'Osstem',               patterns: [/osstem/i] },
  { brand: 'Straumann',            patterns: [/straumann/i] },
  { brand: 'Nobel Biocare',        patterns: [/nobel[\s-]*biocare/i] },
];

function detectBrand(filename, textContent) {
  const combined = (filename + ' ' + (textContent || '').substring(0, 5000)).toLowerCase();

  for (const sig of BRAND_SIGNATURES) {
    for (const pattern of sig.patterns) {
      if (pattern.test(combined)) return sig.brand;
    }
  }
  return null;
}

function detectDocType(filename, textContent) {
  const combined = (filename + ' ' + (textContent || '').substring(0, 3000)).toLowerCase();
  if (/facture|invoice|n°\s*\d{4,}|montant\s*ttc|total\s*ttc/i.test(combined)) return 'facture';
  if (/catalogue|catalog|gamme\s*compl[eè]te|tarif\s*g[eé]n[eé]ral/i.test(combined)) return 'catalogue';
  if (/newsletter|email|offre\s*du\s*mois|e-?mail/i.test(combined)) return 'email';
  return 'flyer'; // default = promo
}

// =========================================================
// POST /upload — Upload & parse a PDF flyer
// =========================================================
// --- Extract products from parsed PDF text (multi-format) ---
function extractProducts(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const products = [];

  // --- Shared patterns ---
  // Match ref formats:
  // MegaDental: "réf. 2731-177", GACD: "Réf. 221-011"
  // DPI/Septaline: "33I.852-N", "33R.205", "33I.0600-2", "33D.xxx"
  const refLineRe = /[Rr][ée]f\.?\s*([\w]+-[\w]+)/;
  // DPI refs: "33I.852-N" (Septaline) + "01.3700T", "82.132128", "22.144-0012" (marques)
  // Note: 33X refs can be glued to text: "Septafresh citron 50 ml33D.2050"
  const dpiRefRe = /(33[A-Z]\.[A-Za-z0-9\/.-]+)/;
  const dpiSupplierRefRe = /\b(\d{2}\.[A-Za-z0-9]{3,}[A-Za-z0-9\/._-]*)/;
  const fabricantRe = /Fabricant\s*:\s*([A-Za-zÀ-ü0-9 .''&+-]+)/i;
  const classeRe = /Classe\s+(I{1,3}[ab]?)/i;
  const condRe = /(?:sachet|boîte|lot|colis|coffret|kit|flacon|tube|seringue|cartouche|recharge|maxi boîte)\s+(?:de\s+)?(\d+[^,\n]{0,40})/i;
  const junkRe = /Commandez|gacd\.fr|megadental\.fr|Sécurité Sociale|BAT\.indd|Lisez attentivement|pages? intérieure|Garantie inconditionnelle|Dispositifs médicaux pour soins|Organisme notifi|se référer aux CGV/i;

  // Price regex: handles "99,60€ 31,50€" AND "2,50€1,75€" (no space!) AND "99,60€  31,50€"
  const allPricesRe = /(\d[\d\s]*[.,]\d{2})\s*€/g;

  let currentProduct = null;
  let currentBrand = null;
  let currentFabricant = null;
  let currentClasse = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip junk lines
    if (junkRe.test(line)) continue;

    // === SPLIT PRICES: "13\n€50" or "54\n€" on next line → merge into current ref ===
    // If line is just "€XX" or "€", attach price to the previous ref-bearing product
    if (/^€\d{0,2}$/.test(line) && products.length > 0) {
      const lastProd = products[products.length - 1];
      if (lastProd && lastProd._pendingPrice != null) {
        const cents = line.replace('€', '');
        const fullPrice = cents ? lastProd._pendingPrice + parseFloat('0.' + cents.padEnd(2, '0')) : lastProd._pendingPrice;
        if (!lastProd.prixPromo) lastProd.prixPromo = fullPrice;
        else if (!lastProd.prixCatalogue) { lastProd.prixCatalogue = lastProd.prixPromo; lastProd.prixPromo = fullPrice; }
        delete lastProd._pendingPrice;
        if (lastProd.prixCatalogue && lastProd.prixPromo) {
          lastProd.remise = Math.round((1 - lastProd.prixPromo / lastProd.prixCatalogue) * 100) + '%';
        }
      }
      continue;
    }

    // === GACD FORMAT: line == "|" → product before, brand after ===
    if (line === '|' && i > 0 && i < lines.length - 1) {
      const brandLine = lines[i + 1].trim();
      let nameParts = [];
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        const prev = lines[j].trim();
        if (!prev || prev === '|' || refLineRe.test(prev) || fabricantRe.test(prev)
            || classeRe.test(prev) || junkRe.test(prev) || /^\d+$/.test(prev)
            || /€/.test(prev) || prev.length > 80) break;
        nameParts.unshift(prev);
      }
      if (nameParts.length > 0 && brandLine.length < 50 && !/€|[Rr][ée]f/i.test(brandLine)) {
        currentProduct = nameParts.join(' ').replace(/\*+$/, '').trim();
        currentBrand = brandLine.replace(/\*+$/, '').trim();
        currentFabricant = null; currentClasse = null;
        i++; continue;
      }
    }

    // Detect fabricant
    const fabMatch = line.match(fabricantRe);
    if (fabMatch) currentFabricant = fabMatch[1].replace(/\.+$/, '').trim();

    // Detect classe
    const clasMatch = line.match(classeRe);
    if (clasMatch) currentClasse = clasMatch[1];

    // === DETECT PRODUCT NAMES (MegaDental: all-caps product titles) ===
    // A line that is mostly uppercase text, no price, no ref = likely a product name
    if (line.length > 4 && line.length < 100 && !/€|[Rr][ée]f\.?\s*\d/.test(line) && !/^\d+$/.test(line)) {
      const upperRatio = (line.replace(/[^A-ZÀ-Ü]/g, '').length) / line.replace(/\s/g, '').length;
      if (upperRatio > 0.7 && !/^(OFFRE|MEGA|SEULEMENT|NOUVEAU|PENSEZ|POURQUOI|CUMULEZ|INCROYABLE|PRIX|SHOP|SALE|BUY|NOW|OFF|NEW)/.test(line)) {
        currentProduct = line.replace(/\*+$/, '').trim();
        continue;
      }
    }

    // === SUB-REFERENCES: all lines containing XXXX-XXX pattern but no "réf." keyword ===
    // Handles: concatenated "1884-1911885-191", color "● 7823-177 ● 7827-177",
    // size "XS 5/66545-794", standalone "2635-010"
    if (/\d{4}-\d{2,3}/.test(line) && !/[Rr][ée]f/i.test(line) && !/€/.test(line) && !junkRe.test(line)) {
      const subRefs = line.match(/\d{4}-\d{2,3}/g) || [];
      if (subRefs.length > 0) {
        // Try to extract variant info (size, color) from this line
        const variantText = line.replace(/\d{4}-\d{2,3}/g, '|').replace(/●+/g, '●');
        const variants = variantText.split('|').map(v => v.trim()).filter(v => v && v !== '●' && v !== '-');

        for (let si = 0; si < subRefs.length; si++) {
          const variant = variants[si] || variants[0] || '';
          // Clean variant: "XS 5/6" → "XS 5/6", "● Menthe" → "Menthe", "●●" → ""
          const cleanVariant = variant.replace(/^●+\s*/, '').replace(/\s*●+$/, '').trim();
          products.push({
            product: currentProduct || 'Produit non identifié',
            brand: currentBrand || null,
            fabricant: currentFabricant || null,
            classe: currentClasse || null,
            ref: subRefs[si],
            description: cleanVariant ? (currentProduct || '') + ' — ' + cleanVariant : null,
            conditionnement: null,
            prixCatalogue: null, prixPromo: null, remise: null,
            raw: line.substring(0, 400),
            isSubRef: true
          });
        }
        continue;
      }
    }

    // === DPI REFERENCES: "33I.852-N", "33R.205", "Septafresh citron 50 ml33D.2050" ===
    const dpiMatch = line.match(dpiRefRe);
    if (dpiMatch && !refLineRe.test(line) && !/dentalpromotion|www\.|http/i.test(line)) {
      const dpiRef = dpiMatch[1];
      // Extract prices on the same line or nearby
      const priceZoneDpi = line.substring(line.indexOf(dpiRef) + dpiRef.length).replace(/€(\d)/g, '€ $1');
      const pricesDpi = [];
      let dpm;
      const dpiPriceRe = /(\d[\d\s]*(?:[.,]\d{1,2})?)\s*€/g;
      while ((dpm = dpiPriceRe.exec(priceZoneDpi)) !== null) {
        const val = parseFloat(dpm[1].replace(/\s/g, '').replace(',', '.'));
        if (val > 0 && val < 50000) pricesDpi.push(val);
      }

      // Description: text before or after the ref
      let dpiDesc = line.replace(dpiRefRe, '').replace(/\d+[.,]?\d*\s*€/g, '').replace(/[-–%]/g, ' ').trim();
      if (dpiDesc.length < 3 && i > 0) {
        const prev = lines[i - 1];
        if (prev && !dpiRefRe.test(prev) && !junkRe.test(prev) && !/^\d+$/.test(prev))
          dpiDesc = prev.trim().substring(0, 200);
      }

      let pC = null, pP = null, pending = null;
      if (pricesDpi.length >= 2) { pC = Math.max(...pricesDpi); pP = Math.min(...pricesDpi); }
      else if (pricesDpi.length === 1) { pP = pricesDpi[0]; }
      // Check for split price on next line
      if (pricesDpi.length === 0 && i + 1 < lines.length && /^\d{1,5}$/.test(lines[i + 1])) {
        pending = parseInt(lines[i + 1]);
      }

      products.push({
        product: currentProduct || dpiDesc || 'Produit DPI',
        brand: currentBrand || 'Septaline',
        fabricant: currentFabricant || 'DPI',
        classe: currentClasse || null,
        ref: dpiRef,
        description: dpiDesc.substring(0, 300) || null,
        conditionnement: null,
        prixCatalogue: pC, prixPromo: pP,
        remise: (pC && pP && pC > 0) ? Math.round((1 - pP / pC) * 100) + '%' : null,
        raw: line.substring(0, 400),
        _pendingPrice: pending
      });
      continue;
    }

    // === DPI CONCAT OR STANDALONE REFS ===
    // "13.70660713.70684013.706563" (concat) or "22.144-0012" (standalone)
    // Also "11.4212EU11.4210EU" (2-ref concat with letters)
    const concatDpiMatch = line.match(/(\d{2}\.[A-Za-z0-9]{5,}){2,}/);
    const standaloneDpiRef = !concatDpiMatch && /^\s*\d{2}\.[A-Za-z0-9]{3,}[A-Za-z0-9\/._-]*\s*$/.test(line) && !/^\d{2}\.\d{1,3}$/.test(line.trim());
    if ((concatDpiMatch || standaloneDpiRef) && !refLineRe.test(line) && !/dentalpromotion|www\.|http/i.test(line) && !dpiRefRe.test(line)) {
      // Split into individual refs
      const splitRefs = line.match(/\d{2}\.[A-Za-z0-9]+/g) || [];
      // Get variant labels from the line above
      const varLine = (i > 0) ? lines[i - 1] : '';
      for (let si = 0; si < splitRefs.length; si++) {
        const ref = splitRefs[si];
        if (/^\d{2}\.\d{1,2}$/.test(ref)) continue; // skip dimensions
        products.push({
          product: currentProduct || 'Produit DPI',
          brand: currentBrand || null,
          fabricant: currentFabricant || 'DPI',
          classe: currentClasse || null,
          ref,
          description: null,
          conditionnement: null,
          prixCatalogue: null, prixPromo: null, remise: null,
          raw: line.substring(0, 400),
          isSubRef: true
        });
      }
      continue;
    }

    // === DPI SUPPLIER REFS: "06.137907", "05.65380533", "94.C100660", "07.4970" ===
    // Format: "Description produitXX.XXXXXXX" (ref collée en fin) or "XX.XXXXX" standalone
    const dpiSupMatch = line.match(dpiSupplierRefRe);
    if (dpiSupMatch && !dpiRefRe.test(line) && !refLineRe.test(line) && !/dentalpromotion|www\.|http|@|\.fr|\.com/i.test(line)) {
      const allSupRefs = line.match(/\b\d{2}\.[A-Za-z0-9]{3,}[A-Za-z0-9\/._-]*/g) || [];
      for (const supRef of allSupRefs) {
        if (/^\d{2}\.\d{1,3}$/.test(supRef)) continue; // skip numbers like 15.000, 28.000, dimensions

        // Description: text before the ref
        const refIdx = line.indexOf(supRef);
        let desc = line.substring(0, refIdx).replace(/[●\s,]+$/, '').trim();

        // Price: check same line after ref, OR next line (DPI often has price on next line)
        const afterRef = line.substring(refIdx + supRef.length);
        // Price with or without €
        let priceOnLine = afterRef.match(/(\d[\d\s]*[.,]\d{2})\s*€?/);
        let prix = priceOnLine ? parseFloat(priceOnLine[1].replace(/\s/g, '').replace(',', '.')) : null;

        // Check next line for price (DPI format: " 94,20 " alone on next line)
        let prix2 = null;
        if (i + 1 < lines.length) {
          const nextL = lines[i + 1];
          const nextPriceM = nextL.match(/^\s*(\d[\d\s]*[.,]\d{2})\s*€?\s*$/);
          if (nextPriceM) {
            prix2 = parseFloat(nextPriceM[1].replace(/\s/g, '').replace(',', '.'));
          }
        }

        // If no price on same line, use next line
        if (!prix && prix2) { prix = prix2; prix2 = null; }

        // If desc is short, look at previous lines
        if (desc.length < 3) {
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const prev = lines[j];
            if (prev && prev.length > 3 && prev.length < 120
                && !dpiSupplierRefRe.test(prev) && !dpiRefRe.test(prev)
                && !/^\s*\d+[.,]\d{2}\s*€?\s*$/.test(prev)
                && !/^\s*Par \d/.test(prev)
                && !junkRe.test(prev)) {
              desc = prev.trim().substring(0, 200);
              break;
            }
          }
        }

        products.push({
          product: currentProduct || desc || 'Produit DPI',
          brand: currentBrand || null,
          fabricant: currentFabricant || 'DPI',
          classe: currentClasse || null,
          ref: supRef,
          description: desc.substring(0, 300) || null,
          conditionnement: null,
          prixCatalogue: null, prixPromo: prix,
          remise: null,
          raw: line.substring(0, 400),
        });
      }
      continue;
    }

    // === STANDALONE PRICE LINE: " 94,20 " or "78.36€" → attach to last ref without price ===
    if (/^\s*\d[\d\s]*[.,]\d{2}\s*€?\s*$/.test(line) && products.length > 0) {
      const val = parseFloat(line.replace(/\s/g, '').replace('€', '').replace(',', '.'));
      if (val > 0.5 && val < 50000) {
        // Find last product with a ref but no price
        for (let k = products.length - 1; k >= Math.max(0, products.length - 8); k--) {
          if (products[k].ref && !products[k].prixPromo) {
            products[k].prixPromo = val;
            break;
          }
        }
        continue;
      }
    }

    // === "Par 2/l'unité" discount price line ===
    if (/^Par\s+\d/i.test(line) && products.length > 0) {
      // Next line likely has the discounted price
      if (i + 1 < lines.length) {
        const nextL = lines[i + 1];
        const pm2 = nextL.match(/^\s*(\d[\d\s]*[.,]\d{2})\s*€?\s*$/);
        if (pm2) {
          const discountPrice = parseFloat(pm2[1].replace(/\s/g, '').replace(',', '.'));
          // Attach as prixPromo to last product that has a price (make that price the catalogue price)
          for (let k = products.length - 1; k >= Math.max(0, products.length - 5); k--) {
            if (products[k].ref && products[k].prixPromo && !products[k].prixCatalogue) {
              products[k].prixCatalogue = products[k].prixPromo;
              products[k].prixPromo = discountPrice;
              products[k].remise = Math.round((1 - discountPrice / products[k].prixCatalogue) * 100) + '%';
              break;
            }
          }
          i++; // skip the price line
        }
      }
      continue;
    }

    // === REFERENCE LINE WITH PRICES ===
    const refMatch = line.match(refLineRe);
    if (refMatch) {
      const ref = refMatch[1].trim();
      if (ref.length < 3 || !/\d/.test(ref)) continue;

      // Extract prices AFTER the ref (not from the ref digits themselves)
      // Get text after "réf. XXXX-XXX" to avoid mixing ref digits with prices
      const refEndIdx = line.search(refLineRe) + line.match(refLineRe)[0].length;
      const priceZone = line.substring(refEndIdx).replace(/€(\d)/g, '€ $1');
      const prices = [];
      let pm;
      const priceRe = /(\d[\d\s]*(?:[.,]\d{1,2})?)\s*€/g;
      while ((pm = priceRe.exec(priceZone)) !== null) {
        const val = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
        if (val > 0 && val < 50000) prices.push(val);
      }

      // Check for split price on next lines: "réf. XXXX-XXX\n13\n€50" → 13.50€
      let pendingPrice = null;
      if (prices.length === 0 && i + 1 < lines.length) {
        const nextL = lines[i + 1];
        if (/^\d{1,5}$/.test(nextL)) {
          pendingPrice = parseInt(nextL);
        }
      }

      let prixCatalogue = null, prixPromo = null;
      if (prices.length >= 2) {
        prixCatalogue = Math.max(...prices);
        prixPromo = Math.min(...prices);
      } else if (prices.length === 1) {
        prixPromo = prices[0];
      }

      // Description: text before "réf." or the whole line context
      let description = line.substring(0, line.search(/[Rr][ée]f\.?\s*[\w]/)).trim().replace(/[-–:]+$/, '').trim();
      // If description is empty/short, look at previous lines
      if (description.length < 5) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prev = lines[j].trim();
          if (prev && !refLineRe.test(prev) && !junkRe.test(prev) && prev !== '|' && !/^\d+$/.test(prev) && prev.length > 4) {
            description = prev.replace(/[-–:]+$/, '').trim().substring(0, 200);
            break;
          }
        }
      }

      const condMatch2 = (description + ' ' + line).match(condRe);

      products.push({
        product: currentProduct || description || 'Produit non identifié',
        brand: currentBrand || null,
        fabricant: currentFabricant || null,
        classe: currentClasse || null,
        ref,
        description: description.substring(0, 300) || null,
        conditionnement: condMatch2 ? condMatch2[0].trim() : null,
        prixCatalogue,
        prixPromo,
        remise: (prixCatalogue && prixPromo && prixCatalogue > 0)
          ? Math.round((1 - prixPromo / prixCatalogue) * 100) + '%' : null,
        raw: line.substring(0, 400),
        _pendingPrice: pendingPrice  // Will be completed by "€XX" handler
      });
      continue;
    }

    // === FALLBACK: line with BOTH a label AND a price (not standalone price) ===
    // Only match lines that have meaningful text + price (not "154\n€" display prices)
    const normalizedLine2 = line.replace(/€(\d)/g, '€ $1');
    if (/\d+[.,]\d{2}\s*€/.test(normalizedLine2) && line.length > 15 && !junkRe.test(line)) {
      // Must have text before the price (not just a number)
      const label = line.substring(0, line.search(/\d[\d\s]*[.,]\d{2}\s*€/)).trim();
      if (label.length > 5 && !/^\d+$/.test(label) && !/^(OFFRE|MEGA|SEULEMENT|€)/.test(label)) {
        const prices = [];
        let pm;
        const priceRe3 = /(\d[\d\s]*(?:[.,]\d{1,2})?)\s*€/g;
        while ((pm = priceRe3.exec(normalizedLine2)) !== null) {
          const val = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
          if (val > 0 && val < 50000) prices.push(val);
        }
        let prixCatalogue = prices.length >= 2 ? Math.max(...prices) : null;
        let prixPromo = prices.length >= 2 ? Math.min(...prices) : prices[0];
        products.push({
          product: currentProduct || label, brand: currentBrand || null,
          fabricant: currentFabricant || null, classe: currentClasse || null,
          ref: null, description: label.substring(0, 300), conditionnement: null,
          prixCatalogue, prixPromo,
          remise: (prixCatalogue && prixPromo && prixCatalogue > 0)
            ? Math.round((1 - prixPromo / prixCatalogue) * 100) + '%' : null,
          raw: line.substring(0, 400)
        });
      }
    }
  }
  // Clean internal fields + resolve pending prices
  products.forEach(p => {
    if (p._pendingPrice != null && !p.prixPromo) p.prixPromo = p._pendingPrice;
    delete p._pendingPrice;
  });
  return { products, totalLines: lines.length };
}

// --- Extract text from PDF using best available tools ---
const { execSync } = require('child_process');

function extractPdfText(filePath) {
  // Try pdftotext -layout first (best for general text + layout)
  try {
    const text = execSync(`pdftotext -layout "${filePath}" -`, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 600000 // 10 min pour gros catalogues
    }).toString('utf8');
    if (text.length > 100) {
      let numpages = 0;
      try {
        const info = execSync(`pdfinfo "${filePath}"`, { timeout: 10000 }).toString('utf8');
        const m = info.match(/Pages:\s*(\d+)/);
        if (m) numpages = parseInt(m[1]);
      } catch (e) {}
      return { text, numpages, engine: 'pdftotext' };
    }
  } catch (e) {
    console.log(`[scan-dashboard] pdftotext failed: ${e.message}`);
  }

  // Fallback: pdf-parse (Node.js)
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  return pdfParse(buffer).then(d => ({ text: d.text, numpages: d.numpages, engine: 'pdf-parse' }));
}

// --- Extract tables+refs via PyMuPDF PRO (best engine for large catalogs) ---
function extractPdfTables(filePath) {
  try {
    const pyScript = '/home/ubuntu/jadomi/scripts/pdf-extract-pro.py';
    const raw = execSync(`python3 "${pyScript}" "${filePath}" 2>/dev/null`, {
      maxBuffer: 1024 * 1024 * 1024,
      timeout: 1800000 // 30 min for Henry Schein 1500+ pages
    }).toString('utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.log(`[scan-dashboard] PyMuPDF PRO failed: ${e.message}`);
    // Fallback: pdfplumber
    try {
      const pyScript2 = '/home/ubuntu/jadomi/scripts/pdf-extract-tables.py';
      const raw2 = execSync(`python3 "${pyScript2}" "${filePath}" 2>/dev/null`, {
        maxBuffer: 500 * 1024 * 1024,
        timeout: 1200000 // 20 min fallback
      }).toString('utf8');
      return JSON.parse(raw2);
    } catch (e2) {
      console.log(`[scan-dashboard] pdfplumber fallback also failed: ${e2.message}`);
      return { ok: false, products: [] };
    }
  }
}

// --- Merge products from text extraction + table extraction ---
function mergeProducts(textProducts, tableProducts) {
  const byRef = new Map();
  // Text products first (have more context: conditionnement, fabricant, etc.)
  for (const p of textProducts) {
    if (p.ref) byRef.set(p.ref, p);
  }
  // Table products: add missing refs, upgrade prices
  for (const tp of tableProducts) {
    if (!tp.ref) continue;
    if (byRef.has(tp.ref)) {
      const existing = byRef.get(tp.ref);
      // Upgrade: if table has price and existing doesn't
      if (tp.prixPromo && !existing.prixPromo) existing.prixPromo = tp.prixPromo;
      // If table has better description
      if (tp.description && (!existing.description || existing.description.length < 5)) existing.description = tp.description;
      if (tp.brand && !existing.brand) existing.brand = tp.brand;
      if (tp.product && (!existing.product || existing.product === 'Produit DPI')) existing.product = tp.product;
    } else {
      // New ref from tables
      byRef.set(tp.ref, {
        product: tp.product || 'Produit non identifié',
        brand: tp.brand || null,
        fabricant: 'DPI',
        classe: null,
        ref: tp.ref,
        description: tp.description || null,
        conditionnement: null,
        prixCatalogue: null,
        prixPromo: tp.prixPromo || null,
        remise: null,
        raw: '',
      });
    }
  }
  return Array.from(byRef.values());
}

// --- Background PDF parser with queue (1 at a time to save RAM) ---
function parsePdfInBackground(filename, filePath, brandOverride) {
  const job = { status: 'queued', progress: 'En file d\'attente...', pages: 0, products: [], error: null, brand: null, docType: null, textPreview: '' };
  parseJobs[filename] = job;
  parseQueue.push({ filename, filePath, brandOverride });
  processParseQueue();
}

async function processParseQueue() {
  if (parseRunning || parseQueue.length === 0) return;
  parseRunning = true;
  const { filename, filePath, brandOverride } = parseQueue.shift();
  const job = parseJobs[filename];
  if (!job) { parseRunning = false; processParseQueue(); return; }

  try {
    job.status = 'parsing';
    job.progress = 'Lecture du fichier...';
    const sizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
    job.progress = `Analyse du PDF (${sizeMb} Mo)...`;
    console.log(`[scan-dashboard] Parsing PDF: ${filename} (${sizeMb} Mo)`);

    const data = await Promise.race([
      Promise.resolve(extractPdfText(filePath)).then(r => r instanceof Promise ? r : r),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 180s')), 180000))
    ]);
    console.log(`[scan-dashboard] Engine: ${data.engine}`);

    job.pages = data.numpages;
    job.progress = `Extraction des produits (${data.numpages} pages)...`;

    const autoBrand = detectBrand(filename, data.text);
    const autoDocType = detectDocType(filename, data.text);
    const brand = (brandOverride && brandOverride !== '' && brandOverride !== '-- Marque / Fournisseur --')
      ? brandOverride.trim() : (autoBrand || 'Non classé');

    let { products, totalLines } = extractProducts(data.text);

    // Hybrid: also extract tables via pdfplumber for maximum coverage
    job.progress = `Extraction tableaux (${data.numpages} pages)...`;
    const tableResult = extractPdfTables(filePath);
    if (tableResult.ok && tableResult.products && tableResult.products.length > 0) {
      console.log(`[scan-dashboard] pdfplumber: ${tableResult.uniqueRefs} refs, ${tableResult.withPrice} prix`);
      products = mergeProducts(products, tableResult.products);
    }

    const meta = loadMeta();
    meta[filename] = { brand, docType: autoDocType, autoDetected: !!autoBrand, originalName: filename, uploadedAt: new Date().toISOString() };
    saveMeta(meta);

    job.status = 'done';
    job.progress = 'Terminé';
    job.brand = brand;
    job.brandAutoDetected = !!autoBrand;
    job.docType = autoDocType;
    job.products = products;
    job.totalLines = totalLines;
    job.textPreview = data.text.substring(0, 2000);
    console.log(`[scan-dashboard] Done: ${data.numpages} pages, ${products.length} produits`);
  } catch (err) {
    console.error(`[scan-dashboard] Parse error: ${err.message}`);
    job.status = 'done';
    job.progress = 'Terminé (avec erreur)';
    job.error = err.message;
    const autoBrand = detectBrand(filename, '');
    const meta = loadMeta();
    meta[filename] = { brand: autoBrand || brandOverride || 'Non classé', docType: 'flyer', autoDetected: !!autoBrand, originalName: filename, uploadedAt: new Date().toISOString(), parseError: err.message };
    saveMeta(meta);
    job.brand = autoBrand || brandOverride || 'Non classé';
  }
  // Force garbage collection of the buffer
  if (global.gc) global.gc();
  // Auto-cleanup job after 10 min
  setTimeout(() => { delete parseJobs[filename]; }, 600000);
  // Process next in queue
  parseRunning = false;
  processParseQueue();
}

router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    const sizeMb = (req.file.size / 1024 / 1024).toFixed(1);
    const autoBrand = detectBrand(req.file.originalname, '');
    const brand = (req.body.brand && req.body.brand !== '' && req.body.brand !== '-- Marque / Fournisseur --')
      ? req.body.brand.trim() : (autoBrand || 'Non classé');

    console.log(`[scan-dashboard] Upload reçu: ${req.file.originalname} (${sizeMb} Mo)`);

    // Détection archives (RAR, ZIP, 7Z) → extraire puis traiter chaque fichier
    const isArchive = ['application/x-rar-compressed', 'application/vnd.rar', 'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed'].includes(req.file.mimetype);
    if (isArchive) {
      console.log(`[scan-dashboard] Archive détectée: ${req.file.mimetype}`);
      const { execSync } = require('child_process');
      const extractDir = path.join(FLYERS_DIR, 'extracted_' + Date.now());
      fs.mkdirSync(extractDir, { recursive: true });
      try {
        if (req.file.mimetype.includes('rar')) {
          execSync(`unrar x -o+ "${req.file.path}" "${extractDir}/"`, { timeout: 60000 });
        } else if (req.file.mimetype.includes('7z')) {
          execSync(`7z x "${req.file.path}" -o"${extractDir}" -y`, { timeout: 60000 });
        } else {
          execSync(`unzip -o "${req.file.path}" -d "${extractDir}"`, { timeout: 60000 });
        }
        // Lister les fichiers extraits
        const extracted = [];
        const walkDir = (dir) => {
          fs.readdirSync(dir).forEach(f => {
            const full = path.join(dir, f);
            if (fs.statSync(full).isDirectory()) walkDir(full);
            else if (/\.(jpg|jpeg|png|webp|gif|pdf|xlsx|csv)$/i.test(f)) {
              // Copier dans le dossier flyers avec un nom unique
              const newName = Date.now() + '-' + f.replace(/[^a-zA-Z0-9._-]/g, '_');
              const dest = path.join(FLYERS_DIR, newName);
              fs.copyFileSync(full, dest);
              extracted.push({ name: f, path: dest, size: fs.statSync(full).size });
            }
          });
        };
        walkDir(extractDir);
        // Nettoyer le dossier temporaire
        execSync(`rm -rf "${extractDir}"`);
        console.log(`[scan-dashboard] ${extracted.length} fichiers extraits de l'archive`);
        const meta = loadMeta();
        extracted.forEach(f => {
          const bn = path.basename(f.path);
          meta[bn] = { brand: brand, docType: 'archive', originalName: f.name, uploadedAt: new Date().toISOString(), fromArchive: req.file.originalname };
        });
        saveMeta(meta);
        return res.json({ ok: true, archive: true, filename: req.file.filename, originalName: req.file.originalname, extractedFiles: extracted.length, files: extracted.map(f => f.name) });
      } catch (e) {
        console.error('[scan-dashboard] archive extract error:', e.message);
        return res.status(500).json({ error: 'Erreur extraction archive: ' + e.message });
      }
    }

    // Détection type de fichier (PDF vs Image vs Autre)
    const isImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'].includes(req.file.mimetype);
    const isPdf = req.file.mimetype === 'application/pdf';
    const isOtherDoc = !isImage && !isPdf;

    // AUTRES FICHIERS (PowerPoint, vidéos, audio, Word, Excel...) : stockage simple sans parsing
    if (isOtherDoc) {
      console.log(`[scan-dashboard] Fichier non-PDF stocké: ${req.file.originalname} (${req.file.mimetype})`);
      const ext = path.extname(req.file.originalname).toLowerCase();
      let docType = 'document';
      if (['.pptx', '.ppt'].includes(ext)) docType = 'powerpoint';
      else if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) docType = 'video';
      else if (['.mp3', '.wav', '.ogg'].includes(ext)) docType = 'audio';
      else if (['.docx', '.doc'].includes(ext)) docType = 'word';
      else if (['.xlsx', '.xls', '.csv'].includes(ext)) docType = 'tableur';
      const meta = loadMeta();
      meta[req.file.filename] = { brand: brand, docType, originalName: req.file.originalname, uploadedAt: new Date().toISOString(), size: req.file.size, mimetype: req.file.mimetype };
      saveMeta(meta);
      return res.json({ ok: true, filename: req.file.filename, originalName: req.file.originalname, brand, docType, pages: 0, totalLines: 0, products: [], textPreview: `Fichier ${docType} stocké avec succès (${sizeMb} Mo)` });
    }

    // IMAGES : analyse via DeepSeek Vision / OCR
    if (isImage) {
      console.log(`[scan-dashboard] Image détectée: ${req.file.mimetype}`);
      const imageData = await analyzeImageWithIA(req.file.path, req.file.mimetype);
      const meta = loadMeta();
      const finalBrand = brand;
      meta[req.file.filename] = { brand: finalBrand, docType: 'photo', autoDetected: false, originalName: req.file.originalname, uploadedAt: new Date().toISOString() };
      saveMeta(meta);
      return res.json({ ok: true, filename: req.file.filename, originalName: req.file.originalname, brand: finalBrand, docType: 'photo', pages: 1, totalLines: 0, products: imageData.products || [], textPreview: imageData.text || '' });
    }

    // FAST: respond immediately, parse in background
    // For small files (< 15 Mo), parse synchronously for instant results
    if (req.file.size < 15 * 1024 * 1024) {
      // Small file — parse now with best engine
      const data = await extractPdfText(req.file.path);
      const autoDocType = detectDocType(req.file.originalname, data.text);
      const finalBrand = (req.body.brand && req.body.brand !== '' && req.body.brand !== '-- Marque / Fournisseur --')
        ? req.body.brand.trim() : (detectBrand(req.file.originalname, data.text) || 'Non classé');
      const { products, totalLines } = extractProducts(data.text);
      const meta = loadMeta();
      meta[req.file.filename] = { brand: finalBrand, docType: autoDocType, autoDetected: !!detectBrand(req.file.originalname, data.text), originalName: req.file.originalname, uploadedAt: new Date().toISOString() };
      saveMeta(meta);
      return res.json({ ok: true, filename: req.file.filename, originalName: req.file.originalname, brand: finalBrand, brandAutoDetected: !!detectBrand(req.file.originalname, data.text), docType: autoDocType, pages: data.numpages, totalLines, products, textPreview: data.text.substring(0, 2000) });
    }

    // Large file — respond instantly, parse in background
    const meta = loadMeta();
    meta[req.file.filename] = { brand, docType: 'flyer', autoDetected: !!autoBrand, originalName: req.file.originalname, uploadedAt: new Date().toISOString(), parsing: true };
    saveMeta(meta);

    parsePdfInBackground(req.file.filename, req.file.path, req.body.brand);

    res.json({
      ok: true,
      async: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      brand,
      brandAutoDetected: !!autoBrand,
      docType: 'flyer',
      pages: 0,
      totalLines: 0,
      products: [],
      textPreview: '',
      message: `Fichier reçu (${sizeMb} Mo). Analyse en cours...`
    });
  } catch (e) {
    console.error('[scan-dashboard] upload error:', e);
    if (e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 300 Mo).' });
    res.status(500).json({ error: 'Erreur lors du traitement du PDF.' });
  }
});

// =========================================================
// GET /parse-status/:filename — Poll parsing progress
// =========================================================
router.get('/parse-status/:filename', (req, res) => {
  const job = parseJobs[req.params.filename];
  if (!job) return res.json({ status: 'unknown', message: 'Aucun job en cours pour ce fichier.' });
  res.json(job);
});

// =========================================================
// GET /flyers — List uploaded flyers
// =========================================================
router.get('/flyers', (req, res) => {
  try {
    const meta = loadMeta();
    const files = fs.readdirSync(FLYERS_DIR)
      .filter(f => f.endsWith('.pdf') || f.endsWith('.jpg') || f.endsWith('.png'))
      .map(f => {
        const stat = fs.statSync(path.join(FLYERS_DIR, f));
        const m = meta[f] || {};
        return {
          name: f,
          displayName: m.originalName || f,
          brand: m.brand || 'Non classé',
          docType: m.docType || 'flyer',
          size: stat.size,
          date: m.uploadedAt || stat.mtime,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ ok: true, flyers: files });
  } catch (e) {
    res.json({ ok: true, flyers: [] });
  }
});

// =========================================================
// DELETE /flyers/:name — Delete a flyer
// =========================================================
router.delete('/flyers/:name', (req, res) => {
  try {
    const safeName = path.basename(req.params.name);
    const fp = path.join(FLYERS_DIR, safeName);
    if (!fp.startsWith(FLYERS_DIR)) return res.status(403).json({ error: 'Interdit.' });
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    // Remove metadata
    const meta = loadMeta();
    delete meta[safeName];
    saveMeta(meta);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur suppression.' });
  }
});

// =========================================================
// POST /promo/calc — Calculate effective unit price for promo
// =========================================================
router.post('/promo/calc', (req, res) => {
  try {
    const { type, unitPrice, params } = req.body;
    if (!unitPrice || unitPrice <= 0) return res.status(400).json({ error: 'Prix unitaire invalide.' });

    let effectivePrice = unitPrice;
    let detail = '';

    switch (type) {
      case 'x_achetes_y_offerts': {
        // "X achetés Y offerts" → you pay X but get X+Y
        const x = parseInt(params?.x) || 1;
        const y = parseInt(params?.y) || 0;
        const total = x + y;
        effectivePrice = (x * unitPrice) / total;
        detail = `${x} achetés ${y} offerts : ${x} x ${unitPrice.toFixed(2)} / ${total} = ${effectivePrice.toFixed(2)} par unité`;
        break;
      }
      case 'lot_remise': {
        // "Lot -X%"
        const pct = parseFloat(params?.pct) || 0;
        effectivePrice = unitPrice * (1 - pct / 100);
        detail = `Lot -${pct}% : ${unitPrice.toFixed(2)} x ${(1 - pct / 100).toFixed(4)} = ${effectivePrice.toFixed(2)} par unité`;
        break;
      }
      case 'palier_degressif': {
        // Price depends on quantity — find the matching tier
        const qty = parseInt(params?.qty) || 1;
        const tiers = params?.tiers || [];
        // tiers: [{min, max, price}]
        let matched = null;
        for (const t of tiers) {
          if (qty >= (t.min || 0) && (!t.max || qty <= t.max)) {
            matched = t;
          }
        }
        if (matched) {
          effectivePrice = matched.price;
          detail = `Palier ${matched.min}-${matched.max || '+'} : ${effectivePrice.toFixed(2)} par unité pour ${qty} unités`;
        } else {
          detail = `Aucun palier trouvé pour ${qty} unités, prix catalogue appliqué`;
        }
        break;
      }
      default:
        return res.status(400).json({ error: 'Type de promo non reconnu.' });
    }

    res.json({ ok: true, effectivePrice: Math.round(effectivePrice * 100) / 100, detail });
  } catch (e) {
    console.error('[scan-dashboard] promo/calc error:', e);
    res.status(500).json({ error: 'Erreur calcul promo.' });
  }
});

// =========================================================
// GET /scrapers — Monitor scraper status from /tmp files
// =========================================================
router.get('/scrapers', (req, res) => {
  try {
    const results = [];

    // Read /tmp/search-progress-*.json files
    const tmpDir = '/tmp';
    const progressFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith('search-progress-') && f.endsWith('.json'));

    for (const file of progressFiles) {
      try {
        const raw = fs.readFileSync(path.join(tmpDir, file), 'utf-8');
        const data = JSON.parse(raw);
        const site = file.replace('search-progress-', '').replace('.json', '');
        results.push({
          site,
          products: data.count || data.products || data.total || 0,
          lastUpdate: data.lastUpdate || data.timestamp || fs.statSync(path.join(tmpDir, file)).mtime,
          status: data.status || 'actif',
          details: data
        });
      } catch (e) { /* skip corrupt files */ }
    }

    // Read brain.json
    let brain = null;
    const brainPath = '/tmp/jadomi-engine/brain.json';
    try {
      if (fs.existsSync(brainPath)) {
        brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'));
      }
    } catch (e) { /* brain not available */ }

    res.json({ ok: true, scrapers: results, brain });
  } catch (e) {
    console.error('[scan-dashboard] scrapers error:', e);
    res.json({ ok: true, scrapers: [], brain: null });
  }
});

module.exports = router;
