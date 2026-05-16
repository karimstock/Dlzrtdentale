#!/usr/bin/env node
// =============================================
// JADOMI — Doctolib login live (tout en un seul run)
// Le navigateur reste ouvert pendant l'attente du code 2FA
// Ecrire le code dans /tmp/doctolib-2fa-code.txt
// =============================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EMAIL = process.env.DOCTOLIB_EMAIL;
const PASSWORD = process.env.DOCTOLIB_PASSWORD;
const CODE_FILE = '/tmp/doctolib-2fa-code.txt';

async function humanDelay(min, max) {
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min) + min)));
}

async function typeHuman(element, text) {
  for (const char of text) {
    await element.type(char);
    await humanDelay(40, 120);
  }
}

async function waitForCodeFile(timeout = 600000) {
  // Supprimer ancien fichier
  try { fs.unlinkSync(CODE_FILE); } catch (e) {}

  console.log('[doctolib] En attente du code 2FA...');
  console.log('[doctolib] Ecris le code dans:', CODE_FILE);

  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fs.existsSync(CODE_FILE)) {
      const code = fs.readFileSync(CODE_FILE, 'utf8').trim();
      if (code.length >= 4) {
        console.log('[doctolib] Code lu:', code);
        return code;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timeout — pas de code recu en 3 minutes');
}

async function main() {
  console.log('[doctolib] Lancement navigateur (session continue)...');

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

  // Intercepter API
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/appointments') || url.includes('/agenda') || url.includes('/availabilities') || url.includes('/calendar')) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const data = await response.json();
          apiResponses.push({ url, data });
        }
      } catch (e) {}
    }
  });

  try {
    // === LOGIN ===
    await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(2000, 3000);

    // Cookies
    const acceptBtn = await page.$('button:has-text("ACCEPTER"), button:has-text("Accepter")');
    if (acceptBtn) { await acceptBtn.click(); await humanDelay(1500, 2500); }

    // Email
    const emailInput = await page.$('input[type="email"], input[name="email"], input[type="text"]');
    if (emailInput) { await emailInput.click(); await humanDelay(300, 600); await typeHuman(emailInput, EMAIL); }
    console.log('[doctolib] Email saisi');

    await humanDelay(800, 1200);
    // Soumettre l'email — Enter est plus fiable que chercher le bouton
    await page.keyboard.press('Enter');
    console.log('[doctolib] Email soumis (Enter)');

    // Attendre la redirection vers auth.doctolib.fr + champ password
    await humanDelay(3000, 5000);
    await page.screenshot({ path: '/tmp/doctolib-debug-after-email.png' });
    console.log('[doctolib] URL apres email:', page.url());

    // Password — attendre qu'un champ password VISIBLE apparaisse (Oxygen ou Keycloak)
    let passInput = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      passInput = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="password"]');
        for (const inp of inputs) {
          if (inp.offsetParent !== null) return true;
        }
        return false;
      });
      if (passInput) break;
      await humanDelay(2000, 3000);
      console.log('[doctolib] Attente champ password... tentative', attempt + 1);
    }

    // Trouver le champ password visible
    const passEl = await page.evaluateHandle(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      for (const inp of inputs) {
        if (inp.offsetParent !== null) return inp;
      }
      return null;
    });
    if (passEl && passEl.asElement()) {
      await passEl.asElement().click(); await humanDelay(300, 600);
      await typeHuman(passEl.asElement(), PASSWORD);
      console.log('[doctolib] Password saisi');

      await humanDelay(800, 1200);
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.offsetParent === null) continue;
          const t = btn.textContent.trim().toUpperCase();
          if (t.includes('CONNECT')) { btn.click(); return; }
        }
      });
      console.log('[doctolib] SE CONNECTER clique');
    }

    await humanDelay(4000, 6000);
    console.log('[doctolib] URL:', page.url());

    // === 2FA ===
    if (page.url().includes('two-factor') || page.url().includes('signin')) {
      console.log('[doctolib] Page 2FA — clic VALIDER pour envoyer code par email...');

      // Cliquer VALIDER
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.offsetParent === null) continue;
          const t = btn.textContent.trim().toUpperCase();
          if (t.includes('VALIDER') || t.includes('VERIFY') || t.includes('SEND')) { btn.click(); return; }
        }
      });

      await humanDelay(3000, 4000);
      await page.screenshot({ path: '/tmp/doctolib-2fa-waiting.png', fullPage: true });
      console.log('[doctolib] Code 2FA envoye par email !');

      // Attendre le code
      const code = await waitForCodeFile();

      // Saisir le code
      await humanDelay(1000, 2000);
      // Chercher le champ code visible
      const codeInput = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        for (const inp of inputs) {
          if (inp.offsetParent === null) continue;
          if (inp.type === 'password' || inp.type === 'hidden') continue;
          return { id: inp.id, name: inp.name, type: inp.type, className: inp.className };
        }
        return null;
      });
      console.log('[doctolib] Champ code trouve:', JSON.stringify(codeInput));

      // Taper le code dans le champ visible
      const inputEl = await page.$('input.oxygen-input-field__input:not([type="password"]):not([type="hidden"]), input[type="tel"], input[inputmode="numeric"], input:not(.hidden):not([type="hidden"]):not([type="password"])');
      if (inputEl) {
        await inputEl.click();
        await humanDelay(300, 500);
        // Effacer le champ d'abord
        await inputEl.fill('');
        await humanDelay(200, 400);
        await typeHuman(inputEl, code);
        console.log('[doctolib] Code saisi');

        await humanDelay(800, 1200);
        // Cliquer valider/verifier
        await page.evaluate(() => {
          for (const btn of document.querySelectorAll('button')) {
            if (btn.offsetParent === null) continue;
            const t = btn.textContent.trim().toUpperCase();
            if (t.includes('VALIDER') || t.includes('VERIF') || t.includes('CONFIRM') || t.includes('CONNECT')) { btn.click(); return; }
          }
        });
        console.log('[doctolib] Validation 2FA cliquee');
      } else {
        console.log('[doctolib] ERREUR: pas de champ pour le code');
      }

      await humanDelay(5000, 8000);
      console.log('[doctolib] URL apres 2FA:', page.url());
      await page.screenshot({ path: '/tmp/doctolib-after-2fa.png', fullPage: true });
    }

    // === SCRAPE AGENDA ===
    const finalUrl = page.url();
    const isLoggedIn = !finalUrl.includes('/login') || finalUrl.includes('onboarding') || finalUrl.includes('agenda') || finalUrl.includes('dashboard');
    if (isLoggedIn) {
      console.log('[doctolib] *** CONNECTE ! *** Scraping agenda...');

      // Sauvegarder cookies
      const cookies = await context.cookies();
      fs.writeFileSync('/tmp/doctolib-cookies-valid.json', JSON.stringify(cookies, null, 2));

      // Naviguer vers agenda
      await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await humanDelay(4000, 6000);
      await page.screenshot({ path: '/tmp/doctolib-agenda.png', fullPage: true });
      console.log('[doctolib] URL agenda:', page.url());

      // Extraire tout
      const agendaData = await page.evaluate(() => {
        const result = {
          title: document.title,
          url: window.location.href,
          bodyText: document.body?.innerText?.substring(0, 15000) || '',
          allLinks: [],
          allButtons: [],
          rdvElements: [],
          sidebar: '',
          headerNav: '',
          fullHTML: document.documentElement.outerHTML.substring(0, 50000)
        };

        document.querySelectorAll('a').forEach(a => {
          result.allLinks.push({ text: a.textContent.trim().substring(0, 80), href: a.href });
        });

        document.querySelectorAll('button').forEach(b => {
          if (b.textContent.trim().length > 0)
            result.allButtons.push({ text: b.textContent.trim().substring(0, 80), class: b.className?.substring(0, 100) });
        });

        // Chercher RDV
        const selectors = [
          '[data-test]', '[class*="appointment"]', '[class*="event"]',
          '[class*="slot"]', '[class*="calendar"]', '[class*="patient"]',
          '[class*="booking"]', '.fc-event', '[data-appointment]',
          '[role="gridcell"]', '[role="listitem"]', 'td', '[class*="cell"]'
        ];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el, i) => {
            if (i < 30) {
              const text = el.textContent.trim();
              if (text.length > 3 && text.length < 500) {
                result.rdvElements.push({
                  selector: sel,
                  text: text.substring(0, 300),
                  classes: el.className?.substring?.(0, 200) || '',
                  tag: el.tagName
                });
              }
            }
          });
        }

        const sidebar = document.querySelector('nav, [class*="sidebar"], aside');
        if (sidebar) result.sidebar = sidebar.textContent.trim().substring(0, 3000);

        const header = document.querySelector('header, [class*="header"]');
        if (header) result.headerNav = header.textContent.trim().substring(0, 1000);

        return result;
      });

      // Sauvegarder
      fs.writeFileSync('/tmp/doctolib-agenda-data.json', JSON.stringify({ agendaData, apiResponses }, null, 2));

      console.log('\n=== AGENDA DOCTOLIB ===');
      console.log('Title:', agendaData.title);
      console.log('\n--- SIDEBAR ---');
      console.log(agendaData.sidebar.substring(0, 1000));
      console.log('\n--- BODY (3000 chars) ---');
      console.log(agendaData.bodyText.substring(0, 3000));
      console.log('\n--- RDV ELEMENTS ---');
      agendaData.rdvElements.slice(0, 30).forEach(el => {
        console.log(`[${el.selector}] ${el.tag}: ${el.text.substring(0, 150)}`);
      });
      console.log('\n--- API (' + apiResponses.length + ' responses) ---');
      apiResponses.forEach(r => {
        console.log('URL:', r.url.substring(0, 150));
        console.log('Data:', JSON.stringify(r.data).substring(0, 500));
        console.log('---');
      });

      console.log('\n[doctolib] SUCCES ! Donnees dans /tmp/doctolib-agenda-data.json');
      console.log('[doctolib] Screenshots dans /tmp/doctolib-agenda.png');
    } else {
      console.log('[doctolib] ECHEC connexion. URL finale:', page.url());
    }

  } catch (err) {
    console.error('[doctolib] ERREUR:', err.message);
    await page.screenshot({ path: '/tmp/doctolib-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('[doctolib] Navigateur ferme');
  }
}

main().catch(console.error);
