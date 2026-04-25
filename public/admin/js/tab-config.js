/**
 * tab-config.js — Configuration du cabinet
 * JADOMI Dentiste Pro Admin Dashboard
 */

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                         */
/* ------------------------------------------------------------------ */

var PROFESSIONS = [
  { value:'dentiste',        label:'Dentiste' },
  { value:'orthodontiste',   label:'Orthodontiste' },
  { value:'kine',            label:'Kin\u00e9sith\u00e9rapeute' },
  { value:'osteo',           label:'Ost\u00e9opathe' },
  { value:'podologue',       label:'Podologue' },
  { value:'orthophoniste',   label:'Orthophoniste' },
  { value:'psychomotricien', label:'Psychomotricien' },
  { value:'dieteticien',     label:'Di\u00e9t\u00e9ticien' },
  { value:'sage_femme',      label:'Sage-femme' },
  { value:'infirmier',       label:'Infirmier(e)' },
  { value:'avocat',          label:'Avocat' },
  { value:'generaliste',     label:'M\u00e9decin g\u00e9n\u00e9raliste' },
  { value:'dermatologue',    label:'Dermatologue' },
  { value:'ophtalmologue',   label:'Ophtalmologue' },
  { value:'autre',           label:'Autre' }
];

var JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

var TONES = [
  { value:'professionnel', label:'Professionnel' },
  { value:'amical',        label:'Amical' },
  { value:'formel',        label:'Formel' },
  { value:'decontracte',   label:'D\u00e9contract\u00e9' }
];

/* ------------------------------------------------------------------ */
/*  DEMO DATA                                                         */
/* ------------------------------------------------------------------ */

var _cabinetData = {
  nom: 'Cabinet Dentaire Dr. Benali',
  profession: 'dentiste',
  adresse: '12 Rue de la Sant\u00e9',
  code_postal: '75014',
  ville: 'Paris',
  telephone: '01 45 67 89 00',
  email: 'contact@cabinet-benali.fr'
};

var _horairesData = [
  { jour:'Lundi',    ouvert:true,  debut:'08:30', fin:'18:30', pause_debut:'12:30', pause_fin:'14:00' },
  { jour:'Mardi',    ouvert:true,  debut:'08:30', fin:'18:30', pause_debut:'12:30', pause_fin:'14:00' },
  { jour:'Mercredi', ouvert:true,  debut:'09:00', fin:'17:00', pause_debut:'12:00', pause_fin:'13:30' },
  { jour:'Jeudi',    ouvert:true,  debut:'08:30', fin:'18:30', pause_debut:'12:30', pause_fin:'14:00' },
  { jour:'Vendredi', ouvert:true,  debut:'08:30', fin:'17:00', pause_debut:'12:30', pause_fin:'14:00' },
  { jour:'Samedi',   ouvert:false, debut:'09:00', fin:'13:00', pause_debut:'',      pause_fin:'' }
];

var _iaConfig = {
  enabled: true,
  greeting: 'Bonjour ! Je suis l\u2019assistant virtuel du Cabinet Dentaire Dr. Benali. Comment puis-je vous aider ?',
  tone: 'professionnel',
  faq: [
    { q:'Quels sont vos horaires ?',                    a:'Nous sommes ouverts du lundi au vendredi de 8h30 \u00e0 18h30.' },
    { q:'Comment prendre rendez-vous ?',                a:'Vous pouvez prendre rendez-vous en ligne via notre plateforme ou en appelant le 01 45 67 89 00.' },
    { q:'Acceptez-vous les urgences ?',                 a:'Oui, nous r\u00e9servons des cr\u00e9neaux quotidiens pour les urgences dentaires.' }
  ]
};

/* ------------------------------------------------------------------ */
/*  STYLES                                                            */
/* ------------------------------------------------------------------ */

function injectConfigStyles() {
  if (document.getElementById('config-styles')) return;
  var style = document.createElement('style');
  style.id = 'config-styles';
  style.textContent = [
    '/* Config layout */',
    '.cfg-section { background:rgba(30,41,59,.65); border:1px solid rgba(148,163,184,.12); border-radius:16px; padding:28px; margin-bottom:24px; backdrop-filter:blur(12px); }',
    '.cfg-section-title { font-size:1.2rem; font-weight:700; color:#f1f5f9; margin-bottom:20px; display:flex; align-items:center; gap:10px; }',
    '.cfg-section-icon { color:#14b8a6; }',

    '/* Fields */',
    '.cfg-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }',
    '.cfg-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:14px; }',
    '.cfg-field { display:flex; flex-direction:column; gap:5px; }',
    '.cfg-field.full { grid-column:1/-1; }',
    '.cfg-label { color:#94a3b8; font-size:.8rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }',
    '.cfg-input, .cfg-select, .cfg-textarea {',
    '  width:100%; padding:10px 14px; border:1px solid rgba(148,163,184,.15);',
    '  border-radius:10px; background:rgba(15,23,42,.5); color:#f1f5f9;',
    '  font-size:.9rem; outline:none; transition:border-color .2s; box-sizing:border-box;',
    '  font-family:inherit;',
    '}',
    '.cfg-input:focus, .cfg-select:focus, .cfg-textarea:focus { border-color:#14b8a6; }',
    '.cfg-select { appearance:none; background-image:url("data:image/svg+xml,%3Csvg width=\'12\' height=\'8\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1.5l5 5 5-5\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:36px; }',
    '.cfg-textarea { min-height:80px; resize:vertical; }',

    '/* Save button */',
    '.cfg-save {',
    '  padding:10px 28px; border:none; border-radius:10px; cursor:pointer;',
    '  background:linear-gradient(135deg,#0d9488,#14b8a6); color:#fff;',
    '  font-weight:600; font-size:.9rem; transition:all .25s; margin-top:8px;',
    '}',
    '.cfg-save:hover { box-shadow:0 4px 14px rgba(20,184,166,.3); transform:translateY(-1px); }',

    '/* Toggle switch */',
    '.cfg-toggle { position:relative; width:44px; height:24px; cursor:pointer; display:inline-block; vertical-align:middle; }',
    '.cfg-toggle input { opacity:0; width:0; height:0; position:absolute; }',
    '.cfg-toggle-track { position:absolute; inset:0; border-radius:12px; background:#374151; transition:background .3s; }',
    '.cfg-toggle input:checked + .cfg-toggle-track { background:linear-gradient(135deg,#0d9488,#14b8a6); }',
    '.cfg-toggle-knob { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform .3s; box-shadow:0 1px 4px rgba(0,0,0,.3); }',
    '.cfg-toggle input:checked ~ .cfg-toggle-knob { transform:translateX(20px); }',

    '/* Horaires */',
    '.cfg-h-row { display:grid; grid-template-columns:100px 44px 1fr 1fr 1fr 1fr; gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid rgba(148,163,184,.06); }',
    '.cfg-h-day { color:#cbd5e1; font-weight:600; font-size:.9rem; }',
    '.cfg-h-day.off { color:#475569; }',
    '.cfg-time { width:100%; padding:8px 10px; border:1px solid rgba(148,163,184,.12); border-radius:8px; background:rgba(15,23,42,.5); color:#f1f5f9; font-size:.85rem; outline:none; box-sizing:border-box; text-align:center; }',
    '.cfg-time:focus { border-color:#14b8a6; }',
    '.cfg-time:disabled { opacity:.35; cursor:not-allowed; }',
    '.cfg-h-labels { display:grid; grid-template-columns:100px 44px 1fr 1fr 1fr 1fr; gap:10px; padding-bottom:8px; border-bottom:1px solid rgba(148,163,184,.1); margin-bottom:4px; }',
    '.cfg-h-label { color:#64748b; font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; text-align:center; }',

    '/* Radio buttons (tone) */',
    '.cfg-radios { display:flex; flex-wrap:wrap; gap:10px; }',
    '.cfg-radio { display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px 16px; border:2px solid rgba(148,163,184,.15); border-radius:10px; transition:all .2s; }',
    '.cfg-radio:hover { border-color:rgba(148,163,184,.3); }',
    '.cfg-radio.selected { border-color:#14b8a6; background:rgba(20,184,166,.08); }',
    '.cfg-radio input { display:none; }',
    '.cfg-radio-dot { width:18px; height:18px; border-radius:50%; border:2px solid #475569; position:relative; transition:all .2s; flex-shrink:0; }',
    '.cfg-radio.selected .cfg-radio-dot { border-color:#14b8a6; }',
    '.cfg-radio.selected .cfg-radio-dot::after { content:""; position:absolute; top:3px; left:3px; width:8px; height:8px; border-radius:50%; background:#14b8a6; }',
    '.cfg-radio-label { color:#cbd5e1; font-size:.88rem; font-weight:500; }',

    '/* FAQ */',
    '.cfg-faq-list { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }',
    '.cfg-faq-item { background:rgba(15,23,42,.5); border:1px solid rgba(148,163,184,.08); border-radius:12px; padding:14px; }',
    '.cfg-faq-q { color:#14b8a6; font-weight:600; font-size:.88rem; margin-bottom:6px; }',
    '.cfg-faq-a { color:#94a3b8; font-size:.85rem; line-height:1.5; }',
    '.cfg-faq-actions { display:flex; gap:8px; margin-top:8px; }',
    '.cfg-faq-btn { padding:5px 14px; border:none; border-radius:6px; font-size:.78rem; font-weight:600; cursor:pointer; transition:all .2s; }',
    '.cfg-faq-edit { background:rgba(20,184,166,.1); color:#2dd4bf; }',
    '.cfg-faq-edit:hover { background:rgba(20,184,166,.2); }',
    '.cfg-faq-del { background:rgba(239,68,68,.08); color:#f87171; }',
    '.cfg-faq-del:hover { background:rgba(239,68,68,.18); }',
    '.cfg-faq-add { padding:8px 18px; border:1px dashed rgba(148,163,184,.25); border-radius:10px; background:transparent; color:#94a3b8; font-size:.85rem; font-weight:600; cursor:pointer; transition:all .2s; width:100%; }',
    '.cfg-faq-add:hover { border-color:#14b8a6; color:#14b8a6; }',

    '/* FAQ edit inline */',
    '.cfg-faq-editing { background:rgba(15,23,42,.7); border:1px solid rgba(20,184,166,.2); border-radius:12px; padding:16px; }',
    '.cfg-faq-editing .cfg-input { margin-bottom:8px; }',
    '.cfg-faq-editing .cfg-textarea { margin-bottom:10px; }',
    '.cfg-faq-save-row { display:flex; gap:8px; justify-content:flex-end; }',
    '.cfg-faq-save-btn { padding:7px 18px; border:none; border-radius:8px; background:linear-gradient(135deg,#0d9488,#14b8a6); color:#fff; font-weight:600; font-size:.82rem; cursor:pointer; }',
    '.cfg-faq-cancel-btn { padding:7px 18px; border:1px solid rgba(148,163,184,.2); border-radius:8px; background:transparent; color:#94a3b8; font-weight:600; font-size:.82rem; cursor:pointer; }',

    '/* Chat preview */',
    '.cfg-chat-preview { position:fixed; bottom:24px; right:24px; width:360px; max-height:480px; background:rgba(15,23,42,.95); border:1px solid rgba(20,184,166,.2); border-radius:20px; z-index:8000; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.4); display:none; flex-direction:column; }',
    '.cfg-chat-preview.open { display:flex; }',
    '.cfg-chat-header { padding:16px 20px; background:linear-gradient(135deg,#0d9488,#14b8a6); display:flex; align-items:center; justify-content:space-between; }',
    '.cfg-chat-header span { color:#fff; font-weight:700; font-size:.95rem; }',
    '.cfg-chat-close { background:none; border:none; color:rgba(255,255,255,.7); cursor:pointer; font-size:1.2rem; }',
    '.cfg-chat-body { flex:1; padding:16px; overflow-y:auto; min-height:200px; }',
    '.cfg-chat-bubble { background:rgba(20,184,166,.12); color:#cbd5e1; padding:10px 14px; border-radius:14px 14px 14px 4px; font-size:.88rem; line-height:1.5; max-width:85%; margin-bottom:12px; }',
    '.cfg-chat-input-row { display:flex; gap:8px; padding:12px 16px; border-top:1px solid rgba(148,163,184,.1); }',
    '.cfg-chat-input-row input { flex:1; padding:8px 12px; border:1px solid rgba(148,163,184,.15); border-radius:10px; background:rgba(30,41,59,.6); color:#f1f5f9; font-size:.85rem; outline:none; }',
    '.cfg-chat-send { padding:8px 14px; border:none; border-radius:10px; background:#14b8a6; color:#fff; font-weight:600; font-size:.85rem; cursor:pointer; }',

    '/* Test button */',
    '.cfg-btn-test { padding:10px 22px; border:1px solid rgba(20,184,166,.3); border-radius:10px; background:transparent; color:#14b8a6; font-weight:600; font-size:.88rem; cursor:pointer; transition:all .2s; margin-top:8px; }',
    '.cfg-btn-test:hover { background:rgba(20,184,166,.08); border-color:#14b8a6; }'
  ].join('\n');
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */

function cfgIcon(path) {
  return '<svg class="cfg-section-icon" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="' + path + '"/></svg>';
}

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */

var _cfgContainer = null;
var _chatPreview = null;

function renderConfig(container) {
  injectConfigStyles();
  _cfgContainer = container;
  container.innerHTML = '';

  // --- Section 1: Cabinet info ---
  var s1 = document.createElement('div');
  s1.className = 'cfg-section';
  s1.innerHTML = buildCabinetSection();
  container.appendChild(s1);
  bindCabinetEvents(s1);

  // --- Section 2: Horaires ---
  var s2 = document.createElement('div');
  s2.className = 'cfg-section';
  s2.innerHTML = buildHorairesSection();
  container.appendChild(s2);
  bindHorairesEvents(s2);

  // --- Section 3: Chat IA ---
  var s3 = document.createElement('div');
  s3.className = 'cfg-section';
  s3.id = 'cfg-ia-section';
  s3.innerHTML = buildIASection();
  container.appendChild(s3);
  bindIAEvents(s3);

  // Chat preview widget
  if (!document.getElementById('cfg-chat-widget')) {
    _chatPreview = document.createElement('div');
    _chatPreview.className = 'cfg-chat-preview';
    _chatPreview.id = 'cfg-chat-widget';
    document.body.appendChild(_chatPreview);
  }
}

/* ------------------------------------------------------------------ */
/*  SECTION 1 : Cabinet                                               */
/* ------------------------------------------------------------------ */

function buildCabinetSection() {
  var opts = PROFESSIONS.map(function(p) {
    var sel = p.value === _cabinetData.profession ? ' selected' : '';
    return '<option value="' + p.value + '"' + sel + '>' + p.label + '</option>';
  }).join('');

  return '' +
    '<div class="cfg-section-title">' +
      cfgIcon('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4') +
      'Informations du cabinet' +
    '</div>' +
    '<div class="cfg-row">' +
      '<div class="cfg-field"><span class="cfg-label">Nom du cabinet</span><input class="cfg-input" id="cfg-nom" value="' + _cabinetData.nom + '"></div>' +
      '<div class="cfg-field"><span class="cfg-label">Profession</span><select class="cfg-select" id="cfg-profession">' + opts + '</select></div>' +
    '</div>' +
    '<div class="cfg-field" style="margin-bottom:14px"><span class="cfg-label">Adresse</span><input class="cfg-input" id="cfg-adresse" value="' + _cabinetData.adresse + '"></div>' +
    '<div class="cfg-row">' +
      '<div class="cfg-field"><span class="cfg-label">Code postal</span><input class="cfg-input" id="cfg-cp" value="' + _cabinetData.code_postal + '"></div>' +
      '<div class="cfg-field"><span class="cfg-label">Ville</span><input class="cfg-input" id="cfg-ville" value="' + _cabinetData.ville + '"></div>' +
    '</div>' +
    '<div class="cfg-row">' +
      '<div class="cfg-field"><span class="cfg-label">T\u00e9l\u00e9phone</span><input class="cfg-input" id="cfg-tel" value="' + _cabinetData.telephone + '"></div>' +
      '<div class="cfg-field"><span class="cfg-label">Email</span><input class="cfg-input" id="cfg-email" type="email" value="' + _cabinetData.email + '"></div>' +
    '</div>' +
    '<button class="cfg-save" id="cfg-save-cabinet">Enregistrer</button>';
}

function bindCabinetEvents(section) {
  section.querySelector('#cfg-save-cabinet').addEventListener('click', function() {
    _cabinetData.nom = section.querySelector('#cfg-nom').value;
    _cabinetData.profession = section.querySelector('#cfg-profession').value;
    _cabinetData.adresse = section.querySelector('#cfg-adresse').value;
    _cabinetData.code_postal = section.querySelector('#cfg-cp').value;
    _cabinetData.ville = section.querySelector('#cfg-ville').value;
    _cabinetData.telephone = section.querySelector('#cfg-tel').value;
    _cabinetData.email = section.querySelector('#cfg-email').value;
    showToast('Informations du cabinet enregistr\u00e9es');
  });
}

/* ------------------------------------------------------------------ */
/*  SECTION 2 : Horaires                                              */
/* ------------------------------------------------------------------ */

function buildHorairesSection() {
  var labels =
    '<div class="cfg-h-labels">' +
      '<span class="cfg-h-label">Jour</span>' +
      '<span class="cfg-h-label">Ouvert</span>' +
      '<span class="cfg-h-label">D\u00e9but</span>' +
      '<span class="cfg-h-label">Fin</span>' +
      '<span class="cfg-h-label">Pause d\u00e9b.</span>' +
      '<span class="cfg-h-label">Pause fin</span>' +
    '</div>';

  var rows = _horairesData.map(function(h, i) {
    var dis = h.ouvert ? '' : ' disabled';
    var offCls = h.ouvert ? '' : ' off';
    return '' +
      '<div class="cfg-h-row" data-idx="' + i + '">' +
        '<span class="cfg-h-day' + offCls + '">' + h.jour + '</span>' +
        '<label class="cfg-toggle"><input type="checkbox"' + (h.ouvert ? ' checked' : '') + '><span class="cfg-toggle-track"></span><span class="cfg-toggle-knob"></span></label>' +
        '<input type="time" class="cfg-time" value="' + h.debut + '"' + dis + '>' +
        '<input type="time" class="cfg-time" value="' + h.fin + '"' + dis + '>' +
        '<input type="time" class="cfg-time" value="' + h.pause_debut + '"' + dis + ' placeholder="--:--">' +
        '<input type="time" class="cfg-time" value="' + h.pause_fin + '"' + dis + ' placeholder="--:--">' +
      '</div>';
  }).join('');

  return '' +
    '<div class="cfg-section-title">' +
      cfgIcon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z') +
      'Horaires d\u2019ouverture' +
    '</div>' +
    labels + rows +
    '<button class="cfg-save" id="cfg-save-horaires" style="margin-top:18px">Enregistrer les horaires</button>';
}

function bindHorairesEvents(section) {
  section.querySelectorAll('.cfg-h-row').forEach(function(row) {
    var toggle = row.querySelector('.cfg-toggle input');
    var times = row.querySelectorAll('.cfg-time');
    var dayLabel = row.querySelector('.cfg-h-day');

    toggle.addEventListener('change', function() {
      times.forEach(function(t) { t.disabled = !toggle.checked; });
      if (toggle.checked) {
        dayLabel.classList.remove('off');
      } else {
        dayLabel.classList.add('off');
      }
    });
  });

  section.querySelector('#cfg-save-horaires').addEventListener('click', function() {
    section.querySelectorAll('.cfg-h-row').forEach(function(row) {
      var idx = parseInt(row.dataset.idx);
      var times = row.querySelectorAll('.cfg-time');
      _horairesData[idx].ouvert = row.querySelector('.cfg-toggle input').checked;
      _horairesData[idx].debut = times[0].value;
      _horairesData[idx].fin = times[1].value;
      _horairesData[idx].pause_debut = times[2].value;
      _horairesData[idx].pause_fin = times[3].value;
    });
    showToast('Horaires enregistr\u00e9s');
  });
}

/* ------------------------------------------------------------------ */
/*  SECTION 3 : Chat IA                                               */
/* ------------------------------------------------------------------ */

function buildIASection() {
  var toneRadios = TONES.map(function(t) {
    var sel = t.value === _iaConfig.tone ? ' selected' : '';
    return '' +
      '<label class="cfg-radio' + sel + '" data-tone="' + t.value + '">' +
        '<input type="radio" name="cfg-tone" value="' + t.value + '"' + (sel ? ' checked' : '') + '>' +
        '<span class="cfg-radio-dot"></span>' +
        '<span class="cfg-radio-label">' + t.label + '</span>' +
      '</label>';
  }).join('');

  var faqList = _iaConfig.faq.map(function(f, i) {
    return '' +
      '<div class="cfg-faq-item" data-faq="' + i + '">' +
        '<div class="cfg-faq-q">Q : ' + f.q + '</div>' +
        '<div class="cfg-faq-a">R : ' + f.a + '</div>' +
        '<div class="cfg-faq-actions">' +
          '<button class="cfg-faq-btn cfg-faq-edit" data-faq="' + i + '">Modifier</button>' +
          '<button class="cfg-faq-btn cfg-faq-del" data-faq="' + i + '">Supprimer</button>' +
        '</div>' +
      '</div>';
  }).join('');

  return '' +
    '<div class="cfg-section-title">' +
      cfgIcon('M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z') +
      'Configuration du Chat IA' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">' +
      '<span class="cfg-label" style="margin:0">Activer le chat IA</span>' +
      '<label class="cfg-toggle"><input type="checkbox" id="cfg-ia-toggle"' + (_iaConfig.enabled ? ' checked' : '') + '><span class="cfg-toggle-track"></span><span class="cfg-toggle-knob"></span></label>' +
    '</div>' +
    '<div id="cfg-ia-body">' +
      '<div class="cfg-field" style="margin-bottom:16px">' +
        '<span class="cfg-label">Message d\u2019accueil</span>' +
        '<textarea class="cfg-textarea" id="cfg-ia-greeting">' + _iaConfig.greeting + '</textarea>' +
      '</div>' +
      '<div class="cfg-field" style="margin-bottom:20px">' +
        '<span class="cfg-label">Ton de la conversation</span>' +
        '<div class="cfg-radios" id="cfg-ia-tones">' + toneRadios + '</div>' +
      '</div>' +
      '<div class="cfg-field">' +
        '<span class="cfg-label">Questions fr\u00e9quentes (FAQ)</span>' +
        '<div class="cfg-faq-list" id="cfg-faq-list">' + faqList + '</div>' +
        '<button class="cfg-faq-add" id="cfg-faq-add">+ Ajouter une question</button>' +
      '</div>' +
      '<div style="display:flex;gap:12px;margin-top:20px">' +
        '<button class="cfg-save" id="cfg-save-ia">Enregistrer</button>' +
        '<button class="cfg-btn-test" id="cfg-test-chat">Tester le chat</button>' +
      '</div>' +
    '</div>';
}

function bindIAEvents(section) {
  var iaToggle = section.querySelector('#cfg-ia-toggle');
  var iaBody = section.querySelector('#cfg-ia-body');

  iaToggle.addEventListener('change', function() {
    iaBody.style.opacity = iaToggle.checked ? '1' : '.4';
    iaBody.style.pointerEvents = iaToggle.checked ? 'auto' : 'none';
  });
  if (!_iaConfig.enabled) {
    iaBody.style.opacity = '.4';
    iaBody.style.pointerEvents = 'none';
  }

  // Tone radios
  section.querySelectorAll('.cfg-radio').forEach(function(radio) {
    radio.addEventListener('click', function() {
      section.querySelectorAll('.cfg-radio').forEach(function(r) { r.classList.remove('selected'); });
      radio.classList.add('selected');
      radio.querySelector('input').checked = true;
      _iaConfig.tone = radio.dataset.tone;
    });
  });

  // FAQ edit
  section.querySelectorAll('.cfg-faq-edit').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.faq);
      editFAQ(idx);
    });
  });

  // FAQ delete
  section.querySelectorAll('.cfg-faq-del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.faq);
      _iaConfig.faq.splice(idx, 1);
      refreshIASection();
    });
  });

  // FAQ add
  section.querySelector('#cfg-faq-add').addEventListener('click', function() {
    _iaConfig.faq.push({ q:'', a:'' });
    refreshIASection();
    editFAQ(_iaConfig.faq.length - 1);
  });

  // Save
  section.querySelector('#cfg-save-ia').addEventListener('click', function() {
    _iaConfig.enabled = iaToggle.checked;
    _iaConfig.greeting = section.querySelector('#cfg-ia-greeting').value;
    showToast('Configuration IA enregistr\u00e9e');
  });

  // Test chat
  section.querySelector('#cfg-test-chat').addEventListener('click', function() {
    openChatPreview();
  });
}

function refreshIASection() {
  var section = document.getElementById('cfg-ia-section');
  if (!section) return;
  section.innerHTML = buildIASection();
  bindIAEvents(section);
}

function editFAQ(idx) {
  var faq = _iaConfig.faq[idx];
  var list = document.getElementById('cfg-faq-list');
  if (!list) return;

  var item = list.querySelector('[data-faq="' + idx + '"]');
  if (!item) return;

  item.className = 'cfg-faq-editing';
  item.innerHTML =
    '<input class="cfg-input" id="cfg-faq-q-' + idx + '" placeholder="Question..." value="' + (faq.q || '') + '">' +
    '<textarea class="cfg-textarea" id="cfg-faq-a-' + idx + '" placeholder="R\u00e9ponse...">' + (faq.a || '') + '</textarea>' +
    '<div class="cfg-faq-save-row">' +
      '<button class="cfg-faq-cancel-btn" data-idx="' + idx + '">Annuler</button>' +
      '<button class="cfg-faq-save-btn" data-idx="' + idx + '">Valider</button>' +
    '</div>';

  item.querySelector('.cfg-faq-save-btn').addEventListener('click', function() {
    _iaConfig.faq[idx].q = document.getElementById('cfg-faq-q-' + idx).value;
    _iaConfig.faq[idx].a = document.getElementById('cfg-faq-a-' + idx).value;
    refreshIASection();
  });

  item.querySelector('.cfg-faq-cancel-btn').addEventListener('click', function() {
    if (!faq.q && !faq.a) _iaConfig.faq.splice(idx, 1);
    refreshIASection();
  });
}

/* ------------------------------------------------------------------ */
/*  CHAT PREVIEW                                                      */
/* ------------------------------------------------------------------ */

function openChatPreview() {
  var widget = document.getElementById('cfg-chat-widget');
  if (!widget) return;

  widget.innerHTML =
    '<div class="cfg-chat-header">' +
      '<span>Chat IA - Aper\u00e7u</span>' +
      '<button class="cfg-chat-close" id="cfg-chat-close">\u2715</button>' +
    '</div>' +
    '<div class="cfg-chat-body" id="cfg-chat-body">' +
      '<div class="cfg-chat-bubble">' + _iaConfig.greeting + '</div>' +
    '</div>' +
    '<div class="cfg-chat-input-row">' +
      '<input id="cfg-chat-msg" placeholder="Tapez un message...">' +
      '<button class="cfg-chat-send" id="cfg-chat-send">Envoyer</button>' +
    '</div>';

  widget.classList.add('open');

  widget.querySelector('#cfg-chat-close').addEventListener('click', function() {
    widget.classList.remove('open');
  });

  var sendMsg = function() {
    var input = document.getElementById('cfg-chat-msg');
    var body = document.getElementById('cfg-chat-body');
    var text = input.value.trim();
    if (!text) return;

    // User bubble
    var userBub = document.createElement('div');
    userBub.className = 'cfg-chat-bubble';
    userBub.style.cssText = 'background:rgba(148,163,184,.12);margin-left:auto;border-radius:14px 14px 4px 14px;';
    userBub.textContent = text;
    body.appendChild(userBub);
    input.value = '';

    // Check FAQ match
    var answer = null;
    var lowerText = text.toLowerCase();
    _iaConfig.faq.forEach(function(f) {
      if (f.q && lowerText.indexOf(f.q.toLowerCase().split(' ')[0]) !== -1) {
        answer = f.a;
      }
    });

    setTimeout(function() {
      var botBub = document.createElement('div');
      botBub.className = 'cfg-chat-bubble';
      botBub.textContent = answer || 'Je suis un aper\u00e7u du chat IA. En production, je r\u00e9pondrai intelligemment \u00e0 cette question.';
      body.appendChild(botBub);
      body.scrollTop = body.scrollHeight;
    }, 600);

    body.scrollTop = body.scrollHeight;
  };

  widget.querySelector('#cfg-chat-send').addEventListener('click', sendMsg);
  widget.querySelector('#cfg-chat-msg').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMsg();
  });
}

/* ------------------------------------------------------------------ */
/*  TOAST                                                             */
/* ------------------------------------------------------------------ */

function showToast(message) {
  var existing = document.getElementById('cfg-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'cfg-toast';
  toast.textContent = message;
  toast.style.cssText =
    'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);' +
    'padding:12px 28px;border-radius:12px;background:rgba(20,184,166,.92);color:#fff;' +
    'font-weight:600;font-size:.9rem;z-index:9999;opacity:0;transition:all .35s;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.3);backdrop-filter:blur(8px);';
  document.body.appendChild(toast);

  requestAnimationFrame(function() {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(function() { toast.remove(); }, 350);
  }, 2500);
}

/* ------------------------------------------------------------------ */
/*  REFRESH                                                           */
/* ------------------------------------------------------------------ */

function refreshConfig() {
  if (_cfgContainer) renderConfig(_cfgContainer);
}

/* ------------------------------------------------------------------ */
/*  EXPORTS                                                           */
/* ------------------------------------------------------------------ */

if (typeof window !== 'undefined') {
  window.renderConfig = renderConfig;
  window.refreshConfig = refreshConfig;
}
