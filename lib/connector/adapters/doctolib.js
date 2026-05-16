// =============================================
// JADOMI Connector — Adaptateur Doctolib
// Connexion via compte assistant/secretaire legitime
// Le praticien cree un compte "JADOMI" dans son equipe Doctolib
// Lecture seule de l'agenda — PAS de modification
// =============================================
const { ConnectorAdapter } = require('../framework');
const { chromium } = require('playwright');

class DoctolibAdapter extends ConnectorAdapter {
  constructor(config) {
    super(config);
    this.name = 'doctolib';
    this.email = config.email;       // email du compte assistant JADOMI
    this.password = config.password; // mot de passe du compte
    this.browser = null;
    this.page = null;
    this.cookies = null;
    this.lastLogin = null;
    this.LOGIN_TTL = 3600000; // re-login toutes les heures
  }

  async connect() {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris'
    });

    // Restaurer les cookies si on les a
    if (this.cookies) {
      await context.addCookies(this.cookies);
    }

    this.page = await context.newPage();
    console.log('[doctolib] Navigateur ouvert');
  }

  async disconnect() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) { /* */ }
      this.browser = null;
      this.page = null;
    }
    console.log('[doctolib] Deconnecte');
  }

  async testConnection() {
    try {
      await this.connect();
      await this._login();
      const isLoggedIn = await this._checkLoggedIn();
      await this.disconnect();
      return { ok: isLoggedIn, message: isLoggedIn ? 'Connecte a Doctolib' : 'Echec connexion' };
    } catch (err) {
      await this.disconnect();
      return { ok: false, error: err.message };
    }
  }

  // ===== LOGIN =====

  async _login() {
    // Si deja connecte recemment, pas besoin
    if (this.lastLogin && Date.now() - this.lastLogin < this.LOGIN_TTL) {
      const ok = await this._checkLoggedIn();
      if (ok) return;
    }

    console.log('[doctolib] Connexion en cours...');
    await this.page.goto('https://pro.doctolib.fr/login', { waitUntil: 'networkidle', timeout: 30000 });

    // Fermer TOUS les popups cookies Didomi
    await this._humanDelay(1500, 2500);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const dismissed = await this.page.evaluate(() => {
          // Methode 1 : API Didomi directe
          if (window.Didomi) {
            window.Didomi.setUserAgreeToAll();
            return 'didomi-api';
          }
          // Methode 2 : cliquer sur tous les boutons d'acceptation possibles
          const btns = document.querySelectorAll('#didomi-notice-agree-button, #didomi-notice-learn-more-button, [id*="didomi"] button, .didomi-popup button');
          for (const btn of btns) {
            if (btn.textContent.match(/accepter|agree|ok|tout accepter|continuer/i)) {
              btn.click();
              return 'button-click';
            }
          }
          // Methode 3 : supprimer les overlays Didomi
          document.querySelectorAll('#didomi-host, .didomi-popup-backdrop, #didomi-popup, #didomi-consent-popup').forEach(el => el.remove());
          return 'removed';
        });
        if (dismissed) {
          console.log('[doctolib] Popup cookies ferme (' + dismissed + ')');
          await this._humanDelay(500, 1000);
          break;
        }
      } catch (e) { /* pas de popup */ }
      await this._humanDelay(500, 1000);
    }

    // Pause humaine avant de taper
    await this._humanDelay(1000, 2500);

    // ETAPE 1 : Remplir email (Doctolib login 2 etapes)
    const emailInput = await this.page.$('input[type="email"]');
    if (emailInput) {
      await emailInput.click();
      await this._humanDelay(300, 800);
      await this._typeHuman(emailInput, this.email);
      console.log('[doctolib] Email saisi');
    } else {
      throw new Error('Champ email introuvable sur la page de login');
    }

    await this._humanDelay(800, 1500);

    // Cliquer sur "Continuer"
    const continueBtn = await this.page.$('button[type="submit"]');
    if (continueBtn) {
      await continueBtn.click();
      console.log('[doctolib] Bouton Continuer clique');
    }

    // Attendre le champ password VISIBLE (2eme etape — Doctolib le cache au debut)
    await this.page.waitForSelector('input[type="password"]:not(.hidden)', { state: 'visible', timeout: 15000 });
    await this._humanDelay(1000, 2000);

    // ETAPE 2 : Remplir password
    const passInput = await this.page.$('input[type="password"]:not(.hidden)');
    if (passInput) {
      await passInput.click();
      await this._humanDelay(200, 600);
      await this._typeHuman(passInput, this.password);
      console.log('[doctolib] Mot de passe saisi');
    } else {
      throw new Error('Champ mot de passe introuvable');
    }

    await this._humanDelay(800, 1500);

    // Cliquer sur "Se connecter"
    const loginBtn = await this.page.$('button[type="submit"]');
    if (loginBtn) {
      await loginBtn.click();
      console.log('[doctolib] Bouton Se connecter clique');
    }

    // Attendre la redirection post-login (ou page 2FA)
    await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await this._humanDelay(2000, 4000);

    // Sauvegarder les cookies
    this.cookies = await this.page.context().cookies();
    this.lastLogin = Date.now();

    const loggedIn = await this._checkLoggedIn();
    if (!loggedIn) {
      throw new Error('Echec connexion Doctolib — verifiez email/mot de passe');
    }

    console.log('[doctolib] Connecte avec succes');
  }

  async _checkLoggedIn() {
    try {
      const url = this.page.url();
      return url.includes('/agenda') || url.includes('/dashboard') || url.includes('/calendar') || !url.includes('/login');
    } catch {
      return false;
    }
  }

  // ===== LECTURE AGENDA =====

  async getAppointments(dateFrom, dateTo) {
    await this.connect();
    await this._login();

    const targetDate = dateFrom || new Date().toISOString().split('T')[0];
    console.log('[doctolib] Lecture agenda du', targetDate);

    // Naviguer vers l'agenda
    await this.page.goto(`https://pro.doctolib.fr/agenda/${targetDate}`, {
      waitUntil: 'networkidle',
      timeout: 20000
    });
    await this._humanDelay(2000, 4000);

    // Extraire les RDV depuis le DOM
    const appointments = await this.page.evaluate(() => {
      const rdvs = [];

      // Doctolib utilise des selectors varies — on tente plusieurs strategies
      const selectors = [
        '[data-test="appointment"]',
        '.appointment',
        '.event',
        '.calendar-event',
        '[class*="appointment"]',
        '[class*="event"]',
        '[class*="slot"][class*="booked"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const text = el.textContent || '';
            const timeEl = el.querySelector('[class*="time"], [class*="hour"], time');
            const nameEl = el.querySelector('[class*="patient"], [class*="name"], [class*="title"]');
            const motifEl = el.querySelector('[class*="motif"], [class*="reason"], [class*="motive"]');

            rdvs.push({
              patient_name_full: nameEl?.textContent?.trim() || text.substring(0, 50).trim(),
              heure: timeEl?.textContent?.trim() || '',
              motif: motifEl?.textContent?.trim() || '',
              raw_text: text.substring(0, 200).trim(),
              source: 'doctolib'
            });
          });
          break;
        }
      }

      // Fallback : intercepter les donnees depuis le JSON interne Doctolib
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const content = s.textContent || '';
        if (content.includes('"appointments"') || content.includes('"events"')) {
          try {
            const match = content.match(/"appointments"\s*:\s*(\[[\s\S]*?\])/);
            if (match) {
              const data = JSON.parse(match[1]);
              data.forEach(a => {
                rdvs.push({
                  id_externe: a.id || '',
                  patient_name_full: [a.patient_last_name, a.patient_first_name].filter(Boolean).join(' ') || a.name || '',
                  date_heure: a.start_date || a.start || '',
                  date_fin: a.end_date || a.end || '',
                  motif: a.motive || a.visit_motive || '',
                  praticien: a.practitioner_name || '',
                  source: 'doctolib_json'
                });
              });
            }
          } catch (e) { /* parse error */ }
        }
      }

      return rdvs;
    });

    // Parser les noms patients
    const parsed = appointments.map(rdv => {
      const patient = this._parsePatientName(rdv.patient_name_full);
      return {
        ...rdv,
        patient_nom: patient.nom,
        patient_prenom: patient.prenom,
        date: targetDate,
        synced_at: new Date().toISOString()
      };
    });

    console.log('[doctolib]', parsed.length, 'RDV trouves pour', targetDate);
    return parsed;
  }

  // ===== LECTURE PATIENTS =====

  async getPatients(since) {
    // Extraire les patients uniques depuis les RDV
    const today = new Date();
    const from = since || new Date(today - 30 * 24 * 3600000).toISOString().split('T')[0];
    const to = new Date(today.getTime() + 7 * 24 * 3600000).toISOString().split('T')[0];

    const appointments = await this.getAppointments(from, to);
    const patientsMap = new Map();

    for (const rdv of appointments) {
      if (rdv.patient_nom) {
        const key = `${rdv.patient_nom}_${rdv.patient_prenom}`.toLowerCase();
        if (!patientsMap.has(key)) {
          patientsMap.set(key, {
            nom: rdv.patient_nom,
            prenom: rdv.patient_prenom,
            source: 'doctolib'
          });
        }
      }
    }

    return Array.from(patientsMap.values());
  }

  async getMedicalHistory() {
    // Doctolib ne stocke pas d'antecedents medicaux
    return null;
  }

  async discoverSchema() {
    return [{ name: 'agenda_doctolib', columns: [
      { name: 'patient_name', type: 'TEXT' },
      { name: 'date', type: 'DATE' },
      { name: 'heure', type: 'TIME' },
      { name: 'motif', type: 'TEXT' },
      { name: 'praticien', type: 'TEXT' }
    ]}];
  }

  // ===== HELPERS =====

  // Delai humain aleatoire entre min et max ms
  async _humanDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min) + min);
    await new Promise(r => setTimeout(r, delay));
  }

  // Taper comme un humain (lettre par lettre avec delai variable)
  async _typeHuman(element, text) {
    for (const char of text) {
      await element.type(char);
      await this._humanDelay(50, 180);
    }
  }

  // Parser "BENALI Fatima" ou "Fatima Benali" en { nom, prenom }
  _parsePatientName(fullName) {
    if (!fullName) return { nom: '', prenom: '' };
    let name = fullName.trim();

    // Retirer prefixes courants
    name = name.replace(/^(M\.|Mme|Dr|Pr)\s+/i, '');

    const parts = name.split(/\s+/).filter(p => p.length > 0);
    if (parts.length < 2) return { nom: name, prenom: '' };

    // Si premier mot tout en MAJUSCULES = c'est le nom
    if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
      return { nom: parts[0], prenom: parts.slice(1).join(' ') };
    }

    // Sinon convention : prenom(s) + nom (dernier mot)
    return {
      prenom: parts.slice(0, -1).join(' '),
      nom: parts[parts.length - 1]
    };
  }
}

module.exports = DoctolibAdapter;
