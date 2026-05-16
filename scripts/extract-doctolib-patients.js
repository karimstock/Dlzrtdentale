require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const state = JSON.parse(fs.readFileSync('/home/ubuntu/jadomi/.doctolib-state.json', 'utf8'));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: state,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1366, height: 768 }, locale: 'fr-FR', timezoneId: 'Europe/Paris'
  });
  const page = await context.newPage();

  // === Aller sur Gestion des patients ===
  console.log('[1] Navigation vers patients...');
  await page.goto('https://pro.doctolib.fr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // Cliquer sur "Gestion des patients"
  const patientLink = await page.$('a[href*="patient"], button:has-text("Gestion des patients"), [aria-label*="patient"]');
  if (patientLink) {
    await patientLink.click();
    console.log('[2] Clic Gestion des patients');
    await new Promise(r => setTimeout(r, 5000));
  } else {
    // Essayer via URL directe
    await page.goto('https://pro.doctolib.fr/patients', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('[3] URL:', page.url());
  await page.screenshot({ path: '/tmp/doctolib-patients-list.png', fullPage: true });

  // Analyser la page patients
  const pageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      text: document.body.innerText.substring(0, 3000),
      tables: [...document.querySelectorAll('table')].map(t => ({
        rows: t.rows.length,
        headers: [...(t.rows[0]?.cells || [])].map(c => c.textContent.trim())
      })),
      links: [...document.querySelectorAll('a[href*="patient"]')].slice(0, 10).map(a => ({
        text: a.textContent.trim().substring(0, 60),
        href: a.href
      }))
    };
  });

  console.log('[4] Page patients:');
  console.log(pageInfo.text.substring(0, 2000));
  console.log('\nTables:', JSON.stringify(pageInfo.tables, null, 2));
  console.log('\nLiens patients:', JSON.stringify(pageInfo.links, null, 2));

  // === Essayer d'extraire les patients depuis l'agenda (methode alternative) ===
  console.log('\n[5] Extraction patients depuis agenda...');
  await page.goto('https://pro.doctolib.fr/calendar/today/week', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));

  // Cliquer sur chaque patient pour voir ses details
  // D'abord extraire les noms depuis l'agenda
  const agendaPatients = await page.evaluate(() => {
    const patients = [];
    // Les noms de patients dans l'agenda
    const elements = document.querySelectorAll('[class*="appointment"], [class*="event"], [data-testid], [class*="slot"]');
    elements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 2 && text.length < 200) {
        patients.push(text.substring(0, 100));
      }
    });

    // Aussi chercher dans les divs qui contiennent des noms
    document.querySelectorAll('div, span').forEach(el => {
      const t = el.textContent.trim();
      // Pattern: NOM en majuscules suivi de prenom
      if (t.match(/^[A-ZÉÈÊËÀÂÙÛÎÏÔÇ]{2,}\s+[A-ZÉÈÊËÀÂÙÛÎÏÔÇa-zéèêëàâùûîïôç]+$/) && t.length < 50) {
        if (!patients.includes(t)) patients.push(t);
      }
    });

    return [...new Set(patients)];
  });

  console.log('[6] Patients trouves dans agenda:', agendaPatients.length);
  agendaPatients.slice(0, 30).forEach(p => console.log('  -', p));

  // === Utiliser la recherche patient pour extraire les details ===
  console.log('\n[7] Extraction details patients via recherche...');
  const allPatients = [];

  // Prendre les noms uniques de l'agenda
  const uniqueNames = [];
  const namePattern = /^([A-ZÉÈÊËÀÂÙÛÎÏÔÇ\s-]+)\s+([A-Za-zéèêëàâùûîïôç\s-]+)/;

  for (const name of agendaPatients) {
    const match = name.match(namePattern);
    if (match) {
      const key = match[1].trim() + '_' + match[2].trim();
      if (!uniqueNames.some(n => n.key === key)) {
        uniqueNames.push({ key, nom: match[1].trim(), prenom: match[2].trim(), full: name });
      }
    }
  }

  console.log('[8] Noms uniques:', uniqueNames.length);

  // Pour chaque patient, chercher dans Doctolib pour avoir les details
  for (let i = 0; i < Math.min(uniqueNames.length, 50); i++) {
    const patient = uniqueNames[i];
    try {
      // Utiliser la barre de recherche
      const searchInput = await page.$('input[placeholder*="patient"], input[type="search"], input[aria-label*="chercher"]');
      if (searchInput && i < 10) { // Limiter a 10 pour pas surcharger
        await searchInput.fill('');
        await searchInput.type(patient.nom + ' ' + patient.prenom, { delay: 50 });
        await new Promise(r => setTimeout(r, 2000));

        // Lire les resultats de recherche
        const searchResults = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('[class*="search-result"], [class*="suggestion"], [role="option"], [class*="patient-item"], li, [class*="dropdown-item"]').forEach(el => {
            const text = el.textContent.trim();
            if (text.length > 5 && text.length < 300) {
              results.push(text);
            }
          });
          return results.slice(0, 5);
        });

        if (searchResults.length > 0) {
          // Extraire email/tel des resultats
          const detail = searchResults.join(' ');
          const emailMatch = detail.match(/[\w.-]+@[\w.-]+\.\w+/);
          const telMatch = detail.match(/0[1-9][\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/);

          allPatients.push({
            nom: patient.nom,
            prenom: patient.prenom,
            email: emailMatch ? emailMatch[0] : null,
            telephone: telMatch ? telMatch[0] : null,
            search_result: searchResults[0]?.substring(0, 200),
            source: 'doctolib'
          });
        } else {
          allPatients.push({
            nom: patient.nom,
            prenom: patient.prenom,
            email: null,
            telephone: null,
            source: 'doctolib'
          });
        }

        // Fermer la recherche
        await searchInput.fill('');
        await new Promise(r => setTimeout(r, 500));
      } else {
        allPatients.push({
          nom: patient.nom,
          prenom: patient.prenom,
          email: null,
          telephone: null,
          source: 'doctolib'
        });
      }
    } catch (e) {
      allPatients.push({
        nom: patient.nom,
        prenom: patient.prenom,
        email: null,
        telephone: null,
        source: 'doctolib'
      });
    }
  }

  console.log('\n=== PATIENTS EXTRAITS ===');
  console.log('Total:', allPatients.length);
  allPatients.forEach(p => {
    console.log(`  ${p.nom} ${p.prenom} | ${p.email || '-'} | ${p.telephone || '-'}`);
  });

  // Sauvegarder
  fs.writeFileSync('/tmp/doctolib-patients.json', JSON.stringify(allPatients, null, 2));
  console.log('\nSauvegarde dans /tmp/doctolib-patients.json');

  await browser.close();
  console.log('Done');
})();
