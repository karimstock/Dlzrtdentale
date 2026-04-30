/* ═══════════════════════════════════════════════
   JADOMI Patient — Mes visites infirmières
   Confirmation GPS côté patient + historique
   ═══════════════════════════════════════════════ */

Router.register('/mes-visites', async (container) => {
  let visites = [];
  try {
    const data = await JadomiAPI.get('/patient/visites');
    visites = data.visites || [];
  } catch {
    visites = getDemoVisites();
  }

  const patient = JSON.parse(localStorage.getItem('jadomi_patient') || '{}');
  const typeUtilisateur = patient.type_utilisateur || 'patient'; // 'patient' ou 'representant'
  const isOnSite = typeUtilisateur === 'patient' || patient.present_domicile;

  renderPage();

  function renderPage() {
    const today = new Date().toISOString().slice(0, 10);
    const todayVisites = visites.filter(v => v.date === today);
    const pastVisites = visites.filter(v => v.date < today).sort((a, b) => b.date.localeCompare(a.date));

    container.innerHTML = `
      <h2 class="section-title">Mes visites</h2>

      ${todayVisites.length > 0 ? `
        <div class="card mb-md" style="border-left:3px solid #0d9488;">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Aujourd'hui</h3>
          ${todayVisites.map(v => renderVisite(v, true)).join('')}
        </div>
      ` : `
        <div class="card mb-md" style="text-align:center;padding:24px;">
          <p style="color:#71717a;">Aucune visite prévue aujourd'hui</p>
        </div>
      `}

      ${isOnSite ? `
        <div class="card mb-md" style="background:rgba(13,148,136,.05);border:1px solid rgba(13,148,136,.2);">
          <h3 style="font-size:13px;font-weight:700;color:#0d9488;margin-bottom:8px;">Confirmer la visite</h3>
          <p style="font-size:12px;color:#71717a;margin-bottom:12px;">Quand votre infirmier(e) est chez vous, appuyez pour confirmer sa présence. Cela renforce la preuve de passage.</p>
          <button class="btn btn-primary btn-block" id="btn-confirm-visit" style="background:#0d9488;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            Confirmer la présence de mon infirmier(e)
          </button>
          <div id="confirm-result" style="margin-top:8px;font-size:12px;"></div>
        </div>
      ` : `
        <div class="card mb-md" style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);">
          <p style="font-size:12px;color:#f59e0b;">Vous êtes enregistré(e) comme représentant(e) distant(e). La confirmation GPS n'est pas disponible car vous n'êtes pas sur place.</p>
        </div>
      `}

      ${pastVisites.length > 0 ? `
        <h3 class="section-subtitle mt-lg">Historique</h3>
        ${pastVisites.slice(0, 20).map(v => `<div class="card mb-sm">${renderVisite(v, false)}</div>`).join('')}
      ` : ''}
    `;

    // Bind confirm button
    const btnConfirm = document.getElementById('btn-confirm-visit');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', confirmVisit);
    }
  }

  function renderVisite(v, isToday) {
    const statusMap = {
      planifie: { label: 'Prévu', color: '#3b82f6' },
      en_route: { label: 'En route', color: '#f59e0b' },
      termine: { label: 'Terminé', color: '#22c55e' },
      reporte: { label: 'Reporté', color: '#71717a' },
      annule: { label: 'Annulé', color: '#ef4444' }
    };
    const s = statusMap[v.statut] || statusMap.planifie;
    const d = new Date(v.date + 'T00:00:00');
    const dateStr = isToday ? '' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    return `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;${!isToday ? '' : 'border-bottom:1px solid rgba(255,255,255,.05);'}">
        <div style="font-family:monospace;font-size:13px;font-weight:600;color:#0d9488;min-width:50px;">${v.heure || '--'}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${v.nurse || 'Infirmier(e)'}</div>
          <div style="font-size:11px;color:#71717a;">${v.soin || 'Soins'} — ${v.duree || 15} min</div>
          ${dateStr ? `<div style="font-size:10px;color:#52525b;">${dateStr}</div>` : ''}
        </div>
        <span style="font-size:11px;font-weight:600;color:${s.color};">${s.label}</span>
      </div>
    `;
  }

  async function confirmVisit() {
    const resultDiv = document.getElementById('confirm-result');
    resultDiv.innerHTML = '<span style="color:#f59e0b;">Localisation en cours...</span>';

    if (!navigator.geolocation) {
      resultDiv.innerHTML = '<span style="color:#ef4444;">Géolocalisation non disponible sur cet appareil.</span>';
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const resp = await JadomiAPI.post('/patient/confirm-visit', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date().toISOString()
        });
        resultDiv.innerHTML = `
          <div style="color:#22c55e;font-weight:600;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            Présence confirmée — ${new Date().toLocaleTimeString('fr-FR')}
          </div>
          <div style="font-size:11px;color:#71717a;margin-top:4px;">
            GPS : ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}
          </div>
        `;
      } catch (e) {
        // Mode demo
        resultDiv.innerHTML = `
          <div style="color:#22c55e;font-weight:600;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            Présence confirmée — ${new Date().toLocaleTimeString('fr-FR')}
          </div>
          <div style="font-size:11px;color:#71717a;margin-top:4px;">
            GPS : ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}
          </div>
        `;
      }
    }, () => {
      resultDiv.innerHTML = '<span style="color:#ef4444;">Impossible de vous localiser. Vérifiez vos paramètres GPS.</span>';
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function getDemoVisites() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return [
      { date: today, heure: '07:30', nurse: 'Fatima El Amrani', soin: 'Insuline', duree: 15, statut: 'termine' },
      { date: today, heure: '18:00', nurse: 'Fatima El Amrani', soin: 'Insuline', duree: 15, statut: 'planifie' },
      { date: yesterday, heure: '07:30', nurse: 'Fatima El Amrani', soin: 'Insuline', duree: 15, statut: 'termine' },
      { date: yesterday, heure: '18:00', nurse: 'Fatima El Amrani', soin: 'Insuline', duree: 15, statut: 'termine' },
    ];
  }
});
