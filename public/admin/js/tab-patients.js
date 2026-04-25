/**
 * JADOMI Dentiste Pro — Patients Tab Module
 * Patient list with search, detail panels, and add patient modal
 */
(function () {
  'use strict';

  window.JADOMI_PRO = window.JADOMI_PRO || {};

  // ---------------------------------------------------------------------------
  // DEMO DATA
  // ---------------------------------------------------------------------------
  var PATIENTS = [
    { id: 1, nom: 'Martin', prenom: 'Jean-Pierre', tel: '06 12 34 56 78', email: 'jp.martin@email.fr', dateNaissance: '1965-03-14', derniereVisite: daysAgo(2), nbRdv: 12, serieActive: { nom: 'Soins parodontaux', progression: 60, total: 5, faits: 3 }, messagesNonLus: 2, documents: ['Radio panoramique 03/2026', 'Devis couronne 46'] },
    { id: 2, nom: 'Dupont', prenom: 'Marie', tel: '06 23 45 67 89', email: 'marie.dupont@email.fr', dateNaissance: '1978-07-22', derniereVisite: daysAgo(5), nbRdv: 8, serieActive: null, messagesNonLus: 0, documents: ['Bilan complet 01/2026'] },
    { id: 3, nom: 'Leroy', prenom: 'Antoine', tel: '06 34 56 78 90', email: 'a.leroy@email.fr', dateNaissance: '1982-11-03', derniereVisite: daysAgo(1), nbRdv: 15, serieActive: { nom: 'Traitement Invisalign', progression: 40, total: 10, faits: 4 }, messagesNonLus: 1, documents: ['Photos intra-orales', 'Plan traitement ortho'] },
    { id: 4, nom: 'Faure', prenom: 'Isabelle', tel: '06 45 67 89 01', email: 'i.faure@email.fr', dateNaissance: '1990-01-18', derniereVisite: daysAgo(14), nbRdv: 4, serieActive: null, messagesNonLus: 0, documents: [] },
    { id: 5, nom: 'Bernard', prenom: 'Philippe', tel: '06 56 78 90 12', email: 'p.bernard@email.fr', dateNaissance: '1955-09-30', derniereVisite: daysAgo(0), nbRdv: 22, serieActive: { nom: 'Prothese complete', progression: 80, total: 5, faits: 4 }, messagesNonLus: 3, documents: ['Radio retro-alveolaire', 'Empreintes numeriques', 'Devis prothese'] },
    { id: 6, nom: 'Girard', prenom: 'Sophie', tel: '06 67 89 01 23', email: 's.girard@email.fr', dateNaissance: '1988-04-12', derniereVisite: daysAgo(7), nbRdv: 6, serieActive: null, messagesNonLus: 0, documents: ['Bilan paro 11/2025'] },
    { id: 7, nom: 'Petit', prenom: 'Lucas', tel: '06 78 90 12 34', email: 'l.petit@email.fr', dateNaissance: '1995-12-05', derniereVisite: daysAgo(21), nbRdv: 3, serieActive: null, messagesNonLus: 1, documents: [] },
    { id: 8, nom: 'Moreau', prenom: 'Catherine', tel: '06 89 01 23 45', email: 'c.moreau@email.fr', dateNaissance: '1972-06-28', derniereVisite: daysAgo(3), nbRdv: 18, serieActive: { nom: 'Blanchiment ambulatoire', progression: 50, total: 4, faits: 2 }, messagesNonLus: 0, documents: ['Photos avant/apres', 'Protocole blanchiment'] },
    { id: 9, nom: 'Laurent', prenom: 'Nicolas', tel: '06 90 12 34 56', email: 'n.laurent@email.fr', dateNaissance: '1980-02-14', derniereVisite: daysAgo(10), nbRdv: 9, serieActive: null, messagesNonLus: 0, documents: ['Radio panoramique 09/2025'] },
    { id: 10, nom: 'Simon', prenom: 'Elise', tel: '07 01 23 45 67', email: 'e.simon@email.fr', dateNaissance: '1993-08-19', derniereVisite: daysAgo(4), nbRdv: 7, serieActive: { nom: 'Implant 46', progression: 33, total: 3, faits: 1 }, messagesNonLus: 0, documents: ['Scanner CBCT', 'Plan implantaire'] },
    { id: 11, nom: 'Michel', prenom: 'Francois', tel: '07 12 34 56 78', email: 'f.michel@email.fr', dateNaissance: '1960-10-07', derniereVisite: daysAgo(30), nbRdv: 25, serieActive: null, messagesNonLus: 0, documents: ['Historique complet'] },
    { id: 12, nom: 'Robert', prenom: 'Amelie', tel: '07 23 45 67 89', email: 'a.robert@email.fr', dateNaissance: '1985-05-23', derniereVisite: daysAgo(6), nbRdv: 11, serieActive: null, messagesNonLus: 2, documents: ['Devis couronnes 14-15'] },
    { id: 13, nom: 'Thomas', prenom: 'Valerie', tel: '07 34 56 78 90', email: 'v.thomas@email.fr', dateNaissance: '1975-03-31', derniereVisite: daysAgo(12), nbRdv: 5, serieActive: null, messagesNonLus: 0, documents: [] },
    { id: 14, nom: 'Durand', prenom: 'Marc', tel: '07 45 67 89 01', email: 'm.durand@email.fr', dateNaissance: '1968-11-15', derniereVisite: daysAgo(8), nbRdv: 14, serieActive: { nom: 'Bridge ceramique', progression: 66, total: 3, faits: 2 }, messagesNonLus: 0, documents: ['Empreintes', 'Essayage biscuit'] },
    { id: 15, nom: 'Dubois', prenom: 'Nathalie', tel: '07 56 78 90 12', email: 'n.dubois@email.fr', dateNaissance: '1992-07-09', derniereVisite: daysAgo(1), nbRdv: 6, serieActive: null, messagesNonLus: 1, documents: ['Radio retro 21'] }
  ];

  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(10, 0, 0, 0);
    return d;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  var AVATAR_COLORS = ['#0d9488', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#10b981', '#6366f1'];

  function avatarColor(name) {
    var code = name.charCodeAt(0) || 65;
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
  }

  function initials(nom, prenom) {
    return ((prenom || '').charAt(0) + (nom || '').charAt(0)).toUpperCase();
  }

  function relativeDate(d) {
    if (!d) return '—';
    var now = new Date();
    var diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    if (diff < 7) return 'Il y a ' + diff + ' jours';
    if (diff < 30) return 'Il y a ' + Math.floor(diff / 7) + ' sem.';
    return 'Il y a ' + Math.floor(diff / 30) + ' mois';
  }

  function formatDateFr(d) {
    if (!d) return '—';
    var dd = (typeof d === 'string') ? new Date(d) : d;
    return pad(dd.getDate()) + '/' + pad(dd.getMonth() + 1) + '/' + dd.getFullYear();
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------------------------------------------------------------------------
  // MODAL HELPER (shared with agenda but safe to re-declare)
  // ---------------------------------------------------------------------------
  function showModal(html, onClose) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:jadomi-fadeIn .2s ease';
    var box = document.createElement('div');
    box.style.cssText = 'background:rgba(20,20,30,.92);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px 32px;max-width:520px;width:90%;color:#e5e5e5;font-family:Inter,sans-serif;box-shadow:0 24px 48px rgba(0,0,0,.4);animation:jadomi-slideUp .25s ease;max-height:85vh;overflow-y:auto';
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
  // STYLES
  // ---------------------------------------------------------------------------
  var _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var css = '\n' +
      '@keyframes jadomi-fadeIn{from{opacity:0}to{opacity:1}}\n' +
      '@keyframes jadomi-slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}\n' +
      '.ja-patients-wrap{font-family:Inter,system-ui,sans-serif;color:#e5e5e5}\n' +
      '.ja-patients-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}\n' +
      '.ja-search-box{flex:1;min-width:200px;position:relative}\n' +
      '.ja-search-box input{width:100%;padding:10px 14px 10px 38px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box;transition:border-color .2s}\n' +
      '.ja-search-box input:focus{outline:none;border-color:#0d9488}\n' +
      '.ja-search-box svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:.4}\n' +
      '.ja-add-patient-btn{background:#0d9488;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s;white-space:nowrap}\n' +
      '.ja-add-patient-btn:hover{background:#0f766e}\n' +
      '.ja-patient-card{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);margin-bottom:8px;cursor:pointer;transition:all .2s}\n' +
      '.ja-patient-card:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1);transform:translateX(2px)}\n' +
      '.ja-patient-card.expanded{border-color:rgba(13,148,136,.3);background:rgba(13,148,136,.04)}\n' +
      '.ja-avatar{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0}\n' +
      '.ja-patient-info{flex:1;min-width:0}\n' +
      '.ja-patient-name{font-weight:600;font-size:14px;color:#fff}\n' +
      '.ja-patient-sub{font-size:12px;color:#737373;margin-top:2px}\n' +
      '.ja-patient-meta{display:flex;gap:10px;align-items:center;flex-shrink:0}\n' +
      '.ja-badge{font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600}\n' +
      '.ja-badge-serie{background:rgba(139,92,246,.15);color:#a78bfa}\n' +
      '.ja-badge-msg{background:rgba(239,68,68,.15);color:#ef4444}\n' +
      '.ja-patient-rdv-count{font-size:12px;color:#525252}\n' +
      '.ja-detail-panel{padding:16px 16px 16px 72px;animation:jadomi-slideUp .2s ease}\n' +
      '.ja-detail-section{margin-bottom:16px}\n' +
      '.ja-detail-section h4{font-size:13px;font-weight:600;color:#a3a3a3;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px}\n' +
      '.ja-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}\n' +
      '.ja-detail-item{font-size:13px}\n' +
      '.ja-detail-item label{color:#525252;font-size:11px;display:block}\n' +
      '.ja-detail-item span{color:#d4d4d4}\n' +
      '.ja-progress-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:4px}\n' +
      '.ja-progress-fill{height:100%;border-radius:3px;transition:width .3s ease}\n' +
      '.ja-doc-list{list-style:none;padding:0;margin:0}\n' +
      '.ja-doc-list li{font-size:12px;color:#a3a3a3;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03)}\n' +
      '.ja-doc-list li:last-child{border-bottom:none}\n' +
      '.ja-pagination{display:flex;justify-content:center;gap:8px;margin-top:16px}\n' +
      '.ja-pagination button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.06);color:#a3a3a3;width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:13px;font-family:Inter,sans-serif;transition:all .2s}\n' +
      '.ja-pagination button:hover,.ja-pagination button.active{background:rgba(13,148,136,.2);color:#0d9488;border-color:#0d9488}\n' +
      '.ja-modal-title{font-size:18px;font-weight:700;margin-bottom:16px;color:#fff}\n' +
      '.ja-modal-field{margin-bottom:12px}\n' +
      '.ja-modal-field label{display:block;font-size:12px;color:#a3a3a3;margin-bottom:4px}\n' +
      '.ja-modal-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box}\n' +
      '.ja-modal-input:focus{outline:none;border-color:#0d9488}\n' +
      '.ja-btn-primary{background:#0d9488;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s}\n' +
      '.ja-btn-primary:hover{background:#0f766e}\n' +
      '.ja-btn-ghost{background:transparent;color:#a3a3a3;border:1px solid rgba(255,255,255,.08);padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-ghost:hover{color:#e5e5e5;border-color:rgba(255,255,255,.2)}\n' +
      '.ja-empty{text-align:center;padding:40px;color:#525252;font-size:14px}\n';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var _container = null;
  var _searchTerm = '';
  var _expandedId = null;
  var _page = 1;
  var PER_PAGE = 8;

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function renderPatients(container) {
    _container = container;
    injectStyles();
    draw();
  }

  function refreshPatients() {
    if (_container) draw();
  }

  function draw() {
    var filtered = PATIENTS.filter(function (p) {
      if (!_searchTerm) return true;
      var q = _searchTerm.toLowerCase();
      return (p.nom + ' ' + p.prenom + ' ' + p.tel).toLowerCase().indexOf(q) !== -1;
    });

    var totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (_page > totalPages) _page = totalPages;
    var start = (_page - 1) * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    var html = '<div class="ja-patients-wrap">';

    // Toolbar
    html += '<div class="ja-patients-toolbar">';
    html += '<div class="ja-search-box">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
    html += '<input id="ja-patient-search" type="text" placeholder="Rechercher un patient..." value="' + escHtml(_searchTerm) + '">';
    html += '</div>';
    html += '<button class="ja-add-patient-btn" id="ja-add-patient-btn">+ Ajouter un patient</button>';
    html += '</div>';

    // Stats bar
    html += '<div style="font-size:12px;color:#525252;margin-bottom:12px">' + filtered.length + ' patient' + (filtered.length > 1 ? 's' : '') + ' trouves</div>';

    // Patient list
    if (pageItems.length === 0) {
      html += '<div class="ja-empty">Aucun patient trouve</div>';
    } else {
      for (var i = 0; i < pageItems.length; i++) {
        var p = pageItems[i];
        var expanded = _expandedId === p.id;
        var col = avatarColor(p.nom);

        html += '<div class="ja-patient-card' + (expanded ? ' expanded' : '') + '" data-pid="' + p.id + '">';
        html += '<div class="ja-avatar" style="background:' + col + '22;color:' + col + '">' + initials(p.nom, p.prenom) + '</div>';
        html += '<div class="ja-patient-info">';
        html += '<div class="ja-patient-name">' + escHtml(p.prenom) + ' ' + escHtml(p.nom) + '</div>';
        html += '<div class="ja-patient-sub">' + escHtml(p.tel) + ' &middot; Derniere visite : ' + relativeDate(p.derniereVisite) + '</div>';
        html += '</div>';
        html += '<div class="ja-patient-meta">';
        if (p.serieActive) {
          html += '<span class="ja-badge ja-badge-serie">' + p.serieActive.faits + '/' + p.serieActive.total + ' seances</span>';
        }
        if (p.messagesNonLus > 0) {
          html += '<span class="ja-badge ja-badge-msg">' + p.messagesNonLus + ' msg</span>';
        }
        html += '<span class="ja-patient-rdv-count">' + p.nbRdv + ' RDV</span>';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.3;transition:transform .2s;transform:rotate(' + (expanded ? '90' : '0') + 'deg)"><path d="M9 18l6-6-6-6"/></svg>';
        html += '</div>';
        html += '</div>';

        // Detail panel
        if (expanded) {
          html += buildDetailPanel(p);
        }
      }
    }

    // Pagination
    if (totalPages > 1) {
      html += '<div class="ja-pagination">';
      for (var pg = 1; pg <= totalPages; pg++) {
        html += '<button data-page="' + pg + '"' + (pg === _page ? ' class="active"' : '') + '>' + pg + '</button>';
      }
      html += '</div>';
    }

    html += '</div>';

    _container.innerHTML = html;

    // Events
    var searchInput = document.getElementById('ja-patient-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        _searchTerm = this.value;
        _page = 1;
        _expandedId = null;
        draw();
        // Re-focus and set cursor position
        var inp = document.getElementById('ja-patient-search');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      });
    }

    document.getElementById('ja-add-patient-btn').addEventListener('click', showAddPatientModal);

    var cards = _container.querySelectorAll('.ja-patient-card');
    for (var c = 0; c < cards.length; c++) {
      cards[c].addEventListener('click', function () {
        var pid = parseInt(this.getAttribute('data-pid'));
        _expandedId = (_expandedId === pid) ? null : pid;
        draw();
      });
    }

    var pageButtons = _container.querySelectorAll('.ja-pagination button');
    for (var pb = 0; pb < pageButtons.length; pb++) {
      pageButtons[pb].addEventListener('click', function () {
        _page = parseInt(this.getAttribute('data-page'));
        draw();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // DETAIL PANEL
  // ---------------------------------------------------------------------------
  function buildDetailPanel(p) {
    var html = '<div class="ja-detail-panel">';

    // Contact info
    html += '<div class="ja-detail-section">';
    html += '<h4>Informations</h4>';
    html += '<div class="ja-detail-grid">';
    html += '<div class="ja-detail-item"><label>Email</label><span>' + escHtml(p.email) + '</span></div>';
    html += '<div class="ja-detail-item"><label>Telephone</label><span>' + escHtml(p.tel) + '</span></div>';
    html += '<div class="ja-detail-item"><label>Date de naissance</label><span>' + formatDateFr(p.dateNaissance) + '</span></div>';
    html += '<div class="ja-detail-item"><label>Total RDV</label><span>' + p.nbRdv + ' rendez-vous</span></div>';
    html += '</div></div>';

    // Active series
    if (p.serieActive) {
      html += '<div class="ja-detail-section">';
      html += '<h4>Serie en cours</h4>';
      html += '<div style="font-size:13px;color:#d4d4d4;margin-bottom:6px">' + escHtml(p.serieActive.nom) + ' &mdash; ' + p.serieActive.faits + '/' + p.serieActive.total + ' seances</div>';
      html += '<div class="ja-progress-bar"><div class="ja-progress-fill" style="width:' + p.serieActive.progression + '%;background:#8b5cf6"></div></div>';
      html += '</div>';
    }

    // Appointment history (mock)
    html += '<div class="ja-detail-section">';
    html += '<h4>Derniers rendez-vous</h4>';
    var histTypes = ['Consultation', 'Suivi', 'Bilan', 'Consultation', 'Suivi'];
    for (var h = 0; h < Math.min(3, p.nbRdv); h++) {
      var histDate = new Date(p.derniereVisite);
      histDate.setDate(histDate.getDate() - (h * 14));
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px">';
      html += '<span style="color:#a3a3a3">' + formatDateFr(histDate) + '</span>';
      html += '<span style="color:#d4d4d4">' + histTypes[h % histTypes.length] + '</span>';
      html += '</div>';
    }
    html += '</div>';

    // Chat messages preview
    if (p.messagesNonLus > 0) {
      html += '<div class="ja-detail-section">';
      html += '<h4>Messages recents</h4>';
      html += '<div style="font-size:12px;color:#a3a3a3;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;border-left:3px solid #ef4444">';
      html += p.messagesNonLus + ' message' + (p.messagesNonLus > 1 ? 's' : '') + ' non lu' + (p.messagesNonLus > 1 ? 's' : '');
      html += '</div></div>';
    }

    // Documents
    if (p.documents && p.documents.length > 0) {
      html += '<div class="ja-detail-section">';
      html += '<h4>Documents</h4>';
      html += '<ul class="ja-doc-list">';
      for (var d = 0; d < p.documents.length; d++) {
        html += '<li>' + escHtml(p.documents[d]) + '</li>';
      }
      html += '</ul></div>';
    }

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // ADD PATIENT MODAL
  // ---------------------------------------------------------------------------
  function showAddPatientModal() {
    var html = '' +
      '<div class="ja-modal-title">Ajouter un patient</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Nom</label><input class="ja-modal-input" id="ja-np-nom" placeholder="Nom"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Prenom</label><input class="ja-modal-input" id="ja-np-prenom" placeholder="Prenom"></div>' +
      '</div>' +
      '<div class="ja-modal-field"><label>Telephone</label><input class="ja-modal-input" id="ja-np-tel" placeholder="06 XX XX XX XX"></div>' +
      '<div class="ja-modal-field"><label>Email</label><input class="ja-modal-input" id="ja-np-email" type="email" placeholder="email@exemple.fr"></div>' +
      '<div class="ja-modal-field"><label>Date de naissance</label><input class="ja-modal-input" id="ja-np-dob" type="date"></div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Annuler</button>' +
        '<button class="ja-btn-primary" id="ja-np-save">Enregistrer</button>' +
      '</div>';

    var m = showModal(html);
    m.box.querySelector('#ja-np-save').addEventListener('click', function () {
      var nom = m.box.querySelector('#ja-np-nom').value.trim();
      var prenom = m.box.querySelector('#ja-np-prenom').value.trim();
      if (!nom || !prenom) { m.box.querySelector('#ja-np-nom').style.borderColor = '#ef4444'; return; }

      PATIENTS.unshift({
        id: Date.now(),
        nom: nom,
        prenom: prenom,
        tel: m.box.querySelector('#ja-np-tel').value.trim() || '—',
        email: m.box.querySelector('#ja-np-email').value.trim() || '—',
        dateNaissance: m.box.querySelector('#ja-np-dob').value || null,
        derniereVisite: null,
        nbRdv: 0,
        serieActive: null,
        messagesNonLus: 0,
        documents: []
      });
      m.close();
      _page = 1;
      _searchTerm = '';
      draw();
    });
  }

  // ---------------------------------------------------------------------------
  // UTILS
  // ---------------------------------------------------------------------------
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------------
  window.JADOMI_PRO.renderPatients = renderPatients;
  window.JADOMI_PRO.refreshPatients = refreshPatients;

  window.renderPatients = renderPatients;
  window.refreshPatients = refreshPatients;

})();
