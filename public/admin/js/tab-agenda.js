/**
 * JADOMI Dentiste Pro — Agenda Tab Module
 * Week view calendar with appointment management
 */
(function () {
  'use strict';

  window.JADOMI_PRO = window.JADOMI_PRO || {};

  // ---------------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------------
  var DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var START_HOUR = 8;
  var END_HOUR = 19;
  var TYPE_COLORS = {
    consultation: '#0d9488',
    suivi: '#3b82f6',
    urgence: '#ef4444',
    bilan: '#8b5cf6'
  };
  var TYPE_LABELS = {
    consultation: 'Consultation',
    suivi: 'Suivi',
    urgence: 'Urgence',
    bilan: 'Bilan'
  };

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var _container = null;
  var _weekOffset = 0; // 0 = current week

  // ---------------------------------------------------------------------------
  // DEMO DATA — generates appointments relative to _weekOffset
  // ---------------------------------------------------------------------------
  function getDemoAppointments(monday) {
    function d(dayIdx, h, m) {
      var dt = new Date(monday);
      dt.setDate(dt.getDate() + dayIdx);
      dt.setHours(h, m, 0, 0);
      return dt;
    }
    return [
      { id: 1, patient: 'Dr Martin', type: 'consultation', start: d(0, 14, 0), end: d(0, 14, 45), notes: 'Consultation de routine, radiographie panoramique' },
      { id: 2, patient: 'Mme Dupont', type: 'suivi', start: d(0, 15, 0), end: d(0, 15, 30), notes: 'Suivi post-extraction dent 36' },
      { id: 3, patient: 'M. Leroy', type: 'bilan', start: d(0, 9, 0), end: d(0, 10, 0), notes: 'Bilan complet + devis prothese' },
      { id: 4, patient: 'Mme Faure', type: 'consultation', start: d(1, 9, 0), end: d(1, 9, 45), notes: 'Premiere visite, bilan parodontal' },
      { id: 5, patient: 'M. Bernard', type: 'urgence', start: d(1, 11, 0), end: d(1, 11, 30), notes: 'Douleur aigue dent 24, possible pulpite' },
      { id: 6, patient: 'Mme Girard', type: 'suivi', start: d(1, 14, 0), end: d(1, 14, 30), notes: 'Controle apres detartrage' },
      { id: 7, patient: 'M. Petit', type: 'consultation', start: d(1, 16, 0), end: d(1, 16, 45), notes: 'Consultation esthetique, blanchiment' },
      { id: 8, patient: 'Mme Moreau', type: 'bilan', start: d(2, 8, 0), end: d(2, 9, 0), notes: 'Bilan annuel complet' },
      { id: 9, patient: 'M. Laurent', type: 'consultation', start: d(2, 10, 0), end: d(2, 10, 45), notes: 'Consultation carie dent 15' },
      { id: 10, patient: 'Mme Simon', type: 'suivi', start: d(2, 14, 0), end: d(2, 14, 30), notes: 'Suivi implant 46, 3 mois post-op' },
      { id: 11, patient: 'M. Michel', type: 'urgence', start: d(2, 15, 30), end: d(2, 16, 0), notes: 'Couronne descelle, dent 11' },
      { id: 12, patient: 'Mme Robert', type: 'consultation', start: d(3, 9, 0), end: d(3, 9, 45), notes: 'Devis couronne ceramique' },
      { id: 13, patient: 'M. Richard', type: 'bilan', start: d(3, 11, 0), end: d(3, 12, 0), notes: 'Bilan orthodontique complet' },
      { id: 14, patient: 'Mme Thomas', type: 'suivi', start: d(3, 14, 0), end: d(3, 14, 30), notes: 'Controle gouttieres Invisalign' },
      { id: 15, patient: 'M. Durand', type: 'consultation', start: d(3, 16, 0), end: d(3, 16, 45), notes: 'Consultation prothese amovible' },
      { id: 16, patient: 'Mme Dubois', type: 'urgence', start: d(4, 8, 30), end: d(4, 9, 0), notes: 'Abces gingival, antibiotiques' },
      { id: 17, patient: 'M. Roux', type: 'consultation', start: d(4, 10, 0), end: d(4, 10, 45), notes: 'Consultation facettes dentaires' },
      { id: 18, patient: 'Mme Lambert', type: 'suivi', start: d(4, 14, 0), end: d(4, 14, 30), notes: 'Suivi traitement parodontal' },
      { id: 19, patient: 'M. Bonnet', type: 'bilan', start: d(5, 9, 0), end: d(5, 10, 0), notes: 'Bilan complet nouvelle patiente' },
      { id: 20, patient: 'Mme Mercier', type: 'consultation', start: d(5, 10, 30), end: d(5, 11, 15), notes: 'Consultation extraction dents de sagesse' }
    ];
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function getMonday(offset) {
    var now = new Date();
    var day = now.getDay(); // 0=Sun
    var diff = now.getDate() - day + (day === 0 ? -6 : 1);
    var mon = new Date(now);
    mon.setDate(diff + (offset * 7));
    mon.setHours(0, 0, 0, 0);
    return mon;
  }

  function formatDate(d) {
    return d.getDate() + '/' + (d.getMonth() + 1);
  }

  function formatWeekLabel(monday) {
    var sun = new Date(monday);
    sun.setDate(sun.getDate() + 5);
    var months = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    return 'Semaine du ' + monday.getDate() + ' ' + months[monday.getMonth()] + ' ' + monday.getFullYear();
  }

  function isToday(date) {
    var t = new Date();
    return date.getFullYear() === t.getFullYear() && date.getMonth() === t.getMonth() && date.getDate() === t.getDate();
  }

  function minutesSinceMidnight(d) {
    return d.getHours() * 60 + d.getMinutes();
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function timeStr(d) { return pad(d.getHours()) + 'h' + pad(d.getMinutes()); }

  function durationMin(a, b) { return Math.round((b - a) / 60000); }

  // ---------------------------------------------------------------------------
  // MODAL HELPERS
  // ---------------------------------------------------------------------------
  function showModal(html, onClose) {
    var overlay = document.createElement('div');
    overlay.className = 'jadomi-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:jadomi-fadeIn .2s ease';
    var box = document.createElement('div');
    box.style.cssText = 'background:rgba(20,20,30,.92);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px 32px;max-width:480px;width:90%;color:#e5e5e5;font-family:Inter,sans-serif;box-shadow:0 24px 48px rgba(0,0,0,.4);animation:jadomi-slideUp .25s ease';
    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { close(); } });
    var closeBtn = box.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', close);
    function close() { overlay.remove(); if (onClose) onClose(); }
    return { overlay: overlay, box: box, close: close };
  }

  // ---------------------------------------------------------------------------
  // STYLES (injected once)
  // ---------------------------------------------------------------------------
  var _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var css = '\n' +
      '@keyframes jadomi-fadeIn{from{opacity:0}to{opacity:1}}\n' +
      '@keyframes jadomi-slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}\n' +
      '.ja-agenda-wrap{font-family:Inter,system-ui,sans-serif;color:#e5e5e5}\n' +
      '.ja-agenda-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}\n' +
      '.ja-agenda-nav button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#e5e5e5;padding:8px 18px;border-radius:10px;cursor:pointer;font-size:14px;font-family:Inter,sans-serif;transition:all .2s}\n' +
      '.ja-agenda-nav button:hover{background:rgba(13,148,136,.25);border-color:#0d9488}\n' +
      '.ja-agenda-nav .ja-week-label{font-size:16px;font-weight:600;color:#fff}\n' +
      '.ja-grid-scroll{overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,.06)}\n' +
      '.ja-grid{display:grid;grid-template-columns:60px repeat(6,1fr);min-width:720px}\n' +
      '.ja-grid-header{background:rgba(255,255,255,.04);padding:10px 6px;text-align:center;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid rgba(255,255,255,.06);color:#a3a3a3}\n' +
      '.ja-grid-header.ja-today-col{color:#0d9488;background:rgba(13,148,136,.08)}\n' +
      '.ja-time-label{padding:4px 6px;font-size:11px;color:#737373;text-align:right;border-bottom:1px solid rgba(255,255,255,.03);display:flex;align-items:flex-start;justify-content:flex-end}\n' +
      '.ja-cell{position:relative;border-bottom:1px solid rgba(255,255,255,.03);border-left:1px solid rgba(255,255,255,.03);min-height:48px;cursor:pointer;transition:background .15s}\n' +
      '.ja-cell:hover{background:rgba(255,255,255,.02)}\n' +
      '.ja-cell.ja-today-col{background:rgba(13,148,136,.03)}\n' +
      '.ja-cell.ja-today-col:hover{background:rgba(13,148,136,.07)}\n' +
      '.ja-appt{position:absolute;left:3px;right:3px;border-radius:6px;padding:4px 7px;font-size:11px;line-height:1.3;overflow:hidden;cursor:pointer;z-index:2;transition:transform .15s,box-shadow .15s;border:1px solid rgba(255,255,255,.1)}\n' +
      '.ja-appt:hover{transform:scale(1.03);box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:3}\n' +
      '.ja-appt-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n' +
      '.ja-appt-time{opacity:.8;font-size:10px}\n' +
      '.ja-legend{display:flex;gap:16px;margin-top:12px;flex-wrap:wrap}\n' +
      '.ja-legend-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#a3a3a3}\n' +
      '.ja-legend-dot{width:10px;height:10px;border-radius:3px}\n' +
      '.ja-modal-title{font-size:18px;font-weight:700;margin-bottom:16px;color:#fff}\n' +
      '.ja-modal-field{margin-bottom:12px}\n' +
      '.ja-modal-field label{display:block;font-size:12px;color:#a3a3a3;margin-bottom:4px}\n' +
      '.ja-modal-field .val{font-size:14px;color:#e5e5e5}\n' +
      '.ja-modal-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box}\n' +
      '.ja-modal-input:focus{outline:none;border-color:#0d9488}\n' +
      '.ja-modal-select{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;appearance:none;box-sizing:border-box}\n' +
      '.ja-btn-primary{background:#0d9488;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s}\n' +
      '.ja-btn-primary:hover{background:#0f766e}\n' +
      '.ja-btn-ghost{background:transparent;color:#a3a3a3;border:1px solid rgba(255,255,255,.08);padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-ghost:hover{color:#e5e5e5;border-color:rgba(255,255,255,.2)}\n';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function renderAgenda(container) {
    _container = container;
    injectStyles();
    draw();
  }

  function refreshAgenda() {
    if (_container) draw();
  }

  function draw() {
    var monday = getMonday(_weekOffset);
    var appointments = getDemoAppointments(monday);

    // Build day dates
    var dayDates = [];
    for (var i = 0; i < 6; i++) {
      var dd = new Date(monday);
      dd.setDate(dd.getDate() + i);
      dayDates.push(dd);
    }

    var html = '<div class="ja-agenda-wrap">';

    // Navigation
    html += '<div class="ja-agenda-nav">';
    html += '<div style="display:flex;gap:8px">';
    html += '<button id="ja-prev-week">&larr; Semaine precedente</button>';
    html += '<button id="ja-today-btn">Aujourd\'hui</button>';
    html += '</div>';
    html += '<span class="ja-week-label">' + formatWeekLabel(monday) + '</span>';
    html += '<div style="display:flex;gap:8px">';
    html += '<button id="ja-next-week">Semaine suivante &rarr;</button>';
    html += '<button id="ja-batch-btn" style="background:rgba(13,148,136,.15);border-color:#0d9488;color:#0d9488">Batch RDV</button>';
    html += '</div>';
    html += '</div>';

    // Grid
    html += '<div class="ja-grid-scroll"><div class="ja-grid">';

    // Header row
    html += '<div class="ja-grid-header" style="color:#525252"></div>';
    for (var d = 0; d < 6; d++) {
      var todayClass = isToday(dayDates[d]) ? ' ja-today-col' : '';
      html += '<div class="ja-grid-header' + todayClass + '">' + DAYS[d] + ' ' + formatDate(dayDates[d]) + '</div>';
    }

    // Hour rows
    for (var h = START_HOUR; h < END_HOUR; h++) {
      html += '<div class="ja-time-label">' + pad(h) + ':00</div>';
      for (var d2 = 0; d2 < 6; d2++) {
        var todayCls = isToday(dayDates[d2]) ? ' ja-today-col' : '';
        html += '<div class="ja-cell' + todayCls + '" data-day="' + d2 + '" data-hour="' + h + '"></div>';
      }
    }

    html += '</div></div>';

    // Legend
    html += '<div class="ja-legend">';
    var types = ['consultation', 'suivi', 'urgence', 'bilan'];
    for (var t = 0; t < types.length; t++) {
      html += '<div class="ja-legend-item"><div class="ja-legend-dot" style="background:' + TYPE_COLORS[types[t]] + '"></div>' + TYPE_LABELS[types[t]] + '</div>';
    }
    html += '</div>';

    html += '</div>';

    _container.innerHTML = html;

    // Place appointments on grid
    placeAppointments(appointments, monday);

    // Events
    document.getElementById('ja-prev-week').addEventListener('click', function () { _weekOffset--; draw(); });
    document.getElementById('ja-next-week').addEventListener('click', function () { _weekOffset++; draw(); });
    document.getElementById('ja-today-btn').addEventListener('click', function () { _weekOffset = 0; draw(); });
    document.getElementById('ja-batch-btn').addEventListener('click', function () {
      if (window.JADOMI_PRO.switchTab) window.JADOMI_PRO.switchTab('batch');
    });

    // Click on empty cell → quick add
    var cells = _container.querySelectorAll('.ja-cell');
    for (var c = 0; c < cells.length; c++) {
      cells[c].addEventListener('click', function (e) {
        if (e.target.closest('.ja-appt')) return;
        var dayIdx = parseInt(this.getAttribute('data-day'));
        var hour = parseInt(this.getAttribute('data-hour'));
        showAddModal(dayIdx, hour, monday);
      });
    }
  }

  function placeAppointments(appointments, monday) {
    var cells = _container.querySelectorAll('.ja-cell');
    var cellMap = {};
    for (var c = 0; c < cells.length; c++) {
      var key = cells[c].getAttribute('data-day') + '-' + cells[c].getAttribute('data-hour');
      cellMap[key] = cells[c];
    }

    for (var i = 0; i < appointments.length; i++) {
      var apt = appointments[i];
      var dayIdx = Math.round((new Date(apt.start.getFullYear(), apt.start.getMonth(), apt.start.getDate()) - monday) / 86400000);
      if (dayIdx < 0 || dayIdx > 5) continue;

      var startMin = minutesSinceMidnight(apt.start);
      var endMin = minutesSinceMidnight(apt.end);
      var startHour = Math.floor(startMin / 60);
      if (startHour < START_HOUR || startHour >= END_HOUR) continue;

      var cell = cellMap[dayIdx + '-' + startHour];
      if (!cell) continue;

      var cellH = 48; // min-height of cell
      var offsetInHour = (startMin - startHour * 60) / 60 * cellH;
      var height = Math.max(20, (endMin - startMin) / 60 * cellH);
      var color = TYPE_COLORS[apt.type] || '#666';

      var el = document.createElement('div');
      el.className = 'ja-appt';
      el.style.cssText = 'top:' + offsetInHour + 'px;height:' + height + 'px;background:' + color + '22;border-left:3px solid ' + color + ';color:' + color;
      el.innerHTML = '<div class="ja-appt-name">' + apt.patient + '</div><div class="ja-appt-time">' + timeStr(apt.start) + ' - ' + timeStr(apt.end) + '</div>';
      el.addEventListener('click', (function (a) {
        return function (e) { e.stopPropagation(); showDetailModal(a); };
      })(apt));
      cell.appendChild(el);
    }
  }

  // ---------------------------------------------------------------------------
  // MODALS
  // ---------------------------------------------------------------------------
  function showDetailModal(apt) {
    var color = TYPE_COLORS[apt.type] || '#666';
    var dur = durationMin(apt.start, apt.end);
    var html = '' +
      '<div class="ja-modal-title" style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:12px;height:12px;border-radius:4px;background:' + color + ';display:inline-block"></span>' +
        apt.patient +
      '</div>' +
      '<div class="ja-modal-field"><label>Type</label><div class="val" style="color:' + color + '">' + TYPE_LABELS[apt.type] + '</div></div>' +
      '<div class="ja-modal-field"><label>Horaire</label><div class="val">' + timeStr(apt.start) + ' - ' + timeStr(apt.end) + ' (' + dur + ' min)</div></div>' +
      '<div class="ja-modal-field"><label>Notes</label><div class="val">' + (apt.notes || '—') + '</div></div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Fermer</button>' +
      '</div>';
    showModal(html);
  }

  function showAddModal(dayIdx, hour, monday) {
    var dayDate = new Date(monday);
    dayDate.setDate(dayDate.getDate() + dayIdx);
    var dateStr = DAYS[dayIdx] + ' ' + formatDate(dayDate);

    var html = '' +
      '<div class="ja-modal-title">Nouveau rendez-vous</div>' +
      '<div class="ja-modal-field"><label>Jour</label><div class="val">' + dateStr + '</div></div>' +
      '<div class="ja-modal-field"><label>Patient</label><input class="ja-modal-input" id="ja-add-patient" placeholder="Nom du patient"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Debut</label><input class="ja-modal-input" id="ja-add-start" type="time" value="' + pad(hour) + ':00"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Fin</label><input class="ja-modal-input" id="ja-add-end" type="time" value="' + pad(hour) + ':45"></div>' +
      '</div>' +
      '<div class="ja-modal-field"><label>Type</label><select class="ja-modal-select" id="ja-add-type">' +
        '<option value="consultation">Consultation</option><option value="suivi">Suivi</option><option value="urgence">Urgence</option><option value="bilan">Bilan</option>' +
      '</select></div>' +
      '<div class="ja-modal-field"><label>Notes</label><input class="ja-modal-input" id="ja-add-notes" placeholder="Notes..."></div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Annuler</button>' +
        '<button class="ja-btn-primary" id="ja-add-save">Enregistrer</button>' +
      '</div>';

    var m = showModal(html);
    var saveBtn = m.box.querySelector('#ja-add-save');
    saveBtn.addEventListener('click', function () {
      // In production this would POST to the API
      m.close();
      // Placeholder: show confirmation
    });
  }

  // ---------------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------------
  window.JADOMI_PRO.renderAgenda = renderAgenda;
  window.JADOMI_PRO.refreshAgenda = refreshAgenda;

  // Also expose as globals for convenience
  window.renderAgenda = renderAgenda;
  window.refreshAgenda = refreshAgenda;

})();
