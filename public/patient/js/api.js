/* ═══════════════════════════════════════════════
   JADOMI Patient — API Client
   ═══════════════════════════════════════════════ */

const JadomiAPI = (() => {
  /* ── Base URL detection ────────────────── */
  function getBaseURL() {
    const loc = window.location;
    // Same origin in production
    return loc.origin;
  }

  const BASE = getBaseURL();
  const API_PREFIX = '/api/dentiste-pro';

  /* ── Offline queue ─────────────────────── */
  const offlineQueue = [];
  let isOnline = navigator.onLine;

  window.addEventListener('online', () => {
    isOnline = true;
    flushQueue();
  });
  window.addEventListener('offline', () => { isOnline = false; });

  async function flushQueue() {
    while (offlineQueue.length > 0) {
      const req = offlineQueue[0];
      try {
        await _fetch(req.endpoint, req.options, true);
        offlineQueue.shift();
      } catch {
        break; // still offline or server error
      }
    }
    // Request background sync via service worker
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      try { await reg.sync.register('send-messages'); } catch {}
    }
  }

  /* ── Token management ──────────────────── */
  function getToken() {
    return localStorage.getItem('jadomi_token');
  }

  function setToken(token) {
    localStorage.setItem('jadomi_token', token);
  }

  function clearToken() {
    localStorage.removeItem('jadomi_token');
  }

  function isAuthenticated() {
    return !!getToken();
  }

  /* ── Core fetch wrapper ────────────────── */
  async function _fetch(endpoint, options = {}, skipQueue = false) {
    const url = `${BASE}${API_PREFIX}${endpoint}`;
    const token = getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Remove content-type for FormData
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const fetchOpts = {
      ...options,
      headers,
    };

    if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
      fetchOpts.body = JSON.stringify(options.body);
    }

    // Offline handling
    if (!isOnline && !skipQueue) {
      if (options.method && options.method !== 'GET') {
        offlineQueue.push({ endpoint, options });
        return { queued: true };
      }
      throw new Error('Vous etes hors ligne');
    }

    const res = await fetch(url, fetchOpts);

    // 401 — session expired
    if (res.status === 401) {
      clearToken();
      window.location.hash = '#/login';
      throw new Error('Session expiree');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erreur serveur' }));
      throw new Error(err.message || `Erreur ${res.status}`);
    }

    // No content
    if (res.status === 204) return null;

    return res.json();
  }

  /* ── Public API methods ────────────────── */
  return {
    getToken,
    setToken,
    clearToken,
    isAuthenticated,

    get:    (ep) =>          _fetch(ep, { method: 'GET' }),
    post:   (ep, body) =>    _fetch(ep, { method: 'POST', body }),
    put:    (ep, body) =>    _fetch(ep, { method: 'PUT', body }),
    patch:  (ep, body) =>    _fetch(ep, { method: 'PATCH', body }),
    del:    (ep) =>          _fetch(ep, { method: 'DELETE' }),

    upload: (ep, formData) => _fetch(ep, { method: 'POST', body: formData }),

    // SSE stream helper
    stream(endpoint) {
      const token = getToken();
      const url = `${BASE}${API_PREFIX}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
      return new EventSource(url);
    },

    isOnline: () => isOnline,
    queueLength: () => offlineQueue.length,
  };
})();
