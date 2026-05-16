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

  console.log('=== SYNC PATIENTS DOCTOLIB → JADOMI ===\n');

  const allPatients = [];
  const totalPages = 267;

  for (let p = 1; p <= totalPages; p++) {
    try {
      await page.goto('https://pro.doctolib.fr/patients?s=&p=' + p + '&vi=false&pc=', {
        waitUntil: 'domcontentloaded', timeout: 30000
      });
      await new Promise(r => setTimeout(r, 2500 + Math.random() * 1500));

      // Extraire via le innerText de chaque ligne du tableau
      const patients = await page.evaluate(() => {
        const results = [];
        // Chaque ligne patient est un <tr> ou un <a> dans le tableau
        const rows = document.querySelectorAll('table tbody tr');

        rows.forEach(row => {
          const text = row.innerText || '';
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length < 1) return;

          // Premiere ligne = nom du patient (lien cliquable)
          const nameLink = row.querySelector('a');
          const fullName = nameLink ? nameLink.textContent.trim() : lines[0];

          // Chercher telephone dans le texte
          const telMatch = text.match(/0[1-9][\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}/);

          // Chercher email
          const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);

          // Chercher date de naissance (format DD/MM/YYYY)
          const dobMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);

          // Nombre de consultations
          const consultMatch = text.match(/\t(\d+)\t/);
          const consults = consultMatch ? parseInt(consultMatch[1]) : 0;

          // Parser nom prenom
          let nom = '', prenom = '';
          const cleaned = fullName.replace(/^(Mme?\.?|M\.|Dr\.?|Pr\.?)\s+/i, '').trim();
          const parts = cleaned.split(/\s+/);

          if (parts.length >= 2) {
            // Tout en MAJUSCULES = NOM, reste = prenom
            const upperParts = [];
            const lowerParts = [];
            parts.forEach(part => {
              if (part === part.toUpperCase() && part.length > 1 && !part.match(/^\d/)) {
                upperParts.push(part);
              } else {
                lowerParts.push(part);
              }
            });

            if (upperParts.length > 0) {
              nom = upperParts.join(' ');
              prenom = lowerParts.join(' ');
            } else {
              nom = parts[parts.length - 1];
              prenom = parts.slice(0, -1).join(' ');
            }
          } else {
            nom = cleaned;
          }

          if (nom && nom.length > 1) {
            results.push({
              nom: nom,
              prenom: prenom,
              telephone: telMatch ? telMatch[0] : null,
              email: emailMatch ? emailMatch[0] : null,
              date_naissance: dobMatch ? dobMatch[1] : null,
              consultations: consults,
              source: 'doctolib'
            });
          }
        });

        return results;
      });

      allPatients.push(...patients);

      if (p % 25 === 0 || p === 1 || p === totalPages) {
        console.log('[Page ' + p + '/' + totalPages + '] ' + allPatients.length + ' patients (' + patients.length + ' cette page)');
      }

      // Pause humaine
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    } catch (err) {
      console.error('[Page ' + p + '] Erreur:', err.message.substring(0, 60));
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Deduplication
  const seen = new Map();
  const deduped = [];
  for (const p of allPatients) {
    const key = (p.nom + '_' + p.prenom + '_' + (p.date_naissance || '')).toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(p);
    }
  }

  console.log('\n=== RESULTAT ===');
  console.log('Total brut:', allPatients.length);
  console.log('Apres dedup:', deduped.length);
  console.log('Doublons retires:', allPatients.length - deduped.length);

  const withTel = deduped.filter(p => p.telephone).length;
  const withEmail = deduped.filter(p => p.email).length;
  const withDob = deduped.filter(p => p.date_naissance).length;
  console.log('Avec telephone:', withTel, '(' + Math.round(withTel/deduped.length*100) + '%)');
  console.log('Avec email:', withEmail, '(' + Math.round(withEmail/deduped.length*100) + '%)');
  console.log('Avec date naissance:', withDob, '(' + Math.round(withDob/deduped.length*100) + '%)');

  fs.writeFileSync('/tmp/doctolib-all-patients.json', JSON.stringify(deduped, null, 2));
  console.log('\nSauvegarde dans /tmp/doctolib-all-patients.json');

  // State frais
  const newState = await context.storageState();
  fs.writeFileSync('/home/ubuntu/jadomi/.doctolib-state.json', JSON.stringify(newState, null, 2));

  await browser.close();
  console.log('Done');
})();
