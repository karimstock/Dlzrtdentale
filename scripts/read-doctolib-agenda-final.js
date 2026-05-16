require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  // Restaurer les cookies sauvegardes
  let contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  };

  // Charger le state sauvegarde (cookies + localStorage)
  try {
    const state = JSON.parse(fs.readFileSync('/home/ubuntu/jadomi/.doctolib-state.json', 'utf8'));
    contextOptions.storageState = state;
    console.log('[1] Cookies restaures depuis state sauvegarde');
  } catch (e) {
    console.log('[1] Pas de state sauvegarde, login fresh');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Verifier si on est deja connecte
  await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  let currentUrl = page.url();
  console.log('[2] URL:', currentUrl);

  // Si redirige vers login, refaire le login complet
  if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth.doctolib')) {
    console.log('[3] Session expiree, re-login...');

    await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => { if (window.Didomi) window.Didomi.setUserAgreeToAll(); });
    await new Promise(r => setTimeout(r, 1000));

    await (await page.$('input[type="email"]')).type(process.env.DOCTOLIB_EMAIL, { delay: 80 });
    await new Promise(r => setTimeout(r, 800));
    await page.click('button[type="submit"]');

    await page.waitForSelector('input[type="password"]:not(.hidden)', { state: 'visible', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    await (await page.$('input[type="password"]:not(.hidden)')).type(process.env.DOCTOLIB_PASSWORD, { delay: 80 });
    await new Promise(r => setTimeout(r, 800));
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    currentUrl = page.url();
    console.log('[3b] Apres login:', currentUrl);

    // Si 2FA demande
    if (currentUrl.includes('two-factor')) {
      console.log('[3c] 2FA requis — envoie-moi le code');
      await browser.close();
      return;
    }

    // Naviguer vers agenda
    await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    currentUrl = page.url();
  }

  console.log('[4] Page agenda:', currentUrl);
  await page.screenshot({ path: '/tmp/doctolib-agenda-real.png', fullPage: true });
  console.log('[5] Screenshot sauvegarde');

  // Attendre que le contenu charge
  await new Promise(r => setTimeout(r, 5000));

  // Extraire TOUT le contenu de la page
  const agendaContent = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.substring(0, 5000),
      html: document.body.innerHTML.substring(0, 10000)
    };
  });

  console.log('\n=== CONTENU AGENDA ===');
  console.log(agendaContent.bodyText.substring(0, 3000));

  // Sauvegarder
  fs.writeFileSync('/tmp/doctolib-agenda-content.json', JSON.stringify(agendaContent, null, 2));

  // Sauvegarder cookies frais
  const newState = await context.storageState();
  fs.writeFileSync('/home/ubuntu/jadomi/.doctolib-state.json', JSON.stringify(newState, null, 2));
  console.log('\n[6] State mis a jour');

  await browser.close();
  console.log('Done');
})();
