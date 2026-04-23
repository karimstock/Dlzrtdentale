/* ==============================================================
 * JADOMI Ads -- Reusable Ad Slot Component
 * Displays native advertising within dentist dashboards.
 *
 * Usage:
 *   <div id="my-ad" data-jadomi-ad="sidebar-card"></div>
 *   <script src="/public/js/ad-slot.js" defer></script>
 *
 * Or programmatically:
 *   const slot = new JadomiAdSlot('my-ad', 'banner-top', { refreshInterval: 45000 });
 * ============================================================== */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // CSS Injection (once per page)
  // ----------------------------------------------------------------
  function injectAdStyles() {
    if (document.getElementById('jadomi-ad-styles')) return;
    const style = document.createElement('style');
    style.id = 'jadomi-ad-styles';
    style.textContent = `
      /* ---------- shared ---------- */
      .jad-slot{position:relative;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box;opacity:0;transition:opacity .6s cubic-bezier(.16,1,.3,1);overflow:hidden;}
      .jad-slot *{box-sizing:border-box;margin:0;padding:0;}
      .jad-slot.jad-visible{opacity:1;}
      .jad-slot.jad-hidden{display:none!important;}
      .jad-slot a{text-decoration:none;color:inherit;}
      .jad-slot img{display:block;object-fit:cover;}

      .jad-label{font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:rgba(201,169,97,.6);user-select:none;}
      .jad-close{position:absolute;top:8px;right:8px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.35);font-size:13px;line-height:1;cursor:pointer;transition:all .2s;z-index:2;}
      .jad-close:hover{background:rgba(255,255,255,.12);color:rgba(255,255,255,.7);}

      .jad-cta{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;color:#0a0a0f;background:linear-gradient(135deg,#c9a961,#e0c478);border:none;cursor:pointer;transition:all .25s cubic-bezier(.16,1,.3,1);white-space:nowrap;}
      .jad-cta:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 4px 12px rgba(201,169,97,.3);}

      /* ---------- banner-top (728x90) ---------- */
      .jad-banner{max-width:728px;height:90px;margin:0 auto 16px;padding:12px 16px;border-radius:12px;display:flex;align-items:center;gap:14px;background:rgba(201,169,97,.04);border:1px solid rgba(201,169,97,.12);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transform:translateY(-20px);transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1);}
      .jad-banner.jad-visible{transform:translateY(0);}
      .jad-banner .jad-img{width:64px;height:64px;border-radius:10px;flex-shrink:0;overflow:hidden;}
      .jad-banner .jad-img img{width:100%;height:100%;}
      .jad-banner .jad-body{flex:1;min-width:0;}
      .jad-banner .jad-title{font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .jad-banner .jad-desc{font-size:12px;color:rgba(241,245,249,.55);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .jad-banner .jad-label{position:absolute;top:8px;right:36px;}
      .jad-banner .jad-actions{flex-shrink:0;}

      /* ---------- sidebar-card (300x250) ---------- */
      .jad-sidebar{width:100%;max-width:300px;border-radius:14px;background:rgba(201,169,97,.04);border:1px solid rgba(201,169,97,.1);border-left:3px solid #c9a961;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);overflow:hidden;transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .4s cubic-bezier(.16,1,.3,1);transform:scale(.97);padding-bottom:10px;}
      .jad-sidebar.jad-visible{transform:scale(1);}
      .jad-sidebar .jad-img{width:100%;height:140px;overflow:hidden;}
      .jad-sidebar .jad-img img{width:100%;height:100%;}
      .jad-sidebar .jad-body{padding:14px 16px 8px;}
      .jad-sidebar .jad-title{font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:6px;line-height:1.35;}
      .jad-sidebar .jad-desc{font-size:12px;color:rgba(241,245,249,.5);line-height:1.5;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
      .jad-sidebar .jad-footer{padding:0 16px;display:flex;align-items:center;justify-content:space-between;}
      .jad-sidebar .jad-label{color:rgba(201,169,97,.45);}

      /* ---------- native-feed (full-width) ---------- */
      .jad-native{width:100%;padding:14px 18px;border-radius:12px;display:flex;align-items:center;gap:14px;background:rgba(201,169,97,.03);border:1px solid rgba(201,169,97,.08);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);margin-bottom:10px;transition:opacity .6s cubic-bezier(.16,1,.3,1);}
      .jad-native .jad-img{width:52px;height:52px;border-radius:10px;flex-shrink:0;overflow:hidden;}
      .jad-native .jad-img img{width:100%;height:100%;}
      .jad-native .jad-body{flex:1;min-width:0;}
      .jad-native .jad-prefix{font-size:10px;font-weight:600;color:rgba(201,169,97,.5);letter-spacing:.5px;text-transform:uppercase;margin-bottom:3px;}
      .jad-native .jad-title{font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .jad-native .jad-desc{font-size:12px;color:rgba(241,245,249,.45);line-height:1.4;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;}
      .jad-native .jad-actions{flex-shrink:0;}

      /* ---------- responsive ---------- */
      @media(max-width:768px){
        .jad-banner{max-width:100%;height:auto;flex-wrap:wrap;gap:10px;padding:10px 12px;}
        .jad-banner .jad-img{width:48px;height:48px;}
        .jad-banner .jad-label{position:static;margin-bottom:4px;width:100%;text-align:right;}
        .jad-sidebar{max-width:100%;}
        .jad-native .jad-img{width:44px;height:44px;}
      }
    `;
    document.head.appendChild(style);
  }

  // ----------------------------------------------------------------
  // Utility: simple hash for user id (FNV-1a 32-bit)
  // ----------------------------------------------------------------
  function hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  // ----------------------------------------------------------------
  // Utility: escape HTML
  // ----------------------------------------------------------------
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // ----------------------------------------------------------------
  // Gather user context from existing auth data
  // ----------------------------------------------------------------
  function getUserContext() {
    const ctx = {};
    try {
      const raw = localStorage.getItem('jadomi_session');
      if (raw) {
        const session = JSON.parse(raw);
        const user = session?.user || session;
        const meta = user?.user_metadata || {};
        ctx.user_hash = hashString(user?.id || user?.email || 'anon');
        ctx.profession = meta.profession || meta.type_professionnel || null;
        ctx.specialties = meta.specialites || meta.specialties || null;
        ctx.region = meta.region || meta.ville || null;
        ctx.structure_type = meta.structure_type || meta.type_structure || null;
      }
    } catch (_) { /* silent */ }

    ctx.societe_id = localStorage.getItem('selectedSocieteId')
      || localStorage.getItem('societe_active_id')
      || null;

    return ctx;
  }

  // ----------------------------------------------------------------
  // JadomiAdSlot Class
  // ----------------------------------------------------------------
  class JadomiAdSlot {
    /**
     * @param {string} containerId  - DOM element ID where the ad renders
     * @param {string} slotType     - 'banner-top' | 'sidebar-card' | 'native-feed'
     * @param {object} options
     * @param {number} options.refreshInterval  - ms between auto-refreshes (default 60000)
     * @param {string} options.fallbackHtml     - HTML to show if no ad (default '')
     * @param {boolean} options.showLabel       - show sponsor label (default true)
     */
    constructor(containerId, slotType, options = {}) {
      this.containerId = containerId;
      this.slotType = slotType;
      this.options = Object.assign({
        refreshInterval: 60000,
        fallbackHtml: '',
        showLabel: true
      }, options);

      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.warn('[JadomiAd] Container not found:', containerId);
        return;
      }

      this._intervalId = null;
      this._retried = false;
      this._dismissed = false;
      this._currentAd = null;
      this._boundVisChange = this._onVisibilityChange.bind(this);

      injectAdStyles();
      this.loadAd();
      this._startAutoRefresh();
      document.addEventListener('visibilitychange', this._boundVisChange);
    }

    // ------ Public API ------

    /** Fetch an ad from the delivery endpoint. */
    async loadAd() {
      if (this._dismissed) return;
      const ctx = getUserContext();
      try {
        const res = await fetch('/api/ads/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ slot_type: this.slotType, context: ctx })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data || !data.ad) {
          this.hideSlot();
          return;
        }
        this._retried = false;
        this.renderAd(data.ad);
      } catch (err) {
        this._handleError(err);
      }
    }

    /** Render the ad into the container based on slot type. */
    renderAd(ad) {
      if (!this.container) return;
      this._currentAd = ad;
      const label = this.options.showLabel;
      let html = '';

      switch (this.slotType) {
        case 'banner-top':
          html = this._renderBanner(ad, label);
          break;
        case 'sidebar-card':
          html = this._renderSidebar(ad, label);
          break;
        case 'native-feed':
          html = this._renderNative(ad, label);
          break;
        default:
          html = this._renderNative(ad, label);
      }

      this.container.innerHTML = html;
      this.container.classList.remove('jad-hidden');

      // Trigger fade-in on next frame
      requestAnimationFrame(() => {
        const slot = this.container.querySelector('.jad-slot');
        if (slot) slot.classList.add('jad-visible');
      });

      // Bind close button
      const closeBtn = this.container.querySelector('.jad-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._dismissed = true;
          this.hideSlot();
        });
      }

      // Bind click tracking on CTA and card body
      const clickable = this.container.querySelector('[data-jad-click]');
      if (clickable) {
        clickable.addEventListener('click', (e) => {
          e.preventDefault();
          this.trackClick(ad);
        });
      }

      // Track impression
      if (ad.impression_id) {
        this.trackImpression(ad.impression_id);
      }
    }

    /** Fire-and-forget impression tracking. */
    trackImpression(impressionId) {
      try {
        navigator.sendBeacon
          ? navigator.sendBeacon('/api/ads/impressions', JSON.stringify({ impression_id: impressionId }))
          : fetch('/api/ads/impressions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ impression_id: impressionId }),
              keepalive: true
            }).catch(() => {});
      } catch (_) { /* silent */ }
    }

    /** Track click then redirect to destination. */
    trackClick(ad) {
      const dest = ad.destination_url || ad.url || '#';
      try {
        fetch('/api/ads/clicks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            ad_id: ad.id,
            impression_id: ad.impression_id,
            user_hash: getUserContext().user_hash
          }),
          keepalive: true
        }).catch(() => {});
      } catch (_) { /* silent */ }
      // Navigate after a short delay to allow the beacon to fire
      setTimeout(() => {
        if (dest.startsWith('http')) {
          window.open(dest, '_blank', 'noopener');
        } else {
          window.location.href = dest;
        }
      }, 150);
    }

    /** Gracefully hide the ad container. */
    hideSlot() {
      if (!this.container) return;
      const slot = this.container.querySelector('.jad-slot');
      if (slot) {
        slot.classList.remove('jad-visible');
        setTimeout(() => this.container.classList.add('jad-hidden'), 600);
      } else {
        if (this.options.fallbackHtml) {
          this.container.innerHTML = this.options.fallbackHtml;
        } else {
          this.container.classList.add('jad-hidden');
        }
      }
    }

    /** Reload a new ad. */
    refresh() {
      if (this._dismissed) return;
      this.loadAd();
    }

    /** Cleanup interval, listeners, DOM. */
    destroy() {
      if (this._intervalId) clearInterval(this._intervalId);
      document.removeEventListener('visibilitychange', this._boundVisChange);
      if (this.container) {
        this.container.innerHTML = '';
        this.container.classList.add('jad-hidden');
      }
      this._intervalId = null;
      this._currentAd = null;
    }

    // ------ Private: Renderers ------

    _renderBanner(ad, showLabel) {
      return `
        <div class="jad-slot jad-banner" role="complementary" aria-label="Partenaire JADOMI">
          ${showLabel ? '<span class="jad-label">Partenaire JADOMI</span>' : ''}
          <button class="jad-close" aria-label="Fermer" title="Fermer">&#x2715;</button>
          ${ad.image_url ? `<div class="jad-img"><img src="${esc(ad.image_url)}" alt="" loading="lazy"></div>` : ''}
          <div class="jad-body">
            <div class="jad-title">${esc(ad.title)}</div>
            <div class="jad-desc">${esc(ad.description)}</div>
          </div>
          <div class="jad-actions">
            <button class="jad-cta" data-jad-click>${esc(ad.cta_text || 'En savoir plus')}</button>
          </div>
        </div>`;
    }

    _renderSidebar(ad, showLabel) {
      return `
        <div class="jad-slot jad-sidebar" role="complementary" aria-label="Suggestion JADOMI">
          ${ad.image_url ? `<div class="jad-img"><img src="${esc(ad.image_url)}" alt="" loading="lazy"></div>` : ''}
          <div class="jad-body">
            <div class="jad-title">${esc(ad.title)}</div>
            <div class="jad-desc">${esc(ad.description)}</div>
          </div>
          <div class="jad-footer">
            ${showLabel ? '<span class="jad-label">Suggestion JADOMI</span>' : '<span></span>'}
            <button class="jad-cta" data-jad-click>${esc(ad.cta_text || 'Decouvrir')}</button>
          </div>
        </div>`;
    }

    _renderNative(ad, showLabel) {
      return `
        <div class="jad-slot jad-native" role="complementary" aria-label="Suggestion pour vous" data-jad-click style="cursor:pointer;">
          ${ad.image_url ? `<div class="jad-img"><img src="${esc(ad.image_url)}" alt="" loading="lazy"></div>` : ''}
          <div class="jad-body">
            ${showLabel ? '<div class="jad-prefix">Suggestion pour vous</div>' : ''}
            <div class="jad-title">${esc(ad.title)}</div>
            <div class="jad-desc">${esc(ad.description)}</div>
          </div>
          <div class="jad-actions">
            <button class="jad-cta">${esc(ad.cta_text || 'Voir')}</button>
          </div>
        </div>`;
    }

    // ------ Private: Auto-refresh ------

    _startAutoRefresh() {
      if (this.options.refreshInterval <= 0) return;
      this._intervalId = setInterval(() => {
        if (document.visibilityState === 'visible' && !this._dismissed) {
          this.loadAd();
        }
      }, this.options.refreshInterval);
    }

    _onVisibilityChange() {
      // When tab becomes visible again, refresh immediately if interval elapsed
      if (document.visibilityState === 'visible' && !this._dismissed) {
        this.loadAd();
      }
    }

    // ------ Private: Error handling ------

    _handleError(err) {
      if (!this._retried) {
        // Retry once after 5 seconds
        this._retried = true;
        setTimeout(() => this.loadAd(), 5000);
      } else {
        // Second failure: hide gracefully
        this.hideSlot();
      }
    }
  }

  // ----------------------------------------------------------------
  // Expose globally
  // ----------------------------------------------------------------
  window.JadomiAdSlot = JadomiAdSlot;

  // ----------------------------------------------------------------
  // Auto-initialize from data attributes
  // ----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-jadomi-ad]').forEach((el) => {
      if (!el.id) {
        el.id = 'jad-auto-' + Math.random().toString(36).slice(2, 8);
      }
      new JadomiAdSlot(el.id, el.dataset.jadomiAd);
    });
  });

})();
