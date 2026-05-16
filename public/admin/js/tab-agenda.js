/**
 * JADOMI Dentiste Pro — Agenda Tab Module
 * Week view calendar with comprehensive dental procedure catalog
 * Category → Act cascading dropdowns, smart duration, linked chains
 * CRUD complet : GET/POST/PUT/DELETE + seed + catalogue API
 * Fullscreen mode + Delay/advance tracker (retard/avance)
 */
(function () {
  'use strict';

  window.JADOMI_PRO = window.JADOMI_PRO || {};

  // ---------------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------------
  var ALL_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var START_HOUR = 9;
  var END_HOUR = 20;

  // ---------------------------------------------------------------------------
  // SETTINGS SYSTEM
  // ---------------------------------------------------------------------------
  var DEFAULT_SETTINGS = {
    startHour: 9,
    endHour: 19,
    pauseDebut: '12:30',
    pauseFin: '14:00',
    cellHeight: 64,
    daysCount: 6,
    increment: 60,
    colors: {
      consultation: '#3B82F6',
      conservateur: '#10B981',
      endodontie: '#F59E0B',
      parodontologie: '#06B6D4',
      prothese_conjointe: '#EC4899',
      prothese_adjointe: '#8B5CF6',
      chirurgie: '#EF4444',
      orthodontie: '#A855F7',
      esthetique: '#FBBF24',
      pedodontie: '#34D399'
    },
    alerteRetard: 10,
    alerteActesLourds: true,
    modeSolo: false,  // Mode seul au cabinet (1 clic = arrivé + soin + copilot)
    // Jours travaillés personnalisables — par jour
    joursTravailles: {
      lundi:    { actif: true,  mode: 'journee', debut: '09:00', fin: '19:00' },
      mardi:    { actif: true,  mode: 'journee', debut: '09:00', fin: '19:00' },
      mercredi: { actif: true,  mode: 'journee', debut: '09:00', fin: '19:00' },
      jeudi:    { actif: true,  mode: 'journee', debut: '09:00', fin: '19:00' },
      vendredi: { actif: true,  mode: 'journee', debut: '09:00', fin: '19:00' },
      samedi:   { actif: true,  mode: 'matin',   debut: '09:00', fin: '13:00' },
      dimanche: { actif: false, mode: 'journee', debut: '09:00', fin: '13:00' }
    }
  };

  // Map jour → index dans ALL_DAYS
  var JOUR_KEYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

  var _settings = null;

  function loadSettings() {
    var saved = null;
    try {
      var raw = localStorage.getItem('jadomi_agenda_settings');
      if (raw) saved = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    // Merge with defaults so new keys always have defaults
    _settings = {};
    var keys = Object.keys(DEFAULT_SETTINGS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'colors') {
        _settings.colors = {};
        var colorKeys = Object.keys(DEFAULT_SETTINGS.colors);
        for (var j = 0; j < colorKeys.length; j++) {
          _settings.colors[colorKeys[j]] = (saved && saved.colors && saved.colors[colorKeys[j]])
            ? saved.colors[colorKeys[j]]
            : DEFAULT_SETTINGS.colors[colorKeys[j]];
        }
      } else if (k === 'joursTravailles') {
        _settings.joursTravailles = {};
        var jtKeys = Object.keys(DEFAULT_SETTINGS.joursTravailles);
        for (var j2 = 0; j2 < jtKeys.length; j2++) {
          var jk2 = jtKeys[j2];
          var def = DEFAULT_SETTINGS.joursTravailles[jk2];
          var sv = (saved && saved.joursTravailles && saved.joursTravailles[jk2]) || {};
          _settings.joursTravailles[jk2] = {
            actif: sv.actif !== undefined ? sv.actif : def.actif,
            mode: sv.mode || def.mode,
            debut: sv.debut || def.debut,
            fin: sv.fin || def.fin
          };
        }
      } else {
        _settings[k] = (saved && saved[k] !== undefined) ? saved[k] : DEFAULT_SETTINGS[k];
      }
    }
    applySettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem('jadomi_agenda_settings', JSON.stringify(_settings));
    } catch (e) { /* ignore */ }
    applySettings();
  }

  function applySettings() {
    if (!_settings) return;

    // Jours travaillés personnalisables
    if (_settings.joursTravailles) {
      var activeDays = [];
      var minHour = 23, maxHour = 0;
      for (var di = 0; di < JOUR_KEYS.length; di++) {
        var jk = JOUR_KEYS[di];
        var jConf = _settings.joursTravailles[jk];
        if (jConf && jConf.actif) {
          activeDays.push(ALL_DAYS[di]);
          var dh = parseInt((jConf.debut || '09:00').split(':')[0]);
          var fh = parseInt((jConf.fin || '19:00').split(':')[0]);
          if (dh < minHour) minHour = dh;
          if (fh > maxHour) maxHour = fh;
        }
      }
      if (activeDays.length > 0) {
        DAYS = activeDays;
        START_HOUR = minHour;
        END_HOUR = maxHour;
      } else {
        DAYS = ALL_DAYS.slice(0, 5);
        START_HOUR = _settings.startHour;
        END_HOUR = _settings.endHour;
      }
    } else {
      // Fallback ancien mode
      START_HOUR = _settings.startHour;
      END_HOUR = _settings.endHour;
      DAYS = ALL_DAYS.slice(0, _settings.daysCount);
    }
  }

  // Helper : obtenir la config horaire d'un jour donné
  function getDayConfig(dayName) {
    if (!_settings || !_settings.joursTravailles) return null;
    var idx = ALL_DAYS.indexOf(dayName);
    if (idx < 0) return null;
    return _settings.joursTravailles[JOUR_KEYS[idx]] || null;
  }

  var FALLBACK_COLORS = {
    consultation: '#3B82F6',
    conservateur: '#10B981',
    endodontie: '#F59E0B',
    parodontologie: '#06B6D4',
    prothese_conjointe: '#EC4899',
    prothese_adjointe: '#8B5CF6',
    chirurgie: '#EF4444',
    orthodontie: '#A855F7',
    esthetique: '#FBBF24',
    pedodontie: '#34D399'
  };

  var FALLBACK_LABELS = {
    consultation: 'Consultation',
    conservateur: 'Soins conservateurs',
    endodontie: 'Endodontie',
    parodontologie: 'Parodontologie',
    prothese_conjointe: 'Prothèse conjointe',
    prothese_adjointe: 'Prothèse adjointe',
    chirurgie: 'Chirurgie',
    orthodontie: 'Orthodontie',
    esthetique: 'Esthétique',
    pedodontie: 'Pédodontie'
  };

  // Old type → category mapping for backward compatibility
  var OLD_TYPE_MAP = {
    consultation: 'consultation',
    suivi: 'consultation',
    urgence: 'chirurgie',
    bilan: 'consultation',
    extraction: 'chirurgie',
    detartrage: 'parodontologie',
    prothese: 'prothese_conjointe',
    orthodontie: 'orthodontie'
  };

  var DURATION_OPTIONS = [
    { value: 10, label: '10 min' },
    { value: 15, label: '15 min' },
    { value: 20, label: '20 min' },
    { value: 30, label: '30 min' },
    { value: 40, label: '40 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '1 heure' },
    { value: 90, label: '1h30' },
    { value: 120, label: '2 heures' }
  ];

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var _container = null;
  var _weekOffset = 0;
  var _appointments = [];
  var _loading = false;
  var _catalogue = null;       // Loaded from API
  var _catalogueLoading = false;
  var _catalogueLoaded = false;
  var _isFullscreen = false;
  var _currentTimeInterval = null;
  var _delayInterval = null;

  // Drag & drop state
  var _dragApt = null;

  // Historique des annulations (pour restaurer)
  var _cancelledHistory = [];
  try {
    var saved = localStorage.getItem('jadomi_agenda_cancelled');
    if (saved) _cancelledHistory = JSON.parse(saved);
  } catch (e) { /* ignore */ }

  // Copilot state
  var _copilotActive = false;
  var _copilotAptId = null;
  var _copilotRecognition = null;
  var _copilotTranscript = '';
  var _copilotInterim = '';
  var _copilotTimer = null;
  var _copilotStartTime = null;
  var _copilotActes = [];
  var _copilotSaveTimer = null;
  var _copilotPatientName = '';
  var _copilotActeLabel = '';
  var _copilotOriginalNotes = '';

  // ---------------------------------------------------------------------------
  // API HELPERS
  // ---------------------------------------------------------------------------
  function getToken() {
    // Format classique
    var t = localStorage.getItem('supabase_token') || localStorage.getItem('sb-access-token') || '';
    if (t) return t;
    // Format jadomi_session (Precision Dentaire / index.html)
    try { var s = JSON.parse(localStorage.getItem('jadomi_session')); if (s && s.access_token) return s.access_token; } catch(e) {}
    // Format Supabase auto (sb-xxxxx-auth-token)
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('sb-') !== -1 && k.indexOf('auth-token') !== -1) {
        try { var v = JSON.parse(localStorage.getItem(k)); if (v && v.access_token) return v.access_token; } catch(e) {}
      }
    }
    return '';
  }

  function getSocieteId() {
    var sid = localStorage.getItem('selectedSocieteId') || '';
    if (sid) return sid;
    // Chercher dans jadomiMultiSocietes
    try { if (window.jadomiMultiSocietes && window.jadomiMultiSocietes.societeId) return window.jadomiMultiSocietes.societeId; } catch(e) {}
    return '';
  }

  function getHeaders() {
    return {
      'Authorization': 'Bearer ' + getToken(),
      'Content-Type': 'application/json',
      'X-Societe-Id': getSocieteId()
    };
  }

  function formatISODate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  async function apiGet(debut, fin) {
    var url = '/api/dentiste-pro/agenda?debut=' + debut + '&fin=' + fin;
    var r = await fetch(url, { headers: getHeaders() });
    if (r.status === 401) {
      showToast('Session expirée — veuillez vous reconnecter', 'error');
      throw new Error('401');
    }
    if (!r.ok) {
      var err = await r.json().catch(function () { return {}; });
      throw new Error(err.error || 'Erreur ' + r.status);
    }
    return r.json();
  }

  async function apiPost(body) {
    var r = await fetch('/api/dentiste-pro/agenda', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body)
    });
    if (r.status === 401) {
      showToast('Session expirée — veuillez vous reconnecter', 'error');
      throw new Error('401');
    }
    if (!r.ok) {
      var err = await r.json().catch(function () { return {}; });
      throw new Error(err.error || 'Erreur ' + r.status);
    }
    return r.json();
  }

  async function apiPut(id, body) {
    var r = await fetch('/api/dentiste-pro/agenda/' + id, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body)
    });
    if (r.status === 401) {
      showToast('Session expirée — veuillez vous reconnecter', 'error');
      throw new Error('401');
    }
    if (!r.ok) {
      var err = await r.json().catch(function () { return {}; });
      throw new Error(err.error || 'Erreur ' + r.status);
    }
    return r.json();
  }

  async function apiDelete(id) {
    var r = await fetch('/api/dentiste-pro/agenda/' + id, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (r.status === 401) {
      showToast('Session expirée — veuillez vous reconnecter', 'error');
      throw new Error('401');
    }
    if (!r.ok) {
      var err = await r.json().catch(function () { return {}; });
      throw new Error(err.error || 'Erreur ' + r.status);
    }
    return r.json();
  }

  async function apiSeed() {
    var r = await fetch('/api/dentiste-pro/agenda/seed', {
      method: 'POST',
      headers: getHeaders()
    });
    if (r.status === 401) {
      showToast('Session expirée — veuillez vous reconnecter', 'error');
      throw new Error('401');
    }
    if (!r.ok) {
      var err = await r.json().catch(function () { return {}; });
      throw new Error(err.error || 'Erreur ' + r.status);
    }
    return r.json();
  }

  async function loadCatalogue() {
    if (_catalogueLoaded || _catalogueLoading) return;
    _catalogueLoading = true;
    try {
      var r = await fetch('/api/dentiste-pro/agenda/catalogue', { headers: getHeaders() });
      if (r.ok) {
        var data = await r.json();
        _catalogue = data.catalogue || data.categories || data;
        // Validate structure
        if (_catalogue && typeof _catalogue === 'object' && Object.keys(_catalogue).length > 0) {
          _catalogueLoaded = true;
        } else {
          _catalogue = null;
        }
      }
    } catch (e) {
      _catalogue = null;
    }
    _catalogueLoading = false;
  }

  // ---------------------------------------------------------------------------
  // CATALOGUE ACCESSORS
  // ---------------------------------------------------------------------------
  function getCategoryColor(catKey) {
    // Settings colors have highest priority
    if (_settings && _settings.colors && _settings.colors[catKey]) {
      return _settings.colors[catKey];
    }
    if (_catalogue && _catalogue[catKey] && _catalogue[catKey].couleur) {
      return _catalogue[catKey].couleur;
    }
    return FALLBACK_COLORS[catKey] || '#666666';
  }

  function getCategoryLabel(catKey) {
    if (_catalogue && _catalogue[catKey] && _catalogue[catKey].label) {
      return _catalogue[catKey].label;
    }
    return FALLBACK_LABELS[catKey] || catKey;
  }

  function getCategoryKeys() {
    if (_catalogue) return Object.keys(_catalogue);
    return Object.keys(FALLBACK_COLORS);
  }

  function getActesForCategory(catKey) {
    if (_catalogue && _catalogue[catKey] && _catalogue[catKey].actes) {
      return _catalogue[catKey].actes;
    }
    return {};
  }

  function getActeInfo(catKey, acteKey) {
    var actes = getActesForCategory(catKey);
    return actes[acteKey] || null;
  }

  function findActeLabel(catKey, acteKey) {
    var info = getActeInfo(catKey, acteKey);
    if (info) return info.label || acteKey;
    return acteKey || '';
  }

  function findLinkedActe(catKey, acteKey) {
    var info = getActeInfo(catKey, acteKey);
    if (!info || !info.lien_precedent) return null;
    // Search all categories for the linked act
    var cats = getCategoryKeys();
    for (var i = 0; i < cats.length; i++) {
      var actes = getActesForCategory(cats[i]);
      if (actes[info.lien_precedent]) {
        return {
          categorie: cats[i],
          acte: info.lien_precedent,
          label: actes[info.lien_precedent].label || info.lien_precedent,
          delai_jours: info.delai_jours || 7,
          duree: actes[info.lien_precedent].duree || 30
        };
      }
    }
    return null;
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
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }

  function formatWeekLabel(monday) {
    var months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return 'Semaine du ' + monday.getDate() + ' ' + months[monday.getMonth()] + ' ' + monday.getFullYear();
  }

  function formatDateFR(d) {
    var jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return jours[d.getDay()] + ' ' + d.getDate() + ' ' + mois[d.getMonth()];
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

  function timeStrFromISO(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return pad(d.getHours()) + 'h' + pad(d.getMinutes());
  }

  function durationMin(a, b) { return Math.round((b - a) / 60000); }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Get the current cell height based on fullscreen state and settings
  function getCellHeight() {
    // In fullscreen mode, read actual height from DOM
    if (_isFullscreen && _container) {
      var cell = _container.querySelector('.ja-cell');
      if (cell) return cell.offsetHeight || (_settings ? _settings.cellHeight : 64);
    }
    return (_settings && _settings.cellHeight) ? _settings.cellHeight : 64;
  }

  // Parse appointment from API (dates come as ISO strings)
  // Supports both old format (type) and new format (categorie + acte)
  function parseAppointment(raw) {
    var categorie = raw.categorie || '';
    var acte = raw.acte || '';

    // Backward compatibility: map old type to categorie
    if (!categorie && raw.type) {
      categorie = OLD_TYPE_MAP[raw.type] || raw.type;
      if (!acte) acte = raw.type;
    }
    if (!categorie) categorie = 'consultation';

    // Parse start date — support multiple formats
    var startDate;
    if (raw.start) startDate = new Date(raw.start);
    else if (raw.debut) startDate = new Date(raw.debut);
    else if (raw.date_debut) startDate = new Date(raw.date_debut);
    else if (raw.date_heure) startDate = new Date(raw.date_heure);
    else startDate = new Date();

    // Parse end date — or calculate from duree_minutes
    var endDate;
    if (raw.end) endDate = new Date(raw.end);
    else if (raw.fin) endDate = new Date(raw.fin);
    else if (raw.date_fin) endDate = new Date(raw.date_fin);
    else {
      var dureeMs = (raw.duree_minutes || raw.duree || 30) * 60000;
      endDate = new Date(startDate.getTime() + dureeMs);
    }

    return {
      id: raw.id,
      patient_nom: raw.patient_nom || '',
      patient_prenom: raw.patient_prenom || '',
      patient_tel: raw.patient_tel || '',
      patient_email: raw.patient_email || '',
      patient: (raw.patient_prenom ? raw.patient_prenom + ' ' : '') + (raw.patient_nom || raw.patient || ''),
      type: raw.type || categorie,
      categorie: categorie,
      acte: acte,
      start: startDate,
      end: endDate,
      notes: raw.notes || '',
      duree: raw.duree_minutes || raw.duree || null,
      heure_debut_reelle: raw.heure_debut_reelle || null,
      heure_fin_reelle: raw.heure_fin_reelle || null,
      statut: raw.statut || 'planifie',
      heure_arrivee: raw.heure_arrivee || null
    };
  }

  // ---------------------------------------------------------------------------
  // DELAY / ADVANCE TRACKER HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Compute delay in minutes between scheduled start and actual start.
   * Positive = late, negative = early.
   */
  function computeDelayMinutes(apt) {
    if (!apt.heure_debut_reelle) return null;
    var actual = new Date(apt.heure_debut_reelle);
    if (isNaN(actual.getTime())) return null;
    return Math.round((actual - apt.start) / 60000);
  }

  /**
   * Build statut badge (arrivé/absent/en soin/terminé)
   */
  function buildStatutBadge(apt) {
    var s = apt.statut || 'planifie';
    if (s === 'planifie') return '';
    var labels = {
      arrive: '&#10003;',
      en_soin: '&#9881;',
      termine: '&#10004;',
      absent: '&#10007;'
    };
    var colors = {
      arrive: '#22c55e',
      en_soin: '#f59e0b',
      termine: '#0d9488',
      absent: '#ef4444'
    };
    var titles = {
      arrive: 'Patient arrivé',
      en_soin: 'En soin',
      termine: 'Terminé',
      absent: 'Absent'
    };
    // Calcul retard patient
    var retardTxt = '';
    if (s === 'arrive' && apt.heure_arrivee) {
      var arrivee = new Date(apt.heure_arrivee);
      var diff = Math.round((arrivee - apt.start) / 60000);
      if (diff > 2) retardTxt = ' +' + diff + 'min';
      else if (diff < -2) retardTxt = ' ' + diff + 'min';
    }
    return ' <span title="' + (titles[s] || '') + '" style="font-size:9px;padding:1px 4px;border-radius:4px;background:' + (colors[s] || '#666') + '22;color:' + (colors[s] || '#666') + ';font-weight:700;margin-left:3px;vertical-align:middle">' + (labels[s] || '') + retardTxt + '</span>';
  }

  /**
   * Build the small delay badge HTML for an appointment block.
   */
  function buildDelayBadge(apt) {
    var delay = computeDelayMinutes(apt);
    if (delay === null) return '';

    // Started but not finished
    if (!apt.heure_fin_reelle) {
      return '<span class="ja-delay-badge ja-delay-inprogress">En cours</span>';
    }

    // Finished — show delay
    if (delay <= 0) {
      return '<span class="ja-delay-badge ja-delay-early">' + delay + 'min</span>';
    } else {
      return '<span class="ja-delay-badge ja-delay-late">+' + delay + 'min</span>';
    }
  }

  /**
   * Compute current running delay based on today's appointments.
   * Returns { delay: number (minutes), label: string, color: string } or null.
   */
  function computeRunningDelay() {
    var now = new Date();
    var todayAppts = [];
    for (var i = 0; i < _appointments.length; i++) {
      var a = _appointments[i];
      if (isToday(a.start)) {
        todayAppts.push(a);
      }
    }

    if (todayAppts.length === 0) return null;

    // Sort by scheduled start
    todayAppts.sort(function (a, b) { return a.start - b.start; });

    // Find the last completed appointment
    var lastCompleted = null;
    var nextScheduled = null;

    for (var j = 0; j < todayAppts.length; j++) {
      if (todayAppts[j].heure_fin_reelle) {
        lastCompleted = todayAppts[j];
      }
    }

    // Find next appointment that hasn't started yet
    for (var k = 0; k < todayAppts.length; k++) {
      if (!todayAppts[k].heure_debut_reelle) {
        nextScheduled = todayAppts[k];
        break;
      }
    }

    // If we have a last completed and a next scheduled, compute delay
    if (lastCompleted && nextScheduled) {
      var finReelle = new Date(lastCompleted.heure_fin_reelle);
      if (isNaN(finReelle.getTime())) return null;
      // Delay = how late the last one finished vs when the next one should start
      var delayMs = finReelle - nextScheduled.start;
      var delayMin = Math.round(delayMs / 60000);
      return buildDelayInfo(delayMin);
    }

    // If there's an appointment in progress (started but not finished)
    for (var m = 0; m < todayAppts.length; m++) {
      if (todayAppts[m].heure_debut_reelle && !todayAppts[m].heure_fin_reelle) {
        var startDelay = computeDelayMinutes(todayAppts[m]);
        if (startDelay !== null) {
          return buildDelayInfo(startDelay);
        }
      }
    }

    return null;
  }

  function buildDelayInfo(delayMin) {
    var label, color;
    if (delayMin <= 0) {
      label = 'En avance : ' + delayMin + ' min';
      color = '#10b981';
    } else if (delayMin <= 5) {
      label = 'À l\'heure';
      color = '#10b981';
    } else if (delayMin <= 15) {
      label = 'Retard actuel : +' + delayMin + ' min';
      color = '#f59e0b';
    } else {
      label = 'Retard actuel : +' + delayMin + ' min';
      color = '#ef4444';
    }
    return { delay: delayMin, label: label, color: color };
  }

  /**
   * Compute average actual duration stats by acte.
   */
  function computeDurationStats() {
    var stats = {}; // key = acte label, value = { totalActual, totalPlanned, count }
    for (var i = 0; i < _appointments.length; i++) {
      var a = _appointments[i];
      if (!a.heure_debut_reelle || !a.heure_fin_reelle) continue;

      var actualStart = new Date(a.heure_debut_reelle);
      var actualEnd = new Date(a.heure_fin_reelle);
      if (isNaN(actualStart.getTime()) || isNaN(actualEnd.getTime())) continue;

      var actualDur = Math.round((actualEnd - actualStart) / 60000);
      var plannedDur = durationMin(a.start, a.end);
      var label = findActeLabel(a.categorie, a.acte) || getCategoryLabel(a.categorie);

      if (!stats[label]) {
        stats[label] = { totalActual: 0, totalPlanned: 0, count: 0 };
      }
      stats[label].totalActual += actualDur;
      stats[label].totalPlanned += plannedDur;
      stats[label].count++;
    }
    return stats;
  }

  // ---------------------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // ---------------------------------------------------------------------------
  function showToast(message, type) {
    type = type || 'success';
    var colors = {
      success: { bg: 'rgba(13,148,136,.9)', border: '#0d9488' },
      error: { bg: 'rgba(239,68,68,.9)', border: '#ef4444' },
      info: { bg: 'rgba(59,130,246,.9)', border: '#3b82f6' }
    };
    var c = colors[type] || colors.info;
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:10001;padding:14px 22px;border-radius:12px;' +
      'background:' + c.bg + ';border:1px solid ' + c.border + ';color:#fff;font-size:14px;font-family:Inter,sans-serif;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.3);backdrop-filter:blur(8px);' +
      'animation:jadomi-slideDown .3s cubic-bezier(.16,1,.3,1);max-width:400px;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = 'opacity .3s, transform .3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3500);
  }

  // ---------------------------------------------------------------------------
  // LINKED APPOINTMENT SUGGESTION POPUP
  // ---------------------------------------------------------------------------
  function showLinkedSuggestion(linked, patientNom, patientPrenom, baseDate) {
    var suggestedDate = new Date(baseDate);
    suggestedDate.setDate(suggestedDate.getDate() + linked.delai_jours);
    // Skip Sunday
    if (suggestedDate.getDay() === 0) suggestedDate.setDate(suggestedDate.getDate() + 1);

    var dateLabel = formatDateFR(suggestedDate);

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10002;display:flex;align-items:flex-end;justify-content:center;padding:24px;pointer-events:none;';

    var popup = document.createElement('div');
    popup.style.cssText = 'pointer-events:all;background:rgba(20,20,30,.97);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:20px 24px;max-width:480px;width:100%;color:#e5e5e5;font-family:Inter,sans-serif;box-shadow:0 -8px 40px rgba(0,0,0,.5);animation:jadomi-slideUp .35s cubic-bezier(.16,1,.3,1);';

    var catColor = getCategoryColor(linked.categorie);

    popup.innerHTML = '' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + catColor + ';flex-shrink:0"></span>' +
        '<span style="font-size:15px;font-weight:600;color:#fff">Prochain RDV suggéré</span>' +
      '</div>' +
      '<p style="font-size:14px;color:#a3a3a3;margin:0 0 16px">' +
        '<strong style="color:#e5e5e5">' + esc(linked.label) + '</strong> le <strong style="color:#e5e5e5">' + dateLabel + '</strong>' +
        ' (' + linked.duree + ' min)' +
      '</p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" id="ja-linked-later" style="padding:8px 16px;font-size:13px">Plus tard</button>' +
        '<button class="ja-btn-primary" id="ja-linked-create" style="padding:8px 16px;font-size:13px">Programmer</button>' +
      '</div>';

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    function dismiss() { overlay.remove(); }

    popup.querySelector('#ja-linked-later').addEventListener('click', dismiss);

    popup.querySelector('#ja-linked-create').addEventListener('click', async function () {
      var btn = this;
      btn.textContent = 'Création...';
      btn.disabled = true;

      var startDt = new Date(suggestedDate);
      startDt.setHours(9, 0, 0, 0); // Default 9h
      var endDt = new Date(startDt.getTime() + linked.duree * 60000);

      var body = {
        patient_nom: patientNom,
        patient_prenom: patientPrenom,
        categorie: linked.categorie,
        acte: linked.acte,
        type: linked.categorie,
        debut: startDt.toISOString(),
        fin: endDt.toISOString(),
        duree: linked.duree,
        notes: 'RDV chaîné automatique'
      };

      try {
        await apiPost(body);
        showToast('RDV de suivi programmé avec succès', 'success');
        dismiss();
        draw();
      } catch (e) {
        if (e.message !== '401') {
          showToast('Erreur : ' + e.message, 'error');
        }
        btn.textContent = 'Programmer';
        btn.disabled = false;
      }
    });

    // Auto-dismiss after 15s
    setTimeout(function () {
      if (overlay.parentNode) dismiss();
    }, 15000);
  }

  // ---------------------------------------------------------------------------
  // MODAL HELPERS
  // ---------------------------------------------------------------------------
  function showModal(html, onClose) {
    var overlay = document.createElement('div');
    overlay.className = 'jadomi-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:jadomi-fadeIn .2s ease';
    var box = document.createElement('div');
    box.style.cssText = 'background:rgba(20,20,30,.95);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px 32px;max-width:560px;width:90%;color:#e5e5e5;font-family:Inter,sans-serif;box-shadow:0 24px 48px rgba(0,0,0,.4);animation:jadomi-slideUp .25s ease;max-height:90vh;overflow-y:auto';
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
  // CASCADING DROPDOWN HELPERS
  // ---------------------------------------------------------------------------
  function buildCategoryOptions(selectedCat) {
    var cats = getCategoryKeys();
    var html = '<option value="">-- Choisir une catégorie --</option>';
    for (var i = 0; i < cats.length; i++) {
      var sel = (selectedCat === cats[i]) ? ' selected' : '';
      html += '<option value="' + cats[i] + '"' + sel + '>' + esc(getCategoryLabel(cats[i])) + '</option>';
    }
    return html;
  }

  function buildActeOptions(catKey, selectedActe) {
    var actes = getActesForCategory(catKey);
    var keys = Object.keys(actes);
    if (keys.length === 0) {
      return '<option value="">-- Aucun acte disponible --</option>';
    }
    var html = '<option value="">-- Choisir un acte --</option>';
    for (var i = 0; i < keys.length; i++) {
      var sel = (selectedActe === keys[i]) ? ' selected' : '';
      html += '<option value="' + keys[i] + '"' + sel + '>' + esc(actes[keys[i]].label || keys[i]) + '</option>';
    }
    return html;
  }

  function buildDurationOptions(defaultDuree, currentDuree) {
    var html = '';
    var selectedValue = currentDuree || defaultDuree || 30;
    // Ensure default is in the list
    var opts = DURATION_OPTIONS.slice();
    var hasDefault = false;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === defaultDuree) { hasDefault = true; break; }
    }
    if (defaultDuree && !hasDefault) {
      opts.push({ value: defaultDuree, label: defaultDuree + ' min' });
      opts.sort(function (a, b) { return a.value - b.value; });
    }

    for (var j = 0; j < opts.length; j++) {
      var sel = (selectedValue === opts[j].value) ? ' selected' : '';
      var rec = (defaultDuree && opts[j].value === defaultDuree) ? ' (recommandé)' : '';
      html += '<option value="' + opts[j].value + '"' + sel + '>' + opts[j].label + rec + '</option>';
    }
    return html;
  }

  function setupCascadingDropdowns(prefix, box) {
    var catSelect = box.querySelector('#' + prefix + '-categorie');
    var acteSelect = box.querySelector('#' + prefix + '-acte');
    var dureeSelect = box.querySelector('#' + prefix + '-duree');
    var notesField = box.querySelector('#' + prefix + '-notes');
    var colorDot = box.querySelector('#' + prefix + '-color-dot');
    var linkHint = box.querySelector('#' + prefix + '-link-hint');

    if (!catSelect || !acteSelect) return;

    catSelect.addEventListener('change', function () {
      var catKey = catSelect.value;
      acteSelect.innerHTML = buildActeOptions(catKey, '');
      // Update color dot
      if (colorDot) {
        colorDot.style.background = catKey ? getCategoryColor(catKey) : 'transparent';
        colorDot.style.display = catKey ? 'inline-block' : 'none';
      }
      // Clear link hint
      if (linkHint) linkHint.innerHTML = '';
      // Reset duration to default
      if (dureeSelect) {
        dureeSelect.innerHTML = buildDurationOptions(30, 30);
      }
    });

    acteSelect.addEventListener('change', function () {
      var catKey = catSelect.value;
      var acteKey = acteSelect.value;
      if (!catKey || !acteKey) return;

      var info = getActeInfo(catKey, acteKey);
      if (!info) return;

      // Auto-fill duration
      if (dureeSelect && info.duree) {
        dureeSelect.innerHTML = buildDurationOptions(info.duree, info.duree);
      }

      // Auto-fill notes
      if (notesField && info.notes) {
        if (!notesField.value.trim()) {
          notesField.value = info.notes;
        }
      }

      // Show linked hint
      if (linkHint) {
        var linked = findLinkedActe(catKey, acteKey);
        if (linked) {
          linkHint.innerHTML = '' +
            '<div style="margin-top:8px;padding:10px 14px;border-radius:8px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);font-size:12px;color:#93c5fd">' +
              '<span style="font-weight:600">Chaîne de soins :</span> Après cet acte, prévoir ' +
              '<strong>' + esc(linked.label) + '</strong> dans ' + linked.delai_jours + ' jours' +
            '</div>';
        } else {
          linkHint.innerHTML = '';
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // FULLSCREEN TOGGLE
  // ---------------------------------------------------------------------------
  function toggleFullscreen() {
    var wrap = _container ? _container.querySelector('.ja-agenda-wrap') : null;
    if (!wrap) return;
    _isFullscreen = !_isFullscreen;
    if (_isFullscreen) {
      wrap.classList.add('ja-fullscreen');
    } else {
      wrap.classList.remove('ja-fullscreen');
    }
    // Update button text
    var btn = _container.querySelector('#ja-fullscreen-btn');
    if (btn) {
      btn.textContent = _isFullscreen ? 'Réduire' : 'Plein écran';
    }
    // Show/hide close button
    var closeBtn = _container.querySelector('#ja-fullscreen-close');
    if (closeBtn) {
      closeBtn.style.display = _isFullscreen ? 'flex' : 'none';
    }
    // Redraw to update cell heights
    draw();
  }

  // ---------------------------------------------------------------------------
  // CURRENT TIME INDICATOR
  // ---------------------------------------------------------------------------
  function updateCurrentTimeIndicator() {
    // Remove existing indicators
    var existing = _container ? _container.querySelectorAll('.ja-current-time-line') : [];
    for (var e = 0; e < existing.length; e++) {
      existing[e].remove();
    }

    if (!_container) return;

    var now = new Date();
    var nowMin = minutesSinceMidnight(now);
    var nowHour = Math.floor(nowMin / 60);
    if (nowHour < START_HOUR || nowHour >= END_HOUR) return;

    // Find today's column
    var todayCells = _container.querySelectorAll('.ja-cell.ja-today-col');
    if (todayCells.length === 0) return;

    // Find the cell for the current hour
    for (var c = 0; c < todayCells.length; c++) {
      var cellHour = parseInt(todayCells[c].getAttribute('data-hour'));
      if (cellHour === nowHour) {
        var cellH = getCellHeight();
        var offsetInHour = (nowMin - nowHour * 60) / 60 * cellH;
        var line = document.createElement('div');
        line.className = 'ja-current-time-line';
        line.style.cssText = 'position:absolute;left:0;right:0;top:' + offsetInHour + 'px;height:2px;background:#ef4444;z-index:4;pointer-events:none;box-shadow:0 0 6px rgba(239,68,68,.5);';
        // Red dot on the left
        var dot = document.createElement('div');
        dot.style.cssText = 'position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#ef4444;';
        line.appendChild(dot);
        todayCells[c].style.position = 'relative';
        todayCells[c].appendChild(line);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DELAY BANNER UPDATE
  // ---------------------------------------------------------------------------
  function updateDelayBanner() {
    var banner = _container ? _container.querySelector('#ja-delay-banner') : null;
    if (!banner) return;

    var info = computeRunningDelay();
    if (!info) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'flex';
    banner.style.borderColor = info.color;
    var textEl = banner.querySelector('.ja-delay-text');
    var dotEl = banner.querySelector('.ja-delay-dot');
    if (textEl) {
      textEl.textContent = info.label;
      textEl.style.color = info.color;
    }
    if (dotEl) {
      dotEl.style.background = info.color;
    }
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
      '@keyframes jadomi-slideDown{from{transform:translateY(-16px);opacity:0}to{transform:translateY(0);opacity:1}}\n' +
      '@keyframes jadomi-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}\n' +
      '.ja-agenda-wrap{font-family:Inter,system-ui,sans-serif;color:#e5e5e5}\n' +
      '.ja-agenda-wrap.ja-fullscreen{position:fixed;inset:0;z-index:9998;background:#0a0a0f;padding:8px 12px;overflow-y:auto;box-sizing:border-box;display:flex;flex-direction:column}\n' +
      '.ja-fullscreen .ja-grid-scroll{flex:1;overflow-y:auto}\n' +
      '.ja-fullscreen .ja-agenda-nav{flex-shrink:0;margin-bottom:6px}\n' +
      '.ja-fullscreen .ja-legend{flex-shrink:0;margin-top:6px}\n' +
      '.ja-agenda-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}\n' +
      '.ja-agenda-nav button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#e5e5e5;padding:8px 18px;border-radius:10px;cursor:pointer;font-size:14px;font-family:Inter,sans-serif;transition:all .2s}\n' +
      '.ja-agenda-nav button:hover{background:rgba(13,148,136,.25);border-color:#0d9488}\n' +
      '.ja-agenda-nav .ja-week-label{font-size:16px;font-weight:600;color:#fff}\n' +
      '.ja-grid-scroll{overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,.06)}\n' +
      '.ja-grid{display:grid;min-width:720px}\n' +
      '.ja-grid-header{background:rgba(255,255,255,.04);padding:10px 6px;text-align:center;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid rgba(255,255,255,.06);color:#a3a3a3}\n' +
      '.ja-grid-header.ja-today-col{color:#0d9488;background:rgba(13,148,136,.08)}\n' +
      '.ja-time-label{padding:4px 6px;font-size:11px;color:#737373;text-align:right;border-bottom:1px solid rgba(255,255,255,.03);display:flex;align-items:flex-start;justify-content:flex-end}\n' +
      '.ja-cell{position:relative;border-bottom:1px solid rgba(255,255,255,.03);border-left:1px solid rgba(255,255,255,.03);min-height:64px;cursor:pointer;transition:background .15s}\n' +
      '.ja-fullscreen .ja-cell{min-height:calc((100vh - 140px) / 11)}\n' +
      '.ja-cell:hover{background:rgba(255,255,255,.02)}\n' +
      '.ja-cell.ja-today-col{background:rgba(13,148,136,.03)}\n' +
      '.ja-cell.ja-today-col:hover{background:rgba(13,148,136,.07)}\n' +
      '.ja-cell .ja-half-hour-mark{position:absolute;left:0;right:0;top:50%;height:0;border-top:1px dashed rgba(255,255,255,.06);pointer-events:none;z-index:1}\n' +
      '.ja-appt{position:absolute;left:3px;right:3px;border-radius:6px;padding:4px 7px;font-size:11px;line-height:1.3;overflow:hidden;cursor:pointer;z-index:2;transition:transform .15s,box-shadow .15s;border:1px solid rgba(255,255,255,.1)}\n' +
      '.ja-appt:hover{transform:scale(1.03);box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:3}\n' +
      '.ja-appt-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n' +
      '.ja-appt-sub{opacity:.8;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n' +
      '.ja-appt-time{opacity:.7;font-size:9px}\n' +
      '.ja-delay-badge{display:inline-block;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600;margin-left:4px;vertical-align:middle;line-height:1.4}\n' +
      '.ja-delay-early{background:rgba(16,185,129,.2);color:#34d399}\n' +
      '.ja-delay-late{background:rgba(239,68,68,.2);color:#f87171}\n' +
      '.ja-delay-inprogress{background:rgba(156,163,175,.2);color:#9ca3af}\n' +
      '.ja-delay-banner{display:none;align-items:center;gap:10px;padding:10px 18px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:12px;font-family:Inter,sans-serif;font-size:14px;animation:jadomi-fadeIn .3s ease}\n' +
      '.ja-delay-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}\n' +
      '.ja-delay-text{font-weight:600}\n' +
      '.ja-duration-stats{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.04)}\n' +
      '.ja-duration-stat{font-size:11px;color:#737373}\n' +
      '.ja-duration-stat strong{color:#a3a3a3;font-weight:500}\n' +
      '.ja-legend{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;justify-content:center}\n' +
      '.ja-legend-item{display:flex;align-items:center;gap:4px;font-size:10px;color:#a3a3a3}\n' +
      '.ja-legend-dot{width:8px;height:8px;border-radius:3px}\n' +
      '.ja-modal-title{font-size:18px;font-weight:700;margin-bottom:16px;color:#fff}\n' +
      '.ja-modal-field{margin-bottom:12px}\n' +
      '.ja-modal-field label{display:block;font-size:12px;color:#a3a3a3;margin-bottom:4px}\n' +
      '.ja-modal-field .val{font-size:14px;color:#e5e5e5}\n' +
      '.ja-modal-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box}\n' +
      '.ja-modal-input:focus{outline:none;border-color:#0d9488}\n' +
      '.ja-modal-select{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#1c1c28;color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box}\n' +
      '.ja-modal-select:focus{outline:none;border-color:#0d9488}\n' +
      '.ja-modal-select option{background:#1c1c28;color:#e5e5e5;padding:8px}\n' +
      '.ja-modal-textarea{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#e5e5e5;font-size:14px;font-family:Inter,sans-serif;box-sizing:border-box;resize:vertical;min-height:60px}\n' +
      '.ja-modal-textarea:focus{outline:none;border-color:#0d9488}\n' +
      '.ja-btn-primary{background:#0d9488;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s}\n' +
      '.ja-btn-primary:hover{background:#0f766e}\n' +
      '.ja-btn-primary:disabled{opacity:.5;cursor:not-allowed}\n' +
      '.ja-btn-danger{background:#ef4444;color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:background .2s}\n' +
      '.ja-btn-danger:hover{background:#dc2626}\n' +
      '.ja-btn-ghost{background:transparent;color:#a3a3a3;border:1px solid rgba(255,255,255,.08);padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-ghost:hover{color:#e5e5e5;border-color:rgba(255,255,255,.2)}\n' +
      '.ja-btn-edit{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3);padding:10px 20px;border-radius:10px;font-size:14px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-edit:hover{background:rgba(59,130,246,.25)}\n' +
      '.ja-btn-start{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3);padding:8px 14px;border-radius:8px;font-size:13px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-start:hover{background:rgba(16,185,129,.25)}\n' +
      '.ja-btn-start:disabled{opacity:.5;cursor:not-allowed}\n' +
      '.ja-btn-stop{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3);padding:8px 14px;border-radius:8px;font-size:13px;font-family:Inter,sans-serif;cursor:pointer;transition:all .2s}\n' +
      '.ja-btn-stop:hover{background:rgba(245,158,11,.25)}\n' +
      '.ja-btn-stop:disabled{opacity:.5;cursor:not-allowed}\n' +
      '.ja-spinner{display:flex;align-items:center;justify-content:center;padding:60px;color:#737373;font-size:14px;gap:10px}\n' +
      '.ja-spinner-icon{width:20px;height:20px;border:2px solid rgba(13,148,136,.2);border-top-color:#0d9488;border-radius:50%;animation:jadomi-spin .8s linear infinite}\n' +
      '.ja-btn-seed{background:rgba(13,148,136,.15);border:1px solid #0d9488;color:#0d9488;font-weight:600}\n' +
      '.ja-btn-seed:hover{background:rgba(13,148,136,.3)}\n' +
      '.ja-fullscreen-close{position:fixed;top:16px;right:16px;z-index:9999;width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#e5e5e5;font-size:20px;cursor:pointer;display:none;align-items:center;justify-content:center;font-family:Inter,sans-serif;transition:all .2s}\n' +
      '.ja-fullscreen-close:hover{background:rgba(239,68,68,.2);border-color:#ef4444;color:#f87171}\n' +
      // ── Quick action buttons sur les blocs RDV ──
      '.ja-quick-actions{position:absolute;bottom:2px;right:4px;display:flex;gap:3px;z-index:4}\n' +
      '.ja-quick-arrive{background:rgba(34,197,94,.9);color:#fff;border:none;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;transition:all .2s;line-height:1.4}\n' +
      '.ja-quick-arrive:hover{background:#22c55e;transform:scale(1.1)}\n' +
      '.ja-quick-go{background:linear-gradient(135deg,#0d9488,#14b8a6);color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;transition:all .2s;letter-spacing:.5px;box-shadow:0 2px 8px rgba(13,148,136,.4)}\n' +
      '.ja-quick-go:hover{transform:scale(1.1);box-shadow:0 4px 16px rgba(13,148,136,.6)}\n' +
      '.ja-quick-copilot{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;transition:all .2s;box-shadow:0 2px 8px rgba(124,58,237,.4)}\n' +
      '.ja-quick-copilot:hover{transform:scale(1.1);box-shadow:0 4px 16px rgba(124,58,237,.6)}\n' +
      '.ja-quick-stop{background:rgba(245,158,11,.9);color:#fff;border:none;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;transition:all .2s}\n' +
      '.ja-quick-stop:hover{background:#f59e0b;transform:scale(1.1)}\n' +
      // ── Copilot bar PREMIUM glassmorphism ──
      '.ja-copilot-bar{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:linear-gradient(135deg,rgba(13,148,136,.15),rgba(15,15,30,.95));border-top:2px solid rgba(13,148,136,.5);padding:16px 28px;display:flex;align-items:center;gap:20px;backdrop-filter:blur(20px);font-family:Inter,sans-serif;box-shadow:0 -8px 32px rgba(0,0,0,.5),0 -2px 8px rgba(13,148,136,.2);animation:jadomi-copilot-slideUp .4s cubic-bezier(.16,1,.3,1)}\n' +
      '@keyframes jadomi-copilot-slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}\n' +
      '.ja-copilot-pulse{width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#f97316);animation:jadomi-copilot-pulse 1.2s ease-in-out infinite;flex-shrink:0;box-shadow:0 0 12px rgba(239,68,68,.5)}\n' +
      '@keyframes jadomi-copilot-pulse{0%,100%{box-shadow:0 0 4px rgba(239,68,68,.4),0 0 12px rgba(239,68,68,.2)}50%{box-shadow:0 0 8px rgba(239,68,68,.8),0 0 24px rgba(239,68,68,.4)}}\n' +
      '.ja-copilot-info{flex-shrink:0}\n' +
      '.ja-copilot-patient{font-weight:700;color:#fff;font-size:15px;text-shadow:0 1px 4px rgba(0,0,0,.3)}\n' +
      '.ja-copilot-acte{font-size:12px;color:#5eead4}\n' +
      '#ja-copilot-acte-display{font-size:12px;color:#5eead4}\n' +
      '.ja-copilot-timer{font-size:28px;font-weight:800;color:#14b8a6;font-variant-numeric:tabular-nums;min-width:80px;flex-shrink:0;text-shadow:0 0 16px rgba(20,184,166,.4);letter-spacing:1px}\n' +
      '.ja-copilot-transcript{flex:1;font-size:12px;color:#a3a3a3;max-height:50px;overflow-y:auto;line-height:1.5;padding:4px 16px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid rgba(255,255,255,.06)}\n' +
      '.ja-copilot-transcript .interim{color:#525252;font-style:italic}\n' +
      '.ja-copilot-stop{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;padding:12px 32px;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;transition:all .2s;flex-shrink:0;box-shadow:0 4px 16px rgba(239,68,68,.3);letter-spacing:.5px;text-transform:uppercase}\n' +
      '.ja-copilot-stop:hover{transform:scale(1.05);box-shadow:0 6px 24px rgba(239,68,68,.5)}\n';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // RENDER ENTRY POINT
  // ---------------------------------------------------------------------------
  var _drawInProgress = false;
  function renderAgenda(container) {
    _container = container;
    loadSettings();
    injectStyles();
    if (_drawInProgress) return; // Empêcher double appel
    // Load catalogue then draw
    loadCatalogue().then(function () {
      draw();
    });
  }

  function refreshAgenda() {
    if (_container) draw();
  }

  // ---------------------------------------------------------------------------
  // DRAW — Main render + API fetch
  // ---------------------------------------------------------------------------
  async function draw() {
    if (_drawInProgress) return;
    _drawInProgress = true;

    // Clear intervals
    if (_currentTimeInterval) { clearInterval(_currentTimeInterval); _currentTimeInterval = null; }
    if (_delayInterval) { clearInterval(_delayInterval); _delayInterval = null; }

    var monday = getMonday(_weekOffset);
    var daysToFetch = (_settings ? _settings.daysCount : 6) - 1;
    var saturday = new Date(monday);
    saturday.setDate(saturday.getDate() + daysToFetch);

    // Build day dates
    var daysCount = _settings ? _settings.daysCount : 6;
    var dayDates = [];
    for (var i = 0; i < daysCount; i++) {
      var dd = new Date(monday);
      dd.setDate(dd.getDate() + i);
      dayDates.push(dd);
    }

    // Render skeleton with spinner
    renderSkeleton(monday, dayDates);
    showSpinner();

    // Fetch appointments from API
    var debut = formatISODate(monday);
    var fin = formatISODate(saturday);

    try {
      _loading = true;
      var data = await apiGet(debut, fin);
      var rawList = data.rdv || data.appointments || data.rdvs || data.agenda || data.data || [];
      _appointments = rawList.map(parseAppointment);
    } catch (e) {
      if (e.message !== '401') {
        showToast('Impossible de charger l\'agenda : ' + e.message, 'error');
      }
      // Garder les anciens RDV si on en avait, sinon vider
      if (_appointments.length === 0) _appointments = [];
    } finally {
      _loading = false;
    }

    // Render final avec les données
    renderSkeleton(monday, dayDates);
    placeAppointments(_appointments, monday);
    bindEvents(monday, dayDates);

    // Start current time indicator (update every 60s)
    updateCurrentTimeIndicator();
    _currentTimeInterval = setInterval(updateCurrentTimeIndicator, 60000);

    // Start delay banner updates (every 30s)
    updateDelayBanner();
    _delayInterval = setInterval(updateDelayBanner, 30000);

    _drawInProgress = false;
  }

  // ---------------------------------------------------------------------------
  // RENDER SKELETON (grid, nav, legend, delay banner, stats)
  // ---------------------------------------------------------------------------
  function renderSkeleton(monday, dayDates) {
    var html = '<div class="ja-agenda-wrap' + (_isFullscreen ? ' ja-fullscreen' : '') + '">';

    // Fullscreen close button
    html += '<button class="ja-fullscreen-close" id="ja-fullscreen-close" style="display:' + (_isFullscreen ? 'flex' : 'none') + '" title="Fermer le plein écran">&#x2715;</button>';

    // Navigation
    html += '<div class="ja-agenda-nav">';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button id="ja-prev-week">&larr; Semaine précédente</button>';
    html += '<button id="ja-today-btn">Aujourd\'hui</button>';
    html += '</div>';
    html += '<span class="ja-week-label">' + formatWeekLabel(monday) + '</span>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button id="ja-settings-btn" style="display:flex;align-items:center;gap:5px">&#9881; Paramètres</button>';
    html += '<button id="ja-fullscreen-btn">' + (_isFullscreen ? 'Réduire' : 'Plein écran') + '</button>';
    html += '<button id="ja-history-btn" style="display:flex;align-items:center;gap:5px;position:relative">&#128465; Annulés' + (_cancelledHistory.length > 0 ? ' <span style="background:#ef4444;color:#fff;font-size:10px;padding:1px 5px;border-radius:8px;font-weight:700">' + _cancelledHistory.length + '</span>' : '') + '</button>';
    html += '<button id="ja-qrcode-btn" style="display:flex;align-items:center;gap:5px">&#9634; QR Check-in</button>';
    html += '<button id="ja-seed-btn" class="ja-btn-seed">Générer des RDV de test</button>';
    html += '<button id="ja-next-week">Semaine suivante &rarr;</button>';
    html += '</div>';
    html += '</div>';

    // Delay banner
    html += '<div class="ja-delay-banner" id="ja-delay-banner">';
    html += '<div class="ja-delay-dot"></div>';
    html += '<span class="ja-delay-text"></span>';
    html += '</div>';

    // Grid
    var gridDaysCount = dayDates.length;
    var settingsCellH = (_settings && _settings.cellHeight) ? _settings.cellHeight : 64;
    var useHalfHour = (_settings && _settings.increment === 30);
    html += '<div class="ja-grid-scroll"><div class="ja-grid" style="grid-template-columns:60px repeat(' + gridDaysCount + ',1fr)">';

    // Header row
    html += '<div class="ja-grid-header" style="color:#525252"></div>';
    for (var d = 0; d < gridDaysCount; d++) {
      var todayClass = isToday(dayDates[d]) ? ' ja-today-col' : '';
      html += '<div class="ja-grid-header' + todayClass + '">' + DAYS[d] + ' ' + formatDate(dayDates[d]) + '</div>';
    }

    // Pause déjeuner highlight
    var pauseDebutMin = 0;
    var pauseFinMin = 0;
    if (_settings) {
      var pdParts = _settings.pauseDebut.split(':');
      pauseDebutMin = parseInt(pdParts[0]) * 60 + parseInt(pdParts[1]);
      var pfParts = _settings.pauseFin.split(':');
      pauseFinMin = parseInt(pfParts[0]) * 60 + parseInt(pfParts[1]);
    }

    // Hour rows (or half-hour rows)
    if (useHalfHour) {
      for (var h = START_HOUR; h < END_HOUR; h++) {
        // First half: :00
        html += '<div class="ja-time-label">' + pad(h) + ':00</div>';
        for (var d2 = 0; d2 < gridDaysCount; d2++) {
          var todayCls = isToday(dayDates[d2]) ? ' ja-today-col' : '';
          var inPause00 = (h * 60 >= pauseDebutMin && h * 60 < pauseFinMin);
          var pauseStyle00 = inPause00 ? 'background:rgba(255,255,255,.02);' : '';
          html += '<div class="ja-cell' + todayCls + '" data-day="' + d2 + '" data-hour="' + h + '" data-half="0" style="min-height:' + (settingsCellH / 2) + 'px;' + pauseStyle00 + '">' +
            '</div>';
        }
        // Second half: :30
        html += '<div class="ja-time-label" style="font-size:10px;color:#525252">' + pad(h) + ':30</div>';
        for (var d3 = 0; d3 < gridDaysCount; d3++) {
          var todayCls2 = isToday(dayDates[d3]) ? ' ja-today-col' : '';
          var inPause30 = ((h * 60 + 30) >= pauseDebutMin && (h * 60 + 30) < pauseFinMin);
          var pauseStyle30 = inPause30 ? 'background:rgba(255,255,255,.02);' : '';
          html += '<div class="ja-cell' + todayCls2 + '" data-day="' + d3 + '" data-hour="' + h + '" data-half="30" style="min-height:' + (settingsCellH / 2) + 'px;' + pauseStyle30 + '">' +
            '</div>';
        }
      }
    } else {
      for (var h = START_HOUR; h < END_HOUR; h++) {
        html += '<div class="ja-time-label">' + pad(h) + ':00</div>';
        var inPauseH = (h * 60 >= pauseDebutMin && h * 60 < pauseFinMin);
        for (var d2 = 0; d2 < gridDaysCount; d2++) {
          var todayCls = isToday(dayDates[d2]) ? ' ja-today-col' : '';
          var pauseStyleH = inPauseH ? 'background:rgba(255,255,255,.02);' : '';
          html += '<div class="ja-cell' + todayCls + '" data-day="' + d2 + '" data-hour="' + h + '" style="min-height:' + settingsCellH + 'px;' + pauseStyleH + '">' +
            '<div class="ja-half-hour-mark"></div>' +
            '</div>';
        }
      }
    }

    html += '</div></div>';

    // Legend — show categories (dynamic from catalog)
    html += '<div class="ja-legend">';
    var cats = getCategoryKeys();
    for (var t = 0; t < cats.length; t++) {
      html += '<div class="ja-legend-item"><div class="ja-legend-dot" style="background:' + getCategoryColor(cats[t]) + '"></div>' + esc(getCategoryLabel(cats[t])) + '</div>';
    }
    html += '</div>';

    // Duration stats area
    html += '<div class="ja-duration-stats" id="ja-duration-stats"></div>';

    html += '</div>';

    _container.innerHTML = html;

    // Render duration stats if we have data
    renderDurationStats();
  }

  function renderDurationStats() {
    var statsEl = _container ? _container.querySelector('#ja-duration-stats') : null;
    if (!statsEl) return;

    var stats = computeDurationStats();
    var keys = Object.keys(stats);
    if (keys.length === 0) {
      statsEl.innerHTML = '<div class="ja-duration-stat" style="color:#525252">Temps moyen — Aucune donnée de suivi disponible</div>';
      return;
    }

    var html = '<div class="ja-duration-stat" style="color:#737373;font-weight:600">Temps moyen —</div>';
    for (var i = 0; i < keys.length; i++) {
      var s = stats[keys[i]];
      var avgActual = Math.round(s.totalActual / s.count);
      var avgPlanned = Math.round(s.totalPlanned / s.count);
      html += '<div class="ja-duration-stat"><strong>' + esc(keys[i]) + '</strong> : ' + avgActual + 'min (vs ' + avgPlanned + ' prévu)</div>';
      if (i < keys.length - 1) html += '<div class="ja-duration-stat" style="color:#333">|</div>';
    }
    statsEl.innerHTML = html;
  }

  function showSpinner() {
    // Insert spinner overlay inside the grid scroll area
    var gridScroll = _container.querySelector('.ja-grid-scroll');
    if (gridScroll) {
      var spinner = document.createElement('div');
      spinner.className = 'ja-spinner';
      spinner.innerHTML = '<div class="ja-spinner-icon"></div> Chargement de l\'agenda...';
      spinner.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,.7);z-index:5;border-radius:12px;';
      gridScroll.style.position = 'relative';
      gridScroll.appendChild(spinner);
    }
  }

  // ---------------------------------------------------------------------------
  // PLACE APPOINTMENTS ON GRID
  // ---------------------------------------------------------------------------
  function placeAppointments(appointments, monday) {
    var cells = _container.querySelectorAll('.ja-cell');
    var cellMap = {};
    for (var c = 0; c < cells.length; c++) {
      var key = cells[c].getAttribute('data-day') + '-' + cells[c].getAttribute('data-hour');
      cellMap[key] = cells[c];
    }

    var cellH = getCellHeight();

    // Pré-calculer les colonnes de chevauchement par jour
    var daySlots = {}; // dayIdx → [{startMin, endMin, col}]
    for (var i = 0; i < appointments.length; i++) {
      var a = appointments[i];
      var aDate = new Date(a.start.getFullYear(), a.start.getMonth(), a.start.getDate());
      var mDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
      var di = Math.round((aDate - mDate) / 86400000);
      var maxDayIdx = (_settings ? _settings.daysCount : 6) - 1;
      if (di < 0 || di > maxDayIdx) continue;
      if (!daySlots[di]) daySlots[di] = [];
      var sMin = minutesSinceMidnight(a.start);
      var eMin = minutesSinceMidnight(a.end);
      // Trouver la première colonne libre
      var col = 0;
      var maxCol = 0;
      for (var j = 0; j < daySlots[di].length; j++) {
        var s = daySlots[di][j];
        if (sMin < s.endMin && eMin > s.startMin) { // chevauchement
          if (s.col >= col) col = s.col + 1;
          if (s.col > maxCol) maxCol = s.col;
        }
      }
      daySlots[di].push({ startMin: sMin, endMin: eMin, col: col, idx: i });
      a._overlapCol = col;
      a._overlapMax = 0; // sera recalculé après
    }
    // Recalculer le nombre max de colonnes par groupe de chevauchement
    for (var di2 in daySlots) {
      var slots = daySlots[di2];
      for (var s1 = 0; s1 < slots.length; s1++) {
        var maxInGroup = 0;
        for (var s2 = 0; s2 < slots.length; s2++) {
          if (slots[s1].startMin < slots[s2].endMin && slots[s1].endMin > slots[s2].startMin) {
            if (slots[s2].col > maxInGroup) maxInGroup = slots[s2].col;
          }
        }
        appointments[slots[s1].idx]._overlapMax = maxInGroup;
      }
    }

    for (var i = 0; i < appointments.length; i++) {
      var apt = appointments[i];
      var aptDate = new Date(apt.start.getFullYear(), apt.start.getMonth(), apt.start.getDate());
      var monDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
      var dayIdx = Math.round((aptDate - monDate) / 86400000);
      var maxDay = (_settings ? _settings.daysCount : 6) - 1;
      if (dayIdx < 0 || dayIdx > maxDay) continue;

      var startMin = minutesSinceMidnight(apt.start);
      var endMin = minutesSinceMidnight(apt.end);
      var startHour = Math.floor(startMin / 60);
      if (startHour < START_HOUR || startHour >= END_HOUR) continue;

      var cell = cellMap[dayIdx + '-' + startHour];
      if (!cell) continue;

      var offsetInHour = (startMin - startHour * 60) / 60 * cellH;
      var height = Math.max(22, (endMin - startMin) / 60 * cellH);
      var color = getCategoryColor(apt.categorie);
      var dur = durationMin(apt.start, apt.end);

      // Calcul position horizontale si chevauchement
      var oCol = apt._overlapCol || 0;
      var oMax = apt._overlapMax || 0;
      var totalCols = oMax + 1;
      var leftPct = totalCols > 1 ? (oCol / totalCols * 100) : 0;
      var widthPct = totalCols > 1 ? (100 / totalCols) : 100;

      // Resolve acte label
      var acteLabel = findActeLabel(apt.categorie, apt.acte);
      if (!acteLabel && apt.acte) acteLabel = apt.acte;
      if (!acteLabel) acteLabel = getCategoryLabel(apt.categorie);

      // Delay badge + statut badge
      var badge = buildDelayBadge(apt);
      var statutBadge = buildStatutBadge(apt);

      // Indicateur email lu / confirmé
      var emailBadge = '';
      if (apt.email_confirmed) {
        emailBadge = ' <span title="Patient a confirmé" style="font-size:9px;vertical-align:middle">&#9989;</span>';
      } else if (apt.email_opened) {
        emailBadge = ' <span title="Email lu" style="font-size:9px;vertical-align:middle">&#128233;</span>';
      } else if (apt.email_sent) {
        emailBadge = ' <span title="Email envoyé, pas encore lu" style="font-size:9px;vertical-align:middle;opacity:.5">&#128233;</span>';
      }

      var el = document.createElement('div');
      el.className = 'ja-appt';
      // Border left color based on statut
      var borderColor = color;
      if (apt.statut === 'absent') borderColor = '#6b7280';
      else if (apt.statut === 'arrive') borderColor = '#22c55e';
      else if (apt.statut === 'en_soin') borderColor = '#f59e0b';
      else if (apt.statut === 'termine') borderColor = '#0d9488';
      var bgOpacity = apt.statut === 'absent' ? '08' : '18';
      var posStyle = totalCols > 1 ? 'left:' + leftPct + '%;width:' + widthPct + '%;right:auto;' : 'left:3px;right:3px;';
      el.style.cssText = 'top:' + offsetInHour + 'px;height:' + height + 'px;' + posStyle + 'background:' + color + bgOpacity + ';border-left:3px solid ' + borderColor + ';color:' + color + (apt.statut === 'absent' ? ';opacity:.5;text-decoration:line-through' : '');

      // Multi-actes : afficher le nombre d'actes si > 1
      var multiActeInfo = '';
      if (apt.actes && apt.actes.length > 1) {
        multiActeInfo = ' <span style="background:rgba(255,255,255,.15);padding:1px 5px;border-radius:4px;font-size:10px">' + apt.actes.length + ' actes</span>';
      }

      var innerHtml = '<div class="ja-appt-name">' + esc(apt.patient) + emailBadge + statutBadge + badge + multiActeInfo + '</div>';
      innerHtml += '<div class="ja-appt-sub">' + esc(acteLabel) + ' — ' + dur + ' min</div>';
      if (height > 30) {
        innerHtml += '<div class="ja-appt-time">' + timeStr(apt.start) + ' - ' + timeStr(apt.end) + '</div>';
      }

      // ── Boutons d'action rapide directement sur le bloc ──
      var quickActions = '';
      var isSolo = _settings && _settings.modeSolo;

      if (height >= 40) {
        if (apt.statut === 'planifie' || !apt.statut) {
          if (isSolo) {
            // Mode solo : UN SEUL BOUTON → arrivé + soin + copilot
            quickActions = '<div class="ja-quick-actions" onclick="event.stopPropagation()">' +
              '<button class="ja-quick-go" data-aptid="' + apt.id + '" title="Arrivé + Démarrer le soin">GO</button>' +
            '</div>';
          } else {
            quickActions = '<div class="ja-quick-actions" onclick="event.stopPropagation()">' +
              '<button class="ja-quick-arrive" data-aptid="' + apt.id + '" title="Patient arrivé">✓</button>' +
            '</div>';
          }
        } else if (apt.statut === 'arrive' && !apt.heure_debut_reelle) {
          quickActions = '<div class="ja-quick-actions" onclick="event.stopPropagation()">' +
            '<button class="ja-quick-copilot" data-aptid="' + apt.id + '" title="Démarrer Copilot">▶ Copilot</button>' +
          '</div>';
        } else if (apt.heure_debut_reelle && !apt.heure_fin_reelle) {
          quickActions = '<div class="ja-quick-actions" onclick="event.stopPropagation()">' +
            '<button class="ja-quick-stop" data-aptid="' + apt.id + '" title="Terminer le soin">■ Fin</button>' +
          '</div>';
        }
      }

      el.innerHTML = innerHtml + quickActions;

      el.addEventListener('click', (function (a) {
        return function (e) { e.stopPropagation(); showDetailModal(a); };
      })(apt));

      // ── Drag & drop pour déplacer les RDV ──
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (function (a) {
        return function (e) {
          e.dataTransfer.setData('text/plain', a.id);
          e.dataTransfer.effectAllowed = 'move';
          el.style.opacity = '0.5';
          _dragApt = a;
        };
      })(apt));
      el.addEventListener('dragend', function () {
        el.style.opacity = '1';
        _dragApt = null;
      });

      // ── Clic droit : menu contextuel ──
      el.addEventListener('contextmenu', (function (a) {
        return function (e) {
          e.preventDefault();
          e.stopPropagation();
          showContextMenu(e, a);
        };
      })(apt));

      // ── Bind quick action buttons ──
      var quickArriveBtn = el.querySelector('.ja-quick-arrive');
      var quickGoBtn = el.querySelector('.ja-quick-go');
      var quickCopilotBtn = el.querySelector('.ja-quick-copilot');
      var quickStopBtn = el.querySelector('.ja-quick-stop');

      if (quickArriveBtn) {
        quickArriveBtn.addEventListener('click', (function (a) {
          return function (e) {
            e.stopPropagation();
            quickPatientArrive(a);
          };
        })(apt));
      }
      if (quickGoBtn) {
        quickGoBtn.addEventListener('click', (function (a) {
          return function (e) {
            e.stopPropagation();
            quickSoloGo(a);
          };
        })(apt));
      }
      if (quickCopilotBtn) {
        quickCopilotBtn.addEventListener('click', (function (a) {
          return function (e) {
            e.stopPropagation();
            copilotStart(a);
          };
        })(apt));
      }
      if (quickStopBtn) {
        quickStopBtn.addEventListener('click', (function (a) {
          return function (e) {
            e.stopPropagation();
            if (_copilotActive && _copilotAptId === a.id) copilotStop();
            else quickTerminer(a);
          };
        })(apt));
      }

      cell.appendChild(el);
    }
  }

  // ---------------------------------------------------------------------------
  // BIND EVENTS
  // ---------------------------------------------------------------------------
  function bindEvents(monday, dayDates) {
    var prevBtn = document.getElementById('ja-prev-week');
    var nextBtn = document.getElementById('ja-next-week');
    var todayBtn = document.getElementById('ja-today-btn');
    var seedBtn = document.getElementById('ja-seed-btn');
    var fullscreenBtn = document.getElementById('ja-fullscreen-btn');
    var fullscreenClose = document.getElementById('ja-fullscreen-close');
    var settingsBtn = document.getElementById('ja-settings-btn');

    if (prevBtn) prevBtn.addEventListener('click', function () { _weekOffset--; draw(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { _weekOffset++; draw(); });
    if (todayBtn) todayBtn.addEventListener('click', function () { _weekOffset = 0; draw(); });
    if (seedBtn) seedBtn.addEventListener('click', handleSeed);
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
    if (fullscreenClose) fullscreenClose.addEventListener('click', toggleFullscreen);
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);
    var historyBtn = document.getElementById('ja-history-btn');
    if (historyBtn) historyBtn.addEventListener('click', showCancelledHistory);
    var qrcodeBtn = document.getElementById('ja-qrcode-btn');
    if (qrcodeBtn) qrcodeBtn.addEventListener('click', showQRCodeModal);

    // Escape key to exit fullscreen
    if (_isFullscreen) {
      var escHandler = function (e) {
        if (e.key === 'Escape' && _isFullscreen) {
          document.removeEventListener('keydown', escHandler);
          toggleFullscreen();
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    // Click on empty cell -> create appointment
    var cells = _container.querySelectorAll('.ja-cell');
    for (var c = 0; c < cells.length; c++) {
      cells[c].addEventListener('click', function (e) {
        if (e.target.closest('.ja-appt')) return;
        var dayIdx = parseInt(this.getAttribute('data-day'));
        var hour = parseInt(this.getAttribute('data-hour'));
        showAddModal(dayIdx, hour, monday);
      });

      // Drag & drop : accepter les RDV déposés sur une cellule
      cells[c].addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.style.background = 'rgba(13,148,136,.15)';
      });
      cells[c].addEventListener('dragleave', function () {
        this.style.background = '';
      });
      cells[c].addEventListener('drop', (function (mondayRef) {
        return function (e) {
          e.preventDefault();
          this.style.background = '';
          if (!_dragApt) return;
          var dayIdx = parseInt(this.getAttribute('data-day'));
          var hour = parseInt(this.getAttribute('data-hour'));
          handleDrop(_dragApt, dayIdx, hour, mondayRef);
        };
      })(monday));
    }
  }

  // ---------------------------------------------------------------------------
  // SEED HANDLER
  // ---------------------------------------------------------------------------
  async function handleSeed() {
    var seedBtn = document.getElementById('ja-seed-btn');
    if (seedBtn) {
      seedBtn.textContent = 'Génération...';
      seedBtn.disabled = true;
    }
    try {
      var data = await apiSeed();
      var count = (data.count || data.created || 0);
      showToast('RDV de test générés avec succès' + (count ? ' (' + count + ')' : ''), 'success');
      await draw();
    } catch (e) {
      if (e.message !== '401') {
        showToast('Erreur lors de la génération : ' + e.message, 'error');
      }
    } finally {
      var btn2 = document.getElementById('ja-seed-btn');
      if (btn2) {
        btn2.textContent = 'Générer des RDV de test';
        btn2.disabled = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MODALS
  // ---------------------------------------------------------------------------

  // ---- VIEW / EDIT / DELETE MODAL ----
  function showDetailModal(apt) {
    var color = getCategoryColor(apt.categorie);
    var dur = durationMin(apt.start, apt.end);
    var acteLabel = findActeLabel(apt.categorie, apt.acte);
    if (!acteLabel && apt.acte) acteLabel = apt.acte;
    if (!acteLabel) acteLabel = getCategoryLabel(apt.categorie);
    var catLabel = getCategoryLabel(apt.categorie);

    // Build tracking info display
    var trackingHtml = '';
    var debutReelStr = apt.heure_debut_reelle ? timeStrFromISO(apt.heure_debut_reelle) : null;
    var finReelStr = apt.heure_fin_reelle ? timeStrFromISO(apt.heure_fin_reelle) : null;

    if (debutReelStr || finReelStr) {
      trackingHtml += '<div style="margin-top:4px;padding:10px 14px;border-radius:8px;background:rgba(13,148,136,.06);border:1px solid rgba(13,148,136,.15)">';
      trackingHtml += '<div style="font-size:12px;font-weight:600;color:#0d9488;margin-bottom:6px">Suivi du temps</div>';
      if (debutReelStr) {
        var delayMin = computeDelayMinutes(apt);
        var delayLabel = '';
        if (delayMin !== null) {
          if (delayMin <= 0) {
            delayLabel = ' <span style="color:#34d399;font-size:11px">(' + delayMin + ' min)</span>';
          } else {
            delayLabel = ' <span style="color:#f87171;font-size:11px">(+' + delayMin + ' min de retard)</span>';
          }
        }
        trackingHtml += '<div style="font-size:13px;color:#e5e5e5;margin-bottom:2px">Début réel : <strong>' + debutReelStr + '</strong>' + delayLabel + '</div>';
      }
      if (finReelStr) {
        var actualDur = Math.round((new Date(apt.heure_fin_reelle) - new Date(apt.heure_debut_reelle)) / 60000);
        trackingHtml += '<div style="font-size:13px;color:#e5e5e5">Fin réelle : <strong>' + finReelStr + '</strong> (durée réelle : ' + actualDur + ' min vs ' + dur + ' prévu)</div>';
      }
      trackingHtml += '</div>';
    }

    var html = '' +
      '<div class="ja-modal-title" style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:12px;height:12px;border-radius:4px;background:' + color + ';display:inline-block;flex-shrink:0"></span>' +
        '<span>' + esc(apt.patient) + '</span>' +
      '</div>' +
      '<div id="ja-detail-content">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">' +
          '<div class="ja-modal-field"><label>Téléphone</label><div class="val">' + (apt.patient_tel ? '<a href="tel:' + esc(apt.patient_tel) + '" style="color:#14b8a6;text-decoration:none">' + esc(apt.patient_tel) + '</a>' : '—') + '</div></div>' +
          '<div class="ja-modal-field"><label>Email</label><div class="val">' + (apt.patient_email ? '<a href="mailto:' + esc(apt.patient_email) + '" style="color:#14b8a6;text-decoration:none;font-size:12px">' + esc(apt.patient_email) + '</a>' : '—') + '</div></div>' +
        '</div>' +
        '<div class="ja-modal-field"><label>Catégorie</label><div class="val" style="color:' + color + '">' + esc(catLabel) + '</div></div>' +
        '<div class="ja-modal-field"><label>Acte</label><div class="val">' + esc(acteLabel) + '</div></div>' +
        '<div class="ja-modal-field"><label>Horaire</label><div class="val">' + timeStr(apt.start) + ' — ' + timeStr(apt.end) + ' (' + dur + ' min)</div></div>' +
        '<div class="ja-modal-field"><label>Notes</label><div class="val">' + esc(apt.notes || '—') + '</div></div>' +
        trackingHtml +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;flex-wrap:wrap" id="ja-detail-actions">' +
        (apt.statut !== 'absent' && apt.statut !== 'arrive' && apt.statut !== 'en_soin' && apt.statut !== 'termine' ? '<button style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3);padding:10px 16px;border-radius:10px;font-size:13px;font-family:Inter,sans-serif;cursor:pointer" id="ja-detail-arrive">Patient arrivé</button>' : '') +
        (apt.statut !== 'absent' && apt.statut !== 'termine' && !apt.heure_debut_reelle ? '<button style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:10px 16px;border-radius:10px;font-size:13px;font-family:Inter,sans-serif;cursor:pointer" id="ja-detail-absent">Absent</button>' : '') +
        (!apt.heure_debut_reelle && (apt.statut === 'arrive') ? '<button class="ja-btn-start" id="ja-detail-start">Démarrer le soin</button>' : '') +
        (apt.heure_debut_reelle && !apt.heure_fin_reelle ? '<button class="ja-btn-stop" id="ja-detail-stop">Terminer</button>' : '') +
        '<button class="ja-btn-edit" id="ja-detail-edit">Modifier</button>' +
        '<button class="ja-btn-danger" id="ja-detail-delete" style="font-size:12px;padding:8px 12px">Suppr.</button>' +
        '<button class="ja-btn-ghost" data-close>Fermer</button>' +
      '</div>';

    var m = showModal(html);

    // DELETE
    m.box.querySelector('#ja-detail-delete').addEventListener('click', function () {
      showConfirmDelete(apt, m);
    });

    // EDIT
    m.box.querySelector('#ja-detail-edit').addEventListener('click', function () {
      switchToEditMode(apt, m);
    });

    // ARRIVE (Patient arrivé)
    var arriveBtn = m.box.querySelector('#ja-detail-arrive');
    if (arriveBtn) {
      arriveBtn.addEventListener('click', async function () {
        this.textContent = '...';
        this.disabled = true;
        try {
          var nowISO = new Date().toISOString();
          await apiPut(apt.id, { statut: 'arrive', heure_arrivee: nowISO });
          apt.statut = 'arrive';
          apt.heure_arrivee = nowISO;
          var diff = Math.round((new Date(nowISO) - apt.start) / 60000);
          if (diff > 2) showToast('Patient arrivé avec ' + diff + ' min de retard', 'info');
          else if (diff < -2) showToast('Patient arrivé ' + Math.abs(diff) + ' min en avance', 'success');
          else showToast('Patient arrivé à l\'heure', 'success');
          m.close();
          draw();
        } catch (e) {
          if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
          this.textContent = 'Patient arrivé';
          this.disabled = false;
        }
      });
    }

    // ABSENT
    var absentBtn = m.box.querySelector('#ja-detail-absent');
    if (absentBtn) {
      absentBtn.addEventListener('click', function () {
        // Modal choix type d'absence
        var absMod = document.createElement('div');
        absMod.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center';
        absMod.innerHTML = '<div style="background:#1a1917;border:1px solid #2e2c29;border-radius:16px;padding:24px;max-width:340px;width:90%">' +
          '<div style="font-size:16px;font-weight:700;margin-bottom:16px">Type d\'absence</div>' +
          '<button id="ja-abs-noshow" style="width:100%;padding:14px;margin-bottom:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;color:#ef4444;font-size:14px;font-weight:600;cursor:pointer">Absent non excusé (no-show)</button>' +
          '<button id="ja-abs-excuse" style="width:100%;padding:14px;margin-bottom:8px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:10px;color:#fbbf24;font-size:14px;font-weight:600;cursor:pointer">Absent excusé (a prévenu)</button>' +
          '<button id="ja-abs-annul" style="width:100%;padding:14px;margin-bottom:16px;background:rgba(156,163,175,.1);border:1px solid rgba(156,163,175,.3);border-radius:10px;color:#9ca3af;font-size:14px;cursor:pointer">Annulé par le cabinet</button>' +
          '<button id="ja-abs-cancel" style="width:100%;padding:10px;background:none;border:1px solid #333;border-radius:10px;color:#737373;font-size:13px;cursor:pointer">Retour</button>' +
        '</div>';
        document.body.appendChild(absMod);

        absMod.querySelector('#ja-abs-cancel').onclick = function() { document.body.removeChild(absMod); };

        async function markAbsent(type) {
          try {
            await apiPut(apt.id, { statut: 'absent', absence_type: type });
            apt.statut = 'absent';
            apt.absence_type = type;
            var msgs = { noshow: 'Absent non excusé (no-show)', excuse: 'Absent excusé', annule_cabinet: 'Annulé par le cabinet' };
            showToast(msgs[type] || 'Marqué absent');
            document.body.removeChild(absMod);
            m.close();
            draw();
          } catch (e) {
            if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
          }
        }

        absMod.querySelector('#ja-abs-noshow').onclick = function() { markAbsent('noshow'); };
        absMod.querySelector('#ja-abs-excuse').onclick = function() { markAbsent('excuse'); };
        absMod.querySelector('#ja-abs-annul').onclick = function() { markAbsent('annule_cabinet'); };
      });
    }

    // Bouton annuler l'absence (revenir en arrière)
    if (apt.statut === 'absent') {
      var revertDiv = m.box.querySelector('#ja-detail-actions') || m.box;
      var revertBtn = document.createElement('button');
      revertBtn.style.cssText = 'background:rgba(59,130,246,.15);color:#3b82f6;border:1px solid rgba(59,130,246,.3);padding:10px 16px;border-radius:10px;font-size:13px;font-family:Inter,sans-serif;cursor:pointer;margin-top:8px;width:100%';
      revertBtn.textContent = 'Annuler l\'absence (erreur de saisie)';
      revertBtn.addEventListener('click', async function() {
        try {
          await apiPut(apt.id, { statut: 'programmer', absence_type: null });
          apt.statut = 'programmer';
          apt.absence_type = null;
          showToast('Absence annulée — RDV restauré');
          m.close();
          draw();
        } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
      });
      m.box.appendChild(revertBtn);
    }

    // START (Démarrer le soin) + Copilot activation
    var startBtn = m.box.querySelector('#ja-detail-start');
    if (startBtn) {
      startBtn.addEventListener('click', async function () {
        var btn = this;
        btn.textContent = 'Enregistrement...';
        btn.disabled = true;
        try {
          var nowISO = new Date().toISOString();
          await apiPut(apt.id, { heure_debut_reelle: nowISO, statut: 'en_soin' });
          apt.heure_debut_reelle = nowISO;
          apt.statut = 'en_soin';
          showToast('Début enregistré', 'success');
          m.close();
          draw();
          // Activate JADOMI Copilot
          copilotStart(apt);
        } catch (e) {
          if (e.message !== '401') {
            showToast('Erreur : ' + e.message, 'error');
          }
          btn.textContent = 'Démarrer';
          btn.disabled = false;
        }
      });
    }

    // STOP (Terminer) — delegates to Copilot if active
    var stopBtn = m.box.querySelector('#ja-detail-stop');
    if (stopBtn) {
      stopBtn.addEventListener('click', async function () {
        // If Copilot is active for this appointment, delegate to copilotStop
        if (_copilotActive && _copilotAptId === apt.id) {
          m.close();
          copilotStop();
          return;
        }
        var btn = this;
        btn.textContent = 'Enregistrement...';
        btn.disabled = true;
        try {
          var nowISO = new Date().toISOString();
          await apiPut(apt.id, { heure_fin_reelle: nowISO, statut: 'termine' });
          apt.heure_fin_reelle = nowISO;
          showToast('Fin enregistrée', 'success');
          m.close();
          draw();
        } catch (e) {
          if (e.message !== '401') {
            showToast('Erreur : ' + e.message, 'error');
          }
          btn.textContent = 'Terminer';
          btn.disabled = false;
        }
      });
    }
  }

  function showConfirmDelete(apt, parentModal) {
    var confirmHtml = '' +
      '<div class="ja-modal-title" style="color:#ef4444">Confirmer la suppression</div>' +
      '<p style="font-size:14px;color:#a3a3a3;margin-bottom:20px">Voulez-vous vraiment supprimer le rendez-vous de <strong style="color:#e5e5e5">' + esc(apt.patient) + '</strong> ?<br>Cette action est irréversible.</p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Annuler</button>' +
        '<button class="ja-btn-danger" id="ja-confirm-del">Supprimer définitivement</button>' +
      '</div>';

    var cm = showModal(confirmHtml);
    cm.box.querySelector('#ja-confirm-del').addEventListener('click', async function () {
      this.textContent = 'Suppression...';
      this.disabled = true;
      try {
        await apiDelete(apt.id);
        showToast('Rendez-vous supprimé', 'success');
        cm.close();
        parentModal.close();
        draw();
      } catch (e) {
        if (e.message !== '401') {
          showToast('Erreur : ' + e.message, 'error');
        }
        cm.close();
      }
    });
  }

  function switchToEditMode(apt, modal) {
    var content = modal.box.querySelector('#ja-detail-content');
    var actions = modal.box.querySelector('#ja-detail-actions');

    var currentDur = durationMin(apt.start, apt.end);
    var catDefault = null;
    var acteInfo = getActeInfo(apt.categorie, apt.acte);
    if (acteInfo) catDefault = acteInfo.duree;

    content.innerHTML = '' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Nom</label><input class="ja-modal-input" id="ja-edit-nom" value="' + esc(apt.patient_nom || '') + '"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Prénom</label><input class="ja-modal-input" id="ja-edit-prenom" value="' + esc(apt.patient_prenom || '') + '"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Téléphone</label><input class="ja-modal-input" id="ja-edit-tel" value="' + esc(apt.patient_tel || '') + '" placeholder="06 xx xx xx xx"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Email</label><input class="ja-modal-input" id="ja-edit-email" value="' + esc(apt.patient_email || '') + '" type="email" placeholder="email@exemple.fr"></div>' +
      '</div>' +
      '<div class="ja-modal-field">' +
        '<label>Catégorie <span id="ja-edit-color-dot" style="width:10px;height:10px;border-radius:50%;background:' + getCategoryColor(apt.categorie) + ';display:inline-block;vertical-align:middle;margin-left:6px"></span></label>' +
        '<select class="ja-modal-select" id="ja-edit-categorie">' + buildCategoryOptions(apt.categorie) + '</select>' +
      '</div>' +
      '<div class="ja-modal-field">' +
        '<label>Acte</label>' +
        '<select class="ja-modal-select" id="ja-edit-acte">' + buildActeOptions(apt.categorie, apt.acte) + '</select>' +
        '<div id="ja-edit-link-hint"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Date</label><input class="ja-modal-input" id="ja-edit-date" type="date" value="' + formatISODate(apt.start) + '"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Heure</label><input class="ja-modal-input" id="ja-edit-time" type="time" value="' + pad(apt.start.getHours()) + ':' + pad(apt.start.getMinutes()) + '"></div>' +
      '</div>' +
      '<div class="ja-modal-field"><label>Durée</label><select class="ja-modal-select" id="ja-edit-duree">' + buildDurationOptions(catDefault || currentDur, currentDur) + '</select></div>' +
      '<div class="ja-modal-field"><label>Notes</label><textarea class="ja-modal-textarea" id="ja-edit-notes">' + esc(apt.notes || '') + '</textarea></div>';

    actions.innerHTML = '' +
      '<button class="ja-btn-ghost" data-close>Annuler</button>' +
      '<button class="ja-btn-primary" id="ja-edit-save">Enregistrer</button>';

    // Setup cascading dropdowns
    setupCascadingDropdowns('ja-edit', modal.box);

    // Re-bind close
    var closeBtn = actions.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.close(); });

    // Save
    actions.querySelector('#ja-edit-save').addEventListener('click', async function () {
      var saveBtn = this;
      saveBtn.textContent = 'Enregistrement...';
      saveBtn.disabled = true;

      var dateVal = document.getElementById('ja-edit-date').value;
      var timeVal = document.getElementById('ja-edit-time').value;
      var dureeVal = parseInt(document.getElementById('ja-edit-duree').value);
      var catVal = document.getElementById('ja-edit-categorie').value;
      var acteVal = document.getElementById('ja-edit-acte').value;

      var startDt = new Date(dateVal + 'T' + timeVal + ':00');
      var endDt = new Date(startDt.getTime() + dureeVal * 60000);

      var body = {
        patient_nom: document.getElementById('ja-edit-nom').value.trim(),
        patient_prenom: document.getElementById('ja-edit-prenom').value.trim(),
        patient_tel: document.getElementById('ja-edit-tel').value.trim(),
        patient_email: document.getElementById('ja-edit-email').value.trim(),
        categorie: catVal,
        acte: acteVal,
        type: catVal,
        debut: startDt.toISOString(),
        fin: endDt.toISOString(),
        duree: dureeVal,
        notes: document.getElementById('ja-edit-notes').value.trim(),
        heure_debut_reelle: apt.heure_debut_reelle || null,
        heure_fin_reelle: apt.heure_fin_reelle || null
      };

      try {
        await apiPut(apt.id, body);
        showToast('Rendez-vous modifié avec succès', 'success');
        modal.close();
        draw();
      } catch (e) {
        if (e.message !== '401') {
          showToast('Erreur : ' + e.message, 'error');
        }
        saveBtn.textContent = 'Enregistrer';
        saveBtn.disabled = false;
      }
    });
  }

  // ---- CREATE MODAL ----
  // ── Multi-actes : gestion des rangées dans les modals ──

  function setupMultiActeRows(box, prefix) {
    var container = box.querySelector('#' + prefix + '-actes-rows');
    var moreBtn = box.querySelector('#' + prefix + '-acte-more');
    var dureeSel = box.querySelector('#' + prefix + '-duree');

    // Wire up first row
    wireActeRow(container.querySelector('.ja-acte-row'), dureeSel, container);

    // Add more rows
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        var row = document.createElement('div');
        row.className = 'ja-acte-row';
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
        row.innerHTML = '' +
          '<select class="ja-modal-select ja-acte-cat" style="flex:1">' + buildCategoryOptions('') + '</select>' +
          '<select class="ja-modal-select ja-acte-act" style="flex:1"><option value="">Acte...</option></select>' +
          '<input class="ja-modal-input ja-acte-dent" placeholder="Dent" style="width:80px" />' +
          '<span class="ja-acte-duree" style="color:#737373;font-size:12px;min-width:45px">--</span>' +
          '<button type="button" class="ja-acte-remove" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;padding:0 4px" title="Supprimer">&times;</button>';
        container.appendChild(row);
        wireActeRow(row, dureeSel, container);
      });
    }
  }

  function wireActeRow(row, dureeSel, container) {
    var catSel = row.querySelector('.ja-acte-cat');
    var actSel = row.querySelector('.ja-acte-act');
    var dureeSpan = row.querySelector('.ja-acte-duree');
    var removeBtn = row.querySelector('.ja-acte-remove');

    catSel.addEventListener('change', function () {
      actSel.innerHTML = '<option value="">Acte...</option>';
      dureeSpan.textContent = '--';
      if (!catSel.value) return;
      var cat = _catalogue ? _catalogue[catSel.value] : null;
      if (!cat) return;
      var aks = Object.keys(cat.actes);
      for (var i = 0; i < aks.length; i++) {
        actSel.innerHTML += '<option value="' + aks[i] + '">' + esc(cat.actes[aks[i]].label) + '</option>';
      }
    });

    actSel.addEventListener('change', function () {
      if (!catSel.value || !actSel.value) { dureeSpan.textContent = '--'; recalcTotalDuree(container, dureeSel); return; }
      var cat = _catalogue ? _catalogue[catSel.value] : null;
      if (cat && cat.actes[actSel.value]) {
        dureeSpan.textContent = cat.actes[actSel.value].duree + ' min';
      }
      recalcTotalDuree(container, dureeSel);
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        row.remove();
        recalcTotalDuree(container, dureeSel);
      });
    }
  }

  function recalcTotalDuree(container, dureeSel) {
    if (!dureeSel) return;
    var rows = container.querySelectorAll('.ja-acte-row');
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      var catSel = rows[i].querySelector('.ja-acte-cat');
      var actSel = rows[i].querySelector('.ja-acte-act');
      if (catSel && actSel && catSel.value && actSel.value) {
        var cat = _catalogue ? _catalogue[catSel.value] : null;
        if (cat && cat.actes[actSel.value]) {
          total += cat.actes[actSel.value].duree;
        }
      }
    }
    if (total > 0) {
      // Sélectionner la durée la plus proche dans le select
      var options = dureeSel.options;
      var closest = 30;
      for (var j = 0; j < options.length; j++) {
        if (Math.abs(parseInt(options[j].value) - total) < Math.abs(closest - total)) {
          closest = parseInt(options[j].value);
        }
      }
      dureeSel.value = closest;
    }
  }

  function collectActesFromRows(box) {
    var rows = box.querySelectorAll('.ja-acte-row');
    var actes = [];
    for (var i = 0; i < rows.length; i++) {
      var catSel = rows[i].querySelector('.ja-acte-cat');
      var actSel = rows[i].querySelector('.ja-acte-act');
      var dentInput = rows[i].querySelector('.ja-acte-dent');
      if (!catSel || !actSel || !catSel.value || !actSel.value) continue;
      var dents = [];
      if (dentInput && dentInput.value.trim()) {
        var parts = dentInput.value.replace(/[,;]/g, ' ').split(/\s+/);
        for (var j = 0; j < parts.length; j++) {
          var n = parseInt(parts[j]);
          if (n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8) dents.push(n);
        }
      }
      actes.push({ categorie: catSel.value, acte: actSel.value, dents: dents });
    }
    return actes;
  }

  function showAddModal(dayIdx, hour, monday) {
    var dayDate = new Date(monday);
    dayDate.setDate(dayDate.getDate() + dayIdx);
    var dateStr = DAYS[dayIdx] + ' ' + formatDate(dayDate);
    var isoDate = formatISODate(dayDate);

    var html = '' +
      '<div class="ja-modal-title">Nouveau rendez-vous</div>' +
      '<div class="ja-modal-field"><label>Jour</label><div class="val">' + dateStr + '</div></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Nom du patient *</label><input class="ja-modal-input" id="ja-add-nom" placeholder="Nom"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Prénom</label><input class="ja-modal-input" id="ja-add-prenom" placeholder="Prénom"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Téléphone</label><input class="ja-modal-input" id="ja-add-tel" placeholder="06 xx xx xx xx"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Email</label><input class="ja-modal-input" id="ja-add-email" type="email" placeholder="email@exemple.fr"></div>' +
      '</div>' +
      '<div id="ja-add-actes-container">' +
        '<div class="ja-modal-field" style="margin-bottom:4px"><label>Actes <span style="color:#737373;font-size:12px">(ajoutez plusieurs actes pour une même séance)</span></label></div>' +
        '<div id="ja-add-actes-rows">' +
          '<div class="ja-acte-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
            '<select class="ja-modal-select ja-acte-cat" style="flex:1">' + buildCategoryOptions('') + '</select>' +
            '<select class="ja-modal-select ja-acte-act" style="flex:1"><option value="">Acte...</option></select>' +
            '<input class="ja-modal-input ja-acte-dent" placeholder="Dent (ex: 16)" style="width:80px" />' +
            '<span class="ja-acte-duree" style="color:#737373;font-size:12px;min-width:45px">--</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" id="ja-add-acte-more" style="background:none;border:1px dashed #333;color:#0d9488;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;width:100%;margin-bottom:12px">+ Ajouter un acte</button>' +
        '<div id="ja-add-link-hint"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="ja-modal-field" style="flex:1"><label>Heure de début</label><input class="ja-modal-input" id="ja-add-time" type="time" value="' + pad(hour) + ':00"></div>' +
        '<div class="ja-modal-field" style="flex:1"><label>Durée totale</label><select class="ja-modal-select" id="ja-add-duree">' + buildDurationOptions(30, 30) + '</select></div>' +
      '</div>' +
      '<div class="ja-modal-field"><label>Motif urgence <span style="color:#737373;font-size:11px">(optionnel — décrivez le problème du patient)</span></label>' +
        '<div style="display:flex;gap:8px"><input class="ja-modal-input" id="ja-add-urgence" placeholder="Ex: douleur spontanée, couronne tombée, gonflement..." style="flex:1">' +
        '<button type="button" id="ja-triage-btn" style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Trier</button></div>' +
        '<div id="ja-triage-result" style="margin-top:8px;display:none;padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.5;border:1px solid #333"></div>' +
      '</div>' +
      '<div class="ja-modal-field"><label>Notes</label><textarea class="ja-modal-textarea" id="ja-add-notes" placeholder="Notes (optionnel)..."></textarea></div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Annuler</button>' +
        '<button class="ja-btn-primary" id="ja-add-save">Enregistrer</button>' +
      '</div>';

    var m = showModal(html);

    // Setup triage urgence
    m.box.querySelector('#ja-triage-btn').addEventListener('click', async function() {
      var txt = document.getElementById('ja-add-urgence').value.trim();
      if (!txt) { showToast('Décrivez le problème du patient', 'error'); return; }
      this.textContent = '...';
      try {
        var r = await fetch('/api/ia-secretary/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (window.jadomiMultiSocietes?.token || '') },
          body: JSON.stringify({ texte: txt })
        });
        var d = await r.json();
        if (d.error) throw new Error(d.error);
        var res = document.getElementById('ja-triage-result');
        res.style.display = 'block';
        res.style.borderColor = d.color || '#333';
        res.style.background = (d.color || '#333') + '10';
        res.innerHTML = '<div style="font-weight:700;font-size:14px;">' + (d.badge||'') + ' ' + (d.label||'') + ' — ' + d.duree + ' min</div>' +
          '<div style="color:#999;margin-top:4px">' + (d.delai||'') + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#ccc">' + (d.note_agenda||'') + '</div>';
        // Auto-fill durée et notes
        var dureeSelect = document.getElementById('ja-add-duree');
        if (dureeSelect) { dureeSelect.value = String(d.duree); if(!dureeSelect.value) dureeSelect.value = '30'; }
        var notes = document.getElementById('ja-add-notes');
        if (notes && !notes.value) notes.value = d.note_agenda || '';
      } catch(e) { showToast('Erreur triage: ' + e.message, 'error'); }
      this.textContent = 'Trier';
    });

    // Setup multi-acte rows
    setupMultiActeRows(m.box, 'ja-add');

    m.box.querySelector('#ja-add-save').addEventListener('click', async function () {
      var nom = document.getElementById('ja-add-nom').value.trim();
      if (!nom) {
        showToast('Veuillez saisir le nom du patient', 'error');
        return;
      }

      // Collecter tous les actes depuis les rangées
      var actes = collectActesFromRows(m.box);
      if (actes.length === 0) {
        showToast('Veuillez choisir au moins un acte', 'error');
        return;
      }

      var saveBtn = this;
      saveBtn.textContent = 'Enregistrement...';
      saveBtn.disabled = true;

      var timeVal = document.getElementById('ja-add-time').value;
      var dureeVal = parseInt(document.getElementById('ja-add-duree').value);
      var startDt = new Date(isoDate + 'T' + timeVal + ':00');
      var endDt = new Date(startDt.getTime() + dureeVal * 60000);

      var patientNom = nom;
      var patientPrenom = document.getElementById('ja-add-prenom').value.trim();
      var catVal = actes[0].categorie;
      var acteVal = actes[0].acte;

      var body = {
        patient_nom: patientNom,
        patient_prenom: patientPrenom,
        patient_tel: document.getElementById('ja-add-tel').value.trim(),
        patient_email: document.getElementById('ja-add-email').value.trim(),
        categorie: catVal,
        acte: acteVal,
        actes: actes,
        type: catVal,
        debut: startDt.toISOString(),
        fin: endDt.toISOString(),
        duree: dureeVal,
        notes: document.getElementById('ja-add-notes').value.trim()
      };

      try {
        await apiPost(body);
        showToast('Rendez-vous créé avec succès', 'success');
        m.close();
        await draw();

        // Check for linked follow-up appointment
        if (catVal && acteVal) {
          var linked = findLinkedActe(catVal, acteVal);
          if (linked) {
            showLinkedSuggestion(linked, patientNom, patientPrenom, startDt);
          }
        }
      } catch (e) {
        if (e.message !== '401') {
          showToast('Erreur : ' + e.message, 'error');
        }
        saveBtn.textContent = 'Enregistrer';
        saveBtn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // SETTINGS MODAL
  // ---------------------------------------------------------------------------
  function showSettingsModal() {
    var s = _settings || DEFAULT_SETTINGS;

    // Build hour options
    function hourOpts(selected, from, to) {
      var h = '';
      for (var i = from; i <= to; i++) {
        var sel = (i === selected) ? ' selected' : '';
        h += '<option value="' + i + '"' + sel + '>' + i + 'h</option>';
      }
      return h;
    }

    // Build pause options
    function pauseOpts(selected, choices) {
      var h = '';
      for (var i = 0; i < choices.length; i++) {
        var sel = (selected === choices[i]) ? ' selected' : '';
        var lbl = choices[i].replace(':', 'h');
        h += '<option value="' + choices[i] + '"' + sel + '>' + lbl + '</option>';
      }
      return h;
    }

    // Colors section
    var colorLabels = {
      consultation: 'Consultation',
      conservateur: 'Soins conservateurs',
      endodontie: 'Endodontie',
      parodontologie: 'Parodontologie',
      prothese_conjointe: 'Prothèse conjointe',
      prothese_adjointe: 'Prothèse adjointe',
      chirurgie: 'Chirurgie',
      orthodontie: 'Orthodontie',
      esthetique: 'Esthétique',
      pedodontie: 'Pédodontie'
    };
    var colorKeys = Object.keys(colorLabels);
    var colorsHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px">';
    for (var ci = 0; ci < colorKeys.length; ci++) {
      var ck = colorKeys[ci];
      var cv = s.colors[ck] || DEFAULT_SETTINGS.colors[ck];
      colorsHtml += '<div style="display:flex;align-items:center;gap:8px">' +
        '<input type="color" id="ja-set-color-' + ck + '" value="' + cv + '" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;border-radius:4px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + cv + ';flex-shrink:0" id="ja-set-dot-' + ck + '"></span>' +
        '<span style="font-size:12px;color:#a3a3a3">' + colorLabels[ck] + '</span>' +
      '</div>';
    }
    colorsHtml += '</div>';

    var cellHeightSel = '';
    var cellOpts = [{ v: 48, l: 'Compact (48px)' }, { v: 64, l: 'Normal (64px)' }, { v: 80, l: 'Grand (80px)' }];
    for (var ch = 0; ch < cellOpts.length; ch++) {
      cellHeightSel += '<option value="' + cellOpts[ch].v + '"' + (s.cellHeight === cellOpts[ch].v ? ' selected' : '') + '>' + cellOpts[ch].l + '</option>';
    }

    // Jours travaillés personnalisables
    var jt = s.joursTravailles || DEFAULT_SETTINGS.joursTravailles;
    var joursHtml = '<div style="margin-bottom:18px">' +
      '<div style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Jours travaillés</div>';
    var modeOpts = [{ v: 'journee', l: 'Journée complète' }, { v: 'matin', l: 'Matin seulement' }, { v: 'aprem', l: 'Après-midi seulement' }];
    for (var di = 0; di < JOUR_KEYS.length; di++) {
      var jk = JOUR_KEYS[di];
      var jConf = jt[jk] || DEFAULT_SETTINGS.joursTravailles[jk];
      var jourLabel = ALL_DAYS[di];
      var checked = jConf.actif ? ' checked' : '';
      var modeSel = '';
      for (var mo = 0; mo < modeOpts.length; mo++) {
        modeSel += '<option value="' + modeOpts[mo].v + '"' + (jConf.mode === modeOpts[mo].v ? ' selected' : '') + '>' + modeOpts[mo].l + '</option>';
      }
      joursHtml += '' +
        '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1a1a2e" data-jour="' + jk + '">' +
          '<label style="display:flex;align-items:center;gap:6px;width:110px;cursor:pointer">' +
            '<input type="checkbox" class="ja-set-jour-actif" data-jour="' + jk + '"' + checked + ' style="accent-color:#0d9488">' +
            '<span style="font-size:14px">' + jourLabel + '</span>' +
          '</label>' +
          '<select class="ja-modal-select ja-set-jour-mode" data-jour="' + jk + '" style="flex:1;font-size:12px">' + modeSel + '</select>' +
          '<input type="time" class="ja-modal-input ja-set-jour-debut" data-jour="' + jk + '" value="' + (jConf.debut || '09:00') + '" style="width:85px;font-size:12px">' +
          '<span style="color:#525252">→</span>' +
          '<input type="time" class="ja-modal-input ja-set-jour-fin" data-jour="' + jk + '" value="' + (jConf.fin || '19:00') + '" style="width:85px;font-size:12px">' +
        '</div>';
    }
    joursHtml += '</div>';

    var incSel = '<option value="60"' + (s.increment !== 30 ? ' selected' : '') + '>1 heure</option>' +
                 '<option value="30"' + (s.increment === 30 ? ' selected' : '') + '>30 minutes</option>';

    var retardSel = '';
    var retardOpts = [5, 10, 15, 20];
    for (var ri = 0; ri < retardOpts.length; ri++) {
      retardSel += '<option value="' + retardOpts[ri] + '"' + (s.alerteRetard === retardOpts[ri] ? ' selected' : '') + '>' + retardOpts[ri] + ' min</option>';
    }

    var html = '' +
      '<div class="ja-modal-title" style="display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:20px">&#9881;</span>' +
        '<span>Paramètres de l\'agenda</span>' +
      '</div>' +
      // -- Section Horaires --
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Horaires</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="ja-modal-field"><label>Heure de début</label><select class="ja-modal-select" id="ja-set-start-hour">' + hourOpts(s.startHour, 7, 10) + '</select></div>' +
          '<div class="ja-modal-field"><label>Heure de fin</label><select class="ja-modal-select" id="ja-set-end-hour">' + hourOpts(s.endHour, 17, 21) + '</select></div>' +
          '<div class="ja-modal-field"><label>Pause déjeuner début</label><select class="ja-modal-select" id="ja-set-pause-debut">' + pauseOpts(s.pauseDebut, ['12:00', '12:30', '13:00']) + '</select></div>' +
          '<div class="ja-modal-field"><label>Pause déjeuner fin</label><select class="ja-modal-select" id="ja-set-pause-fin">' + pauseOpts(s.pauseFin, ['13:00', '13:30', '14:00', '14:30']) + '</select></div>' +
        '</div>' +
      '</div>' +
      // -- Section Jours travaillés --
      joursHtml +
      // -- Section Affichage --
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Affichage</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="ja-modal-field"><label>Hauteur cellules</label><select class="ja-modal-select" id="ja-set-cell-height">' + cellHeightSel + '</select></div>' +
          '<div class="ja-modal-field"><label>Incrément horaire</label><select class="ja-modal-select" id="ja-set-increment">' + incSel + '</select></div>' +
        '</div>' +
      '</div>' +
      // -- Section Couleurs --
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Couleurs des catégories</div>' +
        colorsHtml +
      '</div>' +
      // -- Section Notifications --
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Notifications</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="ja-modal-field"><label>Alerte retard patient après</label><select class="ja-modal-select" id="ja-set-retard">' + retardSel + '</select></div>' +
          '<div class="ja-modal-field"><label>Alerte actes lourds consécutifs</label><select class="ja-modal-select" id="ja-set-actes-lourds">' +
            '<option value="true"' + (s.alerteActesLourds ? ' selected' : '') + '>Oui</option>' +
            '<option value="false"' + (!s.alerteActesLourds ? ' selected' : '') + '>Non</option>' +
          '</select></div>' +
        '</div>' +
      '</div>' +
      // -- Section Mode Solo --
      '<div style="margin-bottom:18px">' +
        '<div style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Mode de travail</div>' +
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:rgba(13,148,136,.06);border:1px solid rgba(13,148,136,.15)">' +
          '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1">' +
            '<input type="checkbox" id="ja-set-solo"' + (s.modeSolo ? ' checked' : '') + ' style="accent-color:#0d9488;width:18px;height:18px">' +
            '<div>' +
              '<div style="font-weight:600;color:#e5e5e5;font-size:14px">Seul au cabinet (sans secrétaire)</div>' +
              '<div style="font-size:12px;color:#737373;margin-top:2px">Un seul bouton "GO" sur chaque RDV : patient arrivé + soin démarré + Copilot lancé</div>' +
            '</div>' +
          '</label>' +
        '</div>' +
      '</div>' +
      // -- Actions --
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap">' +
        '<button class="ja-btn-ghost" id="ja-set-reset">Réinitialiser</button>' +
        '<button class="ja-btn-ghost" data-close>Annuler</button>' +
        '<button class="ja-btn-primary" id="ja-set-save">Enregistrer</button>' +
      '</div>';

    var m = showModal(html);

    // Live color dot preview
    for (var pi = 0; pi < colorKeys.length; pi++) {
      (function (key) {
        var picker = m.box.querySelector('#ja-set-color-' + key);
        var dot = m.box.querySelector('#ja-set-dot-' + key);
        if (picker && dot) {
          picker.addEventListener('input', function () {
            dot.style.background = this.value;
          });
        }
      })(colorKeys[pi]);
    }

    // Save
    m.box.querySelector('#ja-set-save').addEventListener('click', function () {
      _settings.startHour = parseInt(m.box.querySelector('#ja-set-start-hour').value);
      _settings.endHour = parseInt(m.box.querySelector('#ja-set-end-hour').value);
      _settings.pauseDebut = m.box.querySelector('#ja-set-pause-debut').value;
      _settings.pauseFin = m.box.querySelector('#ja-set-pause-fin').value;
      _settings.cellHeight = parseInt(m.box.querySelector('#ja-set-cell-height').value);
      _settings.increment = parseInt(m.box.querySelector('#ja-set-increment').value);

      // Sauvegarder les jours travaillés
      for (var jdi = 0; jdi < JOUR_KEYS.length; jdi++) {
        var jk3 = JOUR_KEYS[jdi];
        var ckb = m.box.querySelector('.ja-set-jour-actif[data-jour="' + jk3 + '"]');
        var mde = m.box.querySelector('.ja-set-jour-mode[data-jour="' + jk3 + '"]');
        var deb = m.box.querySelector('.ja-set-jour-debut[data-jour="' + jk3 + '"]');
        var fin = m.box.querySelector('.ja-set-jour-fin[data-jour="' + jk3 + '"]');
        if (ckb && mde && deb && fin) {
          _settings.joursTravailles[jk3] = {
            actif: ckb.checked,
            mode: mde.value,
            debut: deb.value,
            fin: fin.value
          };
        }
      }
      // Mettre à jour daysCount pour rétrocompat
      var activCount = 0;
      for (var jdi2 = 0; jdi2 < JOUR_KEYS.length; jdi2++) {
        if (_settings.joursTravailles[JOUR_KEYS[jdi2]].actif) activCount++;
      }
      _settings.daysCount = activCount;
      _settings.alerteRetard = parseInt(m.box.querySelector('#ja-set-retard').value);
      _settings.alerteActesLourds = m.box.querySelector('#ja-set-actes-lourds').value === 'true';
      var soloCheck = m.box.querySelector('#ja-set-solo');
      _settings.modeSolo = soloCheck ? soloCheck.checked : false;

      // Colors
      for (var k = 0; k < colorKeys.length; k++) {
        var cp = m.box.querySelector('#ja-set-color-' + colorKeys[k]);
        if (cp) _settings.colors[colorKeys[k]] = cp.value;
      }

      // Validation
      if (_settings.startHour >= _settings.endHour) {
        showToast('L\'heure de début doit être inférieure à l\'heure de fin', 'error');
        return;
      }

      saveSettings();
      m.close();
      showToast('Paramètres enregistrés', 'success');
      draw();
    });

    // Reset
    m.box.querySelector('#ja-set-reset').addEventListener('click', function () {
      _settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      saveSettings();
      m.close();
      showToast('Paramètres réinitialisés', 'info');
      draw();
    });
  }

  // ---------------------------------------------------------------------------
  // JADOMI COPILOT — Voice-assisted dental session
  // ---------------------------------------------------------------------------

  var COPILOT_DENTAL_KEYWORDS = [
    { pattern: /\bcomposite\b/i, label: 'composite', categorie: 'conservateur', acte: 'soin_carie_1face' },
    { pattern: /\bd[eé]tartrage\b/i, label: 'détartrage', categorie: 'parodontologie', acte: 'detartrage' },
    { pattern: /\bextraction\b/i, label: 'extraction', categorie: 'chirurgie', acte: 'extraction_simple' },
    { pattern: /\bendo(?:dontie)?\b/i, label: 'endodontie', categorie: 'endodontie', acte: 'endo_mono' },
    { pattern: /\bcouronne\b/i, label: 'couronne', categorie: 'prothese_conjointe', acte: 'couronne_empreinte' },
    { pattern: /\bbridge\b/i, label: 'bridge', categorie: 'prothese_conjointe', acte: 'bridge_empreinte' },
    { pattern: /\bsurfa[cç]age\b/i, label: 'surfaçage', categorie: 'parodontologie', acte: 'surfacage_1secteur' },
    { pattern: /\binlay\b/i, label: 'inlay', categorie: 'conservateur', acte: 'inlay_onlay_empreinte' },
    { pattern: /\bonlay\b/i, label: 'onlay', categorie: 'conservateur', acte: 'inlay_onlay_empreinte' },
    { pattern: /\bscellement\b/i, label: 'scellement', categorie: 'conservateur', acte: 'scellement_sillon' },
    { pattern: /\bpulpotomie\b/i, label: 'pulpotomie', categorie: 'endodontie', acte: 'pulpotomie' },
    { pattern: /\bavulsion\b/i, label: 'avulsion', categorie: 'chirurgie', acte: 'extraction_simple' },
    { pattern: /\bpremi[eè]re consultation\b/i, label: 'première consultation', categorie: 'consultation', acte: 'premiere_consultation' },
    { pattern: /\bcarie\b/i, label: 'soin carie', categorie: 'conservateur', acte: 'soin_carie_1face' },
    { pattern: /\bimplant\b/i, label: 'implant', categorie: 'chirurgie', acte: 'pose_implant' },
    { pattern: /\bblanchiment\b/i, label: 'blanchiment', categorie: 'esthetique', acte: 'blanchiment_ambulatoire' },
    { pattern: /\bgreffe\b/i, label: 'greffe', categorie: 'parodontologie', acte: 'greffe_gingivale' },
    { pattern: /\bproth[eè]se\b/i, label: 'prothèse', categorie: 'prothese_adjointe', acte: 'empreinte_pap' },
    { pattern: /\bradio\b/i, label: 'radio', categorie: 'consultation', acte: 'radio_retro' },
    { pattern: /\bcone\s*beam\b/i, label: 'cone beam', categorie: 'consultation', acte: 'cone_beam' }
  ];

  // ── Détection numéros de dents FDI (11-48) ──
  // Reconnaissance vocale : "seize" → 16, "vingt-six" → 26, "la 36" → 36
  var DENT_NOMBRES_VOCAUX = {
    'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14, 'quinze': 15,
    'seize': 16, 'dix-sept': 17, 'dix sept': 17, 'dix huit': 18, 'dix-huit': 18,
    'vingt et un': 21, 'vingt-et-un': 21, 'vingt deux': 22, 'vingt-deux': 22,
    'vingt trois': 23, 'vingt-trois': 23, 'vingt quatre': 24, 'vingt-quatre': 24,
    'vingt cinq': 25, 'vingt-cinq': 25, 'vingt six': 26, 'vingt-six': 26,
    'vingt sept': 27, 'vingt-sept': 27, 'vingt huit': 28, 'vingt-huit': 28,
    'trente et un': 31, 'trente-et-un': 31, 'trente deux': 32, 'trente-deux': 32,
    'trente trois': 33, 'trente-trois': 33, 'trente quatre': 34, 'trente-quatre': 34,
    'trente cinq': 35, 'trente-cinq': 35, 'trente six': 36, 'trente-six': 36,
    'trente sept': 37, 'trente-sept': 37, 'trente huit': 38, 'trente-huit': 38,
    'quarante et un': 41, 'quarante-et-un': 41, 'quarante deux': 42, 'quarante-deux': 42,
    'quarante trois': 43, 'quarante-trois': 43, 'quarante quatre': 44, 'quarante-quatre': 44,
    'quarante cinq': 45, 'quarante-cinq': 45, 'quarante six': 46, 'quarante-six': 46,
    'quarante sept': 47, 'quarante-sept': 47, 'quarante huit': 48, 'quarante-huit': 48
  };

  // Détecter les numéros de dents dans un texte
  function detectDentsInText(text) {
    var dents = [];
    var lower = text.toLowerCase();
    // 1. Mots en toutes lettres ("seize", "vingt-six")
    var vocKeys = Object.keys(DENT_NOMBRES_VOCAUX);
    for (var i = 0; i < vocKeys.length; i++) {
      if (lower.indexOf(vocKeys[i]) !== -1) {
        var num = DENT_NOMBRES_VOCAUX[vocKeys[i]];
        if (dents.indexOf(num) === -1) dents.push(num);
      }
    }
    // 2. Chiffres : "la 16", "dent 26", "sur la 36", ou juste "16"
    var numPattern = /(?:la|dent|sur|le)\s+(\d{2})\b/gi;
    var m;
    while ((m = numPattern.exec(text)) !== null) {
      var n = parseInt(m[1]);
      if (n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8 && dents.indexOf(n) === -1) {
        dents.push(n);
      }
    }
    // 3. Numéros isolés 2 chiffres entre 11-48 (quadrants 1-4, dents 1-8)
    var isolatedPattern = /\b(\d{2})\b/g;
    while ((m = isolatedPattern.exec(text)) !== null) {
      var n2 = parseInt(m[1]);
      if (n2 >= 11 && n2 <= 48 && n2 % 10 >= 1 && n2 % 10 <= 8 && dents.indexOf(n2) === -1) {
        dents.push(n2);
      }
    }
    return dents;
  }

  // Copilot actes structurés (pas juste des strings)
  var _copilotStructuredActes = [];

  var COPILOT_STOP_PHRASES = [
    /\bon a fini\b/i,
    /\btermin[eé]\b/i,
    /\bc['']est bon\b/i
  ];

  var _copilotMode = 'micro'; // 'micro' ou 'timer'

  function copilotStart(apt) {
    if (_copilotActive) {
      showToast('Copilot déjà actif pour un autre patient', 'error');
      return;
    }

    // Afficher le choix : Avec micro / Sans micro (chrono seul)
    var html = '' +
      '<div class="ja-modal-title">Démarrer Copilot</div>' +
      '<div style="text-align:center;padding:20px 0;color:#a3a3a3;">' +
        '<p style="margin-bottom:24px">Choisissez le mode de suivi pour ce soin :</p>' +
        '<div style="display:flex;gap:16px;justify-content:center">' +
          '<button id="ja-copilot-mode-micro" style="flex:1;max-width:220px;padding:20px 16px;background:#16161f;border:2px solid #0d9488;border-radius:12px;color:#fff;cursor:pointer;text-align:center;transition:all .2s">' +
            '<div style="font-size:32px;margin-bottom:8px">🎙️</div>' +
            '<div style="font-weight:600;font-size:15px;margin-bottom:4px">Avec micro</div>' +
            '<div style="font-size:12px;color:#737373">Transcription vocale + détection des actes et dents + chronomètre</div>' +
          '</button>' +
          '<button id="ja-copilot-mode-timer" style="flex:1;max-width:220px;padding:20px 16px;background:#16161f;border:2px solid #525252;border-radius:12px;color:#fff;cursor:pointer;text-align:center;transition:all .2s">' +
            '<div style="font-size:32px;margin-bottom:8px">⏱️</div>' +
            '<div style="font-weight:600;font-size:15px;margin-bottom:4px">Sans micro</div>' +
            '<div style="font-size:12px;color:#737373">Chronomètre + ajout manuel des actes réalisés</div>' +
          '</button>' +
        '</div>' +
      '</div>';

    var m = showModal(html);

    m.box.querySelector('#ja-copilot-mode-micro').addEventListener('click', function () {
      m.close();
      _copilotMode = 'micro';
      copilotStartWithMode(apt, true);
    });

    m.box.querySelector('#ja-copilot-mode-timer').addEventListener('click', function () {
      m.close();
      _copilotMode = 'timer';
      copilotStartWithMode(apt, false);
    });
  }

  function copilotStartWithMode(apt, withMicro) {
    _copilotActive = true;
    _copilotAptId = apt.id;
    _copilotTranscript = '';
    _copilotInterim = '';
    _copilotActes = [];
    _copilotStructuredActes = [];
    _copilotStartTime = Date.now();
    _copilotPatientName = apt.patient || '';
    _copilotActeLabel = findActeLabel(apt.categorie, apt.acte) || getCategoryLabel(apt.categorie);
    _copilotOriginalNotes = apt.notes || '';

    // Create the floating bar
    copilotRenderBar();

    // Start the elapsed timer
    _copilotTimer = setInterval(copilotUpdateTimer, 1000);

    if (withMicro) {
      // Start speech recognition
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
            stream.getTracks().forEach(function(t) { t.stop(); });
            copilotStartRecognition(SpeechRecognition);
          }).catch(function() {
            showToast('Micro refusé — Copilot en mode chrono', 'info');
            _copilotMode = 'timer';
          });
        } else {
          copilotStartRecognition(SpeechRecognition);
        }
      } else {
        showToast('Navigateur sans reconnaissance vocale — mode chrono', 'info');
        _copilotMode = 'timer';
      }
      showToast('Copilot activé — mode vocal', 'success');
    } else {
      showToast('Copilot activé — mode chronomètre', 'success');
    }
  }

  // Legacy alias
  function copilotStartInternal(apt, SpeechRecognition) {
    _copilotMode = 'micro';
    copilotStartWithMode(apt, true);
  }

  function copilotStartRecognition(SpeechRecognition) {
    var recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';
    recognition.maxAlternatives = 1;

    recognition.onresult = function (event) {
      var interimText = '';
      var finalText = '';

      for (var i = event.resultIndex; i < event.results.length; i++) {
        var transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        _copilotTranscript += (_copilotTranscript ? ' ' : '') + finalText.trim();
        _copilotInterim = '';

        // Detect dental acts
        copilotDetectActes(finalText);

        // Detect stop phrases
        copilotDetectStop(finalText);

        // Schedule batched save
        copilotScheduleSave();
      } else {
        _copilotInterim = interimText;
      }

      copilotUpdateTranscriptDisplay();
    };

    recognition.onerror = function (event) {
      // Ignore no-speech and aborted errors — just retry
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed') {
        showToast('Micro non autorisé — Copilot en mode chrono uniquement', 'info');
        // Ne pas arrêter le Copilot — le chrono continue sans micro
        _copilotRecognition = null;
        return;
      }
      // Other errors: log but continue
      console.warn('Copilot speech error:', event.error);
    };

    recognition.onend = function () {
      // Auto-restart if still active (Chrome stops after ~60s)
      if (_copilotActive && _copilotRecognition) {
        try {
          _copilotRecognition.start();
        } catch (e) {
          // Already started or other issue — retry after short delay
          setTimeout(function () {
            if (_copilotActive && _copilotRecognition) {
              try { _copilotRecognition.start(); } catch (e2) { /* ignore */ }
            }
          }, 300);
        }
      }
    };

    _copilotRecognition = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.warn('Copilot micro error:', e);
      showToast('Copilot démarré en mode chrono (micro indisponible)', 'info');
      _copilotRecognition = null;
      // Le chrono et la barre restent actifs
    }
  }

  function copilotDetectActes(text) {
    // Détecter les numéros de dents dans le texte
    var dentsDetected = detectDentsInText(text);

    for (var i = 0; i < COPILOT_DENTAL_KEYWORDS.length; i++) {
      var kw = COPILOT_DENTAL_KEYWORDS[i];
      if (kw.pattern.test(text)) {
        // Extract surrounding context (e.g., "composite 16")
        var match = text.match(new RegExp(kw.pattern.source + '(?:\\s+\\d{1,2})?', 'i'));
        var acteStr = match ? match[0].trim() : kw.label;

        // Ajouter les dents détectées à proximité de cet acte
        var acteDents = [];
        if (match) {
          // Chercher des numéros juste après le mot-clé
          var afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 30);
          acteDents = detectDentsInText(afterMatch);
        }
        // Fallback : utiliser toutes les dents détectées dans la phrase
        if (acteDents.length === 0 && dentsDetected.length > 0) {
          acteDents = dentsDetected.slice();
        }

        // Construire le label enrichi
        var labelWithDents = kw.label;
        if (acteDents.length > 0) {
          labelWithDents += ' ' + acteDents.join(', ');
        }

        // Éviter les doublons (même acte + même dent)
        if (_copilotActes.indexOf(labelWithDents) === -1) {
          _copilotActes.push(labelWithDents);

          // Stocker aussi en structuré pour la sauvegarde
          _copilotStructuredActes.push({
            categorie: kw.categorie,
            acte: kw.acte,
            label: kw.label,
            dents: acteDents
          });

          copilotUpdateActesDisplay();
        }
      }
    }

    // Détecter des dents orphelines (sans acte) — utile pour le contexte
    if (dentsDetected.length > 0 && _copilotActes.length === 0) {
      var dentLabel = 'Dent' + (dentsDetected.length > 1 ? 's' : '') + ' ' + dentsDetected.join(', ');
      if (_copilotActes.indexOf(dentLabel) === -1) {
        _copilotActes.push(dentLabel);
        copilotUpdateActesDisplay();
      }
    }
  }

  function copilotDetectStop(text) {
    for (var i = 0; i < COPILOT_STOP_PHRASES.length; i++) {
      if (COPILOT_STOP_PHRASES[i].test(text)) {
        // Small delay to let the phrase be displayed
        setTimeout(function () {
          if (_copilotActive) {
            copilotStop();
          }
        }, 1000);
        return;
      }
    }
  }

  function copilotScheduleSave() {
    // Batch saves every 10 seconds
    if (_copilotSaveTimer) return; // Already scheduled
    _copilotSaveTimer = setTimeout(function () {
      _copilotSaveTimer = null;
      copilotSaveNotes();
    }, 10000);
  }

  function copilotSaveNotes() {
    if (!_copilotActive || !_copilotAptId) return;
    var notes = copilotBuildNotes();
    apiPut(_copilotAptId, { notes: notes }).catch(function (e) {
      if (e.message !== '401') {
        console.warn('Copilot save error:', e.message);
      }
    });
  }

  function copilotBuildNotes() {
    var notes = _copilotOriginalNotes || '';
    var modeLabel = _copilotMode === 'micro' ? 'vocal' : 'chronomètre';
    var elapsed = _copilotStartTime ? Math.round((Date.now() - _copilotStartTime) / 60000) : 0;
    notes += '\n--- Copilot (' + modeLabel + ') — ' + elapsed + ' min ---';
    if (_copilotActes.length > 0) {
      notes += '\nActes réalisés : ' + _copilotActes.join(' | ');
    }
    // Dents mentionnées (résumé)
    var allDents = [];
    for (var i = 0; i < _copilotStructuredActes.length; i++) {
      var sa = _copilotStructuredActes[i];
      if (sa.dents) {
        for (var j = 0; j < sa.dents.length; j++) {
          if (allDents.indexOf(sa.dents[j]) === -1) allDents.push(sa.dents[j]);
        }
      }
    }
    if (allDents.length > 0) {
      allDents.sort(function(a,b){ return a-b; });
      notes += '\nDents : ' + allDents.join(', ');
    }
    if (_copilotTranscript) {
      notes += '\nTranscription : ' + _copilotTranscript;
    }
    return notes.trim();
  }

  function copilotRenderBar() {
    // Remove existing bar if any
    var existing = document.getElementById('ja-copilot-bar');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.className = 'ja-copilot-bar';
    bar.id = 'ja-copilot-bar';

    var modeLabel = _copilotMode === 'micro' ? '🎙️ Vocal' : '⏱️ Chrono';
    var middleContent = '';

    if (_copilotMode === 'micro') {
      // Mode vocal : zone de transcription
      middleContent = '' +
        '<div class="ja-copilot-transcript" id="ja-copilot-transcript">' +
          '<span style="color:#525252;font-style:italic">En attente de parole...</span>' +
        '</div>';
    } else {
      // Mode timer : sélecteur d'actes manuel + zone dents
      middleContent = '' +
        '<div id="ja-copilot-manual" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">' +
          '<select id="ja-copilot-manual-cat" style="background:#1a1a2e;color:#fff;border:1px solid #333;border-radius:6px;padding:4px 8px;font-size:12px;max-width:130px">' +
            buildCategoryOptions('') +
          '</select>' +
          '<select id="ja-copilot-manual-acte" style="background:#1a1a2e;color:#fff;border:1px solid #333;border-radius:6px;padding:4px 8px;font-size:12px;max-width:160px">' +
            '<option value="">Acte...</option>' +
          '</select>' +
          '<input id="ja-copilot-manual-dent" placeholder="Dent (ex: 16)" style="background:#1a1a2e;color:#fff;border:1px solid #333;border-radius:6px;padding:4px 8px;font-size:12px;width:80px" />' +
          '<button id="ja-copilot-manual-add" style="background:#0d9488;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;white-space:nowrap">+ Acte</button>' +
        '</div>';
    }

    bar.innerHTML = '' +
      '<div class="ja-copilot-pulse"></div>' +
      '<div class="ja-copilot-info">' +
        '<div class="ja-copilot-patient">' + esc(_copilotPatientName) + ' <span style="font-size:11px;color:#737373;margin-left:6px">' + modeLabel + '</span></div>' +
        '<div class="ja-copilot-acte" id="ja-copilot-acte-display">' + esc(_copilotActeLabel) + '</div>' +
      '</div>' +
      '<div class="ja-copilot-timer" id="ja-copilot-timer">00:00</div>' +
      middleContent +
      '<button class="ja-copilot-stop" id="ja-copilot-stop">Terminer</button>';

    document.body.appendChild(bar);

    // Bind stop button
    document.getElementById('ja-copilot-stop').addEventListener('click', function () {
      copilotStop();
    });

    // Mode timer : bind les contrôles manuels
    if (_copilotMode === 'timer') {
      var catSel = document.getElementById('ja-copilot-manual-cat');
      var acteSel = document.getElementById('ja-copilot-manual-acte');
      var dentInput = document.getElementById('ja-copilot-manual-dent');
      var addBtn = document.getElementById('ja-copilot-manual-add');

      if (catSel && acteSel) {
        catSel.addEventListener('change', function () {
          copilotPopulateActeSelect(catSel.value, acteSel);
        });

        addBtn.addEventListener('click', function () {
          copilotAddManualActe(catSel, acteSel, dentInput);
        });
      }
    }
  }

  function copilotPopulateActeSelect(catKey, selectEl) {
    selectEl.innerHTML = '<option value="">Acte...</option>';
    if (!catKey) return;
    var cat = _catalogue ? _catalogue[catKey] : null;
    if (!cat) {
      // Fallback : utiliser les labels basiques
      selectEl.innerHTML += '<option value="' + catKey + '">' + (FALLBACK_LABELS[catKey] || catKey) + '</option>';
      return;
    }
    var acteKeys = Object.keys(cat.actes);
    for (var i = 0; i < acteKeys.length; i++) {
      var ak = acteKeys[i];
      selectEl.innerHTML += '<option value="' + ak + '">' + esc(cat.actes[ak].label) + '</option>';
    }
  }

  function copilotAddManualActe(catSel, acteSel, dentInput) {
    var catVal = catSel.value;
    var acteVal = acteSel.value;
    if (!catVal || !acteVal) {
      showToast('Choisissez une catégorie et un acte', 'error');
      return;
    }

    var dents = [];
    if (dentInput && dentInput.value.trim()) {
      // Parse "16, 26" ou "16 26" ou "16"
      var parts = dentInput.value.replace(/[,;]/g, ' ').split(/\s+/);
      for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i]);
        if (n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8) {
          dents.push(n);
        }
      }
    }

    var acteLabel = acteVal;
    // Chercher le vrai label
    if (_catalogue && _catalogue[catVal] && _catalogue[catVal].actes[acteVal]) {
      acteLabel = _catalogue[catVal].actes[acteVal].label;
    }

    var displayLabel = acteLabel;
    if (dents.length > 0) displayLabel += ' ' + dents.join(', ');

    // Éviter doublons
    if (_copilotActes.indexOf(displayLabel) === -1) {
      _copilotActes.push(displayLabel);
      _copilotStructuredActes.push({
        categorie: catVal,
        acte: acteVal,
        label: acteLabel,
        dents: dents
      });
      copilotUpdateActesDisplay();
    }

    // Reset les sélecteurs
    acteSel.value = '';
    if (dentInput) dentInput.value = '';
  }

  function copilotUpdateTimer() {
    var el = document.getElementById('ja-copilot-timer');
    if (!el || !_copilotStartTime) return;
    var elapsed = Math.floor((Date.now() - _copilotStartTime) / 1000);
    var min = Math.floor(elapsed / 60);
    var sec = elapsed % 60;
    el.textContent = pad(min) + ':' + pad(sec);
  }

  function copilotUpdateTranscriptDisplay() {
    var el = document.getElementById('ja-copilot-transcript');
    if (!el) return;
    var html = '';
    if (_copilotTranscript) {
      // Show last ~200 chars of final transcript
      var display = _copilotTranscript;
      if (display.length > 200) {
        display = '...' + display.slice(-200);
      }
      html = esc(display);
    }
    if (_copilotInterim) {
      html += ' <span class="interim">' + esc(_copilotInterim) + '</span>';
    }
    if (!html) {
      html = '<span style="color:#525252;font-style:italic">En attente de parole...</span>';
    }
    el.innerHTML = html;
    // Auto-scroll to bottom
    el.scrollTop = el.scrollHeight;
  }

  function copilotUpdateActesDisplay() {
    // Update the acte line in the bar info
    var bar = document.getElementById('ja-copilot-bar');
    if (!bar) return;
    var acteEl = bar.querySelector('.ja-copilot-acte');
    if (acteEl && _copilotActes.length > 0) {
      acteEl.textContent = _copilotActeLabel + ' — Actes : ' + _copilotActes.join(', ');
    }
  }

  async function copilotStop() {
    if (!_copilotActive) return;

    var aptId = _copilotAptId;
    var startTime = _copilotStartTime;

    // Stop recognition
    if (_copilotRecognition) {
      try { _copilotRecognition.abort(); } catch (e) { /* ignore */ }
      _copilotRecognition = null;
    }

    // Clear timers
    if (_copilotTimer) { clearInterval(_copilotTimer); _copilotTimer = null; }
    if (_copilotSaveTimer) { clearTimeout(_copilotSaveTimer); _copilotSaveTimer = null; }

    // Build final notes
    var finalNotes = copilotBuildNotes();

    // Calculate elapsed time
    var elapsedMin = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;
    var actesCount = _copilotActes.length;

    // Construire le payload de sauvegarde
    var structuredActes = _copilotStructuredActes.slice();

    // Reset state
    _copilotActive = false;
    _copilotAptId = null;
    _copilotTranscript = '';
    _copilotInterim = '';
    _copilotActes = [];
    _copilotStructuredActes = [];
    _copilotStartTime = null;
    _copilotPatientName = '';
    _copilotActeLabel = '';
    _copilotOriginalNotes = '';
    _copilotMode = 'micro';

    // Remove bar
    var bar = document.getElementById('ja-copilot-bar');
    if (bar) bar.remove();

    // Save final state to API — inclure les actes structurés
    try {
      var nowISO = new Date().toISOString();
      var putBody = {
        heure_fin_reelle: nowISO,
        statut: 'termine',
        notes: finalNotes
      };
      // Si des actes structurés ont été détectés/ajoutés, les sauvegarder
      if (structuredActes.length > 0) {
        putBody.copilot_actes = structuredActes;
        // Mettre à jour aussi le champ actes[] du RDV
        putBody.actes = structuredActes.map(function(sa) {
          return { categorie: sa.categorie, acte: sa.acte, dents: sa.dents || [] };
        });
      }
      await apiPut(aptId, putBody);
    } catch (e) {
      if (e.message !== '401') {
        showToast('Erreur sauvegarde finale : ' + e.message, 'error');
      }
    }

    // ── MODAL FIN DE SOIN — tout en un seul écran ──
    var passeportMap = {
      'blanchiment_fauteuil': 'blanchiment', 'blanchiment_empreinte': 'blanchiment', 'blanchiment_livraison': 'blanchiment',
      'implant_pose': 'implant', 'implant_pilier': 'implant', 'comblement_osseux': 'implant',
      'facette_empreinte': 'facettes', 'facette_pose': 'facettes',
      'pose_multi_attache': 'orthodontie', 'depose_appareil': 'orthodontie', 'controle_aligneurs': 'orthodontie',
      'pac_livraison': 'rehabilitation', 'pap_livraison': 'rehabilitation',
    };
    var suggestedPasseport = null;
    for (var si2 = 0; si2 < structuredActes.length && !suggestedPasseport; si2++) {
      if (passeportMap[structuredActes[si2].acte]) suggestedPasseport = passeportMap[structuredActes[si2].acte];
    }
    if (!suggestedPasseport) {
      var apt3 = _appointments.find(function(a) { return a.id === aptId; });
      if (apt3 && passeportMap[apt3.acte]) suggestedPasseport = passeportMap[apt3.acte];
    }

    // Construire le résumé des actes
    var actesResume = '';
    if (structuredActes.length > 0) {
      actesResume = structuredActes.map(function(sa) {
        var t = sa.label || sa.acte;
        if (sa.dents && sa.dents.length > 0) t += ' (dent' + (sa.dents.length > 1 ? 's ' : ' ') + sa.dents.join(', ') + ')';
        return t;
      }).join(' | ');
    }

    var endHtml = '' +
      '<div style="text-align:center;padding:8px 0 16px">' +
        '<div style="font-size:40px;margin-bottom:8px">&#9989;</div>' +
        '<div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:4px">Soin termin\u00e9</div>' +
        '<div style="font-size:28px;font-weight:700;color:#14b8a6">' + elapsedMin + ' min</div>' +
        (actesResume ? '<div style="font-size:12px;color:#a3a3a3;margin-top:8px;line-height:1.5">' + esc(actesResume) + '</div>' : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">';

    endHtml += '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:16px">';

    // Cas clinique (regroupe photos patient + passeport + partage)
    endHtml += '<div onclick="window.open(\'/admin/dentiste-pro?tab=cases\',\'_blank\')" style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'\'">' +
      '<div style="font-size:24px;margin-bottom:4px">&#128193;</div>' +
      '<div style="font-weight:700;color:#3b82f6;font-size:13px">Cas clinique</div>' +
      '<div style="font-size:10px;color:#737373;margin-top:2px">Photos/vid\u00e9os, passeport, partage</div>' +
    '</div>';

    // Prochain RDV
    endHtml += '<div onclick="showReplanModal({id:\'' + aptId + '\',patient:\'Patient\',categorie:\'consultation\',acte:\'consultation_controle\',start:new Date(),end:new Date(Date.now()+1800000)})" style="background:rgba(13,148,136,.1);border:1px solid rgba(13,148,136,.25);border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'\'">' +
      '<div style="font-size:24px;margin-bottom:4px">&#128197;</div>' +
      '<div style="font-weight:700;color:#14b8a6;font-size:13px">Prochain RDV</div>' +
      '<div style="font-size:10px;color:#737373;margin-top:2px">Planifier le suivi</div>' +
    '</div>';

    endHtml += '</div>' +
      '<div style="text-align:center;margin-top:20px">' +
        '<button class="ja-btn-ghost" data-close style="padding:10px 40px">Fermer</button>' +
      '</div>';

    setTimeout(function() { showModal(endHtml); }, 500);

    // Redraw agenda
    draw();
  }

  // ---------------------------------------------------------------------------
  // QUICK ACTIONS (boutons rapides sur les blocs RDV)
  // ---------------------------------------------------------------------------

  async function quickPatientArrive(apt) {
    try {
      var now = new Date().toISOString();
      await apiPut(apt.id, { statut: 'arrive', heure_arrivee: now });
      showToast(esc(apt.patient) + ' — Patient arrivé', 'success');
      draw();
    } catch (e) {
      if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
    }
  }

  async function quickSoloGo(apt) {
    // Mode solo : Patient arrivé + Soin démarré + Copilot lancé en 1 clic
    try {
      var now = new Date().toISOString();
      await apiPut(apt.id, {
        statut: 'en_soin',
        heure_arrivee: now,
        heure_debut_reelle: now
      });
      showToast(esc(apt.patient) + ' — Soin démarré', 'success');
      // Mettre à jour l'apt localement pour le copilot
      apt.statut = 'en_soin';
      apt.heure_arrivee = now;
      apt.heure_debut_reelle = now;
      // Lancer Copilot directement
      copilotStart(apt);
      draw();
    } catch (e) {
      if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
    }
  }

  async function quickTerminer(apt) {
    try {
      var now = new Date().toISOString();
      await apiPut(apt.id, { statut: 'termine', heure_fin_reelle: now });
      showToast(esc(apt.patient) + ' — Soin terminé', 'success');
      draw();
    } catch (e) {
      if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // DRAG & DROP — Déplacer un RDV
  // ---------------------------------------------------------------------------

  async function handleDrop(apt, newDayIdx, newHour, monday) {
    var newDate = new Date(monday);
    newDate.setDate(newDate.getDate() + newDayIdx);
    var isoDate = formatISODate(newDate);
    var startDt = new Date(isoDate + 'T' + pad(newHour) + ':00:00');
    var dur = durationMin(apt.start, apt.end);
    var endDt = new Date(startDt.getTime() + dur * 60000);

    try {
      await apiPut(apt.id, {
        date_heure: startDt.toISOString(),
        debut: startDt.toISOString(),
        fin: endDt.toISOString()
      });
      showToast(esc(apt.patient) + ' déplacé à ' + DAYS[newDayIdx] + ' ' + pad(newHour) + ':00', 'success');
      draw();
    } catch (e) {
      if (e.message !== '401') showToast('Erreur déplacement : ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // CONTEXT MENU (clic droit) — Actions rapides
  // ---------------------------------------------------------------------------

  function showContextMenu(event, apt) {
    // Supprimer un menu existant
    var old = document.getElementById('ja-context-menu');
    if (old) old.remove();

    var menu = document.createElement('div');
    menu.id = 'ja-context-menu';
    menu.style.cssText = 'position:fixed;z-index:20000;background:rgba(22,22,31,.98);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px 0;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,.5);backdrop-filter:blur(12px);font-family:Inter,sans-serif;animation:jadomi-fadeIn .15s ease';
    menu.style.left = Math.min(event.clientX, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(event.clientY, window.innerHeight - 200) + 'px';

    var items = [
      { label: 'Modifier', icon: '✏️', action: function () { showDetailModal(apt); } },
      { label: 'Cas clinique', icon: '📁', action: function () { showCasCliniqueModal(apt); } },
      { label: 'Passeport patient', icon: '📋', action: function () { showPasseportModal(apt); } },
      { label: 'Proposer un autre créneau', icon: '📅', action: function () { showReplanModal(apt); } },
      { label: 'Annuler et notifier', icon: '❌', action: function () { handleAnnulation(apt); }, danger: true },
    ];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var row = document.createElement('div');
      row.style.cssText = 'padding:10px 16px;font-size:13px;cursor:' + (item.disabled ? 'default' : 'pointer') + ';display:flex;align-items:center;gap:10px;transition:background .15s;color:' + (item.danger ? '#ef4444' : item.disabled ? '#525252' : '#e5e5e5');
      row.innerHTML = '<span>' + item.icon + '</span><span>' + item.label + '</span>' + (item.hint ? '<span style="font-size:10px;color:#525252;margin-left:auto">' + item.hint + '</span>' : '');
      if (!item.disabled && item.action) {
        row.addEventListener('mouseenter', function () { this.style.background = 'rgba(255,255,255,.06)'; });
        row.addEventListener('mouseleave', function () { this.style.background = ''; });
        row.addEventListener('click', (function (fn) {
          return function () { menu.remove(); fn(); };
        })(item.action));
      }
      menu.appendChild(row);
    }

    document.body.appendChild(menu);

    // Fermer au clic ailleurs
    var closeMenu = function (e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(function () { document.addEventListener('click', closeMenu); }, 50);
  }

  // ---------------------------------------------------------------------------
  // ANNULATION + NOTIFICATION PATIENT
  // ---------------------------------------------------------------------------

  async function handleAnnulation(apt) {
    var html = '' +
      '<div class="ja-modal-title" style="color:#ef4444">Annuler le rendez-vous</div>' +
      '<div style="color:#a3a3a3;margin-bottom:16px">' +
        '<p><strong>' + esc(apt.patient) + '</strong></p>' +
        '<p>' + esc(findActeLabel(apt.categorie, apt.acte) || apt.acte || '') + ' — ' + timeStr(apt.start) + '</p>' +
      '</div>' +
      '<div class="ja-modal-field">' +
        '<label>Message au patient (optionnel)</label>' +
        '<textarea class="ja-modal-textarea" id="ja-annul-msg" placeholder="Ex : Suite à un imprévu, nous devons reporter votre rendez-vous..."></textarea>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
        '<input type="checkbox" id="ja-annul-notify" checked style="accent-color:#0d9488">' +
        '<label for="ja-annul-notify" style="font-size:13px;color:#a3a3a3">Envoyer une notification au patient' + (apt.patient_tel ? ' (SMS)' : apt.patient_email ? ' (email)' : '') + '</label>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">' +
        '<input type="checkbox" id="ja-annul-replan" checked style="accent-color:#0d9488">' +
        '<label for="ja-annul-replan" style="font-size:13px;color:#a3a3a3">Proposer d\'autres créneaux au patient</label>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
        '<button class="ja-btn-ghost" data-close>Garder le RDV</button>' +
        '<button class="ja-btn-danger" id="ja-annul-confirm">Annuler le rendez-vous</button>' +
      '</div>';

    var m = showModal(html);

    m.box.querySelector('#ja-annul-confirm').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Annulation...';

      try {
        await apiDelete(apt.id);

        var shouldNotify = m.box.querySelector('#ja-annul-notify').checked;
        var shouldReplan = m.box.querySelector('#ja-annul-replan').checked;
        var message = m.box.querySelector('#ja-annul-msg').value.trim();

        // Sauvegarder dans l'historique pour restauration
        _cancelledHistory.unshift({
          id: apt.id,
          patient: apt.patient,
          patient_nom: apt.patient_nom || apt.patient,
          patient_prenom: apt.patient_prenom || '',
          patient_tel: apt.patient_tel || '',
          patient_email: apt.patient_email || '',
          categorie: apt.categorie,
          acte: apt.acte,
          actes: apt.actes || [],
          start: apt.start ? apt.start.toISOString() : null,
          end: apt.end ? apt.end.toISOString() : null,
          notes: apt.notes || '',
          cancelled_at: new Date().toISOString(),
          reason: message
        });
        // Garder max 50 entrées
        if (_cancelledHistory.length > 50) _cancelledHistory = _cancelledHistory.slice(0, 50);
        try { localStorage.setItem('jadomi_agenda_cancelled', JSON.stringify(_cancelledHistory)); } catch (e) { /* ignore */ }

        // TODO: envoyer la notification SMS/email via /api/communication
        if (shouldNotify) {
          console.log('[agenda] Notification annulation à envoyer à', apt.patient_tel || apt.patient_email);
        }

        showToast('Rendez-vous annulé' + (shouldNotify ? ' — patient notifié' : '') + ' — restauration possible', 'success');
        m.close();

        if (shouldReplan) {
          showReplanModal(apt);
        }

        draw();
      } catch (e) {
        if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Annuler le rendez-vous';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // RE-PLANIFICATION — Proposer d'autres créneaux
  // ---------------------------------------------------------------------------

  function showReplanModal(apt) {
    var dur = durationMin(apt.start, apt.end);
    var acteLabel = findActeLabel(apt.categorie, apt.acte) || apt.acte || 'Consultation';

    // Générer les 5 prochains créneaux disponibles (heuristique simple)
    var slots = [];
    var now = new Date();
    var candidate = new Date(now);
    candidate.setHours(START_HOUR, 0, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);

    for (var attempt = 0; attempt < 30 && slots.length < 5; attempt++) {
      var dayName = ALL_DAYS[candidate.getDay() === 0 ? 6 : candidate.getDay() - 1];
      var dayConf = getDayConfig(dayName);

      // Vérifier si ce jour est travaillé
      if (!dayConf || !dayConf.actif) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(START_HOUR, 0, 0, 0);
        continue;
      }

      var startH = parseInt((dayConf.debut || '09:00').split(':')[0]);
      var endH = parseInt((dayConf.fin || '19:00').split(':')[0]);
      var h = candidate.getHours();
      if (h < startH) candidate.setHours(startH, 0, 0, 0);
      if (h >= endH) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(START_HOUR, 0, 0, 0);
        continue;
      }

      // Vérifier s'il n'y a pas déjà un RDV à cette heure
      var slotTaken = false;
      for (var ai = 0; ai < _appointments.length; ai++) {
        var existing = _appointments[ai];
        var eStart = minutesSinceMidnight(existing.start);
        var eEnd = minutesSinceMidnight(existing.end);
        var cStart = candidate.getHours() * 60 + candidate.getMinutes();
        var cEnd = cStart + dur;
        var sameDay = existing.start.toDateString() === candidate.toDateString();
        if (sameDay && cStart < eEnd && cEnd > eStart) {
          slotTaken = true;
          break;
        }
      }

      if (!slotTaken) {
        slots.push(new Date(candidate));
      }

      candidate.setMinutes(candidate.getMinutes() + 30);
      if (candidate.getHours() >= endH) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(startH, 0, 0, 0);
      }
    }

    var slotsHtml = '';
    for (var si = 0; si < slots.length; si++) {
      var s = slots[si];
      var dayLabel = ALL_DAYS[s.getDay() === 0 ? 6 : s.getDay() - 1];
      var dateStr = pad(s.getDate()) + '/' + pad(s.getMonth() + 1);
      slotsHtml += '<button class="ja-replan-slot" data-idx="' + si + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#e5e5e5;cursor:pointer;font-family:Inter,sans-serif;font-size:14px;transition:all .2s;margin-bottom:8px;text-align:left">' +
        '<span style="font-weight:700;color:#14b8a6;min-width:40px">' + dayLabel.slice(0, 3) + '</span>' +
        '<span>' + dateStr + '</span>' +
        '<span style="font-weight:600">' + pad(s.getHours()) + ':' + pad(s.getMinutes()) + '</span>' +
        '<span style="color:#737373;font-size:12px;margin-left:auto">' + dur + ' min</span>' +
      '</button>';
    }

    var html = '' +
      '<div class="ja-modal-title">Proposer un autre créneau</div>' +
      '<div style="color:#a3a3a3;margin-bottom:16px">' +
        '<p><strong>' + esc(apt.patient) + '</strong> — ' + esc(acteLabel) + ' (' + dur + ' min)</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:120px"><label style="font-size:11px;color:#737373;display:block;margin-bottom:4px">Jour souhaité</label>' +
          '<select id="ja-replan-jour" class="ja-modal-select" style="width:100%"><option value="">Tous les jours</option><option value="1">Lundi</option><option value="2">Mardi</option><option value="3">Mercredi</option><option value="4">Jeudi</option><option value="5">Vendredi</option><option value="6">Samedi</option></select></div>' +
        '<div style="flex:1;min-width:90px"><label style="font-size:11px;color:#737373;display:block;margin-bottom:4px">Entre</label>' +
          '<input id="ja-replan-de" type="time" class="ja-modal-input" value="09:00" style="width:100%"></div>' +
        '<div style="flex:1;min-width:90px"><label style="font-size:11px;color:#737373;display:block;margin-bottom:4px">Et</label>' +
          '<input id="ja-replan-a" type="time" class="ja-modal-input" value="19:00" style="width:100%"></div>' +
        '<div style="display:flex;align-items:flex-end"><button id="ja-replan-search" class="ja-btn-primary" style="padding:8px 16px;font-size:12px">Chercher</button></div>' +
      '</div>' +
      '<div style="margin-bottom:8px;font-size:13px;color:#737373">Créneaux disponibles :</div>' +
      '<div id="ja-replan-slots">' + slotsHtml + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">' +
        '<button class="ja-btn-ghost" data-close>Fermer</button>' +
      '</div>';

    var m = showModal(html);

    // Bouton Chercher avec filtres
    m.box.querySelector('#ja-replan-search').addEventListener('click', function() {
      var jourFilter = m.box.querySelector('#ja-replan-jour').value;
      var heureDeStr = m.box.querySelector('#ja-replan-de').value || '09:00';
      var heureAStr = m.box.querySelector('#ja-replan-a').value || '19:00';
      var heureDe = parseInt(heureDeStr.split(':')[0]) * 60 + parseInt(heureDeStr.split(':')[1] || 0);
      var heureA = parseInt(heureAStr.split(':')[0]) * 60 + parseInt(heureAStr.split(':')[1] || 0);

      var filteredSlots = [];
      var cand = new Date();
      cand.setHours(START_HOUR, 0, 0, 0);
      if (cand <= new Date()) cand.setDate(cand.getDate() + 1);

      for (var att = 0; att < 200 && filteredSlots.length < 8; att++) {
        var dName = ALL_DAYS[cand.getDay() === 0 ? 6 : cand.getDay() - 1];
        var dConf = getDayConfig(dName);
        var dayOfWeek = cand.getDay();

        // Filtre jour
        if (jourFilter && String(dayOfWeek) !== jourFilter) {
          cand.setDate(cand.getDate() + 1);
          cand.setHours(parseInt((dConf && dConf.debut || '09:00').split(':')[0]), 0, 0, 0);
          continue;
        }

        if (!dConf || !dConf.actif) {
          cand.setDate(cand.getDate() + 1);
          cand.setHours(START_HOUR, 0, 0, 0);
          continue;
        }

        var sH = parseInt((dConf.debut || '09:00').split(':')[0]);
        var eH = parseInt((dConf.fin || '19:00').split(':')[0]);
        var h = cand.getHours();
        if (h < sH) cand.setHours(sH, 0, 0, 0);
        if (h >= eH) {
          cand.setDate(cand.getDate() + 1);
          cand.setHours(START_HOUR, 0, 0, 0);
          continue;
        }

        // Filtre plage horaire
        var candMin = cand.getHours() * 60 + cand.getMinutes();
        if (candMin < heureDe || candMin + dur > heureA) {
          if (candMin < heureDe) { cand.setHours(Math.floor(heureDe / 60), heureDe % 60, 0, 0); continue; }
          cand.setDate(cand.getDate() + 1);
          cand.setHours(sH, 0, 0, 0);
          continue;
        }

        // Vérifier conflit
        var taken = false;
        for (var ai2 = 0; ai2 < _appointments.length; ai2++) {
          var ex = _appointments[ai2];
          var exS = minutesSinceMidnight(ex.start);
          var exE = minutesSinceMidnight(ex.end);
          var cS = cand.getHours() * 60 + cand.getMinutes();
          var cE = cS + dur;
          if (ex.start.toDateString() === cand.toDateString() && cS < exE && cE > exS) { taken = true; break; }
        }

        if (!taken) filteredSlots.push(new Date(cand));
        cand.setMinutes(cand.getMinutes() + 15);
        if (cand.getHours() >= eH) {
          cand.setDate(cand.getDate() + 1);
          cand.setHours(sH, 0, 0, 0);
        }
      }

      // Reconstruire le HTML des créneaux
      var newHtml = '';
      for (var fi = 0; fi < filteredSlots.length; fi++) {
        var fs = filteredSlots[fi];
        var fDay = ALL_DAYS[fs.getDay() === 0 ? 6 : fs.getDay() - 1];
        var fDate = pad(fs.getDate()) + '/' + pad(fs.getMonth() + 1);
        newHtml += '<button class="ja-replan-slot" data-idx="' + fi + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#e5e5e5;cursor:pointer;font-family:Inter,sans-serif;font-size:14px;transition:all .2s;margin-bottom:8px;text-align:left">' +
          '<span style="font-weight:700;color:#14b8a6;min-width:40px">' + fDay.slice(0, 3) + '</span>' +
          '<span>' + fDate + '</span>' +
          '<span style="font-weight:600">' + pad(fs.getHours()) + ':' + pad(fs.getMinutes()) + '</span>' +
          '<span style="color:#737373;font-size:12px;margin-left:auto">' + dur + ' min</span>' +
        '</button>';
      }
      if (filteredSlots.length === 0) newHtml = '<div style="color:#737373;text-align:center;padding:16px">Aucun créneau disponible avec ces filtres</div>';

      var slotsDiv = m.box.querySelector('#ja-replan-slots');
      slotsDiv.innerHTML = newHtml;

      // Re-bind les nouveaux slots
      var newBtns = slotsDiv.querySelectorAll('.ja-replan-slot');
      for (var nb = 0; nb < newBtns.length; nb++) {
        newBtns[nb].addEventListener('mouseenter', function () { this.style.borderColor = '#0d9488'; this.style.background = 'rgba(13,148,136,.1)'; });
        newBtns[nb].addEventListener('mouseleave', function () { this.style.borderColor = 'rgba(255,255,255,.08)'; this.style.background = 'rgba(255,255,255,.04)'; });
        (function(slot) {
          newBtns[nb].addEventListener('click', async function () {
            var startDt2 = slot;
            var endDt2 = new Date(startDt2.getTime() + dur * 60000);
            try {
              await apiPost({ patient_nom: apt.patient_nom || apt.patient, patient_prenom: apt.patient_prenom || '', date_heure: startDt2.toISOString(), duree_minutes: dur, categorie: apt.categorie, acte: apt.acte, notes: apt.notes || '' });
              showToast('Nouveau créneau réservé');
              m.close();
              await loadAppointments();
            } catch (e) { showToast('Erreur: ' + e.message, 'error'); }
          });
        })(filteredSlots[nb]);
      }
    });

    // Bind les slots initiaux
    var slotBtns = m.box.querySelectorAll('.ja-replan-slot');
    for (var sb = 0; sb < slotBtns.length; sb++) {
      slotBtns[sb].addEventListener('mouseenter', function () { this.style.borderColor = '#0d9488'; this.style.background = 'rgba(13,148,136,.1)'; });
      slotBtns[sb].addEventListener('mouseleave', function () { this.style.borderColor = 'rgba(255,255,255,.08)'; this.style.background = 'rgba(255,255,255,.04)'; });
      slotBtns[sb].addEventListener('click', (function (slot, aptRef) {
        return async function () {
          var startDt = slot;
          var endDt = new Date(startDt.getTime() + dur * 60000);
          try {
            await apiPost({
              patient_nom: aptRef.patient_nom || aptRef.patient,
              patient_prenom: aptRef.patient_prenom || '',
              patient_tel: aptRef.patient_tel || '',
              patient_email: aptRef.patient_email || '',
              categorie: aptRef.categorie,
              acte: aptRef.acte,
              actes: aptRef.actes || [],
              debut: startDt.toISOString(),
              fin: endDt.toISOString(),
              duree: dur,
              notes: aptRef.notes || ''
            });
            showToast('Nouveau RDV créé pour ' + esc(aptRef.patient), 'success');
            m.close();
            draw();
          } catch (e) {
            if (e.message !== '401') showToast('Erreur : ' + e.message, 'error');
          }
        };
      })(slots[parseInt(slotBtns[sb].getAttribute('data-idx'))], apt));
    }
  }

  // ---------------------------------------------------------------------------
  // CAS CLINIQUE — tout en un : photos/videos + passeport + partage
  // ---------------------------------------------------------------------------

  function showCasCliniqueModal(apt) {
    var patientName = apt ? (apt.patient || apt.patient_nom || '') : '';
    var acteLabel = apt ? (findActeLabel(apt.categorie, apt.acte) || getCategoryLabel(apt.categorie) || '') : '';
    var color = apt ? getCategoryColor(apt.categorie) : '#0d9488';

    var html = '' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">' +
        '<div style="width:48px;height:48px;border-radius:12px;background:' + color + '22;border:1px solid ' + color + '44;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">&#128193;</div>' +
        '<div>' +
          '<div style="font-size:18px;font-weight:700;color:#fff">' + esc(patientName) + '</div>' +
          '<div style="font-size:13px;color:#a3a3a3">' + esc(acteLabel) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        // Photos/Videos patient
        '<div id="ja-cas-photo" style="background:rgba(236,72,153,.06);border:1px solid rgba(236,72,153,.15);border-radius:14px;padding:20px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor=\'#ec4899\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(236,72,153,.15)\';this.style.transform=\'\'">' +
          '<div style="font-size:32px;margin-bottom:6px">&#128248;</div>' +
          '<div style="font-weight:700;color:#ec4899;font-size:14px">Photos/vid\u00e9os patient</div>' +
          '<div style="font-size:11px;color:#737373;margin-top:4px">QR code au fauteuil</div>' +
        '</div>' +
        // Passeport
        '<div id="ja-cas-passeport" style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15);border-radius:14px;padding:20px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor=\'#fbbf24\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(251,191,36,.15)\';this.style.transform=\'\'">' +
          '<div style="font-size:32px;margin-bottom:6px">&#128203;</div>' +
          '<div style="font-weight:700;color:#fbbf24;font-size:14px">Passeport</div>' +
          '<div style="font-size:11px;color:#737373;margin-top:4px">Consignes patient</div>' +
        '</div>' +
        // Notes
        '<div id="ja-cas-notes" style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:14px;padding:20px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor=\'#3b82f6\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(59,130,246,.15)\';this.style.transform=\'\'">' +
          '<div style="font-size:32px;margin-bottom:6px">&#128172;</div>' +
          '<div style="font-weight:700;color:#3b82f6;font-size:14px">Notes</div>' +
          '<div style="font-size:11px;color:#737373;margin-top:4px">Dentiste + proth\u00e9siste</div>' +
        '</div>' +
        // Partager
        '<div id="ja-cas-share" style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:14px;padding:20px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor=\'#22c55e\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(34,197,94,.15)\';this.style.transform=\'\'">' +
          '<div style="font-size:32px;margin-bottom:6px">&#128279;</div>' +
          '<div style="font-weight:700;color:#22c55e;font-size:14px">Partager</div>' +
          '<div style="font-size:11px;color:#737373;margin-top:4px">Proth\u00e9siste / patient</div>' +
        '</div>' +
      '</div>' +
      // Zone QR (cachée, s'affiche quand on clique Photos/videos)
      '<div id="ja-cas-qr-zone" style="display:none;margin-top:16px;text-align:center;padding:24px;background:rgba(236,72,153,.04);border:1px solid rgba(236,72,153,.12);border-radius:14px">' +
        '<div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:8px">QR Code — Photos/vid\u00e9os</div>' +
        '<div style="font-size:12px;color:#a3a3a3;margin-bottom:12px">Scannez avec votre t\u00e9l\u00e9phone pour prendre les photos au fauteuil</div>' +
        '<div style="background:#fff;padding:16px;border-radius:12px;display:inline-block;margin-bottom:12px">' +
          '<img id="ja-cas-qr-img" src="" style="width:200px;height:200px" />' +
        '</div>' +
        '<div><button class="ja-btn-primary" id="ja-cas-qr-print" style="padding:8px 20px;font-size:13px">Imprimer</button></div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:16px"><button class="ja-btn-ghost" data-close>Fermer</button></div>';

    var m = showModal(html);

    // Photos/videos → generer QR
    m.box.querySelector('#ja-cas-photo').addEventListener('click', function() {
      var qrZone = m.box.querySelector('#ja-cas-qr-zone');
      if (qrZone.style.display === 'none') {
        var snapUrl = location.origin + '/agenda/checkin.html?mode=photo&name=' + encodeURIComponent(patientName);
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(snapUrl);
        m.box.querySelector('#ja-cas-qr-img').src = qrUrl;
        qrZone.style.display = 'block';
      } else {
        qrZone.style.display = 'none';
      }
    });

    // Print QR
    m.box.querySelector('#ja-cas-qr-print').addEventListener('click', function() {
      var qrSrc = m.box.querySelector('#ja-cas-qr-img').src;
      var w = window.open('', '_blank');
      w.document.write('<html><head><title>QR Photos</title></head><body style="text-align:center;padding:40px;font-family:Arial"><h2>Photos patient</h2><p style="color:#666;font-size:18px">' + esc(patientName) + '</p><p style="color:#999">Scannez pour prendre les photos au fauteuil</p><img src="' + qrSrc + '" style="width:300px;height:300px;margin:20px"><p style="color:#0d9488;font-weight:bold;font-size:18px">JADOMI</p></body></html>');
      w.document.close();
      setTimeout(function() { w.print(); }, 500);
    });

    // Passeport → ouvrir le modal passeport
    m.box.querySelector('#ja-cas-passeport').addEventListener('click', function() {
      m.close();
      showPasseportModal(apt);
    });

    // Notes → ouvrir dans dentiste-pro
    m.box.querySelector('#ja-cas-notes').addEventListener('click', function() {
      window.open('/admin/dentiste-pro?tab=cases', '_blank');
      m.close();
    });

    // Partage → generer liens
    m.box.querySelector('#ja-cas-share').addEventListener('click', function() {
      var shareHtml = '' +
        '<div style="margin-top:16px;padding:16px;background:rgba(34,197,94,.04);border:1px solid rgba(34,197,94,.12);border-radius:12px">' +
          '<div style="font-size:13px;font-weight:600;color:#22c55e;margin-bottom:10px">Partager ce cas</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:8px">' +
            '<button class="ja-btn-primary" style="flex:1;padding:10px;font-size:13px" onclick="showToast(\'Lien proth\u00e9siste copi\u00e9\',\'success\');navigator.clipboard.writeText(location.origin+\'/cas-clinique/partage/prothesiste-\'+Date.now())">&#129463; Lien proth\u00e9siste</button>' +
            '<button class="ja-btn-primary" style="flex:1;padding:10px;font-size:13px;background:#3b82f6" onclick="showToast(\'Lien patient copi\u00e9\',\'success\');navigator.clipboard.writeText(location.origin+\'/cas-clinique/partage/patient-\'+Date.now())">&#128100; Lien patient</button>' +
          '</div>' +
          '<div style="font-size:11px;color:#525252">Le lien donne acces aux photos et notes du cas.</div>' +
        '</div>';
      var existing = m.box.querySelector('#ja-cas-share-zone');
      if (existing) { existing.remove(); return; }
      var div = document.createElement('div');
      div.id = 'ja-cas-share-zone';
      div.innerHTML = shareHtml;
      m.box.querySelector('#ja-cas-share').parentElement.parentElement.appendChild(div);
    });
  }

  // ---------------------------------------------------------------------------
  // PASSEPORT PATIENT — modal choix type + avec/sans photo
  // ---------------------------------------------------------------------------

  function showPasseportModal(apt) {
    var patientName = apt ? (apt.patient || apt.patient_nom || '') : '';

    var passeports = [
      {id:'blanchiment',label:'Blanchiment',icon:'&#10024;',color:'#fbbf24',desc:'Suivi des s\u00e9ances, consignes alimentaires'},
      {id:'implant',label:'Implant',icon:'&#129463;',color:'#ef4444',desc:'8 \u00e9tapes, consignes post-op J1 \u00e0 J7'},
      {id:'facettes',label:'Facettes',icon:'&#128142;',color:'#a855f7',desc:'6 s\u00e9ances, entretien, aliments'},
      {id:'orthodontie',label:'Orthodontie',icon:'&#128295;',color:'#3b82f6',desc:'Mois par mois, goutti\u00e8res/bagues'},
      {id:'rehabilitation',label:'R\u00e9habilitation',icon:'&#127942;',color:'#22c55e',desc:'10 \u00e9tapes, alimentation progressive'}
    ];

    var cardsHtml = '';
    for (var pi3 = 0; pi3 < passeports.length; pi3++) {
      var pp = passeports[pi3];
      cardsHtml += '<div class="ja-passeport-choice" data-type="' + pp.id + '" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;cursor:pointer;transition:all .2s;text-align:center" onmouseover="this.style.borderColor=\'' + pp.color + '\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,.08)\';this.style.transform=\'\'">' +
        '<div style="font-size:32px;margin-bottom:6px">' + pp.icon + '</div>' +
        '<div style="font-weight:700;color:#fff;font-size:14px">' + pp.label + '</div>' +
        '<div style="font-size:11px;color:#737373;margin-top:4px;line-height:1.4">' + pp.desc + '</div>' +
      '</div>';
    }

    var html = '' +
      '<div class="ja-modal-title">Passeport patient' + (patientName ? ' — ' + esc(patientName) : '') + '</div>' +
      '<div style="font-size:13px;color:#a3a3a3;margin-bottom:16px">Choisissez le type de passeport :</div>' +
      '<div id="ja-passeport-step1" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">' + cardsHtml + '</div>' +
      '<div id="ja-passeport-step2" style="display:none">' +
        '<div style="text-align:center;margin-bottom:20px">' +
          '<div style="font-size:40px;margin-bottom:8px" id="ja-pp-icon"></div>' +
          '<div style="font-size:18px;font-weight:700;color:#fff" id="ja-pp-title"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
          '<div id="ja-pp-with-photo" style="background:rgba(236,72,153,.08);border:2px solid rgba(236,72,153,.2);border-radius:14px;padding:24px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor=\'#ec4899\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(236,72,153,.2)\';this.style.transform=\'\'">' +
            '<div style="font-size:36px;margin-bottom:8px">&#128248;</div>' +
            '<div style="font-weight:700;color:#ec4899;font-size:15px;margin-bottom:4px">Avec photos/vid\u00e9os</div>' +
            '<div style="font-size:12px;color:#a3a3a3;line-height:1.4">QR code pour capturer<br>les photos/vid\u00e9os patient au fauteuil.</div>' +
          '</div>' +
          '<div id="ja-pp-no-photo" style="background:rgba(13,148,136,.08);border:2px solid rgba(13,148,136,.2);border-radius:14px;padding:24px;cursor:pointer;text-align:center;transition:all .2s" onmouseover="this.style.borderColor=\'#0d9488\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'rgba(13,148,136,.2)\';this.style.transform=\'\'">' +
            '<div style="font-size:36px;margin-bottom:8px">&#128196;</div>' +
            '<div style="font-weight:700;color:#14b8a6;font-size:15px;margin-bottom:4px">Sans photos</div>' +
            '<div style="font-size:12px;color:#a3a3a3;line-height:1.4">Ouvre le passeport directement.<br>Indications et consignes uniquement.</div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:center;margin-top:16px"><button class="ja-btn-ghost" id="ja-pp-back" style="font-size:12px">&larr; Retour au choix</button></div>' +
      '</div>' +
      '<div id="ja-passeport-step3" style="display:none;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">&#128241;</div>' +
        '<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px">QR Code g\u00e9n\u00e9r\u00e9</div>' +
        '<div style="font-size:13px;color:#a3a3a3;margin-bottom:16px">Le patient scanne ce QR pour prendre ses photos avant/apr\u00e8s</div>' +
        '<div style="background:#fff;padding:20px;border-radius:14px;display:inline-block;margin-bottom:16px">' +
          '<img id="ja-pp-qr-img" src="" style="width:200px;height:200px" />' +
        '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center">' +
          '<button class="ja-btn-primary" id="ja-pp-print-qr">Imprimer le QR</button>' +
          '<button class="ja-btn-ghost" data-close>Fermer</button>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:12px" id="ja-pp-close-row">' +
        '<button class="ja-btn-ghost" data-close>Fermer</button>' +
      '</div>';

    var m = showModal(html);
    var selectedType = null;

    // Step 1 : choix du type
    m.box.querySelectorAll('.ja-passeport-choice').forEach(function(card) {
      card.addEventListener('click', function() {
        selectedType = this.getAttribute('data-type');
        var pp = passeports.find(function(p) { return p.id === selectedType; });
        m.box.querySelector('#ja-passeport-step1').style.display = 'none';
        m.box.querySelector('#ja-passeport-step2').style.display = 'block';
        m.box.querySelector('#ja-pp-close-row').style.display = 'none';
        m.box.querySelector('#ja-pp-icon').innerHTML = pp.icon;
        m.box.querySelector('#ja-pp-title').textContent = 'Passeport ' + pp.label;
      });
    });

    // Step 2 : avec ou sans photo
    m.box.querySelector('#ja-pp-no-photo').addEventListener('click', function() {
      window.open('/documents/passeport-' + selectedType + '.html', '_blank');
      m.close();
    });

    m.box.querySelector('#ja-pp-with-photo').addEventListener('click', function() {
      // Générer un QR code pour le snap photo
      var snapUrl = location.origin + '/agenda/checkin.html?cabinet=default&name=' + encodeURIComponent(patientName || 'Patient') + '&mode=photo&passeport=' + selectedType;
      var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(snapUrl);
      m.box.querySelector('#ja-pp-qr-img').src = qrUrl;
      m.box.querySelector('#ja-passeport-step2').style.display = 'none';
      m.box.querySelector('#ja-passeport-step3').style.display = 'block';
    });

    // Print QR
    var printBtn = m.box.querySelector('#ja-pp-print-qr');
    if (printBtn) {
      printBtn.addEventListener('click', function() {
        var qrSrc = m.box.querySelector('#ja-pp-qr-img').src;
        var w = window.open('', '_blank');
        w.document.write('<html><head><title>QR Passeport ' + selectedType + '</title></head><body style="text-align:center;padding:40px;font-family:Arial">' +
          '<h2>Passeport ' + selectedType + '</h2>' +
          '<p style="color:#666">' + esc(patientName || 'Patient') + '</p>' +
          '<p style="color:#999">Scannez pour prendre vos photos avant/apr\u00e8s</p>' +
          '<img src="' + qrSrc + '" style="width:300px;height:300px;margin:20px">' +
          '<p style="color:#0d9488;font-weight:bold">JADOMI</p></body></html>');
        w.document.close();
        setTimeout(function() { w.print(); }, 500);
      });
    }

    // Retour
    m.box.querySelector('#ja-pp-back').addEventListener('click', function() {
      m.box.querySelector('#ja-passeport-step2').style.display = 'none';
      m.box.querySelector('#ja-passeport-step1').style.display = 'grid';
      m.box.querySelector('#ja-pp-close-row').style.display = 'block';
    });
  }

  // Rendre accessible globalement pour JADOMI IA
  window.JADOMI_PRO.showPasseportModal = showPasseportModal;

  // ---------------------------------------------------------------------------
  // QR CODE CHECK-IN : mise à jour statut depuis l'extérieur
  // ---------------------------------------------------------------------------
  // Polling : si un patient scanne le QR en salle d'attente, le statut change
  // On vérifie toutes les 30s si un RDV est passé en "arrive" côté serveur
  var _checkinPollTimer = null;
  function startCheckinPolling() {
    if (_checkinPollTimer) return;
    _checkinPollTimer = setInterval(function () {
      if (!_copilotActive) { // Ne pas redraw pendant un soin
        draw(); // Refresh l'agenda pour capter les check-ins
      }
    }, 30000);
  }

  // ---------------------------------------------------------------------------
  // ALERTE RETARD PLANNING — détecte si le planning dérape
  // ---------------------------------------------------------------------------

  function checkPlanningOverload() {
    if (!_appointments || _appointments.length === 0) return;
    var now = new Date();
    var todayStr = now.toDateString();
    var todayApts = _appointments.filter(function (a) {
      return a.start && a.start.toDateString() === todayStr;
    });
    if (todayApts.length === 0) return;

    // Trouver les RDV en retard (statut planifié mais heure dépassée)
    var retardCount = 0;
    var totalRetardMin = 0;
    var lastEnSoin = null;
    var nextPlanifie = null;

    for (var i = 0; i < todayApts.length; i++) {
      var a = todayApts[i];
      if (a.statut === 'en_soin') lastEnSoin = a;
      if ((a.statut === 'planifie' || a.statut === 'arrive') && a.start < now) {
        retardCount++;
        totalRetardMin += Math.round((now - a.start) / 60000);
      }
      if (!nextPlanifie && a.statut === 'planifie' && a.start > now) {
        nextPlanifie = a;
      }
    }

    // Si le retard accumulé dépasse le seuil → alerte
    var seuil = (_settings && _settings.alerteRetard) || 15;
    if (retardCount >= 2 && totalRetardMin > seuil * 2) {
      showPlanningAlert(retardCount, totalRetardMin, todayApts, lastEnSoin);
    }
  }

  function showPlanningAlert(retardCount, totalRetardMin, todayApts, lastEnSoin) {
    // Ne pas afficher si déjà affiché récemment (cooldown 10 min)
    var lastAlert = parseInt(localStorage.getItem('jadomi_planning_alert_at') || '0');
    if (Date.now() - lastAlert < 600000) return;
    localStorage.setItem('jadomi_planning_alert_at', String(Date.now()));

    // Identifier les RDV qu'on pourrait déplacer (les plus simples/courts)
    var deplacables = todayApts.filter(function (a) {
      return a.statut === 'planifie' && a.start > new Date();
    }).sort(function (a, b) {
      // Prioriser les soins courts et simples
      var da = durationMin(a.start, a.end);
      var db = durationMin(b.start, b.end);
      return da - db;
    });

    var suggestions = '';
    if (deplacables.length > 0) {
      suggestions = '<div style="margin-top:12px;font-size:13px;color:#a3a3a3">' +
        '<div style="font-weight:600;color:#f59e0b;margin-bottom:6px">Suggestion pour rattraper le retard :</div>';
      // Proposer de déplacer les derniers RDV (les plus loin dans la journée)
      var toReplan = deplacables.slice(-2);
      for (var i = 0; i < toReplan.length; i++) {
        var r = toReplan[i];
        suggestions += '<div style="margin-bottom:4px">Proposer de reporter <strong>' + esc(r.patient) + '</strong> (' + timeStr(r.start) + ', ' + durationMin(r.start, r.end) + ' min) → ' +
          '<a href="#" class="ja-replan-link" data-aptid="' + r.id + '" style="color:#14b8a6;text-decoration:underline;cursor:pointer">reprogrammer</a></div>';
      }
      suggestions += '</div>';
    }

    var html = '' +
      '<div class="ja-modal-title" style="color:#f59e0b;display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:24px">&#9888;</span>' +
        '<span>Planning en retard</span>' +
      '</div>' +
      '<div style="color:#e5e5e5;margin-bottom:12px">' +
        '<p><strong>' + retardCount + ' rendez-vous</strong> en retard — <strong>' + totalRetardMin + ' minutes</strong> de décalage accumulé.</p>' +
      '</div>' +
      '<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:10px;padding:14px;margin-bottom:12px">' +
        '<div style="font-size:13px;color:#a3a3a3;line-height:1.6">' +
          '<strong style="color:#f59e0b">Conseil JADOMI IA :</strong> Priorisez les soins simples et rapides pour rattraper le retard. ' +
          'Les actes longs (endodontie molaire, chirurgie) peuvent être reportés si possible.' +
        '</div>' +
      '</div>' +
      suggestions +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">' +
        '<button class="ja-btn-ghost" data-close>Compris</button>' +
      '</div>';

    var m = showModal(html);

    // Bind replan links
    var replanLinks = m.box.querySelectorAll('.ja-replan-link');
    for (var rl = 0; rl < replanLinks.length; rl++) {
      replanLinks[rl].addEventListener('click', (function (aptId, modal) {
        return function (e) {
          e.preventDefault();
          var apt = _appointments.find(function (a) { return a.id === aptId; });
          if (apt) {
            modal.close();
            showReplanModal(apt);
          }
        };
      })(replanLinks[rl].getAttribute('data-aptid'), m));
    }
  }

  // Vérifier le planning toutes les 5 minutes
  setInterval(checkPlanningOverload, 300000);

  // ---------------------------------------------------------------------------
  // HISTORIQUE DES ANNULATIONS
  // ---------------------------------------------------------------------------

  function showCancelledHistory() {
    if (_cancelledHistory.length === 0) {
      showToast('Aucun rendez-vous annulé récemment', 'info');
      return;
    }

    var rows = '';
    for (var i = 0; i < _cancelledHistory.length; i++) {
      var c = _cancelledHistory[i];
      var dateStr = c.start ? new Date(c.start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '?';
      var timeStr2 = c.start ? new Date(c.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '?';
      var cancelDate = c.cancelled_at ? new Date(c.cancelled_at).toLocaleDateString('fr-FR') : '?';
      rows += '' +
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:8px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;color:#e5e5e5;font-size:14px">' + esc(c.patient || c.patient_nom || '?') + '</div>' +
            '<div style="font-size:12px;color:#737373">' + dateStr + ' à ' + timeStr2 + ' — annulé le ' + cancelDate + '</div>' +
            (c.reason ? '<div style="font-size:11px;color:#525252;margin-top:2px">Motif : ' + esc(c.reason) + '</div>' : '') +
          '</div>' +
          '<button class="ja-restore-btn" data-idx="' + i + '" style="background:rgba(13,148,136,.15);color:#14b8a6;border:1px solid rgba(13,148,136,.3);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:Inter,sans-serif">Restaurer</button>' +
          '<button class="ja-remove-hist-btn" data-idx="' + i + '" style="background:none;border:none;color:#525252;cursor:pointer;font-size:14px;padding:4px" title="Supprimer de l\'historique">&times;</button>' +
        '</div>';
    }

    var html = '' +
      '<div class="ja-modal-title">Rendez-vous annulés</div>' +
      '<div style="max-height:400px;overflow-y:auto">' + rows + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:space-between;margin-top:16px">' +
        '<button class="ja-btn-ghost" id="ja-clear-history" style="font-size:12px;color:#ef4444;border-color:rgba(239,68,68,.2)">Vider l\'historique</button>' +
        '<button class="ja-btn-ghost" data-close>Fermer</button>' +
      '</div>';

    var m = showModal(html);

    // Bind restore buttons
    var restoreBtns = m.box.querySelectorAll('.ja-restore-btn');
    for (var rb = 0; rb < restoreBtns.length; rb++) {
      restoreBtns[rb].addEventListener('click', (function (idx, modal) {
        return async function () {
          var entry = _cancelledHistory[idx];
          if (!entry) return;
          try {
            await apiPost({
              patient_nom: entry.patient_nom || entry.patient,
              patient_prenom: entry.patient_prenom || '',
              patient_tel: entry.patient_tel || '',
              patient_email: entry.patient_email || '',
              categorie: entry.categorie || 'consultation',
              acte: entry.acte || 'premiere_consultation',
              actes: entry.actes || [],
              debut: entry.start,
              fin: entry.end,
              duree: entry.start && entry.end ? Math.round((new Date(entry.end) - new Date(entry.start)) / 60000) : 30,
              notes: entry.notes || ''
            });
            _cancelledHistory.splice(idx, 1);
            try { localStorage.setItem('jadomi_agenda_cancelled', JSON.stringify(_cancelledHistory)); } catch (e) { /* ignore */ }
            showToast('Rendez-vous restauré pour ' + esc(entry.patient || entry.patient_nom), 'success');
            modal.close();
            draw();
          } catch (e) {
            if (e.message !== '401') showToast('Erreur restauration : ' + e.message, 'error');
          }
        };
      })(parseInt(restoreBtns[rb].getAttribute('data-idx')), m));
    }

    // Bind remove buttons
    var removeBtns = m.box.querySelectorAll('.ja-remove-hist-btn');
    for (var rm = 0; rm < removeBtns.length; rm++) {
      removeBtns[rm].addEventListener('click', (function (idx, modal) {
        return function () {
          _cancelledHistory.splice(idx, 1);
          try { localStorage.setItem('jadomi_agenda_cancelled', JSON.stringify(_cancelledHistory)); } catch (e) { /* ignore */ }
          modal.close();
          showCancelledHistory(); // Re-ouvrir pour refresh
        };
      })(parseInt(removeBtns[rm].getAttribute('data-idx')), m));
    }

    // Clear all
    var clearBtn = m.box.querySelector('#ja-clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        _cancelledHistory = [];
        try { localStorage.setItem('jadomi_agenda_cancelled', JSON.stringify(_cancelledHistory)); } catch (e) { /* ignore */ }
        showToast('Historique vidé', 'info');
        m.close();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // QR CODE CHECK-IN — Modal pour afficher/imprimer le QR
  // ---------------------------------------------------------------------------

  function showQRCodeModal() {
    var cabinetName = 'Precision Dentaire'; // TODO: dynamique
    var checkinUrl = window.location.origin + '/agenda/checkin.html?cabinet=default&name=' + encodeURIComponent(cabinetName);

    var html = '' +
      '<div class="ja-modal-title">QR Code — Check-in Patient</div>' +
      '<div style="text-align:center;margin-bottom:20px">' +
        '<p style="color:#a3a3a3;margin-bottom:16px">Affichez ce QR code en salle d\'attente.<br>Le patient le scanne pour signaler son arrivée.</p>' +
        '<div id="ja-qr-container" style="background:#fff;padding:24px;border-radius:16px;display:inline-block;margin-bottom:16px">' +
          '<img id="ja-qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(checkinUrl) + '" alt="QR Code" style="width:250px;height:250px">' +
        '</div>' +
        '<div style="font-size:12px;color:#525252;margin-bottom:12px">' + esc(checkinUrl) + '</div>' +
        '<div style="background:rgba(13,148,136,.06);border:1px solid rgba(13,148,136,.15);border-radius:10px;padding:16px;text-align:left;max-width:400px;margin:0 auto">' +
          '<div style="font-weight:600;color:#14b8a6;margin-bottom:6px">Comment ça marche :</div>' +
          '<div style="font-size:13px;color:#a3a3a3;line-height:1.6">' +
            '1. Imprimez ce QR code et affichez-le en salle d\'attente<br>' +
            '2. Le patient scanne avec son téléphone<br>' +
            '3. Il confirme son nom et sa date de naissance<br>' +
            '4. Son statut passe automatiquement en "Arrivé" sur votre agenda<br>' +
            '5. Vous recevez la notification en temps réel' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button class="ja-btn-primary" id="ja-qr-print">Imprimer le QR Code</button>' +
        '<button class="ja-btn-ghost" id="ja-qr-copy">Copier le lien</button>' +
        '<button class="ja-btn-ghost" data-close>Fermer</button>' +
      '</div>';

    var m = showModal(html);

    m.box.querySelector('#ja-qr-print').addEventListener('click', function () {
      var printWin = window.open('', '_blank');
      printWin.document.write('<html><head><title>QR Check-in — ' + esc(cabinetName) + '</title></head><body style="text-align:center;padding:40px;font-family:Arial,sans-serif">' +
        '<h1 style="margin-bottom:8px">' + esc(cabinetName) + '</h1>' +
        '<p style="color:#666;margin-bottom:24px;font-size:18px">Scannez ce QR code pour signaler votre arrivée</p>' +
        '<img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(checkinUrl) + '" style="width:400px;height:400px">' +
        '<p style="color:#999;margin-top:24px;font-size:14px">Ouvrez l\'appareil photo de votre téléphone et pointez-le vers le code</p>' +
        '<p style="color:#0d9488;font-weight:bold;margin-top:16px;font-size:16px">JADOMI</p>' +
        '</body></html>');
      printWin.document.close();
      printWin.focus();
      setTimeout(function () { printWin.print(); }, 500);
    });

    m.box.querySelector('#ja-qr-copy').addEventListener('click', function () {
      navigator.clipboard.writeText(checkinUrl).then(function () {
        showToast('Lien copié', 'success');
      }).catch(function () {
        showToast('Erreur copie', 'error');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------------
  window.JADOMI_PRO.renderAgenda = renderAgenda;
  window.JADOMI_PRO.refreshAgenda = refreshAgenda;
  // Démarrer le polling check-in
  startCheckinPolling();

  // Also expose as globals for convenience
  window.renderAgenda = renderAgenda;
  window.refreshAgenda = refreshAgenda;

})();
