/**
 * tab-stats.js — JADOMI Dentiste Pro — Statistiques Module
 * KPI cards, CSS-only charts, performance tables
 * Export: renderStats(container), refreshStats()
 */

/* ------------------------------------------------------------------ */
/*  DEMO DATA                                                         */
/* ------------------------------------------------------------------ */
const STATS_PERIODS = {
  semaine: {
    label: 'Semaine',
    rdvTotal: 98, rdvTrend: 12, rdvUp: true,
    tauxPresence: 91,
    messagesTotal: 234, messagesIA: 67,
    creneauxRecup: 14, heuresEco: 7,
    weeklyRdv: [18, 22, 20, 15, 19, 4, 0],
    satisfaction: [
      { month: 'Avr 2026', pct: 94 },
      { month: 'Mar 2026', pct: 91 },
      { month: 'Fév 2026', pct: 88 },
      { month: 'Jan 2026', pct: 90 }
    ],
    motifs: [
      { motif: 'Détartrage', count: 28, pct: 28.6 },
      { motif: 'Consultation', count: 22, pct: 22.4 },
      { motif: 'Couronne', count: 15, pct: 15.3 },
      { motif: 'Extraction', count: 12, pct: 12.2 },
      { motif: 'Orthodontie', count: 10, pct: 10.2 },
      { motif: 'Urgence', count: 8, pct: 8.2 },
      { motif: 'Autre', count: 3, pct: 3.1 }
    ],
    rappels: { envoyes: 96, confirmes: 78, sansReponse: 18, taux: 81.3 }
  },
  mois: {
    label: 'Mois',
    rdvTotal: 412, rdvTrend: 8, rdvUp: true,
    tauxPresence: 89,
    messagesTotal: 987, messagesIA: 312,
    creneauxRecup: 52, heuresEco: 26,
    weeklyRdv: [20, 21, 19, 22, 18, 5, 0],
    satisfaction: [
      { month: 'Avr 2026', pct: 94 },
      { month: 'Mar 2026', pct: 91 },
      { month: 'Fév 2026', pct: 88 },
      { month: 'Jan 2026', pct: 90 }
    ],
    motifs: [
      { motif: 'Détartrage', count: 112, pct: 27.2 },
      { motif: 'Consultation', count: 95, pct: 23.1 },
      { motif: 'Couronne', count: 62, pct: 15.0 },
      { motif: 'Extraction', count: 48, pct: 11.7 },
      { motif: 'Orthodontie', count: 42, pct: 10.2 },
      { motif: 'Urgence', count: 33, pct: 8.0 },
      { motif: 'Autre', count: 20, pct: 4.9 }
    ],
    rappels: { envoyes: 402, confirmes: 340, sansReponse: 62, taux: 84.6 }
  },
  trimestre: {
    label: 'Trimestre',
    rdvTotal: 1186, rdvTrend: 5, rdvUp: true,
    tauxPresence: 88,
    messagesTotal: 2841, messagesIA: 923,
    creneauxRecup: 148, heuresEco: 74,
    weeklyRdv: [19, 20, 21, 20, 18, 4, 0],
    satisfaction: [
      { month: 'Avr 2026', pct: 94 },
      { month: 'Mar 2026', pct: 91 },
      { month: 'Fév 2026', pct: 88 },
      { month: 'Jan 2026', pct: 90 }
    ],
    motifs: [
      { motif: 'Détartrage', count: 320, pct: 27.0 },
      { motif: 'Consultation', count: 274, pct: 23.1 },
      { motif: 'Couronne', count: 178, pct: 15.0 },
      { motif: 'Extraction', count: 142, pct: 12.0 },
      { motif: 'Orthodontie', count: 119, pct: 10.0 },
      { motif: 'Urgence', count: 95, pct: 8.0 },
      { motif: 'Autre', count: 58, pct: 4.9 }
    ],
    rappels: { envoyes: 1154, confirmes: 992, sansReponse: 162, taux: 85.9 }
  }
};

let _statsActivePeriod = 'semaine';
let _statsContainer = null;

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */
function _animNum(el, target, suffix) {
  suffix = suffix || '';
  var cur = 0;
  var step = Math.max(1, Math.ceil(target / 40));
  var iv = setInterval(function() {
    cur = Math.min(cur + step, target);
    el.textContent = cur.toLocaleString('fr-FR') + suffix;
    if (cur >= target) clearInterval(iv);
  }, 18);
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                            */
/* ------------------------------------------------------------------ */
function _injectStatsStyles() {
  if (document.getElementById('jadomi-stats-styles')) return;
  var style = document.createElement('style');
  style.id = 'jadomi-stats-styles';
  style.textContent = [
    '.jd-stats{font-family:inherit;color:#e2e8f0}',

    /* Period pills */
    '.jd-stats-pills{display:flex;gap:8px;margin-bottom:28px}',
    '.jd-stats-pill{padding:8px 22px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#94a3b8;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}',
    '.jd-stats-pill:hover{background:rgba(255,255,255,.08)}',
    '.jd-stats-pill.active{background:rgba(13,148,136,.2);border-color:#0d9488;color:#14b8a6}',

    /* KPI cards */
    '.jd-stats-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}',
    '.jd-stats-kpi{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:22px 20px;position:relative;overflow:hidden}',
    '.jd-stats-kpi::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0d9488,#14b8a6);opacity:.6}',
    '.jd-stats-kpi-label{font-size:13px;color:#64748b;margin-bottom:10px;font-weight:500}',
    '.jd-stats-kpi-value{font-size:34px;font-weight:700;color:#e2e8f0;margin-bottom:6px}',
    '.jd-stats-kpi-sub{font-size:12px;color:#64748b}',
    '.jd-stats-trend{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;padding:2px 8px;border-radius:6px}',
    '.jd-stats-trend.up{color:#34d399;background:rgba(52,211,153,.1)}',
    '.jd-stats-trend.down{color:#f87171;background:rgba(248,113,113,.1)}',

    /* Circular progress */
    '.jd-circ-wrap{display:flex;align-items:center;gap:16px}',
    '.jd-circ{width:70px;height:70px;position:relative}',
    '.jd-circ svg{transform:rotate(-90deg);width:70px;height:70px}',
    '.jd-circ-bg{fill:none;stroke:rgba(255,255,255,.06);stroke-width:6}',
    '.jd-circ-fg{fill:none;stroke:#0d9488;stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset 1.2s ease}',
    '.jd-circ-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#e2e8f0}',

    /* Charts section */
    '.jd-stats-charts{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px}',
    '.jd-stats-chart-card{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:22px 20px}',
    '.jd-stats-chart-title{font-size:15px;font-weight:600;color:#e2e8f0;margin-bottom:18px}',

    /* Bar chart */
    '.jd-bar-chart{display:flex;align-items:flex-end;gap:12px;height:160px;padding-top:10px}',
    '.jd-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}',
    '.jd-bar{width:100%;border-radius:6px 6px 0 0;background:linear-gradient(180deg,#14b8a6,#0d9488);min-height:4px;transition:height .8s ease;position:relative}',
    '.jd-bar-val{font-size:11px;color:#94a3b8;font-weight:600}',
    '.jd-bar-label{font-size:11px;color:#64748b}',

    /* Horizontal progress bars (satisfaction) */
    '.jd-hbar-row{display:flex;align-items:center;gap:12px;margin-bottom:12px}',
    '.jd-hbar-label{width:80px;font-size:13px;color:#94a3b8;text-align:right;flex-shrink:0}',
    '.jd-hbar-track{flex:1;height:22px;background:rgba(255,255,255,.06);border-radius:6px;overflow:hidden;position:relative}',
    '.jd-hbar-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,#0d9488,#14b8a6);transition:width 1s ease}',
    '.jd-hbar-pct{width:44px;font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;flex-shrink:0}',

    /* Tables */
    '.jd-stats-tables{display:grid;grid-template-columns:1fr 1fr;gap:20px}',
    '.jd-stats-table-card{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:22px 20px}',
    '.jd-stats-table-title{font-size:15px;font-weight:600;color:#e2e8f0;margin-bottom:14px}',
    'table.jd-tbl{width:100%;border-collapse:collapse}',
    'table.jd-tbl th{text-align:left;font-size:12px;color:#64748b;font-weight:500;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06)}',
    'table.jd-tbl td{font-size:13px;color:#e2e8f0;padding:8px;border-bottom:1px solid rgba(255,255,255,.03)}',
    'table.jd-tbl tr:last-child td{border-bottom:none}',
    '.jd-tbl-pct-bar{display:inline-block;height:6px;border-radius:3px;background:#0d9488;vertical-align:middle;margin-right:6px}',

    /* Responsive */
    '@media(max-width:900px){.jd-stats-kpis,.jd-stats-charts,.jd-stats-tables{grid-template-columns:1fr}}'
  ].join('\n');
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  BUILD HTML                                                        */
/* ------------------------------------------------------------------ */
function _buildStats(period) {
  var d = STATS_PERIODS[period];
  var days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  var maxRdv = Math.max.apply(null, d.weeklyRdv) || 1;
  var circ = Math.round(2 * Math.PI * 28);
  var dashOffset = circ - (d.tauxPresence / 100) * circ;

  var html = '';

  /* Pills */
  html += '<div class="jd-stats-pills">';
  ['semaine','mois','trimestre'].forEach(function(k) {
    html += '<div class="jd-stats-pill' + (k === period ? ' active' : '') + '" data-period="' + k + '">' + STATS_PERIODS[k].label + '</div>';
  });
  html += '</div>';

  /* KPI cards */
  html += '<div class="jd-stats-kpis">';
  // 1
  html += '<div class="jd-stats-kpi"><div class="jd-stats-kpi-label">RDV Total</div><div class="jd-stats-kpi-value" data-anim="' + d.rdvTotal + '">0</div><div class="jd-stats-kpi-sub"><span class="jd-stats-trend ' + (d.rdvUp?'up':'down') + '">' + (d.rdvUp?'↑':'↓') + d.rdvTrend + '%</span> vs période précédente</div></div>';
  // 2
  html += '<div class="jd-stats-kpi"><div class="jd-stats-kpi-label">Taux de présence</div><div class="jd-circ-wrap"><div class="jd-circ"><svg viewBox="0 0 64 64"><circle class="jd-circ-bg" cx="32" cy="32" r="28"/><circle class="jd-circ-fg" cx="32" cy="32" r="28" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '" data-target="' + dashOffset + '"/></svg><div class="jd-circ-text" data-anim="' + d.tauxPresence + '" data-suffix="%">0%</div></div></div></div>';
  // 3
  html += '<div class="jd-stats-kpi"><div class="jd-stats-kpi-label">Messages échangés</div><div class="jd-stats-kpi-value" data-anim="' + d.messagesTotal + '">0</div><div class="jd-stats-kpi-sub">dont ' + d.messagesIA + ' par IA</div></div>';
  // 4
  html += '<div class="jd-stats-kpi"><div class="jd-stats-kpi-label">Créneaux récupérés</div><div class="jd-stats-kpi-value" data-anim="' + d.creneauxRecup + '">0</div><div class="jd-stats-kpi-sub">' + d.heuresEco + ' heures économisées</div></div>';
  html += '</div>';

  /* Charts */
  html += '<div class="jd-stats-charts">';
  // Bar chart
  html += '<div class="jd-stats-chart-card"><div class="jd-stats-chart-title">RDV par jour de la semaine</div><div class="jd-bar-chart">';
  d.weeklyRdv.forEach(function(v, i) {
    var h = Math.round((v / maxRdv) * 140);
    html += '<div class="jd-bar-col"><div class="jd-bar-val">' + v + '</div><div class="jd-bar" style="height:0" data-h="' + h + 'px"></div><div class="jd-bar-label">' + days[i] + '</div></div>';
  });
  html += '</div></div>';
  // Satisfaction
  html += '<div class="jd-stats-chart-card"><div class="jd-stats-chart-title">Satisfaction patient</div>';
  d.satisfaction.forEach(function(s) {
    html += '<div class="jd-hbar-row"><span class="jd-hbar-label">' + s.month + '</span><div class="jd-hbar-track"><div class="jd-hbar-fill" style="width:0" data-w="' + s.pct + '%"></div></div><span class="jd-hbar-pct">' + s.pct + '%</span></div>';
  });
  html += '</div></div>';

  /* Tables */
  html += '<div class="jd-stats-tables">';
  // Motifs
  html += '<div class="jd-stats-table-card"><div class="jd-stats-table-title">Top motifs de consultation</div><table class="jd-tbl"><thead><tr><th>Motif</th><th>Nombre</th><th>% du total</th></tr></thead><tbody>';
  d.motifs.forEach(function(m) {
    html += '<tr><td>' + m.motif + '</td><td>' + m.count + '</td><td><span class="jd-tbl-pct-bar" style="width:' + m.pct + 'px"></span>' + m.pct + '%</td></tr>';
  });
  html += '</tbody></table></div>';
  // Rappels
  html += '<div class="jd-stats-table-card"><div class="jd-stats-table-title">Rappels performance</div><table class="jd-tbl"><thead><tr><th>Métrique</th><th>Valeur</th></tr></thead><tbody>';
  html += '<tr><td>Envoyés</td><td>' + d.rappels.envoyes + '</td></tr>';
  html += '<tr><td>Confirmés</td><td>' + d.rappels.confirmes + '</td></tr>';
  html += '<tr><td>Sans réponse</td><td>' + d.rappels.sansReponse + '</td></tr>';
  html += '<tr><td>Taux de confirmation</td><td><strong style="color:#14b8a6">' + d.rappels.taux + '%</strong></td></tr>';
  html += '</tbody></table></div>';
  html += '</div>';

  return html;
}

/* ------------------------------------------------------------------ */
/*  ANIMATIONS                                                        */
/* ------------------------------------------------------------------ */
function _animateStats(container) {
  // Number animations
  container.querySelectorAll('[data-anim]').forEach(function(el) {
    var target = parseInt(el.dataset.anim);
    var suffix = el.dataset.suffix || '';
    _animNum(el, target, suffix);
  });

  // Circular progress
  setTimeout(function() {
    container.querySelectorAll('.jd-circ-fg[data-target]').forEach(function(el) {
      el.style.strokeDashoffset = el.dataset.target;
    });
  }, 50);

  // Bar chart
  setTimeout(function() {
    container.querySelectorAll('.jd-bar[data-h]').forEach(function(el) {
      el.style.height = el.dataset.h;
    });
  }, 100);

  // Horizontal bars
  setTimeout(function() {
    container.querySelectorAll('.jd-hbar-fill[data-w]').forEach(function(el) {
      el.style.width = el.dataset.w;
    });
  }, 150);
}

/* ------------------------------------------------------------------ */
/*  PUBLIC API                                                        */
/* ------------------------------------------------------------------ */
function renderStats(container) {
  _injectStatsStyles();
  _statsContainer = container;
  _statsActivePeriod = 'semaine';

  container.innerHTML = '<div class="jd-stats">' + _buildStats(_statsActivePeriod) + '</div>';

  // Pill click handlers
  container.querySelectorAll('.jd-stats-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      _statsActivePeriod = pill.dataset.period;
      container.innerHTML = '<div class="jd-stats">' + _buildStats(_statsActivePeriod) + '</div>';
      // Re-bind pills
      container.querySelectorAll('.jd-stats-pill').forEach(function(p) {
        p.addEventListener('click', function() {
          _statsActivePeriod = p.dataset.period;
          renderStats(container);
        });
      });
      _animateStats(container);
    });
  });

  _animateStats(container);
}

function refreshStats() {
  if (_statsContainer) renderStats(_statsContainer);
}

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderStats: renderStats, refreshStats: refreshStats };
}
