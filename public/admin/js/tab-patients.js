/**
 * JADOMI Dentiste Pro — Patients Tab Module
 * Patient list with search, detail panels, and add patient modal
 * Branche sur l'API reelle /api/dentiste-pro/patients
 */
(function () {
  'use strict';

  window.JADOMI_PRO = window.JADOMI_PRO || {};

  // ---------------------------------------------------------------------------
  // API CONFIG
  // ---------------------------------------------------------------------------
  var API_BASE = '/api/dentiste-pro/patients';

  function getToken() {
    return localStorage.getItem('supabase_token') || localStorage.getItem('sb-access-token') || '';
  }

  function getSocieteId() {
    return localStorage.getItem('selectedSocieteId') || '';
  }

  function apiHeaders(json) {
    var h = {
      'Authorization': 'Bearer ' + getToken(),
      'X-Societe-Id': getSocieteId()
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  // ---------------------------------------------------------------------------
  // DEMO FALLBACK DATA
  // ---------------------------------------------------------------------------
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(10, 0, 0, 0);
    return d;
  }

  var DEMO_PATIENTS = [
    { id: 1, pat_id: 'PAT-DEMO-001', nom: 'Martin', prenom: 'Jean-Pierre', telephone: '06 12 34 56 78', email: 'jp.martin@email.fr', date_naissance: '1965-03-14', derniere_visite: daysAgo(2).toISOString(), statut: 'actif' },
    { id: 2, pat_id: 'PAT-DEMO-002', nom: 'Dupont', prenom: 'Marie', telephone: '06 23 45 67 89', email: 'marie.dupont@email.fr', date_naissance: '1978-07-22', derniere_visite: daysAgo(5).toISOString(), statut: 'actif' },
    { id: 3, pat_id: 'PAT-DEMO-003', nom: 'Leroy', prenom: 'Antoine', telephone: '06 34 56 78 90', email: 'a.leroy@email.fr', date_naissance: '1982-11-03', derniere_visite: daysAgo(1).toISOString(), statut: 'actif' },
    { id: 4, pat_id: 'PAT-DEMO-004', nom: 'Faure', prenom: 'Isabelle', telephone: '06 45 67 89 01', email: 'i.faure@email.fr', date_naissance: '1990-01-18', derniere_visite: daysAgo(14).toISOString(), statut: 'actif' },
    { id: 5, pat_id: 'PAT-DEMO-005', nom: 'Bernard', prenom: 'Philippe', telephone: '06 56 78 90 12', email: 'p.bernard@email.fr', date_naissance: '1955-09-30', derniere_visite: daysAgo(0).toISOString(), statut: 'actif' },
    { id: 6, pat_id: 'PAT-DEMO-006', nom: 'Girard', prenom: 'Sophie', telephone: '06 67 89 01 23', email: 's.girard@email.fr', date_naissance: '1988-04-12', derniere_visite: daysAgo(7).toISOString(), statut: 'actif' },
    { id: 7, pat_id: 'PAT-DEMO-007', nom: 'Petit', prenom: 'Lucas', telephone: '06 78 90 12 34', email: 'l.petit@email.fr', date_naissance: '1995-12-05', derniere_visite: daysAgo(21).toISOString(), statut: 'actif' },
    { id: 8, pat_id: 'PAT-DEMO-008', nom: 'Moreau', prenom: 'Catherine', telephone: '06 89 01 23 45', email: 'c.moreau@email.fr', date_naissance: '1972-06-28', derniere_visite: daysAgo(3).toISOString(), statut: 'actif' }
  ];

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  var AVATAR_COLORS = ['#0d9488', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#10b981', '#6366f1'];

  function avatarColor(name) {
    var code = (name || 'A').charCodeAt(0) || 65;
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
  }

  function initials(nom, prenom) {
    return ((prenom || '').charAt(0) + (nom || '').charAt(0)).toUpperCase();
  }

  function relativeDate(d) {
    if (!d) return '\u2014';
    var date = (typeof d === 'string') ? new Date(d) : d;
    if (isNaN(date.getTime())) return '\u2014';
    var now = new Date();
    var diff = Math.floor((now - date) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    if (diff < 7) return 'Il y a ' + diff + ' jours';
    if (diff < 30) return 'Il y a ' + Math.floor(diff / 7) + ' sem.';
    return 'Il y a ' + Math.floor(diff / 30) + ' mois';
  }

  function formatDateFr(d) {
    if (!d) return '\u2014';
    var dd = (typeof d === 'string') ? new Date(d) : d;
    if (isNaN(dd.getTime())) return '\u2014';
    return pad(dd.getDate()) + '/' + pad(dd.getMonth() + 1) + '/' + dd.getFullYear();
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // MODAL HELPER
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
      '.ja-badge-statut{background:rgba(13,148,136,.15);color:#0d9488}\n' +
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
      '.ja-modal-select{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box}\n' +
      '.ja-btn-primary{background:#0d9488;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s}\n' +
      '.ja-btn-primary:hover{background:#0f766e}\n' +
      '.ja-btn-primary:disabled{opacity:.5;cursor:not-allowed}\n' +
      '.ja-btn-ghost{background:transparent;color:#a3a3a3;border:1px solid rgba(255,255,255,.08);padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-ghost:hover{color:#e5e5e5;border-color:rgba(255,255,255,.2)}\n' +
      '.ja-empty{text-align:center;padding:40px;color:#525252;font-size:14px}\n' +
      '.ja-loading{text-align:center;padding:40px;color:#737373;font-size:14px}\n' +
      '.ja-case-row{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.03);margin-bottom:6px;font-size:12px}\n' +
      '.ja-case-row:hover{background:rgba(255,255,255,.06)}\n' +
      '.ja-case-ref{font-weight:600;color:#d4d4d4}\n' +
      '.ja-case-statut{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}\n' +
      '.ja-error-banner{padding:10px 14px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#fca5a5;font-size:13px;margin-bottom:12px}\n';
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
  var _expandedDetail = null; // cached detail data for expanded patient
  var _page = 1;
  var _totalPatients = 0;
  var _patients = [];
  var _loading = false;
  var _error = null;
  var _isDemo = false;
  var PER_PAGE = 8;
  var _searchDebounceTimer = null;

  // ---------------------------------------------------------------------------
  // API CALLS
  // ---------------------------------------------------------------------------

  /**
   * Charge la liste des patients depuis l'API
   */
  function fetchPatients(page, callback) {
    _loading = true;
    _error = null;
    drawList();

    var url = API_BASE + '?page=' + page + '&limit=' + PER_PAGE + '&statut=actif';

    fetch(url, { headers: apiHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        _loading = false;
        _isDemo = false;
        _patients = data.patients || [];
        _totalPatients = data.total || _patients.length;
        _page = data.page || page;
        if (callback) callback();
        else drawList();
      })
      .catch(function (err) {
        console.warn('[tab-patients] API indisponible, fallback demo:', err.message);
        _loading = false;
        _isDemo = true;
        _patients = DEMO_PATIENTS;
        _totalPatients = DEMO_PATIENTS.length;
        if (callback) callback();
        else drawList();
      });
  }

  /**
   * Recherche patients via autocomplete API (debounce 300ms)
   */
  function searchPatients(query) {
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);

    if (!query || query.length < 2) {
      // Moins de 2 caracteres : recharger la liste complete
      _searchTerm = query || '';
      _page = 1;
      _expandedId = null;
      _expandedDetail = null;
      fetchPatients(1);
      return;
    }

    _searchTerm = query;
    _searchDebounceTimer = setTimeout(function () {
      _loading = true;
      _error = null;
      drawList();

      var url = API_BASE + '/search?q=' + encodeURIComponent(query);

      fetch(url, { headers: apiHeaders(false) })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          _loading = false;
          _isDemo = false;
          _patients = data.patients || [];
          _totalPatients = _patients.length;
          _page = 1;
          drawList();
        })
        .catch(function (err) {
          console.warn('[tab-patients] Search fallback demo:', err.message);
          _loading = false;
          _isDemo = true;
          // Fallback : filtrer les donnees demo localement
          var q = query.toLowerCase();
          _patients = DEMO_PATIENTS.filter(function (p) {
            return (p.nom + ' ' + p.prenom + ' ' + p.telephone).toLowerCase().indexOf(q) !== -1;
          });
          _totalPatients = _patients.length;
          _page = 1;
          drawList();
        });
    }, 300);
  }

  /**
   * Charge le detail d'un patient (fiche + cases)
   */
  function fetchPatientDetail(patientId, callback) {
    var url = API_BASE + '/' + patientId;

    fetch(url, { headers: apiHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        _expandedDetail = {
          patient: data.patient || {},
          cases: data.cases || []
        };
        if (callback) callback();
      })
      .catch(function (err) {
        console.warn('[tab-patients] Detail fallback:', err.message);
        // Fallback : detail minimal depuis les donnees en liste
        var found = null;
        for (var i = 0; i < _patients.length; i++) {
          if (_patients[i].id === patientId) { found = _patients[i]; break; }
        }
        _expandedDetail = {
          patient: found || {},
          cases: []
        };
        if (callback) callback();
      });
  }

  /**
   * Cree un nouveau patient via POST
   */
  function createPatient(body, onSuccess, onError) {
    fetch(API_BASE, {
      method: 'POST',
      headers: apiHeaders(true),
      body: JSON.stringify(body)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 201) {
          if (onSuccess) onSuccess(result.data.patient);
        } else if (result.status === 409) {
          if (onError) onError(result.data.message || 'Ce patient existe d\u00e9j\u00e0.');
        } else {
          if (onError) onError(result.data.error || 'Erreur lors de la cr\u00e9ation.');
        }
      })
      .catch(function (err) {
        console.error('[tab-patients] create error:', err);
        if (onError) onError('Erreur de connexion au serveur.');
      });
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  function renderPatients(container) {
    _container = container;
    injectStyles();
    // Initial load from API
    fetchPatients(1);
  }

  function refreshPatients() {
    if (_container) {
      _expandedId = null;
      _expandedDetail = null;
      _searchTerm = '';
      _page = 1;
      fetchPatients(1);
    }
  }

  /**
   * Dessine la liste compl\u00e8te (toolbar + cards + pagination)
   */
  function drawList() {
    if (!_container) return;

    var totalPages = Math.max(1, Math.ceil(_totalPatients / PER_PAGE));
    if (_page > totalPages) _page = totalPages;

    var html = '<div class="ja-patients-wrap">';

    // Toolbar
    html += '<div class="ja-patients-toolbar">';
    html += '<div class="ja-search-box">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
    html += '<input id="ja-patient-search" type="text" placeholder="Rechercher un patient..." value="' + escHtml(_searchTerm) + '">';
    html += '</div>';
    html += '<button class="ja-add-patient-btn" id="ja-add-patient-btn">+ Ajouter un patient</button>';
    html += '</div>';

    // Demo banner
    if (_isDemo) {
      html += '<div class="ja-error-banner">Mode d\u00e9monstration \u2014 API indisponible, donn\u00e9es d\'exemple affich\u00e9es.</div>';
    }

    // Stats bar
    html += '<div style="font-size:12px;color:#525252;margin-bottom:12px">' + _totalPatients + ' patient' + (_totalPatients > 1 ? 's' : '') + ' trouv\u00e9' + (_totalPatients > 1 ? 's' : '') + '</div>';

    // Loading state
    if (_loading) {
      html += '<div class="ja-loading">Chargement des patients...</div>';
      html += '</div>';
      _container.innerHTML = html;
      bindToolbarEvents();
      return;
    }

    // Patient list
    if (_patients.length === 0) {
      html += '<div class="ja-empty">Aucun patient trouv\u00e9</div>';
    } else {
      // En mode demo, on pagine localement ; en mode API, les donnees sont deja paginees
      var displayPatients = _isDemo
        ? _patients.slice((_page - 1) * PER_PAGE, _page * PER_PAGE)
        : _patients;

      for (var i = 0; i < displayPatients.length; i++) {
        var p = displayPatients[i];
        var expanded = _expandedId === p.id;
        var col = avatarColor(p.nom);

        html += '<div class="ja-patient-card' + (expanded ? ' expanded' : '') + '" data-pid="' + p.id + '">';
        html += '<div class="ja-avatar" style="background:' + col + '22;color:' + col + '">' + initials(p.nom, p.prenom) + '</div>';
        html += '<div class="ja-patient-info">';
        html += '<div class="ja-patient-name">' + escHtml(p.prenom) + ' ' + escHtml(p.nom);
        // PAT-ID en gris a cote du nom
        if (p.pat_id) {
          html += ' <span style="color:#737373;font-weight:400;font-size:12px">' + escHtml(p.pat_id) + '</span>';
        }
        html += '</div>';
        html += '<div class="ja-patient-sub">' + escHtml(p.telephone || '') + ' &middot; Derni\u00e8re visite : ' + relativeDate(p.derniere_visite) + '</div>';
        html += '</div>';
        html += '<div class="ja-patient-meta">';
        if (p.statut && p.statut !== 'actif') {
          html += '<span class="ja-badge ja-badge-statut">' + escHtml(p.statut) + '</span>';
        }
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.3;transition:transform .2s;transform:rotate(' + (expanded ? '90' : '0') + 'deg)"><path d="M9 18l6-6-6-6"/></svg>';
        html += '</div>';
        html += '</div>';

        // Detail panel (only if expanded and detail loaded)
        if (expanded && _expandedDetail) {
          html += buildDetailPanel(_expandedDetail);
        } else if (expanded && !_expandedDetail) {
          html += '<div class="ja-detail-panel"><div class="ja-loading">Chargement de la fiche...</div></div>';
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
    bindToolbarEvents();
    bindCardEvents();
    bindPaginationEvents();
  }

  // ---------------------------------------------------------------------------
  // EVENT BINDINGS
  // ---------------------------------------------------------------------------
  function bindToolbarEvents() {
    var searchInput = document.getElementById('ja-patient-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchPatients(this.value);
      });
      // Restore focus after redraw
      if (document.activeElement !== searchInput && _searchTerm) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }

    var addBtn = document.getElementById('ja-add-patient-btn');
    if (addBtn) {
      addBtn.addEventListener('click', showAddPatientModal);
    }
  }

  function bindCardEvents() {
    var cards = _container.querySelectorAll('.ja-patient-card');
    for (var c = 0; c < cards.length; c++) {
      cards[c].addEventListener('click', function () {
        var pid = this.getAttribute('data-pid');
        // Tenter conversion numerique, sinon garder en string (UUID)
        var numPid = parseInt(pid);
        pid = isNaN(numPid) ? pid : numPid;

        if (_expandedId === pid) {
          // Fermer le panel
          _expandedId = null;
          _expandedDetail = null;
          drawList();
        } else {
          // Ouvrir le panel : charger le detail via API
          _expandedId = pid;
          _expandedDetail = null;
          drawList(); // affiche le loading
          fetchPatientDetail(pid, function () {
            drawList(); // re-affiche avec le detail
          });
        }
      });
    }
  }

  function bindPaginationEvents() {
    var pageButtons = _container.querySelectorAll('.ja-pagination button');
    for (var pb = 0; pb < pageButtons.length; pb++) {
      pageButtons[pb].addEventListener('click', function () {
        _page = parseInt(this.getAttribute('data-page'));
        _expandedId = null;
        _expandedDetail = null;
        if (_isDemo || _searchTerm.length >= 2) {
          // En mode demo ou recherche, on pagine localement
          drawList();
        } else {
          fetchPatients(_page);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // DETAIL PANEL
  // ---------------------------------------------------------------------------
  function buildDetailPanel(detail) {
    var p = detail.patient || {};
    var cases = detail.cases || [];

    var html = '<div class="ja-detail-panel">';

    // Contact info
    html += '<div class="ja-detail-section">';
    html += '<h4>Informations</h4>';
    html += '<div class="ja-detail-grid">';
    if (p.pat_id) {
      html += '<div class="ja-detail-item"><label>PAT-ID</label><span style="font-family:monospace;color:#0d9488">' + escHtml(p.pat_id) + '</span></div>';
    }
    html += '<div class="ja-detail-item"><label>Email</label><span>' + escHtml(p.email || '\u2014') + '</span></div>';
    html += '<div class="ja-detail-item"><label>T\u00e9l\u00e9phone</label><span>' + escHtml(p.telephone || '\u2014') + '</span></div>';
    html += '<div class="ja-detail-item"><label>Date de naissance</label><span>' + formatDateFr(p.date_naissance) + '</span></div>';
    if (p.sexe) {
      html += '<div class="ja-detail-item"><label>Sexe</label><span>' + escHtml(p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'F\u00e9minin' : p.sexe) + '</span></div>';
    }
    if (p.adresse || p.code_postal || p.ville) {
      var adresseStr = [p.adresse, p.code_postal, p.ville].filter(Boolean).join(', ');
      html += '<div class="ja-detail-item"><label>Adresse</label><span>' + escHtml(adresseStr) + '</span></div>';
    }
    html += '<div class="ja-detail-item"><label>Derni\u00e8re visite</label><span>' + relativeDate(p.derniere_visite) + '</span></div>';
    html += '<div class="ja-detail-item"><label>Statut</label><span>' + escHtml(p.statut || 'actif') + '</span></div>';
    html += '</div></div>';

    // Notes praticien
    if (p.notes_praticien) {
      html += '<div class="ja-detail-section">';
      html += '<h4>Notes praticien</h4>';
      html += '<div style="font-size:13px;color:#d4d4d4;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;border-left:3px solid #3b82f6;white-space:pre-wrap">';
      html += escHtml(p.notes_praticien);
      html += '</div></div>';
    }

    // Cases proth\u00e9tiques
    html += '<div class="ja-detail-section">';
    html += '<h4>Cas proth\u00e9tiques (' + cases.length + ')</h4>';
    if (cases.length === 0) {
      html += '<div style="font-size:12px;color:#525252;padding:8px 0">Aucun cas enregistr\u00e9 pour ce patient.</div>';
    } else {
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i];
        var statutColor = getCaseStatutColor(c.statut);
        html += '<div class="ja-case-row">';
        html += '<div>';
        html += '<span class="ja-case-ref">' + escHtml(c.reference || c.titre || 'Cas #' + (i + 1)) + '</span>';
        if (c.type) html += ' <span style="color:#737373;font-size:11px">' + escHtml(c.type) + '</span>';
        if (c.dent_numero) html += ' <span style="color:#737373;font-size:11px">dent ' + escHtml(c.dent_numero) + '</span>';
        if (c.teinte) html += ' <span style="color:#737373;font-size:11px">teinte ' + escHtml(c.teinte) + '</span>';
        html += '</div>';
        html += '<div>';
        if (c.date_livraison_prevue) {
          html += '<span style="color:#525252;font-size:11px;margin-right:8px">Livraison : ' + formatDateFr(c.date_livraison_prevue) + '</span>';
        }
        html += '<span class="ja-case-statut" style="background:' + statutColor.bg + ';color:' + statutColor.text + '">' + escHtml(c.statut || 'nouveau') + '</span>';
        html += '</div>';
        html += '</div>';
      }
    }
    html += '</div>';

    // Inscrit depuis
    if (p.created_at) {
      html += '<div style="font-size:11px;color:#525252;margin-top:8px">Patient inscrit le ' + formatDateFr(p.created_at) + '</div>';
    }

    html += '</div>';
    return html;
  }

  function getCaseStatutColor(statut) {
    var map = {
      'nouveau': { bg: 'rgba(59,130,246,.15)', text: '#60a5fa' },
      'empreinte': { bg: 'rgba(139,92,246,.15)', text: '#a78bfa' },
      'en_fabrication': { bg: 'rgba(245,158,11,.15)', text: '#fbbf24' },
      'essayage': { bg: 'rgba(236,72,153,.15)', text: '#f472b6' },
      'livre': { bg: 'rgba(16,185,129,.15)', text: '#34d399' },
      'pose': { bg: 'rgba(13,148,136,.15)', text: '#0d9488' },
      'termine': { bg: 'rgba(107,114,128,.15)', text: '#9ca3af' },
      'annule': { bg: 'rgba(239,68,68,.15)', text: '#ef4444' }
    };
    return map[statut] || map['nouveau'];
  }

  // ---------------------------------------------------------------------------
  // ADD PATIENT MODAL
  // ---------------------------------------------------------------------------
  function showAddPatientModal() {
    var html = '' +
      '<div class="ja-modal-title">Ajouter un patient</div>' +
      '<div id="ja-np-error" style="display:none" class="ja-error-banner"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Nom *</label><input class="ja-modal-input" id="ja-np-nom" placeholder="Nom"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Pr\u00e9nom</label><input class="ja-modal-input" id="ja-np-prenom" placeholder="Pr\u00e9nom"></div>' +
      '</div>' +
      '<div class="ja-modal-field"><label>T\u00e9l\u00e9phone *</label><input class="ja-modal-input" id="ja-np-tel" placeholder="06 XX XX XX XX"></div>' +
      '<div class="ja-modal-field"><label>Email</label><input class="ja-modal-input" id="ja-np-email" type="email" placeholder="email@exemple.fr"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Date de naissance</label><input class="ja-modal-input" id="ja-np-dob" type="date"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Sexe</label><select class="ja-modal-input ja-modal-select" id="ja-np-sexe"><option value="">--</option><option value="M">Masculin</option><option value="F">F\u00e9minin</option></select></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Annuler</button>' +
        '<button class="ja-btn-primary" id="ja-np-save">Enregistrer</button>' +
      '</div>';

    var m = showModal(html);
    var saveBtn = m.box.querySelector('#ja-np-save');
    var errorDiv = m.box.querySelector('#ja-np-error');

    saveBtn.addEventListener('click', function () {
      var nom = m.box.querySelector('#ja-np-nom').value.trim();
      var prenom = m.box.querySelector('#ja-np-prenom').value.trim();
      var telephone = m.box.querySelector('#ja-np-tel').value.trim();
      var email = m.box.querySelector('#ja-np-email').value.trim();
      var dateNaissance = m.box.querySelector('#ja-np-dob').value;
      var sexe = m.box.querySelector('#ja-np-sexe').value;

      // Validation
      errorDiv.style.display = 'none';
      m.box.querySelector('#ja-np-nom').style.borderColor = '';
      m.box.querySelector('#ja-np-tel').style.borderColor = '';

      if (!nom) {
        m.box.querySelector('#ja-np-nom').style.borderColor = '#ef4444';
        errorDiv.textContent = 'Le nom est obligatoire.';
        errorDiv.style.display = 'block';
        return;
      }
      if (!telephone) {
        m.box.querySelector('#ja-np-tel').style.borderColor = '#ef4444';
        errorDiv.textContent = 'Le t\u00e9l\u00e9phone est obligatoire.';
        errorDiv.style.display = 'block';
        return;
      }

      // Desactiver le bouton pendant l'envoi
      saveBtn.disabled = true;
      saveBtn.textContent = 'Enregistrement...';

      var body = { nom: nom, telephone: telephone };
      if (prenom) body.prenom = prenom;
      if (email) body.email = email;
      if (dateNaissance) body.date_naissance = dateNaissance;
      if (sexe) body.sexe = sexe;

      createPatient(body,
        function onSuccess(patient) {
          m.close();
          _page = 1;
          _searchTerm = '';
          _expandedId = null;
          _expandedDetail = null;
          fetchPatients(1);
        },
        function onError(msg) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Enregistrer';
          errorDiv.textContent = msg;
          errorDiv.style.display = 'block';
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------------
  window.JADOMI_PRO.renderPatients = renderPatients;
  window.JADOMI_PRO.refreshPatients = refreshPatients;

  window.renderPatients = renderPatients;
  window.refreshPatients = refreshPatients;

})();
