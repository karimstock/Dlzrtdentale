/**
 * tab-equipe.js — Gestion de l'equipe (team permissions checkboxes)
 * JADOMI Dentiste Pro Admin Dashboard
 */

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                         */
/* ------------------------------------------------------------------ */

const ROLE_PRESETS = {
  associe:    { agenda:true, patients:true, chat:true, stock:true, comptabilite:true, facturation:true, statistiques:true, configuration:true, waitlist:true, rappels:true, chat_ia_config:true, series:true, documents:true, timeline:true },
  secretaire: { agenda:true, patients:true, chat:true, stock:false, comptabilite:false, facturation:false, statistiques:false, configuration:false, waitlist:true, rappels:true, chat_ia_config:false, series:true, documents:true, timeline:false },
  assistante: { agenda:true, patients:true, chat:true, stock:false, comptabilite:false, facturation:false, statistiques:false, configuration:false, waitlist:true, rappels:true, chat_ia_config:false, series:false, documents:true, timeline:false },
  comptable:  { agenda:false, patients:false, chat:false, stock:false, comptabilite:true, facturation:true, statistiques:true, configuration:false, waitlist:false, rappels:false, chat_ia_config:false, series:false, documents:true, timeline:false },
  stagiaire:  { agenda:true, patients:true, chat:false, stock:false, comptabilite:false, facturation:false, statistiques:false, configuration:false, waitlist:false, rappels:false, chat_ia_config:false, series:false, documents:false, timeline:false }
};

const MODULE_META = [
  { key:'agenda',         label:'Agenda / RDV',      icon:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key:'patients',       label:'Patients',           icon:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { key:'chat',           label:'Chat',               icon:'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key:'stock',          label:'Stock',              icon:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key:'comptabilite',   label:'Comptabilit\u00e9',  icon:'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { key:'facturation',    label:'Facturation',        icon:'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { key:'statistiques',   label:'Statistiques',       icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { key:'configuration',  label:'Configuration',      icon:'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  { key:'waitlist',       label:"Liste d'attente",    icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key:'rappels',        label:'Rappels',            icon:'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { key:'chat_ia_config', label:'Config Chat IA',     icon:'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key:'series',         label:'S\u00e9ries RDV',    icon:'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  { key:'documents',      label:'Documents',          icon:'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { key:'timeline',       label:'Timeline photos',    icon:'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' }
];

const ROLE_COLORS = {
  associe:    { bg:'#92400e', text:'#fbbf24', label:'Associ\u00e9' },
  secretaire: { bg:'#1e3a5f', text:'#60a5fa', label:'Secr\u00e9taire' },
  assistante: { bg:'#134e4a', text:'#2dd4bf', label:'Assistante' },
  comptable:  { bg:'#3b0764', text:'#c084fc', label:'Comptable' },
  stagiaire:  { bg:'#374151', text:'#9ca3af', label:'Stagiaire' }
};

/* ------------------------------------------------------------------ */
/*  DEMO DATA                                                         */
/* ------------------------------------------------------------------ */

let _teamMembers = [
  { id:'t1', nom:'Dupont', prenom:'Marie', email:'marie.dupont@cabinet.fr', role:'secretaire', active:true, last_login:'2026-04-24T14:30:00Z', permissions:{ ...ROLE_PRESETS.secretaire } },
  { id:'t2', nom:'Martin', prenom:'Julie', email:'julie.martin@cabinet.fr', role:'assistante', active:true, last_login:'2026-04-23T09:15:00Z', permissions:{ ...ROLE_PRESETS.assistante } },
  { id:'t3', nom:'Bernard', prenom:'Pierre', email:'pierre.bernard@cabinet.fr', role:'comptable', active:false, last_login:'2026-04-10T16:00:00Z', permissions:{ ...ROLE_PRESETS.comptable } }
];

/* ------------------------------------------------------------------ */
/*  STYLES                                                            */
/* ------------------------------------------------------------------ */

function injectEquipeStyles() {
  if (document.getElementById('equipe-styles')) return;
  const style = document.createElement('style');
  style.id = 'equipe-styles';
  style.textContent = `
    /* ---------- Layout ---------- */
    .eq-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; }
    .eq-title  { font-size:1.55rem; font-weight:700; color:#f1f5f9; }
    .eq-btn-add {
      padding:10px 22px; border:none; border-radius:10px; cursor:pointer;
      background:linear-gradient(135deg,#0d9488,#14b8a6); color:#fff;
      font-weight:600; font-size:.92rem; transition:all .25s;
      box-shadow:0 4px 14px rgba(20,184,166,.25);
    }
    .eq-btn-add:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(20,184,166,.35); }

    /* ---------- Cards ---------- */
    .eq-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:20px; }
    .eq-card {
      background:rgba(30,41,59,.65); border:1px solid rgba(148,163,184,.12);
      border-radius:16px; padding:22px; backdrop-filter:blur(12px);
      transition:all .3s ease; position:relative;
    }
    .eq-card:hover { border-color:rgba(20,184,166,.3); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.25); }
    .eq-card-top { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
    .eq-avatar {
      width:48px; height:48px; border-radius:12px; display:flex;
      align-items:center; justify-content:center; font-weight:700;
      font-size:1.05rem; flex-shrink:0;
    }
    .eq-name { font-weight:600; color:#f1f5f9; font-size:1.05rem; }
    .eq-email { color:#94a3b8; font-size:.82rem; margin-top:2px; }
    .eq-role-badge {
      display:inline-block; padding:3px 10px; border-radius:6px;
      font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px;
    }
    .eq-meta { display:flex; align-items:center; justify-content:space-between; margin-top:14px; padding-top:14px; border-top:1px solid rgba(148,163,184,.1); }
    .eq-last-login { color:#64748b; font-size:.78rem; }

    /* Toggle switch */
    .eq-toggle { position:relative; width:44px; height:24px; cursor:pointer; }
    .eq-toggle input { opacity:0; width:0; height:0; }
    .eq-toggle-track {
      position:absolute; inset:0; border-radius:12px;
      background:#374151; transition:background .3s;
    }
    .eq-toggle input:checked + .eq-toggle-track { background:linear-gradient(135deg,#0d9488,#14b8a6); }
    .eq-toggle-knob {
      position:absolute; top:2px; left:2px; width:20px; height:20px;
      border-radius:50%; background:#fff; transition:transform .3s;
      box-shadow:0 1px 4px rgba(0,0,0,.3);
    }
    .eq-toggle input:checked ~ .eq-toggle-knob { transform:translateX(20px); }

    .eq-card-actions { display:flex; gap:8px; margin-top:14px; }
    .eq-btn-edit, .eq-btn-del {
      flex:1; padding:8px 0; border:none; border-radius:8px;
      font-size:.82rem; font-weight:600; cursor:pointer; transition:all .2s;
    }
    .eq-btn-edit { background:rgba(20,184,166,.12); color:#2dd4bf; }
    .eq-btn-edit:hover { background:rgba(20,184,166,.22); }
    .eq-btn-del  { background:rgba(239,68,68,.1); color:#f87171; }
    .eq-btn-del:hover  { background:rgba(239,68,68,.2); }

    /* ---------- Modal ---------- */
    .eq-overlay {
      position:fixed; inset:0; z-index:9000;
      background:rgba(0,0,0,.6); backdrop-filter:blur(6px);
      display:flex; align-items:center; justify-content:center;
      opacity:0; pointer-events:none; transition:opacity .3s;
    }
    .eq-overlay.active { opacity:1; pointer-events:auto; }
    .eq-modal {
      width:600px; max-width:94vw; max-height:90vh; overflow-y:auto;
      background:rgba(15,23,42,.92); border:1px solid rgba(148,163,184,.15);
      border-radius:20px; padding:32px; backdrop-filter:blur(20px);
      transform:translateY(20px) scale(.97); transition:transform .35s;
    }
    .eq-overlay.active .eq-modal { transform:translateY(0) scale(1); }
    .eq-modal-title { font-size:1.3rem; font-weight:700; color:#f1f5f9; margin-bottom:24px; }

    /* Fields */
    .eq-field { margin-bottom:16px; }
    .eq-field label { display:block; color:#94a3b8; font-size:.82rem; font-weight:600; margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }
    .eq-field input {
      width:100%; padding:10px 14px; border:1px solid rgba(148,163,184,.15);
      border-radius:10px; background:rgba(30,41,59,.6); color:#f1f5f9;
      font-size:.92rem; outline:none; transition:border-color .2s;
      box-sizing:border-box;
    }
    .eq-field input:focus { border-color:#14b8a6; }

    /* Role pills */
    .eq-roles { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; }
    .eq-role-pill {
      padding:8px 16px; border-radius:10px; border:2px solid rgba(148,163,184,.15);
      background:rgba(30,41,59,.5); color:#94a3b8; font-size:.85rem;
      font-weight:600; cursor:pointer; transition:all .25s;
    }
    .eq-role-pill:hover { border-color:rgba(148,163,184,.3); }
    .eq-role-pill.selected { border-color:var(--pill-color); color:var(--pill-color); background:var(--pill-bg); }

    /* Modules checkboxes */
    .eq-modules-title { color:#94a3b8; font-size:.82rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; }
    .eq-modules-grid {
      display:grid; grid-template-columns:1fr 1fr; gap:10px;
      padding:20px; border-radius:14px;
      background:rgba(15,23,42,.5); border:1px solid rgba(148,163,184,.08);
    }
    .eq-module-item {
      display:flex; align-items:center; gap:10px;
      padding:8px 12px; border-radius:10px;
      transition:background .2s;
    }
    .eq-module-item:hover { background:rgba(148,163,184,.06); }
    .eq-module-item.overridden { border-left:2px solid rgba(251,191,36,.4); padding-left:10px; }

    /* Custom checkbox (iOS-style) */
    .eq-check { position:relative; width:40px; height:22px; flex-shrink:0; cursor:pointer; }
    .eq-check input { opacity:0; width:0; height:0; position:absolute; }
    .eq-check-track {
      position:absolute; inset:0; border-radius:11px;
      background:#374151; transition:all .3s cubic-bezier(.4,0,.2,1);
    }
    .eq-check input:checked + .eq-check-track {
      background:linear-gradient(135deg,#0d9488,#14b8a6);
      box-shadow:0 0 12px rgba(20,184,166,.3);
    }
    .eq-check-knob {
      position:absolute; top:2px; left:2px; width:18px; height:18px;
      border-radius:50%; background:#fff; transition:all .3s cubic-bezier(.4,0,.2,1);
      box-shadow:0 1px 3px rgba(0,0,0,.3);
    }
    .eq-check input:checked ~ .eq-check-knob { transform:translateX(18px); }
    .eq-module-icon { color:#64748b; flex-shrink:0; }
    .eq-module-label { color:#cbd5e1; font-size:.88rem; font-weight:500; }

    /* Modal buttons */
    .eq-modal-actions { display:flex; gap:12px; margin-top:28px; justify-content:flex-end; }
    .eq-btn-save {
      padding:10px 28px; border:none; border-radius:10px; cursor:pointer;
      background:linear-gradient(135deg,#0d9488,#14b8a6); color:#fff;
      font-weight:600; font-size:.92rem; transition:all .25s;
    }
    .eq-btn-save:hover { box-shadow:0 4px 14px rgba(20,184,166,.3); }
    .eq-btn-cancel {
      padding:10px 28px; border:1px solid rgba(148,163,184,.2); border-radius:10px;
      background:transparent; color:#94a3b8; font-weight:600;
      font-size:.92rem; cursor:pointer; transition:all .2s;
    }
    .eq-btn-cancel:hover { border-color:rgba(148,163,184,.4); color:#cbd5e1; }

    /* Confirm dialog */
    .eq-confirm {
      position:fixed; inset:0; z-index:9500;
      background:rgba(0,0,0,.65); backdrop-filter:blur(4px);
      display:flex; align-items:center; justify-content:center;
      opacity:0; pointer-events:none; transition:opacity .25s;
    }
    .eq-confirm.active { opacity:1; pointer-events:auto; }
    .eq-confirm-box {
      background:rgba(15,23,42,.95); border:1px solid rgba(239,68,68,.2);
      border-radius:16px; padding:28px; max-width:380px; text-align:center;
    }
    .eq-confirm-box h3 { color:#f1f5f9; margin:0 0 10px; }
    .eq-confirm-box p  { color:#94a3b8; font-size:.9rem; margin:0 0 22px; }
    .eq-confirm-btns { display:flex; gap:10px; justify-content:center; }
    .eq-confirm-del {
      padding:9px 24px; border:none; border-radius:8px;
      background:#dc2626; color:#fff; font-weight:600; cursor:pointer;
    }
    .eq-confirm-no {
      padding:9px 24px; border:1px solid rgba(148,163,184,.2);
      border-radius:8px; background:transparent; color:#94a3b8;
      font-weight:600; cursor:pointer;
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */

function relativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "A l'instant";
  if (mins < 60) return 'Il y a ' + mins + ' min';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return 'Il y a ' + hrs + ' h';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Hier';
  if (days < 30) return 'Il y a ' + days + ' jours';
  return new Date(iso).toLocaleDateString('fr-FR');
}

function initials(nom, prenom) {
  return ((prenom || '')[0] || '') + ((nom || '')[0] || '');
}

function svgIcon(path, size) {
  size = size || 18;
  return '<svg width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="' + path + '"/></svg>';
}

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */

let _eqContainer = null;
let _eqOverlay = null;
let _eqConfirm = null;
let _editingId = null;

function renderEquipe(container) {
  injectEquipeStyles();
  _eqContainer = container;
  container.innerHTML = '';

  // Header
  var header = document.createElement('div');
  header.className = 'eq-header';
  header.innerHTML = '<h2 class="eq-title">Gestion de l\u2019\u00e9quipe</h2>' +
    '<button class="eq-btn-add" id="eq-add-btn">+ Ajouter un membre</button>';
  container.appendChild(header);

  // Grid
  var grid = document.createElement('div');
  grid.className = 'eq-grid';
  grid.id = 'eq-grid';
  container.appendChild(grid);

  // Modal overlay
  _eqOverlay = document.createElement('div');
  _eqOverlay.className = 'eq-overlay';
  _eqOverlay.id = 'eq-overlay';
  document.body.appendChild(_eqOverlay);

  // Confirm overlay
  _eqConfirm = document.createElement('div');
  _eqConfirm.className = 'eq-confirm';
  _eqConfirm.id = 'eq-confirm';
  document.body.appendChild(_eqConfirm);

  header.querySelector('#eq-add-btn').addEventListener('click', function() { openMemberModal(null); });

  renderMemberCards();
}

function renderMemberCards() {
  var grid = document.getElementById('eq-grid');
  if (!grid) return;
  grid.innerHTML = '';

  _teamMembers.forEach(function(m) {
    var rc = ROLE_COLORS[m.role] || ROLE_COLORS.stagiaire;
    var card = document.createElement('div');
    card.className = 'eq-card';
    card.innerHTML =
      '<div class="eq-card-top">' +
        '<div class="eq-avatar" style="background:' + rc.bg + ';color:' + rc.text + '">' + initials(m.nom, m.prenom) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="eq-name">' + m.prenom + ' ' + m.nom + '</div>' +
          '<div class="eq-email">' + m.email + '</div>' +
        '</div>' +
        '<span class="eq-role-badge" style="background:' + rc.bg + ';color:' + rc.text + '">' + rc.label + '</span>' +
      '</div>' +
      '<div class="eq-meta">' +
        '<span class="eq-last-login">Derni\u00e8re connexion : ' + relativeDate(m.last_login) + '</span>' +
        '<label class="eq-toggle"><input type="checkbox"' + (m.active ? ' checked' : '') + ' data-id="' + m.id + '"><span class="eq-toggle-track"></span><span class="eq-toggle-knob"></span></label>' +
      '</div>' +
      '<div class="eq-card-actions">' +
        '<button class="eq-btn-edit" data-id="' + m.id + '">Modifier</button>' +
        '<button class="eq-btn-del" data-id="' + m.id + '">Supprimer</button>' +
      '</div>';

    // Toggle active
    card.querySelector('.eq-toggle input').addEventListener('change', function() {
      var member = _teamMembers.find(function(x) { return x.id === m.id; });
      if (member) member.active = this.checked;
    });

    // Edit
    card.querySelector('.eq-btn-edit').addEventListener('click', function() {
      openMemberModal(m.id);
    });

    // Delete
    card.querySelector('.eq-btn-del').addEventListener('click', function() {
      showConfirmDelete(m.id, m.prenom + ' ' + m.nom);
    });

    grid.appendChild(card);
  });
}

/* ------------------------------------------------------------------ */
/*  MODAL                                                             */
/* ------------------------------------------------------------------ */

function openMemberModal(memberId) {
  _editingId = memberId;
  var member = memberId ? _teamMembers.find(function(x) { return x.id === memberId; }) : null;
  var isEdit = !!member;

  var perms = member ? { ...member.permissions } : { ...ROLE_PRESETS.secretaire };
  var currentRole = member ? member.role : 'secretaire';

  var modal = document.createElement('div');
  modal.className = 'eq-modal';

  // Build role pills
  var pillsHtml = '';
  var roles = ['associe', 'secretaire', 'assistante', 'comptable', 'stagiaire'];
  roles.forEach(function(r) {
    var rc = ROLE_COLORS[r];
    var sel = r === currentRole ? ' selected' : '';
    pillsHtml += '<button class="eq-role-pill' + sel + '" data-role="' + r + '" ' +
      'style="--pill-color:' + rc.text + ';--pill-bg:' + rc.bg + '">' + rc.label + '</button>';
  });

  // Build checkboxes
  var checksHtml = '';
  MODULE_META.forEach(function(mod) {
    var checked = perms[mod.key] ? ' checked' : '';
    checksHtml +=
      '<div class="eq-module-item" data-mod="' + mod.key + '">' +
        '<label class="eq-check">' +
          '<input type="checkbox" data-key="' + mod.key + '"' + checked + '>' +
          '<span class="eq-check-track"></span>' +
          '<span class="eq-check-knob"></span>' +
        '</label>' +
        '<span class="eq-module-icon">' + svgIcon(mod.icon, 18) + '</span>' +
        '<span class="eq-module-label">' + mod.label + '</span>' +
      '</div>';
  });

  modal.innerHTML =
    '<div class="eq-modal-title">' + (isEdit ? 'Modifier le membre' : 'Ajouter un membre') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="eq-field"><label>Nom</label><input id="eq-f-nom" value="' + (member ? member.nom : '') + '"></div>' +
      '<div class="eq-field"><label>Pr\u00e9nom</label><input id="eq-f-prenom" value="' + (member ? member.prenom : '') + '"></div>' +
    '</div>' +
    '<div class="eq-field"><label>Email</label><input id="eq-f-email" type="email" value="' + (member ? member.email : '') + '"></div>' +
    '<div class="eq-field"><label>R\u00f4le</label><div class="eq-roles" id="eq-roles">' + pillsHtml + '</div></div>' +
    '<div class="eq-modules-title">Modules autoris\u00e9s</div>' +
    '<div class="eq-modules-grid" id="eq-modules">' + checksHtml + '</div>' +
    '<div class="eq-modal-actions">' +
      '<button class="eq-btn-cancel" id="eq-cancel">Annuler</button>' +
      '<button class="eq-btn-save" id="eq-save">' + (isEdit ? 'Enregistrer' : 'Cr\u00e9er le sous-compte') + '</button>' +
    '</div>';

  _eqOverlay.innerHTML = '';
  _eqOverlay.appendChild(modal);

  // Track overrides
  var overrides = {};

  // Role pill click
  modal.querySelectorAll('.eq-role-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      modal.querySelectorAll('.eq-role-pill').forEach(function(p) { p.classList.remove('selected'); });
      pill.classList.add('selected');
      currentRole = pill.dataset.role;
      overrides = {};
      // Animate checkboxes to preset
      var preset = ROLE_PRESETS[currentRole];
      modal.querySelectorAll('.eq-modules-grid input[type="checkbox"]').forEach(function(cb) {
        cb.checked = !!preset[cb.dataset.key];
        cb.closest('.eq-module-item').classList.remove('overridden');
      });
    });
  });

  // Checkbox manual toggle
  modal.querySelectorAll('.eq-modules-grid input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var preset = ROLE_PRESETS[currentRole];
      var item = cb.closest('.eq-module-item');
      if (cb.checked !== !!preset[cb.dataset.key]) {
        item.classList.add('overridden');
        overrides[cb.dataset.key] = cb.checked;
      } else {
        item.classList.remove('overridden');
        delete overrides[cb.dataset.key];
      }
    });
  });

  // Cancel
  modal.querySelector('#eq-cancel').addEventListener('click', function() { closeModal(); });
  _eqOverlay.addEventListener('click', function(e) { if (e.target === _eqOverlay) closeModal(); });

  // Save
  modal.querySelector('#eq-save').addEventListener('click', function() {
    var nom = modal.querySelector('#eq-f-nom').value.trim();
    var prenom = modal.querySelector('#eq-f-prenom').value.trim();
    var email = modal.querySelector('#eq-f-email').value.trim();
    if (!nom || !prenom || !email) return;

    var finalPerms = { ...ROLE_PRESETS[currentRole] };
    Object.keys(overrides).forEach(function(k) { finalPerms[k] = overrides[k]; });

    // Also read from current checkboxes in case
    modal.querySelectorAll('.eq-modules-grid input[type="checkbox"]').forEach(function(cb) {
      finalPerms[cb.dataset.key] = cb.checked;
    });

    if (isEdit) {
      member.nom = nom;
      member.prenom = prenom;
      member.email = email;
      member.role = currentRole;
      member.permissions = finalPerms;
    } else {
      _teamMembers.push({
        id: 't' + Date.now(),
        nom: nom,
        prenom: prenom,
        email: email,
        role: currentRole,
        active: true,
        last_login: new Date().toISOString(),
        permissions: finalPerms
      });
    }
    closeModal();
    renderMemberCards();
  });

  // Show
  requestAnimationFrame(function() { _eqOverlay.classList.add('active'); });
}

function closeModal() {
  _eqOverlay.classList.remove('active');
  setTimeout(function() { _eqOverlay.innerHTML = ''; }, 300);
}

/* ------------------------------------------------------------------ */
/*  CONFIRM DELETE                                                    */
/* ------------------------------------------------------------------ */

function showConfirmDelete(id, name) {
  _eqConfirm.innerHTML =
    '<div class="eq-confirm-box">' +
      '<h3>Supprimer ce membre ?</h3>' +
      '<p>' + name + ' sera retir\u00e9(e) de l\u2019\u00e9quipe et perdra tous ses acc\u00e8s.</p>' +
      '<div class="eq-confirm-btns">' +
        '<button class="eq-confirm-no" id="eq-c-no">Annuler</button>' +
        '<button class="eq-confirm-del" id="eq-c-yes">Supprimer</button>' +
      '</div>' +
    '</div>';

  _eqConfirm.classList.add('active');

  document.getElementById('eq-c-no').addEventListener('click', function() {
    _eqConfirm.classList.remove('active');
  });
  document.getElementById('eq-c-yes').addEventListener('click', function() {
    _teamMembers = _teamMembers.filter(function(m) { return m.id !== id; });
    _eqConfirm.classList.remove('active');
    renderMemberCards();
  });
  _eqConfirm.addEventListener('click', function(e) {
    if (e.target === _eqConfirm) _eqConfirm.classList.remove('active');
  });
}

/* ------------------------------------------------------------------ */
/*  REFRESH                                                           */
/* ------------------------------------------------------------------ */

function refreshEquipe() {
  renderMemberCards();
}

/* ------------------------------------------------------------------ */
/*  EXPORTS                                                           */
/* ------------------------------------------------------------------ */

if (typeof window !== 'undefined') {
  window.renderEquipe = renderEquipe;
  window.refreshEquipe = refreshEquipe;
}
