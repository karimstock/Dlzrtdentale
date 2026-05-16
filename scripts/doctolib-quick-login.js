#!/usr/bin/env node
// =============================================
// JADOMI — Login Doctolib avec CODE RAPIDE (PIN 4446)
// Pas de mot de passe, pas de 2FA email
// =============================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EMAIL = process.env.DOCTOLIB_EMAIL;
const PIN = process.env.DOCTOLIB_PIN || '4446';

async function humanDelay(min, max) {
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min) + min)));
}

async function typeHuman(el, text) {
  for (const char of text) { await el.type(char); await humanDelay(40, 120); }
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
    // === PAGE LOGIN ===
    await page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(2000, 3000);

    // Cookies
    const acceptBtn = await page.$('button:has-text("ACCEPTER"), button:has-text("Accepter")');
    if (acceptBtn) { await acceptBtn.click(); await humanDelay(1500, 2500); }

    // Email
    const emailInput = await page.$('input[type="email"], input[name="email"], input[type="text"]');
    if (emailInput) { await emailInput.click(); await humanDelay(300, 600); await typeHuman(emailInput, EMAIL); }
    await humanDelay(800, 1200);

    // Screenshot avant soumission
    await page.screenshot({ path: '/tmp/doctolib-quick-01-email.png' });

    // Soumettre email
    await page.keyboard.press('Enter');
    console.log('[doctolib] Email soumis');
    await humanDelay(3000, 5000);

    // Screenshot page après email — chercher le lien code rapide
    await page.screenshot({ path: '/tmp/doctolib-quick-02-after-email.png' });
    console.log('[doctolib] URL:', page.url());

    // Lister TOUS les liens et boutons visibles sur la page
    const pageElements = await page.evaluate(() => {
      const result = { links: [], buttons: [], inputs: [] };
      document.querySelectorAll('a, button, [role="link"], [role="button"]').forEach(el => {
        if (el.offsetParent !== null || el.offsetHeight > 0) {
          result.links.push({
            tag: el.tagName,
            text: el.textContent.trim().substring(0, 100),
            href: el.href || '',
            class: el.className?.substring?.(0, 100) || ''
          });
        }
      });
      document.querySelectorAll('input').forEach(inp => {
        result.inputs.push({
          type: inp.type, name: inp.name, id: inp.id,
          placeholder: inp.placeholder,
          visible: inp.offsetParent !== null
        });
      });
      return result;
    });

    console.log('\n=== ÉLÉMENTS VISIBLES SUR LA PAGE ===');
    console.log('LIENS/BOUTONS:');
    pageElements.links.forEach(l => console.log('  [' + l.tag + '] ' + l.text));
    console.log('INPUTS:');
    pageElements.inputs.forEach(i => console.log('  [' + i.type + '] name=' + i.name + ' id=' + i.id + ' visible=' + i.visible + ' placeholder=' + i.placeholder));

    // Chercher "code rapide", "connexion rapide", "code PIN", "code à usage unique"
    const quickLink = await page.evaluate(() => {
      const allEls = document.querySelectorAll('a, button, [role="link"], [role="button"], span, div, p');
      for (const el of allEls) {
        const t = el.textContent.trim().toLowerCase();
        if (t.includes('code rapide') || t.includes('connexion rapide') || t.includes('code pin') ||
            t.includes('quick code') || t.includes('code unique') || t.includes('code à usage') ||
            t.includes('problème') || t.includes('autre méthode') || t.includes('autre moyen')) {
          if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.closest('a') || el.closest('button')) {
            const clickable = el.closest('a') || el.closest('button') || el;
            clickable.click();
            return { found: true, text: t, tag: el.tagName };
          }
          return { found: false, text: t, tag: el.tagName, note: 'trouvé mais pas cliquable' };
        }
      }
      return { found: false };
    });

    console.log('\nRecherche code rapide:', JSON.stringify(quickLink));

    if (quickLink.found) {
      await humanDelay(3000, 5000);
      await page.screenshot({ path: '/tmp/doctolib-quick-03-after-click.png' });
      console.log('[doctolib] URL apres clic:', page.url());

      // Chercher champ pour PIN
      const pinInput = await page.$('input[type="tel"], input[type="text"], input[type="password"], input[inputmode="numeric"]');
      if (pinInput) {
        await pinInput.click();
        await typeHuman(pinInput, PIN);
        console.log('[doctolib] PIN 4446 saisi');
        await humanDelay(800, 1200);

        // Soumettre
        await page.evaluate(() => {
          for (const btn of document.querySelectorAll('button')) {
            if (btn.offsetParent === null) continue;
            const t = btn.textContent.trim().toUpperCase();
            if (t.includes('CONNECT') || t.includes('VALIDER') || t.includes('CONFIRMER')) {
              btn.click(); return;
            }
          }
        });
        await humanDelay(5000, 7000);
      }
    } else {
      // Essayer le "Mot de passe oublié" qui pourrait mener au code rapide
      console.log('[doctolib] Pas de lien code rapide trouvé, essai "Mot de passe oublié"...');
      const forgotLink = await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, button, [role="link"]')) {
          if (el.textContent.trim().toLowerCase().includes('oublié') || el.textContent.trim().toLowerCase().includes('problème')) {
            el.click();
            return el.textContent.trim();
          }
        }
        return null;
      });
      if (forgotLink) {
        console.log('[doctolib] Clic sur:', forgotLink);
        await humanDelay(3000, 5000);
        await page.screenshot({ path: '/tmp/doctolib-quick-03-forgot.png' });
      }
    }

    // Screenshot final
    await page.screenshot({ path: '/tmp/doctolib-quick-final.png' });
    console.log('[doctolib] URL finale:', page.url());

  } catch (err) {
    console.error('[doctolib] ERREUR:', err.message);
    await page.screenshot({ path: '/tmp/doctolib-quick-error.png' }).catch(() => {});
  } finally {
    await browser.close();
    console.log('[doctolib] Navigateur ferme');
  }
}

main().catch(console.error);
