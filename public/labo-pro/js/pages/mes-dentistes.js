/* ═══════════════════════════════════════════════
   JADOMI Labo — Page Mes Dentistes (liaisons)
   Demandes reçues + dentistes partenaires liés
   ═══════════════════════════════════════════════ */

const MesDentistesPage = (() => {
  let demandes = [];
  let dentistesLies = [];
  let loading = false;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function badgeStatut(statut) {
    var map = {
      'en_attente': '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:rgba(245,158,11,.15);color:#f59e0b;">En attente</span>',
      'acceptee': '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:rgba(34,197,94,.15);color:#22c55e;">Lié</span>',
      'refusee': '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:rgba(239,68,68,.15);color:#ef4444;">Refusée</span>',
      'resiliee': '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:rgba(255,255,255,.06);color:#8b8b9e;">Résiliée</span>'
    };
    return map[statut] || escapeHtml(statut);
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ── Chargement des données depuis l'API ── */
  async function loadData() {
    try {
      // Charger les demandes en attente
      var resDemandes = await LaboAPI.get('/liaison-dentiste/demandes');
      if (resDemandes && resDemandes.demandes) {
        demandes = resDemandes.demandes;
      }

      // Charger les dentistes liés (acceptés)
      var resLies = await LaboAPI.get('/liaison-dentiste/mes-dentistes');
      if (resLies && resLies.dentistes) {
        dentistesLies = resLies.dentistes;
      }
    } catch (e) {
      console.error('[mes-dentistes] Erreur chargement:', e);
    }
  }

  async function render(container) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#8b8b9e;">Chargement...</div>';
    await loadData();
    container.innerHTML = renderPage();
    bindEvents();
  }

  function renderPage() {
    var demandesHTML = demandes.length === 0
      ? '<div style="padding:24px;text-align:center;color:#55556a;font-size:14px;background:rgba(22,22,31,.65);border:1px solid rgba(255,255,255,.06);border-radius:12px;">Aucune demande en attente</div>'
      : demandes.map(renderDemande).join('');

    var dentistesHTML = dentistesLies.length === 0
      ? '<div style="padding:24px;text-align:center;color:#55556a;font-size:14px;background:rgba(22,22,31,.65);border:1px solid rgba(255,255,255,.06);border-radius:12px;">Aucun dentiste partenaire pour le moment</div>'
      : dentistesLies.map(renderDentisteLie).join('');

    return '<div style="padding:20px 16px 100px;">' +
      '<div style="margin-bottom:24px;">' +
        '<h1 style="font-family:\'Syne\',sans-serif;font-size:22px;font-weight:700;margin-bottom:4px;">Mes Dentistes</h1>' +
        '<p style="font-size:13px;color:#8b8b9e;">Demandes de liaison et cabinets partenaires</p>' +
      '</div>' +

      '<!-- KPI -->' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px;">' +
        '<div style="background:rgba(22,22,31,.65);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;">' +
          '<div style="font-size:12px;color:#8b8b9e;margin-bottom:6px;">Demandes</div>' +
          '<div style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:700;color:#f59e0b;">' + demandes.length + '</div>' +
          '<div style="font-size:11px;color:#55556a;margin-top:2px;">en attente</div>' +
        '</div>' +
        '<div style="background:rgba(22,22,31,.65);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;">' +
          '<div style="font-size:12px;color:#8b8b9e;margin-bottom:6px;">Dentistes liés</div>' +
          '<div style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:700;color:#2dd4bf;">' + dentistesLies.length + '</div>' +
          '<div style="font-size:11px;color:#55556a;margin-top:2px;">partenaires actifs</div>' +
        '</div>' +
        '<div style="background:rgba(22,22,31,.65);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;">' +
          '<div style="font-size:12px;color:#8b8b9e;margin-bottom:6px;">Cas en cours</div>' +
          '<div style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:700;color:#f0f0f5;">' + dentistesLies.reduce(function(s,d){return s+(d.cas_en_cours||0);},0) + '</div>' +
          '<div style="font-size:11px;color:#55556a;margin-top:2px;">tous dentistes</div>' +
        '</div>' +
      '</div>' +

      '<!-- Demandes en attente -->' +
      '<div style="margin-bottom:32px;">' +
        '<h2 style="font-family:\'Syne\',sans-serif;font-size:16px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
          'Demandes en attente' +
          '<span style="background:#1c1c28;font-size:12px;font-weight:600;padding:2px 10px;border-radius:9999px;color:#8b8b9e;">' + demandes.length + '</span>' +
        '</h2>' +
        demandesHTML +
      '</div>' +

      '<!-- Dentistes liés -->' +
      '<div>' +
        '<h2 style="font-family:\'Syne\',sans-serif;font-size:16px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
          'Dentistes partenaires' +
          '<span style="background:#1c1c28;font-size:12px;font-weight:600;padding:2px 10px;border-radius:9999px;color:#8b8b9e;">' + dentistesLies.length + '</span>' +
        '</h2>' +
        dentistesHTML +
      '</div>' +
    '</div>';
  }

  function renderDemande(d) {
    var cab = d.cabinet || {};
    return '<div style="display:flex;align-items:center;gap:16px;padding:16px;background:rgba(22,22,31,.65);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:10px;flex-wrap:wrap;backdrop-filter:blur(12px);transition:border-color .3s cubic-bezier(.16,1,.3,1);" onmouseenter="this.style.borderColor=\'rgba(255,255,255,.12)\'" onmouseleave="this.style.borderColor=\'rgba(255,255,255,.06)\'">' +
      '<div style="width:44px;height:44px;border-radius:10px;background:rgba(245,158,11,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;">' + escapeHtml(cab.nom_cabinet || 'Cabinet dentaire') + '</div>' +
        '<div style="font-size:12px;color:#8b8b9e;margin-top:2px;">' +
          (cab.ville ? escapeHtml(cab.ville) : '') +
          (cab.email ? ' &middot; ' + escapeHtml(cab.email) : '') +
        '</div>' +
        (d.message ? '<div style="font-size:12px;color:#55556a;margin-top:4px;font-style:italic;">"' + escapeHtml(d.message) + '"</div>' : '') +
        '<div style="font-size:11px;color:#55556a;margin-top:4px;">Reçue le ' + formatDate(d.created_at) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn-accept" data-id="' + escapeHtml(d.id) + '" style="padding:8px 16px;border-radius:8px;border:none;background:#0d9488;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s ease;">Accepter</button>' +
        '<button class="btn-refuse" data-id="' + escapeHtml(d.id) + '" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s ease;">Refuser</button>' +
      '</div>' +
    '</div>';
  }

  function renderDentisteLie(d) {
    var cab = d.cabinet || {};
    return '<div style="display:flex;align-items:center;gap:16px;padding:16px;background:rgba(22,22,31,.65);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:10px;flex-wrap:wrap;backdrop-filter:blur(12px);transition:border-color .3s cubic-bezier(.16,1,.3,1);" onmouseenter="this.style.borderColor=\'rgba(255,255,255,.12)\'" onmouseleave="this.style.borderColor=\'rgba(255,255,255,.06)\'">' +
      '<div style="width:44px;height:44px;border-radius:10px;background:rgba(13,148,136,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;">' + escapeHtml(cab.nom_cabinet || 'Cabinet dentaire') + '</div>' +
        '<div style="font-size:12px;color:#8b8b9e;margin-top:2px;">' +
          (cab.ville ? escapeHtml(cab.ville) : '') +
          (cab.telephone ? ' &middot; ' + escapeHtml(cab.telephone) : '') +
          (cab.email ? ' &middot; ' + escapeHtml(cab.email) : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="text-align:center;">' +
          '<div style="font-size:18px;font-weight:700;color:#2dd4bf;">' + (d.cas_en_cours || 0) + '</div>' +
          '<div style="font-size:11px;color:#55556a;">cas en cours</div>' +
        '</div>' +
        badgeStatut('acceptee') +
        '<button class="btn-resilier" data-id="' + escapeHtml(d.id) + '" style="padding:6px;border-radius:8px;border:1px solid rgba(239,68,68,.2);background:rgba(239,68,68,.08);color:#ef4444;cursor:pointer;" title="Résilier">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function bindEvents() {
    // Accept buttons — appel API réel
    document.querySelectorAll('.btn-accept').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = this.dataset.id;
        if (loading) return;
        loading = true;
        this.disabled = true;
        this.textContent = '...';
        try {
          var r = await LaboAPI.post('/liaison-dentiste/demandes/' + encodeURIComponent(id) + '/accepter');
          if (r && r.liaison) {
            // Succès : recharger les données
            var cont = document.getElementById('app-content');
            if (cont) await render(cont);
          } else if (r && r.error) {
            alert(r.error);
          }
        } catch (e) {
          console.error('[mes-dentistes] accepter:', e);
          alert('Erreur lors de l\'acceptation.');
        }
        loading = false;
      });
    });

    // Refuse buttons — appel API réel
    document.querySelectorAll('.btn-refuse').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = this.dataset.id;
        if (!confirm('Voulez-vous vraiment refuser cette demande ?')) return;
        if (loading) return;
        loading = true;
        this.disabled = true;
        this.textContent = '...';
        try {
          var r = await LaboAPI.post('/liaison-dentiste/demandes/' + encodeURIComponent(id) + '/refuser');
          if (r && r.liaison) {
            var cont = document.getElementById('app-content');
            if (cont) await render(cont);
          } else if (r && r.error) {
            alert(r.error);
          }
        } catch (e) {
          console.error('[mes-dentistes] refuser:', e);
          alert('Erreur lors du refus.');
        }
        loading = false;
      });
    });

    // Résilier buttons — appel API réel
    document.querySelectorAll('.btn-resilier').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = this.dataset.id;
        if (!confirm('Voulez-vous vraiment résilier cette liaison ?')) return;
        if (loading) return;
        loading = true;
        this.disabled = true;
        try {
          var r = await LaboAPI.del('/liaison-dentiste/' + encodeURIComponent(id));
          if (r && r.liaison) {
            var cont = document.getElementById('app-content');
            if (cont) await render(cont);
          } else if (r && r.error) {
            alert(r.error);
          }
        } catch (e) {
          console.error('[mes-dentistes] résilier:', e);
          alert('Erreur lors de la résiliation.');
        }
        loading = false;
      });
    });
  }

  return { render: render };
})();

// Register route
if (typeof Router !== 'undefined') {
  Router.register('/mes-dentistes', MesDentistesPage.render);
}
