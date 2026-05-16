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

  console.log('=== SYNC PATIENTS DOCTOLIB → JADOMI ===');
  console.log('12 099 patients a extraire\n');

  const allPatients = [];
  const totalPages = 267;
  const MAX_PAGES = totalPages; // Toutes les pages

  for (let p = 1; p <= MAX_PAGES; p++) {
    try {
      const url = 'https://pro.doctolib.fr/patients?s=&p=' + p + '&vi=false&pc=';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

      // Extraire les patients du tableau
      const patients = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr, table tr:not(:first-child)');
        const result = [];

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) return;

          // Colonne 1 : nom + tel + email
          const nameCell = cells[1] || cells[0];
          const fullText = nameCell.textContent.trim();

          // Extraire nom/prenom (premiere ligne, en gras ou premier element)
          const nameEl = nameCell.querySelector('a, strong, b, span:first-child, div:first-child');
          const nameParts = (nameEl?.textContent || fullText.split('\n')[0] || '').trim();

          // Extraire telephone
          const telMatch = fullText.match(/0[1-9][\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}/);

          // Extraire email
          const emailMatch = fullText.match(/[\w.-]+@[\w.-]+\.\w+/);

          // Colonne 2 : date de naissance
          const dobCell = cells[2];
          const dobText = dobCell?.textContent?.trim() || '';
          const dobMatch = dobText.match(/\d{2}\/\d{2}\/\d{4}/);

          // Colonne 3 : nombre de consultations
          const consultCell = cells[3];
          const consults = parseInt(consultCell?.textContent?.trim()) || 0;

          // Colonne 4 : derniere consultation
          const lastCell = cells[4];
          const lastConsult = lastCell?.textContent?.trim() || '';

          // Parser nom prenom
          let nom = '', prenom = '';
          // Pattern: "Mme NOM Prenom" ou "NOM Prenom" ou "M. NOM Prenom"
          const cleaned = nameParts.replace(/^(Mme?|M\.|Dr|Pr)\s+/i, '').trim();
          const parts = cleaned.split(/\s+/);
          if (parts.length >= 2) {
            // Si premier mot tout en MAJUSCULES = nom
            if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
              nom = parts[0];
              prenom = parts.slice(1).join(' ');
            } else {
              nom = parts[parts.length - 1];
              prenom = parts.slice(0, -1).join(' ');
            }
          } else {
            nom = cleaned;
          }

          if (nom) {
            result.push({
              nom,
              prenom,
              telephone: telMatch ? telMatch[0] : null,
              email: emailMatch ? emailMatch[0] : null,
              date_naissance: dobMatch ? dobMatch[0] : null,
              consultations: consults,
              derniere_consultation: lastConsult.substring(0, 30),
              source: 'doctolib'
            });
          }
        });

        return result;
      });

      allPatients.push(...patients);

      if (p % 20 === 0 || p === 1) {
        console.log('[Page ' + p + '/' + MAX_PAGES + '] ' + allPatients.length + ' patients extraits');
      }

      // Pause humaine entre les pages (1-3 secondes)
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

    } catch (err) {
      console.error('[Page ' + p + '] Erreur:', err.message.substring(0, 80));
      // Pause plus longue en cas d'erreur
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\n=== RESULTAT ===');
  console.log('Total patients extraits:', allPatients.length);

  // Stats
  const withTel = allPatients.filter(p => p.telephone).length;
  const withEmail = allPatients.filter(p => p.email).length;
  const withDob = allPatients.filter(p => p.date_naissance).length;
  console.log('Avec telephone:', withTel, '(' + Math.round(withTel/allPatients.length*100) + '%)');
  console.log('Avec email:', withEmail, '(' + Math.round(withEmail/allPatients.length*100) + '%)');
  console.log('Avec date naissance:', withDob, '(' + Math.round(withDob/allPatients.length*100) + '%)');

  // Sauvegarder
  fs.writeFileSync('/tmp/doctolib-all-patients.json', JSON.stringify(allPatients, null, 2));
  console.log('\nSauvegarde dans /tmp/doctolib-all-patients.json');

  // Sauvegarder state frais
  const newState = await context.storageState();
  fs.writeFileSync('/home/ubuntu/jadomi/.doctolib-state.json', JSON.stringify(newState, null, 2));

  await browser.close();
  console.log('Done');
})();
