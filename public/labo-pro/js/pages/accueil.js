/* ═══════════════════════════════════════════════
   JADOMI Labo — Accueil (Home Page)
   ═══════════════════════════════════════════════ */

function escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function renderAccueilPage(container) {
  const now = new Date();
  const h = now.getHours();
  const greeting = h >= 18 ? 'Bonsoir' : 'Bonjour';
  const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
  const dateStr = now.toLocaleDateString('fr-FR', opts);
  const dateDisplay = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // Get labo name
  let laboName = 'Labo';
  try {
    const labo = JSON.parse(localStorage.getItem('jadomi_labo') || '{}');
    if (labo.nom) laboName = labo.nom;
  } catch(e) {}

  // Count cases from DEMO data
  const casRecus = typeof DEMO_CASES !== 'undefined' ? DEMO_CASES.filter(c => c.statut === 'nouveau' || c.statut === 'recu').length : 0;
  const casEnCours = typeof DEMO_CASES !== 'undefined' ? DEMO_CASES.filter(c => c.statut === 'en-cours').length : 0;
  const casLivres = typeof DEMO_CASES !== 'undefined' ? DEMO_CASES.filter(c => c.statut === 'livre' || c.statut === 'termine').length : 0;
  const totalCas = typeof DEMO_CASES !== 'undefined' ? DEMO_CASES.length : 0;

  container.innerHTML = `
    <style>
      .acc-welcome{margin-bottom:28px;animation:accFadeIn .5s cubic-bezier(.16,1,.3,1) both;}
      .acc-greeting{font-size:14px;color:var(--text-secondary);font-weight:400;letter-spacing:.02em;}
      .acc-date{font-family:'Syne',sans-serif;font-size:22px;font-weight:700;margin-top:6px;
        background:linear-gradient(135deg,var(--text-primary),var(--accent-light));
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;}
      .acc-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px;}
      .acc-kpi{background:rgba(22,22,31,.65);backdrop-filter:blur(16px) saturate(1.5);
        border:1px solid var(--border-subtle);border-radius:16px;padding:22px;
        transition:all .2s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden;}
      .acc-kpi:hover{border-color:var(--border-default);transform:translateY(-2px);box-shadow:0 0 20px var(--accent-glow);}
      .acc-kpi-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;}
      .acc-kpi-icon svg{width:20px;height:20px;}
      .acc-kpi-icon.pink{background:rgba(190,24,93,.12);color:var(--accent-light);}
      .acc-kpi-icon.blue{background:rgba(59,130,246,.12);color:#60a5fa;}
      .acc-kpi-icon.green{background:rgba(34,197,94,.12);color:#4ade80;}
      .acc-kpi-icon.gold{background:rgba(201,169,97,.12);color:#fbbf24;}
      .acc-kpi-val{font-family:'Syne',sans-serif;font-size:30px;font-weight:700;line-height:1;}
      .acc-kpi-label{font-size:13px;color:var(--text-secondary);margin-top:6px;}
      .acc-kpi-sub{font-size:11px;color:var(--text-tertiary);margin-top:3px;}
      .acc-shortcuts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:28px;}
      .acc-shortcut{display:flex;align-items:center;gap:12px;padding:14px 16px;
        background:rgba(22,22,31,.65);backdrop-filter:blur(12px);
        border:1px solid var(--border-subtle);border-radius:12px;
        cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);
        font-size:13px;font-weight:600;color:var(--text-primary);}
      .acc-shortcut:hover{border-color:var(--accent);background:var(--accent-glow);color:var(--accent-light);transform:translateY(-1px);}
      .acc-shortcut svg{width:18px;height:18px;color:var(--accent-light);flex-shrink:0;}
      .acc-section{margin-bottom:24px;}
      .acc-section-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
      .acc-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
      .acc-card{background:rgba(22,22,31,.65);backdrop-filter:blur(12px);border:1px solid var(--border-subtle);border-radius:16px;padding:20px;}
      .acc-alert{display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;font-size:12px;line-height:1.5;margin-bottom:6px;}
      .acc-alert svg{width:16px;height:16px;flex-shrink:0;margin-top:1px;}
      .acc-alert.warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.12);color:#fbbf24;}
      .acc-alert.info{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.12);color:#60a5fa;}
      .acc-alert.ok{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.12);color:#4ade80;}
      .acc-act-item{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-subtle);font-size:12px;}
      .acc-act-item:last-child{border-bottom:none;}
      .acc-act-time{min-width:44px;color:var(--text-tertiary);font-weight:500;}
      .acc-act-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:4px;}
      .acc-act-text{flex:1;color:var(--text-primary);}
      @keyframes accFadeIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
      .acc-kpi:nth-child(1){animation:accFadeIn .4s cubic-bezier(.16,1,.3,1) .05s both;}
      .acc-kpi:nth-child(2){animation:accFadeIn .4s cubic-bezier(.16,1,.3,1) .1s both;}
      .acc-kpi:nth-child(3){animation:accFadeIn .4s cubic-bezier(.16,1,.3,1) .15s both;}
      .acc-kpi:nth-child(4){animation:accFadeIn .4s cubic-bezier(.16,1,.3,1) .2s both;}
      @media(max-width:600px){.acc-kpis{grid-template-columns:repeat(2,1fr);}.acc-cols{grid-template-columns:1fr;}.acc-shortcuts{grid-template-columns:repeat(2,1fr);}}
    </style>

    <div class="acc-welcome">
      <div class="acc-greeting">${greeting}, ${laboName}</div>
      <div class="acc-date">${dateDisplay}</div>
    </div>

    <div class="acc-kpis">
      <div class="acc-kpi">
        <div class="acc-kpi-icon pink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        </div>
        <div class="acc-kpi-val">${casRecus}</div>
        <div class="acc-kpi-label">Cas reçus</div>
        <div class="acc-kpi-sub">En attente de traitement</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-icon blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="acc-kpi-val">${casEnCours}</div>
        <div class="acc-kpi-label">En production</div>
        <div class="acc-kpi-sub">En cours de fabrication</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-icon green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="acc-kpi-val">${casLivres}</div>
        <div class="acc-kpi-label">Livrés aujourd'hui</div>
        <div class="acc-kpi-sub">Prêts pour expédition</div>
      </div>
      <div class="acc-kpi">
        <div class="acc-kpi-icon gold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <div class="acc-kpi-val">${totalCas}</div>
        <div class="acc-kpi-label">Total cas</div>
        <div class="acc-kpi-sub">Ce mois</div>
      </div>
    </div>

    <div class="acc-section">
      <div class="acc-section-title">Raccourcis rapides</div>
      <div class="acc-shortcuts">
        <div class="acc-shortcut" onclick="window.location.href='/labo/suivi-livreurs.html'" style="background:linear-gradient(135deg,rgba(190,24,93,.15),rgba(190,24,93,.05));border-color:rgba(190,24,93,.3);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Suivre les livreurs
        </div>
        <div class="acc-shortcut" onclick="Router.navigate('/mes-cas')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          Mes cas
        </div>
        <div class="acc-shortcut" onclick="Router.navigate('/mes-dentistes')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          Mes dentistes
        </div>
        <div class="acc-shortcut" onclick="Router.navigate('/profil')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Mon profil
        </div>
      </div>
    </div>

    <div class="acc-cols">
      <div class="acc-section">
        <div class="acc-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Alertes
        </div>
        <div class="acc-card" id="labo-alerts"></div>
      </div>
      <div class="acc-section">
        <div class="acc-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Activité récente
        </div>
        <div class="acc-card" id="labo-activity"></div>
      </div>
    </div>
  `;

  // Alerts
  const alertsEl = container.querySelector('#labo-alerts');
  const alerts = [];
  if (casRecus > 0) {
    alerts.push({ type: 'warn', text: casRecus + ' cas en attente de prise en charge' });
  }
  if (casEnCours > 0) {
    alerts.push({ type: 'info', text: casEnCours + ' cas en production' });
  }
  if (alerts.length === 0) {
    alerts.push({ type: 'ok', text: 'Aucune alerte en cours' });
  }
  alertsEl.innerHTML = alerts.map(a => {
    const icon = a.type === 'warn' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      : a.type === 'info' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    return '<div class="acc-alert ' + a.type + '">' + icon + '<div>' + a.text + '</div></div>';
  }).join('');

  // Activity
  const actEl = container.querySelector('#labo-activity');
  const activities = [];
  if (typeof DEMO_CASES !== 'undefined') {
    DEMO_CASES.slice(0, 5).forEach(c => {
      activities.push({
        time: c.createdAt ? c.createdAt.slice(5) : '--',
        text: '<strong>' + escHtml(c.reference || 'Cas') + '</strong> — ' + escHtml(c.titre || c.type || 'Nouveau cas'),
        color: c.statut === 'en-cours' ? 'var(--accent)' : (c.statut === 'livre' ? '#4ade80' : '#60a5fa')
      });
    });
  }
  if (activities.length === 0) {
    actEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:12px;">Aucune activité récente</div>';
  } else {
    actEl.innerHTML = activities.map(a =>
      '<div class="acc-act-item"><div class="acc-act-time">' + a.time + '</div><div class="acc-act-dot" style="background:' + a.color + '"></div><div class="acc-act-text">' + a.text + '</div></div>'
    ).join('');
  }
}

// Register route
if (typeof Router !== 'undefined') {
  Router.register('/accueil', renderAccueilPage);
}
