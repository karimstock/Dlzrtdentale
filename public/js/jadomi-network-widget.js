/* ==============================================================
 * JADOMI — Widget "Annuaire & Réseau"
 * Inclure sur toutes les pages dashboard :
 * <script src="/public/js/jadomi-network-widget.js" defer></script>
 * ============================================================== */
(function() {
  const API = '/api/network/annuaire';
  const SUPABASE_URL = 'https://vsbomwjzehnfinfjvhqp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function injectStyles() {
    if (document.getElementById('jnw-styles')) return;
    const s = document.createElement('style');
    s.id = 'jnw-styles';
    s.textContent = `
      .jnw-trigger{position:fixed;bottom:16px;right:16px;z-index:99;display:none;align-items:center;gap:5px;padding:6px 12px;max-height:40px;background:rgba(16,185,129,0.15);color:var(--accent,#10b981);border:1px solid rgba(16,185,129,0.25);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);transition:all .15s;box-sizing:border-box;backdrop-filter:blur(8px);}
      .jnw-trigger:hover{background:rgba(16,185,129,0.25);border-color:rgba(16,185,129,0.4);box-shadow:0 2px 12px rgba(16,185,129,.2);}
      .jnw-trigger .ico{font-size:14px;line-height:1;}

      .jnw-panel{position:fixed;bottom:62px;right:16px;z-index:200;width:340px;max-width:calc(100vw - 32px);background:var(--surface,#1a1917);border:1px solid var(--border,#2e2c29);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);display:none;overflow:hidden;}
      .jnw-panel.open{display:block;}
      .jnw-head{padding:16px 20px;border-bottom:1px solid var(--border,#2e2c29);display:flex;justify-content:space-between;align-items:center;}
      .jnw-head h3{font-size:15px;color:var(--text,#f0ede8);margin:0;}
      .jnw-close{background:none;border:none;color:var(--muted,#8f8a82);font-size:18px;cursor:pointer;padding:4px 8px;}
      .jnw-close:hover{color:var(--text,#f0ede8);}
      .jnw-body{padding:16px 20px;max-height:360px;overflow-y:auto;}

      .jnw-link{display:block;padding:12px 16px;background:var(--surface2,#242420);border:1px solid var(--border,#2e2c29);border-radius:10px;margin-bottom:10px;color:var(--text,#f0ede8);font-size:13px;font-weight:600;text-align:center;text-decoration:none;transition:all .2s;}
      .jnw-link:hover{background:#059669;color:#fff;border-color:#059669;}

      .jnw-subtitle{font-size:12px;color:var(--muted,#8f8a82);margin-bottom:10px;font-weight:500;}

      .jnw-pro{display:flex;gap:10px;align-items:center;padding:10px;background:var(--surface2,#242420);border:1px solid var(--border,#2e2c29);border-radius:10px;margin-bottom:8px;transition:all .2s;cursor:pointer;text-decoration:none;}
      .jnw-pro:hover{border-color:#10b981;}
      .jnw-pro-avatar{width:40px;height:40px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:18px;color:#888;flex-shrink:0;overflow:hidden;}
      .jnw-pro-avatar img{width:100%;height:100%;object-fit:cover;}
      .jnw-pro-info{min-width:0;}
      .jnw-pro-name{font-size:13px;font-weight:600;color:var(--text,#f0ede8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .jnw-pro-prof{font-size:11px;color:var(--muted,#8f8a82);}
      .jnw-pro-stars{font-size:11px;color:#f59e0b;}

      .jnw-empty{font-size:12px;color:var(--muted,#8f8a82);text-align:center;padding:12px;}
    `;
    document.head.appendChild(s);
  }

  function getCurrentCP() {
    // Try to detect code postal from current société context
    try {
      const societe = JSON.parse(localStorage.getItem('jadomi_societe') || sessionStorage.getItem('jadomi_societe') || '{}');
      return societe.code_postal || societe.cp || '';
    } catch(e) { return ''; }
  }

  function starsHtml(n) {
    n = parseFloat(n) || 0;
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= Math.round(n) ? '★' : '☆';
    return s;
  }

  async function loadNearbyPros(container) {
    const cp = getCurrentCP();
    let url = API + '/search?';
    if (cp) {
      url = API + '/nearby?cp=' + encodeURIComponent(cp) + '&rayon=2';
    }

    try {
      const resp = await fetch(url);
      const json = await resp.json();
      if (!json.ok || !json.results || !json.results.length) {
        container.innerHTML = '<div class="jnw-empty">Aucun professionnel trouvé à proximité</div>';
        return;
      }

      // Pick 3 random results
      const shuffled = json.results.sort(() => Math.random() - 0.5).slice(0, 3);

      container.innerHTML = shuffled.map(r => {
        const proUrl = (r.page_url || '/pro/') + (r.slug || '');
        const avatarHtml = r.photo
          ? `<div class="jnw-pro-avatar"><img src="${esc(r.photo)}" alt=""></div>`
          : `<div class="jnw-pro-avatar">👤</div>`;

        return `<a href="${esc(proUrl)}" class="jnw-pro">
          ${avatarHtml}
          <div class="jnw-pro-info">
            <div class="jnw-pro-name">${esc(r.nom)}</div>
            <div class="jnw-pro-prof">${esc(r.profession)} · ${esc(r.ville)}</div>
            <div class="jnw-pro-stars">${starsHtml(r.note)}</div>
          </div>
        </a>`;
      }).join('');

    } catch (e) {
      container.innerHTML = '<div class="jnw-empty">Erreur de chargement</div>';
    }
  }

  function mount() {
    injectStyles();

    // Trigger button
    const trigger = document.createElement('button');
    trigger.className = 'jnw-trigger';
    trigger.innerHTML = '<span class="ico">🌐</span> Annuaire';
    document.body.appendChild(trigger);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'jnw-panel';
    panel.innerHTML = `
      <div class="jnw-head">
        <h3>🌐 Réseau JADOMI</h3>
        <button class="jnw-close">&times;</button>
      </div>
      <div class="jnw-body">
        <a href="/annuaire" class="jnw-link">🔍 Annuaire complet</a>
        <a href="/deals" class="jnw-link">🔥 Deals exclusifs</a>
        <div class="jnw-subtitle">Pros près de chez vous</div>
        <div id="jnwNearby"><div class="jnw-empty">Chargement...</div></div>
      </div>
    `;
    document.body.appendChild(panel);

    let isOpen = false;

    trigger.addEventListener('click', () => {
      isOpen = !isOpen;
      panel.classList.toggle('open', isOpen);
      if (isOpen) {
        loadNearbyPros(document.getElementById('jnwNearby'));
      }
    });

    panel.querySelector('.jnw-close').addEventListener('click', () => {
      isOpen = false;
      panel.classList.remove('open');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (isOpen && !panel.contains(e.target) && !trigger.contains(e.target)) {
        isOpen = false;
        panel.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
