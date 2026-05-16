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

  const emailInput = await page.$('input[type="email"]');
  await emailInput.type(process.env.DOCTOLIB_EMAIL, { delay: 80 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('button[type="submit"]');

  await page.waitForSelector('input[type="password"]:not(.hidden)', { state: 'visible', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const passInput = await page.$('input[type="password"]:not(.hidden)');
  await passInput.type(process.env.DOCTOLIB_PASSWORD, { delay: 80 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  console.log('[2] Page 2FA:', page.url());

  // === SELECTIONNER EMAIL ===
  // Le premier radio button = Email
  const emailRadio = await page.$('input[type="radio"][name="method"]');
  if (emailRadio) {
    await emailRadio.click();
    console.log('[3] Option Email selectionnee');
    await new Promise(r => setTimeout(r, 500));
  }

  // Cliquer Valider
  const validerBtn = await page.$('button[type="submit"]');
  if (validerBtn) {
    await validerBtn.click();
    console.log('[4] Valider clique — code envoye par email');
  }

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  console.log('[5] URL apres validation:', page.url());
  await page.screenshot({ path: '/tmp/doctolib-code-email.png', fullPage: true });

  // Analyser la page de saisie du code
  const codePageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      text: document.body.innerText.substring(0, 1000),
      inputs: [...document.querySelectorAll('input')].map(e => ({
        type: e.type, name: e.name, id: e.id, placeholder: e.placeholder,
        maxLength: e.maxLength
      })),
      buttons: [...document.querySelectorAll('button')].map(e => ({
        text: e.textContent.trim().substring(0, 60), type: e.type
      }))
    };
  });

  console.log('\n=== PAGE CODE ===');
  console.log(codePageInfo.text.substring(0, 500));
  console.log('\nInputs:', JSON.stringify(codePageInfo.inputs, null, 2));
  console.log('\nBoutons:', JSON.stringify(codePageInfo.buttons, null, 2));

  console.log('\n>>> VERIFIE TA BOITE contact@jadomi.fr — un code Doctolib doit arriver <<<');
  console.log('>>> Donne-moi le code et je le rentre <<<');

  // Garder le navigateur ouvert en sauvegardant le state
  const storageState = await context.storageState();
  fs.writeFileSync('/tmp/doctolib-state.json', JSON.stringify(storageState, null, 2));
  console.log('[6] State sauvegarde pour reprendre');

  await browser.close();
  console.log('Done');
})();
