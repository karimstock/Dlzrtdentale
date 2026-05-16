#!/usr/bin/env node
/**
 * JADOMI — Parse 3 new dental catalog PDFs
 *
 * Strategy:
 * 1. Try pdfplumber (Python) for text-based PDFs
 * 2. Fall back to pdftoppm + Claude Vision for image-based PDFs
 * 3. Save results to /tmp/ JSON files
 * 4. Import into scraped_prices via POST /api/scan/import-prices
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERREUR: ANTHROPIC_API_KEY non trouvee dans .env');
  process.exit(1);
}

const TMP_DIR = path.join(__dirname, '..', 'tmp');
const SERVER_URL = `http://localhost:${process.env.PORT || 3001}`;

const CATALOGS = [
  {
    file: path.join(__dirname, '..', 'uploads/flyers/1778339823711-2023-10-10_dental_flyer-set-trazado-interactivo.pdf'),
    name: 'dental-flyer-trazado',
    source: 'DentalGoodDeal.es',
    lang: 'es',
    pages: 9,
  },
  {
    file: path.join(__dirname, '..', 'uploads/flyers/1778339829707-catalogo-ofertas-abril.pdf'),
    name: 'catalogo-ofertas-abril',
    source: 'Catalogo Ofertas Abril',
    lang: 'es',
    pages: 32,
  },
  {
    file: path.join(__dirname, '..', 'uploads/flyers/1778339837249-PDF.pdf'),
    name: 'dentalclick-catalogue',
    source: 'DentalClick',
    lang: 'fr',
    pages: 24,
  },
];

// ============================================================
// STEP 1: Try pdfplumber text extraction (Python)
// ============================================================
function extractTextWithPdfplumber(pdfPath) {
  console.log(`  [pdfplumber] Extraction texte de ${path.basename(pdfPath)}...`);
  try {
    const pyScript = path.join(TMP_DIR, '_pdfplumber_extract.py');
    fs.writeFileSync(pyScript, `
import pdfplumber, json, sys
pdf = pdfplumber.open(sys.argv[1])
pages = []
for i, page in enumerate(pdf.pages):
    text = page.extract_text() or ''
    tables = page.extract_tables() or []
    pages.append({'page': i, 'text': text, 'tables': tables})
pdf.close()
print(json.dumps(pages, ensure_ascii=False))
`);
    const result = execSync(`python3 ${JSON.stringify(pyScript)} ${JSON.stringify(pdfPath)}`, {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 120000,
    });
    return JSON.parse(result.toString());
  } catch (e) {
    console.error(`  [pdfplumber] Echec: ${e.message}`);
    return null;
  }
}

// ============================================================
// STEP 2: Convert PDF pages to images with pdftoppm
// ============================================================
function convertToImages(pdfPath, prefix) {
  const imgDir = path.join(TMP_DIR, `${prefix}_images`);
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  console.log(`  [pdftoppm] Conversion en images...`);
  try {
    execSync(`pdftoppm -png -r 200 ${JSON.stringify(pdfPath)} ${JSON.stringify(path.join(imgDir, 'page'))}`, {
      timeout: 300000,
    });
    const images = fs.readdirSync(imgDir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => path.join(imgDir, f));
    console.log(`  [pdftoppm] ${images.length} images generees`);
    return images;
  } catch (e) {
    console.error(`  [pdftoppm] Echec: ${e.message}`);
    return [];
  }
}

// ============================================================
// STEP 3: Claude Vision extraction
// ============================================================
async function extractWithVision(imagePath, pageNum, lang) {
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const mediaType = 'image/png';

  const langInstruction = lang === 'es'
    ? 'Cette page est en espagnol. Traduisez les noms de produits en francais si possible, sinon gardez l\'original.'
    : '';

  const prompt = `Analysez cette page de catalogue dentaire (page ${pageNum + 1}). ${langInstruction}
Extrayez TOUS les produits visibles avec :
- name: nom du produit (string)
- brand: marque/fabricant si visible (string ou null)
- ref: reference/code produit (string ou null)
- price: prix actuel/promo en euros (number, HT ou TTC selon ce qui est indique)
- price_original: ancien prix barre si promo (number ou null)
- discount: pourcentage de remise si indique (number ou null, ex: 50 pour -50%)
- unit: conditionnement (string ou null, ex: "boite de 100", "2 jeringas de 25ml")
- category: categorie du produit (string ou null)

IMPORTANT:
- Repondez UNIQUEMENT avec un tableau JSON valide
- Si aucun produit n'est trouve, repondez []
- Les prix doivent etre des numbers (pas de symbole euro)
- Convertissez les prix avec virgule en point (ex: 25,99 -> 25.99)`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageData },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '[]';

    // Extract JSON from response (might be wrapped in markdown code block)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`    Page ${pageNum + 1}: pas de JSON trouve dans la reponse`);
      return [];
    }

    const products = JSON.parse(jsonMatch[0]);
    return products;
  } catch (e) {
    console.error(`    Page ${pageNum + 1} Vision erreur: ${e.message}`);
    return [];
  }
}

// ============================================================
// STEP 4: Parse text-extracted pages with regex
// ============================================================
function parseSpanishFlyer(pages) {
  const products = [];

  for (const page of pages) {
    const text = page.text || '';
    if (text.length < 20) continue;

    // Pattern: price with € and product names, refs
    // Spanish catalogs typically: -XX% \n old_price€ \n new_price€ \n PRODUCT NAME \n description \n REF: XXXXX
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let currentDiscount = null;
    let oldPrice = null;
    let newPrice = null;
    let productName = null;
    let ref = null;
    let unit = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect discount
      const discountMatch = line.match(/^-(\d+)%$/);
      if (discountMatch) {
        currentDiscount = parseInt(discountMatch[1]);
        continue;
      }

      // Detect price (number with € or ,)
      const priceMatch = line.match(/^(\d+[.,]?\d*)\s*€?$/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        if (oldPrice === null) {
          oldPrice = price;
        } else if (newPrice === null) {
          newPrice = price;
        }
        continue;
      }

      // Detect REF
      const refMatch = line.match(/REF[:\s]+(\S+)/i);
      if (refMatch) {
        ref = refMatch[1];
      }

      // Detect product name (ALL CAPS or significant text, not a header/footer)
      if (line.length > 3 && !line.match(/^(LOS MEJORES|SIGUENOS|TU DEPÓSITO|COMPARADOR|PRECIO INDICADO|www\.|OFERTAS HASTA)/i)) {
        if (line === line.toUpperCase() && line.length > 4 && !priceMatch && !discountMatch) {
          // If we had a previous product, save it
          if (productName && (newPrice || oldPrice)) {
            products.push({
              name: productName,
              brand: null,
              ref: ref,
              price: newPrice || oldPrice,
              price_original: newPrice ? oldPrice : null,
              discount: currentDiscount,
              unit: unit,
              category: null,
              page_number: page.page + 1,
            });
          }
          productName = line;
          ref = null;
          unit = null;
          oldPrice = null;
          newPrice = null;
          currentDiscount = null;
        } else if (productName && !ref) {
          // Could be description/conditionnement
          const unitMatch = line.match(/(\d+\s*(?:unidad|unité|caja|bolsa|bote|jeringa|cartucho|paquete|bobina|rollo)[\w\s]*)/i);
          if (unitMatch) {
            unit = unitMatch[1].trim();
          }
        }
      }
    }

    // Save last product
    if (productName && (newPrice || oldPrice)) {
      products.push({
        name: productName,
        brand: null,
        ref: ref,
        price: newPrice || oldPrice,
        price_original: newPrice ? oldPrice : null,
        discount: currentDiscount,
        unit: unit,
        category: null,
        page_number: page.page + 1,
      });
    }
  }

  return products;
}

function parseDentalClickCatalog(pages) {
  const products = [];

  for (const page of pages) {
    const text = page.text || '';
    if (text.length < 50) continue;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // DentalClick format: product names in CAPS, Ref. XXXXX, prices with €
    // Patterns: Ref. 35401 Bleu, -55%, 3,54 €, etc.

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Look for product blocks: discount + product name + ref + price
      // Try to find refs with prices nearby
      const refPricePattern = /Ref\.?\s*(\d+)\s+(.+?)\s+(\d+[.,]\d+)\s*€/gi;
      let match;
      while ((match = refPricePattern.exec(line)) !== null) {
        products.push({
          name: match[2].trim() || `Ref ${match[1]}`,
          brand: null,
          ref: match[1],
          price: parseFloat(match[3].replace(',', '.')),
          price_original: null,
          discount: null,
          unit: null,
          category: null,
          page_number: page.page + 1,
        });
      }

      i++;
    }
  }

  return products;
}

// ============================================================
// STEP 5: Import into API
// ============================================================
async function importToAPI(source, products, page) {
  if (products.length === 0) return { imported: 0 };

  // Batch in groups of 200
  let totalImported = 0;
  const batchSize = 200;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    try {
      const resp = await fetch(`${SERVER_URL}/api/scan/import-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, products: batch, page }),
      });
      const result = await resp.json();
      totalImported += result.imported || 0;
      console.log(`  [import] Batch ${Math.floor(i/batchSize)+1}: ${result.imported}/${batch.length} importes`);
    } catch (e) {
      console.error(`  [import] Erreur batch: ${e.message}`);
    }
  }

  return { imported: totalImported };
}

// ============================================================
// MAIN: Process each catalog
// ============================================================
async function main() {
  console.log('=== JADOMI — Parse 3 nouveaux catalogues dentaires ===\n');

  const allResults = {};

  for (const catalog of CATALOGS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Catalogue: ${catalog.name}`);
    console.log(`Fichier: ${path.basename(catalog.file)}`);
    console.log(`Source: ${catalog.source}`);
    console.log(`${'='.repeat(60)}`);

    // Check if file exists
    if (!fs.existsSync(catalog.file)) {
      console.error(`  ERREUR: Fichier introuvable: ${catalog.file}`);
      continue;
    }

    const progressFile = path.join(TMP_DIR, `${catalog.name}-progress.json`);
    const resultFile = path.join(TMP_DIR, `${catalog.name}-products.json`);

    // Check if already processed
    if (fs.existsSync(resultFile)) {
      const existing = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      console.log(`  Deja traite: ${existing.length} produits dans ${resultFile}`);
      allResults[catalog.name] = existing;
      continue;
    }

    // STEP 1: Try pdfplumber
    const pdfPages = extractTextWithPdfplumber(catalog.file);

    let products = [];

    if (pdfPages) {
      const totalText = pdfPages.reduce((acc, p) => acc + (p.text || '').length, 0);
      console.log(`  [pdfplumber] Texte total: ${totalText} chars sur ${pdfPages.length} pages`);

      if (totalText > 500) {
        // Text-based PDF -- use regex parsing
        console.log(`  -> PDF textuel, parsing par regex...`);

        if (catalog.source === 'DentalClick') {
          // DentalClick: complex layout, better use Vision for accuracy
          console.log(`  -> Layout complexe DentalClick, on utilise Vision pour plus de precision`);
        } else {
          // Try regex first
          products = parseSpanishFlyer(pdfPages);
          console.log(`  [regex] ${products.length} produits extraits par regex`);
        }

        // If regex found too few products, use Vision
        if (products.length < 5) {
          console.log(`  -> Peu de produits par regex (${products.length}), passage a Vision...`);
          products = []; // Reset, Vision will do better
        }
      }
    }

    // STEP 2: If regex failed or PDF is image-based, use Vision
    if (products.length === 0) {
      console.log(`  -> Extraction par Claude Vision...`);

      // Convert to images
      const images = convertToImages(catalog.file, catalog.name);

      if (images.length === 0) {
        console.error(`  ERREUR: Aucune image generee`);
        continue;
      }

      // Load progress if exists
      let progress = { processedPages: [], products: [] };
      if (fs.existsSync(progressFile)) {
        progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        console.log(`  [resume] Reprise: ${progress.processedPages.length}/${images.length} pages deja traitees`);
      }

      for (let i = 0; i < images.length; i++) {
        if (progress.processedPages.includes(i)) {
          continue;
        }

        console.log(`  [vision] Page ${i + 1}/${images.length}...`);
        const pageProducts = await extractWithVision(images[i], i, catalog.lang);

        // Add page number
        for (const p of pageProducts) {
          p.page_number = i + 1;
        }

        progress.products.push(...pageProducts);
        progress.processedPages.push(i);

        console.log(`    -> ${pageProducts.length} produits (total: ${progress.products.length})`);

        // Save progress
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

        // Rate limit: 2 seconds between requests
        if (i < images.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      products = progress.products;
    }

    console.log(`\n  TOTAL: ${products.length} produits extraits de ${catalog.name}`);

    // Save final results
    fs.writeFileSync(resultFile, JSON.stringify(products, null, 2));
    console.log(`  Sauvegarde: ${resultFile}`);

    allResults[catalog.name] = products;

    // Import to API
    if (products.length > 0) {
      console.log(`  [import] Import dans scraped_prices...`);
      const importResult = await importToAPI(catalog.source, products, catalog.name);
      console.log(`  [import] ${importResult.imported} produits importes pour ${catalog.source}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESUME FINAL');
  console.log('='.repeat(60));
  for (const [name, prods] of Object.entries(allResults)) {
    const withPrice = prods.filter(p => p.price > 0).length;
    const withRef = prods.filter(p => p.ref).length;
    console.log(`  ${name}: ${prods.length} produits (${withPrice} avec prix, ${withRef} avec ref)`);
  }
  console.log('='.repeat(60));
}

main().catch(e => {
  console.error('ERREUR FATALE:', e);
  process.exit(1);
});
