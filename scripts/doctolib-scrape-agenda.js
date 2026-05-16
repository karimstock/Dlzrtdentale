#!/usr/bin/env node
// =============================================
// JADOMI — Scrape Doctolib agenda en profondeur
// Analyse complete de l'interface + extraction RDV reels
// =============================================
const { chromium } = require('playwright');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const EMAIL = process.env.DOCTOLIB_EMAIL;
const PASSWORD = process.env.DOCTOLIB_PASSWORD;
const PIN = process.env.DOCTOLIB_PIN;

async function humanDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min) + min);
  await new Promise(r => setTimeout(r, delay));
}

async function typeHuman(element, text) {
  for (const char of text) {
    await element.type(char);
    await humanDelay(40, 150);
  }
}

async function main() {
  console.log('[doctolib] Lancement navigateur...');
  console.log('[doctolib] Email:', EMAIL);

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

  const page = await context.newPage();

  // Intercepter les requetes API pour capturer les donnees JSON
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/appointments') || url.includes('/agenda') || url.includes('/calendar') || url.includes('/events')) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const data = await response.json();
          apiResponses.push({ url, data });
        }
      } catch (e) { /* skip */ }
    }
  });

  try {
    // === ETAPE 1 : Page de login ===
    console.log('[doctolib] Navigation vers login...');
    await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(2000, 3000);

    // Capture de la page login
    await page.screenshot({ path: '/tmp/doctolib-01-login.png', fullPage: true });
    console.log('[doctolib] Screenshot login sauvegarde');

    // Fermer popup cookies
    try {
      await page.evaluate(() => {
        if (window.Didomi) { window.Didomi.setUserAgreeToAll(); return; }
        const btns = document.querySelectorAll('#didomi-notice-agree-button, [id*="didomi"] button');
        for (const btn of btns) {
          if (btn.textContent.match(/accepter|agree|tout accepter/i)) { btn.click(); return; }
        }
        document.querySelectorAll('#didomi-host, .didomi-popup-backdrop').forEach(el => el.remove());
      });
      await humanDelay(1000, 2000);
    } catch (e) { console.log('[doctolib] Pas de popup cookies'); }

    // === ETAPE 2 : Saisir email ===
    console.log('[doctolib] Saisie email...');
    const emailInput = await page.$('input[type="email"], input[name="email"], input[id*="email"], input[placeholder*="mail"]');
    if (!emailInput) {
      // Peut-etre une page intermediaire — chercher un champ texte
      const textInput = await page.$('input[type="text"]');
      if (textInput) {
        await textInput.click();
        await humanDelay(300, 700);
        await typeHuman(textInput, EMAIL);
      } else {
        console.log('[doctolib] Page HTML:', await page.content().then(c => c.substring(0, 2000)));
        throw new Error('Aucun champ email/text trouve');
      }
    } else {
      await emailInput.click();
      await humanDelay(300, 700);
      await typeHuman(emailInput, EMAIL);
    }

    await humanDelay(800, 1500);
    await page.screenshot({ path: '/tmp/doctolib-02-email.png', fullPage: true });

    // Cliquer continuer/submit
    const submitBtn = await page.$('button[type="submit"], button:has-text("Continuer"), button:has-text("connexion")');
    if (submitBtn) {
      await submitBtn.click();
      console.log('[doctolib] Bouton submit clique');
    } else {
      await page.keyboard.press('Enter');
    }

    await humanDelay(3000, 5000);
    await page.screenshot({ path: '/tmp/doctolib-03-apres-email.png', fullPage: true });

    // === ETAPE 3 : Mot de passe OU code rapide ===
    const currentUrl = page.url();
    console.log('[doctolib] URL apres email:', currentUrl);

    // Chercher champ password
    const passInput = await page.$('input[type="password"]');
    if (passInput) {
      console.log('[doctolib] Champ password trouve — saisie mdp...');
      await passInput.click();
      await humanDelay(300, 700);
      await typeHuman(passInput, PASSWORD);
      await humanDelay(800, 1500);

      const loginBtn = await page.$('button[type="submit"]');
      if (loginBtn) await loginBtn.click();
      else await page.keyboard.press('Enter');
    } else {
      // Peut-etre mode code rapide (PIN)
      const pinInput = await page.$('input[type="tel"], input[inputmode="numeric"], input[maxlength="4"]');
      if (pinInput) {
        console.log('[doctolib] Mode PIN/code rapide — saisie', PIN);
        await pinInput.click();
        await humanDelay(300, 500);
        await typeHuman(pinInput, PIN);
      } else {
        console.log('[doctolib] Ni password ni PIN trouve. HTML:', await page.content().then(c => c.substring(0, 3000)));
      }
    }

    await humanDelay(4000, 6000);
    await page.screenshot({ path: '/tmp/doctolib-04-apres-login.png', fullPage: true });

    // === ETAPE 4 : Verifier connexion ===
    const afterLoginUrl = page.url();
    console.log('[doctolib] URL apres login:', afterLoginUrl);

    if (afterLoginUrl.includes('login') || afterLoginUrl.includes('auth')) {
      // Peut-etre 2FA ou erreur
      console.log('[doctolib] Toujours sur page login — possible 2FA ou erreur');
      const pageText = await page.textContent('body').catch(() => '');
      console.log('[doctolib] Contenu page (500 chars):', pageText.substring(0, 500));
    } else {
      console.log('[doctolib] CONNECTE ! URL:', afterLoginUrl);
    }

    // === ETAPE 5 : Naviguer vers agenda ===
    console.log('[doctolib] Navigation agenda...');
    await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await humanDelay(3000, 5000);
    await page.screenshot({ path: '/tmp/doctolib-05-agenda.png', fullPage: true });

    const agendaUrl = page.url();
    console.log('[doctolib] URL agenda:', agendaUrl);

    // === ETAPE 6 : Extraire structure de l'interface ===
    const interfaceAnalysis = await page.evaluate(() => {
      const result = {
        title: document.title,
        url: window.location.href,
        navigation: [],
        mainContent: '',
        appointments: [],
        cssClasses: [],
        dataAttributes: []
      };

      // Nav items
      document.querySelectorAll('nav a, nav button, [role="navigation"] a, .sidebar a, [class*="nav"] a').forEach(el => {
        result.navigation.push({ text: el.textContent.trim().substring(0, 50), href: el.href || '' });
      });

      // Elements d'agenda
      const agendaSelectors = [
        '[data-test*="appointment"]', '.appointment', '[class*="appointment"]',
        '[class*="event"]', '[class*="slot"]', '[class*="booking"]',
        '[class*="calendar"]', '[class*="schedule"]', '.fc-event',
        '[data-appointment-id]', '[data-event-id]'
      ];

      for (const sel of agendaSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          result.cssClasses.push({ selector: sel, count: els.length });
          els.forEach((el, i) => {
            if (i < 30) {
              result.appointments.push({
                text: el.textContent.trim().substring(0, 200),
                classes: el.className,
                dataset: JSON.stringify(el.dataset),
                style: el.getAttribute('style') || '',
                tag: el.tagName
              });
            }
          });
        }
      }

      // Data attributes interessants
      document.querySelectorAll('[data-date], [data-time], [data-patient], [data-id]').forEach(el => {
        result.dataAttributes.push({
          tag: el.tagName,
          data: JSON.stringify(el.dataset),
          text: el.textContent.trim().substring(0, 100)
        });
      });

      // Contenu principal
      const main = document.querySelector('main, [role="main"], #app, #root, .main-content');
      if (main) result.mainContent = main.textContent.trim().substring(0, 3000);

      return result;
    });

    console.log('\n=== ANALYSE INTERFACE DOCTOLIB ===');
    console.log(JSON.stringify(interfaceAnalysis, null, 2));

    // === ETAPE 7 : Capturer les API responses ===
    console.log('\n=== API RESPONSES CAPTUREES ===');
    for (const resp of apiResponses) {
      console.log('URL:', resp.url);
      console.log('Data (500 chars):', JSON.stringify(resp.data).substring(0, 500));
      console.log('---');
    }

    // Sauvegarder tout dans un fichier
    const fs = require('fs');
    const output = {
      timestamp: new Date().toISOString(),
      loginSuccess: !afterLoginUrl.includes('login'),
      agendaUrl,
      interfaceAnalysis,
      apiResponses: apiResponses.map(r => ({ url: r.url, data: r.data })),
    };
    fs.writeFileSync('/tmp/doctolib-analysis.json', JSON.stringify(output, null, 2));
    console.log('\n[doctolib] Analyse sauvegardee dans /tmp/doctolib-analysis.json');

  } catch (err) {
    console.error('[doctolib] ERREUR:', err.message);
    await page.screenshot({ path: '/tmp/doctolib-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('[doctolib] Navigateur ferme');
  }
}

main().catch(console.error);
