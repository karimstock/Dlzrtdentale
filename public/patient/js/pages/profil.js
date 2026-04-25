/* ═══════════════════════════════════════════════
   JADOMI Patient — Profil
   ═══════════════════════════════════════════════ */

Router.register('/profil', async (container) => {
  let patient = {};
  try {
    patient = JSON.parse(localStorage.getItem('jadomi_patient') || '{}');
  } catch {}

  const initials = getInitials(patient.name || patient.prenom || 'P');
  let pushEnabled = Notification.permission === 'granted';

  container.innerHTML = `
    <div class="profil-avatar">${initials}</div>
    <h2 class="section-title text-center">${patient.name || patient.prenom || 'Patient'}</h2>
    <p class="text-center text-muted mb-lg">${patient.phone || ''}</p>

    <!-- Edit Form -->
    <div class="card mb-md">
      <div class="input-group mb-md">
        <label>Nom complet</label>
        <input class="input" id="prof-name" value="${patient.name || patient.prenom || ''}" placeholder="Votre nom" />
      </div>
      <div class="input-group mb-md">
        <label>Email</label>
        <input class="input" id="prof-email" type="email" value="${patient.email || ''}" placeholder="votre@email.com" />
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-profile">
        Enregistrer
      </button>
    </div>

    <!-- Notifications -->
    <div class="card mb-md">
      <h3 class="fw-600 mb-sm" style="font-size:15px;">Notifications</h3>

      <div class="toggle-row">
        <div>
          <div class="toggle-row-label">Notifications push</div>
          <div class="toggle-row-desc">Recevez les rappels de RDV et messages</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-push" ${pushEnabled ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-row-label">Rappels de rendez-vous</div>
          <div class="toggle-row-desc">24h et 1h avant le rendez-vous</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-reminders" checked />
          <span class="toggle-track"></span>
        </label>
      </div>

      <div class="toggle-row" style="border-bottom:none;">
        <div>
          <div class="toggle-row-label">Messages du cabinet</div>
          <div class="toggle-row-desc">Nouveaux messages et documents</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="toggle-messages" checked />
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

    <button class="btn btn-ghost btn-block mb-md" id="btn-unsubscribe" style="color:var(--error);font-size:13px;">
      Me desinscrire
    </button>

    <p class="text-center text-xs text-muted mt-lg">
      JADOMI Patient v1.0.0<br/>
      Propulse par JADOMI
    </p>`;

  // Save profile
  container.querySelector('#btn-save-profile').addEventListener('click', async () => {
    const name = container.querySelector('#prof-name').value.trim();
    const email = container.querySelector('#prof-email').value.trim();
    const btn = container.querySelector('#btn-save-profile');

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm"></div>';

    try {
      await JadomiAPI.patch('/patient/profile', { name, email });
      patient.name = name;
      patient.email = email;
      localStorage.setItem('jadomi_patient', JSON.stringify(patient));
      btn.textContent = 'Enregistre !';
      btn.style.background = 'var(--success)';
      setTimeout(() => {
        btn.textContent = 'Enregistrer';
        btn.style.background = '';
        btn.disabled = false;
      }, 2000);
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
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          e.target.checked = false;
          showError(document.body, 'Notifications refusees par le navigateur');
          return;
        }
        // Subscribe to push
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          // In production: subscribe with VAPID key
          showError(document.body, 'Notifications activees');
        }
      } catch {
        e.target.checked = false;
      }
    } else {
      // Unsubscribe
      try {
        await JadomiAPI.post('/patient/push/unsubscribe', {});
      } catch {}
    }
  });

  // Logout
  container.querySelector('#btn-logout').addEventListener('click', () => {
    JadomiAPI.clearToken();
    localStorage.removeItem('jadomi_patient');
    Router.navigate('/login');
  });

  // Unsubscribe
  container.querySelector('#btn-unsubscribe').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 class="section-title" style="font-size:18px">Me desinscrire</h3>
        <p class="text-muted mb-md">Vos donnees seront supprimees et vous ne recevrez plus de notifications. Cette action est irreversible.</p>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-danger btn-block" id="confirm-unsub">Confirmer la desinscription</button>
          <button class="btn btn-secondary btn-block" id="cancel-unsub">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#cancel-unsub').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#confirm-unsub').addEventListener('click', async () => {
      try {
        await JadomiAPI.del('/patient/profile');
      } catch {}
      JadomiAPI.clearToken();
      localStorage.removeItem('jadomi_patient');
      overlay.remove();
      Router.navigate('/login');
    });
  });

  function getInitials(name) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'P';
  }
});
