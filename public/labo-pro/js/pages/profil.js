/* ═══════════════════════════════════════════════
   JADOMI Labo — Profil
   ═══════════════════════════════════════════════ */

Router.register('/profil', async (container) => {
  let labo = {};
  try {
    labo = JSON.parse(localStorage.getItem('jadomi_labo') || '{}');
  } catch {}

  // Default demo data
  if (!labo.nom) {
    labo = {
      nom: 'Laboratoire Precision Dentaire',
      email: 'contact@precision-dentaire.fr',
      specialites: ['Ceramique', 'Zircone', 'CFAO'],
    };
    localStorage.setItem('jadomi_labo', JSON.stringify(labo));
  }

  const initials = getInitials(labo.nom || 'L');
  let pushEnabled = 'Notification' in window && Notification.permission === 'granted';

  const allSpecialites = [
    'Ceramique',
    'Zircone',
    'Implant',
    'Orthodontie',
    'CFAO',
    'Amovible',
  ];

  container.innerHTML = `
    <div class="profil-avatar">${initials}</div>
    <h2 class="section-title text-center">${labo.nom || 'Mon Laboratoire'}</h2>
    <p class="text-center text-muted mb-lg">${labo.email || ''}</p>

    <!-- Edit Form -->
    <div class="card mb-md">
      <div class="section-subtitle" style="margin-top:0">Informations</div>
      <div class="input-group mb-md">
        <label>Nom du laboratoire</label>
        <input class="input" id="prof-nom" value="${labo.nom || ''}" placeholder="Nom du laboratoire" />
      </div>
      <div class="input-group mb-md">
        <label>Email professionnel</label>
        <input class="input" id="prof-email" type="email" value="${labo.email || ''}" placeholder="contact@monlabo.fr" />
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-profile">
        Enregistrer
      </button>
    </div>

    <!-- Specialites -->
    <div class="card mb-md">
      <div class="section-subtitle" style="margin-top:0">Specialites</div>
      <div id="specialites-list">
        ${allSpecialites.map(s => `
          <div class="checkbox-row">
            <input type="checkbox" id="spec-${s}" value="${s}" ${(labo.specialites || []).includes(s) ? 'checked' : ''} />
            <label for="spec-${s}">${s}</label>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Notifications -->
    <div class="card mb-md">
      <div class="section-subtitle" style="margin-top:0">Notifications</div>

      <div class="toggle-row">
        <div>
          <div class="toggle-row-label">Notifications push</div>
          <div class="toggle-row-desc">Recevez les alertes de nouveaux cas et messages</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-push" ${pushEnabled ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="toggle-row" style="border-bottom:none">
        <div>
          <div class="toggle-row-label">Nouveaux cas</div>
          <div class="toggle-row-desc">Notification a chaque nouveau cas recu</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-cases" checked />
          <span class="toggle-track"></span>
        </label>
      </div>
    </div>

    <!-- Actions -->
    <div class="card mb-md">
      <button class="btn btn-ghost btn-block" id="btn-logout" style="color:var(--text-secondary);justify-content:flex-start;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
        Se deconnecter
      </button>
    </div>

    <p class="text-center text-xs text-muted mt-lg">
      JADOMI Labo v1.0.0<br/>
      Propulse par JADOMI
    </p>`;

  // Save profile
  container.querySelector('#btn-save-profile').addEventListener('click', async () => {
    const nom = container.querySelector('#prof-nom').value.trim();
    const email = container.querySelector('#prof-email').value.trim();
    const btn = container.querySelector('#btn-save-profile');

    // Gather specialites
    const specialites = [];
    container.querySelectorAll('#specialites-list input[type="checkbox"]:checked').forEach(cb => {
      specialites.push(cb.value);
    });

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm"></div>';

    try {
      // In production: await LaboAPI.patch('/labo/profile', { nom, email, specialites });
      labo.nom = nom;
      labo.email = email;
      labo.specialites = specialites;
      localStorage.setItem('jadomi_labo', JSON.stringify(labo));

      btn.textContent = 'Enregistre !';
      btn.style.background = 'var(--success)';
      setTimeout(() => {
        btn.textContent = 'Enregistrer';
        btn.style.background = '';
        btn.disabled = false;
      }, 2000);

      // Update header
      const headerName = document.getElementById('labo-name');
      if (headerName) headerName.textContent = nom || 'JADOMI Labo';
    } catch (err) {
      btn.textContent = 'Enregistrer';
      btn.disabled = false;
      showError(document.body, err.message);
    }
  });

  // Push toggle
  container.querySelector('#toggle-push').addEventListener('change', async (e) => {
    if (e.target.checked) {
      try {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            e.target.checked = false;
            showError(document.body, 'Notifications refusees par le navigateur');
            return;
          }
        }
      } catch {
        e.target.checked = false;
      }
    }
  });

  // Logout
  container.querySelector('#btn-logout').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 class="section-title" style="font-size:18px">Se deconnecter</h3>
        <p class="text-muted mb-md">Vous devrez vous reconnecter avec votre email et un nouveau code OTP.</p>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-danger btn-block" id="confirm-logout">Se deconnecter</button>
          <button class="btn btn-secondary btn-block" id="cancel-logout">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#cancel-logout').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#confirm-logout').addEventListener('click', () => {
      LaboAPI.clearToken();
      localStorage.removeItem('jadomi_labo');
      overlay.remove();
      Router.navigate('/login');
    });
  });

  function getInitials(name) {
    return name.split(' ').map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'L';
  }
});
