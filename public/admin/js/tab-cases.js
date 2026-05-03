/**
 * JADOMI PRO — Mes Cas Prothétiques (tab-cases.js)
 * Passe 71 — Liste des cas, création, détail, transitions de statut
 * Branchée sur /api/dentiste-pro/cases et /api/dentiste-pro/patients
 */
(function () {
  'use strict';

  window.JADOMI_PRO = window.JADOMI_PRO || {};

  // ── Helpers ──
  function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function getHeaders() {
    var token = localStorage.getItem('supabase_token') || localStorage.getItem('sb-access-token') || '';
    var societeId = localStorage.getItem('selectedSocieteId') || '';
    return {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-Societe-Id': societeId
    };
  }

  async function apiGet(path) {
    var r = await fetch('/api/dentiste-pro' + path, { headers: getHeaders() });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  async function apiPost(path, body) {
    var r = await fetch('/api/dentiste-pro' + path, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    if (!r.ok) { var e = await r.json().catch(function () { return {}; }); throw new Error(e.error || 'Erreur ' + r.status); }
    return r.json();
  }

  async function apiPatch(path, body) {
    var r = await fetch('/api/dentiste-pro' + path, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  var STATUS_LABELS = {
    ouvert: { label: 'Ouvert', color: '#60a5fa', bg: 'rgba(59,130,246,.1)' },
    en_cours: { label: 'En cours', color: '#fbbf24', bg: 'rgba(245,158,11,.1)' },
    essayage: { label: 'Essayage', color: '#c084fc', bg: 'rgba(168,85,247,.1)' },
    modification: { label: 'Modification', color: '#f87171', bg: 'rgba(239,68,68,.1)' },
    termine: { label: 'Terminé', color: '#4ade80', bg: 'rgba(34,197,94,.1)' },
    annule: { label: 'Annulé', color: '#71717a', bg: 'rgba(113,113,122,.1)' }
  };

  function statusBadge(s) {
    var st = STATUS_LABELS[s] || STATUS_LABELS.ouvert;
    return '<span style="font-size:.65rem;font-weight:600;padding:3px 8px;border-radius:6px;background:' + st.bg + ';color:' + st.color + ';">' + st.label + '</span>';
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
  }

  // ── State ──
  var cases = [];
  var patients = [];
  var filterStatus = '';
  var container;

  // ── Init ──
  JADOMI_PRO.initCases = async function (el) {
    container = el;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">Chargement des cas...</div>';

    try {
      var data = await apiGet('/cases?limit=100');
      cases = data.cases || [];
    } catch (e) {
      cases = getDemoCases();
    }

    render();
  };

  // ── Render ──
  function render() {
    var filtered = cases;
    if (filterStatus) filtered = cases.filter(function (c) { return c.statut === filterStatus; });

    var enCours = filtered.filter(function (c) { return c.statut !== 'termine' && c.statut !== 'annule'; });
    var termines = filtered.filter(function (c) { return c.statut === 'termine' || c.statut === 'annule'; });

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <h2 style="font-family:var(--font-display);font-size:1.3rem;">Mes cas prothétiques</h2>
        <button onclick="JADOMI_PRO.showNewCaseModal()" style="display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--radius-md);background:linear-gradient(135deg,var(--teal-600),var(--teal-700));color:#fff;font-weight:600;font-size:.85rem;transition:transform .2s var(--ease-out-expo);">
          + Nouveau cas
        </button>
      </div>

      <!-- Filtres statut -->
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
        <button onclick="JADOMI_PRO.filterCases('')" style="padding:6px 12px;border-radius:var(--radius-full);font-size:.75rem;font-weight:600;border:1px solid ${!filterStatus ? 'var(--accent)' : 'var(--border-subtle)'};background:${!filterStatus ? 'var(--accent-glow)' : 'transparent'};color:${!filterStatus ? 'var(--accent-light)' : 'var(--text-tertiary)'};">Tous (${cases.length})</button>
        ${Object.keys(STATUS_LABELS).map(function (s) {
          var count = cases.filter(function (c) { return c.statut === s; }).length;
          if (count === 0) return '';
          var active = filterStatus === s;
          return '<button onclick="JADOMI_PRO.filterCases(\'' + s + '\')" style="padding:6px 12px;border-radius:var(--radius-full);font-size:.75rem;font-weight:600;border:1px solid ' + (active ? STATUS_LABELS[s].color : 'var(--border-subtle)') + ';background:' + (active ? STATUS_LABELS[s].bg : 'transparent') + ';color:' + (active ? STATUS_LABELS[s].color : 'var(--text-tertiary)') + ';">' + STATUS_LABELS[s].label + ' (' + count + ')</button>';
        }).join('')}
      </div>

      <!-- Liste des cas -->
      ${enCours.length === 0 && termines.length === 0 ? `
        <div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;display:block;opacity:.4;"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <p>Aucun cas prothétique</p>
          <p style="font-size:.82rem;margin-top:6px;">Créez votre premier cas pour commencer.</p>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${enCours.map(renderCaseRow).join('')}
          ${termines.length > 0 ? '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);"><div style="font-size:.75rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Terminés / Annulés</div>' + termines.map(renderCaseRow).join('') + '</div>' : ''}
        </div>
      `}
    `;
  }

  function renderCaseRow(c) {
    var pat = c.patient || {};
    var labo = c.labo || {};
    return `
      <div onclick="JADOMI_PRO.openCaseDetail('${c.id}')" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);cursor:pointer;transition:border-color .2s var(--ease-out-expo),transform .2s var(--ease-out-expo);" onmouseover="this.style.borderColor='var(--border-default)';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='var(--border-subtle)';this.style.transform='none'">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-weight:600;font-size:.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.titre || c.type || 'Cas')}</span>
            ${statusBadge(c.statut)}
          </div>
          <div style="font-size:.78rem;color:var(--text-tertiary);display:flex;gap:12px;flex-wrap:wrap;">
            <span>${esc(c.reference || '')}</span>
            ${pat.nom ? '<span>' + esc(pat.prenom || '') + ' ' + esc(pat.nom) + (pat.pat_id ? ' <span style="color:var(--text-tertiary);opacity:.6;">(' + esc(pat.pat_id) + ')</span>' : '') + '</span>' : ''}
            ${c.dent_numero ? '<span>Dent ' + esc(c.dent_numero) + '</span>' : ''}
            ${labo.nom ? '<span>Labo: ' + esc(labo.nom) + '</span>' : ''}
            <span>${formatDate(c.created_at)}</span>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;
  }

  // ── Filter ──
  JADOMI_PRO.filterCases = function (s) {
    filterStatus = s;
    render();
  };

  // ── Case detail ──
  JADOMI_PRO.openCaseDetail = async function (caseId) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">Chargement...</div>';

    try {
      var data = await apiGet('/cases/' + caseId);
      var c = data.case || {};
      var photos = data.photos || [];
      var events = data.events || [];
      var pat = c.patient || {};
      var labo = c.labo || {};

      container.innerHTML = `
        <div style="margin-bottom:16px;">
          <button onclick="JADOMI_PRO.initCases(document.getElementById('tab-cases'))" style="display:flex;align-items:center;gap:4px;color:var(--text-secondary);font-size:.85rem;padding:6px 0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Retour aux cas
          </button>
        </div>

        <!-- Header cas -->
        <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
            <div>
              <h2 style="font-family:var(--font-display);font-size:1.2rem;margin-bottom:4px;">${esc(c.titre || c.type || 'Cas prothétique')}</h2>
              <div style="font-size:.82rem;color:var(--text-tertiary);display:flex;gap:8px;align-items:center;">
                <span style="font-weight:600;cursor:pointer;" onclick="navigator.clipboard.writeText('${esc(c.reference || '')}').then(function(){alert('Copié: ${esc(c.reference || '')}')})" title="Cliquer pour copier">${esc(c.reference || '')}</span>
                ${statusBadge(c.statut)}
              </div>
            </div>
            <!-- Actions statut -->
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${c.statut === 'ouvert' ? '<button onclick="JADOMI_PRO.caseAction(\'' + c.id + '\',\'send-to-lab\')" style="padding:6px 14px;border-radius:var(--radius-sm);background:var(--accent-glow);border:1px solid var(--accent);color:var(--accent-light);font-size:.75rem;font-weight:600;">Envoyer au labo</button>' : ''}
              ${(c.statut === 'en_cours' || c.statut === 'essayage') ? '<button onclick="JADOMI_PRO.caseAction(\'' + c.id + '\',\'mark-delivered\')" style="padding:6px 14px;border-radius:var(--radius-sm);background:rgba(34,197,94,.1);border:1px solid #22c55e;color:#4ade80;font-size:.75rem;font-weight:600;">Marquer livré</button>' : ''}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
            ${pat.nom ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Patient</div><div style="font-size:.9rem;font-weight:600;">' + esc(pat.prenom || '') + ' ' + esc(pat.nom) + '</div><div style="font-size:.72rem;color:var(--text-tertiary);">' + esc(pat.pat_id || '') + '</div></div>' : ''}
            ${c.dent_numero ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Dent</div><div style="font-size:.9rem;font-weight:600;">' + esc(c.dent_numero) + '</div></div>' : ''}
            ${c.teinte ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Teinte</div><div style="font-size:.9rem;font-weight:600;">' + esc(c.teinte) + '</div></div>' : ''}
            ${c.type ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Type</div><div style="font-size:.9rem;font-weight:600;">' + esc(c.type) + '</div></div>' : ''}
            ${labo.nom ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Laboratoire</div><div style="font-size:.9rem;font-weight:600;">' + esc(labo.nom) + '</div><div style="font-size:.72rem;color:var(--text-tertiary);">' + esc(labo.ville || '') + '</div></div>' : ''}
            ${c.date_livraison_prevue ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Livraison prévue</div><div style="font-size:.9rem;font-weight:600;">' + formatDate(c.date_livraison_prevue) + '</div></div>' : ''}
            ${c.stl_transmission_method ? '<div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.65rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;">Empreinte</div><div style="font-size:.9rem;font-weight:600;">' + esc(c.stl_transmission_method.replace(/_/g, ' ')) + '</div><div style="font-size:.72rem;color:var(--text-tertiary);">' + esc(c.stl_transmission_reference || '') + '</div></div>' : ''}
          </div>

          ${c.instructions ? '<div style="margin-top:14px;padding:12px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="font-size:.7rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Instructions</div><p style="font-size:.85rem;color:var(--text-secondary);line-height:1.65;margin:0;">' + esc(c.instructions) + '</p></div>' : ''}
        </div>

        <!-- Photos -->
        <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <h3 style="font-size:.95rem;">Photos du cas (${photos.length})</h3>
            <label style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--radius-sm);background:var(--accent-glow);border:1px solid var(--accent);color:var(--accent-light);font-size:.75rem;font-weight:600;cursor:pointer;">
              + Ajouter
              <input type="file" accept="image/*,video/*" multiple style="display:none;" onchange="JADOMI_PRO.uploadCaseMedia('${c.id}', this.files)" />
            </label>
          </div>
          ${photos.length === 0 ? '<p style="text-align:center;color:var(--text-tertiary);font-size:.85rem;padding:20px;">Aucune photo pour ce cas</p>' : `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
              ${photos.map(function (p) {
                return '<div style="position:relative;aspect-ratio:1;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open(\'' + esc(p.photo_url) + '\',\'_blank\')">' +
                  '<img src="' + esc(p.thumbnail_url || p.photo_url) + '" style="width:100%;height:100%;object-fit:cover;" alt="" />' +
                  '<div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(transparent,rgba(0,0,0,.7));font-size:.6rem;color:#a1a1aa;">' + esc(p.photo_type || '') + ' &middot; ' + esc(p.sender_type || '') + '</div>' +
                  '</div>';
              }).join('')}
            </div>
          `}
        </div>

        <!-- Historique événements -->
        <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;">
          <h3 style="font-size:.95rem;margin-bottom:14px;">Historique (${events.length})</h3>
          ${events.length === 0 ? '<p style="text-align:center;color:var(--text-tertiary);font-size:.85rem;">Aucun événement</p>' : `
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${events.map(function (ev) {
                var labels = { created: 'Cas créé', photo_uploaded: 'Photo ajoutée', sent_to_lab: 'Envoyé au labo', production_started: 'Production démarrée', delivered: 'Livré', validated: 'Validé', closed: 'Clôturé', note_added: 'Note ajoutée', status_changed: 'Statut modifié' };
                var label = labels[ev.event_type] || ev.event_type;
                var actorLabel = { dentist: 'Praticien', patient: 'Patient', lab: 'Labo', system: 'Système' };
                return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-secondary);"><div style="width:6px;height:6px;border-radius:50%;background:var(--accent);flex-shrink:0;"></div><span style="font-size:.8rem;flex:1;">' + label + '</span><span style="font-size:.7rem;color:var(--text-tertiary);">' + (actorLabel[ev.actor_type] || '') + '</span><span style="font-size:.7rem;color:var(--text-tertiary);">' + formatDate(ev.created_at) + '</span></div>';
              }).join('')}
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--error);">Erreur chargement cas : ' + esc(e.message) + '</div>';
    }
  };

  // ── Case actions ──
  JADOMI_PRO.caseAction = async function (caseId, action) {
    try {
      await apiPost('/cases/' + caseId + '/' + action, {});
      JADOMI_PRO.openCaseDetail(caseId);
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  };

  // ── Upload media ──
  JADOMI_PRO.uploadCaseMedia = async function (caseId, files) {
    for (var i = 0; i < files.length; i++) {
      var formData = new FormData();
      formData.append('media', files[i]);
      formData.append('photo_type', 'clinique');
      formData.append('recipient_type', 'labo');

      var token = localStorage.getItem('supabase_token') || localStorage.getItem('sb-access-token') || '';
      var societeId = localStorage.getItem('selectedSocieteId') || '';

      await fetch('/api/dentiste-pro/cases/' + caseId + '/media', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'X-Societe-Id': societeId },
        body: formData
      });
    }
    JADOMI_PRO.openCaseDetail(caseId);
  };

  // ── New case modal ──
  JADOMI_PRO.showNewCaseModal = async function () {
    // Charger patients pour autocomplete
    var patientsList = [];
    try {
      var d = await apiGet('/patients?limit=200');
      patientsList = d.patients || [];
    } catch (e) { /* fallback vide */ }

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-overlay);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-xl);padding:28px;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="font-family:var(--font-display);font-size:1.1rem;">Nouveau cas prothétique</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="color:var(--text-tertiary);font-size:1.2rem;">&times;</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Patient *</label>
            <select id="nc-patient" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;">
              <option value="">Sélectionner un patient...</option>
              ${patientsList.map(function (p) { return '<option value="' + p.id + '">' + esc(p.prenom || '') + ' ' + esc(p.nom) + (p.pat_id ? ' (' + esc(p.pat_id) + ')' : '') + '</option>'; }).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Type de travail *</label>
            <select id="nc-type" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;">
              <option value="couronne">Couronne</option>
              <option value="bridge">Bridge</option>
              <option value="facette">Facette</option>
              <option value="implant">Implant</option>
              <option value="prothese">Prothèse amovible</option>
              <option value="gouttiere">Gouttière</option>
              <option value="inlay_onlay">Inlay/Onlay</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Dent (notation FDI)</label>
              <input id="nc-dent" placeholder="Ex: 15, 45-47" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;" />
            </div>
            <div>
              <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Teinte VITA</label>
              <input id="nc-teinte" placeholder="Ex: A2, B1" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;" />
            </div>
          </div>
          <div>
            <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Instructions pour le labo</label>
            <textarea id="nc-instructions" rows="3" placeholder="Instructions particulières..." style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;resize:vertical;"></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Transmission empreinte</label>
              <select id="nc-stl" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;">
                <option value="">Non applicable</option>
                <option value="medit_link">Medit Link</option>
                <option value="3shape_communicate">3Shape Communicate</option>
                <option value="myitero">MyiTero</option>
                <option value="primescan">Primescan</option>
                <option value="silicone">Empreinte silicone</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Référence transmission</label>
              <input id="nc-stl-ref" placeholder="Ex: ML-2026-4829" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:.85rem;" />
            </div>
          </div>
          <button id="nc-submit" onclick="JADOMI_PRO.submitNewCase()" style="width:100%;padding:12px;border-radius:var(--radius-md);background:linear-gradient(135deg,var(--teal-600),var(--teal-700));color:#fff;font-weight:700;font-size:.9rem;margin-top:8px;">
            Créer le cas
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  };

  // ── Submit new case ──
  JADOMI_PRO.submitNewCase = async function () {
    var btn = document.getElementById('nc-submit');
    var patient_id = document.getElementById('nc-patient').value;
    if (!patient_id) { alert('Veuillez sélectionner un patient'); return; }

    btn.textContent = 'Création en cours...';
    btn.disabled = true;

    try {
      await apiPost('/cases', {
        patient_id: patient_id,
        type: document.getElementById('nc-type').value,
        dent_numero: document.getElementById('nc-dent').value || null,
        teinte: document.getElementById('nc-teinte').value || null,
        instructions: document.getElementById('nc-instructions').value || null,
        stl_transmission_method: document.getElementById('nc-stl').value || null,
        stl_transmission_reference: document.getElementById('nc-stl-ref').value || null
      });

      // Fermer modal, recharger
      document.querySelector('[style*="fixed"][style*="z-index:1000"]').remove();
      JADOMI_PRO.initCases(container);
    } catch (e) {
      alert('Erreur : ' + e.message);
      btn.textContent = 'Créer le cas';
      btn.disabled = false;
    }
  };

  // ── Switch tab handler ──
  var origSwitch = window.switchTab;
  window.switchTab = function (tab) {
    if (typeof origSwitch === 'function') origSwitch(tab);
    if (tab === 'cases') {
      JADOMI_PRO.initCases(document.getElementById('tab-cases'));
    }
  };

  // ── Demo data ──
  function getDemoCases() {
    return [
      { id: 'demo-1', reference: 'CAS-2026-0042', titre: 'Couronne céramique 15', type: 'couronne', dent_numero: '15', teinte: 'A2', statut: 'en_cours', created_at: '2026-04-28', patient: { nom: 'Martin', prenom: 'Jean', pat_id: 'PAT-000012' }, labo: { nom: 'Labo Precision', ville: 'Lille' } },
      { id: 'demo-2', reference: 'CAS-2026-0041', titre: 'Bridge 3 éléments 45-47', type: 'bridge', dent_numero: '45-47', teinte: 'B1', statut: 'ouvert', created_at: '2026-04-27', patient: { nom: 'Dupont', prenom: 'Marie', pat_id: 'PAT-000008' }, labo: null },
      { id: 'demo-3', reference: 'CAS-2026-0038', titre: 'Facette 11-21', type: 'facette', dent_numero: '11-21', teinte: 'A1', statut: 'termine', created_at: '2026-04-20', patient: { nom: 'Leroy', prenom: 'Antoine', pat_id: 'PAT-000003' }, labo: { nom: 'Labo Artdent', ville: 'Roubaix' } }
    ];
  }

})();
