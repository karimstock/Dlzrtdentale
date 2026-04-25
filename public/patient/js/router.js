/* ═══════════════════════════════════════════════
   JADOMI Patient — Hash Router (SPA)
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
      // Force re-render even if same hash
      onHashChange();
    } else {
      window.location.hash = path;
    }
  }

  /* ── Auth guard ────────────────────────── */
  function requireAuth(path) {
    if (!JadomiAPI.isAuthenticated() && path !== '/login') {
      window.location.hash = '#/login';
      return false;
    }
    return true;
  }

  /* ── Hash change handler ───────────────── */
  async function onHashChange() {
    const hash = window.location.hash.slice(1) || '/login';
    const path = hash.split('?')[0]; // strip query params

    if (!requireAuth(path)) return;

    // Redirect authenticated users away from login
    if (path === '/login' && JadomiAPI.isAuthenticated()) {
      window.location.hash = '#/mes-rdv';
      return;
    }

    const handler = routes[path];
    if (!handler) {
      // Fallback to mes-rdv or login
      window.location.hash = JadomiAPI.isAuthenticated() ? '#/mes-rdv' : '#/login';
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
      await handler(pageEl);
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
      item.classList.toggle('active', href === path);
    });
  }

  /* ── Init ──────────────────────────────── */
  function init() {
    contentEl = document.getElementById('app-content');
    navEl = document.getElementById('app-nav');

    window.addEventListener('hashchange', onHashChange);

    // Initial route
    if (!window.location.hash) {
      window.location.hash = JadomiAPI.isAuthenticated() ? '#/mes-rdv' : '#/login';
    } else {
      onHashChange();
    }
  }

  return { register, navigate, init };
})();
