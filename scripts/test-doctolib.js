require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'fr-FR'
  });
  const page = await context.newPage();

  console.log('1. Navigation vers login...');
  await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Fermer cookies
  await page.evaluate(() => {
    if (window.Didomi) { window.Didomi.setUserAgreeToAll(); }
    document.querySelectorAll('#didomi-host').forEach(el => el.remove());
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: '/tmp/doctolib-login.png', fullPage: true });
  console.log('2. Screenshot login sauvegarde');

  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(e => ({ type: e.type, name: e.name, id: e.id, placeholder: e.placeholder, cls: e.className.substring(0, 60) }));
  });
  console.log('3. Inputs:', JSON.stringify(inputs, null, 2));

  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button, [role="button"], a[href*="login"]')].map(e => ({ tag: e.tagName, text: e.textContent.trim().substring(0, 60), type: e.type, cls: e.className.substring(0, 60) }));
  });
  console.log('4. Boutons:', JSON.stringify(buttons, null, 2));

  // URL actuelle
  console.log('5. URL:', page.url());

  // Contenu HTML partiel
  const html = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
  console.log('6. HTML (2000 chars):', html.substring(0, 1000));

  await browser.close();
  console.log('Done');
})();
