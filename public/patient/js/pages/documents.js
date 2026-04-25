/* ═══════════════════════════════════════════════
   JADOMI Patient — Documents
   ═══════════════════════════════════════════════ */

Router.register('/documents', async (container) => {
  container.innerHTML = `
    <h2 class="section-title">Mes documents</h2>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>`;

  let documents = [];

  try {
    const data = await JadomiAPI.get('/patient/documents');
    documents = data.documents || [];
  } catch {
    documents = [
      { id: '1', name: 'Devis couronne ceramique', type: 'devis', date: new Date(Date.now() - 5 * 86400000).toISOString(), size: '245 Ko' },
      { id: '2', name: 'Radio panoramique', type: 'radio', date: new Date(Date.now() - 30 * 86400000).toISOString(), size: '1.2 Mo' },
      { id: '3', name: 'Ordonnance antibiotiques', type: 'ordonnance', date: new Date(Date.now() - 45 * 86400000).toISOString(), size: '89 Ko' },
    ];
  }

  const typeIcons = {
    devis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h6"/></svg>',
    radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M3 9h18"/></svg>',
    ordonnance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 11v6M9 14h6"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
  };

  if (documents.length === 0) {
    container.innerHTML = `
      <h2 class="section-title">Mes documents</h2>
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
        </svg>
        <h3>Aucun document</h3>
        <p>Vos documents (devis, radios, ordonnances) apparaitront ici.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <h2 class="section-title">Mes documents</h2>
    <div class="flex flex-col gap-sm">
      ${documents.map((doc) => {
        const d = new Date(doc.date);
        const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        const icon = typeIcons[doc.type] || typeIcons.default;
        return `
          <div class="card flex items-center gap-md" data-id="${doc.id}" style="cursor:pointer">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent-light);">
              ${icon}
            </div>
            <div style="flex:1;min-width:0;">
              <div class="fw-600" style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${doc.name}</div>
              <div class="text-xs text-muted">${dateStr} &middot; ${doc.size || ''}</div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </div>`;
      }).join('')}
    </div>`;

  // Download handlers
  container.querySelectorAll('.card[data-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      // In production: window.open(JadomiAPI download URL)
      showError(document.body, 'Telechargement en cours...');
    });
  });
});
