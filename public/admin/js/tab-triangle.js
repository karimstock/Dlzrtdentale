/**
 * JADOMI Dentiste Pro — Triangle Tab Module
 * Case Timeline (Instagram Story style) + Lab Quality Scoring
 * Visual journey of each dental case with photos, AI analysis, and lab scoring
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DESIGN TOKENS (local)
  // ---------------------------------------------------------------------------
  var COLORS = {
    blue:     '#3b82f6',
    orange:   '#f59e0b',
    purple:   '#8b5cf6',
    green:    '#22c55e',
    teal:     '#0d9488',
    tealLight:'#2dd4bf',
    pink:     '#ec4899',
    red:      '#ef4444',
    gold:     '#c9a961'
  };

  var STATUS_MAP = {
    ouvert:        { label: 'Ouvert',          color: COLORS.blue,   bg: 'rgba(59,130,246,.12)' },
    fabrication:   { label: 'En fabrication',  color: COLORS.orange, bg: 'rgba(245,158,11,.12)' },
    essayage:      { label: 'Essayage',        color: COLORS.purple, bg: 'rgba(139,92,246,.12)' },
    termine:       { label: 'Termine',         color: COLORS.green,  bg: 'rgba(34,197,94,.12)'  }
  };

  var SOURCE_MAP = {
    praticien: { label: 'Praticien', color: COLORS.teal },
    labo:      { label: 'Labo',      color: COLORS.orange },
    patient:   { label: 'Patient',   color: COLORS.pink },
    ia:        { label: 'IA',        color: COLORS.purple }
  };

  var TYPES_CAS = [
    'Couronne', 'Bridge', 'Facette', 'Implant',
    'Gouttiere', 'Prothese amovible', 'Inlay/Onlay', 'Autre'
  ];

  var VITA_SHADES = {
    A: { label: 'A (Brun-rouge)', shades: ['A1','A2','A3','A3.5','A4'], hex: ['#f5e6c8','#ebd5a8','#dfc48e','#d4b07a','#c49a68'] },
    B: { label: 'B (Jaune-rouge)', shades: ['B1','B2','B3','B4'], hex: ['#f5e8c0','#edd8a0','#e0c682','#d0b068'] },
    C: { label: 'C (Gris)',        shades: ['C1','C2','C3','C4'], hex: ['#e8dcc8','#d8ccb0','#c8b898','#b8a488'] },
    D: { label: 'D (Rouge-gris)',  shades: ['D2','D3','D4'],      hex: ['#e0d0b8','#d0c0a0','#c0b090'] }
  };

  // ---------------------------------------------------------------------------
  // DEMO DATA — 3 Labos
  // ---------------------------------------------------------------------------
  var LABOS = [
    { id: 1, nom: 'Labo Ceramic Plus',  specialites: ['Ceramique', 'Zircone'],        ville: 'Paris 11e',  tel: '01 43 55 12 34', scoreGlobal: 4.3, casTermines: 28, delaiMoyen: 8, tauxRefaire: 3.5 },
    { id: 2, nom: 'Prothesia',          specialites: ['Implant', 'CFAO'],             ville: 'Boulogne',   tel: '01 46 03 56 78', scoreGlobal: 4.0, casTermines: 15, delaiMoyen: 10, tauxRefaire: 6.7 },
    { id: 3, nom: 'Dental Art Lab',     specialites: ['Facettes', 'Esthetique'],      ville: 'Paris 8e',   tel: '01 42 89 01 23', scoreGlobal: 4.6, casTermines: 42, delaiMoyen: 12, tauxRefaire: 2.4 }
  ];

  // ---------------------------------------------------------------------------
  // DEMO DATA — 4 Cases
  // ---------------------------------------------------------------------------
  function demoDate(y, m, d, h, min) {
    return new Date(y, m - 1, d, h || 10, min || 0);
  }

  var CASES = [
    {
      id: 'CAS-2026-0042', patient: 'Mme Dupont Marie', type: 'Couronne', dent: '15',
      teinte: 'A2', labo: LABOS[0], statut: 'termine', dateLivraisonPrevue: demoDate(2026,4,22),
      dateCreation: demoDate(2026,4,12), instructions: 'Couronne ceramique zircone, ajustage proximal soigne.',
      timeline: [
        { date: demoDate(2026,4,12,9,15), etape: 'Empreinte', source: 'praticien', description: 'Photo de la preparation + empreinte alginate', photos: [genThumb('prep','#2a6f6a')], ia: null },
        { date: demoDate(2026,4,13,10,30), etape: 'Teinte', source: 'praticien', description: 'VITA A2, eclairage naturel', photos: [genThumb('teinte','#8b7d3c')], ia: { status: 'ok', text: 'Teinte A2 confirmee, tab present, qualite: bonne' } },
        { date: demoDate(2026,4,16,14,0), etape: 'Fabrication', source: 'labo', description: 'Wax-up sur modele, vue vestibulaire', photos: [genThumb('wax','#5a4a3a')], ia: null },
        { date: demoDate(2026,4,19,11,0), etape: 'Essayage', source: 'labo', description: 'Biscuit sur modele avant glacure', photos: [genThumb('biscuit','#7a6a5a')], ia: { status: 'warning', text: 'Ajustement proximal a verifier' } },
        { date: demoDate(2026,4,22,9,0), etape: 'Produit fini', source: 'labo', description: 'Couronne zircone glacee, vue 360 deg.', photos: [genThumb('fini1','#3a7a6a'), genThumb('fini2','#4a8a7a'), genThumb('fini3','#2a6a5a')], ia: { status: 'ok', text: 'Conformite validee, teinte OK, anatomie OK' } },
        { date: demoDate(2026,4,23,10,30), etape: 'Pose', source: 'praticien', description: 'Resultat final en bouche. Partage avec la patiente.', photos: [genThumb('avant','#6a5a4a'), genThumb('apres','#3a8a6a')], ia: null, shared: true }
      ],
      score: { teinte: 4, ajustage: 4, esthetique: 5, delai: 4, communication: 4, commentaire: 'Excellent travail sur la morphologie. Leger retard de livraison.' }
    },
    {
      id: 'CAS-2026-0055', patient: 'M. Leroy Antoine', type: 'Bridge', dent: '35-37',
      teinte: 'A3', labo: LABOS[1], statut: 'fabrication', dateLivraisonPrevue: demoDate(2026,4,30),
      dateCreation: demoDate(2026,4,18), instructions: 'Bridge 3 elements zircone. Contacts proximaux serres.',
      timeline: [
        { date: demoDate(2026,4,18,8,45), etape: 'Empreinte', source: 'praticien', description: 'Empreinte optique CEREC, preparations 35 et 37', photos: [genThumb('scan','#2a5a8a')], ia: null },
        { date: demoDate(2026,4,19,14,0), etape: 'Teinte', source: 'praticien', description: 'VITA A3, zone laterale', photos: [genThumb('teinte2','#9a8a5a')], ia: { status: 'ok', text: 'Teinte A3 confirmee, eclairage adequat' } },
        { date: demoDate(2026,4,23,16,30), etape: 'Fabrication', source: 'labo', description: 'Conception CFAO en cours, attente validation design', photos: [genThumb('cfao','#4a4a6a')], ia: null }
      ],
      score: null
    },
    {
      id: 'CAS-2026-0061', patient: 'Mme Bernard Sophie', type: 'Facette', dent: '11-21',
      teinte: 'B1', labo: LABOS[2], statut: 'essayage', dateLivraisonPrevue: demoDate(2026,4,28),
      dateCreation: demoDate(2026,4,10), instructions: 'Facettes ceramique feldspathique. Forme naturelle, transparence incisale.',
      timeline: [
        { date: demoDate(2026,4,10,9,0), etape: 'Empreinte', source: 'praticien', description: 'Photos du sourire + empreinte silicone', photos: [genThumb('sourire','#8a6a5a')], ia: null },
        { date: demoDate(2026,4,11,11,0), etape: 'Teinte', source: 'praticien', description: 'VITA B1, eclairage mixte, photos avec teintier', photos: [genThumb('teinte3','#c8b888')], ia: { status: 'ok', text: 'B1 confirme, transparence incisale notee' } },
        { date: demoDate(2026,4,17,15,0), etape: 'Fabrication', source: 'labo', description: 'Modelage cire, validation de la forme', photos: [genThumb('cire','#7a7a5a')], ia: null },
        { date: demoDate(2026,4,24,10,0), etape: 'Essayage', source: 'labo', description: 'Essayage en bouche, verification de la teinte et de la forme', photos: [genThumb('essai','#5a8a7a')], ia: { status: 'ok', text: 'Integration esthetique validee' } }
      ],
      score: null
    },
    {
      id: 'CAS-2026-0070', patient: 'M. Faure Philippe', type: 'Gouttiere', dent: 'Arcade sup.',
      teinte: 'N/A', labo: LABOS[1], statut: 'ouvert', dateLivraisonPrevue: demoDate(2026,5,5),
      dateCreation: demoDate(2026,4,24), instructions: 'Gouttiere bruxisme rigide, 2mm epaisseur occlusale.',
      timeline: [
        { date: demoDate(2026,4,24,14,30), etape: 'Empreinte', source: 'praticien', description: 'Empreinte alginate arcade superieure', photos: [genThumb('gout','#4a6a8a')], ia: null }
      ],
      score: null
    }
  ];

  // Thumbnail generator (colored placeholder)
  function genThumb(id, color) {
    return { id: id, color: color };
  }

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var state = {
    filter: 'tous',
    search: '',
    selectedCaseId: null,
    lightboxPhoto: null,
    scoringCaseId: null
  };

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function formatDateShort(d) {
    if (!d) return '--';
    var months = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function formatDateFull(d) {
    if (!d) return '--';
    var jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    var months = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
    return jours[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatTime(d) {
    if (!d) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function daysBetween(a, b) {
    return Math.round(Math.abs((b - a) / 86400000));
  }

  function avgScore(sc) {
    if (!sc) return 0;
    return ((sc.teinte + sc.ajustage + sc.esthetique + sc.delai + sc.communication) / 5).toFixed(1);
  }

  function starsHTML(val, max) {
    max = max || 5;
    var full = Math.floor(val);
    var half = (val - full) >= 0.3;
    var html = '';
    for (var i = 0; i < max; i++) {
      if (i < full) {
        html += '<span class="tri-star filled">&#9733;</span>';
      } else if (i === full && half) {
        html += '<span class="tri-star half">&#9733;</span>';
      } else {
        html += '<span class="tri-star empty">&#9734;</span>';
      }
    }
    return html;
  }

  function esc(s) {
    if (!s) return '';
    var el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // CSS INJECTION
  // ---------------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('triangle-styles')) return;
    var style = document.createElement('style');
    style.id = 'triangle-styles';
    style.textContent = [
      /* ── Layout ── */
      '.tri-wrap { display:flex; gap:0; height:calc(100vh - 80px); overflow:hidden; }',
      '.tri-list-panel { width:380px; min-width:320px; border-right:1px solid var(--border-subtle); display:flex; flex-direction:column; overflow:hidden; background:var(--bg-secondary); }',
      '.tri-detail-panel { flex:1; overflow-y:auto; background:var(--bg-primary); position:relative; }',
      '.tri-detail-empty { display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-tertiary); font-size:15px; flex-direction:column; gap:12px; }',
      '.tri-detail-empty svg { opacity:.3; }',

      /* ── List Header ── */
      '.tri-list-header { padding:20px 20px 12px; border-bottom:1px solid var(--border-subtle); }',
      '.tri-list-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; }',
      '.tri-search { width:100%; background:var(--bg-input); border:1px solid var(--border-default); border-radius:var(--radius-md); padding:10px 14px 10px 38px; color:var(--text-primary); font-size:13px; outline:none; transition:border-color .2s; }',
      '.tri-search:focus { border-color:var(--accent); }',
      '.tri-search-wrap { position:relative; margin-bottom:10px; }',
      '.tri-search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); pointer-events:none; }',
      '.tri-filters { display:flex; gap:6px; flex-wrap:wrap; }',
      '.tri-filter-btn { padding:5px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:500; background:transparent; border:1px solid var(--border-default); color:var(--text-secondary); cursor:pointer; transition:all .2s; }',
      '.tri-filter-btn:hover { border-color:var(--accent); color:var(--text-primary); }',
      '.tri-filter-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }',

      /* ── Case Cards ── */
      '.tri-list-scroll { flex:1; overflow-y:auto; padding:8px; }',
      '.tri-case-card { padding:14px 16px; border-radius:var(--radius-md); cursor:pointer; border:1px solid transparent; margin-bottom:4px; transition:all .25s var(--ease-out-expo); position:relative; }',
      '.tri-case-card:hover { background:rgba(255,255,255,.03); border-color:var(--border-default); }',
      '.tri-case-card.selected { background:rgba(13,148,136,.08); border-color:var(--accent); }',
      '.tri-case-ref { font-size:11px; color:var(--text-tertiary); font-family:monospace; letter-spacing:.5px; }',
      '.tri-case-patient { font-size:14px; font-weight:600; margin:2px 0 4px; }',
      '.tri-case-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
      '.tri-case-type { font-size:12px; color:var(--text-secondary); }',
      '.tri-case-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:var(--radius-full); font-size:11px; font-weight:600; }',
      '.tri-case-photos { font-size:11px; color:var(--text-tertiary); display:flex; align-items:center; gap:4px; }',
      '.tri-case-last { font-size:11px; color:var(--text-tertiary); margin-left:auto; }',

      /* ── Detail Header ── */
      '.tri-detail-header { padding:24px 28px 20px; border-bottom:1px solid var(--border-subtle); background:var(--bg-secondary); }',
      '.tri-dh-top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; }',
      '.tri-dh-ref { font-family:monospace; font-size:12px; color:var(--text-tertiary); letter-spacing:.5px; margin-bottom:4px; }',
      '.tri-dh-patient { font-family:var(--font-display); font-size:22px; font-weight:700; }',
      '.tri-dh-info { display:flex; gap:20px; flex-wrap:wrap; margin-top:8px; }',
      '.tri-dh-info-item { font-size:13px; color:var(--text-secondary); }',
      '.tri-dh-info-item strong { color:var(--text-primary); font-weight:600; }',
      '.tri-dh-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }',
      '.tri-action-btn { padding:8px 14px; border-radius:var(--radius-md); font-size:12px; font-weight:500; border:1px solid var(--border-default); background:var(--bg-elevated); color:var(--text-primary); cursor:pointer; display:flex; align-items:center; gap:6px; transition:all .2s; }',
      '.tri-action-btn:hover { border-color:var(--accent); background:rgba(13,148,136,.08); }',
      '.tri-action-btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; }',
      '.tri-action-btn.primary:hover { background:var(--teal-600); }',

      /* ── Timeline ── */
      '.tri-timeline { padding:24px 28px 40px; position:relative; }',
      '.tri-timeline::before { content:""; position:absolute; left:52px; top:24px; bottom:40px; width:2px; background:linear-gradient(180deg, var(--accent) 0%, rgba(13,148,136,.15) 100%); border-radius:2px; }',
      '.tri-tl-item { display:flex; gap:16px; margin-bottom:28px; position:relative; animation:triSlideIn .5s var(--ease-out-expo) both; }',
      '.tri-tl-item:nth-child(1) { animation-delay:.05s; }',
      '.tri-tl-item:nth-child(2) { animation-delay:.1s; }',
      '.tri-tl-item:nth-child(3) { animation-delay:.15s; }',
      '.tri-tl-item:nth-child(4) { animation-delay:.2s; }',
      '.tri-tl-item:nth-child(5) { animation-delay:.25s; }',
      '.tri-tl-item:nth-child(6) { animation-delay:.3s; }',
      '@keyframes triSlideIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }',

      /* ── Timeline Node ── */
      '.tri-tl-node { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; position:relative; z-index:2; font-size:13px; border:2px solid; background:var(--bg-primary); }',

      /* ── Timeline Date ── */
      '.tri-tl-date { width:56px; flex-shrink:0; text-align:right; padding-top:4px; }',
      '.tri-tl-date-day { font-size:13px; font-weight:600; color:var(--text-primary); }',
      '.tri-tl-date-time { font-size:11px; color:var(--text-tertiary); }',

      /* ── Timeline Content ── */
      '.tri-tl-content { flex:1; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px 18px; transition:all .3s var(--ease-out-expo); }',
      '.tri-tl-content:hover { border-color:var(--border-default); transform:translateY(-1px); box-shadow:var(--shadow-md); }',
      '.tri-tl-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }',
      '.tri-tl-etape { font-size:14px; font-weight:600; }',
      '.tri-tl-source-badge { padding:2px 8px; border-radius:var(--radius-full); font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }',
      '.tri-tl-desc { font-size:13px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px; }',

      /* ── AI Badge ── */
      '.tri-ai-badge { display:flex; align-items:flex-start; gap:8px; padding:8px 12px; border-radius:var(--radius-sm); margin-top:8px; font-size:12px; line-height:1.4; }',
      '.tri-ai-badge.ok { background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.2); color:#86efac; }',
      '.tri-ai-badge.warning { background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.2); color:#fcd34d; }',
      '.tri-ai-icon { flex-shrink:0; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; }',
      '.tri-ai-badge.ok .tri-ai-icon { background:rgba(34,197,94,.2); color:#22c55e; }',
      '.tri-ai-badge.warning .tri-ai-icon { background:rgba(245,158,11,.2); color:#f59e0b; }',

      /* ── Photo Thumbnails ── */
      '.tri-tl-photos { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }',
      '.tri-photo-thumb { width:72px; height:72px; border-radius:var(--radius-sm); overflow:hidden; cursor:pointer; position:relative; border:2px solid transparent; transition:all .25s var(--ease-out-expo); }',
      '.tri-photo-thumb:hover { border-color:var(--accent); transform:scale(1.08); box-shadow:0 4px 16px rgba(0,0,0,.4); z-index:5; }',
      '.tri-photo-inner { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:20px; color:rgba(255,255,255,.5); }',

      /* ── Shared indicator ── */
      '.tri-shared { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--success); margin-top:4px; }',

      /* ── Score Section ── */
      '.tri-score-section { padding:24px 28px; border-top:1px solid var(--border-subtle); background:var(--bg-secondary); }',
      '.tri-score-title { font-family:var(--font-display); font-size:16px; font-weight:700; margin-bottom:16px; }',
      '.tri-score-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px 24px; margin-bottom:16px; }',
      '.tri-score-row { display:flex; align-items:center; justify-content:space-between; }',
      '.tri-score-label { font-size:13px; color:var(--text-secondary); }',
      '.tri-score-stars { display:flex; gap:2px; }',
      '.tri-star { font-size:18px; transition:color .15s; }',
      '.tri-star.filled { color:var(--gold); }',
      '.tri-star.half { color:var(--gold); opacity:.6; }',
      '.tri-star.empty { color:var(--text-tertiary); opacity:.3; }',
      '.tri-score-overall { display:flex; align-items:center; gap:12px; padding:16px; background:var(--bg-elevated); border-radius:var(--radius-md); border:1px solid var(--border-subtle); margin-bottom:16px; }',
      '.tri-score-big { font-family:var(--font-display); font-size:32px; font-weight:800; color:var(--gold); }',
      '.tri-score-sub { font-size:13px; color:var(--text-secondary); }',
      '.tri-score-comment { font-size:13px; color:var(--text-secondary); font-style:italic; padding:12px 16px; background:var(--bg-card); border-radius:var(--radius-sm); border-left:3px solid var(--gold); }',

      /* ── Score Summary Stats ── */
      '.tri-score-summary { display:flex; gap:16px; flex-wrap:wrap; margin-top:12px; }',
      '.tri-score-stat { font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; }',
      '.tri-score-stat .val { color:var(--text-primary); font-weight:600; }',

      /* ── Scoring Form ── */
      '.tri-scoring-form { padding:24px 28px; border-top:1px solid var(--border-subtle); background:var(--bg-secondary); }',
      '.tri-scoring-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }',
      '.tri-scoring-label { font-size:13px; color:var(--text-secondary); }',
      '.tri-scoring-stars { display:flex; gap:4px; }',
      '.tri-scoring-star { font-size:22px; cursor:pointer; color:var(--text-tertiary); opacity:.3; transition:all .15s; }',
      '.tri-scoring-star:hover, .tri-scoring-star.active { color:var(--gold); opacity:1; transform:scale(1.15); }',

      /* ── Lab Scorecard ── */
      '.tri-lab-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px 18px; margin-bottom:12px; transition:all .3s; }',
      '.tri-lab-card:hover { border-color:var(--border-default); }',
      '.tri-lab-name { font-size:15px; font-weight:600; margin-bottom:4px; }',
      '.tri-lab-specs { font-size:12px; color:var(--text-tertiary); margin-bottom:8px; }',
      '.tri-lab-stats { display:flex; gap:16px; flex-wrap:wrap; }',
      '.tri-lab-stat { text-align:center; }',
      '.tri-lab-stat-val { font-size:18px; font-weight:700; color:var(--accent-light); }',
      '.tri-lab-stat-lbl { font-size:10px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:.5px; }',

      /* ── New Case Button ── */
      '.tri-new-btn { width:100%; padding:12px; border:2px dashed var(--border-default); border-radius:var(--radius-md); color:var(--text-secondary); font-size:13px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all .25s; margin:8px 0; background:transparent; }',
      '.tri-new-btn:hover { border-color:var(--accent); color:var(--accent-light); background:rgba(13,148,136,.04); }',

      /* ── Lightbox ── */
      '.tri-lightbox { position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; backdrop-filter:blur(12px); animation:triFadeIn .2s ease; cursor:pointer; }',
      '.tri-lightbox-inner { width:420px; height:420px; border-radius:var(--radius-lg); overflow:hidden; display:flex; align-items:center; justify-content:center; font-size:48px; color:rgba(255,255,255,.3); animation:triZoomIn .3s var(--ease-out-expo); }',
      '@keyframes triFadeIn { from { opacity:0; } to { opacity:1; } }',
      '@keyframes triZoomIn { from { opacity:0; transform:scale(.9); } to { opacity:1; transform:scale(1); } }',

      /* ── Modal overlay ── */
      '.tri-modal-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; backdrop-filter:blur(6px); animation:triFadeIn .2s ease; }',
      '.tri-modal { background:var(--bg-card); border:1px solid var(--border-default); border-radius:var(--radius-lg); padding:28px 32px; max-width:560px; width:90%; max-height:85vh; overflow-y:auto; animation:triZoomIn .25s var(--ease-out-expo); }',
      '.tri-modal h2 { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:20px; }',
      '.tri-modal .form-group { margin-bottom:14px; }',
      '.tri-modal .form-label { display:block; font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }',
      '.tri-modal .form-input, .tri-modal .form-select, .tri-modal .form-textarea { width:100%; background:var(--bg-input); border:1px solid var(--border-default); border-radius:var(--radius-sm); padding:10px 14px; color:var(--text-primary); font-size:13px; outline:none; transition:border-color .2s; }',
      '.tri-modal .form-input:focus, .tri-modal .form-select:focus, .tri-modal .form-textarea:focus { border-color:var(--accent); }',
      '.tri-modal .form-textarea { min-height:80px; resize:vertical; }',
      '.tri-modal .form-row { display:flex; gap:12px; }',
      '.tri-modal .form-row .form-group { flex:1; }',

      /* ── VITA shade picker ── */
      '.tri-vita-grid { display:flex; flex-wrap:wrap; gap:6px; }',
      '.tri-vita-chip { width:42px; height:36px; border-radius:var(--radius-sm); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:rgba(0,0,0,.7); border:2px solid transparent; transition:all .2s; }',
      '.tri-vita-chip:hover { transform:scale(1.1); border-color:var(--accent); }',
      '.tri-vita-chip.selected { border-color:#fff; box-shadow:0 0 0 2px var(--accent), 0 2px 8px rgba(0,0,0,.3); transform:scale(1.1); }',

      /* ── Tabs in detail ── */
      '.tri-detail-tabs { display:flex; border-bottom:1px solid var(--border-subtle); background:var(--bg-secondary); }',
      '.tri-detail-tab { padding:12px 20px; font-size:13px; font-weight:500; color:var(--text-tertiary); cursor:pointer; border-bottom:2px solid transparent; transition:all .2s; background:none; border-top:none; border-left:none; border-right:none; }',
      '.tri-detail-tab:hover { color:var(--text-primary); }',
      '.tri-detail-tab.active { color:var(--accent-light); border-bottom-color:var(--accent); }',

      /* ── Responsive ── */
      '@media (max-width:768px) {',
      '  .tri-wrap { flex-direction:column; height:auto; }',
      '  .tri-list-panel { width:100%; min-width:0; max-height:40vh; border-right:none; border-bottom:1px solid var(--border-subtle); }',
      '  .tri-detail-panel { min-height:60vh; }',
      '  .tri-timeline::before { left:28px; }',
      '  .tri-tl-date { width:36px; }',
      '  .tri-score-grid { grid-template-columns:1fr; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // RENDER: Main
  // ---------------------------------------------------------------------------
  function renderTriangle(container) {
    injectStyles();
    container.innerHTML = '<div class="tri-wrap" id="tri-root"></div>';
    renderLayout();
  }

  function renderLayout() {
    var root = document.getElementById('tri-root');
    if (!root) return;
    root.innerHTML = renderListPanel() + renderDetailPanel();
    bindListEvents();
  }

  // ---------------------------------------------------------------------------
  // RENDER: List Panel
  // ---------------------------------------------------------------------------
  function renderListPanel() {
    var filtered = getFilteredCases();
    var h = '<div class="tri-list-panel" id="tri-list-panel">';
    h += '<div class="tri-list-header">';
    h += '<div class="tri-list-title">Cas prothese <span style="font-size:12px;color:var(--text-tertiary);font-weight:400;font-family:var(--font-body);">' + CASES.length + ' cas</span></div>';
    h += '<div class="tri-search-wrap">';
    h += '<svg class="tri-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
    h += '<input type="text" class="tri-search" id="tri-search" placeholder="Rechercher patient, reference..." value="' + esc(state.search) + '">';
    h += '</div>';
    h += '<div class="tri-filters">';
    ['tous','ouvert','fabrication','essayage','termine'].forEach(function(f) {
      var label = f === 'tous' ? 'Tous' : (STATUS_MAP[f] ? STATUS_MAP[f].label : f);
      var count = f === 'tous' ? CASES.length : CASES.filter(function(c) { return c.statut === f; }).length;
      h += '<button class="tri-filter-btn' + (state.filter === f ? ' active' : '') + '" data-filter="' + f + '">' + esc(label) + ' (' + count + ')</button>';
    });
    h += '</div></div>';

    h += '<div class="tri-list-scroll" id="tri-list-scroll">';
    if (filtered.length === 0) {
      h += '<div style="padding:40px 20px;text-align:center;color:var(--text-tertiary);font-size:13px;">Aucun cas trouve.</div>';
    } else {
      filtered.forEach(function(c) {
        var st = STATUS_MAP[c.statut] || STATUS_MAP.ouvert;
        var photoCount = 0;
        c.timeline.forEach(function(t) { photoCount += t.photos.length; });
        var lastDate = c.timeline[c.timeline.length - 1].date;
        h += '<div class="tri-case-card' + (state.selectedCaseId === c.id ? ' selected' : '') + '" data-case-id="' + c.id + '">';
        h += '<div class="tri-case-ref">' + esc(c.id) + '</div>';
        h += '<div class="tri-case-patient">' + esc(c.patient) + '</div>';
        h += '<div class="tri-case-meta">';
        h += '<span class="tri-case-type">' + esc(c.type) + ' ' + esc(c.dent) + '</span>';
        h += '<span class="tri-case-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + esc(st.label) + '</span>';
        h += '<span class="tri-case-photos"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> ' + photoCount + '</span>';
        h += '<span class="tri-case-last">' + formatDateShort(lastDate) + '</span>';
        h += '</div></div>';
      });
    }
    h += '<button class="tri-new-btn" id="tri-new-case-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Nouveau cas</button>';
    h += '</div></div>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // RENDER: Detail Panel
  // ---------------------------------------------------------------------------
  function renderDetailPanel() {
    var c = getSelectedCase();
    if (!c) {
      return '<div class="tri-detail-panel"><div class="tri-detail-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
        '<span>Selectionnez un cas pour voir sa timeline</span></div></div>';
    }

    var h = '<div class="tri-detail-panel" id="tri-detail">';

    // Header
    h += '<div class="tri-detail-header">';
    h += '<div class="tri-dh-top">';
    h += '<div>';
    h += '<div class="tri-dh-ref">' + esc(c.id) + '</div>';
    h += '<div class="tri-dh-patient">' + esc(c.patient) + '</div>';
    h += '</div>';
    var st = STATUS_MAP[c.statut] || STATUS_MAP.ouvert;
    h += '<span class="tri-case-badge" style="background:' + st.bg + ';color:' + st.color + ';padding:4px 12px;font-size:12px;">' + esc(st.label) + '</span>';
    h += '</div>';
    h += '<div class="tri-dh-info">';
    h += '<div class="tri-dh-info-item"><strong>Type:</strong> ' + esc(c.type) + '</div>';
    h += '<div class="tri-dh-info-item"><strong>Dent:</strong> ' + esc(c.dent) + '</div>';
    h += '<div class="tri-dh-info-item"><strong>Teinte:</strong> ' + esc(c.teinte) + '</div>';
    h += '<div class="tri-dh-info-item"><strong>Labo:</strong> ' + esc(c.labo.nom) + '</div>';
    h += '<div class="tri-dh-info-item"><strong>Livraison prevue:</strong> ' + formatDateFull(c.dateLivraisonPrevue) + '</div>';
    h += '</div>';

    // Actions
    h += '<div class="tri-dh-actions">';
    h += '<button class="tri-action-btn primary" onclick="JADOMI_TRI.actionSendPhoto()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> Envoyer photo au labo</button>';
    h += '<button class="tri-action-btn" onclick="JADOMI_TRI.actionSendPatient()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg> Envoyer au patient</button>';
    h += '<button class="tri-action-btn" onclick="JADOMI_TRI.actionRequestPhoto()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Demander photo au labo</button>';
    h += '<button class="tri-action-btn" onclick="JADOMI_TRI.actionAnnotate()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Annoter</button>';
    h += '</div>';
    h += '</div>';

    // Tabs
    h += '<div class="tri-detail-tabs">';
    h += '<button class="tri-detail-tab active" data-dtab="timeline">Timeline</button>';
    h += '<button class="tri-detail-tab" data-dtab="labo">Fiche labo</button>';
    if (c.statut === 'termine') {
      h += '<button class="tri-detail-tab" data-dtab="score">Score qualite</button>';
    }
    h += '</div>';

    // Timeline content
    h += '<div id="tri-dtab-timeline">';
    h += renderTimeline(c);
    h += '</div>';

    // Labo tab (hidden)
    h += '<div id="tri-dtab-labo" style="display:none;">';
    h += renderLaboCard(c.labo);
    h += '</div>';

    // Score tab (hidden, only for termine)
    if (c.statut === 'termine') {
      h += '<div id="tri-dtab-score" style="display:none;">';
      h += renderScoreSection(c);
      h += '</div>';
    }

    h += '</div>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // RENDER: Timeline
  // ---------------------------------------------------------------------------
  function renderTimeline(c) {
    var h = '<div class="tri-timeline">';
    c.timeline.forEach(function(item, idx) {
      var srcInfo = SOURCE_MAP[item.source] || SOURCE_MAP.praticien;
      h += '<div class="tri-tl-item">';

      // Date column
      h += '<div class="tri-tl-date">';
      h += '<div class="tri-tl-date-day">' + formatDateShort(item.date) + '</div>';
      h += '<div class="tri-tl-date-time">' + formatTime(item.date) + '</div>';
      h += '</div>';

      // Node
      h += '<div class="tri-tl-node" style="border-color:' + srcInfo.color + ';color:' + srcInfo.color + ';">';
      h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
      h += '</div>';

      // Content card
      h += '<div class="tri-tl-content">';
      h += '<div class="tri-tl-header">';
      h += '<span class="tri-tl-etape">' + esc(item.etape) + '</span>';
      h += '<span class="tri-tl-source-badge" style="background:' + srcInfo.color + '22;color:' + srcInfo.color + ';">' + esc(srcInfo.label) + '</span>';
      h += '</div>';
      h += '<div class="tri-tl-desc">' + esc(item.description) + '</div>';

      // AI badge
      if (item.ia) {
        h += '<div class="tri-ai-badge ' + (item.ia.status === 'ok' ? 'ok' : 'warning') + '">';
        h += '<div class="tri-ai-icon">IA</div>';
        h += '<span>' + esc(item.ia.text) + '</span>';
        h += '</div>';
      }

      // Photos
      if (item.photos && item.photos.length) {
        h += '<div class="tri-tl-photos">';
        item.photos.forEach(function(photo) {
          h += '<div class="tri-photo-thumb" data-photo-id="' + photo.id + '" onclick="JADOMI_TRI.openLightbox(\'' + photo.id + '\',\'' + photo.color + '\')">';
          h += '<div class="tri-photo-inner" style="background:' + photo.color + ';">';
          h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
          h += '</div></div>';
        });
        h += '</div>';
      }

      // Shared indicator
      if (item.shared) {
        h += '<div class="tri-shared"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Partage avec le patient</div>';
      }

      h += '</div></div>';
    });
    h += '</div>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // RENDER: Labo Card (detail tab)
  // ---------------------------------------------------------------------------
  function renderLaboCard(labo) {
    var h = '<div style="padding:24px 28px;">';
    h += '<div class="tri-lab-card" style="border-color:var(--accent);background:rgba(13,148,136,.04);">';
    h += '<div class="tri-lab-name">' + esc(labo.nom) + '</div>';
    h += '<div class="tri-lab-specs">' + esc(labo.specialites.join(' / ')) + ' &mdash; ' + esc(labo.ville) + '</div>';
    h += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Tel: ' + esc(labo.tel) + '</div>';
    h += '<div class="tri-lab-stats">';
    h += labStat(labo.scoreGlobal, 'Score');
    h += labStat(labo.casTermines, 'Cas');
    h += labStat(labo.delaiMoyen + 'j', 'Delai moy.');
    h += labStat(labo.tauxRefaire + '%', 'Refaire');
    h += '</div>';
    h += '<div style="margin-top:12px;">' + starsHTML(labo.scoreGlobal) + ' <span style="font-size:13px;color:var(--text-secondary);margin-left:4px;">' + labo.scoreGlobal + '/5</span></div>';
    h += '</div>';

    // All labos scorecard
    h += '<div style="margin-top:24px;">';
    h += '<div class="tri-score-title">Tableau de bord labos</div>';
    LABOS.forEach(function(l) {
      h += '<div class="tri-lab-card">';
      h += '<div class="tri-lab-name">' + esc(l.nom) + '</div>';
      h += '<div class="tri-lab-specs">' + esc(l.specialites.join(' / ')) + '</div>';
      h += '<div class="tri-lab-stats">';
      h += labStat(l.scoreGlobal, 'Score');
      h += labStat(l.casTermines, 'Cas');
      h += labStat(l.delaiMoyen + 'j', 'Delai');
      h += labStat(l.tauxRefaire + '%', 'Refaire');
      h += '</div>';
      h += '<div style="margin-top:8px;">' + starsHTML(l.scoreGlobal) + '</div>';
      h += '</div>';
    });
    h += '</div></div>';
    return h;
  }

  function labStat(val, label) {
    return '<div class="tri-lab-stat"><div class="tri-lab-stat-val">' + val + '</div><div class="tri-lab-stat-lbl">' + esc(label) + '</div></div>';
  }

  // ---------------------------------------------------------------------------
  // RENDER: Score Section
  // ---------------------------------------------------------------------------
  function renderScoreSection(c) {
    if (!c.score) {
      return renderScoringForm(c);
    }
    var sc = c.score;
    var avg = avgScore(sc);
    var delaiJours = daysBetween(c.dateCreation, c.timeline[c.timeline.length - 1].date);
    var delaiPrevu = daysBetween(c.dateCreation, c.dateLivraisonPrevue);
    var delaiStatus = delaiJours <= delaiPrevu ? 'Conforme' : (delaiJours <= delaiPrevu + 2 ? 'Acceptable' : 'Retard');
    var delaiColor = delaiJours <= delaiPrevu ? COLORS.green : (delaiJours <= delaiPrevu + 2 ? COLORS.orange : COLORS.red);

    var h = '<div class="tri-score-section">';
    h += '<div class="tri-score-title">Score qualite labo</div>';

    // Overall
    h += '<div class="tri-score-overall">';
    h += '<div class="tri-score-big">' + avg + '</div>';
    h += '<div><div>' + starsHTML(parseFloat(avg)) + '</div><div class="tri-score-sub">sur 5 criteres</div></div>';
    h += '</div>';

    // Grid
    h += '<div class="tri-score-grid">';
    h += scoreRow('Teinte', sc.teinte);
    h += scoreRow('Ajustage', sc.ajustage);
    h += scoreRow('Esthetique', sc.esthetique);
    h += scoreRow('Delai', sc.delai);
    h += scoreRow('Communication', sc.communication);
    h += '</div>';

    // Summary stats
    h += '<div class="tri-score-summary">';
    h += '<div class="tri-score-stat">Delai: <span class="val">' + delaiJours + ' jours</span> (prevu: ' + delaiPrevu + ') &mdash; <span style="color:' + delaiColor + ';">' + delaiStatus + '</span></div>';
    h += '<div class="tri-score-stat">Teinte: <span class="val" style="color:' + (sc.teinte >= 4 ? COLORS.green : COLORS.orange) + ';">' + (sc.teinte >= 4 ? 'Conforme' : 'A verifier') + '</span></div>';
    h += '<div class="tri-score-stat">Ajustage: <span class="val" style="color:' + (sc.ajustage >= 4 ? COLORS.green : COLORS.orange) + ';">' + (sc.ajustage >= 4 ? 'Bon' : 'A revoir') + '</span></div>';
    h += '</div>';

    // Comment
    if (sc.commentaire) {
      h += '<div class="tri-score-comment" style="margin-top:16px;">"' + esc(sc.commentaire) + '"</div>';
    }

    h += '</div>';
    return h;
  }

  function scoreRow(label, val) {
    return '<div class="tri-score-row"><span class="tri-score-label">' + esc(label) + '</span><div class="tri-score-stars">' + starsHTML(val) + ' <span style="font-size:12px;color:var(--text-tertiary);margin-left:4px;">' + val + '</span></div></div>';
  }

  // ---------------------------------------------------------------------------
  // RENDER: Scoring Form (for cases without score)
  // ---------------------------------------------------------------------------
  function renderScoringForm(c) {
    var criteria = ['teinte','ajustage','esthetique','delai','communication'];
    var labels = { teinte:'Teinte (precision)', ajustage:'Ajustage (ajustement)', esthetique:'Esthetique', delai:'Delai de livraison', communication:'Communication' };
    var h = '<div class="tri-scoring-form">';
    h += '<div class="tri-score-title">Evaluer ce cas</div>';
    h += '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Attribuez une note sur 5 pour chaque critere :</p>';

    criteria.forEach(function(key) {
      h += '<div class="tri-scoring-row">';
      h += '<span class="tri-scoring-label">' + esc(labels[key]) + '</span>';
      h += '<div class="tri-scoring-stars" data-criteria="' + key + '">';
      for (var i = 1; i <= 5; i++) {
        h += '<span class="tri-scoring-star" data-val="' + i + '" onclick="JADOMI_TRI.setScoreStar(\'' + key + '\',' + i + ')">&#9733;</span>';
      }
      h += '</div></div>';
    });

    h += '<div class="form-group" style="margin-top:16px;">';
    h += '<label class="form-label" style="display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;">Commentaire</label>';
    h += '<textarea id="tri-score-comment" style="width:100%;background:var(--bg-input);border:1px solid var(--border-default);border-radius:var(--radius-sm);padding:10px 14px;color:var(--text-primary);font-size:13px;min-height:60px;resize:vertical;outline:none;font-family:var(--font-body);" placeholder="Commentaire optionnel..."></textarea>';
    h += '</div>';

    h += '<button class="tri-action-btn primary" style="margin-top:12px;" onclick="JADOMI_TRI.submitScore()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Enregistrer le score</button>';
    h += '</div>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // NEW CASE MODAL
  // ---------------------------------------------------------------------------
  function showNewCaseModal() {
    var h = '<div class="tri-modal">';
    h += '<h2>Nouveau cas prothese</h2>';

    h += '<div class="form-row">';
    h += '<div class="form-group"><label class="form-label">Patient</label><input type="text" class="form-input" id="tri-nc-patient" placeholder="Nom du patient"></div>';
    h += '<div class="form-group"><label class="form-label">Labo</label><select class="form-select" id="tri-nc-labo">';
    LABOS.forEach(function(l) { h += '<option value="' + l.id + '">' + esc(l.nom) + '</option>'; });
    h += '</select></div>';
    h += '</div>';

    h += '<div class="form-row">';
    h += '<div class="form-group"><label class="form-label">Type</label><select class="form-select" id="tri-nc-type">';
    TYPES_CAS.forEach(function(t) { h += '<option value="' + t + '">' + esc(t) + '</option>'; });
    h += '</select></div>';
    h += '<div class="form-group"><label class="form-label">Dent (FDI)</label><input type="text" class="form-input" id="tri-nc-dent" placeholder="Ex: 15, 11-21"></div>';
    h += '</div>';

    // VITA shade picker
    h += '<div class="form-group"><label class="form-label">Teinte VITA</label>';
    h += '<div class="tri-vita-grid" id="tri-vita-grid">';
    Object.keys(VITA_SHADES).forEach(function(group) {
      var g = VITA_SHADES[group];
      g.shades.forEach(function(shade, idx) {
        h += '<div class="tri-vita-chip" data-shade="' + shade + '" style="background:' + g.hex[idx] + ';" onclick="JADOMI_TRI.selectShade(\'' + shade + '\')">' + shade + '</div>';
      });
    });
    h += '</div>';
    h += '<input type="hidden" id="tri-nc-teinte" value="">';
    h += '</div>';

    h += '<div class="form-group"><label class="form-label">Instructions</label><textarea class="form-textarea" id="tri-nc-instructions" placeholder="Instructions specifiques pour le labo..."></textarea></div>';

    h += '<div class="form-group"><label class="form-label">Date livraison prevue</label><input type="date" class="form-input" id="tri-nc-date"></div>';

    h += '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">';
    h += '<button class="tri-action-btn" onclick="JADOMI_TRI.closeModal()">Annuler</button>';
    h += '<button class="tri-action-btn primary" onclick="JADOMI_TRI.createCase()">Creer le cas</button>';
    h += '</div>';

    h += '</div>';
    showOverlay(h);
  }

  // ---------------------------------------------------------------------------
  // OVERLAY / LIGHTBOX
  // ---------------------------------------------------------------------------
  function showOverlay(html) {
    closeOverlay();
    var overlay = document.createElement('div');
    overlay.className = 'tri-modal-overlay';
    overlay.id = 'tri-overlay';
    overlay.innerHTML = html;
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeOverlay();
    });
    document.body.appendChild(overlay);
  }

  function closeOverlay() {
    var el = document.getElementById('tri-overlay');
    if (el) el.remove();
  }

  function openLightbox(photoId, color) {
    closeLightbox();
    var lb = document.createElement('div');
    lb.className = 'tri-lightbox';
    lb.id = 'tri-lightbox';
    lb.innerHTML = '<div class="tri-lightbox-inner" style="background:' + color + ';"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>';
    lb.addEventListener('click', closeLightbox);
    document.body.appendChild(lb);
  }

  function closeLightbox() {
    var el = document.getElementById('tri-lightbox');
    if (el) el.remove();
  }

  // ---------------------------------------------------------------------------
  // EVENT BINDINGS
  // ---------------------------------------------------------------------------
  function bindListEvents() {
    // Search
    var searchEl = document.getElementById('tri-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        state.search = this.value;
        refreshList();
      });
    }

    // Filters
    document.querySelectorAll('.tri-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.filter = this.getAttribute('data-filter');
        refreshList();
      });
    });

    // Case cards
    document.querySelectorAll('.tri-case-card').forEach(function(card) {
      card.addEventListener('click', function() {
        state.selectedCaseId = this.getAttribute('data-case-id');
        renderLayout();
      });
    });

    // New case
    var newBtn = document.getElementById('tri-new-case-btn');
    if (newBtn) {
      newBtn.addEventListener('click', showNewCaseModal);
    }

    // Detail tabs
    document.querySelectorAll('.tri-detail-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = this.getAttribute('data-dtab');
        document.querySelectorAll('.tri-detail-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        ['timeline','labo','score'].forEach(function(t) {
          var el = document.getElementById('tri-dtab-' + t);
          if (el) el.style.display = (t === target) ? '' : 'none';
        });
      });
    });
  }

  function refreshList() {
    var listPanel = document.getElementById('tri-list-panel');
    if (!listPanel) return;
    var parent = listPanel.parentNode;
    var detailHTML = document.getElementById('tri-detail') ? document.getElementById('tri-detail').outerHTML : renderDetailPanel();
    parent.innerHTML = renderListPanel() + (state.selectedCaseId ? detailHTML : renderDetailPanel());
    bindListEvents();
  }

  // ---------------------------------------------------------------------------
  // DATA HELPERS
  // ---------------------------------------------------------------------------
  function getFilteredCases() {
    return CASES.filter(function(c) {
      if (state.filter !== 'tous' && c.statut !== state.filter) return false;
      if (state.search) {
        var q = state.search.toLowerCase();
        var haystack = (c.id + ' ' + c.patient + ' ' + c.type + ' ' + c.dent).toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function getSelectedCase() {
    if (!state.selectedCaseId) return null;
    for (var i = 0; i < CASES.length; i++) {
      if (CASES[i].id === state.selectedCaseId) return CASES[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // SCORING STATE
  // ---------------------------------------------------------------------------
  var pendingScore = { teinte: 0, ajustage: 0, esthetique: 0, delai: 0, communication: 0 };

  function setScoreStar(criteria, val) {
    pendingScore[criteria] = val;
    // Update visual
    var container = document.querySelector('.tri-scoring-stars[data-criteria="' + criteria + '"]');
    if (container) {
      container.querySelectorAll('.tri-scoring-star').forEach(function(star) {
        var sv = parseInt(star.getAttribute('data-val'));
        if (sv <= val) {
          star.classList.add('active');
        } else {
          star.classList.remove('active');
        }
      });
    }
  }

  function submitScore() {
    var c = getSelectedCase();
    if (!c) return;

    // Validate all criteria filled
    var keys = ['teinte','ajustage','esthetique','delai','communication'];
    for (var i = 0; i < keys.length; i++) {
      if (!pendingScore[keys[i]]) {
        showToast('Veuillez noter tous les criteres.', 'warning');
        return;
      }
    }

    var commentEl = document.getElementById('tri-score-comment');
    c.score = {
      teinte: pendingScore.teinte,
      ajustage: pendingScore.ajustage,
      esthetique: pendingScore.esthetique,
      delai: pendingScore.delai,
      communication: pendingScore.communication,
      commentaire: commentEl ? commentEl.value : ''
    };

    // Reset
    pendingScore = { teinte: 0, ajustage: 0, esthetique: 0, delai: 0, communication: 0 };
    renderLayout();
    showToast('Score enregistre avec succes.', 'success');
  }

  // ---------------------------------------------------------------------------
  // CREATE CASE
  // ---------------------------------------------------------------------------
  function createCase() {
    var patient = document.getElementById('tri-nc-patient');
    var laboId = document.getElementById('tri-nc-labo');
    var type = document.getElementById('tri-nc-type');
    var dent = document.getElementById('tri-nc-dent');
    var teinte = document.getElementById('tri-nc-teinte');
    var instructions = document.getElementById('tri-nc-instructions');
    var dateLiv = document.getElementById('tri-nc-date');

    if (!patient || !patient.value.trim()) {
      showToast('Veuillez saisir le nom du patient.', 'warning');
      return;
    }

    var labo = LABOS[0];
    if (laboId) {
      for (var i = 0; i < LABOS.length; i++) {
        if (LABOS[i].id === parseInt(laboId.value)) { labo = LABOS[i]; break; }
      }
    }

    var newId = 'CAS-2026-' + pad(CASES.length + 71);
    var now = new Date();
    var newCase = {
      id: newId,
      patient: patient.value.trim(),
      type: type ? type.value : 'Couronne',
      dent: dent ? dent.value : '--',
      teinte: teinte ? (teinte.value || 'N/A') : 'N/A',
      labo: labo,
      statut: 'ouvert',
      dateLivraisonPrevue: dateLiv && dateLiv.value ? new Date(dateLiv.value) : new Date(now.getTime() + 14 * 86400000),
      dateCreation: now,
      instructions: instructions ? instructions.value : '',
      timeline: [],
      score: null
    };

    CASES.unshift(newCase);
    state.selectedCaseId = newId;
    closeOverlay();
    renderLayout();
    showToast('Cas ' + newId + ' cree.', 'success');
  }

  // ---------------------------------------------------------------------------
  // SHADE SELECTOR
  // ---------------------------------------------------------------------------
  function selectShade(shade) {
    document.querySelectorAll('.tri-vita-chip').forEach(function(c) { c.classList.remove('selected'); });
    var el = document.querySelector('.tri-vita-chip[data-shade="' + shade + '"]');
    if (el) el.classList.add('selected');
    var input = document.getElementById('tri-nc-teinte');
    if (input) input.value = shade;
  }

  // ---------------------------------------------------------------------------
  // ACTION STUBS (would connect to real backend)
  // ---------------------------------------------------------------------------
  function actionSendPhoto() { showToast('Ouverture de la camera pour envoyer une photo au labo...', 'info'); }
  function actionSendPatient() { showToast('Envoi de photo au patient...', 'info'); }
  function actionRequestPhoto() { showToast('Demande de photo envoyee au labo.', 'success'); }
  function actionAnnotate() { showToast('Outil d\'annotation en cours de developpement.', 'info'); }

  // ---------------------------------------------------------------------------
  // TOAST
  // ---------------------------------------------------------------------------
  function showToast(msg, type) {
    var existing = document.getElementById('tri-toast');
    if (existing) existing.remove();

    var colors = { success: COLORS.green, warning: COLORS.orange, info: COLORS.blue, error: COLORS.red };
    var col = colors[type] || colors.info;
    var toast = document.createElement('div');
    toast.id = 'tri-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10001;background:var(--bg-card);border:1px solid ' + col + '44;border-left:4px solid ' + col + ';border-radius:var(--radius-md);padding:14px 20px;color:var(--text-primary);font-size:13px;font-family:var(--font-body);box-shadow:var(--shadow-lg);animation:triSlideIn .3s var(--ease-out-expo);max-width:360px;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity .3s';
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // REFRESH
  // ---------------------------------------------------------------------------
  function refreshTriangle() {
    var container = document.getElementById('tab-triangle');
    if (container) renderTriangle(container);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  window.JADOMI_TRI = {
    openLightbox: openLightbox,
    closeLightbox: closeLightbox,
    closeModal: closeOverlay,
    selectShade: selectShade,
    setScoreStar: setScoreStar,
    submitScore: submitScore,
    createCase: createCase,
    actionSendPhoto: actionSendPhoto,
    actionSendPatient: actionSendPatient,
    actionRequestPhoto: actionRequestPhoto,
    actionAnnotate: actionAnnotate
  };

  window.renderTriangle = renderTriangle;
  window.refreshTriangle = refreshTriangle;

})();
