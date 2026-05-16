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
  console.log('[1] Login Doctolib...');
  await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Cookies
  await page.evaluate(() => { if (window.Didomi) window.Didomi.setUserAgreeToAll(); });
  await new Promise(r => setTimeout(r, 1000));

  // Email
  const emailInput = await page.$('input[type="email"]');
  await emailInput.type(process.env.DOCTOLIB_EMAIL, { delay: 80 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('button[type="submit"]');
  console.log('[2] Email envoye, attente password...');

  // Password
  await page.waitForSelector('input[type="password"]:not(.hidden)', { state: 'visible', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const passInput = await page.$('input[type="password"]:not(.hidden)');
  await passInput.type(process.env.DOCTOLIB_PASSWORD, { delay: 80 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('button[type="submit"]');
  console.log('[3] Password envoye, attente redirection...');

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  console.log('[4] URL apres login:', page.url());
  await page.screenshot({ path: '/tmp/doctolib-dashboard.png', fullPage: true });

  // === NAVIGATION AGENDA ===
  const today = new Date().toISOString().split('T')[0];
  console.log('[5] Navigation vers agenda du', today);

  // Essayer differentes URLs d'agenda
  const agendaUrls = [
    'https://pro.doctolib.fr/agenda',
    'https://pro.doctolib.fr/calendar',
    'https://pro.doctolib.fr/dashboard'
  ];

  for (const url of agendaUrls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await new Promise(r => setTimeout(r, 3000));
      console.log('[6] Page chargee:', url, '→', page.url());
      break;
    } catch (e) {
      console.log('[6] Echec:', url);
    }
  }

  await page.screenshot({ path: '/tmp/doctolib-agenda.png', fullPage: true });
  console.log('[7] Screenshot agenda sauvegarde');

  // === EXTRAIRE LES DONNEES ===

  // Methode 1 : Intercepter les requetes API XHR
  const apiData = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/appointments') || url.includes('/availabilities') || url.includes('/events')) {
      try {
        const json = await response.json();
        apiData.push({ url, data: json });
      } catch (e) {}
    }
  });

  // Recharger pour capter les requetes API
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 5000));

  // Methode 2 : Lire le DOM
  const pageData = await page.evaluate(() => {
    const result = {
      url: window.location.href,
      title: document.title,
      appointments: [],
      allText: [],
      links: [],
      dataAttributes: []
    };

    // Chercher les RDV dans le DOM
    const selectors = [
      '[data-test*="appointment"]', '[data-test*="event"]',
      '.appointment', '.event', '.calendar-event',
      '[class*="appointment"]', '[class*="event"]', '[class*="slot"]',
      '[class*="Appointment"]', '[class*="Event"]',
      'td[class*="busy"]', 'td[class*="booked"]',
      '[role="gridcell"]', '[role="button"]',
      '.dl-appointment', '.dl-event'
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        result.appointments.push({
          selector: sel,
          count: els.length,
          samples: [...els].slice(0, 5).map(el => ({
            text: el.textContent.trim().substring(0, 200),
            classes: el.className.substring(0, 100),
            html: el.outerHTML.substring(0, 300)
          }))
        });
      }
    }

    // Capturer tout le texte visible qui ressemble a des heures/noms
    const allText = document.body.innerText;
    const timeMatches = allText.match(/\d{1,2}[h:]\d{2}.*$/gm) || [];
    result.allText = timeMatches.slice(0, 30);

    // Capturer les liens de navigation
    result.links = [...document.querySelectorAll('a[href], button')].slice(0, 30).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 60),
      href: el.href || '',
      cls: el.className.substring(0, 60)
    }));

    // Data attributes interessants
    document.querySelectorAll('[data-appointment-id], [data-event-id], [data-patient], [data-date]').forEach(el => {
      result.dataAttributes.push({
        attrs: [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value.substring(0, 50)),
        text: el.textContent.trim().substring(0, 100)
      });
    });

    return result;
  });

  console.log('\n=== RESULTATS ===');
  console.log('URL finale:', pageData.url);
  console.log('Titre:', pageData.title);
  console.log('\nAppointments trouves:');
  pageData.appointments.forEach(a => {
    console.log('  Selector:', a.selector, '→', a.count, 'elements');
    a.samples.forEach(s => console.log('    Text:', s.text.substring(0, 100)));
  });

  console.log('\nTexte avec heures:');
  pageData.allText.forEach(t => console.log(' ', t.substring(0, 100)));

  console.log('\nData attributes:');
  pageData.dataAttributes.slice(0, 10).forEach(d => console.log(' ', d.attrs.join(', '), '→', d.text.substring(0, 60)));

  console.log('\nAPI interceptees:', apiData.length);
  apiData.forEach(a => console.log('  URL:', a.url.substring(0, 100)));

  // Sauvegarder tout
  fs.writeFileSync('/tmp/doctolib-data.json', JSON.stringify({ pageData, apiData }, null, 2));
  console.log('\nDonnees completes sauvegardees dans /tmp/doctolib-data.json');

  await browser.close();
  console.log('Done');
})();
