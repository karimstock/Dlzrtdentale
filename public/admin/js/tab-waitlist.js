/**
 * tab-waitlist.js — Liste d'Attente
 * JADOMI Dentiste Pro
 * Exports: renderWaitlist(container), refreshWaitlist()
 */

(function () {
  "use strict";

  /* ── Helpers ──────────────────────────────────────────── */
  function uid() { return "wl_" + Math.random().toString(36).slice(2, 10); }
  function fmt2(n) { return String(n).padStart(2, "0"); }
  function ago(days) {
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Hier";
    return days + " jours";
  }
  function urgencyColor(u) {
    if (u >= 8) return "#ef4444";
    if (u >= 5) return "#f59e0b";
    if (u >= 3) return "#5eead4";
    return "#64748b";
  }
  function score(p) {
    return Math.round(p.urgency * 4 + p.waitDays * 0.3 + p.prefScore * 2 + p.proximity * 1);
  }

  /* ── Demo data ───────────────────────────────────────── */
  var DEMO_PATIENTS = [
    { id: 1, name: "Mme Dupont, Marie",   motif: "Douleur molaire",       urgency: 9, waitDays: 3,  prefs: "Matin, Lun-Mer",    prefScore: 7, proximity: 8 },
    { id: 2, name: "M. Bensaid, Karim",   motif: "Contrôle semestriel",   urgency: 3, waitDays: 12, prefs: "Après-midi",         prefScore: 5, proximity: 6 },
    { id: 3, name: "Mme Leroy, Sophie",   motif: "Détartrage",            urgency: 5, waitDays: 8,  prefs: "Mar-Jeu, 14h-16h",  prefScore: 8, proximity: 9 },
    { id: 4, name: "M. Martin, Lucas",    motif: "Couronne à recoller",   urgency: 8, waitDays: 1,  prefs: "Flexible",           prefScore: 9, proximity: 5 },
    { id: 5, name: "Mme Petit, Nadia",    motif: "Extraction sagesse",    urgency: 7, waitDays: 5,  prefs: "Matin, Ven",         prefScore: 4, proximity: 7 },
    { id: 6, name: "M. Durand, Pierre",   motif: "Bridge provisoire",     urgency: 4, waitDays: 15, prefs: "Mer 9h-12h",         prefScore: 6, proximity: 4 }
  ];

  var DEMO_RECOVERED = [
    { date: "23/04/2026", time: "10h30-11h15", patient: "Mme Dupont, Marie",  status: "accepted", reactionSec: 204 },
    { date: "20/04/2026", time: "14h00-14h45", patient: "M. Martin, Lucas",   status: "accepted", reactionSec: 47 },
    { date: "18/04/2026", time: "09h00-09h30", patient: null,                 status: "expired",  reactionSec: null },
    { date: "15/04/2026", time: "16h15-17h00", patient: "Mme Leroy, Sophie",  status: "accepted", reactionSec: 389 }
  ];

  /* ── Styles (injected once) ──────────────────────────── */
  var STYLE_ID = "waitlist-styles";
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent = [
      "/* ── Waitlist ── */",
      ".wl-wrap{font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;max-width:920px;margin:0 auto}",

      ".wl-card{background:rgba(30,41,59,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(94,234,212,.12);border-radius:18px;padding:28px 32px;margin-bottom:24px;transition:box-shadow .3s}",
      ".wl-card:hover{box-shadow:0 0 32px rgba(94,234,212,.08)}",
      ".wl-title{font-size:20px;font-weight:700;margin:0 0 18px;display:flex;align-items:center;gap:10px}",
      ".wl-title svg{flex-shrink:0}",

      /* Table */
      ".wl-table{width:100%;border-collapse:separate;border-spacing:0 6px}",
      ".wl-table th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:#64748b;text-align:left;padding:0 10px 8px}",
      ".wl-table td{padding:12px 10px;background:rgba(15,23,42,.4);vertical-align:middle;font-size:13px}",
      ".wl-table tr td:first-child{border-radius:10px 0 0 10px}",
      ".wl-table tr td:last-child{border-radius:0 10px 10px 0}",
      ".wl-table tr{transition:transform .18s}",
      ".wl-table tbody tr:hover{transform:translateX(3px)}",

      /* Urgency bar */
      ".wl-urg-wrap{display:flex;align-items:center;gap:8px}",
      ".wl-urg-bar{width:48px;height:7px;border-radius:4px;background:rgba(100,116,139,.25);overflow:hidden;position:relative}",
      ".wl-urg-fill{height:100%;border-radius:4px;transition:width .3s}",
      ".wl-urg-num{font-weight:700;font-size:14px;min-width:20px}",

      /* Urgency slider button */
      ".wl-urg-btn{font-size:11px;color:#5eead4;cursor:pointer;background:rgba(94,234,212,.08);border:1px solid rgba(94,234,212,.2);border-radius:6px;padding:3px 8px;white-space:nowrap;transition:background .2s}",
      ".wl-urg-btn:hover{background:rgba(94,234,212,.18)}",

      /* Inline slider */
      ".wl-slider-wrap{display:none;align-items:center;gap:6px;margin-top:4px}",
      ".wl-slider-wrap.open{display:flex}",
      ".wl-slider{-webkit-appearance:none;width:80px;height:5px;border-radius:3px;background:rgba(100,116,139,.3);outline:none}",
      ".wl-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#5eead4;cursor:pointer}",

      /* Score badge */
      ".wl-score{font-weight:800;font-size:14px;color:#5eead4}",

      /* Recovered section */
      ".wl-recov-row{display:flex;align-items:center;gap:14px;padding:12px 14px;background:rgba(15,23,42,.4);border-radius:12px;margin-bottom:8px;transition:transform .18s}",
      ".wl-recov-row:hover{transform:translateX(3px)}",
      ".wl-recov-date{font-weight:700;font-size:14px;min-width:160px}",
      ".wl-recov-patient{flex:1;font-size:13px}",
      ".wl-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:14px;letter-spacing:.4px}",
      ".wl-badge-green{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}",
      ".wl-badge-grey{background:rgba(100,116,139,.15);color:#94a3b8;border:1px solid rgba(100,116,139,.3)}",
      ".wl-reaction{font-size:12px;color:#94a3b8;min-width:120px;text-align:right}",

      /* Stats bar */
      ".wl-stats{display:flex;gap:24px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid rgba(94,234,212,.08)}",
      ".wl-stat{text-align:center}",
      ".wl-stat-val{font-size:22px;font-weight:800;color:#5eead4;display:block}",
      ".wl-stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.6px}",

      /* Empty state */
      ".wl-empty{text-align:center;padding:40px;color:#64748b;font-size:15px}",

      /* anim */
      ".wl-fade{animation:wlFadeIn .3s ease forwards;opacity:0}",
      "@keyframes wlFadeIn{to{opacity:1}}",

      "@media(max-width:700px){.wl-card{padding:18px 14px}.wl-table{font-size:12px}.wl-recov-date{min-width:auto}}"
    ].join("\n");
    document.head.appendChild(css);
  }

  /* ── Icons ───────────────────────────────────────────── */
  var ICON = {
    list: '<svg width="20" height="20" fill="none" stroke="#5eead4" stroke-width="2" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    clock: '<svg width="20" height="20" fill="none" stroke="#5eead4" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
  };

  /* ── State ───────────────────────────────────────────── */
  var _container = null;
  var _patients = [];

  /* ── Format reaction time ────────────────────────────── */
  function fmtReaction(sec) {
    if (sec == null) return "";
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return "Accepté en " + m + " min " + fmt2(s) + "s";
  }

  /* ── Render active waitlist table ────────────────────── */
  function tableHTML(patients) {
    if (!patients.length) {
      return '<div class="wl-empty">Aucun patient en liste d\'attente</div>';
    }
    /* sort by composite score desc */
    var sorted = patients.slice().sort(function (a, b) { return score(b) - score(a); });

    var h = ['<table class="wl-table"><thead><tr>',
      '<th>Patient</th><th>Motif</th><th>Urgence</th><th>En attente</th><th>Préférences</th><th>Score</th>',
      '</tr></thead><tbody>'];

    sorted.forEach(function (p, idx) {
      var c = urgencyColor(p.urgency);
      var sliderId = "wl-slider-" + p.id;
      h.push('<tr class="wl-fade" style="animation-delay:' + (idx * 60) + 'ms">');
      h.push('<td style="font-weight:600">' + p.name + '</td>');
      h.push('<td>' + p.motif + '</td>');
      h.push('<td>');
      h.push('<div class="wl-urg-wrap">');
      h.push('<div class="wl-urg-bar"><div class="wl-urg-fill" style="width:' + (p.urgency * 10) + '%;background:' + c + '"></div></div>');
      h.push('<span class="wl-urg-num" style="color:' + c + '" id="wl-urg-val-' + p.id + '">' + p.urgency + '</span>');
      h.push('</div>');
      h.push('<button class="wl-urg-btn" data-slider="' + sliderId + '">Modifier</button>');
      h.push('<div class="wl-slider-wrap" id="' + sliderId + '">');
      h.push('<input type="range" class="wl-slider" min="1" max="10" value="' + p.urgency + '" data-pid="' + p.id + '"/>');
      h.push('</div>');
      h.push('</td>');
      h.push('<td>' + ago(p.waitDays) + '</td>');
      h.push('<td>' + p.prefs + '</td>');
      h.push('<td><span class="wl-score">' + score(p) + '</span></td>');
      h.push('</tr>');
    });
    h.push('</tbody></table>');
    return h.join("");
  }

  /* ── Render recovered slots ──────────────────────────── */
  function recoveredHTML(items) {
    var h = [];
    items.forEach(function (r, idx) {
      h.push('<div class="wl-recov-row wl-fade" style="animation-delay:' + (idx * 70) + 'ms">');
      h.push('<span class="wl-recov-date">' + r.date + ' &mdash; ' + r.time + '</span>');
      if (r.status === "accepted") {
        h.push('<span class="wl-recov-patient">Récupéré par : <strong>' + r.patient + '</strong></span>');
        h.push('<span class="wl-badge wl-badge-green">Récupéré</span>');
        h.push('<span class="wl-reaction">' + fmtReaction(r.reactionSec) + '</span>');
      } else {
        h.push('<span class="wl-recov-patient" style="color:#64748b">Aucun patient disponible</span>');
        h.push('<span class="wl-badge wl-badge-grey">Expiré</span>');
        h.push('<span class="wl-reaction"></span>');
      }
      h.push('</div>');
    });
    return h.join("");
  }

  /* ── Compute stats ───────────────────────────────────── */
  function statsHTML(items) {
    var accepted = items.filter(function (r) { return r.status === "accepted"; });
    var total = items.length;
    var recov = accepted.length;
    var avgSec = recov
      ? Math.round(accepted.reduce(function (s, r) { return s + r.reactionSec; }, 0) / recov)
      : 0;
    var avgMin = Math.floor(avgSec / 60);
    var avgS = avgSec % 60;
    var taux = total ? Math.round((recov / total) * 100) : 0;

    return [
      '<div class="wl-stats">',
        '<div class="wl-stat"><span class="wl-stat-val">' + recov + '</span><span class="wl-stat-label">Créneaux récupérés ce mois</span></div>',
        '<div class="wl-stat"><span class="wl-stat-val">' + avgMin + 'm ' + fmt2(avgS) + 's</span><span class="wl-stat-label">Temps moyen de réaction</span></div>',
        '<div class="wl-stat"><span class="wl-stat-val">' + taux + '%</span><span class="wl-stat-label">Taux de récupération</span></div>',
      '</div>'
    ].join("");
  }

  /* ── Full render ─────────────────────────────────────── */
  function renderWaitlist(container) {
    injectStyles();
    _container = typeof container === "string"
      ? document.querySelector(container)
      : container;
    if (!_container) return;

    _patients = DEMO_PATIENTS.map(function (p) { return Object.assign({}, p); });

    var html = [
      '<div class="wl-wrap">',

        /* Active waitlist */
        '<div class="wl-card">',
          '<h2 class="wl-title">', ICON.list, ' Liste d\'Attente Active</h2>',
          '<div id="wl-table-wrap">', tableHTML(_patients), '</div>',
        '</div>',

        /* Recovered slots */
        '<div class="wl-card">',
          '<h2 class="wl-title">', ICON.clock, ' Créneaux Récupérés</h2>',
          recoveredHTML(DEMO_RECOVERED),
          statsHTML(DEMO_RECOVERED),
        '</div>',

      '</div>'
    ].join("");

    _container.innerHTML = html;
    wireEvents();
  }

  /* ── Wire events ─────────────────────────────────────── */
  function wireEvents() {
    if (!_container) return;

    /* Toggle slider visibility */
    _container.querySelectorAll(".wl-urg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sliderId = btn.getAttribute("data-slider");
        var wrap = document.getElementById(sliderId);
        if (wrap) wrap.classList.toggle("open");
      });
    });

    /* Slider value change */
    _container.querySelectorAll(".wl-slider").forEach(function (slider) {
      slider.addEventListener("input", function () {
        var pid = parseInt(slider.getAttribute("data-pid"), 10);
        var val = parseInt(slider.value, 10);
        var valEl = document.getElementById("wl-urg-val-" + pid);
        if (valEl) {
          valEl.textContent = val;
          valEl.style.color = urgencyColor(val);
        }
        /* Update bar */
        var bar = slider.closest("td");
        if (bar) {
          var fill = bar.querySelector(".wl-urg-fill");
          if (fill) {
            fill.style.width = (val * 10) + "%";
            fill.style.background = urgencyColor(val);
          }
        }
        /* Update patient data */
        var p = _patients.find(function (x) { return x.id === pid; });
        if (p) {
          p.urgency = val;
          /* Update score */
          var row = slider.closest("tr");
          if (row) {
            var scoreEl = row.querySelector(".wl-score");
            if (scoreEl) scoreEl.textContent = score(p);
          }
        }
      });
    });
  }

  function refreshWaitlist() {
    if (!_container) return;
    renderWaitlist(_container);
  }

  /* ── Export ──────────────────────────────────────────── */
  if (typeof window !== "undefined") {
    window.renderWaitlist = renderWaitlist;
    window.refreshWaitlist = refreshWaitlist;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderWaitlist: renderWaitlist, refreshWaitlist: refreshWaitlist };
  }
})();
