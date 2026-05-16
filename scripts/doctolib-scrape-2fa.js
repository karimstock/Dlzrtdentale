#!/usr/bin/env node
// =============================================
// JADOMI — Doctolib login avec 2FA par email
// Usage: node scripts/doctolib-scrape-2fa.js [CODE_2FA]
// Etape 1 (sans code) : login + demande code par email
// Etape 2 (avec code) : saisie code + scrape agenda
// =============================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EMAIL = process.env.DOCTOLIB_EMAIL;
const PASSWORD = process.env.DOCTOLIB_PASSWORD;
const CODE_2FA = process.argv[2] || null;
const COOKIES_FILE = '/tmp/doctolib-cookies.json';

async function humanDelay(min, max) {
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min) + min)));
}

async function typeHuman(element, text) {
  for (const char of text) {
    await element.type(char);
    await humanDelay(40, 120);
  }
}

async function main() {
  console.log('[doctolib] Mode:', CODE_2FA ? 'ETAPE 2 — saisie code 2FA' : 'ETAPE 1 — login + envoi code');

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

  // Restaurer cookies si etape 2
  if (CODE_2FA && fs.existsSync(COOKIES_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    await context.addCookies(cookies);
    console.log('[doctolib] Cookies restaures');
  }

  const page = await context.newPage();

  // Intercepter API
  const apiResponses = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/appointments') || url.includes('/agenda') || url.includes('/availabilities')) {
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
    if (!CODE_2FA) {
      // ========== ETAPE 1 : LOGIN + DEMANDE CODE ==========
      await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
      await humanDelay(2000, 3000);

      // Fermer cookies — Doctolib utilise un popup natif avec bouton ACCEPTER
      try {
        // Essayer de cliquer ACCEPTER
        const acceptBtn = await page.$('button:has-text("ACCEPTER"), button:has-text("Accepter"), button:has-text("Accept")');
        if (acceptBtn) {
          await acceptBtn.click();
          console.log('[doctolib] Popup cookies accepte');
          await humanDelay(1500, 2500);
        } else {
          // Fallback: supprimer overlays
          await page.evaluate(() => {
            if (window.Didomi) { window.Didomi.setUserAgreeToAll(); }
            document.querySelectorAll('#didomi-host, .didomi-popup-backdrop, [class*="cookie"], [class*="consent"], [role="dialog"]').forEach(el => el.remove());
          });
          await humanDelay(1000, 1500);
        }
      } catch (e) { console.log('[doctolib] Pas de popup cookies'); }

      // Email
      const emailInput = await page.$('input[type="email"], input[name="email"], input[type="text"]');
      if (emailInput) {
        await emailInput.click();
        await humanDelay(300, 600);
        await typeHuman(emailInput, EMAIL);
        console.log('[doctolib] Email saisi');
      }

      await humanDelay(800, 1200);

      // Cliquer CONTINUER — chercher le bon bouton visible
      const continueClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toUpperCase();
          if (text.includes('CONTINU') || text.includes('SUIVANT') || text.includes('NEXT')) {
            btn.click();
            return text;
          }
        }
        // Fallback submit
        const sub = document.querySelector('button[type="submit"], input[type="submit"]');
        if (sub) { sub.click(); return 'submit-fallback'; }
        return null;
      });
      if (continueClicked) {
        console.log('[doctolib] Bouton clique:', continueClicked);
      } else {
        await page.keyboard.press('Enter');
        console.log('[doctolib] Enter presse (fallback)');
      }

      await humanDelay(3000, 5000);
      await page.screenshot({ path: '/tmp/doctolib-after-email.png', fullPage: true });
      console.log('[doctolib] URL apres email:', page.url());

      // Password — Keycloak auth.doctolib.fr
      try {
        await page.waitForSelector('input[type="password"], input[name="password"], input[id="password"]', { state: 'visible', timeout: 10000 });
      } catch (e) {
        // Essayer de trouver tout input visible
        console.log('[doctolib] Pas de champ password standard, recherche elargie...');
        const allInputs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input')).map(i => ({
            type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
            visible: i.offsetParent !== null, className: i.className
          }));
        });
        console.log('[doctolib] Inputs trouves:', JSON.stringify(allInputs));
        await page.screenshot({ path: '/tmp/doctolib-no-password.png', fullPage: true });
      }

      // Le vrai champ visible utilise le framework Oxygen de Doctolib
      const passInput = await page.$('input.oxygen-input-field__input[type="password"], input[type="password"]:not(.hidden)');
      if (passInput) {
        await passInput.click();
        await humanDelay(300, 600);
        await typeHuman(passInput, PASSWORD);
        console.log('[doctolib] Password saisi');

        await humanDelay(800, 1200);

        // Cliquer Se connecter — chercher bouton visible
        const loginClicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, input[type="submit"]');
          for (const btn of buttons) {
            if (btn.offsetParent === null) continue; // skip hidden
            const text = btn.textContent.trim().toUpperCase();
            if (text.includes('CONNECT') || text.includes('LOGIN') || text.includes('VALIDER') || text.includes('SIGN IN')) {
              btn.click();
              return text;
            }
          }
          // Fallback: premier bouton submit visible
          for (const btn of buttons) {
            if (btn.offsetParent !== null && (btn.type === 'submit' || btn.classList.contains('oxygen-button'))) {
              btn.click();
              return 'oxygen-submit';
            }
          }
          return null;
        });
        console.log('[doctolib] Login clique:', loginClicked);
      }

      await humanDelay(4000, 6000);
      console.log('[doctolib] URL:', page.url());

      // Page 2FA — selectionner Email et valider
      if (page.url().includes('two-factor')) {
        console.log('[doctolib] Page 2FA detectee — selection Email...');

        // Email est deja selectionne par defaut, cliquer VALIDER
        const validerBtn = await page.$('button:has-text("VALIDER"), button:has-text("Valider"), button[type="submit"]');
        if (validerBtn) {
          await validerBtn.click();
          console.log('[doctolib] VALIDER clique — code envoye par email !');
        }

        await humanDelay(3000, 4000);
        await page.screenshot({ path: '/tmp/doctolib-2fa-sent.png', fullPage: true });

        // Sauvegarder cookies pour etape 2
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
        console.log('[doctolib] Cookies sauvegardes');

        // Sauvegarder URL actuelle
        fs.writeFileSync('/tmp/doctolib-2fa-url.txt', page.url());

        console.log('\n====================================');
        console.log('CODE 2FA ENVOYE PAR EMAIL !');
        console.log('Verifie contact@jadomi.fr');
        console.log('Puis relance: node scripts/doctolib-scrape-2fa.js CODE');
        console.log('====================================\n');
      }

    } else {
      // ========== ETAPE 2 : SAISIE CODE 2FA ==========
      const twoFaUrl = fs.existsSync('/tmp/doctolib-2fa-url.txt')
        ? fs.readFileSync('/tmp/doctolib-2fa-url.txt', 'utf8').trim()
        : 'https://pro.doctolib.fr/signin/two-factor';

      await page.goto(twoFaUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await humanDelay(2000, 3000);
      await page.screenshot({ path: '/tmp/doctolib-2fa-page.png', fullPage: true });

      console.log('[doctolib] URL 2FA:', page.url());

      // Chercher champ code
      const codeInput = await page.$('input[type="tel"], input[type="text"], input[inputmode="numeric"], input[maxlength="6"], input[name*="code"], input[placeholder*="code"]');
      if (codeInput) {
        await codeInput.click();
        await humanDelay(300, 500);
        await typeHuman(codeInput, CODE_2FA);
        console.log('[doctolib] Code 2FA saisi:', CODE_2FA);

        await humanDelay(800, 1200);
        const valBtn = await page.$('button[type="submit"], button:has-text("Valider"), button:has-text("Vérifier")');
        if (valBtn) await valBtn.click();
        else await page.keyboard.press('Enter');

        await humanDelay(5000, 8000);
        await page.screenshot({ path: '/tmp/doctolib-2fa-done.png', fullPage: true });
        console.log('[doctolib] URL apres 2FA:', page.url());
      } else {
        // Peut-etre redirige vers login — refaire login complet
        console.log('[doctolib] Pas de champ code — session expiree, refaire login');
        console.log('[doctolib] Relance sans code pour redemander le 2FA');
        await browser.close();
        return;
      }

      // Si connecte — scrape agenda
      if (!page.url().includes('login') && !page.url().includes('signin')) {
        console.log('[doctolib] CONNECTE ! Scraping agenda...');

        // Sauvegarder cookies valides
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

        // Naviguer vers agenda
        await page.goto('https://pro.doctolib.fr/agenda', { waitUntil: 'networkidle', timeout: 30000 });
        await humanDelay(3000, 5000);
        await page.screenshot({ path: '/tmp/doctolib-agenda-full.png', fullPage: true });

        console.log('[doctolib] URL agenda:', page.url());

        // Extraire TOUT le contenu de la page agenda
        const agendaData = await page.evaluate(() => {
          const result = {
            title: document.title,
            url: window.location.href,
            bodyText: document.body?.innerText?.substring(0, 10000) || '',
            allLinks: [],
            allButtons: [],
            allInputs: [],
            rdvElements: [],
            sidebar: '',
            headerNav: ''
          };

          // Tous les liens
          document.querySelectorAll('a').forEach(a => {
            result.allLinks.push({ text: a.textContent.trim().substring(0, 80), href: a.href });
          });

          // Tous les boutons
          document.querySelectorAll('button').forEach(b => {
            result.allButtons.push({ text: b.textContent.trim().substring(0, 80), class: b.className });
          });

          // Tous les elements qui ressemblent a des RDV
          const selectors = [
            '[data-test]', '[class*="appointment"]', '[class*="event"]',
            '[class*="slot"]', '[class*="calendar"]', '[class*="patient"]',
            '[class*="booking"]', '.fc-event', '[data-appointment]',
            '[role="listitem"]', '[role="row"]', 'tr', 'li'
          ];
          for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el, i) => {
              if (i < 50) {
                const text = el.textContent.trim();
                if (text.length > 5 && text.length < 500) {
                  result.rdvElements.push({
                    selector: sel,
                    text: text.substring(0, 300),
                    classes: el.className?.substring?.(0, 200) || '',
                    tag: el.tagName,
                    childCount: el.children.length
                  });
                }
              }
            });
          }

          // Sidebar
          const sidebar = document.querySelector('nav, [class*="sidebar"], [class*="menu"], aside');
          if (sidebar) result.sidebar = sidebar.textContent.trim().substring(0, 2000);

          // Header
          const header = document.querySelector('header, [class*="header"], [class*="toolbar"]');
          if (header) result.headerNav = header.textContent.trim().substring(0, 1000);

          return result;
        });

        console.log('\n=== CONTENU AGENDA DOCTOLIB ===');
        console.log('Title:', agendaData.title);
        console.log('URL:', agendaData.url);
        console.log('\n--- SIDEBAR ---');
        console.log(agendaData.sidebar.substring(0, 500));
        console.log('\n--- HEADER ---');
        console.log(agendaData.headerNav.substring(0, 500));
        console.log('\n--- BODY TEXT (2000 chars) ---');
        console.log(agendaData.bodyText.substring(0, 2000));
        console.log('\n--- RDV ELEMENTS ---');
        agendaData.rdvElements.slice(0, 20).forEach(el => {
          console.log(`[${el.selector}] ${el.tag} (${el.childCount} children): ${el.text.substring(0, 150)}`);
        });
        console.log('\n--- API RESPONSES ---');
        apiResponses.forEach(r => {
          console.log('API:', r.url);
          console.log('Data:', JSON.stringify(r.data).substring(0, 800));
          console.log('---');
        });

        // Sauvegarder
        fs.writeFileSync('/tmp/doctolib-agenda-data.json', JSON.stringify({ agendaData, apiResponses }, null, 2));
        console.log('\n[doctolib] Donnees sauvegardees dans /tmp/doctolib-agenda-data.json');

        // Screenshot haute resolution
        await page.screenshot({ path: '/tmp/doctolib-agenda-hd.png', fullPage: true });
        console.log('[doctolib] Screenshot HD sauvegarde');
      } else {
        console.log('[doctolib] Toujours pas connecte. Verifier le code 2FA.');
        await page.screenshot({ path: '/tmp/doctolib-2fa-failed.png', fullPage: true });
      }
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
