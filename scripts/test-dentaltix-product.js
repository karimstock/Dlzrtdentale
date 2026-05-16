const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });

  // 1. Test a category page - composites
  console.log('=== CATEGORY: COMPOSITES ===');
  await page.goto('https://www.dentaltix.com/fr/composites', { waitUntil: 'networkidle2', timeout: 30000 });
  const categoryData = await page.evaluate(() => {
    // Look for product cards/items
    const products = [];
    // Try multiple selectors
    const cards = document.querySelectorAll('.views-row, .product-teaser, .node--type-product, [class*="product-card"], [class*="commerce-product"], .product-list__item, article');
    cards.forEach(card => {
      const title = card.querySelector('h2, h3, .product-title, [class*="title"]')?.textContent?.trim();
      const price = card.querySelector('.price, .commerce-price, [class*="price"], .field--name-price')?.textContent?.trim();
      const link = card.querySelector('a')?.href;
      if (title && title.length > 3) {
        products.push({ title: title.substring(0, 80), price, link });
      }
    });
    return { total: products.length, products: products.slice(0, 10) };
  });
  console.log('Products found in category:', categoryData.total);
  categoryData.products.forEach(p => console.log(`  ${p.title} | ${p.price || 'no price'} | ${p.link}`));

  // 2. Scrape a product URL from the /fr/ sitemap
  console.log('\n=== FR SITEMAP PRODUCT URLs ===');
  await page.goto('https://www.dentaltix.com/fr/sitemap.xml', { waitUntil: 'networkidle2', timeout: 30000 });
  const frSitemapContent = await page.content();
  const frLocs = frSitemapContent.match(/<loc>(.*?)<\/loc>/g);
  console.log('Total FR sitemap URLs:', frLocs?.length || 0);
  const frProductUrls = frLocs?.filter(m => {
    const url = m.replace(/<\/?loc>/g, '');
    return url.includes('/fr/') && !url.includes('/blog/') && !url.includes('error-404') && !url.includes('sitemap') && url !== 'https://www.dentaltix.com/fr/';
  }).map(m => m.replace(/<\/?loc>/g, ''));
  console.log('FR product-like URLs:', frProductUrls?.length || 0);
  console.log('Sample FR URLs:');
  frProductUrls?.slice(0, 15).forEach(u => console.log('  ', u));

  // 3. Scrape an actual product page
  if (frProductUrls?.length > 0) {
    const testUrl = frProductUrls.find(u => !u.includes('contact') && !u.includes('notre-philosophie') && !u.includes('plan-du-site'));
    console.log('\n=== PRODUCT PAGE:', testUrl, '===');
    await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const productData = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim();
      return {
        title: getText('h1') || getText('.page-title') || getText('[class*="product-title"]'),
        price: getText('.price') || getText('[class*="price"]') || getText('.commerce-price'),
        brand: getText('[class*="brand"]') || getText('[class*="marca"]'),
        reference: getText('[class*="reference"]') || getText('[class*="sku"]'),
        description: (getText('.field--name-body') || getText('[class*="description"]') || '')?.substring(0, 200),
        allPrices: Array.from(document.querySelectorAll('[class*="price"]')).map(el => el.textContent.trim()),
        bodyClasses: document.body.className
      };
    });
    console.log('Product data:', JSON.stringify(productData, null, 2));
  }

  // 4. Test converting /es/ to /fr/ URLs
  console.log('\n=== ES->FR URL CONVERSION TEST ===');
  const esUrl = 'https://www.dentaltix.com/es/3m/puntas-dispensacion-composite-filtek-bulk-fill-20ud';
  const frUrl = esUrl.replace('/es/', '/fr/');
  console.log('Testing FR URL:', frUrl);
  const resp = await page.goto(frUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('Status:', resp.status());
  console.log('Final URL:', page.url());
  const convTitle = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim());
  console.log('Title:', convTitle);

  await browser.close();
  console.log('\n[DONE]');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
