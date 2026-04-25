/**
 * tab-batch-rdv.js — Smart Slot Finder (Batch RDV)
 * JADOMI Dentiste Pro — World-first batch appointment finder
 * Exports: renderBatchRdv(container), refreshBatchRdv()
 */

(function () {
  "use strict";

  /* ── Helpers ──────────────────────────────────────────── */
  const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const MONTHS_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  const DAY_NAMES_FULL = [
    "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"
  ];

  function fmt2(n) { return String(n).padStart(2, "0"); }
  function dateFR(d) {
    return DAY_NAMES_FULL[d.getDay()] + " " + d.getDate() + " " +
      MONTHS_FR[d.getMonth()] + " " + d.getFullYear();
  }
  function timeFR(h, m) { return fmt2(h) + "h" + fmt2(m); }

  function nextWeekday(startDate, offset) {
    var d = new Date(startDate);
    d.setDate(d.getDate() + offset);
    return d;
  }

  function uid() { return "brdv_" + Math.random().toString(36).slice(2, 10); }

  /* ── Demo data builder ───────────────────────────────── */
  function buildDemoResults(opts) {
    var startDate = new Date(opts.startDate);
    var interval = opts.interval;
    var slots = [];
    for (var i = 0; i < opts.count; i++) {
      var d = nextWeekday(startDate, i * interval);
      // Push to a weekday if falls on Sunday
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      var conflict = (i === 2); // 3rd slot has conflict
      var startH = parseInt(opts.timeFrom.split(":")[0], 10);
      var startM = parseInt(opts.timeFrom.split(":")[1], 10);
      var dur = opts.duration;
      var endM = startM + dur;
      var endH = startH + Math.floor(endM / 60);
      endM = endM % 60;

      var slot = {
        index: i + 1,
        date: new Date(d),
        startH: startH, startM: startM,
        endH: endH, endM: endM,
        available: !conflict,
        conflict: conflict,
        conflictReason: conflict ? "Rendez-vous existant (M. Bensaid)" : null,
        alternative: null
      };
      if (conflict) {
        var altD = new Date(d);
        altD.setDate(altD.getDate() + 1);
        slot.alternative = {
          date: altD,
          startH: startH, startM: startM + 15,
          endH: endH, endM: (endM + 15) % 60
        };
      }
      slots.push(slot);
    }
    return slots;
  }

  /* ── Styles (injected once) ──────────────────────────── */
  var STYLE_ID = "batch-rdv-styles";
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent = [
      "/* ── Batch RDV ── */",
      ".brdv-wrap{font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;max-width:880px;margin:0 auto}",

      /* Section glass cards */
      ".brdv-card{background:rgba(30,41,59,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(94,234,212,.12);border-radius:18px;padding:28px 32px;margin-bottom:24px;transition:box-shadow .3s}",
      ".brdv-card:hover{box-shadow:0 0 32px rgba(94,234,212,.08)}",

      /* Section title */
      ".brdv-title{font-size:22px;font-weight:700;margin:0 0 22px;display:flex;align-items:center;gap:10px}",
      ".brdv-title svg{flex-shrink:0}",
      ".brdv-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;background:linear-gradient(135deg,#5eead4,#2dd4bf);color:#0f172a;padding:3px 10px;border-radius:20px;margin-left:8px;animation:brdvPulse 2.4s infinite}",
      "@keyframes brdvPulse{0%,100%{opacity:1}50%{opacity:.7}}",

      /* Form grid */
      ".brdv-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px}",
      ".brdv-full{grid-column:1/-1}",
      ".brdv-field label{display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:6px}",
      ".brdv-field input,.brdv-field select{width:100%;box-sizing:border-box;background:rgba(15,23,42,.6);border:1px solid rgba(94,234,212,.18);border-radius:10px;color:#e2e8f0;font-size:14px;padding:10px 14px;outline:none;transition:border-color .2s,box-shadow .2s}",
      ".brdv-field input:focus,.brdv-field select:focus{border-color:#5eead4;box-shadow:0 0 0 3px rgba(94,234,212,.12)}",
      ".brdv-field select option{background:#1e293b;color:#e2e8f0}",
      ".brdv-field input[type=time]{cursor:pointer}",
      ".brdv-time-row{display:flex;align-items:center;gap:10px}",
      ".brdv-time-row span{color:#94a3b8;font-size:13px}",

      /* Day pills */
      ".brdv-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}",
      ".brdv-pill{cursor:pointer;user-select:none;font-size:13px;font-weight:600;padding:7px 16px;border-radius:22px;border:1.5px solid rgba(94,234,212,.25);background:transparent;color:#94a3b8;transition:all .22s}",
      ".brdv-pill.active{background:linear-gradient(135deg,#5eead4,#2dd4bf);color:#0f172a;border-color:transparent;box-shadow:0 0 14px rgba(94,234,212,.25)}",
      ".brdv-pill:hover:not(.active){border-color:#5eead4;color:#e2e8f0}",

      /* Big CTA */
      ".brdv-cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 0;border:none;border-radius:14px;font-size:16px;font-weight:700;letter-spacing:.6px;cursor:pointer;transition:transform .18s,box-shadow .18s}",
      ".brdv-cta-search{background:linear-gradient(135deg,#0d9488,#14b8a6);color:#f0fdfa;margin-top:8px}",
      ".brdv-cta-search:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(94,234,212,.25)}",
      ".brdv-cta-book{background:linear-gradient(135deg,#5eead4,#14b8a6,#0d9488);color:#022c22;font-size:18px;padding:20px 0;border-radius:16px;animation:brdvBookPulse 2s infinite;margin-top:12px}",
      "@keyframes brdvBookPulse{0%,100%{box-shadow:0 0 0 0 rgba(94,234,212,.35)}50%{box-shadow:0 0 0 12px rgba(94,234,212,0)}}",
      ".brdv-cta-book:hover{transform:translateY(-3px);box-shadow:0 8px 30px rgba(94,234,212,.3)}",

      /* Results section */
      ".brdv-results{overflow:hidden;transition:max-height .5s ease,opacity .5s ease;max-height:0;opacity:0}",
      ".brdv-results.visible{max-height:3000px;opacity:1}",

      /* Summary bar */
      ".brdv-summary{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}",
      ".brdv-summary-text{font-size:17px;font-weight:700}",
      ".brdv-progress{flex:1;min-width:120px;height:8px;background:rgba(15,23,42,.5);border-radius:6px;overflow:hidden}",
      ".brdv-progress-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,#5eead4,#2dd4bf);transition:width .6s ease}",

      /* Slot card */
      ".brdv-slot{display:flex;align-items:flex-start;gap:16px;background:rgba(15,23,42,.45);border:1px solid rgba(94,234,212,.1);border-radius:14px;padding:18px 20px;margin-bottom:12px;transition:border-color .25s,transform .2s}",
      ".brdv-slot:hover{border-color:rgba(94,234,212,.28);transform:translateX(4px)}",
      ".brdv-slot-num{min-width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:14px;font-weight:800;background:rgba(94,234,212,.1);color:#5eead4}",
      ".brdv-slot-icon{font-size:22px;line-height:1}",
      ".brdv-slot-body{flex:1}",
      ".brdv-slot-date{font-size:15px;font-weight:700;color:#e2e8f0}",
      ".brdv-slot-time{font-size:14px;font-weight:600;color:#5eead4;margin-top:2px}",
      ".brdv-slot-conflict{font-size:13px;color:#fb923c;margin-top:4px}",
      ".brdv-slot-alt{display:inline-block;margin-top:6px;font-size:13px;font-weight:600;color:#2dd4bf;cursor:pointer;padding:4px 12px;border-radius:8px;background:rgba(94,234,212,.08);border:1px solid rgba(94,234,212,.18);transition:background .2s}",
      ".brdv-slot-alt:hover{background:rgba(94,234,212,.18)}",

      /* Bottom summary */
      ".brdv-totals{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;margin-bottom:4px}",
      ".brdv-totals span{font-size:13px;color:#94a3b8}",
      ".brdv-totals strong{color:#e2e8f0}",
      ".brdv-link{font-size:13px;color:#5eead4;cursor:pointer;text-align:center;margin-top:8px;opacity:.8;transition:opacity .2s}",
      ".brdv-link:hover{opacity:1;text-decoration:underline}",

      /* Slide-in for each slot */
      ".brdv-slot-anim{animation:brdvSlideIn .35s ease forwards;opacity:0;transform:translateY(12px)}",
      "@keyframes brdvSlideIn{to{opacity:1;transform:translateY(0)}}",

      /* hidden helper */
      ".brdv-hidden{display:none!important}",

      /* responsive */
      "@media(max-width:640px){.brdv-grid{grid-template-columns:1fr}.brdv-card{padding:20px 16px}}"
    ].join("\n");
    document.head.appendChild(css);
  }

  /* ── Icons (inline SVG) ─────────────────────────────── */
  var ICON = {
    calendar: '<svg width="22" height="22" fill="none" stroke="#5eead4" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    search: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    book: '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="18" rx="3"/></svg>'
  };

  /* ── State ───────────────────────────────────────────── */
  var _container = null;
  var _results = null;

  /* ── Build form HTML ─────────────────────────────────── */
  function formHTML() {
    var nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay() + 1));
    var defaultDate = nextWeek.toISOString().slice(0, 10);

    return [
      '<div class="brdv-card">',
        '<h2 class="brdv-title">', ICON.calendar,
          ' Batch RDV &mdash; Smart Slot Finder',
          '<span class="brdv-badge">World First</span>',
        '</h2>',
        '<div class="brdv-grid">',

          /* Patient */
          '<div class="brdv-field"><label>Patient</label>',
            '<select id="brdv-patient">',
              '<option value="">-- Sélectionner un patient --</option>',
              '<option value="p1">Mme Leroy, Sophie</option>',
              '<option value="p2" selected>M. Bensaid, Karim</option>',
              '<option value="p3">Mme Dupont, Marie</option>',
              '<option value="p4">M. Martin, Lucas</option>',
            '</select>',
          '</div>',

          /* Nombre RDV */
          '<div class="brdv-field"><label>Nombre de RDV</label>',
            '<input type="number" id="brdv-count" value="5" min="1" max="20"/>',
          '</div>',

          /* Fréquence */
          '<div class="brdv-field"><label>Fréquence</label>',
            '<select id="brdv-freq">',
              '<option value="7" selected>Hebdomadaire (7j)</option>',
              '<option value="14">Bimensuel (14j)</option>',
              '<option value="30">Mensuel (30j)</option>',
              '<option value="custom">Personnalisé</option>',
            '</select>',
          '</div>',

          /* Custom interval */
          '<div class="brdv-field brdv-hidden" id="brdv-custom-wrap"><label>Intervalle (jours)</label>',
            '<input type="number" id="brdv-custom-days" value="10" min="1" max="90"/>',
          '</div>',

          /* Plage horaire */
          '<div class="brdv-field"><label>Plage horaire</label>',
            '<div class="brdv-time-row">',
              '<input type="time" id="brdv-from" value="14:00"/>',
              '<span>à</span>',
              '<input type="time" id="brdv-to" value="15:00"/>',
            '</div>',
          '</div>',

          /* Durée */
          '<div class="brdv-field"><label>Durée</label>',
            '<select id="brdv-dur">',
              '<option value="15">15 min</option>',
              '<option value="30">30 min</option>',
              '<option value="45" selected>45 min</option>',
              '<option value="60">60 min</option>',
              '<option value="90">90 min</option>',
            '</select>',
          '</div>',

          /* Jours préférés */
          '<div class="brdv-field brdv-full"><label>Jours préférés</label>',
            '<div class="brdv-pills">',
              '<span class="brdv-pill active" data-day="1">Lun</span>',
              '<span class="brdv-pill active" data-day="2">Mar</span>',
              '<span class="brdv-pill" data-day="3">Mer</span>',
              '<span class="brdv-pill active" data-day="4">Jeu</span>',
              '<span class="brdv-pill" data-day="5">Ven</span>',
              '<span class="brdv-pill" data-day="6">Sam</span>',
            '</div>',
          '</div>',

          /* Date de début */
          '<div class="brdv-field"><label>Date de début</label>',
            '<input type="date" id="brdv-start" value="' + defaultDate + '"/>',
          '</div>',

          '<div></div>',

          /* CTA */
          '<div class="brdv-full">',
            '<button class="brdv-cta brdv-cta-search" id="brdv-search">',
              ICON.search, ' TROUVER LES CRÉNEAUX',
            '</button>',
          '</div>',

        '</div>',
      '</div>',

      /* Results (hidden) */
      '<div class="brdv-results" id="brdv-results"></div>'
    ].join("");
  }

  /* ── Render results ──────────────────────────────────── */
  function renderResults(slots) {
    _results = slots;
    var wrap = document.getElementById("brdv-results");
    if (!wrap) return;

    var available = slots.filter(function (s) { return s.available; }).length;
    var conflicts = slots.length - available;
    var alts = slots.filter(function (s) { return s.alternative; }).length;
    var pct = Math.round((available / slots.length) * 100);

    var html = ['<div class="brdv-card">'];
    html.push('<div class="brdv-summary">');
    html.push('<span class="brdv-summary-text">' + available + '/' + slots.length + ' créneaux disponibles</span>');
    html.push('<div class="brdv-progress"><div class="brdv-progress-fill" style="width:' + pct + '%"></div></div>');
    html.push('</div>');

    slots.forEach(function (s, idx) {
      var delay = (idx * 80) + "ms";
      html.push('<div class="brdv-slot brdv-slot-anim" style="animation-delay:' + delay + '">');
      html.push('<div class="brdv-slot-num">#' + s.index + '</div>');
      html.push('<div class="brdv-slot-icon">' + (s.available ? "&#9989;" : "&#9888;&#65039;") + '</div>');
      html.push('<div class="brdv-slot-body">');
      html.push('<div class="brdv-slot-date">' + dateFR(s.date) + '</div>');
      html.push('<div class="brdv-slot-time">' + timeFR(s.startH, s.startM) + ' - ' + timeFR(s.endH, s.endM) + '</div>');
      if (s.conflict) {
        html.push('<div class="brdv-slot-conflict">Indisponible &mdash; ' + (s.conflictReason || "") + '</div>');
        if (s.alternative) {
          var a = s.alternative;
          html.push('<span class="brdv-slot-alt" data-slot="' + idx + '">&rarr; ' +
            dateFR(a.date) + " " + timeFR(a.startH, a.startM) + "-" + timeFR(a.endH, a.endM) +
            '</span>');
        }
      }
      html.push('</div></div>');
    });

    /* Totals */
    html.push('<div class="brdv-totals">');
    html.push('<span><strong>' + slots.length + '</strong> créneaux</span>');
    html.push('<span><strong>' + conflicts + '</strong> conflit' + (conflicts > 1 ? "s" : "") + '</span>');
    html.push('<span><strong>' + alts + '</strong> alternative' + (alts > 1 ? "s" : "") + '</span>');
    html.push('</div>');

    /* Book all */
    html.push('<button class="brdv-cta brdv-cta-book" id="brdv-book">');
    html.push(ICON.book + ' RÉSERVER TOUS LES CRÉNEAUX');
    html.push('</button>');
    html.push('<div class="brdv-link" id="brdv-modify">Modifier la recherche</div>');
    html.push('</div>');

    wrap.innerHTML = html.join("");

    /* Force reflow then show */
    void wrap.offsetHeight;
    wrap.classList.add("visible");

    /* Wire alternative click */
    wrap.querySelectorAll(".brdv-slot-alt").forEach(function (el) {
      el.addEventListener("click", function () {
        var i = parseInt(el.getAttribute("data-slot"), 10);
        var s = slots[i];
        if (!s || !s.alternative) return;
        s.available = true;
        s.conflict = false;
        s.date = s.alternative.date;
        s.startH = s.alternative.startH;
        s.startM = s.alternative.startM;
        s.endH = s.alternative.endH;
        s.endM = s.alternative.endM;
        s.conflictReason = null;
        s.alternative = null;
        renderResults(slots);
      });
    });

    /* Modify link */
    var modLink = document.getElementById("brdv-modify");
    if (modLink) {
      modLink.addEventListener("click", function () {
        wrap.classList.remove("visible");
        setTimeout(function () { wrap.innerHTML = ""; }, 500);
      });
    }

    /* Book all */
    var bookBtn = document.getElementById("brdv-book");
    if (bookBtn) {
      bookBtn.addEventListener("click", function () {
        bookBtn.textContent = "Réservation en cours...";
        bookBtn.disabled = true;
        /* In production, call POST /api/dentiste-pro/batch-slots/book-all */
        setTimeout(function () {
          bookBtn.style.background = "linear-gradient(135deg,#22c55e,#16a34a)";
          bookBtn.innerHTML = "&#9989; TOUS LES CRÉNEAUX RÉSERVÉS !";
          bookBtn.style.animation = "none";
        }, 1200);
      });
    }
  }

  /* ── Gather form options ─────────────────────────────── */
  function getFormOpts() {
    var freqSel = document.getElementById("brdv-freq");
    var interval = freqSel ? freqSel.value : "7";
    if (interval === "custom") {
      var cInput = document.getElementById("brdv-custom-days");
      interval = cInput ? cInput.value : "10";
    }
    return {
      patient: (document.getElementById("brdv-patient") || {}).value || "",
      count: parseInt((document.getElementById("brdv-count") || {}).value || "5", 10),
      interval: parseInt(interval, 10),
      timeFrom: (document.getElementById("brdv-from") || {}).value || "14:00",
      timeTo: (document.getElementById("brdv-to") || {}).value || "15:00",
      duration: parseInt((document.getElementById("brdv-dur") || {}).value || "45", 10),
      startDate: (document.getElementById("brdv-start") || {}).value || new Date().toISOString().slice(0, 10)
    };
  }

  /* ── Wire events ─────────────────────────────────────── */
  function wireEvents() {
    /* Day pills toggle */
    var pills = _container.querySelectorAll(".brdv-pill");
    pills.forEach(function (p) {
      p.addEventListener("click", function () { p.classList.toggle("active"); });
    });

    /* Frequency custom toggle */
    var freqSel = document.getElementById("brdv-freq");
    var customWrap = document.getElementById("brdv-custom-wrap");
    if (freqSel && customWrap) {
      freqSel.addEventListener("change", function () {
        if (freqSel.value === "custom") {
          customWrap.classList.remove("brdv-hidden");
        } else {
          customWrap.classList.add("brdv-hidden");
        }
      });
    }

    /* Search CTA */
    var searchBtn = document.getElementById("brdv-search");
    if (searchBtn) {
      searchBtn.addEventListener("click", function () {
        var opts = getFormOpts();
        /* In production: POST /api/dentiste-pro/batch-slots/find */
        var demo = buildDemoResults(opts);
        renderResults(demo);
      });
    }
  }

  /* ── Public API ──────────────────────────────────────── */
  function renderBatchRdv(container) {
    injectStyles();
    _container = typeof container === "string"
      ? document.querySelector(container)
      : container;
    if (!_container) return;
    _container.innerHTML = '<div class="brdv-wrap">' + formHTML() + '</div>';
    wireEvents();

    /* Auto-show demo results after short delay */
    setTimeout(function () {
      var opts = getFormOpts();
      var demo = buildDemoResults(opts);
      renderResults(demo);
    }, 600);
  }

  function refreshBatchRdv() {
    if (!_container) return;
    renderBatchRdv(_container);
  }

  /* ── Export ──────────────────────────────────────────── */
  if (typeof window !== "undefined") {
    window.renderBatchRdv = renderBatchRdv;
    window.refreshBatchRdv = refreshBatchRdv;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderBatchRdv: renderBatchRdv, refreshBatchRdv: refreshBatchRdv };
  }
})();
