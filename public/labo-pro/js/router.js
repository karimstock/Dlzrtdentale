/* ═══════════════════════════════════════════════
   JADOMI Labo — Hash Router (SPA)
   ═══════════════════════════════════════════════ */

const Router = (() => {
  const routes = {};
  let currentPage = null;
  let contentEl = null;
  let navEl = null;

  /* ── Route registration ────────────────── */
  function register(path, handler) {
    routes[path] = handler;
  }

  /* ── Navigation ────────────────────────── */
  function navigate(path) {
    if (window.location.hash === '#' + path) {
      onHashChange();
    } else {
      window.location.hash = path;
    }
  }

  /* ── Auth guard ────────────────────────── */
  function requireAuth(path) {
    if (!LaboAPI.isAuthenticated() && path !== '/login') {
      window.location.hash = '#/login';
      return false;
    }
    return true;
  }

  /* ── Extract route params ──────────────── */
  function matchRoute(hash) {
    // Try exact match first
    if (routes[hash]) return { handler: routes[hash], params: {} };

    // Try pattern matching (e.g. /cas/:id)
    for (const pattern of Object.keys(routes)) {
      if (!pattern.includes(':')) continue;
      const patternParts = pattern.split('/');
      const hashParts = hash.split('/');
      if (patternParts.length !== hashParts.length) continue;

      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          params[patternParts[i].slice(1)] = hashParts[i];
        } else if (patternParts[i] !== hashParts[i]) {
          match = false;
          break;
        }
      }
      if (match) return { handler: routes[pattern], params };
    }

    return null;
  }

  /* ── Hash change handler ───────────────── */
  async function onHashChange() {
    const hash = window.location.hash.slice(1) || '/login';
    const path = hash.split('?')[0];

    if (!requireAuth(path)) return;

    // Redirect authenticated users away from login
    if (path === '/login' && LaboAPI.isAuthenticated()) {
      window.location.hash = '#/mes-cas';
      return;
    }

    const matched = matchRoute(path);
    if (!matched) {
      window.location.hash = LaboAPI.isAuthenticated() ? '#/mes-cas' : '#/login';
      return;
    }

    // Page transition out
    if (currentPage && contentEl) {
      const old = contentEl.querySelector('.page');
      if (old) {
        old.classList.add('page-exit');
        await new Promise((r) => setTimeout(r, 180));
      }
    }

    // Render new page
    contentEl.innerHTML = '';
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    contentEl.appendChild(pageEl);

    // Show/hide nav bar
    const hideNav = path === '/login';
    if (navEl) navEl.classList.toggle('hidden', hideNav);

    // Update active nav item
    updateActiveNav(path);

    // Show/hide header
    const headerEl = document.getElementById('app-header');
    if (headerEl) headerEl.classList.toggle('hidden', hideNav);

    currentPage = path;

    try {
      await matched.handler(pageEl, matched.params);
    } catch (err) {
      console.error('Page render error:', err);
      pageEl.innerHTML = `
        <div class="empty-state">
          <h3>Erreur</h3>
          <p>Impossible de charger cette page. Veuillez reessayer.</p>
          <button class="btn btn-primary mt-md" onclick="location.reload()">Recharger</button>
        </div>`;
    }

    // Scroll to top
    contentEl.scrollTop = 0;
  }

  /* ── Update nav active state ───────────── */
  function updateActiveNav(path) {
    if (!navEl) return;
    navEl.querySelectorAll('.nav-item').forEach((item) => {
      const href = item.dataset.route;
      item.classList.toggle('active', path.startsWith(href));
    });
  }

  /* ── Init ──────────────────────────────── */
  function init() {
    contentEl = document.getElementById('app-content');
    navEl = document.getElementById('app-nav');

    window.addEventListener('hashchange', onHashChange);

    // Initial route
    if (!window.location.hash) {
      window.location.hash = LaboAPI.isAuthenticated() ? '#/mes-cas' : '#/login';
    } else {
      onHashChange();
    }
  }

  return { register, navigate, init };
})();
