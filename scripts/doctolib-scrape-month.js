#!/usr/bin/env node
// =============================================
// JADOMI — Scrape agenda Doctolib MOIS COMPLET
// Utilise les cookies valides pour naviguer
// Clique sur AGENDA dans la sidebar puis scrape semaine par semaine
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
  try { fs.unlinkSync(CODE_FILE); } catch (e) {}
  console.log('[doctolib] En attente du code 2FA...');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fs.existsSync(CODE_FILE)) {
      const code = fs.readFileSync(CODE_FILE, 'utf8').trim();
      if (code.length >= 4) return code;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timeout code 2FA');
}

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

  const page = await context.newPage();

  try {
    // === LOGIN ===
    console.log('[doctolib] Login...');
    await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(2000, 3000);

    // Cookies popup
    const acceptBtn = await page.$('button:has-text("ACCEPTER"), button:has-text("Accepter")');
    if (acceptBtn) { await acceptBtn.click(); await humanDelay(1500, 2500); }

    // Email
    const emailInput = await page.$('input[type="email"], input[name="email"], input[type="text"]');
    if (emailInput) { await emailInput.click(); await humanDelay(300, 600); await typeHuman(emailInput, EMAIL); }
    await humanDelay(800, 1200);
    await page.keyboard.press('Enter');
    console.log('[doctolib] Email soumis');

    // Password
    await humanDelay(3000, 5000);
    let passFound = false;
    for (let i = 0; i < 5; i++) {
      passFound = await page.evaluate(() => {
        for (const inp of document.querySelectorAll('input[type="password"]')) {
          if (inp.offsetParent !== null) return true;
        }
        return false;
      });
      if (passFound) break;
      await humanDelay(2000, 3000);
    }

    if (passFound) {
      const passEl = await page.evaluateHandle(() => {
        for (const inp of document.querySelectorAll('input[type="password"]')) {
          if (inp.offsetParent !== null) return inp;
        }
        return null;
      });
      await passEl.asElement().click(); await humanDelay(300, 600);
      await typeHuman(passEl.asElement(), PASSWORD);
      console.log('[doctolib] Password saisi');
      await humanDelay(800, 1200);
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.offsetParent === null) continue;
          if (btn.textContent.trim().toUpperCase().includes('CONNECT')) { btn.click(); return; }
        }
      });
    }

    await humanDelay(4000, 6000);
    console.log('[doctolib] URL:', page.url());

    // === 2FA — ETAPE 1 : choisir Email et envoyer ===
    if (page.url().includes('two-factor') || page.url().includes('signin')) {
      await page.screenshot({ path: '/tmp/doctolib-2fa-step1.png' });
      // Sélectionner SMS au lieu de Email
      await page.evaluate(() => {
        const labels = document.querySelectorAll('label, span, div, input[type="radio"]');
        for (const el of labels) {
          if (el.textContent.trim().toUpperCase().includes('SMS')) {
            el.click();
            return 'sms-clicked';
          }
        }
        // Fallback: chercher le 3ème radio button (Email=1, App=2, SMS=3)
        const radios = document.querySelectorAll('input[type="radio"]');
        if (radios.length >= 3) { radios[2].click(); return 'radio-3-clicked'; }
        return 'not-found';
      });
      await humanDelay(500, 1000);
      console.log('[doctolib] SMS sélectionné');

      // Cliquer VALIDER pour envoyer le code par SMS
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.offsetParent === null) continue;
          if (btn.textContent.trim().toUpperCase() === 'VALIDER') { btn.click(); return; }
        }
      });
      console.log('[doctolib] VALIDER clique — code envoye par SMS');

      await humanDelay(3000, 5000);
      await page.screenshot({ path: '/tmp/doctolib-2fa-step2.png' });

      // === 2FA — ETAPE 2 : saisir le code et CONFIRMER ===
      const code = await waitForCodeFile();

      // Chercher le champ code (peut etre auth_code ou un input visible)
      let codeInput = await page.$('input#auth_code, input[name="auth_code"]');
      if (!codeInput) {
        // Fallback : premier input visible non-password
        codeInput = await page.evaluateHandle(() => {
          for (const inp of document.querySelectorAll('input')) {
            if (inp.offsetParent !== null && inp.type !== 'hidden' && inp.type !== 'password') return inp;
          }
          return null;
        });
        codeInput = codeInput.asElement();
      }

      if (codeInput) {
        await codeInput.click();
        await codeInput.fill('');
        await typeHuman(codeInput, code);
        console.log('[doctolib] Code 2FA saisi:', code);
        await humanDelay(800, 1200);

        // Cliquer "CONFIRMER ET SE CONNECTER" — le vrai bouton
        await page.screenshot({ path: '/tmp/doctolib-2fa-step3-before-confirm.png' });
        const confirmClicked = await page.evaluate(() => {
          for (const btn of document.querySelectorAll('button')) {
            if (btn.offsetParent === null) continue;
            var t = btn.textContent.trim().toUpperCase();
            if (t.includes('CONFIRMER')) { btn.click(); return 'CONFIRMER:' + btn.textContent.trim(); }
          }
          // Fallback
          for (const btn of document.querySelectorAll('button')) {
            if (btn.offsetParent === null) continue;
            var t = btn.textContent.trim().toUpperCase();
            if (t.includes('CONNECT') || t.includes('VALIDER') || t.includes('ENVOYER')) { btn.click(); return 'FALLBACK:' + btn.textContent.trim(); }
          }
          return 'AUCUN BOUTON';
        });
        console.log('[doctolib] Bouton clique:', confirmClicked);
      } else {
        console.log('[doctolib] ERREUR: pas de champ code trouve');
      }

      await humanDelay(6000, 8000);
      await page.screenshot({ path: '/tmp/doctolib-2fa-step4-after-confirm.png' });
    }

    console.log('[doctolib] URL apres login:', page.url());

    // === NAVIGUER PAR URL DIRECTE — pas de clic foireux ===
    // Format Doctolib : /calendar/YYYY-MM-DD/week
    // On scrape chaque semaine de l'année 2026 (jan → maintenant) + 2025 si besoin

    // Fermer les popups d'onboarding
    await page.evaluate(() => {
      document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="tooltip"], [class*="dialog"]').forEach(el => el.remove());
    });

    const allWeeks = [];

    // Générer les lundis de chaque semaine de janvier 2025 à mai 2026
    const mondayDates = [];
    const start = new Date('2025-01-06'); // Premier lundi 2025
    const end = new Date('2026-05-11');   // Semaine actuelle
    let d = new Date(start);
    while (d <= end) {
      mondayDates.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
      d.setDate(d.getDate() + 7);
    }

    console.log('[doctolib] ' + mondayDates.length + ' semaines à scraper (jan 2025 → mai 2026)');

    for (let i = 0; i < mondayDates.length; i++) {
      const monday = mondayDates[i];
      const url = 'https://pro.doctolib.fr/calendar/' + monday + '/week';

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      } catch (e) {
        // networkidle timeout OK, la page est chargée quand même
      }
      await humanDelay(2000, 3000);

      // Fermer popups qui réapparaissent
      await page.evaluate(() => {
        document.querySelectorAll('[class*="modal"], [class*="tooltip"], [class*="onboarding"]').forEach(el => {
          try { el.closest('[class*="overlay"]')?.remove(); el.remove(); } catch(e) {}
        });
        // Cliquer les boutons de fermeture
        document.querySelectorAll('button[aria-label="Fermer"], button[aria-label="Close"], [class*="close"]').forEach(btn => {
          try { btn.click(); } catch(e) {}
        });
      });

      // Extraire le texte brut de la page (tous les RDV visibles)
      const weekData = await page.evaluate(() => {
        // Récupérer le texte de chaque colonne jour
        const body = document.body?.innerText || '';
        return {
          url: window.location.href,
          text: body.substring(0, 30000)
        };
      });

      // Screenshot
      await page.screenshot({ path: '/tmp/doctolib-week-' + monday + '.png', fullPage: true });

      allWeeks.push({
        monday: monday,
        index: i + 1,
        text: weekData.text
      });

      // Progress
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log('[doctolib] Semaine ' + (i+1) + '/' + mondayDates.length + ' : ' + monday);
      }

      // Sauvegarder régulièrement
      if ((i + 1) % 20 === 0) {
        fs.writeFileSync('/tmp/doctolib-year-data.json', JSON.stringify(allWeeks, null, 2));
        console.log('[doctolib] Sauvegarde intermédiaire : ' + allWeeks.length + ' semaines');
      }
    }

    // Sauvegarder tout
    fs.writeFileSync('/tmp/doctolib-year-data.json', JSON.stringify(allWeeks, null, 2));
    console.log('\n[doctolib] ANNÉE COMPLÈTE SCRAPÉE ! ' + allWeeks.length + ' semaines dans /tmp/doctolib-year-data.json');
    console.log('[doctolib] Screenshots: /tmp/doctolib-week-YYYY-MM-DD.png');

  } catch (err) {
    console.error('[doctolib] ERREUR:', err.message);
    await page.screenshot({ path: '/tmp/doctolib-error-month.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('[doctolib] Navigateur ferme');
  }
}

main().catch(console.error);
