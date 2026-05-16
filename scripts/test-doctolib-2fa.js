require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  });
  const page = await context.newPage();

  // === LOGIN ===
  console.log('[1] Login...');
  await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => { if (window.Didomi) window.Didomi.setUserAgreeToAll(); });
  await new Promise(r => setTimeout(r, 1000));

  // Email
  const emailInput = await page.$('input[type="email"]');
  await emailInput.type(process.env.DOCTOLIB_EMAIL, { delay: 80 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('button[type="submit"]');

  // Password
  await page.waitForSelector('input[type="password"]:not(.hidden)', { state: 'visible', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const passInput = await page.$('input[type="password"]:not(.hidden)');
  await passInput.type(process.env.DOCTOLIB_PASSWORD, { delay: 80 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  console.log('[2] URL apres login:', page.url());
  await page.screenshot({ path: '/tmp/doctolib-2fa-page.png', fullPage: true });

  // === PAGE 2FA — analyser ce qu'on voit ===
  const pageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      text: document.body.innerText.substring(0, 2000),
      inputs: [...document.querySelectorAll('input')].map(e => ({
        type: e.type, name: e.name, id: e.id, placeholder: e.placeholder,
        maxLength: e.maxLength, cls: e.className.substring(0, 80)
      })),
      buttons: [...document.querySelectorAll('button')].map(e => ({
        text: e.textContent.trim().substring(0, 60), type: e.type
      })),
      links: [...document.querySelectorAll('a')].map(e => ({
        text: e.textContent.trim().substring(0, 60), href: e.href
      }))
    };
  });

  console.log('\n=== PAGE 2FA ===');
  console.log('URL:', pageInfo.url);
  console.log('\nTexte visible:');
  console.log(pageInfo.text.substring(0, 500));
  console.log('\nInputs:', JSON.stringify(pageInfo.inputs, null, 2));
  console.log('\nBoutons:', JSON.stringify(pageInfo.buttons, null, 2));

  // === TENTER LE PIN 4446 ===
  const pinInput = await page.$('input[type="tel"], input[type="number"], input[type="text"][maxlength="4"], input[type="text"][maxlength="6"], input[name*="code"], input[name*="pin"], input[id*="code"], input[id*="pin"]');

  if (pinInput) {
    console.log('\n[3] Champ code trouve ! Saisie du PIN...');
    await pinInput.type('4446', { delay: 120 });
    await new Promise(r => setTimeout(r, 1000));

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('[4] PIN soumis, attente...');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    console.log('[5] URL apres PIN:', page.url());
    await page.screenshot({ path: '/tmp/doctolib-after-pin.png', fullPage: true });

    // Sauvegarder les cookies si on est connecte
    if (!page.url().includes('login') && !page.url().includes('signin') && !page.url().includes('two-factor')) {
      const cookies = await context.cookies();
      fs.writeFileSync('/home/ubuntu/jadomi/.doctolib-cookies.json', JSON.stringify(cookies, null, 2));
      console.log('[6] COOKIES SAUVEGARDES ! Connexion reussie !');
    } else {
      console.log('[6] Toujours sur la page login/2FA — PIN incorrect ou autre verification requise');
    }
  } else {
    console.log('\n[3] Pas de champ PIN trouve, screenshot pour analyse');
  }

  await browser.close();
  console.log('Done');
})();
