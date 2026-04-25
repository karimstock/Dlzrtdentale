/* ═══════════════════════════════════════════════
   JADOMI Patient — Mes Rendez-vous
   ═══════════════════════════════════════════════ */

Router.register('/mes-rdv', async (container) => {
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  // Show skeleton while loading
  container.innerHTML = `
    <h2 class="section-title">Mes rendez-vous</h2>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>`;

  let upcoming = [];
  let past = [];

  try {
    const data = await JadomiAPI.get('/patient/appointments');
    const now = new Date();
    const all = data.appointments || [];
    upcoming = all.filter((a) => new Date(a.date) >= now);
    past = all.filter((a) => new Date(a.date) < now);
  } catch (err) {
    // Use demo data for shell preview
    upcoming = getDemoUpcoming();
    past = getDemoPast();
  }

  renderPage();

  function renderPage() {
    container.innerHTML = `
      <h2 class="section-title">Mes rendez-vous</h2>

      ${upcoming.length === 0 ? `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <h3>Aucun rendez-vous</h3>
          <p>Vous n'avez pas de rendez-vous a venir pour le moment.</p>
        </div>
      ` : renderUpcoming()}

      <button class="btn btn-secondary btn-block mt-md" id="btn-waitlist">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        Rejoindre la liste d'attente
      </button>

      ${past.length > 0 ? `
        <div class="mt-lg">
          <div class="collapsible-header" id="toggle-past">
            <span class="section-subtitle" style="margin:0">Rendez-vous passes (${past.length})</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <div class="collapsible-body" id="past-list">
            ${past.map((a) => renderCard(a, true)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Collapsible past section
    const toggleBtn = container.querySelector('#toggle-past');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        toggleBtn.classList.toggle('open');
        container.querySelector('#past-list').classList.toggle('open');
      });
    }

    // Waitlist
    container.querySelector('#btn-waitlist')?.addEventListener('click', () => {
      showWaitlistModal();
    });

    // Cancel buttons
    container.querySelectorAll('.btn-cancel-rdv').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        showCancelConfirm(id);
      });
    });
  }

  function renderUpcoming() {
    // Group by series
    const series = {};
    const standalone = [];

    upcoming.forEach((a) => {
      if (a.series_id) {
        if (!series[a.series_id]) series[a.series_id] = { name: a.series_name, items: [], done: a.series_done || 0, total: a.series_total || 0 };
        series[a.series_id].items.push(a);
      } else {
        standalone.push(a);
      }
    });

    let html = '';

    // Render series
    Object.values(series).forEach((s) => {
      html += `
        <div class="series-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h8"/></svg>
          <span>Serie: ${s.name} — ${s.done}/${s.total} effectues</span>
          <div class="series-progress">
            ${Array.from({ length: s.total }, (_, i) => `<div class="series-dot ${i < s.done ? 'done' : ''}"></div>`).join('')}
          </div>
        </div>`;
      s.items.forEach((a) => { html += renderCard(a); });
    });

    // Standalone
    standalone.forEach((a) => { html += renderCard(a); });

    return html;
  }

  function renderCard(appt, isPast = false) {
    const d = new Date(appt.date);
    const day = d.getDate();
    const month = MONTHS[d.getMonth()];
    const dayName = DAYS[d.getDay()];
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    const statusClass = appt.status === 'confirmed' ? 'confirmed'
      : appt.status === 'cancelled' ? 'cancelled' : 'pending';
    const statusLabel = appt.status === 'confirmed' ? 'Confirme'
      : appt.status === 'cancelled' ? 'Annule' : 'En attente';

    return `
      <div class="rdv-card">
        <div class="rdv-date-col">
          <span class="day">${day}</span>
          <span class="month">${month}</span>
        </div>
        <div class="rdv-info">
          <span class="time">${dayName} ${time}</span>
          <span class="type">${appt.type || 'Consultation'}</span>
          <span class="praticien">${appt.praticien || ''}</span>
        </div>
        <div class="flex flex-col items-center gap-xs">
          <span class="rdv-status ${statusClass}">${statusLabel}</span>
          ${!isPast && appt.status !== 'cancelled' ? `
            <button class="btn-cancel-rdv btn btn-ghost text-xs" data-id="${appt.id}" style="padding:4px 8px;color:var(--error);font-size:11px;">
              Annuler
            </button>
          ` : ''}
        </div>
      </div>`;
  }

  function showCancelConfirm(id) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 class="section-title" style="font-size:18px">Annuler ce rendez-vous ?</h3>
        <p class="text-muted mb-md">Cette action est irreversible. Le cabinet sera notifie de votre annulation.</p>
        <div class="flex flex-col gap-sm">
          <button class="btn btn-danger btn-block" id="confirm-cancel">Oui, annuler</button>
          <button class="btn btn-secondary btn-block" id="dismiss-cancel">Non, garder</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#dismiss-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#confirm-cancel').addEventListener('click', async () => {
      try {
        await JadomiAPI.patch(`/patient/appointments/${id}`, { status: 'cancelled' });
        overlay.remove();
        // Reload page
        Router.navigate('/mes-rdv');
      } catch (err) {
        showError(document.body, err.message);
        overlay.remove();
      }
    });
  }

  function showWaitlistModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 class="section-title" style="font-size:18px">Liste d'attente</h3>
        <p class="text-muted mb-md">Indiquez le type de rendez-vous souhaite et nous vous contacterons des qu'un creneau se libere.</p>
        <div class="input-group mb-md">
          <label>Type de soin</label>
          <input class="input" placeholder="Ex: Detartrage, Controle..." id="wl-type" />
        </div>
        <div class="input-group mb-md">
          <label>Preferences horaires</label>
          <input class="input" placeholder="Ex: Matin, apres 14h..." id="wl-pref" />
        </div>
        <button class="btn btn-primary btn-block" id="wl-submit">M'inscrire</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#wl-submit').addEventListener('click', async () => {
      const type = overlay.querySelector('#wl-type').value;
      const pref = overlay.querySelector('#wl-pref').value;
      try {
        await JadomiAPI.post('/waitlist/join', { type, preferences: pref });
        overlay.remove();
        showError(document.body, 'Vous etes inscrit sur la liste d\'attente !'); // reuse toast
      } catch (err) {
        showError(document.body, err.message);
      }
    });
  }

  /* ── Demo Data ─────────────────────────── */
  function getDemoUpcoming() {
    const now = new Date();
    return [
      {
        id: '1', date: new Date(now.getTime() + 2 * 86400000).toISOString(),
        type: 'Detartrage', praticien: 'Dr. Martin', status: 'confirmed',
        series_id: 's1', series_name: 'Traitement parodontal', series_done: 2, series_total: 4,
      },
      {
        id: '2', date: new Date(now.getTime() + 9 * 86400000).toISOString(),
        type: 'Surfacage radiculaire', praticien: 'Dr. Martin', status: 'pending',
        series_id: 's1', series_name: 'Traitement parodontal', series_done: 2, series_total: 4,
      },
      {
        id: '3', date: new Date(now.getTime() + 16 * 86400000).toISOString(),
        type: 'Controle', praticien: 'Dr. Dupont', status: 'confirmed',
      },
    ];
  }

  function getDemoPast() {
    const now = new Date();
    return [
      { id: 'p1', date: new Date(now.getTime() - 14 * 86400000).toISOString(), type: 'Consultation', praticien: 'Dr. Martin', status: 'confirmed' },
      { id: 'p2', date: new Date(now.getTime() - 45 * 86400000).toISOString(), type: 'Radio panoramique', praticien: 'Dr. Dupont', status: 'confirmed' },
    ];
  }
});
