/* ==============================================================
 * JADOMI — Switcher société global
 * À inclure dans sci.html, commerce.html, mailing.html…
 * Requiert : supabase-js chargé, élément <nav class="nav"> existant
 * Usage   : <script src="/ms-switcher.js" defer></script>
 * ============================================================== */
(function () {
  const SUPABASE_URL = 'https://vsbomwjzehnfinfjvhqp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';

  const TYPE_ICO = {
    cabinet_dentaire: '🦷',
    prothesiste: '🔬',
    orthodontiste: '🦴',
    veterinaire: '🐾',
    sci: '🏠',
    juridique: '⚖️',
    services: '🛍️',
    artisan_btp: '🔧',
    createur: '✨',
    societe_commerciale: '🏢',
    sas: '🏢', sarl: '🏢', eurl: '🏢', sa: '🏢', snc: '🏢',
    ei: '👤',
    auto_entrepreneur: '📊',
    profession_liberale: '👔',
    association: '🤝',
    autre: '🏷️'
  };
  const COMMERCE_TYPES = [
    'societe_commerciale','sas','sarl','eurl','sa','snc',
    'ei','auto_entrepreneur','profession_liberale','association','autre'
  ];

  // Couleur accent par type de société (fallback à la couleur custom stockée en DB si présente)
  const ACCENT_BY_TYPE = {
    cabinet_dentaire: '#10b981',
    prothesiste: '#2563eb',
    orthodontiste: '#2563eb',
    veterinaire: '#10b981',
    sci: '#60a8f0',
    juridique: '#6366f1',
    services: '#ec4899',
    artisan_btp: '#f59e0b',
    createur: '#d946ef',
    societe_commerciale: '#f0a030',
    sas: '#f0a030', sarl: '#f0a030', eurl: '#f0a030', sa: '#f0a030', snc: '#f0a030',
    ei: '#60f0d0',
    auto_entrepreneur: '#60f0d0',
    profession_liberale: '#f060a0',
    association: '#a060f0',
    autre: '#8f8a82'
  };
  function applyAccent(societe) {
    if (!societe) return;
    const c = societe.couleur_accent || ACCENT_BY_TYPE[societe.type] || '#10b981';
    document.documentElement.style.setProperty('--accent', c);
    try {
      document.documentElement.style.setProperty(
        '--accent-soft',
        `color-mix(in srgb, ${c} 12%, transparent)`
      );
    } catch (_) {}
  }

  function moduleUrlFor(s) {
    if (!s) return 'organisation.html';
    if (s.type === 'cabinet_dentaire') return 'index.html';
    if (s.type === 'veterinaire') return 'index.html';
    if (s.type === 'prothesiste') return '/public/labo/dashboard.html';
    if (s.type === 'orthodontiste') return '/public/labo/dashboard.html';
    if (s.type === 'sci') return 'sci.html';
    if (s.type === 'juridique') return '/public/juridique/dashboard.html';
    if (s.type === 'services') return '/public/services/dashboard.html';
    if (s.type === 'artisan_btp') return '/public/btp/dashboard.html';
    if (s.type === 'createur') return '/public/showroom/dashboard.html';
    if (COMMERCE_TYPES.includes(s.type)) return 'commerce.html';
    return 'organisation.html';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(nom) {
    if (!nom) return '?';
    const words = nom.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Retourne un logo img si logo_url, sinon cercle coloré avec initiales
  function renderAvatar(societe, size = 22) {
    if (societe?.logo_url) {
      return `<img src="${esc(societe.logo_url)}" alt="" style="width:${size}px;height:${size}px;border-radius:6px;object-fit:cover;vertical-align:middle;">`;
    }
    const color = societe?.couleur_accent || ACCENT_BY_TYPE[societe?.type] || '#8f8a82';
    const fs = Math.max(9, Math.round(size * 0.42));
    return `<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:6px;background:${esc(color)};color:#111;font-weight:800;font-size:${fs}px;letter-spacing:-0.5px;vertical-align:middle;">${esc(initials(societe?.nom))}</span>`;
  }

  function injectStyles() {
    if (document.getElementById('ms-sw-styles')) return;
    const st = document.createElement('style');
    st.id = 'ms-sw-styles';
    st.textContent = `
      .ms-bell{position:relative;display:inline-flex;align-items:center;margin-right:6px;}
      .ms-bell-btn{padding:8px 10px;background:var(--surface2,#242220);border:1px solid var(--border,#2e2c29);border-radius:10px;color:var(--text,#f0ede8);font-size:14px;cursor:pointer;display:inline-flex;align-items:center;position:relative;}
      .ms-bell-btn:hover{border-color:var(--accent,#10b981);}
      .ms-bell-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#f05050;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--bg,#0f0e0d);}
      .ms-bell-menu{display:none;position:absolute;top:calc(100% + 6px);right:0;width:360px;max-width:calc(100vw - 40px);max-height:480px;overflow:auto;background:var(--surface,#1a1917);border:1px solid var(--border,#2e2c29);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.45);z-index:200;}
      .ms-bell-menu.open{display:block;}
      .ms-bell-head{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border,#2e2c29);font-size:12px;color:var(--muted,#8f8a82);}
      .ms-bell-head a{color:var(--accent,#10b981);cursor:pointer;font-weight:600;}
      .ms-bell-item{display:block;padding:10px 14px;border-bottom:1px solid var(--border,#2e2c29);cursor:pointer;text-decoration:none;color:var(--text,#f0ede8);}
      .ms-bell-item:hover{background:var(--surface2,#242220);}
      .ms-bell-item.urgente{border-left:3px solid #f05050;}
      .ms-bell-item.unread{background:rgba(16,185,129,.04);}
      .ms-bell-item .t{font-size:13px;font-weight:600;margin-bottom:2px;}
      .ms-bell-item .m{font-size:11px;color:var(--muted,#8f8a82);}
      .ms-bell-item .d{font-size:10px;color:var(--muted,#8f8a82);margin-top:4px;}
      .ms-bell-empty{padding:24px 14px;text-align:center;color:var(--muted,#8f8a82);font-size:12px;}
      .ms-urgent-banner{position:fixed;top:0;left:0;right:0;z-index:250;background:linear-gradient(90deg,#f05050,#f08050);color:#fff;padding:10px 18px;font-size:13px;font-weight:600;text-align:center;display:flex;justify-content:center;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(240,80,80,.3);}
      .ms-urgent-banner a{color:#fff;text-decoration:underline;cursor:pointer;}
      .ms-urgent-banner .close{background:none;border:1px solid rgba(255,255,255,.3);border-radius:6px;color:#fff;padding:2px 8px;cursor:pointer;margin-left:12px;font-size:11px;}
      .ms-sw{position:relative;display:inline-flex;align-items:center;}
      .ms-sw-btn{padding:8px 12px;background:var(--surface2,#242220);border:1px solid var(--border,#2e2c29);border-radius:10px;color:var(--text,#f0ede8);font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:8px;cursor:pointer;transition:all .15s;max-width:220px;}
      .ms-sw-btn:hover{border-color:var(--accent,#10b981);color:var(--accent,#10b981);}
      .ms-sw-btn .n{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .ms-sw-btn .c{opacity:.5;font-size:10px;}
      .ms-sw-menu{display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:280px;background:var(--surface,#1a1917);border:1px solid var(--border,#2e2c29);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.45);padding:6px;z-index:200;}
      .ms-sw-menu.open{display:block;}
      .ms-sw-item{display:flex;align-items:center;gap:10px;padding:10px 12px;color:var(--text,#f0ede8);text-decoration:none;font-size:13px;border-radius:8px;cursor:pointer;}
      .ms-sw-item:hover{background:var(--surface2,#242220);}
      .ms-sw-item.active{background:rgba(16,185,129,.07);color:var(--accent,#10b981);font-weight:700;}
      .ms-sw-item .ico{font-size:16px;}
      .ms-sw-item .nm{flex:1;font-weight:600;}
      .ms-sw-item .tg{font-size:10px;color:var(--muted,#8f8a82);text-transform:uppercase;letter-spacing:.5px;}
      .ms-sw-sep{height:1px;background:var(--border,#2e2c29);margin:4px 6px;}
      .ms-sw-link{display:flex;align-items:center;gap:10px;padding:10px 12px;color:var(--accent,#10b981);text-decoration:none;font-weight:600;font-size:12px;border-radius:8px;}
      .ms-sw-link.muted{color:var(--text,#f0ede8);font-weight:600;}
      .ms-sw-link:hover{background:var(--surface2,#242220);}
      .ms-sw-empty{padding:10px 12px;color:var(--muted,#8f8a82);font-size:12px;}
    `;
    document.head.appendChild(st);
  }

  function buildContainer() {
    const nav = document.querySelector('nav.nav .nav-right')
      || document.querySelector('.nav-right')
      || document.querySelector('.topbar .topbar-right')
      || document.querySelector('.topbar-right')
      || document.querySelector('.topbar > a.back')?.parentElement
      || document.querySelector('.topbar');
    if (!nav) return null;

    // cloche notifications
    if (!nav.querySelector('.ms-bell')) {
      const bell = document.createElement('div');
      bell.className = 'ms-bell';
      bell.innerHTML = `
        <button class="ms-bell-btn" type="button" title="Notifications">
          🔔
          <span class="ms-bell-badge" style="display:none;">0</span>
        </button>
        <div class="ms-bell-menu"></div>
      `;
      nav.insertBefore(bell, nav.firstChild);
    }

    if (nav.querySelector('.ms-sw')) return nav.querySelector('.ms-sw');
    const wrap = document.createElement('div');
    wrap.className = 'ms-sw';
    wrap.innerHTML = `
      <button class="ms-sw-btn" type="button" aria-haspopup="menu" title="Changer de société">
        <span class="i" aria-hidden="true">🏢</span>
        <span class="n">Mes sociétés</span>
        <span class="c">▾</span>
      </button>
      <div class="ms-sw-menu" role="menu"></div>
    `;
    // Insert at the start of .nav-right after the bell
    const existingBell = nav.querySelector('.ms-bell');
    if (existingBell) existingBell.after(wrap);
    else nav.insertBefore(wrap, nav.firstChild);
    return wrap;
  }

  function currentPage() {
    const p = location.pathname.split('/').pop() || 'index.html';
    return p;
  }

  function currentModuleLabel() {
    const p = currentPage();
    if (p === 'index.html' || p === '' || p === '/') return 'cabinet dentaire';
    if (p === 'sci.html') return 'SCI';
    if (p === 'commerce.html') return 'société commerciale';
    if (p === 'mailing.html') return 'mailing';
    return '';
  }

  function render(wrap, state) {
    const btn = wrap.querySelector('.ms-sw-btn');
    const menu = wrap.querySelector('.ms-sw-menu');
    const active = state.active;
    const iconEl = btn.querySelector('.i');
    if (active) {
      iconEl.innerHTML = renderAvatar(active, 22);
      btn.querySelector('.n').textContent = active.nom;
    } else if ((state.societes || []).length === 0) {
      iconEl.textContent = '➕';
      btn.querySelector('.n').textContent = 'Créer une société';
    }

    const socs = state.societes || [];
    const parts = [];
    if (socs.length === 0) {
      parts.push('<div class="ms-sw-empty">Aucune société pour l’instant.</div>');
    } else {
      for (const s of socs) {
        const isActive = active && active.id === s.id;
        const tag = s.type === 'cabinet_dentaire' ? 'Cabinet'
          : s.type === 'prothesiste' ? 'Labo'
          : s.type === 'orthodontiste' ? 'Ortho'
          : s.type === 'veterinaire' ? 'Véto'
          : s.type === 'sci' ? 'SCI'
          : s.type === 'juridique' ? 'Juridique'
          : s.type === 'services' ? 'Services'
          : s.type === 'artisan_btp' ? 'Artisan BTP'
          : s.type === 'createur' ? 'Créateur'
          : COMMERCE_TYPES.includes(s.type) ? 'Commerce'
          : '';
        const icon = renderAvatar(s, 22);
        parts.push(
          `<a class="ms-sw-item ${isActive ? 'active' : ''}" href="${moduleUrlFor(s)}" data-id="${s.id}">
             <span class="ico">${icon}</span>
             <span class="nm">${esc(s.nom)}</span>
             <span class="tg">${tag}</span>
             ${isActive ? '<span>✓</span>' : ''}
           </a>`
        );
      }
    }
    parts.push('<div class="ms-sw-sep"></div>');
    parts.push(`<a class="ms-sw-link muted" href="organisation.html">🏢 Hub organisation</a>`);
    parts.push(`<a class="ms-sw-link" href="wizard-societe.html">➕ Ajouter une société</a>`);
    menu.innerHTML = parts.join('');

    menu.querySelectorAll('.ms-sw-item').forEach(el => {
      el.addEventListener('click', (ev) => {
        const id = el.getAttribute('data-id');
        if (id) {
          localStorage.setItem('societe_active_id', id);
          localStorage.setItem('selectedSocieteId', id);
        }
      });
    });
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    };
    document.addEventListener('click', (ev) => {
      if (!wrap.contains(ev.target)) menu.classList.remove('open');
    });
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'à l\'instant';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'j';
  }

  async function initBell(token) {
    const bell = document.querySelector('.ms-bell');
    if (!bell || !token) return;
    const btn = bell.querySelector('.ms-bell-btn');
    const menu = bell.querySelector('.ms-bell-menu');
    const badge = bell.querySelector('.ms-bell-badge');

    async function refresh() {
      try {
        const r = await fetch('/api/notifications?limit=30', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
        const list = r?.notifications || [];
        const nbUnread = list.filter(n => !n.lu).length;
        const nbUrgent = r?.nb_urgentes || list.filter(n => !n.lu && n.urgence === 'urgente').length;
        if (nbUnread > 0) {
          badge.style.display = 'flex';
          badge.textContent = nbUnread > 99 ? '99+' : String(nbUnread);
          badge.style.background = nbUrgent > 0 ? '#f05050' : 'var(--accent, #10b981)';
          badge.style.color = nbUrgent > 0 ? '#fff' : '#111';
        } else {
          badge.style.display = 'none';
        }
        renderMenu(list);

        // Bannière urgente
        const urgent = list.find(n => !n.lu && n.urgence === 'urgente');
        maybeShowBanner(urgent, token);
      } catch (e) {}
    }

    function renderMenu(list) {
      if (!list.length) {
        menu.innerHTML = `
          <div class="ms-bell-head"><span>Notifications</span></div>
          <div class="ms-bell-empty">Aucune notification pour le moment.</div>`;
        return;
      }
      const items = list.map(n => {
        const href = n.cta_url || '#';
        return `<a class="ms-bell-item ${n.urgence === 'urgente' ? 'urgente' : ''} ${n.lu ? '' : 'unread'}" data-id="${n.id}" href="${href}">
          <div class="t">${esc(n.titre)}</div>
          ${n.message ? `<div class="m">${esc(n.message)}</div>` : ''}
          <div class="d">${timeAgo(n.created_at)}${n.cta_label ? ' · ' + esc(n.cta_label) + ' →' : ''}</div>
        </a>`;
      }).join('');
      menu.innerHTML = `
        <div class="ms-bell-head">
          <span>Notifications</span>
          <a id="ms-mark-all">Tout marquer lu</a>
        </div>
        ${items}`;
      menu.querySelector('#ms-mark-all')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await fetch('/api/notifications/mark-all-read', {
          method: 'POST', headers: { Authorization: 'Bearer ' + token }
        });
        refresh();
      });
      menu.querySelectorAll('.ms-bell-item').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.getAttribute('data-id');
          await fetch('/api/notifications/' + id + '/lu', {
            method: 'PATCH', headers: { Authorization: 'Bearer ' + token }
          });
        });
      });
    }

    btn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
      if (menu.classList.contains('open')) refresh();
    };
    document.addEventListener('click', (ev) => {
      if (!bell.contains(ev.target)) menu.classList.remove('open');
    });

    refresh();
    // Refresh toutes les 60s (pas trop agressif)
    setInterval(refresh, 60000);
  }

  function maybeShowBanner(notif, token) {
    if (!notif) {
      document.querySelector('.ms-urgent-banner')?.remove();
      return;
    }
    const lastDismissed = sessionStorage.getItem('ms_dismissed_urgent');
    if (lastDismissed === notif.id) return;
    if (document.querySelector('.ms-urgent-banner')) return;
    const b = document.createElement('div');
    b.className = 'ms-urgent-banner';
    b.innerHTML = `
      <span>⚡ ${esc(notif.titre)}${notif.message ? ' — ' + esc(notif.message) : ''}</span>
      ${notif.cta_url ? `<a href="${notif.cta_url}">${esc(notif.cta_label || 'Voir')}</a>` : ''}
      <button class="close">✕</button>
    `;
    b.querySelector('.close').onclick = () => {
      sessionStorage.setItem('ms_dismissed_urgent', notif.id);
      b.remove();
    };
    document.body.prepend(b);
  }

  async function init() {
    injectStyles();
    const wrap = buildContainer();
    if (!wrap) return;

    const db = (window.supabase && window.supabase.createClient)
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
      : null;
    if (!db) return;

    let token = null;
    try {
      const { data } = await db.auth.getSession();
      token = data?.session?.access_token || null;
    } catch (e) {}

    let societes = [];
    if (token) {
      try {
        const r = await fetch('/api/societes', { headers: { Authorization: 'Bearer ' + token } })
          .then(r => r.json()).catch(() => ({}));
        societes = r?.societes || [];
      } catch (e) {}
    }

    if (token) initBell(token);

    let activeId = localStorage.getItem('societe_active_id');
    let active = societes.find(s => s.id === activeId) || null;
    // Forcer la societe correspondant au module de la page courante
    const p = currentPage();
    const pathname = location.pathname;
    if (p === 'index.html' || p === '' || p === '/') {
      // index.html = cabinet dentaire TOUJOURS
      const cabinet = societes.find(s => s.type === 'cabinet_dentaire' || s.type === 'veterinaire');
      if (cabinet) { active = cabinet; localStorage.setItem('societe_active_id', cabinet.id); }
    } else if (p === 'sci.html') {
      const sci = societes.find(s => s.type === 'sci');
      if (sci) { active = sci; localStorage.setItem('societe_active_id', sci.id); }
    } else if (p === 'commerce.html') {
      const comm = societes.find(s => COMMERCE_TYPES.includes(s.type));
      if (comm) { active = comm; localStorage.setItem('societe_active_id', comm.id); }
    } else if (pathname.includes('/labo/')) {
      const labo = societes.find(s => s.type === 'prothesiste' || s.type === 'orthodontiste');
      if (labo) { active = labo; localStorage.setItem('societe_active_id', labo.id); }
    } else if (pathname.includes('/juridique/')) {
      const jur = societes.find(s => s.type === 'juridique');
      if (jur) { active = jur; localStorage.setItem('societe_active_id', jur.id); }
    } else if (pathname.includes('/btp/')) {
      const btp = societes.find(s => s.type === 'artisan_btp');
      if (btp) { active = btp; localStorage.setItem('societe_active_id', btp.id); }
    } else if (pathname.includes('/showroom/')) {
      const cr = societes.find(s => s.type === 'createur');
      if (cr) { active = cr; localStorage.setItem('societe_active_id', cr.id); }
    } else if (pathname.includes('/services/')) {
      const svc = societes.find(s => s.type === 'services');
      if (svc) { active = svc; localStorage.setItem('societe_active_id', svc.id); }
    }
    if (!active) { active = societes[0] || null; }
    if (active) {
      localStorage.setItem('societe_active_id', active.id);
      localStorage.setItem('selectedSocieteId', active.id);
    }

    // Exposer pour code page
    window.jadomiMS = { societes, active, token };
    applyAccent(active);
    render(wrap, { societes, active });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
