/* ═══════════════════════════════════════════════
   JADOMI Patient — Mon Equipe de Soins
   ═══════════════════════════════════════════════ */

Router.register('/mon-equipe', async (container) => {
  container.innerHTML = `
    <h2 class="section-title">Mon equipe de soins</h2>
    <p style="color:#71717a;font-size:13px;margin:-8px 0 16px">C'est vous qui construisez votre reseau de sante</p>

    <!-- Notification indicator -->
    <div id="equipeNotifBanner" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);margin-bottom:16px;animation:eqCardIn .5s cubic-bezier(.16,1,.3,1) both">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#10b981">2 praticiens ont rejoint votre reseau</div>
        <div style="font-size:11px;color:#71717a;margin-top:2px">Marie Lefevre et Dr Martin ont accepte votre invitation</div>
      </div>
      <button id="equipeNotifClose" style="background:none;border:none;color:#71717a;cursor:pointer;padding:4px;flex-shrink:0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <button id="addPraticienBtn" style="width:100%;padding:14px;border-radius:14px;background:rgba(13,148,136,.08);border:2px dashed rgba(13,148,136,.3);color:#5eead4;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:20px;transition:all .3s cubic-bezier(.16,1,.3,1)">+ Ajouter un praticien a mon equipe</button>
    <div class="skeleton skeleton-card"></div>`;

  /* ── Notification dismiss ── */
  const notifClose = document.getElementById('equipeNotifClose');
  if (notifClose) {
    notifClose.addEventListener('click', () => {
      const banner = document.getElementById('equipeNotifBanner');
      if (banner) { banner.style.animation = 'fadeOut .3s ease forwards'; setTimeout(() => banner.remove(), 300); }
    });
  }

  /* ── Add practitioner modal ── */
  document.getElementById('addPraticienBtn').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .3s';
    overlay.innerHTML = `
      <div style="background:#1a1a2e;border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:28px 24px env(safe-area-inset-bottom,24px);animation:slideUp .4s cubic-bezier(.16,1,.3,1)">
        <div style="width:40px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto 20px"></div>
        <h3 style="font-family:Syne,sans-serif;font-size:18px;color:#fafafa;margin-bottom:4px">Inviter un praticien</h3>
        <p style="font-size:12px;color:#71717a;margin-bottom:20px">Votre praticien recevra un SMS pour rejoindre votre reseau de soins</p>

        <label style="font-size:11px;color:#71717a;font-weight:600;display:block;margin-bottom:6px">PROFESSION</label>
        <select id="invProfession" style="width:100%;padding:12px;border-radius:10px;background:#0a0a0f;border:1px solid rgba(255,255,255,.1);color:#e4e4e7;font-size:14px;margin-bottom:14px">
          <option value="medecin">Medecin generaliste</option>
          <option value="kine">Kinesitherapeute</option>
          <option value="osteo">Osteopathe</option>
          <option value="dentiste">Chirurgien-dentiste</option>
          <option value="dermato">Dermatologue</option>
          <option value="ophtalmo">Ophtalmologue</option>
          <option value="cardio">Cardiologue</option>
          <option value="sage_femme">Sage-femme</option>
          <option value="infirmier">Infirmier(e)</option>
          <option value="podologue">Podologue</option>
          <option value="orthophoniste">Orthophoniste</option>
          <option value="psycho">Psychologue</option>
          <option value="pharmacien">Pharmacien</option>
          <option value="autre">Autre</option>
        </select>

        <label style="font-size:11px;color:#71717a;font-weight:600;display:block;margin-bottom:6px">NOM DU PRATICIEN</label>
        <input id="invNom" placeholder="Dr Martin" style="width:100%;padding:12px;border-radius:10px;background:#0a0a0f;border:1px solid rgba(255,255,255,.1);color:#e4e4e7;font-size:14px;margin-bottom:14px">

        <label style="font-size:11px;color:#71717a;font-weight:600;display:block;margin-bottom:6px">COMMENT L'INVITER ?</label>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button class="inv-channel-btn" data-channel="email" style="flex:1;padding:10px;border-radius:10px;background:rgba(13,148,136,.12);border:2px solid #0d9488;color:#5eead4;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s">Email</button>
          <button class="inv-channel-btn" data-channel="sms" style="flex:1;padding:10px;border-radius:10px;background:rgba(255,255,255,.03);border:2px solid rgba(255,255,255,.1);color:#71717a;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s">SMS</button>
          <button class="inv-channel-btn" data-channel="both" style="flex:1;padding:10px;border-radius:10px;background:rgba(255,255,255,.03);border:2px solid rgba(255,255,255,.1);color:#71717a;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s">Les deux</button>
        </div>

        <div id="invEmailField">
          <label style="font-size:11px;color:#71717a;font-weight:600;display:block;margin-bottom:6px">EMAIL PROFESSIONNEL</label>
          <input id="invEmail" type="email" placeholder="cabinet@exemple.fr" style="width:100%;padding:12px;border-radius:10px;background:#0a0a0f;border:1px solid rgba(255,255,255,.1);color:#e4e4e7;font-size:14px;margin-bottom:14px">
        </div>

        <div id="invTelField" style="display:none">
          <label style="font-size:11px;color:#71717a;font-weight:600;display:block;margin-bottom:6px">TELEPHONE DU CABINET</label>
          <input id="invTel" type="tel" placeholder="06 12 34 56 78" style="width:100%;padding:12px;border-radius:10px;background:#0a0a0f;border:1px solid rgba(255,255,255,.1);color:#e4e4e7;font-size:14px;margin-bottom:14px">
        </div>

        <p style="font-size:11px;color:#52525b;margin-bottom:16px;line-height:1.5">Votre praticien recevra une invitation a rejoindre votre reseau de soins JADOMI. Ses coordonnees ne seront partagees qu'avec votre equipe de soins.</p>

        <button id="invSendBtn" style="width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;font-size:15px;font-weight:700;border:none;cursor:pointer;transition:transform .2s">Envoyer l'invitation</button>
        <button id="invCancelBtn" style="width:100%;padding:12px;border:none;background:none;color:#71717a;font-size:13px;margin-top:8px;cursor:pointer">Annuler</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#invCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Channel switcher
    let currentChannel = 'email';
    overlay.querySelectorAll('.inv-channel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentChannel = btn.dataset.channel;
        overlay.querySelectorAll('.inv-channel-btn').forEach(b => {
          b.style.background = 'rgba(255,255,255,.03)';
          b.style.borderColor = 'rgba(255,255,255,.1)';
          b.style.color = '#71717a';
        });
        btn.style.background = 'rgba(13,148,136,.12)';
        btn.style.borderColor = '#0d9488';
        btn.style.color = '#5eead4';
        const emailF = document.getElementById('invEmailField');
        const telF = document.getElementById('invTelField');
        emailF.style.display = (currentChannel === 'sms') ? 'none' : 'block';
        telF.style.display = (currentChannel === 'email') ? 'none' : 'block';
      });
    });

    overlay.querySelector('#invSendBtn').addEventListener('click', () => {
      const nom = document.getElementById('invNom').value.trim();
      const email = document.getElementById('invEmail')?.value.trim() || '';
      const tel = document.getElementById('invTel')?.value.trim() || '';
      const prof = document.getElementById('invProfession').value;
      if (!nom) { alert('Remplissez le nom du praticien'); return; }
      if (currentChannel === 'email' && !email) { alert('Remplissez l\'email'); return; }
      if (currentChannel === 'sms' && !tel) { alert('Remplissez le telephone'); return; }
      if (currentChannel === 'both' && !email && !tel) { alert('Remplissez au moins un moyen de contact'); return; }

      const btn = overlay.querySelector('#invSendBtn');
      const channels = [];
      if (currentChannel === 'email' || currentChannel === 'both') channels.push('email');
      if (currentChannel === 'sms' || currentChannel === 'both') channels.push('SMS');
      btn.textContent = 'Envoi ' + channels.join(' + ') + '...';
      btn.style.opacity = '0.6';

      setTimeout(() => {
        btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
        btn.textContent = 'Invitation envoyee par ' + channels.join(' + ') + ' !';
        setTimeout(() => overlay.remove(), 1500);
      }, 1200);
    });
  });

  /* ── Demo data ── */
  const patient = { name: 'Vous', initials: 'VP' };
  const practitioners = [
    {
      id: 1,
      name: 'Dr Bahmed',
      profession: 'Chirurgien-dentiste',
      cabinet: 'Cabinet Precision Dentaire',
      city: 'Roubaix',
      phone: '03 20 00 00 01',
      memberSince: '2022-03-15',
      lastVisit: '2026-04-10',
      color: '#0d9488',
      initials: 'KB',
      icon: 'tooth',
      type: 'praticien'
    },
    {
      id: 2,
      name: 'Marie Lefevre',
      profession: 'Kinesitherapeute',
      cabinet: 'Cabinet Kine du Parc',
      city: 'Lille',
      phone: '03 20 00 00 02',
      memberSince: '2023-09-01',
      lastVisit: '2026-04-18',
      color: '#8b5cf6',
      initials: 'ML',
      icon: 'muscle',
      type: 'praticien'
    },
    {
      id: 3,
      name: 'Dr Martin',
      profession: 'Medecin generaliste',
      cabinet: 'Cabinet Medical',
      city: 'Roubaix',
      phone: '03 20 00 00 03',
      memberSince: '2021-06-10',
      lastVisit: '2026-03-28',
      color: '#3b82f6',
      initials: 'DM',
      icon: 'stethoscope',
      type: 'praticien'
    },
    {
      id: 4,
      name: 'Labo Ceramic Plus',
      profession: 'Prothesiste dentaire',
      cabinet: 'Ceramic Plus',
      city: 'Tourcoing',
      phone: '03 20 00 00 04',
      memberSince: '2024-01-20',
      lastVisit: '2026-04-05',
      color: '#f59e0b',
      initials: 'CP',
      icon: 'lab',
      type: 'support'
    }
  ];

  /* ── SVG icons by profession ── */
  const profIcons = {
    tooth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C9.5 2 7 4 7 7c0 2-.5 4-1.5 6S4 17 4 19c0 1.5 1 3 2.5 3s2.5-1 3-3c.5-2 1-3 2.5-3s2 1 2.5 3c.5 2 1.5 3 3 3s2.5-1.5 2.5-3c0-2-.5-4-1.5-6S17 9 17 7c0-3-2.5-5-5-5z"/></svg>',
    muscle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    stethoscope: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12V8a4 4 0 018 0v4"/><circle cx="8" cy="14" r="2"/><path d="M8 16v2a4 4 0 004 4h1a3 3 0 003-3v-2"/><circle cx="16" cy="13" r="2"/><path d="M16 11V8"/></svg>',
    lab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v7.4L4.6 19.2A1.5 1.5 0 005.8 21h12.4a1.5 1.5 0 001.2-1.8L14 10.4V3"/><path d="M8 14h8"/></svg>'
  };

  /* ── Date formatting ── */
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ── Build circle visualization ── */
  const circleSize = 280;
  const circleRadius = 105;

  function buildCircleSVG() {
    const cx = circleSize / 2;
    const cy = circleSize / 2;
    let lines = '';
    let nodes = '';

    practitioners.forEach((p, i) => {
      const angle = (i / practitioners.length) * Math.PI * 2 - Math.PI / 2;
      const px = cx + circleRadius * Math.cos(angle);
      const py = cy + circleRadius * Math.sin(angle);

      lines += `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${p.color}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.4" class="equipe-line" style="animation-delay:${i * 150}ms"/>`;
      nodes += `
        <g class="equipe-node" style="animation-delay:${i * 100 + 200}ms" data-id="${p.id}">
          <circle cx="${px}" cy="${py}" r="28" fill="${p.color}15" stroke="${p.color}" stroke-width="1.5"/>
          <circle cx="${px}" cy="${py}" r="20" fill="${p.color}30"/>
          <text x="${px}" y="${py}" text-anchor="middle" dominant-baseline="central" fill="${p.color}" font-family="var(--font-display)" font-weight="700" font-size="11">${p.initials}</text>
          <text x="${px}" y="${py + 38}" text-anchor="middle" fill="var(--text-secondary)" font-family="var(--font-body)" font-size="9" font-weight="500">${p.name.split(' ').pop()}</text>
        </g>`;
    });

    return `
      <svg width="${circleSize}" height="${circleSize + 30}" viewBox="0 0 ${circleSize} ${circleSize + 30}" class="equipe-circle-svg">
        <!-- Connection lines -->
        ${lines}
        <!-- Center patient -->
        <circle cx="${cx}" cy="${cy}" r="30" fill="var(--accent-glow)" stroke="var(--accent)" stroke-width="2" class="equipe-center-pulse"/>
        <circle cx="${cx}" cy="${cy}" r="22" fill="var(--accent)" opacity="0.2"/>
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" dominant-baseline="central" fill="var(--accent-light)" font-family="var(--font-display)" font-weight="800" font-size="13">${patient.initials}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--accent-light)" font-family="var(--font-body)" font-size="8" font-weight="600" opacity="0.7">VOUS</text>
        <!-- Practitioner nodes -->
        ${nodes}
      </svg>`;
  }

  /* ── Build practitioner cards ── */
  function buildCards() {
    return practitioners.map((p, i) => {
      const isSupport = p.type === 'support';
      const icon = profIcons[p.icon] || profIcons.stethoscope;
      return `
        <div class="card equipe-card" style="animation-delay:${i * 80 + 400}ms">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div class="equipe-card-avatar" style="background:${p.color}20;color:${p.color};border:2px solid ${p.color}40;">
              <div class="equipe-card-icon">${icon}</div>
              ${p.initials}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:15px;">${p.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">
                ${p.profession}
                ${isSupport ? '<span style="font-size:10px;background:var(--gold);color:#000;padding:1px 6px;border-radius:20px;font-weight:600;">Support technique</span>' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${p.cabinet}, ${p.city}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              <a href="tel:${p.phone.replace(/\s/g, '')}" style="color:var(--accent-light);">${p.phone}</a>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              Membre depuis ${fmtDate(p.memberSince)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Derniere visite : ${fmtDate(p.lastVisit)}
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            ${!isSupport ? `<button class="btn btn-primary btn-sm equipe-contact-btn" data-id="${p.id}" style="flex:1;font-size:13px;padding:8px 0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:-2px;"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Contacter
            </button>` : `<button class="btn btn-sm equipe-contact-btn" data-id="${p.id}" style="flex:1;font-size:13px;padding:8px 0;background:var(--gold);color:#000;font-weight:600;border-radius:var(--radius-md);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:-2px;"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              Appeler
            </button>`}
          </div>
        </div>`;
    }).join('');
  }

  /* ── Render ── */
  container.innerHTML = `
    <style>
      .equipe-subtitle {
        font-size: 14px; color: var(--text-secondary); margin: -8px 0 20px; line-height: 1.4;
      }
      .equipe-circle-wrap {
        display: flex; justify-content: center; margin-bottom: 28px;
        animation: equipeCircleFadeIn 600ms var(--ease-out-expo, cubic-bezier(.16,1,.3,1)) forwards;
      }
      .equipe-circle-svg { overflow: visible; }
      .equipe-center-pulse {
        animation: eqPulse 3s ease-in-out infinite;
      }
      @keyframes eqPulse {
        0%, 100% { r: 30; opacity: 1; }
        50% { r: 33; opacity: 0.8; }
      }
      .equipe-line {
        opacity: 0; animation: eqLineIn 500ms cubic-bezier(.16,1,.3,1) forwards;
      }
      @keyframes eqLineIn {
        from { opacity: 0; stroke-dashoffset: 200; }
        to   { opacity: 0.4; stroke-dashoffset: 0; }
      }
      .equipe-node {
        opacity: 0; animation: eqNodeIn 500ms cubic-bezier(.16,1,.3,1) forwards;
      }
      @keyframes eqNodeIn {
        from { opacity: 0; transform: scale(0.5); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes equipeCircleFadeIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .equipe-card {
        opacity: 0; animation: eqCardIn 500ms cubic-bezier(.16,1,.3,1) forwards;
      }
      @keyframes eqCardIn {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(-8px); }
      }
      .equipe-card-avatar {
        width: 48px; height: 48px; border-radius: 14px;
        display: flex; align-items: center; justify-content: center;
        font-family: var(--font-display, 'Syne', sans-serif); font-weight: 700; font-size: 15px;
        position: relative; flex-shrink: 0;
      }
      .equipe-card-icon {
        position: absolute; top: -6px; right: -6px;
        width: 22px; height: 22px; border-radius: 50%;
        background: var(--bg-card, #16161f); padding: 3px;
        display: flex; align-items: center; justify-content: center;
      }
      .equipe-card-icon svg { width: 14px; height: 14px; }
      .equipe-section-label {
        font-size: 12px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.08em; color: var(--text-tertiary); margin: 24px 0 12px;
      }
      /* ── Pourquoi connecter vos praticiens ── */
      .equipe-why-section {
        margin-bottom: 24px; border-radius: 14px;
        background: rgba(255,255,255,.02);
        border: 1px solid rgba(255,255,255,.06);
        overflow: hidden;
      }
      .equipe-why-toggle {
        width: 100%; padding: 14px 16px;
        display: flex; align-items: center; justify-content: space-between;
        background: none; border: none; color: var(--text-secondary, #a1a1aa);
        font-size: 13px; font-weight: 600; cursor: pointer;
        font-family: var(--font-body, sans-serif);
      }
      .equipe-why-toggle svg {
        transition: transform .3s cubic-bezier(.16,1,.3,1); flex-shrink: 0;
      }
      .equipe-why-toggle.open svg { transform: rotate(180deg); }
      .equipe-why-body {
        max-height: 0; overflow: hidden;
        transition: max-height .4s cubic-bezier(.16,1,.3,1), padding .4s cubic-bezier(.16,1,.3,1);
        padding: 0 16px;
      }
      .equipe-why-body.open { max-height: 500px; padding: 0 16px 16px; }
      .equipe-benefit-card {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 12px; border-radius: 10px;
        background: rgba(255,255,255,.03); margin-bottom: 8px;
      }
      .equipe-benefit-card:last-child { margin-bottom: 0; }
      .equipe-benefit-icon {
        width: 36px; height: 36px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .equipe-benefit-title { font-size: 13px; font-weight: 600; color: #fafafa; margin-bottom: 2px; }
      .equipe-benefit-desc { font-size: 12px; color: var(--text-secondary, #a1a1aa); line-height: 1.4; }
      /* ── Partages recents ── */
      .equipe-partage-item {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 14px; border-radius: 10px;
        background: rgba(255,255,255,.02);
        border: 1px solid rgba(255,255,255,.05); margin-bottom: 8px;
      }
      .equipe-partage-item:last-child { margin-bottom: 0; }
      .equipe-partage-icon {
        width: 28px; height: 28px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .equipe-partage-text { font-size: 13px; color: #e4e4e7; line-height: 1.4; flex: 1; }
      .equipe-partage-time { font-size: 11px; color: #52525b; margin-top: 2px; }
      .equipe-partage-note {
        font-size: 11px; color: #52525b; font-style: italic;
        margin-top: 8px; padding: 8px 12px; border-radius: 8px;
        background: rgba(255,255,255,.02);
        border-left: 2px solid rgba(255,255,255,.08);
      }
      /* ── Sticky add button ── */
      .equipe-sticky-add {
        position: sticky; bottom: 80px; z-index: 50; padding: 12px 0 0;
      }
      .equipe-sticky-add-btn {
        width: 100%; padding: 14px 20px; border-radius: 14px;
        background: linear-gradient(135deg, #0d9488, #0f766e);
        border: none; color: #fff; font-size: 15px; font-weight: 700;
        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
        box-shadow: 0 4px 24px rgba(13,148,136,.3);
        transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s;
      }
      .equipe-sticky-add-btn:active { transform: scale(0.97); }
    </style>

    <h2 class="section-title">Mon equipe de soins</h2>
    <p class="equipe-subtitle">Les professionnels qui veillent sur votre sante</p>

    <!-- Pourquoi connecter vos praticiens ? -->
    <div class="equipe-why-section">
      <button class="equipe-why-toggle" id="equipeWhyToggle" aria-expanded="false" aria-controls="equipeWhyBody">
        <span>Pourquoi connecter vos praticiens ?</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="equipe-why-body" id="equipeWhyBody">
        <div class="equipe-benefit-card">
          <div class="equipe-benefit-icon" style="background:rgba(59,130,246,.15);color:#60a5fa">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div>
            <div class="equipe-benefit-title">Communication directe</div>
            <div class="equipe-benefit-desc">Vos praticiens s'echangent photos et notes pour mieux vous soigner</div>
          </div>
        </div>
        <div class="equipe-benefit-card">
          <div class="equipe-benefit-icon" style="background:rgba(16,185,129,.15);color:#34d399">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <div class="equipe-benefit-title">Zero perte d'info</div>
            <div class="equipe-benefit-desc">Fini les courriers perdus, tout est dans votre dossier</div>
          </div>
        </div>
        <div class="equipe-benefit-card">
          <div class="equipe-benefit-icon" style="background:rgba(139,92,246,.15);color:#a78bfa">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          </div>
          <div>
            <div class="equipe-benefit-title">Coordination automatique</div>
            <div class="equipe-benefit-desc">Votre dentiste voit votre kine, votre medecin voit votre dermato</div>
          </div>
        </div>
      </div>
    </div>

    <div class="equipe-circle-wrap">
      ${buildCircleSVG()}
    </div>

    <div class="equipe-section-label">Mes praticiens (${practitioners.length})</div>
    <div class="flex flex-col gap-sm">
      ${buildCards()}
    </div>

    <!-- Partages recents -->
    <div class="equipe-section-label" style="margin-top:28px">
      <span style="display:inline-flex;align-items:center;gap:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        Partages recents
      </span>
    </div>
    <div style="margin-bottom:8px">
      <div class="equipe-partage-item">
        <div class="equipe-partage-icon" style="background:rgba(13,148,136,.15);color:#5eead4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg>
        </div>
        <div style="flex:1">
          <div class="equipe-partage-text"><strong>Dr Bahmed</strong> a partage une photo avec <strong>Marie Lefevre</strong> (kine)</div>
          <div class="equipe-partage-time">Il y a 2h</div>
        </div>
      </div>
      <div class="equipe-partage-item">
        <div class="equipe-partage-icon" style="background:rgba(59,130,246,.15);color:#60a5fa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        </div>
        <div style="flex:1">
          <div class="equipe-partage-text"><strong>Dr Martin</strong> a envoye une note a <strong>Dr Bahmed</strong></div>
          <div class="equipe-partage-time">Hier</div>
        </div>
      </div>
    </div>
    <div class="equipe-partage-note">
      Vous voyez que vos praticiens se coordonnent, mais le contenu medical reste confidentiel entre eux. C'est la garantie d'un suivi coordonne dans le respect du secret medical.
    </div>

    <!-- Sticky add button -->
    <div class="equipe-sticky-add">
      <button class="equipe-sticky-add-btn" id="addPraticienBtnSticky" aria-label="Ajouter un praticien a mon equipe">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter un praticien a mon equipe
      </button>
    </div>
  `;

  /* ── Collapsible "Pourquoi connecter" toggle ── */
  const whyToggle = container.querySelector('#equipeWhyToggle');
  const whyBody = container.querySelector('#equipeWhyBody');
  if (whyToggle && whyBody) {
    whyToggle.addEventListener('click', () => {
      const isOpen = whyBody.classList.toggle('open');
      whyToggle.classList.toggle('open', isOpen);
      whyToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  /* ── Sticky add button opens same modal ── */
  const stickyAddBtn = container.querySelector('#addPraticienBtnSticky');
  if (stickyAddBtn) {
    stickyAddBtn.addEventListener('click', () => {
      document.getElementById('addPraticienBtn')?.click();
    });
  }

  /* ── Contact button handlers ── */
  container.querySelectorAll('.equipe-contact-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const p = practitioners.find(pr => pr.id === id);
      if (p && p.type !== 'support') {
        Router.navigate('/chat');
      }
    });
  });
});

/* Named export for external use */
function renderMonEquipe(container) {
  Router.navigate('/mon-equipe');
}
