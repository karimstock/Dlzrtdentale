/* ═══════════════════════════════════════════════
   JADOMI Patient — Mes cas prothétiques
   Le patient voit ses cas, envoie photos/vidéos,
   suit l'avancement de ses prothèses.
   ═══════════════════════════════════════════════ */

Router.register('/mes-cas', async (container) => {

  container.innerHTML = `
    <h2 class="section-title">Mes cas prothétiques</h2>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>`;

  var cases = [];

  try {
    var data = await JadomiAPI.get('/dentiste-pro/triangle/patient/my-photos');
    // Regrouper les photos par case_id
    var photosById = {};
    (data.photos || []).forEach(function(p) {
      if (p.case_id) {
        if (!photosById[p.case_id]) photosById[p.case_id] = [];
        photosById[p.case_id].push(p);
      }
    });

    // Essayer de charger les cas depuis l'API
    try {
      var casesData = await JadomiAPI.get('/patient/cases');
      cases = casesData.cases || [];
    } catch (e) {
      // Fallback : construire à partir des photos groupées
      Object.keys(photosById).forEach(function(caseId) {
        cases.push({
          id: caseId,
          reference: 'CAS-' + caseId.slice(0, 8).toUpperCase(),
          type: 'Travail prothétique',
          statut: 'en_cours',
          photos: photosById[caseId]
        });
      });
    }

    // Ajouter les photos aux cas
    cases.forEach(function(c) {
      if (!c.photos) c.photos = photosById[c.id] || [];
    });
  } catch (err) {
    cases = getDemoCases();
  }

  renderPage();

  function renderPage() {
    var enCours = cases.filter(function(c) { return c.statut !== 'termine' && c.statut !== 'annule'; });
    var termines = cases.filter(function(c) { return c.statut === 'termine'; });

    container.innerHTML = `
      <h2 class="section-title">Mes cas prothétiques</h2>

      ${enCours.length === 0 && termines.length === 0 ? `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;margin-bottom:12px;color:#52525b">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          <p>Aucun cas en cours</p>
          <p style="font-size:.8rem;color:#52525b;margin-top:6px;">Votre praticien créera un cas lorsqu'un travail prothétique sera planifié.</p>
        </div>
      ` : ''}

      ${enCours.length > 0 ? `
        <div class="sub-section-title" style="margin-bottom:12px;font-weight:600;color:#a1a1aa;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;">En cours (${enCours.length})</div>
        ${enCours.map(renderCaseCard).join('')}
      ` : ''}

      ${termines.length > 0 ? `
        <div class="sub-section-title" style="margin:24px 0 12px;font-weight:600;color:#52525b;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;">Terminés (${termines.length})</div>
        ${termines.map(renderCaseCard).join('')}
      ` : ''}

      <!-- Bouton envoi photo/vidéo -->
      ${enCours.length > 0 ? `
        <div style="position:fixed;bottom:80px;right:16px;z-index:50;">
          <button id="btn-send-media" style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0d9488,#115e59);color:#fff;border:none;box-shadow:0 4px 20px rgba(13,148,136,.4);display:flex;align-items:center;justify-content:center;cursor:pointer;" aria-label="Envoyer une photo ou vidéo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </button>
        </div>
      ` : ''}
    `;

    // Event : bouton envoyer photo
    var btnMedia = document.getElementById('btn-send-media');
    if (btnMedia) {
      btnMedia.addEventListener('click', function() {
        showMediaUpload(enCours);
      });
    }
  }

  function renderCaseCard(c) {
    var statusBadge = getStatusBadge(c.statut);
    var photoCount = (c.photos || []).length;
    var lastPhoto = (c.photos || [])[0];

    return `
      <div class="card" style="margin-bottom:12px;padding:16px;cursor:pointer;" onclick="showCaseDetail('${c.id}')">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div>
            <div style="font-weight:700;font-size:.95rem;color:#fafafa;">${c.titre || c.type || 'Cas prothétique'}</div>
            <div style="font-size:.75rem;color:#52525b;margin-top:2px;">${c.reference || ''} ${c.dent_numero ? '— Dent ' + c.dent_numero : ''}</div>
          </div>
          ${statusBadge}
        </div>
        ${c.teinte ? `<div style="font-size:.78rem;color:#71717a;">Teinte : ${c.teinte}</div>` : ''}
        ${photoCount > 0 ? `
          <div style="display:flex;gap:6px;margin-top:8px;overflow-x:auto;">
            ${(c.photos || []).slice(0, 4).map(function(p) {
              return '<img src="' + p.photo_url + '" style="width:52px;height:52px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,.06);" alt="Photo cas" />';
            }).join('')}
            ${photoCount > 4 ? '<div style="width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;font-size:.75rem;color:#71717a;">+' + (photoCount - 4) + '</div>' : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function getStatusBadge(statut) {
    var colors = {
      ouvert: { bg: 'rgba(59,130,246,.1)', color: '#60a5fa', label: 'Ouvert' },
      en_cours: { bg: 'rgba(245,158,11,.1)', color: '#fbbf24', label: 'En cours' },
      essayage: { bg: 'rgba(168,85,247,.1)', color: '#c084fc', label: 'Essayage' },
      modification: { bg: 'rgba(239,68,68,.1)', color: '#f87171', label: 'Modification' },
      termine: { bg: 'rgba(34,197,94,.1)', color: '#4ade80', label: 'Terminé' },
      annule: { bg: 'rgba(113,113,122,.1)', color: '#71717a', label: 'Annulé' }
    };
    var s = colors[statut] || colors.ouvert;
    return '<span style="font-size:.65rem;font-weight:600;padding:3px 8px;border-radius:6px;background:' + s.bg + ';color:' + s.color + ';">' + s.label + '</span>';
  }

  function showMediaUpload(enCours) {
    // Modal simple upload photo/vidéo
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:100;display:flex;align-items:flex-end;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#1a1a2e;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:400px;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-family:'Syne',sans-serif;font-size:1.1rem;color:#fafafa;">Envoyer à mon praticien</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;color:#71717a;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        ${enCours.length > 1 ? `
          <label style="font-size:.8rem;color:#a1a1aa;display:block;margin-bottom:8px;">Pour quel cas ?</label>
          <select id="media-case-select" style="width:100%;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fafafa;font-size:.85rem;margin-bottom:16px;">
            ${enCours.map(function(c) { return '<option value="' + c.id + '">' + (c.reference || '') + ' — ' + (c.type || 'Cas') + '</option>'; }).join('')}
          </select>
        ` : ''}

        <label style="font-size:.8rem;color:#a1a1aa;display:block;margin-bottom:8px;">Décrivez ce que vous souhaitez</label>
        <textarea id="media-description" placeholder="Ex: Voici le résultat que j'aimerais obtenir..." style="width:100%;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fafafa;font-size:.85rem;resize:vertical;min-height:60px;margin-bottom:16px;"></textarea>

        <div style="display:flex;gap:10px;">
          <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px;border-radius:12px;background:rgba(13,148,136,.08);border:1px solid rgba(13,148,136,.2);cursor:pointer;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span style="font-size:.75rem;color:#0d9488;font-weight:600;">Photo</span>
            <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleMediaUpload(this, 'image')" />
          </label>
          <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px;border-radius:12px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);cursor:pointer;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            <span style="font-size:.75rem;color:#6366f1;font-weight:600;">Vidéo</span>
            <input type="file" accept="video/*" capture="environment" style="display:none;" onchange="handleMediaUpload(this, 'video')" />
          </label>
          <label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px;border-radius:12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);cursor:pointer;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style="font-size:.75rem;color:#f59e0b;font-weight:600;">Galerie</span>
            <input type="file" accept="image/*,video/*" style="display:none;" onchange="handleMediaUpload(this, 'gallery')" />
          </label>
        </div>

        <p style="font-size:.7rem;color:#52525b;text-align:center;margin-top:12px;">Vos photos sont envoyées uniquement à votre praticien.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  }

  // Exposer globalement pour les handlers inline
  window.showCaseDetail = function(caseId) {
    var c = cases.find(function(x) { return x.id === caseId; });
    if (!c) return;
    // TODO: navigation vers détail cas
    alert('Détail du cas ' + (c.reference || c.id) + ' — à venir');
  };

  window.handleMediaUpload = async function(input, type) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var caseSelect = document.getElementById('media-case-select');
    var caseId = caseSelect ? caseSelect.value : (cases[0] ? cases[0].id : null);
    var desc = (document.getElementById('media-description') || {}).value || '';

    if (!caseId) { alert('Aucun cas sélectionné'); return; }

    var formData = new FormData();
    formData.append('photo', file);
    formData.append('photo_type', type === 'video' ? 'suivi' : 'question');
    formData.append('description', desc);
    formData.append('case_id', caseId);

    try {
      await JadomiAPI.upload('/dentiste-pro/triangle/patient/send-photo', formData);
      // Fermer la modal
      var overlay = input.closest('[style*="fixed"]');
      if (overlay) overlay.remove();
      // Recharger
      Router.navigate('/mes-cas');
    } catch (e) {
      alert('Erreur envoi : ' + (e.message || 'réessayez'));
    }
  };

  function getDemoCases() {
    return [
      { id: 'demo-1', reference: 'CAS-2026-0042', titre: 'Couronne céramique 15', type: 'couronne', dent_numero: '15', teinte: 'A2', statut: 'en_cours', photos: [] },
      { id: 'demo-2', reference: 'CAS-2026-0038', titre: 'Bridge 3 éléments 45-47', type: 'bridge', dent_numero: '45-47', teinte: 'B1', statut: 'ouvert', photos: [] },
      { id: 'demo-3', reference: 'CAS-2026-0031', titre: 'Facette 11', type: 'facette', dent_numero: '11', teinte: 'A1', statut: 'termine', photos: [] }
    ];
  }
});
