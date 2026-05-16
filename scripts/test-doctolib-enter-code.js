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
  await emailInput.type(process.env.DOCTOLIB_EMAIL, { delay: 100 });
  await new Promise(r => setTimeout(r, 1000));
  await page.click('button[type="submit"]');

  await page.waitForSelector('input[type="password"]:not(.hidden)', { state: 'visible', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));
  const passInput = await page.$('input[type="password"]:not(.hidden)');
  await passInput.type(process.env.DOCTOLIB_PASSWORD, { delay: 100 });
  await new Promise(r => setTimeout(r, 1000));
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  console.log('[2] Page 2FA');

  // === SELECTIONNER EMAIL ===
  const emailRadio = await page.$('input[type="radio"][name="method"]');
  if (emailRadio) {
    await emailRadio.click();
    await new Promise(r => setTimeout(r, 500));
  }
  await page.click('button[type="submit"]');
  console.log('[3] Email selectionne, code demande');

  await page.waitForSelector('input[name="auth_code"]', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // === ENTRER LE CODE ===
  const codeInput = await page.$('input[name="auth_code"]');
  if (codeInput) {
    await codeInput.type('366200', { delay: 120 });
    console.log('[4] Code 366200 saisi');
    await new Promise(r => setTimeout(r, 1000));

    await page.click('button[type="submit"]');
    console.log('[5] Confirmer clique');
  }

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 4000));

  const finalUrl = page.url();
  console.log('[6] URL finale:', finalUrl);
  await page.screenshot({ path: '/tmp/doctolib-final.png', fullPage: true });

  // === VERIFIER SI CONNECTE ===
  if (!finalUrl.includes('login') && !finalUrl.includes('signin') && !finalUrl.includes('two-factor')) {
    console.log('[7] CONNECTE A DOCTOLIB !');

    // Sauvegarder les cookies
    const cookies = await context.cookies();
    fs.writeFileSync('/home/ubuntu/jadomi/.doctolib-cookies.json', JSON.stringify(cookies, null, 2));
    console.log('[8] Cookies sauvegardes (' + cookies.length + ' cookies)');

    // Sauvegarder le storage state complet
    const state = await context.storageState();
    fs.writeFileSync('/home/ubuntu/jadomi/.doctolib-state.json', JSON.stringify(state, null, 2));
    console.log('[9] State complet sauvegarde');

    // === LIRE L'AGENDA ===
    console.log('[10] Lecture agenda...');
    await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'networkidle', timeout: 20000 });
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: '/tmp/doctolib-agenda-connected.png', fullPage: true });

    console.log('[11] URL agenda:', page.url());

    // Extraire les RDV
    const agendaData = await page.evaluate(() => {
      const result = { url: window.location.href, text: '', appointments: [] };
      result.text = document.body.innerText.substring(0, 3000);

      // Chercher tout ce qui ressemble a un RDV
      const allElements = document.querySelectorAll('[class*="appointment"], [class*="event"], [class*="slot"], [data-appointment], [data-event]');
      allElements.forEach(el => {
        result.appointments.push({
          text: el.textContent.trim().substring(0, 200),
          cls: el.className.substring(0, 100)
        });
      });

      return result;
    });

    console.log('\n=== AGENDA ===');
    console.log('URL:', agendaData.url);
    console.log('\nTexte visible (extrait):');
    console.log(agendaData.text.substring(0, 1500));
    console.log('\nRDV trouves:', agendaData.appointments.length);
    agendaData.appointments.slice(0, 20).forEach(a => console.log('  -', a.text.substring(0, 100)));

    fs.writeFileSync('/tmp/doctolib-agenda-data.json', JSON.stringify(agendaData, null, 2));
    console.log('\nDonnees sauvegardees dans /tmp/doctolib-agenda-data.json');
  } else {
    console.log('[7] ECHEC — toujours sur login/2FA');
    console.log('URL:', finalUrl);

    const errorText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Texte:', errorText);
  }

  await browser.close();
  console.log('Done');
})();
