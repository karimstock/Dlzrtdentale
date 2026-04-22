// =============================================
// JADOMI — Coach Tooltips System
// Contextual tooltip guides for every key UI element
// Passe 25
// =============================================

(function() {
  'use strict';

  const TOOLTIP_CSS = `
.coach-tooltip{position:fixed;z-index:9999;width:300px;background:linear-gradient(145deg,#1f1f2b,#15151f);border:1px solid rgba(201,169,97,0.25);border-radius:14px;padding:1.1rem;box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 30px rgba(201,169,97,0.1);opacity:0;transform:translateY(8px);pointer-events:none;transition:all 300ms cubic-bezier(.16,1,.3,1);font-family:'DM Sans','Inter',sans-serif}
.coach-tooltip.visible{opacity:1;transform:translateY(0);pointer-events:auto}
.coach-tooltip::before{content:'';position:absolute;top:-7px;left:24px;width:14px;height:14px;background:#1f1f2b;border-left:1px solid rgba(201,169,97,0.25);border-top:1px solid rgba(201,169,97,0.25);transform:rotate(45deg)}
.coach-tooltip.below::before{top:-7px}
.coach-tooltip.above::before{top:auto;bottom:-7px;border-left:none;border-top:none;border-right:1px solid rgba(201,169,97,0.25);border-bottom:1px solid rgba(201,169,97,0.25)}
.ct-header{display:flex;align-items:center;gap:0.45rem;margin-bottom:0.6rem}
.ct-icon{font-size:1.3rem}
.ct-title{font-family:'Syne',sans-serif;font-size:0.9rem;color:white;flex:1;font-weight:600}
.ct-close{background:transparent;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:1rem;padding:2px 4px;line-height:1}
.ct-close:hover{color:rgba(255,255,255,0.8)}
.ct-description{font-size:0.82rem;color:rgba(255,255,255,0.65);line-height:1.55;margin-bottom:0.8rem}
.ct-footer{display:flex;align-items:center;justify-content:space-between}
.ct-got-it{background:rgba(201,169,97,0.12);color:#c9a961;border:1px solid rgba(201,169,97,0.25);padding:0.3rem 0.75rem;border-radius:8px;cursor:pointer;font-size:0.75rem;font-weight:600;font-family:inherit;transition:all 200ms}
.ct-got-it:hover{background:rgba(201,169,97,0.22)}
.ct-dismiss{display:flex;align-items:center;gap:4px;font-size:0.7rem;color:rgba(255,255,255,0.35);cursor:pointer;background:none;border:none;font-family:inherit}
.ct-dismiss:hover{color:rgba(255,255,255,0.6)}
.coach-toggle-btn{background:rgba(201,169,97,0.1);border:1px solid rgba(201,169,97,0.2);color:#c9a961;width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;transition:all 200ms}
.coach-toggle-btn:hover{background:rgba(201,169,97,0.2);transform:scale(1.05)}
.coach-toggle-btn.disabled{opacity:0.4}
[data-coach-tip-id]{position:relative}
[data-coach-tip-id].coach-highlight::after{content:'';position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:#c9a961;animation:ctPulse 2s ease-in-out infinite}
@keyframes ctPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.3)}}
  `;

  class JadomiCoachTooltips {
    constructor() {
      this.enabled = true;
      this.seen = new Set();
      this.tooltipEl = null;
      this.hideTimer = null;
      this.currentTipId = null;
      this.tooltipsData = {};
    }

    async init() {
      // Inject CSS
      const s = document.createElement('style');
      s.textContent = TOOLTIP_CSS;
      document.head.appendChild(s);

      try {
        const token = this._getToken();
        const societeId = this._getSocieteId();
        if (!token || !societeId) return;

        // Get state
        const stateRes = await fetch('/api/coach/state?societe_id=' + societeId, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!stateRes.ok) return;
        const { state } = await stateRes.json();

        this.enabled = state?.tooltips_enabled !== false;
        this.seen = new Set(state?.tooltips_seen || []);

        // Get tooltips data for this profession
        const welcomeRes = await fetch('/api/coach/generate-welcome', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId })
        });
        if (welcomeRes.ok) {
          const result = await welcomeRes.json();
          this.tooltipsData = result.welcome?.tooltips || {};
        }
      } catch (err) {
        console.warn('[Coach Tooltips]', err.message);
      }

      this._createTooltipEl();
      this._attachListeners();
      this._addToggleButton();
      if (this.enabled) this._highlightUnseen();
    }

    _getToken() {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
        for (const k of keys) {
          const val = JSON.parse(localStorage.getItem(k));
          if (val?.access_token) return val.access_token;
        }
        const session = JSON.parse(localStorage.getItem('jadomi_session') || '{}');
        return session.access_token || null;
      } catch { return null; }
    }

    _getSocieteId() {
      return localStorage.getItem('societe_active_id') ||
             localStorage.getItem('selectedSocieteId') || null;
    }

    _createTooltipEl() {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'coach-tooltip';
      this.tooltipEl.innerHTML = `
        <div class="ct-header">
          <span class="ct-icon"></span>
          <span class="ct-title"></span>
          <button class="ct-close" aria-label="Fermer">&times;</button>
        </div>
        <div class="ct-description"></div>
        <div class="ct-footer">
          <button class="ct-got-it">J'ai compris</button>
          <button class="ct-dismiss">Ne plus afficher les guides</button>
        </div>
      `;
      document.body.appendChild(this.tooltipEl);

      this.tooltipEl.querySelector('.ct-close').addEventListener('click', () => this._hide());
      this.tooltipEl.querySelector('.ct-got-it').addEventListener('click', () => {
        this._markSeen(this.currentTipId);
        this._hide();
      });
      this.tooltipEl.querySelector('.ct-dismiss').addEventListener('click', () => {
        this._toggleAll(false);
        this._hide();
      });

      // Keep tooltip visible when hovering over it
      this.tooltipEl.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
      this.tooltipEl.addEventListener('mouseleave', () => this._scheduleHide());
    }

    _attachListeners() {
      document.querySelectorAll('[data-coach-tip-id]').forEach(el => {
        el.addEventListener('mouseenter', () => {
          if (!this.enabled) return;
          clearTimeout(this.hideTimer);
          this._show(el);
        });
        el.addEventListener('mouseleave', () => this._scheduleHide());
      });
    }

    _highlightUnseen() {
      document.querySelectorAll('[data-coach-tip-id]').forEach(el => {
        const id = el.dataset.coachTipId;
        if (!this.seen.has(id)) {
          el.classList.add('coach-highlight');
        }
      });
    }

    _show(target) {
      const id = target.dataset.coachTipId;
      if (this.seen.has(id)) return;

      // Get tooltip data - from data attributes OR from profession context
      const tipData = this.tooltipsData[id] || {};
      const icon = target.dataset.coachTipIcon || tipData.icon || '💡';
      const title = target.dataset.coachTipTitle || tipData.title || '';
      const description = target.dataset.coachTipDescription || tipData.description || '';

      if (!title && !description) return;

      this.tooltipEl.querySelector('.ct-icon').textContent = icon;
      this.tooltipEl.querySelector('.ct-title').textContent = title;
      this.tooltipEl.querySelector('.ct-description').textContent = description;

      // Position below target
      const rect = target.getBoundingClientRect();
      const tooltipWidth = 300;
      let left = rect.left;
      let top = rect.bottom + 10;

      // Adjust if overflowing right
      if (left + tooltipWidth > window.innerWidth - 16) {
        left = window.innerWidth - tooltipWidth - 16;
      }
      if (left < 16) left = 16;

      // If overflowing bottom, show above
      if (top + 200 > window.innerHeight) {
        top = rect.top - 200;
        this.tooltipEl.classList.remove('below');
        this.tooltipEl.classList.add('above');
      } else {
        this.tooltipEl.classList.remove('above');
        this.tooltipEl.classList.add('below');
      }

      this.tooltipEl.style.top = top + 'px';
      this.tooltipEl.style.left = left + 'px';
      this.tooltipEl.classList.add('visible');
      this.currentTipId = id;
    }

    _hide() {
      clearTimeout(this.hideTimer);
      this.tooltipEl.classList.remove('visible');
      this.currentTipId = null;
    }

    _scheduleHide() {
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => this._hide(), 400);
    }

    _markSeen(tipId) {
      if (!tipId) return;
      this.seen.add(tipId);

      // Remove highlight
      const el = document.querySelector(`[data-coach-tip-id="${tipId}"]`);
      if (el) el.classList.remove('coach-highlight');

      // Persist
      const token = this._getToken();
      const societeId = this._getSocieteId();
      if (token && societeId) {
        fetch('/api/coach/tooltip-seen', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId, tip_id: tipId })
        }).catch(() => {});
      }
    }

    _addToggleButton() {
      const topbar = document.querySelector('.topbar, .hdr, .hdr-right, [class*="topbar"]');
      if (!topbar) return;

      const btn = document.createElement('button');
      btn.className = 'coach-toggle-btn' + (this.enabled ? '' : ' disabled');
      btn.innerHTML = '🎓';
      btn.title = this.enabled ? 'Desactiver les guides' : 'Afficher les guides';
      btn.setAttribute('aria-label', 'Activer ou desactiver les guides');
      btn.addEventListener('click', () => {
        this.enabled = !this.enabled;
        btn.classList.toggle('disabled', !this.enabled);
        btn.title = this.enabled ? 'Desactiver les guides' : 'Afficher les guides';

        if (this.enabled) {
          this.seen.clear();
          this._highlightUnseen();
        } else {
          document.querySelectorAll('.coach-highlight').forEach(el =>
            el.classList.remove('coach-highlight'));
          this._hide();
        }

        this._toggleAll(this.enabled);
      });

      topbar.appendChild(btn);
    }

    _toggleAll(enabled) {
      const token = this._getToken();
      const societeId = this._getSocieteId();
      if (token && societeId) {
        fetch('/api/coach/toggle-tooltips', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId, enabled })
        }).catch(() => {});
      }
    }
  }

  window.JadomiCoachTooltips = JadomiCoachTooltips;

  // Auto-init after welcome modal
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => new JadomiCoachTooltips().init(), 3000);
  });
})();
