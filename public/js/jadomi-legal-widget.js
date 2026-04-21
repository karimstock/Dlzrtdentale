/* ==============================================================
 * JADOMI — Widget "Conseil juridique"
 * Icone discrete dans le header, modal par-dessus la page.
 * Inclure sur toutes les pages dashboard :
 * <script src="/public/js/jadomi-legal-widget.js" defer></script>
 * ============================================================== */
(function() {
  const API = '/api/juridique/public';
  const DOMAINES = [
    { id: 'droit_travail', label: 'Droit du travail', icon: '\u{1F454}', desc: 'Licenciement, contrat, litige' },
    { id: 'droit_immobilier', label: 'Droit immobilier', icon: '\u{1F3E0}', desc: 'Loyer, bail, SCI, litige locataire' },
    { id: 'droit_societes', label: 'Droit des soci\u00e9t\u00e9s', icon: '\u{1F4BC}', desc: 'Cr\u00e9ation, dissolution, associ\u00e9s' },
    { id: 'droit_famille', label: 'Droit de la famille', icon: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', desc: 'Divorce, garde, pension' },
    { id: 'droit_commercial', label: 'Droit commercial', icon: '\u{1F4CB}', desc: 'Contrat, impay\u00e9, concurrence' },
    { id: 'droit_routier', label: 'Droit routier', icon: '\u{1F697}', desc: 'Amende, permis, accident' },
    { id: 'droit_fiscal', label: 'Droit fiscal', icon: '\u{1F4B0}', desc: 'Imp\u00f4ts, TVA, redressement' },
    { id: 'droit_sante', label: 'Droit de la sant\u00e9', icon: '\u{1F3E5}', desc: 'Responsabilit\u00e9 m\u00e9dicale, ARS' },
    { id: 'droit_penal', label: 'Droit p\u00e9nal', icon: '\u2696\uFE0F', desc: 'D\u00e9fense p\u00e9nale, plainte' },
    { id: 'autre', label: 'Autre domaine', icon: '\u{1F4DD}', desc: '' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function injectStyles() {
    if (document.getElementById('jlw-styles')) return;
    const s = document.createElement('style');
    s.id = 'jlw-styles';
    s.textContent = `
      .jlw-trigger{display:none;}

      .jlw-header-btn{position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:none;border:1px solid transparent;border-radius:8px;color:var(--muted,#8f8a82);font-size:18px;cursor:pointer;transition:all .15s;padding:0;line-height:1;}
      .jlw-header-btn:hover{background:var(--surface2,#242220);border-color:var(--border,#2e2c29);color:var(--text,#f0ede8);}
      .jlw-header-btn[data-tooltip]:hover::after{content:attr(data-tooltip);position:absolute;top:calc(100% + 6px);right:0;background:var(--surface,#1a1917);border:1px solid var(--border,#2e2c29);color:var(--text,#f0ede8);font-size:11px;font-weight:500;padding:4px 10px;border-radius:6px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:100;}

      .jlw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px);}
      .jlw-overlay.open{display:flex;}
      .jlw-modal{background:var(--surface,#1a1917);border:1px solid var(--border,#2e2c29);border-radius:20px;width:520px;max-width:calc(100vw - 32px);max-height:calc(100vh - 64px);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5);}
      .jlw-header{padding:20px 24px;border-bottom:1px solid var(--border,#2e2c29);display:flex;justify-content:space-between;align-items:center;}
      .jlw-header h2{font-size:18px;color:var(--text,#f0ede8);margin:0;}
      .jlw-close{background:none;border:none;color:var(--muted,#8f8a82);font-size:20px;cursor:pointer;padding:4px 8px;}
      .jlw-close:hover{color:var(--text,#f0ede8);}
      .jlw-suggested{padding:8px 24px;font-size:11px;color:var(--accent,#10b981);text-transform:uppercase;letter-spacing:.5px;font-weight:700;}

      .jlw-domaines{padding:8px 12px;}
      .jlw-domaine{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;cursor:pointer;color:var(--text,#f0ede8);transition:all .15s;}
      .jlw-domaine:hover{background:var(--surface2,#242220);}
      .jlw-domaine .ico{font-size:22px;width:36px;text-align:center;}
      .jlw-domaine .info{flex:1;}
      .jlw-domaine .info .name{font-weight:600;font-size:14px;}
      .jlw-domaine .info .desc{font-size:12px;color:var(--muted,#8f8a82);}
      .jlw-domaine .badge{background:var(--surface2,#242220);padding:2px 8px;border-radius:10px;font-size:11px;color:var(--muted,#8f8a82);}

      .jlw-results{padding:12px;}
      .jlw-back{display:flex;align-items:center;gap:6px;padding:8px 12px;color:var(--accent,#10b981);font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;margin-bottom:8px;}
      .jlw-back:hover{text-decoration:underline;}
      .jlw-result-title{padding:4px 12px;font-size:14px;font-weight:600;color:var(--text,#f0ede8);margin-bottom:8px;}

      .jlw-pro{display:flex;align-items:center;gap:12px;padding:14px;background:var(--surface2,#242220);border-radius:14px;margin-bottom:8px;transition:all .15s;}
      .jlw-pro:hover{border-color:var(--accent,#10b981);box-shadow:0 2px 12px rgba(16,185,129,.1);}
      .jlw-pro .avatar{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#1e40af,#3b82f6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0;}
      .jlw-pro .avatar img{width:48px;height:48px;border-radius:12px;object-fit:cover;}
      .jlw-pro .info{flex:1;min-width:0;}
      .jlw-pro .info .top{display:flex;align-items:center;gap:6px;}
      .jlw-pro .info .stars{color:#f59e0b;font-size:12px;}
      .jlw-pro .info .name{font-weight:600;font-size:14px;color:var(--text,#f0ede8);}
      .jlw-pro .info .meta{font-size:12px;color:var(--muted,#8f8a82);margin-top:2px;}
      .jlw-pro .price{text-align:right;}
      .jlw-pro .price .amount{font-size:18px;font-weight:800;color:var(--text,#f0ede8);}
      .jlw-pro .price .label{font-size:11px;color:var(--muted,#8f8a82);}
      .jlw-pro .book-btn{padding:8px 16px;background:var(--accent,#10b981);color:#111;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;}
      .jlw-pro .book-btn:hover{opacity:.9;}

      .jlw-empty{padding:24px;text-align:center;color:var(--muted,#8f8a82);font-size:13px;}
      .jlw-all{display:block;text-align:center;padding:12px;color:var(--accent,#10b981);font-size:13px;font-weight:600;text-decoration:none;border-top:1px solid var(--border,#2e2c29);}
      .jlw-all:hover{text-decoration:underline;}
      .jlw-loading{padding:24px;text-align:center;color:var(--muted,#8f8a82);}
    `;
    document.head.appendChild(s);
  }

  function getSocieteType() {
    const ms = window.jadomiMS;
    return ms?.active?.type || '';
  }

  function buildWidget() {
    // Hidden trigger kept for backward compat
    const trigger = document.createElement('button');
    trigger.className = 'jlw-trigger';
    trigger.innerHTML = '<span class="ico">\u2696\uFE0F</span> Conseil juridique';
    document.body.appendChild(trigger);

    // Modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'jlw-overlay';
    overlay.innerHTML = `
      <div class="jlw-modal">
        <div class="jlw-header">
          <h2>\u2696\uFE0F Besoin d\u2019un conseil juridique ?</h2>
          <button class="jlw-close" onclick="this.closest('.jlw-overlay').classList.remove('open')">\u2715</button>
        </div>
        <div id="jlw-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    trigger.onclick = () => {
      overlay.classList.add('open');
      showDomaines();
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    // Insert icon button in topbar header
    insertHeaderButton(overlay);
  }

  function insertHeaderButton(overlay) {
    const container = document.getElementById('topbar-icons')
      || document.querySelector('.topbar-icons')
      || document.querySelector('.topbar-right')
      || document.querySelector('.topbar');
    if (!container) return;

    const btn = document.createElement('button');
    btn.className = 'jlw-header-btn';
    btn.setAttribute('data-tooltip', 'Conseil juridique');
    btn.innerHTML = '\u2696\uFE0F';
    btn.onclick = () => {
      overlay.classList.add('open');
      showDomaines();
    };

    container.appendChild(btn);
  }

  async function showDomaines() {
    const content = document.getElementById('jlw-content');
    content.innerHTML = '<div class="jlw-loading">Chargement\u2026</div>';

    const type = getSocieteType();
    let suggested = [];
    if (type) {
      try {
        const r = await fetch(`${API}/suggestions/${type}`).then(r => r.json());
        suggested = (r.suggestions || []).map(s => s.id);
      } catch(_) {}
    }

    let domaines = DOMAINES;
    try {
      const r = await fetch(`${API}/domaines`).then(r => r.json());
      if (r.domaines) domaines = r.domaines;
    } catch(_) {}

    const sorted = [...domaines].sort((a, b) => {
      const aS = suggested.includes(a.id) ? 0 : 1;
      const bS = suggested.includes(b.id) ? 0 : 1;
      return aS - bS;
    });

    let html = '';
    if (suggested.length) {
      html += '<div class="jlw-suggested">Recommand\u00e9 pour vous</div>';
    }
    html += '<div class="jlw-domaines">';
    sorted.forEach((d, i) => {
      if (suggested.length && i === suggested.length) {
        html += '</div><div style="padding:0 24px;margin:4px 0;"><hr style="border:none;border-top:1px solid var(--border,#2e2c29);"></div><div class="jlw-domaines">';
      }
      html += `
        <div class="jlw-domaine" onclick="window._jlwSearch('${d.id}','${esc(d.label)}')">
          <span class="ico">${d.icon}</span>
          <div class="info">
            <div class="name">${esc(d.label)}</div>
            <div class="desc">${esc(d.desc)}</div>
          </div>
          ${d.nb_professionnels !== undefined ? `<span class="badge">${d.nb_professionnels}</span>` : ''}
        </div>
      `;
    });
    html += '</div>';
    content.innerHTML = html;
  }

  window._jlwSearch = async function(specialite, label) {
    const content = document.getElementById('jlw-content');
    content.innerHTML = '<div class="jlw-loading">Recherche en cours\u2026</div>';

    try {
      const r = await fetch(`${API}/search?specialite=${specialite}&disponible=true&limit=5`).then(r => r.json());
      const pros = r.professionnels || [];

      let html = `
        <button class="jlw-back" onclick="window._jlwShowDomaines()">\u2190 Retour aux domaines</button>
        <div class="jlw-result-title">${label}</div>
        <div class="jlw-results">
      `;

      if (!pros.length) {
        html += '<div class="jlw-empty">Aucun professionnel disponible pour le moment dans ce domaine.</div>';
      } else {
        pros.forEach(p => {
          const initials = (p.prenom?.[0] || '') + (p.nom?.[0] || '');
          const stars = '\u2605'.repeat(Math.round(p.note_moyenne)) + '\u2606'.repeat(5 - Math.round(p.note_moyenne));
          html += `
            <div class="jlw-pro">
              <div class="avatar">
                ${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : esc(initials)}
              </div>
              <div class="info">
                <div class="top">
                  <span class="stars">${stars}</span>
                  <span style="font-size:11px;color:var(--muted)">${p.note_moyenne}/5</span>
                </div>
                <div class="name">${esc(p.titre||'')} ${esc(p.prenom)} ${esc(p.nom)}</div>
                <div class="meta">${esc(p.ville || '')} ${p.offre_min ? '\u2022 D\u00e8s ' + p.offre_min.prix + '\u20AC' : ''}</div>
              </div>
              <a class="book-btn" href="/expert/${esc(p.slug)}" target="_blank">R\u00e9server</a>
            </div>
          `;
        });
      }

      html += '</div>';
      html += `<a class="jlw-all" href="/public/experts/index.html?specialite=${specialite}" target="_blank">Voir tous les professionnels \u2192</a>`;
      content.innerHTML = html;
    } catch(e) {
      content.innerHTML = '<div class="jlw-empty">Erreur de chargement. R\u00e9essayez.</div>';
    }
  };

  window._jlwShowDomaines = showDomaines;

  // Global open function
  window.ouvrirConseilJuridique = function() {
    const overlay = document.querySelector('.jlw-overlay');
    if (overlay) {
      overlay.classList.add('open');
      showDomaines();
    }
  };

  function init() {
    injectStyles();
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
