#!/usr/bin/env node
// =============================================
// JADOMI — Universal Dental Scraper Engine
// Moteur de scraping universel pour sites dentaires
// Supporte: Magento, PrestaShop, custom, manufacturer
// Methodes: brands, categories, sitemap, search
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');
const path = require('path');

const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const TMP_DIR = '/home/ubuntu/jadomi/tmp';
const CHUNK_SIZE = 500;
const SAVE_EVERY = 50;

// Pool of user agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

class ScraperEngine {
  constructor(siteConfig, options = {}) {
    this.config = siteConfig;
    this.sourceName = siteConfig.name;
    this.baseUrl = siteConfig.baseUrl.replace(/\/$/, '');
    this.options = {
      dryRun: options.dryRun || false,
      method: options.method || null, // force a specific method
      resume: options.resume !== false, // resume by default
      maxProducts: options.maxProducts || 0, // 0 = unlimited
      logFile: options.logFile || null,
      ...options,
    };

    this.products = {}; // key => product data
    this.scrapedUrls = new Set();
    this.failedUrls = [];
    this.startTime = Date.now();
    this.productCount = 0;
    this.progressFile = path.join(TMP_DIR, `${this.sourceName}-progress.json`);
    this.browser = null;
    this.page = null;

    // Ensure tmp dir exists
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

    // Load progress if resuming
    if (this.options.resume) this._loadProgress();
  }

  // ========== LOGGING ==========

  _elapsed() {
    return Math.round((Date.now() - this.startTime) / 1000) + 's';
  }

  log(msg) {
    const line = `[JADOMI ${this._elapsed()}] ${msg}`;
    console.log(line);
    if (this.options.logFile) {
      try { fs.appendFileSync(this.options.logFile, line + '\n'); } catch (e) { /* ignore */ }
    }
  }

  // ========== PROGRESS ==========

  _loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
        if (data.products && typeof data.products === 'object') {
          this.products = data.products;
          this.productCount = Object.keys(this.products).length;
        }
        if (data.scrapedUrls && Array.isArray(data.scrapedUrls)) {
          this.scrapedUrls = new Set(data.scrapedUrls);
        }
        this.log(`Resume: ${this.productCount} produits, ${this.scrapedUrls.size} URLs deja visitees`);
      }
    } catch (e) {
      this.log(`Pas de fichier de progression ou fichier corrompu, demarrage a zero`);
    }
  }

  _saveProgress() {
    try {
      const data = {
        sourceName: this.sourceName,
        savedAt: new Date().toISOString(),
        totalProducts: Object.keys(this.products).length,
        totalUrlsVisited: this.scrapedUrls.size,
        products: this.products,
        scrapedUrls: Array.from(this.scrapedUrls),
      };
      fs.writeFileSync(this.progressFile, JSON.stringify(data));
    } catch (e) {
      this.log(`ERREUR sauvegarde progression: ${e.message}`);
    }
  }

  // ========== BROWSER CONTROL ==========

  async _launch() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(this._randomUA());
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    });
    // Block images/fonts/media to speed up
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const rt = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  async _close() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) { /* ignore */ }
      this.browser = null;
      this.page = null;
    }
  }

  _randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  async _randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min) + min) * 1000;
    await new Promise(r => setTimeout(r, ms));
  }

  async _delay() {
    const level = this.config.antiBotLevel || 'none';
    if (level === 'heavy') {
      await this._randomDelay(5, 15);
    } else if (level === 'moderate') {
      await this._randomDelay(3, 10);
    } else {
      await this._randomDelay(2, 8);
    }
  }

  // Rotate user agent every N pages
  async _maybeRotateUA() {
    if (this.scrapedUrls.size % 50 === 0) {
      await this.page.setUserAgent(this._randomUA());
    }
  }

  async _waitForCloudflare() {
    for (let i = 0; i < 30; i++) {
      const title = await this.page.title();
      if (!title.includes('moment') && !title.includes('security') &&
          !title.includes('Performing') && !title.includes('challenge') &&
          !title.includes('Checking') && !title.includes('Just a moment') &&
          !title.includes('Attention Required')) {
        return true;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }

  async _goto(url, opts = {}) {
    const timeout = opts.timeout || 30000;
    try {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout });
      if (this.config.antiBotLevel === 'heavy' || this.config.antiBotLevel === 'moderate') {
        const ok = await this._waitForCloudflare();
        if (!ok) {
          this.log(`  BLOQUE par anti-bot sur ${url}`);
          return false;
        }
      }
      return true;
    } catch (e) {
      if (e.message.includes('timeout')) {
        // Retry once with longer timeout
        try {
          await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          return true;
        } catch (e2) {
          return false;
        }
      }
      return false;
    }
  }

  // ========== PRODUCT EXTRACTION (LISTING PAGE) ==========

  async _extractListingProducts(categoryName) {
    const sel = this.config.selectors || {};
    return this.page.evaluate((sel, cat, baseUrl) => {
      const items = [];
      const cardSelector = sel.productCard ||
        '.product-card,.product-item,.product,.card,.item-product,.product-miniature,.product_list_item,.thumbnail,.product-layout,.products-grid li,.product-grid-item,.product-container,article.product,[data-product-id],.product-box';
      document.querySelectorAll(cardSelector).forEach(el => {
        // Name
        let name = '';
        const nameSelector = sel.productName || 'h2,h3,h4,.product-name,.name,.product-title,.title,a[class*=name],a[class*=title],.product_name,.product-item-link';
        const nameEl = el.querySelector(nameSelector);
        if (nameEl) name = nameEl.textContent.trim().split('\n')[0].trim();
        if (!name) {
          const a = el.querySelector('a[href]');
          if (a && a.textContent.trim().length > 3) name = a.textContent.trim().split('\n')[0].trim();
        }

        // Price — try data attribute first (Magento), then text
        let price = null;
        // Method 1: Magento data-price-amount on finalPrice
        const priceFinal = el.querySelector('[data-price-type="finalPrice"] .price-wrapper,[data-price-type="finalPrice"],.special-price .price-wrapper');
        if (priceFinal) {
          const amt = priceFinal.getAttribute('data-price-amount');
          if (amt) price = parseFloat(amt);
        }
        // Method 2: CSS selector text
        if (!price) {
          const priceSelector = sel.price || '.price,.product-price,.current-price,.special-price .price,.final-price,.price-new';
          const pe = el.querySelector(priceSelector);
          if (pe) {
            price = parseFloat(pe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
            if (isNaN(price)) price = null;
          }
        }
        // Method 3: regex fallback
        if (!price) {
          const m = (el.innerText || '').match(/(\d[\d\s]*[.,]\d{2})\s*\u20ac/);
          if (m) price = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
        }

        // Old price — try data attribute first (Magento), then text
        let oldPrice = null;
        const priceOld = el.querySelector('[data-price-type="oldPrice"] .price-wrapper,[data-price-type="oldPrice"],.old-price .price-wrapper');
        if (priceOld) {
          const amt = priceOld.getAttribute('data-price-amount');
          if (amt) oldPrice = parseFloat(amt);
        }
        if (!oldPrice) {
          const oldPriceSelector = sel.oldPrice || '.old-price .price,.regular-price,.was-price,.price-old,.price-crossed,.prix-barre';
          const oe = el.querySelector(oldPriceSelector);
          if (oe) {
            oldPrice = parseFloat(oe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
            if (isNaN(oldPrice)) oldPrice = null;
          }
        }

        // URL
        let url = '';
        const linkEl = el.querySelector('a[href]');
        if (linkEl) url = linkEl.href || '';

        // Image
        let imageUrl = '';
        const imgSelector = sel.image || 'img,.product-image img,.product-img img';
        const imgEl = el.querySelector(imgSelector);
        if (imgEl) imageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';

        // SKU/Reference
        let ref = '';
        const skuSelector = sel.sku || '[data-sku],[data-ref],[data-id-product],.product-reference,.sku';
        const skuEl = el.querySelector(skuSelector);
        if (skuEl) {
          ref = skuEl.getAttribute('data-sku') || skuEl.getAttribute('data-ref') ||
                skuEl.getAttribute('data-id-product') || skuEl.textContent.trim();
        }
        if (!ref) ref = el.getAttribute('data-sku') || el.getAttribute('data-id-product') || '';

        // Brand (if visible in listing)
        let brand = '';
        const brandSelector = sel.brand || '.brand,.product-brand,.manufacturer,.brand-name';
        const brandEl = el.querySelector(brandSelector);
        if (brandEl) brand = brandEl.textContent.trim();

        if (name && name.length > 2 && price && price > 0.01) {
          items.push({
            name: name.substring(0, 500),
            price,
            oldPrice,
            ref: ref || '',
            url: url.startsWith('http') ? url : (url.startsWith('/') ? baseUrl + url : ''),
            imageUrl,
            brand,
            category: cat || '',
          });
        }
      });
      return items;
    }, sel, categoryName, this.baseUrl);
  }

  // ========== PRODUCT PAGE DETAIL EXTRACTION ==========

  async _extractProductDetail(productUrl) {
    const sel = this.config.selectors || {};
    return this.page.evaluate((sel, baseUrl) => {
      const result = {
        name: '',
        price: null,
        oldPrice: null,
        ref: '',
        brand: '',
        category: '',
        description: '',
        images: [],
        variants: [],
        gtin: '',
        unit: '',
      };

      // Name
      const nameEl = document.querySelector(sel.detailName || 'h1,.product-name,.product-title,h1.page-title,[itemprop="name"]');
      if (nameEl) result.name = nameEl.textContent.trim();

      // Price
      const priceEl = document.querySelector(sel.detailPrice || '.price,.product-price,.current-price,[itemprop="price"],[data-price-type="finalPrice"] .price,.special-price .price');
      if (priceEl) {
        const v = priceEl.getAttribute('content') || priceEl.textContent;
        result.price = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (isNaN(result.price)) result.price = null;
      }

      // Old price
      const oldEl = document.querySelector(sel.detailOldPrice || '.old-price,.was-price,.regular-price,.price-old,[data-price-type="oldPrice"] .price');
      if (oldEl) {
        result.oldPrice = parseFloat(oldEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (isNaN(result.oldPrice)) result.oldPrice = null;
      }

      // Reference / SKU
      const refEl = document.querySelector(sel.detailSku || '[itemprop="sku"],.product-reference,.sku,.ref,.reference,#product-reference,[data-sku]');
      if (refEl) result.ref = refEl.getAttribute('content') || refEl.textContent.trim().replace(/R[eé]f[\s.:]*/, '').trim();

      // Brand
      const brandEl = document.querySelector(sel.detailBrand || '[itemprop="brand"],[itemprop="manufacturer"],.product-brand,.brand,.manufacturer,.brand-name');
      if (brandEl) result.brand = (brandEl.getAttribute('content') || brandEl.textContent.trim());

      // Category breadcrumb
      const breadcrumbs = document.querySelectorAll(sel.breadcrumb || '.breadcrumb a,.breadcrumb li,nav.breadcrumb span,[itemprop="itemListElement"] [itemprop="name"],.breadcrumb_container a');
      if (breadcrumbs.length > 0) {
        const parts = [];
        breadcrumbs.forEach(b => {
          const t = b.textContent.trim();
          if (t && t.toLowerCase() !== 'accueil' && t.toLowerCase() !== 'home' && t !== '>') parts.push(t);
        });
        result.category = parts.join(' > ');
      }

      // Description
      const descEl = document.querySelector(sel.detailDescription || '[itemprop="description"],.product-description,.description,#description,.desc,.product-info-description');
      if (descEl) result.description = descEl.textContent.trim().substring(0, 1000);

      // Images
      const imgSelectors = sel.detailImages || '.product-image img,.gallery img,.product-images img,.fotorama img,[data-gallery] img,.product-img-box img,.product-media img,img.js-qv-product-cover,.product-cover img';
      document.querySelectorAll(imgSelectors).forEach(img => {
        let src = img.getAttribute('data-zoom-image') || img.getAttribute('data-large') ||
                  img.getAttribute('data-full') || img.src || img.getAttribute('data-src') || '';
        if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('no-image')) {
          result.images.push(src);
        } else if (src && src.startsWith('/')) {
          result.images.push(baseUrl + src);
        }
      });
      // Also check meta og:image
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg && ogImg.content) result.images.push(ogImg.content);
      // Deduplicate
      result.images = [...new Set(result.images)];

      // GTIN/EAN
      const gtinEl = document.querySelector('[itemprop="gtin13"],[itemprop="gtin"],[itemprop="ean"],.gtin,.ean');
      if (gtinEl) result.gtin = (gtinEl.getAttribute('content') || gtinEl.textContent.trim());

      // Unit / conditionnement
      const unitEl = document.querySelector('.unit,.conditionnement,.packaging,.product-unit');
      if (unitEl) result.unit = unitEl.textContent.trim();

      // Variants / Declinations
      // Look for select dropdowns, radio buttons, swatches
      const variantSelects = document.querySelectorAll(sel.variantSelect || 'select[name*="option"],select[name*="variant"],select[name*="attribute"],select[id*="group"],.product-variants select,select[name*="combination"]');
      variantSelects.forEach(select => {
        const label = select.previousElementSibling?.textContent?.trim() ||
                      select.closest('.form-group,.attribute-group,.variant-group')?.querySelector('label,.attribute-label,.variant-label')?.textContent?.trim() || '';
        select.querySelectorAll('option').forEach(opt => {
          if (opt.value && opt.textContent.trim() && !opt.textContent.includes('Choisir') && !opt.textContent.includes('Selectionner') && !opt.textContent.includes('---')) {
            result.variants.push({
              type: label.replace(':', '').trim(),
              value: opt.textContent.trim(),
              optionValue: opt.value,
            });
          }
        });
      });

      // Swatches (color, size buttons)
      const swatches = document.querySelectorAll(sel.variantSwatch || '.swatch-attribute .swatch-option,.variant-option,.color-option,.size-option,[data-attribute-id] .swatch,.product-variants input[type="radio"],.input-color,.attribute-list li a,.combination-item');
      swatches.forEach(sw => {
        const type = sw.closest('[data-attribute-label]')?.getAttribute('data-attribute-label') ||
                     sw.closest('.attribute-group,.swatch-attribute,.variant-group')?.querySelector('.attribute-label,.swatch-attribute-label,label')?.textContent?.trim() || '';
        const value = sw.getAttribute('aria-label') || sw.getAttribute('title') || sw.textContent.trim();
        if (value && value.length < 100) {
          result.variants.push({ type: type.replace(':', '').trim(), value, optionValue: sw.getAttribute('data-value') || '' });
        }
      });

      return result;
    }, sel, this.baseUrl);
  }

  // ========== ADD PRODUCT ==========

  _addProduct(product) {
    if (!product.name || !product.price || product.price <= 0) return false;
    const key = product.name + '||' + (product.ref || '');
    if (this.products[key]) return false;
    this.products[key] = product;
    this.productCount++;

    if (this.productCount % SAVE_EVERY === 0) {
      this._saveProgress();
      this.log(`  [Progression] ${this.productCount} produits, ${this.scrapedUrls.size} URLs`);
    }
    return true;
  }

  _addVariantProducts(baseProduct, variants) {
    if (!variants || variants.length === 0) {
      this._addProduct(baseProduct);
      return;
    }

    // Group variants by type
    const grouped = {};
    for (const v of variants) {
      const t = v.type || 'Option';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(v.value);
    }

    const types = Object.keys(grouped);
    if (types.length === 0) {
      this._addProduct(baseProduct);
      return;
    }

    // If only one variant type, create one product per variant
    if (types.length === 1) {
      const type = types[0];
      for (const val of grouped[type]) {
        const variantName = `${baseProduct.name} - ${type ? type + ' ' : ''}${val}`;
        this._addProduct({
          ...baseProduct,
          name: variantName,
        });
      }
    } else {
      // Multiple variant types - create cartesian product (limited)
      // To avoid explosion, just list variants in name
      const combos = this._cartesian(Object.values(grouped));
      const labels = types;
      const maxCombos = 100; // safety limit
      let count = 0;
      for (const combo of combos) {
        if (count >= maxCombos) break;
        const parts = combo.map((v, i) => `${labels[i]} ${v}`);
        const variantName = `${baseProduct.name} - ${parts.join(' - ')}`;
        this._addProduct({
          ...baseProduct,
          name: variantName,
        });
        count++;
      }
    }
  }

  _cartesian(arrays) {
    if (arrays.length === 0) return [[]];
    const rest = this._cartesian(arrays.slice(1));
    const result = [];
    for (const item of arrays[0]) {
      for (const r of rest) {
        result.push([item, ...r]);
      }
    }
    return result;
  }

  // ========== PAGINATION ==========

  async _getMaxPage() {
    const sel = this.config.selectors || {};
    const perPage = this.config.productsPerPage || 32;
    return this.page.evaluate((sel, perPage) => {
      let max = 1;

      // Method 1: total product count (Magento #product-count, PrestaShop .total-products)
      const countEl = document.querySelector('#product-count,.total-products,.toolbar-number,.products-count,[data-total-products]');
      if (countEl) {
        const totalMatch = countEl.textContent.match(/(\d[\d\s]*)/);
        if (totalMatch) {
          const total = parseInt(totalMatch[1].replace(/\s/g, ''));
          if (total > 0) max = Math.ceil(total / perPage);
        }
      }

      // Method 2: last page link number
      if (max <= 1) {
        const links = document.querySelectorAll('.pagination a,a.page,a[href*="page="],a[href*="p="],.pages a,.page-item a,.pager a,.pagination-list a,.page-numbers a,li.pages-item-next a');
        links.forEach(a => {
          const txt = a.textContent.match(/(\d+)/);
          if (txt) { const n = parseInt(txt[1]); if (n > max) max = n; }
          const href = (a.getAttribute('href') || '').match(/(?:page|p|pagina)=(\d+)/);
          if (href) { const n = parseInt(href[1]); if (n > max) max = n; }
        });
      }

      return Math.min(max, 500); // safety cap
    }, sel, perPage);
  }

  async _paginateUrl(baseUrlStr, pageNum) {
    // Build paginated URL based on site type
    const type = this.config.type;
    if (type === 'magento') {
      const sep = baseUrlStr.includes('?') ? '&' : '?';
      return baseUrlStr + sep + 'p=' + pageNum;
    } else if (type === 'prestashop') {
      const sep = baseUrlStr.includes('?') ? '&' : '?';
      return baseUrlStr + sep + 'page=' + pageNum;
    } else {
      // Generic: try both p= and page=
      const sep = baseUrlStr.includes('?') ? '&' : '?';
      return baseUrlStr + sep + 'page=' + pageNum;
    }
  }

  // ========== SCRAPE METHODS ==========

  /**
   * Method 1: Scrape by brands pages
   * Finds brand listing page, visits each brand, scrapes all products
   */
  async scrapeByBrands() {
    this.log('=== METHODE: Scrape par MARQUES ===');
    const brandsUrl = this.config.brandsPageUrl;
    if (!brandsUrl) {
      this.log('Pas de page marques configuree, methode ignoree');
      return;
    }

    const fullUrl = brandsUrl.startsWith('http') ? brandsUrl : this.baseUrl + brandsUrl;
    this.log(`Page marques: ${fullUrl}`);

    if (!await this._goto(fullUrl)) {
      this.log('Impossible de charger la page marques');
      return;
    }
    await this._delay();

    // Extract all brand links — broad strategy: any link pointing to /brands/SLUG or /marques/SLUG
    const brandLinks = await this.page.evaluate((baseUrl) => {
      const links = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        // Get brand name from text, or from img alt, or from URL slug
        let text = a.textContent.trim();
        if (!text || text.length < 2) {
          const img = a.querySelector('img');
          if (img) text = img.alt || img.title || '';
        }
        text = text.trim();
        if (!text || text.length < 2 || text.length > 100) return;
        if (!href.startsWith('http')) return;
        if (href.includes('login') || href.includes('cart') || href.includes('account')) return;

        // Match brand page patterns — must be /brands/SLUG or /marques/SLUG
        const brandMatch = href.match(/\/(brands?|marques?|manufacturer|fabricant)\/([^/?#]+)/);
        if (brandMatch) {
          // Skip utility pages (brands page itself, login, compare, etc.)
          const slug = brandMatch[2].toLowerCase();
          if (['login','cart','checkout','compare','account','contact','about','cms','search'].some(x => slug.includes(x))) return;
          links.push({ url: href, name: text });
        }
      });
      // Deduplicate by URL
      const seen = new Set();
      return links.filter(l => {
        const key = l.url.replace(/\/$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }, this.baseUrl);

    this.log(`${brandLinks.length} marques trouvees`);

    for (let i = 0; i < brandLinks.length; i++) {
      const bl = brandLinks[i];
      if (this.scrapedUrls.has(bl.url)) continue;

      this.log(`  [${i + 1}/${brandLinks.length}] Marque: ${bl.name}`);
      await this._scrapeCategoryPage(bl.url, bl.name);
      this.scrapedUrls.add(bl.url);
      await this._delay();
      await this._maybeRotateUA();
    }

    this.log(`Fin marques: ${Object.keys(this.products).length} produits`);
  }

  /**
   * Method 2: Scrape by category tree
   * Discovers all category links from nav/menu, scrapes each
   */
  async scrapeByCategories() {
    this.log('=== METHODE: Scrape par CATEGORIES ===');

    let startUrl = this.baseUrl;
    if (this.config.categoriesPageUrl) {
      startUrl = this.config.categoriesPageUrl.startsWith('http')
        ? this.config.categoriesPageUrl
        : this.baseUrl + this.config.categoriesPageUrl;
    }

    if (!await this._goto(startUrl)) {
      this.log('Impossible de charger la page pour decouvrir les categories');
      return;
    }
    await this._delay();

    // Try to open mobile menu / mega menu for full nav
    try {
      const menuBtn = await this.page.$('button[aria-label*="menu"],.menu-toggle,.nav-toggle,.hamburger,#menu-icon,.navbar-toggler');
      if (menuBtn) {
        await menuBtn.click();
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) { /* ignore */ }

    // Extract category links
    const catLinks = await this.page.evaluate((baseUrl, type) => {
      const links = new Map();
      const isLocalUrl = (url) => {
        try {
          const u = new URL(url);
          const b = new URL(baseUrl);
          return u.hostname === b.hostname || u.hostname.endsWith('.' + b.hostname.replace('www.', ''));
        } catch (e) { return false; }
      };

      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (!href || !isLocalUrl(href)) return;
        // Skip non-category URLs
        if (href.includes('login') || href.includes('cart') || href.includes('account') ||
            href.includes('contact') || href.includes('blog') || href.includes('javascript:') ||
            href.includes('checkout') || href.includes('customer') || href.includes('#') ||
            href.includes('cookie') || href.includes('cgv') || href.includes('mentions-legales') ||
            href.includes('politique') || href === baseUrl + '/' || href === baseUrl) return;
        const text = a.textContent.trim();
        if (text.length < 2 || text.length > 100) return;
        links.set(href, text);
      });

      return Array.from(links.entries()).map(([url, name]) => ({ url, name }));
    }, this.baseUrl, this.config.type);

    this.log(`${catLinks.length} categories decouvertes`);

    // Sort to process broader categories first (shorter paths)
    catLinks.sort((a, b) => a.url.split('/').length - b.url.split('/').length);

    for (let i = 0; i < catLinks.length; i++) {
      const cl = catLinks[i];
      if (this.scrapedUrls.has(cl.url)) continue;

      await this._scrapeCategoryPage(cl.url, cl.name);
      this.scrapedUrls.add(cl.url);

      if (i % 20 === 0 && i > 0) {
        this.log(`--- Categories: ${i}/${catLinks.length}, ${Object.keys(this.products).length} produits ---`);
      }
      await this._delay();
      await this._maybeRotateUA();
    }

    this.log(`Fin categories: ${Object.keys(this.products).length} produits`);
  }

  /**
   * Method 3: Scrape via sitemap.xml
   */
  async scrapeBySitemap() {
    this.log('=== METHODE: Scrape par SITEMAP ===');

    const sitemapUrl = this.config.sitemapUrl
      ? (this.config.sitemapUrl.startsWith('http') ? this.config.sitemapUrl : this.baseUrl + this.config.sitemapUrl)
      : this.baseUrl + '/sitemap.xml';

    this.log(`Sitemap: ${sitemapUrl}`);

    if (!await this._goto(sitemapUrl, { timeout: 30000 })) {
      this.log('Impossible de charger le sitemap');
      return;
    }

    let content = await this.page.content();
    let allUrls = [];

    // Check if it's a sitemap index
    if (content.includes('<sitemapindex') || content.includes('<sitemap>')) {
      const sitemapRefs = (content.match(/<loc>([^<]+\.xml[^<]*)<\/loc>/g) || [])
        .map(m => m.replace('<loc>', '').replace('</loc>', ''));
      this.log(`Sitemap index: ${sitemapRefs.length} sous-sitemaps`);

      for (const ref of sitemapRefs) {
        if (!await this._goto(ref, { timeout: 30000 })) continue;
        const subContent = await this.page.content();
        const urls = (subContent.match(/<loc>([^<]+)<\/loc>/g) || [])
          .map(m => m.replace('<loc>', '').replace('</loc>', ''));
        allUrls.push(...urls);
        this.log(`  ${ref.split('/').pop()}: ${urls.length} URLs`);
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      allUrls = (content.match(/<loc>([^<]+)<\/loc>/g) || [])
        .map(m => m.replace('<loc>', '').replace('</loc>', ''));
      this.log(`Sitemap direct: ${allUrls.length} URLs`);
    }

    // Filter to product/category URLs on this domain
    const baseHost = new URL(this.baseUrl).hostname;
    const filtered = allUrls.filter(url => {
      try {
        const u = new URL(url);
        return u.hostname === baseHost || u.hostname === 'www.' + baseHost;
      } catch (e) { return false; }
    }).filter(url => {
      return !url.includes('customer') && !url.includes('checkout') &&
             !url.includes('blog') && !url.includes('cookie') &&
             !url.includes('contact') && !url.includes('login') &&
             !url.includes('account') && !url.includes('cgv');
    });

    // Deduplicate
    const uniqueUrls = [...new Set(filtered)].sort();
    this.log(`URLs filtrées: ${uniqueUrls.length}`);

    // First pass: try URLs as category pages
    let directProductUrls = [];
    let categoryUrls = [];

    // Heuristic: URLs with many path segments or .html often = product pages
    for (const url of uniqueUrls) {
      const path = url.replace(this.baseUrl, '');
      const segments = path.split('/').filter(Boolean);
      if (this.config.type === 'magento' && path.endsWith('.html') && segments.length >= 2) {
        directProductUrls.push(url);
      } else if (this.config.type === 'prestashop' && /\d+-/.test(segments[segments.length - 1])) {
        directProductUrls.push(url);
      } else {
        categoryUrls.push(url);
      }
    }

    this.log(`Categories potentielles: ${categoryUrls.length}, Produits directs: ${directProductUrls.length}`);

    // Scrape category-like URLs first
    for (let i = 0; i < categoryUrls.length; i++) {
      if (this.scrapedUrls.has(categoryUrls[i])) continue;
      const catName = categoryUrls[i].replace(this.baseUrl, '').replace(/^\//, '').replace(/\.html$/, '').replace(/\//g, ' > ');
      await this._scrapeCategoryPage(categoryUrls[i], catName);
      this.scrapedUrls.add(categoryUrls[i]);

      if (i % 50 === 0 && i > 0) {
        this.log(`--- Sitemap categories: ${i}/${categoryUrls.length}, ${Object.keys(this.products).length} produits ---`);
      }
      await this._delay();
      await this._maybeRotateUA();
    }

    // Then visit direct product pages not yet in our set
    const productUrlsToVisit = directProductUrls.filter(u => !this.scrapedUrls.has(u));
    this.log(`Produits directs a visiter: ${productUrlsToVisit.length}`);

    for (let i = 0; i < productUrlsToVisit.length; i++) {
      if (this.scrapedUrls.has(productUrlsToVisit[i])) continue;
      await this._scrapeProductPage(productUrlsToVisit[i]);
      this.scrapedUrls.add(productUrlsToVisit[i]);

      if (i % 100 === 0 && i > 0) {
        this.log(`--- Sitemap produits: ${i}/${productUrlsToVisit.length}, ${Object.keys(this.products).length} produits ---`);
      }
      await this._delay();
      await this._maybeRotateUA();
    }

    this.log(`Fin sitemap: ${Object.keys(this.products).length} produits`);
  }

  /**
   * Method 4: Scrape by search (alphabetical + keyword)
   */
  async scrapeBySearch() {
    this.log('=== METHODE: Scrape par RECHERCHE ===');

    const searchPattern = this.config.searchUrlPattern;
    if (!searchPattern) {
      this.log('Pas de pattern de recherche configure, methode ignoree');
      return;
    }

    const baseSearchUrl = searchPattern.startsWith('http')
      ? searchPattern
      : this.baseUrl + searchPattern;

    // Build query list: single letters, double letters, dental keywords
    const queries = [];
    const alpha = 'abcdefghijklmnopqrstuvwxyz';

    // Single letters
    for (const c of alpha) queries.push(c);

    // Double letters (only common combos to save time)
    const commonPrefixes = ['co', 'pr', 'de', 'en', 'im', 'se', 'fr', 'ci', 'au', 'si', 'tu', 're', 'di', 'ce', 'st'];
    for (const p of commonPrefixes) {
      for (const c of alpha) queries.push(p + c);
    }

    // Dental-specific keywords
    const dentalKeywords = [
      'composite', 'resine', 'ciment', 'colle', 'adhesif', 'bonding',
      'fraise', 'foret', 'lime', 'endodontie', 'endo', 'canal',
      'implant', 'pilier', 'abutment', 'vis', 'transfert',
      'empreinte', 'alginate', 'silicone', 'putty', 'light', 'wash',
      'gant', 'masque', 'protection', 'desinfection', 'sterilisation',
      'autoclave', 'turbine', 'contre-angle', 'detartrage', 'ultrason',
      'ceramique', 'zircone', 'disilicate', 'emax', 'porcelaine',
      'prothese', 'provisoire', 'temporary', 'crown', 'bridge',
      'orthodontie', 'bracket', 'arc', 'elastique', 'ligature',
      'blanchiment', 'peroxyde', 'gel', 'gouttiere',
      'radiographie', 'capteur', 'panoramique', 'cone beam',
      'anesthesie', 'carpule', 'aiguille', 'seringue',
      'digue', 'matrice', 'coin', 'wedge', 'bande',
      'polissage', 'strip', 'disque', 'pate',
      'photopolymeriser', 'lampe', 'LED',
      'obturation', 'verre ionomere', 'GIC',
      'chirurgie', 'bistouri', 'suture', 'fil',
      'prophylaxie', 'fluor', 'vernis', 'scellement',
      'davier', 'syndesmotome', 'elevateur',
      'ecarteur', 'miroir', 'sonde', 'precelle',
      'cire', 'articulation', 'articulateur',
      'fauteuil', 'unit', 'aspiration', 'compresseur',
    ];
    for (const kw of dentalKeywords) queries.push(kw);

    // 3-digit number ranges (for product codes)
    for (let i = 100; i <= 999; i += 50) queries.push(String(i));

    this.log(`${queries.length} requetes de recherche`);

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const searchUrl = baseSearchUrl + encodeURIComponent(query);
      if (this.scrapedUrls.has(searchUrl)) continue;

      try {
        if (!await this._goto(searchUrl, { timeout: 20000 })) continue;
        const products = await this._extractListingProducts(`Recherche: ${query}`);
        let added = 0;
        for (const p of products) {
          p.url = p.url || searchUrl;
          if (this._addProduct({ ...p, supplier: this.sourceName })) added++;
        }
        if (added > 0) this.log(`  "${query}" +${added} = ${Object.keys(this.products).length}`);

        // Paginate search results
        const maxPage = await this._getMaxPage();
        for (let pg = 2; pg <= Math.min(maxPage, 20); pg++) {
          const pageUrl = await this._paginateUrl(searchUrl, pg);
          if (!await this._goto(pageUrl, { timeout: 15000 })) break;
          const pageProducts = await this._extractListingProducts(`Recherche: ${query} p${pg}`);
          for (const p of pageProducts) {
            p.url = p.url || pageUrl;
            this._addProduct({ ...p, supplier: this.sourceName });
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (e) { /* continue */ }

      this.scrapedUrls.add(searchUrl);
      if (i % 50 === 0 && i > 0) {
        this.log(`--- Recherche: ${i}/${queries.length}, ${Object.keys(this.products).length} produits ---`);
      }
      await this._delay();
      await this._maybeRotateUA();
    }

    this.log(`Fin recherche: ${Object.keys(this.products).length} produits`);
  }

  // ========== HELPERS ==========

  /**
   * Scrape a category/listing page including pagination,
   * then optionally enter each product page for variants
   */
  async _scrapeCategoryPage(url, categoryName) {
    if (!await this._goto(url)) return;

    const products = await this._extractListingProducts(categoryName);
    let added = 0;
    const productUrls = [];

    for (const p of products) {
      p.category = p.category || categoryName;
      if (this._addProduct({ ...p, supplier: this.sourceName })) added++;
      if (p.url && p.url.startsWith('http')) productUrls.push(p.url);
    }

    if (added > 0) {
      this.log(`  CAT ${categoryName.substring(0, 50).padEnd(50)} +${added} = ${Object.keys(this.products).length}`);
    }

    // Pagination
    const maxPage = await this._getMaxPage();
    if (maxPage > 1) this.log(`    Pagination: ${maxPage} pages detectees`);
    for (let pg = 2; pg <= maxPage; pg++) {
      const pageUrl = await this._paginateUrl(url, pg);
      if (!await this._goto(pageUrl, { timeout: 20000 })) break;
      const pageProducts = await this._extractListingProducts(categoryName);
      let pageAdded = 0;
      for (const p of pageProducts) {
        p.category = p.category || categoryName;
        if (this._addProduct({ ...p, supplier: this.sourceName })) pageAdded++;
        if (p.url && p.url.startsWith('http')) productUrls.push(p.url);
      }
      if (pageAdded === 0 && pageProducts.length === 0) break; // No more products
      await new Promise(r => setTimeout(r, 1500));
    }

    // Phase 2: Enter individual product pages for variant details
    // Only if explicitly requested (slow — ~10s per product)
    if (this.options.withVariants && this.config.hasVariants !== false) {
      await this._visitProductPages(productUrls);
    }
  }

  /**
   * Visit individual product pages to extract variants
   */
  async _visitProductPages(urls) {
    // Limit to unvisited URLs
    const toVisit = urls.filter(u => !this.scrapedUrls.has(u));
    if (toVisit.length === 0) return;

    for (const url of toVisit) {
      if (this.scrapedUrls.has(url)) continue;
      await this._scrapeProductPage(url);
      this.scrapedUrls.add(url);
      await this._delay();
    }
  }

  /**
   * Scrape a single product page for full details + variants
   */
  async _scrapeProductPage(url) {
    if (!await this._goto(url, { timeout: 20000 })) {
      this.failedUrls.push(url);
      return;
    }

    try {
      const detail = await this._extractProductDetail(url);
      if (!detail.name || !detail.price) return;

      const baseProduct = {
        name: detail.name,
        price: detail.price,
        oldPrice: detail.oldPrice,
        ref: detail.ref,
        brand: detail.brand,
        category: detail.category,
        description: detail.description,
        imageUrl: detail.images[0] || '',
        allImages: detail.images,
        gtin: detail.gtin,
        unit: detail.unit,
        url: url,
        supplier: this.sourceName,
      };

      if (detail.variants.length > 0) {
        this._addVariantProducts(baseProduct, detail.variants);
      } else {
        this._addProduct(baseProduct);
      }
    } catch (e) {
      this.failedUrls.push(url);
    }
  }

  // ========== IMPORT TO SUPABASE ==========

  async _importToSupabase() {
    const products = Object.values(this.products);
    if (products.length === 0) {
      this.log('Aucun produit a importer');
      return 0;
    }

    if (this.options.dryRun) {
      this.log(`[DRY RUN] ${products.length} produits auraient ete importes`);
      return products.length;
    }

    this.log(`\nImport de ${products.length} produits vers Supabase...`);
    let totalImported = 0;
    const totalBatches = Math.ceil(products.length / CHUNK_SIZE);

    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      const batchNum = Math.floor(i / CHUNK_SIZE) + 1;

      const payload = JSON.stringify({
        source: this.sourceName,
        products: chunk.map(p => ({
          name: p.name,
          price: p.price,
          ref: p.ref || '',
          price_original: p.oldPrice || null,
          discount: p.oldPrice && p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : null,
          category: p.category || null,
          url: p.url || null,
          brand: p.brand || null,
          unit: p.unit || null,
          image_url: p.imageUrl || null,
        })),
        page: `${this.sourceName}-batch-${batchNum}`,
      });

      try {
        const result = await new Promise((resolve, reject) => {
          const u = new URL(IMPORT_URL);
          const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            timeout: 30000,
          }, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          req.write(payload);
          req.end();
        });
        const imported = result.imported || 0;
        totalImported += imported;
        this.log(`  Lot ${batchNum}/${totalBatches}: ${imported} importes`);
      } catch (e) {
        this.log(`  Lot ${batchNum}/${totalBatches}: ERREUR - ${e.message}`);
      }
    }

    this.log(`Import termine: ${totalImported}/${products.length}`);
    return totalImported;
  }

  // ========== ALGOLIA API SCRAPING ==========

  /**
   * Method 5: Scrape via Algolia search API
   * Uses Algolia REST API directly — no browser needed after initial config extraction
   */
  async scrapeByAlgolia() {
    this.log('=== METHODE: Scrape par ALGOLIA API ===');

    const algConf = this.config.algoliaConfig;
    if (!algConf) {
      this.log('Pas de config Algolia, methode ignoree');
      return;
    }

    let appId = algConf.appId;
    let apiKey = algConf.apiKey || null;
    const indexName = algConf.indexName;
    const brandFacet = algConf.brandFacet || 'sap_mvgr3';

    // Step 1: If no apiKey provided, try to extract from homepage via Puppeteer
    if (!apiKey) {
      this.log('Extraction de la cle API Algolia depuis la homepage...');
      try {
        const extracted = await this.page.evaluate(() => {
          if (window.algoliaConfig) {
            return {
              appId: window.algoliaConfig.applicationId || window.algoliaConfig.appId || null,
              apiKey: window.algoliaConfig.apiKey || window.algoliaConfig.apikey || null,
            };
          }
          // Try to find in script tags
          const scripts = document.querySelectorAll('script');
          for (const s of scripts) {
            const text = s.textContent || '';
            const appMatch = text.match(/applicationId["']\s*[:=]\s*["']([A-Z0-9]+)["']/);
            const keyMatch = text.match(/apiKey["']\s*[:=]\s*["']([a-f0-9]+)["']/);
            if (appMatch && keyMatch) {
              return { appId: appMatch[1], apiKey: keyMatch[1] };
            }
          }
          return null;
        });
        if (extracted) {
          if (extracted.appId) appId = extracted.appId;
          if (extracted.apiKey) apiKey = extracted.apiKey;
          this.log(`Algolia config extraite: appId=${appId}, apiKey=${apiKey ? apiKey.substring(0, 8) + '...' : 'NON TROUVEE'}`);
        }
      } catch (e) {
        this.log(`Erreur extraction Algolia config: ${e.message}`);
      }
    }

    if (!appId || !apiKey) {
      this.log('ERREUR: appId ou apiKey Algolia manquant, impossible de continuer');
      return;
    }

    // Step 2: Close browser — we'll use fetch/http from here
    await this._close();
    this.log('Browser ferme, passage en mode API directe');

    const algoliaUrl = `https://${appId}-dsn.algolia.net/1/indexes/${indexName}_products/query`;
    const headers = {
      'X-Algolia-Application-Id': appId,
      'X-Algolia-API-Key': apiKey,
      'Content-Type': 'application/json',
    };

    // Helper: query Algolia
    const queryAlgolia = async (body) => {
      const payload = JSON.stringify(body);
      return new Promise((resolve, reject) => {
        const u = new URL(algoliaUrl);
        const proto = u.protocol === 'https:' ? require('https') : require('http');
        const req = proto.request({
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname,
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 30000,
        }, res => {
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON: ' + data.substring(0, 200))); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Algolia request timeout')); });
        req.write(payload);
        req.end();
      });
    };

    // Helper: process hits
    const processHits = (hits) => {
      let added = 0;
      for (const hit of hits) {
        try {
          const name = hit.name || '';
          let price = null;
          // Navigate price path: price.EUR.default
          if (hit.price && hit.price.EUR && hit.price.EUR.default !== undefined) {
            price = parseFloat(hit.price.EUR.default);
          } else if (hit.price && typeof hit.price === 'number') {
            price = hit.price;
          }
          if (!name || !price || price <= 0) continue;

          const ref = Array.isArray(hit.sku) ? hit.sku[0] : (hit.sku || '');
          const category = Array.isArray(hit.categories) ? hit.categories.join(' > ') : (hit.categories || '');
          const brand = hit[brandFacet] || '';
          const url = hit.url ? (hit.url.startsWith('http') ? hit.url : this.baseUrl + hit.url) : '';

          if (this._addProduct({
            name,
            price,
            ref,
            brand,
            category,
            url,
            supplier: this.sourceName,
          })) {
            added++;
          }
        } catch (e) { /* skip invalid hit */ }
      }
      return added;
    };

    // Step 3: Get all brands via facets query
    this.log('Recuperation des marques via facets Algolia...');
    let brands = {};
    try {
      const facetResult = await queryAlgolia({
        query: '',
        hitsPerPage: 0,
        facets: [brandFacet],
        maxValuesPerFacet: 1000,
      });
      brands = (facetResult.facets && facetResult.facets[brandFacet]) || {};
      this.log(`${Object.keys(brands).length} marques trouvees, ${facetResult.nbHits || 0} produits total`);
    } catch (e) {
      this.log(`Erreur facets Algolia: ${e.message}`);
      return;
    }

    // Step 4: Query products by brand
    const brandNames = Object.keys(brands);
    const priceRanges = [
      [0, 5], [5, 10], [10, 20], [20, 50], [50, 100],
      [100, 200], [200, 500], [500, 2000], [2000, 999999],
    ];

    for (let i = 0; i < brandNames.length; i++) {
      const brand = brandNames[i];
      const count = brands[brand];
      this.log(`  [${i + 1}/${brandNames.length}] Marque: ${brand} (${count} produits)`);

      if (count <= 1000) {
        // Small brand: single query
        try {
          let page = 0;
          let totalPages = 1;
          while (page < totalPages) {
            const result = await queryAlgolia({
              query: '',
              hitsPerPage: 1000,
              page,
              facetFilters: [[`${brandFacet}:${brand}`]],
              attributesToRetrieve: ['name', 'price', brandFacet, 'sku', 'categories', 'url'],
            });
            totalPages = result.nbPages || 1;
            const added = processHits(result.hits || []);
            if (added > 0) this.log(`    Page ${page + 1}/${totalPages}: +${added} produits`);
            page++;
          }
        } catch (e) {
          this.log(`    Erreur marque ${brand}: ${e.message}`);
        }
      } else {
        // Big brand (>1000): split by price ranges
        this.log(`    Grande marque, split par tranches de prix...`);
        for (const [minPrice, maxPrice] of priceRanges) {
          try {
            let page = 0;
            let totalPages = 1;
            while (page < totalPages) {
              const result = await queryAlgolia({
                query: '',
                hitsPerPage: 1000,
                page,
                facetFilters: [[`${brandFacet}:${brand}`]],
                numericFilters: [`price.EUR.default>=${minPrice}`, `price.EUR.default<${maxPrice}`],
                attributesToRetrieve: ['name', 'price', brandFacet, 'sku', 'categories', 'url'],
              });
              totalPages = result.nbPages || 1;
              const added = processHits(result.hits || []);
              if (added > 0) this.log(`    Prix ${minPrice}-${maxPrice} p${page + 1}: +${added}`);
              page++;
            }
          } catch (e) {
            this.log(`    Erreur tranche ${minPrice}-${maxPrice}: ${e.message}`);
          }
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    // Step 5: Final pass without brand filter to catch unbranded products
    this.log('Passe finale: produits sans marque...');
    try {
      let page = 0;
      let totalPages = 1;
      while (page < totalPages && page < 100) {
        const result = await queryAlgolia({
          query: '',
          hitsPerPage: 1000,
          page,
          attributesToRetrieve: ['name', 'price', brandFacet, 'sku', 'categories', 'url'],
        });
        totalPages = result.nbPages || 1;
        const added = processHits(result.hits || []);
        if (added > 0) this.log(`  Sans filtre p${page + 1}/${totalPages}: +${added}`);
        if (added === 0 && page > 0) break; // No new products found
        page++;
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {
      this.log(`Erreur passe sans filtre: ${e.message}`);
    }

    this.log(`Fin Algolia: ${Object.keys(this.products).length} produits`);
  }

  // ========== MAIN RUNNER ==========

  async run() {
    this.log(`\n${'='.repeat(60)}`);
    this.log(`JADOMI Scraper Universel — ${this.sourceName.toUpperCase()}`);
    this.log(`Site: ${this.baseUrl}`);
    this.log(`Type: ${this.config.type} | Anti-bot: ${this.config.antiBotLevel || 'none'}`);
    this.log(`${'='.repeat(60)}\n`);

    try {
      await this._launch();

      // Warmup: visit homepage
      this.log('Warmup: visite homepage...');
      await this._goto(this.baseUrl, { timeout: 60000 });
      await this._delay();

      // Determine which methods to run
      const forcedMethod = this.options.method;
      if (forcedMethod) {
        await this._runMethod(forcedMethod);
      } else if (this.config.algoliaConfig) {
        // Algolia API — fastest and most complete, bypasses anti-bot
        await this._runMethod('algolia');
      } else {
        // Auto-select methods based on site config
        // Priority: sitemap > brands > categories > search
        if (this.config.sitemapUrl || this.config.type === 'magento') {
          await this._runMethod('sitemap');
        }
        if (this.config.brandsPageUrl) {
          await this._runMethod('brands');
        }
        // Always do categories
        await this._runMethod('categories');
        // Search as final pass to catch anything missed
        if (this.config.searchUrlPattern) {
          await this._runMethod('search');
        }
      }

      // Save final state
      this._saveProgress();

      // Export backup file
      const backupFile = path.join(TMP_DIR, `${this.sourceName}-${new Date().toISOString().slice(0, 10)}.json`);
      const allProducts = Object.values(this.products);
      fs.writeFileSync(backupFile, JSON.stringify(allProducts, null, 2));
      this.log(`Backup: ${backupFile}`);

      // Import to Supabase
      const imported = await this._importToSupabase();

      // Final stats
      this.log(`\n${'='.repeat(60)}`);
      this.log(`RESULTATS — ${this.sourceName.toUpperCase()}`);
      this.log(`Produits uniques: ${allProducts.length}`);
      this.log(`URLs visitees: ${this.scrapedUrls.size}`);
      this.log(`URLs echouees: ${this.failedUrls.length}`);
      this.log(`Importes en base: ${imported}`);
      this.log(`Duree totale: ${this._elapsed()}`);
      this.log(`${'='.repeat(60)}\n`);

      return {
        source: this.sourceName,
        totalProducts: allProducts.length,
        imported,
        urlsVisited: this.scrapedUrls.size,
        urlsFailed: this.failedUrls.length,
        elapsed: this._elapsed(),
      };
    } catch (e) {
      this.log(`ERREUR FATALE: ${e.message}`);
      this._saveProgress();
      throw e;
    } finally {
      await this._close();
    }
  }

  async _runMethod(method) {
    try {
      switch (method) {
        case 'algolia': await this.scrapeByAlgolia(); break;
        case 'brands': await this.scrapeByBrands(); break;
        case 'categories': await this.scrapeByCategories(); break;
        case 'sitemap': await this.scrapeBySitemap(); break;
        case 'search': await this.scrapeBySearch(); break;
        default: this.log(`Methode inconnue: ${method}`);
      }
    } catch (e) {
      this.log(`Erreur methode ${method}: ${e.message}`);
    }
  }

  // ========== STATIC STATS ==========

  static getStats(sourceName) {
    const progressFile = path.join(TMP_DIR, `${sourceName}-progress.json`);
    try {
      if (!fs.existsSync(progressFile)) return null;
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      return {
        source: data.sourceName || sourceName,
        savedAt: data.savedAt,
        totalProducts: data.totalProducts || 0,
        totalUrlsVisited: data.totalUrlsVisited || 0,
      };
    } catch (e) {
      return null;
    }
  }
}

module.exports = ScraperEngine;
