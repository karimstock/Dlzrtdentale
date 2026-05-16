#!/usr/bin/env node
// Scrape agenda Doctolib avec les cookies deja valides
const { chromium } = require('playwright');
const fs = require('fs');

const COOKIES_FILE = '/tmp/doctolib-cookies.json';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  });

  // Restaurer cookies
  if (fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await context.addCookies(cookies);
    console.log('[doctolib] Cookies restaures');
  }

  const page = await context.newPage();

  // Intercepter API
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    try {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('json') && (url.includes('/api/') || url.includes('/appointments') || url.includes('/agenda') || url.includes('/calendar') || url.includes('/availabilities') || url.includes('/events') || url.includes('/slots'))) {
        const data = await response.json();
        apiResponses.push({ url, data });
      }
    } catch (e) {}
  });

  try {
    // Aller direct sur l'agenda
    console.log('[doctolib] Navigation vers agenda...');
    await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log('[doctolib] URL:', page.url());
    await page.screenshot({ path: '/tmp/doctolib-agenda-now.png', fullPage: true });

    if (page.url().includes('/login') && !page.url().includes('onboarding')) {
      console.log('[doctolib] Session expiree — redirection login');
      return;
    }

    // Cliquer sur Agenda dans la sidebar si on n'y est pas
    const agendaLink = await page.$('a[href*="agenda"], button:has-text("Agenda"), [class*="agenda"]');
    if (agendaLink) {
      await agendaLink.click();
      await new Promise(r => setTimeout(r, 4000));
      await page.screenshot({ path: '/tmp/doctolib-agenda-click.png', fullPage: true });
      console.log('[doctolib] Clic Agenda, URL:', page.url());
    }

    // Extraire tout
    const data = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyText: document.body?.innerText?.substring(0, 20000) || '',
        html: document.documentElement.outerHTML.substring(0, 80000)
      };
    });

    fs.writeFileSync('/tmp/doctolib-agenda-data.json', JSON.stringify({ page: data, api: apiResponses }, null, 2));
    console.log('\n=== TITRE:', data.title);
    console.log('=== URL:', data.url);
    console.log('\n--- CONTENU PAGE ---');
    console.log(data.bodyText.substring(0, 5000));
    console.log('\n--- API RESPONSES:', apiResponses.length, '---');
    apiResponses.forEach(r => {
      console.log('URL:', r.url.substring(0, 200));
      console.log('Data:', JSON.stringify(r.data).substring(0, 1000));
      console.log('---');
    });

    // Screenshot des differentes pages
    const pages = ['agenda', 'patients', 'messagerie'];
    for (const p of pages) {
      try {
        // Cliquer sidebar
        await page.evaluate((name) => {
          for (const el of document.querySelectorAll('a, button, [role="link"], [role="button"]')) {
            if (el.textContent.trim().toLowerCase().includes(name)) { el.click(); return true; }
          }
          return false;
        }, p);
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: `/tmp/doctolib-${p}.png`, fullPage: true });
        console.log(`[doctolib] Screenshot ${p} sauvegarde`);
      } catch (e) {}
    }

    console.log('\n[doctolib] DONE !');

  } catch (err) {
    console.error('[doctolib] ERREUR:', err.message);
    await page.screenshot({ path: '/tmp/doctolib-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
