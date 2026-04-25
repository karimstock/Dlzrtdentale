/* ═══════════════════════════════════════════════
   JADOMI PRO — Tab Reseau (Inter-practitioner Network)
   ═══════════════════════════════════════════════ */

function renderReseau(container) {
  if (!container) container = document.getElementById('tab-reseau');
  if (!container) return;

  /* ── Demo data ── */
  const professionPills = [
    { key: 'kine', label: 'Kine' },
    { key: 'medecin', label: 'Medecin' },
    { key: 'osteo', label: 'Osteo' },
    { key: 'dermato', label: 'Dermato' },
    { key: 'ophtalmo', label: 'Ophtalmo' },
    { key: 'autre', label: 'Autre' }
  ];

  const demoPatients = [
    { id: 1, name: 'Mme Dupont' },
    { id: 2, name: 'M. Bernard' },
    { id: 3, name: 'Mme Leroy' },
    { id: 4, name: 'M. Petit' },
    { id: 5, name: 'Mme Moreau' }
  ];

  const incomingShares = [
    {
      id: 1,
      from: 'Dr Martin',
      fromProfession: 'Medecin generaliste',
      about: 'Mme Dupont',
      type: 'referral',
      motif: 'Douleur ATM persistante, origine non dentaire ?',
      date: '2026-04-23',
      photo: null,
      unread: true
    },
    {
      id: 2,
      from: 'Marie Lefevre',
      fromProfession: 'Kinesitherapeute',
      about: 'M. Bernard',
      type: 'photo',
      motif: 'Photo de progression : mobilite ATM amelioree a 35mm apres 4 seances',
      date: '2026-04-21',
      photo: true,
      unread: true
    },
    {
      id: 3,
      from: 'Dr Roche',
      fromProfession: 'Osteopathe',
      about: 'Mme Leroy',
      type: 'note',
      motif: 'Tension cervicale importante, possible lien avec bruxisme nocturne signale. Gouttiere recommandee.',
      date: '2026-04-18',
      photo: null,
      unread: false
    }
  ];

  const networkPractitioners = [
    { id: 1, name: 'Dr Martin', profession: 'Medecin generaliste', city: 'Roubaix', shares: 5, lastShare: '2026-04-23' },
    { id: 2, name: 'Marie Lefevre', profession: 'Kinesitherapeute', city: 'Lille', shares: 4, lastShare: '2026-04-21' },
    { id: 3, name: 'Dr Roche', profession: 'Osteopathe', city: 'Roubaix', shares: 2, lastShare: '2026-04-18' },
    { id: 4, name: 'Dr Dubois', profession: 'Dermatologue', city: 'Lille', shares: 1, lastShare: '2026-03-15' },
    { id: 5, name: 'Dr Perrin', profession: 'Ophtalmologue', city: 'Tourcoing', shares: 0, lastShare: null }
  ];

  const typeBadgeColors = {
    referral: { bg: '#0d948830', color: '#2dd4bf', label: 'Adressage' },
    photo: { bg: '#8b5cf630', color: '#a78bfa', label: 'Photo' },
    note: { bg: '#f59e0b30', color: '#fbbf24', label: 'Note' }
  };

  function fmtDate(iso) {
    if (!iso) return '--';
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  container.innerHTML = `
    <style>
      .reseau-section {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 24px;
        margin-bottom: 24px;
        animation: reseauFadeIn 500ms cubic-bezier(.16,1,.3,1) forwards;
        opacity: 0;
      }
      .reseau-section:nth-child(1) { animation-delay: 0ms; }
      .reseau-section:nth-child(2) { animation-delay: 100ms; }
      .reseau-section:nth-child(3) { animation-delay: 200ms; }
      @keyframes reseauFadeIn {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .reseau-section-title {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 18px;
        margin-bottom: 4px;
      }
      .reseau-section-subtitle {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 20px;
      }
      .reseau-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }
      .reseau-pill {
        padding: 6px 16px;
        border-radius: var(--radius-full);
        font-size: 13px;
        font-weight: 500;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 200ms ease;
      }
      .reseau-pill:hover {
        border-color: var(--accent);
        color: var(--text-primary);
      }
      .reseau-pill.active {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }
      .reseau-form-group {
        margin-bottom: 16px;
      }
      .reseau-form-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
        margin-bottom: 6px;
      }
      .reseau-select, .reseau-textarea {
        width: 100%;
        padding: 10px 14px;
        background: var(--bg-input);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-size: 14px;
        transition: border-color 200ms ease;
      }
      .reseau-select:focus, .reseau-textarea:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-glow);
      }
      .reseau-textarea {
        min-height: 80px;
        resize: vertical;
        font-family: var(--font-body);
        line-height: 1.5;
      }
      .reseau-urgency {
        display: flex;
        gap: 12px;
      }
      .reseau-urgency-item {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text-secondary);
      }
      .reseau-urgency-item input[type="radio"] {
        accent-color: var(--accent);
      }
      .reseau-urgency-item.urgent { color: var(--warning); }
      .reseau-urgency-item.immediat { color: var(--error); }
      .reseau-actions-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 20px;
      }
      .reseau-btn-attach {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: var(--radius-md);
        background: var(--bg-elevated);
        border: 1px dashed var(--border-default);
        color: var(--text-secondary);
        font-size: 13px;
        cursor: pointer;
        transition: all 200ms ease;
      }
      .reseau-btn-attach:hover {
        border-color: var(--accent);
        color: var(--accent-light);
      }
      .reseau-btn-send {
        padding: 10px 28px;
        border-radius: var(--radius-md);
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 200ms ease;
        margin-left: auto;
      }
      .reseau-btn-send:hover {
        background: var(--teal-500);
        box-shadow: 0 0 20px var(--accent-glow);
        transform: translateY(-1px);
      }

      /* Inbox cards */
      .reseau-inbox-card {
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 16px;
        margin-bottom: 12px;
        position: relative;
        transition: all 200ms ease;
      }
      .reseau-inbox-card:hover {
        border-color: var(--border-default);
        transform: translateY(-1px);
      }
      .reseau-inbox-card.unread {
        border-left: 3px solid var(--accent);
      }
      .reseau-inbox-card.unread::after {
        content: '';
        position: absolute;
        top: 12px;
        right: 12px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent-glow);
      }
      .reseau-inbox-from {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 2px;
      }
      .reseau-inbox-profession {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-bottom: 8px;
      }
      .reseau-inbox-about {
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 6px;
      }
      .reseau-inbox-motif {
        font-size: 13px;
        color: var(--text-primary);
        line-height: 1.5;
        margin-bottom: 12px;
        padding: 10px 12px;
        background: var(--bg-card);
        border-radius: var(--radius-sm);
        border-left: 2px solid var(--text-tertiary);
      }
      .reseau-type-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--radius-full);
        font-size: 11px;
        font-weight: 600;
        margin-right: 8px;
      }
      .reseau-inbox-photo-thumb {
        width: 60px;
        height: 60px;
        border-radius: var(--radius-sm);
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        font-size: 10px;
        margin-bottom: 8px;
      }
      .reseau-inbox-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .reseau-inbox-date {
        font-size: 12px;
        color: var(--text-tertiary);
      }
      .reseau-btn-reply {
        padding: 6px 16px;
        border-radius: var(--radius-md);
        background: var(--accent-glow);
        color: var(--accent-light);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid var(--accent);
        transition: all 200ms ease;
      }
      .reseau-btn-reply:hover {
        background: var(--accent);
        color: #fff;
      }

      /* Network list */
      .reseau-network-stats {
        display: flex;
        gap: 24px;
        margin-bottom: 20px;
      }
      .reseau-stat-box {
        padding: 16px 20px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        flex: 1;
        text-align: center;
      }
      .reseau-stat-val {
        font-family: var(--font-display);
        font-weight: 800;
        font-size: 28px;
        color: var(--accent-light);
      }
      .reseau-stat-label {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 2px;
      }
      .reseau-network-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        margin-bottom: 8px;
        transition: all 200ms ease;
      }
      .reseau-network-item:hover {
        border-color: var(--border-default);
        transform: translateX(4px);
      }
      .reseau-network-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--accent-glow);
        border: 1.5px solid var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 13px;
        color: var(--accent-light);
        flex-shrink: 0;
      }
      .reseau-network-info { flex: 1; min-width: 0; }
      .reseau-network-name { font-weight: 600; font-size: 14px; }
      .reseau-network-prof { font-size: 12px; color: var(--text-secondary); }
      .reseau-network-meta {
        text-align: right;
        font-size: 11px;
        color: var(--text-tertiary);
      }
    </style>

    <!-- Section 1: Adresser un patient -->
    <div class="reseau-section">
      <div class="reseau-section-title">Adresser un patient</div>
      <div class="reseau-section-subtitle">Orientez un patient vers un confrere avec toutes les informations necessaires</div>

      <div class="reseau-form-group">
        <label>Patient</label>
        <select class="reseau-select" id="reseau-patient-select">
          <option value="">Selectionner un patient...</option>
          ${demoPatients.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>

      <div class="reseau-form-group">
        <label>Profession destinataire</label>
        <div class="reseau-pills" id="reseau-prof-pills">
          ${professionPills.map((p, i) => `<button class="reseau-pill${i === 0 ? ' active' : ''}" data-prof="${p.key}">${p.label}</button>`).join('')}
        </div>
      </div>

      <div class="reseau-form-group">
        <label>Motif de l'adressage</label>
        <textarea class="reseau-textarea" id="reseau-motif" placeholder="Suspicion contracture musculaire ATM, mobilite limitee a 25mm"></textarea>
      </div>

      <div class="reseau-form-group">
        <label>Urgence</label>
        <div class="reseau-urgency">
          <label class="reseau-urgency-item">
            <input type="radio" name="reseau-urgency" value="routine" checked> Routine
          </label>
          <label class="reseau-urgency-item urgent">
            <input type="radio" name="reseau-urgency" value="urgent"> Urgent
          </label>
          <label class="reseau-urgency-item immediat">
            <input type="radio" name="reseau-urgency" value="immediat"> Immediat
          </label>
        </div>
      </div>

      <div class="reseau-actions-row">
        <button class="reseau-btn-attach" id="reseau-attach-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Joindre photo/video
        </button>
        <button class="reseau-btn-send" id="reseau-send-btn">Adresser</button>
      </div>
    </div>

    <!-- Section 2: Partages recus -->
    <div class="reseau-section">
      <div class="reseau-section-title">Partages recus</div>
      <div class="reseau-section-subtitle">Messages et documents recus de votre reseau</div>

      <div id="reseau-inbox">
        ${incomingShares.map(s => {
          const badge = typeBadgeColors[s.type];
          return `
            <div class="reseau-inbox-card${s.unread ? ' unread' : ''}">
              <div class="reseau-inbox-from">${s.from}</div>
              <div class="reseau-inbox-profession">${s.fromProfession}</div>
              <div class="reseau-inbox-about">
                <span class="reseau-type-badge" style="background:${badge.bg};color:${badge.color}">${badge.label}</span>
                Concernant : <strong>${s.about}</strong>
              </div>
              <div class="reseau-inbox-motif">${s.motif}</div>
              ${s.photo ? `
                <div class="reseau-inbox-photo-thumb">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </div>` : ''}
              <div class="reseau-inbox-footer">
                <span class="reseau-inbox-date">${fmtDate(s.date)}</span>
                <button class="reseau-btn-reply" data-id="${s.id}">Repondre</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Section 3: Mon reseau -->
    <div class="reseau-section">
      <div class="reseau-section-title">Mon reseau</div>
      <div class="reseau-section-subtitle">Praticiens avec lesquels vous collaborez</div>

      <div class="reseau-network-stats">
        <div class="reseau-stat-box">
          <div class="reseau-stat-val">12</div>
          <div class="reseau-stat-label">Adressages ce trimestre</div>
        </div>
        <div class="reseau-stat-box">
          <div class="reseau-stat-val">8</div>
          <div class="reseau-stat-label">Praticiens connectes</div>
        </div>
      </div>

      <div id="reseau-network-list">
        ${networkPractitioners.map(p => {
          const initials = p.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
          return `
            <div class="reseau-network-item">
              <div class="reseau-network-avatar">${initials}</div>
              <div class="reseau-network-info">
                <div class="reseau-network-name">${p.name}</div>
                <div class="reseau-network-prof">${p.profession} - ${p.city}</div>
              </div>
              <div class="reseau-network-meta">
                ${p.shares} partage${p.shares > 1 ? 's' : ''}<br>
                ${p.lastShare ? fmtDate(p.lastShare) : '--'}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  /* ── Event handlers ── */

  // Profession pills toggle
  container.querySelectorAll('.reseau-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.reseau-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Send button
  const sendBtn = container.querySelector('#reseau-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const patient = container.querySelector('#reseau-patient-select').value;
      const motif = container.querySelector('#reseau-motif').value;
      if (!patient) {
        sendBtn.textContent = 'Selectionnez un patient';
        sendBtn.style.background = 'var(--error)';
        setTimeout(() => {
          sendBtn.textContent = 'Adresser';
          sendBtn.style.background = 'var(--accent)';
        }, 2000);
        return;
      }
      sendBtn.textContent = 'Envoye !';
      sendBtn.style.background = 'var(--success)';
      setTimeout(() => {
        sendBtn.textContent = 'Adresser';
        sendBtn.style.background = 'var(--accent)';
      }, 2000);
    });
  }

  // Attach button
  const attachBtn = container.querySelector('#reseau-attach-btn');
  if (attachBtn) {
    attachBtn.addEventListener('click', () => {
      attachBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Photo jointe';
      attachBtn.style.borderColor = 'var(--success)';
      attachBtn.style.color = 'var(--success)';
    });
  }

  // Reply buttons
  container.querySelectorAll('.reseau-btn-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.textContent = 'Ouverture...';
      setTimeout(() => { btn.textContent = 'Repondre'; }, 1500);
    });
  });
}

function refreshReseau() {
  renderReseau(document.getElementById('tab-reseau'));
}
