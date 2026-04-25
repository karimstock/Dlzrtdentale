/* ═══════════════════════════════════════════════
   JADOMI Labo — API Client
   ═══════════════════════════════════════════════ */

const LaboAPI = (() => {
  /* ── Base URL detection ────────────────── */
  function getBaseURL() {
    return window.location.origin;
  }

  const BASE = getBaseURL();
  const API_PREFIX = '/api/labo-pro';

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
        break;
      }
    }
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      try { await reg.sync.register('upload-photos'); } catch {}
    }
  }

  /* ── Token management ──────────────────── */
  function getToken() {
    return localStorage.getItem('jadomi_labo_token');
  }

  function setToken(token) {
    localStorage.setItem('jadomi_labo_token', token);
  }

  function clearToken() {
    localStorage.removeItem('jadomi_labo_token');
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

    isOnline: () => isOnline,
    queueLength: () => offlineQueue.length,
  };
})();
