/* ═══════════════════════════════════════════════
   JADOMI Labo — Mes Cas (Case List)
   ═══════════════════════════════════════════════ */

/* ── Demo Data ──────────────────────────── */
const DEMO_CASES = [
  {
    id: 'cas-001',
    reference: 'CAS-2026-0042',
    titre: 'Couronne ceramique 15',
    type: 'Couronne',
    dent: '15',
    teinte: 'A2',
    teinteColor: '#e8d5a3',
    cabinet: 'Cabinet Dr. Lefebvre',
    dentiste: 'Dr. Sophie Lefebvre',
    statut: 'en-cours',
    statutLabel: 'En cours',
    dateLivraison: '2026-05-02',
    photoCount: 5,
    unread: 2,
    createdAt: '2026-04-20',
    instructions: 'Respecter la teinte A2 Vita. Legere saturation cervicale. Le patient est tres attentif a l\'esthetique. Profil d\'emergence naturel souhaite. Contact proximal mesial a verifier.',
    photos: [
      { id: 'p1', type: 'Clinique', source: 'cabinet', desc: 'Vue vestibulaire pre-operatoire', date: '2026-04-20' },
      { id: 'p2', type: 'Teinte', source: 'cabinet', desc: 'Prise de teinte A2 - lumiere naturelle', date: '2026-04-20' },
      { id: 'p3', type: 'Empreinte', source: 'cabinet', desc: 'Empreinte numerique Cerec', date: '2026-04-20' },
      { id: 'p4', type: 'Fabrication', source: 'labo', desc: 'Infrastructure zircone usinee', date: '2026-04-23' },
      { id: 'p5', type: 'Fabrication', source: 'labo', desc: 'Montage ceramique couche 1', date: '2026-04-24' },
    ],
    messages: [
      { id: 'm1', from: 'cabinet', text: 'Bonjour, merci de bien respecter la teinte A2. Le patient est exigeant sur l\'esthetique.', time: '2026-04-20 09:15' },
      { id: 'm2', from: 'labo', text: 'Bien note. J\'ai bien recu l\'empreinte numerique, le modele est parfait. Je commence la fabrication demain.', time: '2026-04-20 14:30' },
      { id: 'm3', from: 'cabinet', text: 'Parfait. N\'hesitez pas a m\'envoyer des photos du montage ceramique pour validation intermediaire.', time: '2026-04-20 15:00' },
      { id: 'm4', from: 'labo', text: 'Infrastructure zircone usinee, photo envoyee. Je commence le montage ceramique.', time: '2026-04-23 11:00' },
    ]
  },
  {
    id: 'cas-002',
    reference: 'CAS-2026-0039',
    titre: 'Bridge 3 elements 24-25-26',
    type: 'Bridge',
    dent: '24-25-26',
    teinte: 'B1',
    teinteColor: '#f0e6d0',
    cabinet: 'Cabinet Dr. Martin',
    dentiste: 'Dr. Alexandre Martin',
    statut: 'essayage',
    statutLabel: 'Essayage',
    dateLivraison: '2026-04-28',
    photoCount: 7,
    unread: 0,
    createdAt: '2026-04-14',
    instructions: 'Bridge zircone monolithique. Morphologie adaptee a la denture du patient. Contacts occlusaux equilibres. Piliers 24 et 26, pontique 25.',
    photos: [
      { id: 'p6', type: 'Clinique', source: 'cabinet', desc: 'Situation initiale panoramique', date: '2026-04-14' },
      { id: 'p7', type: 'Clinique', source: 'cabinet', desc: 'Preparations piliers 24 et 26', date: '2026-04-14' },
      { id: 'p8', type: 'Teinte', source: 'cabinet', desc: 'Prise de teinte B1 avec teintier', date: '2026-04-14' },
      { id: 'p9', type: 'Empreinte', source: 'cabinet', desc: 'Empreinte silicone double melange', date: '2026-04-14' },
      { id: 'p10', type: 'Fabrication', source: 'labo', desc: 'Modele de travail coule', date: '2026-04-17' },
      { id: 'p11', type: 'Fabrication', source: 'labo', desc: 'Bridge zircone avant glacage', date: '2026-04-21' },
      { id: 'p12', type: 'Essayage', source: 'labo', desc: 'Bridge pret pour essayage clinique', date: '2026-04-23' },
    ],
    messages: [
      { id: 'm5', from: 'cabinet', text: 'Le patient a un serrement nocturne, prevoir une epaisseur suffisante en occlusal.', time: '2026-04-14 10:00' },
      { id: 'm6', from: 'labo', text: 'Compris. Je prevois une epaisseur de 1.5mm minimum en zircone monolithique. Plus resistant pour le bruxisme.', time: '2026-04-14 16:00' },
      { id: 'm7', from: 'labo', text: 'Bridge termine et envoye pour essayage. Photos jointes.', time: '2026-04-23 09:30' },
      { id: 'm8', from: 'cabinet', text: 'Bien recu. Essayage prevu mercredi prochain. Je vous ferai un retour.', time: '2026-04-23 12:00' },
    ]
  },
  {
    id: 'cas-003',
    reference: 'CAS-2026-0045',
    titre: 'Facettes 11-12-21-22',
    type: 'Facettes',
    dent: '11-12-21-22',
    teinte: 'BL2',
    teinteColor: '#f5f0e8',
    cabinet: 'Cabinet Dr. Lefebvre',
    dentiste: 'Dr. Sophie Lefebvre',
    statut: 'en-attente',
    statutLabel: 'En attente',
    dateLivraison: '2026-05-10',
    photoCount: 3,
    unread: 1,
    createdAt: '2026-04-24',
    instructions: 'Facettes e.max. La patiente souhaite un eclaircissement naturel. Pas trop opaque. Transparence incisale conservee. Wax-up valide par la patiente.',
    photos: [
      { id: 'p13', type: 'Clinique', source: 'cabinet', desc: 'Sourire initial face', date: '2026-04-24' },
      { id: 'p14', type: 'Clinique', source: 'cabinet', desc: 'Vue rapprochee du bloc incisif', date: '2026-04-24' },
      { id: 'p15', type: 'Empreinte', source: 'cabinet', desc: 'Scan numerique avec wax-up digital', date: '2026-04-24' },
    ],
    messages: [
      { id: 'm9', from: 'cabinet', text: 'Cas esthetique important. Patiente tres motivee. Merci de soigner particulierement la transparence incisale et les etats de surface.', time: '2026-04-24 11:00' },
      { id: 'm10', from: 'cabinet', text: 'Je joins le wax-up digital valide. Pouvez-vous me confirmer la faisabilite ?', time: '2026-04-24 11:05' },
    ]
  },
  {
    id: 'cas-004',
    reference: 'CAS-2026-0035',
    titre: 'Inlay-core + Couronne 46',
    type: 'Inlay-core',
    dent: '46',
    teinte: 'A3',
    teinteColor: '#d4c49a',
    cabinet: 'Cabinet Dr. Dubois',
    dentiste: 'Dr. Pierre Dubois',
    statut: 'termine',
    statutLabel: 'Termine',
    dateLivraison: '2026-04-18',
    photoCount: 8,
    unread: 0,
    createdAt: '2026-04-08',
    instructions: 'Inlay-core coule CoCr + couronne ceramo-metallique. Dent 46 traitee endodontiquement. Bien verifier l\'adaptation cervicale et le profil d\'emergence.',
    photos: [
      { id: 'p16', type: 'Clinique', source: 'cabinet', desc: 'Dent 46 apres traitement endodontique', date: '2026-04-08' },
      { id: 'p17', type: 'Empreinte', source: 'cabinet', desc: 'Empreinte avec faux moignon', date: '2026-04-08' },
      { id: 'p18', type: 'Fabrication', source: 'labo', desc: 'Inlay-core coule CoCr', date: '2026-04-10' },
      { id: 'p19', type: 'Fabrication', source: 'labo', desc: 'Essayage inlay-core sur modele', date: '2026-04-10' },
      { id: 'p20', type: 'Fabrication', source: 'labo', desc: 'Infrastructure metallique couronne', date: '2026-04-12' },
      { id: 'p21', type: 'Fabrication', source: 'labo', desc: 'Montage ceramique finalise', date: '2026-04-15' },
      { id: 'p22', type: 'Produit fini', source: 'labo', desc: 'Couronne terminee - vue vestibulaire', date: '2026-04-17' },
      { id: 'p23', type: 'Produit fini', source: 'labo', desc: 'Couronne terminee - vue occlusale', date: '2026-04-17' },
    ],
    messages: [
      { id: 'm11', from: 'cabinet', text: 'Attention, la dent est assez delabre. L\'inlay-core doit avoir une bonne retention.', time: '2026-04-08 09:00' },
      { id: 'm12', from: 'labo', text: 'J\'ai prevu un tenon long de 10mm. L\'adaptation est excellente sur le modele.', time: '2026-04-10 14:00' },
      { id: 'm13', from: 'cabinet', text: 'Inlay-core pose avec succes. Parfaite adaptation. Merci !', time: '2026-04-14 16:00' },
      { id: 'm14', from: 'labo', text: 'Couronne terminee et envoyee. Bonne pose !', time: '2026-04-17 10:00' },
      { id: 'm15', from: 'cabinet', text: 'Couronne posee. Excellent travail, le patient est ravi. Merci !', time: '2026-04-18 17:00' },
    ]
  },
];

// Store globally for case-detail page
window.__DEMO_CASES = DEMO_CASES;

Router.register('/mes-cas', async (container) => {
  const labo = JSON.parse(localStorage.getItem('jadomi_labo') || '{}');

  // Count stats
  const enCours = DEMO_CASES.filter(c => c.statut === 'en-cours' || c.statut === 'en-attente').length;
  const essayage = DEMO_CASES.filter(c => c.statut === 'essayage').length;
  const termine = DEMO_CASES.filter(c => c.statut === 'termine').length;
  const totalUnread = DEMO_CASES.reduce((sum, c) => sum + c.unread, 0);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-md">
      <h1 class="section-title" style="margin-bottom:0">Mes Cas</h1>
      ${totalUnread > 0 ? `<span class="status-badge status-en-cours" style="font-size:12px">${totalUnread} non lu${totalUnread > 1 ? 's' : ''}</span>` : ''}
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card accent">
        <div class="stat-number">${enCours}</div>
        <div class="stat-label">En cours</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${essayage}</div>
        <div class="stat-label">Essayage</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${termine}</div>
        <div class="stat-label">Termines</div>
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="type-selector mt-md mb-md" id="filter-tabs">
      <button class="type-pill selected" data-filter="all">Tous</button>
      <button class="type-pill" data-filter="en-cours">En cours</button>
      <button class="type-pill" data-filter="essayage">Essayage</button>
      <button class="type-pill" data-filter="en-attente">En attente</button>
      <button class="type-pill" data-filter="termine">Termines</button>
    </div>

    <!-- Case list -->
    <div id="case-list"></div>
  `;

  let activeFilter = 'all';

  function renderCases(filter) {
    const listEl = container.querySelector('#case-list');
    const filtered = filter === 'all'
      ? DEMO_CASES
      : DEMO_CASES.filter(c => c.statut === filter);

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6M12 9v6"/>
            <rect x="3" y="3" width="18" height="18" rx="3"/>
          </svg>
          <h3>Aucun cas</h3>
          <p>Aucun cas ne correspond a ce filtre.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(c => `
      <div class="case-card ${c.unread > 0 ? 'has-unread' : ''}" data-id="${c.id}" role="button" tabindex="0" aria-label="Ouvrir le cas ${c.reference}">
        <div class="case-card-header">
          <div style="flex:1;min-width:0">
            <div class="case-card-ref">${c.reference}</div>
            <div class="case-card-title">${c.titre}</div>
            <div class="case-card-cabinet">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1"/>
                <rect x="5" y="3" width="14" height="18" rx="1"/>
              </svg>
              ${c.cabinet} — ${c.dentiste}
            </div>
          </div>
          <span class="status-badge status-${c.statut}">${c.statutLabel}</span>
        </div>
        <div class="case-card-meta">
          <span class="case-card-teinte">
            <span class="dot" style="background:${c.teinteColor}"></span>
            ${c.teinte}
          </span>
          <span class="case-card-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            ${formatDate(c.dateLivraison)}
          </span>
          <span class="case-card-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/>
            </svg>
            ${c.photoCount}
          </span>
          ${c.unread > 0 ? `
          <span class="case-card-meta-item" style="color:var(--accent-light);font-weight:600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            ${c.unread}
          </span>` : ''}
        </div>
      </div>
    `).join('');

    // Click handlers
    listEl.querySelectorAll('.case-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        Router.navigate('/cas/' + id);
      });
    });
  }

  // Filter tabs
  container.querySelector('#filter-tabs').addEventListener('click', (e) => {
    const pill = e.target.closest('.type-pill');
    if (!pill) return;
    container.querySelectorAll('#filter-tabs .type-pill').forEach(p => p.classList.remove('selected'));
    pill.classList.add('selected');
    activeFilter = pill.dataset.filter;
    renderCases(activeFilter);
  });

  renderCases(activeFilter);
});

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
