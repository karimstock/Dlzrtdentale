/**
 * tab-huddle.js — JADOMI Dentiste Pro — Tableau de bord / Morning Huddle
 * Today's overview: KPIs, schedule timeline, quick actions, pipeline
 * Export: renderHuddle(container), refreshHuddle()
 */

/* ------------------------------------------------------------------ */
/*  DEMO DATA                                                         */
/* ------------------------------------------------------------------ */
var HUDDLE_DATA = {
  date: 'Vendredi 25 Avril 2026',
  greeting: 'Bonjour Dr Bahmed',
  kpis: {
    rdvAujourdhui: 18,
    patientsVus: 7,
    messagesNonLus: 3,
    rappelsEnvoyes: 12
  },
  appointments: [
    { time: '08:00', duration: '30 min', patient: 'Salima Medjkane', type: 'Détartrage', status: 'done' },
    { time: '08:30', duration: '45 min', patient: 'Ahmed Kaci', type: 'Couronne céramique', status: 'done' },
    { time: '09:15', duration: '30 min', patient: 'Nadia Boukhris', type: 'Consultation contrôle', status: 'done' },
    { time: '09:45', duration: '30 min', patient: 'Rachid Ferhat', type: 'Détartrage', status: 'done' },
    { time: '10:15', duration: '45 min', patient: 'Leila Haddad', type: 'Premier RDV', status: 'done' },
    { time: '11:00', duration: '30 min', patient: 'Omar Bensalem', type: 'Contrôle post-extraction', status: 'done' },
    { time: '11:30', duration: '60 min', patient: 'Fatima Zerhouni', type: 'Traitement canal', status: 'done' },
    { time: '12:30', duration: '30 min', patient: 'Karim Touati', type: 'Consultation', status: 'current' },
    { time: '13:00', duration: '30 min', patient: 'Amina Slimani', type: 'Détartrage', status: 'upcoming' },
    { time: '14:00', duration: '45 min', patient: 'Youssef Amrani', type: 'Pose couronne', status: 'upcoming' },
    { time: '14:45', duration: '30 min', patient: 'Samira Belkhodja', type: 'Empreinte', status: 'upcoming' },
    { time: '15:15', duration: '30 min', patient: 'Mourad Djelloul', type: 'Consultation', status: 'upcoming' },
    { time: '15:45', duration: '45 min', patient: 'Zineb Bouazza', type: 'Orthodontie contrôle', status: 'upcoming' },
    { time: '16:30', duration: '30 min', patient: 'Nassim Belaidi', type: 'Extraction', status: 'upcoming' },
    { time: '17:00', duration: '30 min', patient: 'Dalila Ouahab', type: 'Détartrage', status: 'upcoming' },
    { time: '17:30', duration: '45 min', patient: 'Sofiane Rahmani', type: 'Traitement canal', status: 'upcoming' },
    { time: '18:15', duration: '30 min', patient: 'Houda Benali', type: 'Consultation', status: 'upcoming' },
    { time: '18:45', duration: '30 min', patient: 'Amine Cherif', type: 'Contrôle', status: 'upcoming' }
  ],
  pipeline: [
    { patient: 'Nadia Boukhris', serie: 'Couronne 4 éléments', progress: [3, 5], next: '28/04/2026' },
    { patient: 'Fatima Zerhouni', serie: 'Traitement canal #36', progress: [2, 3], next: '29/04/2026' },
    { patient: 'Youssef Amrani', serie: 'Prothèse amovible', progress: [4, 6], next: '25/04/2026' },
    { patient: 'Samira Belkhodja', serie: 'Implant #14', progress: [1, 4], next: '02/05/2026' },
    { patient: 'Zineb Bouazza', serie: 'Orthodontie', progress: [8, 24], next: '30/04/2026' },
    { patient: 'Omar Bensalem', serie: 'Extraction + bridge', progress: [2, 3], next: '30/04/2026' },
    { patient: 'Mourad Djelloul', serie: 'Blanchiment', progress: [1, 3], next: '05/05/2026' },
    { patient: 'Dalila Ouahab', serie: 'Couronne zircone', progress: [2, 4], next: '03/05/2026' }
  ]
};

var _huddleContainer = null;

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */
function _hudAnimNum(el, target, suffix) {
  suffix = suffix || '';
  var cur = 0;
  var step = Math.max(1, Math.ceil(target / 30));
  var iv = setInterval(function() {
    cur = Math.min(cur + step, target);
    el.textContent = cur + suffix;
    if (cur >= target) clearInterval(iv);
  }, 22);
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                            */
/* ------------------------------------------------------------------ */
function _injectHuddleStyles() {
  if (document.getElementById('jadomi-huddle-styles')) return;
  var style = document.createElement('style');
  style.id = 'jadomi-huddle-styles';
  style.textContent = [
    '.jd-huddle{font-family:inherit;color:#e2e8f0}',

    /* Top bar */
    '.jd-hud-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}',
    '.jd-hud-greeting{font-size:26px;font-weight:700;color:#e2e8f0}',
    '.jd-hud-date{font-size:15px;color:#94a3b8;margin-top:4px}',

    /* KPI cards */
    '.jd-hud-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}',
    '.jd-hud-kpi{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:20px;position:relative;overflow:hidden}',
    '.jd-hud-kpi::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0d9488,#14b8a6);opacity:.5}',
    '.jd-hud-kpi-icon{font-size:28px;margin-bottom:8px}',
    '.jd-hud-kpi-label{font-size:13px;color:#64748b;margin-bottom:6px;font-weight:500}',
    '.jd-hud-kpi-value{font-size:30px;font-weight:700;color:#e2e8f0}',
    '.jd-hud-kpi-bar{margin-top:10px;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden}',
    '.jd-hud-kpi-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#0d9488,#14b8a6);transition:width 1s ease}',

    /* Main layout: schedule + pipeline */
    '.jd-hud-main{display:grid;grid-template-columns:1fr 380px;gap:20px;margin-bottom:28px}',

    /* Schedule */
    '.jd-hud-sched{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:22px 20px;max-height:520px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}',
    '.jd-hud-sched-title{font-size:16px;font-weight:600;color:#e2e8f0;margin-bottom:16px}',
    '.jd-hud-timeline{position:relative;padding-left:20px}',

    /* Time marker line */
    '.jd-hud-now-marker{position:relative;height:2px;background:#ef4444;margin:6px 0 6px -20px;border-radius:1px;z-index:2}',
    '.jd-hud-now-marker::before{content:"Maintenant";position:absolute;left:0;top:-18px;font-size:11px;color:#ef4444;font-weight:600}',
    '.jd-hud-now-marker::after{content:"";position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#ef4444}',

    '.jd-hud-appt{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;margin-bottom:6px;transition:all .2s;border-left:3px solid transparent;position:relative}',
    '.jd-hud-appt.done{opacity:.5}',
    '.jd-hud-appt.current{background:rgba(13,148,136,.1);border-left-color:#0d9488;box-shadow:0 0 20px rgba(13,148,136,.15)}',
    '.jd-hud-appt.upcoming{background:rgba(255,255,255,.02)}',
    '.jd-hud-appt:hover{background:rgba(255,255,255,.06)}',
    '.jd-hud-appt-time{width:50px;font-size:14px;font-weight:600;color:#94a3b8;flex-shrink:0}',
    '.jd-hud-appt.current .jd-hud-appt-time{color:#14b8a6}',
    '.jd-hud-appt-info{flex:1;min-width:0}',
    '.jd-hud-appt-name{font-size:14px;font-weight:600;color:#e2e8f0}',
    '.jd-hud-appt.done .jd-hud-appt-name{text-decoration:line-through;color:#64748b}',
    '.jd-hud-appt-type{font-size:12px;color:#64748b;margin-top:2px}',
    '.jd-hud-appt-dur{font-size:12px;color:#64748b;flex-shrink:0;padding:3px 10px;border-radius:6px;background:rgba(255,255,255,.04)}',

    /* Pipeline */
    '.jd-hud-pipeline{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:22px 20px;max-height:520px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}',
    '.jd-hud-pipe-title{font-size:16px;font-weight:600;color:#e2e8f0;margin-bottom:6px}',
    '.jd-hud-pipe-sub{font-size:13px;color:#64748b;margin-bottom:16px}',
    '.jd-hud-pipe-item{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.04)}',
    '.jd-hud-pipe-item:last-child{border-bottom:none}',
    '.jd-hud-pipe-name{font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:2px}',
    '.jd-hud-pipe-serie{font-size:12px;color:#94a3b8;margin-bottom:8px}',
    '.jd-hud-pipe-progress{display:flex;align-items:center;gap:10px}',
    '.jd-hud-pipe-bar{flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden}',
    '.jd-hud-pipe-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#0d9488,#14b8a6);transition:width .8s ease}',
    '.jd-hud-pipe-pct{font-size:12px;color:#94a3b8;width:50px;text-align:right;flex-shrink:0}',
    '.jd-hud-pipe-next{font-size:11px;color:#64748b;margin-top:4px}',

    /* Quick actions */
    '.jd-hud-actions{display:flex;gap:14px;flex-wrap:wrap}',
    '.jd-hud-action-btn{padding:12px 28px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:8px}',
    '.jd-hud-action-btn:hover{background:rgba(13,148,136,.15);border-color:#0d9488;color:#14b8a6}',
    '.jd-hud-action-btn:active{transform:scale(.97)}',

    /* Responsive */
    '@media(max-width:900px){.jd-hud-kpis{grid-template-columns:repeat(2,1fr)}.jd-hud-main{grid-template-columns:1fr}}'
  ].join('\n');
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  BUILD HTML                                                        */
/* ------------------------------------------------------------------ */
function _buildHuddle() {
  var d = HUDDLE_DATA;
  var k = d.kpis;
  var patientsVusPct = Math.round((k.patientsVus / k.rdvAujourdhui) * 100);
  var html = '';

  /* Top bar */
  html += '<div class="jd-hud-top"><div><div class="jd-hud-greeting">' + d.greeting + '</div><div class="jd-hud-date">' + d.date + '</div></div></div>';

  /* KPI cards */
  html += '<div class="jd-hud-kpis">';
  html += '<div class="jd-hud-kpi"><div class="jd-hud-kpi-icon">📅</div><div class="jd-hud-kpi-label">RDV aujourd\'hui</div><div class="jd-hud-kpi-value" data-hanim="' + k.rdvAujourdhui + '">0</div></div>';
  html += '<div class="jd-hud-kpi"><div class="jd-hud-kpi-icon">👤</div><div class="jd-hud-kpi-label">Patients vus</div><div class="jd-hud-kpi-value">' + k.patientsVus + '/' + k.rdvAujourdhui + '</div><div class="jd-hud-kpi-bar"><div class="jd-hud-kpi-bar-fill" style="width:0" data-hw="' + patientsVusPct + '%"></div></div></div>';
  html += '<div class="jd-hud-kpi"><div class="jd-hud-kpi-icon">💬</div><div class="jd-hud-kpi-label">Messages non lus</div><div class="jd-hud-kpi-value" data-hanim="' + k.messagesNonLus + '">0</div></div>';
  html += '<div class="jd-hud-kpi"><div class="jd-hud-kpi-icon">🔔</div><div class="jd-hud-kpi-label">Rappels envoyés</div><div class="jd-hud-kpi-value" data-hanim="' + k.rappelsEnvoyes + '">0</div></div>';
  html += '</div>';

  /* Main: schedule + pipeline */
  html += '<div class="jd-hud-main">';

  /* Schedule */
  html += '<div class="jd-hud-sched"><div class="jd-hud-sched-title">Planning du jour</div><div class="jd-hud-timeline">';
  var nowInserted = false;
  d.appointments.forEach(function(a) {
    if (a.status === 'current' && !nowInserted) {
      html += '<div class="jd-hud-now-marker"></div>';
      nowInserted = true;
    }
    html += '<div class="jd-hud-appt ' + a.status + '">';
    html += '<div class="jd-hud-appt-time">' + a.time + '</div>';
    html += '<div class="jd-hud-appt-info"><div class="jd-hud-appt-name">' + a.patient + '</div><div class="jd-hud-appt-type">' + a.type + '</div></div>';
    html += '<div class="jd-hud-appt-dur">' + a.duration + '</div>';
    html += '</div>';
  });
  html += '</div></div>';

  /* Pipeline */
  html += '<div class="jd-hud-pipeline"><div class="jd-hud-pipe-title">Séries en cours</div><div class="jd-hud-pipe-sub">' + d.pipeline.length + ' patients</div>';
  d.pipeline.forEach(function(p) {
    var pct = Math.round((p.progress[0] / p.progress[1]) * 100);
    html += '<div class="jd-hud-pipe-item">';
    html += '<div class="jd-hud-pipe-name">' + p.patient + '</div>';
    html += '<div class="jd-hud-pipe-serie">' + p.serie + '</div>';
    html += '<div class="jd-hud-pipe-progress"><div class="jd-hud-pipe-bar"><div class="jd-hud-pipe-bar-fill" style="width:0" data-hw="' + pct + '%"></div></div><span class="jd-hud-pipe-pct">' + p.progress[0] + '/' + p.progress[1] + ' RDV</span></div>';
    html += '<div class="jd-hud-pipe-next">Prochain : ' + p.next + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';

  /* Quick actions */
  html += '<div class="jd-hud-actions">';
  html += '<button class="jd-hud-action-btn" data-action="agenda">📅 Nouveau RDV</button>';
  html += '<button class="jd-hud-action-btn" data-action="batch">📋 Batch RDV</button>';
  html += '<button class="jd-hud-action-btn" data-action="chat">💬 Voir messages</button>';
  html += '</div>';

  return html;
}

/* ------------------------------------------------------------------ */
/*  ANIMATIONS                                                        */
/* ------------------------------------------------------------------ */
function _animateHuddle(container) {
  // Number animations
  container.querySelectorAll('[data-hanim]').forEach(function(el) {
    _hudAnimNum(el, parseInt(el.dataset.hanim), '');
  });

  // Progress bars
  setTimeout(function() {
    container.querySelectorAll('[data-hw]').forEach(function(el) {
      el.style.width = el.dataset.hw;
    });
  }, 100);
}

/* ------------------------------------------------------------------ */
/*  PUBLIC API                                                        */
/* ------------------------------------------------------------------ */
function renderHuddle(container) {
  _injectHuddleStyles();
  _huddleContainer = container;

  container.innerHTML = '<div class="jd-huddle">' + _buildHuddle() + '</div>';

  // Quick action handlers
  container.querySelectorAll('.jd-hud-action-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var action = btn.dataset.action;
      // Dispatch custom event for parent dashboard to handle tab switching
      var ev;
      try {
        ev = new CustomEvent('jadomi-navigate', { detail: { tab: action } });
      } catch (_e) {
        ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('jadomi-navigate', true, true, { tab: action });
      }
      document.dispatchEvent(ev);
    });
  });

  // Scroll current appointment into view
  setTimeout(function() {
    var cur = container.querySelector('.jd-hud-appt.current');
    if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);

  _animateHuddle(container);
}

function refreshHuddle() {
  if (_huddleContainer) renderHuddle(_huddleContainer);
}

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderHuddle: renderHuddle, refreshHuddle: refreshHuddle };
}
