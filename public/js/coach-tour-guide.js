// =============================================
// JADOMI — Tour Guide Interactif (Intercom-style)
// Spotlight overlay + bulles explicatives + navigation etapes
// Passe 31
// =============================================
(function() {
  'use strict';

  const CSS = `
.jt-overlay{position:fixed;inset:0;z-index:9998;pointer-events:none;opacity:0;transition:opacity .4s cubic-bezier(.16,1,.3,1)}
.jt-overlay.active{opacity:1}
.jt-overlay svg{width:100%;height:100%;position:absolute;inset:0}
.jt-overlay .jt-mask-bg{fill:rgba(10,10,15,.82)}
.jt-overlay .jt-spotlight{rx:12;ry:12;transition:x .7s cubic-bezier(.4,0,.2,1),y .7s cubic-bezier(.4,0,.2,1),width .7s cubic-bezier(.4,0,.2,1),height .7s cubic-bezier(.4,0,.2,1)}
.jt-overlay .jt-spotlight-glow{stroke:#c9a961;stroke-width:2;fill:none;rx:12;ry:12;filter:url(#jt-glow);transition:x .7s cubic-bezier(.4,0,.2,1),y .7s cubic-bezier(.4,0,.2,1),width .7s cubic-bezier(.4,0,.2,1),height .7s cubic-bezier(.4,0,.2,1)}
.jt-tooltip{position:fixed;z-index:9999;width:380px;background:linear-gradient(145deg,#1f1f2b,#12121a);border:1px solid rgba(201,169,97,.3);border-radius:20px;padding:0;box-shadow:0 24px 80px rgba(0,0,0,.5),0 0 60px rgba(201,169,97,.12);opacity:0;transform:translateY(12px) scale(.96);filter:blur(4px);transition:opacity .5s ease,transform .6s cubic-bezier(.34,1.56,.64,1),filter .4s ease;pointer-events:auto}
.jt-tooltip.visible{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}
.jt-progress{display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
.jt-step-count{font-size:.72rem;color:#c9a961;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.jt-dots{display:flex;gap:5px}
.jt-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.15);transition:all .3s}
.jt-dot.done{background:#c9a961}
.jt-dot.current{background:#c9a961;box-shadow:0 0 8px rgba(201,169,97,.5);width:18px;border-radius:3px}
.jt-skip{background:transparent;border:none;color:rgba(255,255,255,.4);font-size:.82rem;cursor:pointer;font-family:inherit;transition:color .2s;padding:4px 8px}
.jt-skip:hover{color:rgba(255,255,255,.8)}
.jt-body{padding:20px 24px}
.jt-icon{font-size:2.2rem;margin-bottom:10px;display:block}
.jt-title{font-family:'Syne',serif;font-size:1.25rem;color:#fff;margin:0 0 8px;font-weight:700;letter-spacing:-.01em}
.jt-desc{color:rgba(255,255,255,.7);font-size:.92rem;line-height:1.6;margin:0}
.jt-actions{display:flex;gap:10px;justify-content:flex-end;padding:0 24px 20px}
.jt-btn-prev,.jt-btn-next{padding:10px 22px;border-radius:99px;font-size:.88rem;font-weight:600;cursor:pointer;transition:all .3s cubic-bezier(.16,1,.3,1);font-family:inherit;border:none}
.jt-btn-prev{background:transparent;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.12)}
.jt-btn-prev:hover{background:rgba(255,255,255,.05);color:#fff;border-color:rgba(255,255,255,.25)}
.jt-btn-next{background:linear-gradient(135deg,#c9a961,#e8c77b);color:#1a1a1f;box-shadow:0 8px 24px rgba(201,169,97,.3)}
.jt-btn-next:hover{transform:translateY(-1px);box-shadow:0 12px 36px rgba(201,169,97,.45)}
.jt-completion{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .6s ease}
.jt-completion.visible{opacity:1}
.jt-completion.fade-out{opacity:0;transition:opacity .8s ease}
.jt-completion-backdrop{position:absolute;inset:0;background:radial-gradient(circle at center,rgba(201,169,97,.1),rgba(10,10,15,.85) 60%);backdrop-filter:blur(16px)}
.jt-completion-content{position:relative;text-align:center;transform:translateY(16px);transition:transform 1s cubic-bezier(.16,1,.3,1)}
.jt-completion.visible .jt-completion-content{transform:translateY(0)}
.jt-checkmark{margin-bottom:28px}
.jt-check-circle{stroke-dasharray:188;stroke-dashoffset:188;animation:jtDrawCircle .8s ease-out .2s forwards}
.jt-check-tick{stroke-dasharray:40;stroke-dashoffset:40;animation:jtDrawTick .4s ease-out .9s forwards}
@keyframes jtDrawCircle{to{stroke-dashoffset:0}}
@keyframes jtDrawTick{to{stroke-dashoffset:0}}
.jt-completion h3{font-family:'Syne',serif;font-size:2.2rem;font-weight:300;color:#fff;letter-spacing:-.02em;margin:0 0 6px}
.jt-completion .jt-user-name{font-family:'Syne',serif;font-size:1rem;color:#c9a961;font-weight:500;margin:0 0 20px;letter-spacing:.02em}
.jt-completion p{color:rgba(255,255,255,.6);font-size:.95rem;line-height:1.6;max-width:380px;margin:0 auto}
@media(max-width:640px){.jt-tooltip{width:calc(100vw - 32px);left:16px!important;right:16px!important}.jt-completion{min-width:auto;width:calc(100vw - 40px)}}
@media(prefers-reduced-motion:reduce){.jt-overlay,.jt-tooltip,.jt-completion,.jt-overlay .jt-spotlight,.jt-overlay .jt-spotlight-glow{transition:none!important;animation:none!important}}
`;

  // Inject CSS
  if (!document.getElementById('jt-css')) {
    const s = document.createElement('style');
    s.id = 'jt-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  class JadomiTourGuide {
    constructor(opts = {}) {
      this.steps = opts.steps || [];
      this.current = 0;
      this.overlay = null;
      this.tooltip = null;
      this.onComplete = opts.onComplete || (() => {});
      this.onSkip = opts.onSkip || (() => {});
      this._resizeHandler = null;
    }

    start() {
      if (!this.steps.length) return;
      this._createOverlay();
      this._createTooltip();
      this._showStep(0);
      this._resizeHandler = () => this._repositionCurrent();
      window.addEventListener('resize', this._resizeHandler);
    }

    _createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.className = 'jt-overlay';
      this.overlay.innerHTML = `
        <svg><defs>
          <filter id="jt-glow"><feGaussianBlur stdDeviation="4" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <mask id="jt-mask">
            <rect width="100%" height="100%" fill="white"/>
            <rect class="jt-spotlight" x="0" y="0" width="0" height="0" fill="black"/>
          </mask>
        </defs>
        <rect class="jt-mask-bg" width="100%" height="100%" mask="url(#jt-mask)"/>
        <rect class="jt-spotlight-glow" x="0" y="0" width="0" height="0"/></svg>`;
      document.body.appendChild(this.overlay);
      requestAnimationFrame(() => this.overlay.classList.add('active'));
    }

    _createTooltip() {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'jt-tooltip';

      const dotsHtml = this.steps.map((_, i) =>
        `<div class="jt-dot${i === 0 ? ' current' : ''}" data-i="${i}"></div>`
      ).join('');

      this.tooltip.innerHTML = `
        <div class="jt-progress">
          <span class="jt-step-count"></span>
          <div class="jt-dots">${dotsHtml}</div>
          <button class="jt-skip" aria-label="Passer le tour">Passer</button>
        </div>
        <div class="jt-body">
          <span class="jt-icon"></span>
          <h3 class="jt-title"></h3>
          <p class="jt-desc"></p>
        </div>
        <div class="jt-actions">
          <button class="jt-btn-prev" aria-label="Etape precedente">← Precedent</button>
          <button class="jt-btn-next" aria-label="Etape suivante">Suivant →</button>
        </div>`;
      document.body.appendChild(this.tooltip);

      this.tooltip.querySelector('.jt-btn-next').addEventListener('click', () => this._next());
      this.tooltip.querySelector('.jt-btn-prev').addEventListener('click', () => this._prev());
      this.tooltip.querySelector('.jt-skip').addEventListener('click', () => this._skip());
      document.addEventListener('keydown', this._keyHandler = (e) => {
        if (e.key === 'Escape') this._skip();
        if (e.key === 'ArrowRight') this._next();
        if (e.key === 'ArrowLeft') this._prev();
      });
    }

    async _showStep(idx) {
      if (idx < 0 || idx >= this.steps.length) return;
      this.current = idx;
      const step = this.steps[idx];

      // Find target element
      const el = document.querySelector(step.target);
      if (!el) {
        // Skip missing element
        if (idx < this.steps.length - 1) return this._showStep(idx + 1);
        return this._complete();
      }

      // Phase 1: hide tooltip, scroll to element
      this.tooltip.classList.remove('visible');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 300));

      // Phase 2: move spotlight (smooth CSS transition handles animation)
      const pad = step.padding || 10;
      const rect = el.getBoundingClientRect();
      const spotlight = this.overlay.querySelector('.jt-spotlight');
      const glow = this.overlay.querySelector('.jt-spotlight-glow');
      [spotlight, glow].forEach(r => {
        r.setAttribute('x', rect.left - pad);
        r.setAttribute('y', rect.top - pad);
        r.setAttribute('width', rect.width + pad * 2);
        r.setAttribute('height', rect.height + pad * 2);
      });

      // Phase 3: wait for spotlight to settle, then show tooltip
      await new Promise(r => setTimeout(r, 450));

      // Update tooltip content
      this.tooltip.querySelector('.jt-step-count').textContent = `Etape ${idx + 1} / ${this.steps.length}`;
      this.tooltip.querySelector('.jt-icon').textContent = step.icon || '✨';
      this.tooltip.querySelector('.jt-title').textContent = step.title || '';
      this.tooltip.querySelector('.jt-desc').textContent = step.description || '';

      // Dots
      this.tooltip.querySelectorAll('.jt-dot').forEach((d, i) => {
        d.className = 'jt-dot' + (i < idx ? ' done' : '') + (i === idx ? ' current' : '');
      });

      // Buttons
      const prevBtn = this.tooltip.querySelector('.jt-btn-prev');
      const nextBtn = this.tooltip.querySelector('.jt-btn-next');
      prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = idx === this.steps.length - 1 ? "C'est parti !" : 'Suivant →';

      // Position tooltip then reveal
      this._positionTooltip(rect, step.placement || 'bottom');
      this.tooltip.classList.add('visible');
    }

    _positionTooltip(rect, placement) {
      const tw = 380;
      const gap = 16;
      let x, y;

      switch (placement) {
        case 'bottom':
          x = rect.left + rect.width / 2 - tw / 2;
          y = rect.bottom + gap;
          break;
        case 'top':
          x = rect.left + rect.width / 2 - tw / 2;
          y = rect.top - gap - 260;
          break;
        case 'right':
          x = rect.right + gap;
          y = rect.top + rect.height / 2 - 130;
          break;
        case 'left':
          x = rect.left - tw - gap;
          y = rect.top + rect.height / 2 - 130;
          break;
      }

      // Clamp to viewport
      x = Math.max(16, Math.min(x, window.innerWidth - tw - 16));
      y = Math.max(16, Math.min(y, window.innerHeight - 280));

      this.tooltip.style.left = x + 'px';
      this.tooltip.style.top = y + 'px';
    }

    _repositionCurrent() {
      if (this.current >= 0 && this.current < this.steps.length) {
        const step = this.steps[this.current];
        const el = document.querySelector(step.target);
        if (el) {
          const rect = el.getBoundingClientRect();
          const pad = step.padding || 10;
          const spotlight = this.overlay.querySelector('.jt-spotlight');
          const glow = this.overlay.querySelector('.jt-spotlight-glow');
          [spotlight, glow].forEach(r => {
            r.setAttribute('x', rect.left - pad);
            r.setAttribute('y', rect.top - pad);
            r.setAttribute('width', rect.width + pad * 2);
            r.setAttribute('height', rect.height + pad * 2);
          });
          this._positionTooltip(rect, step.placement || 'bottom');
        }
      }
    }

    _next() {
      this.tooltip.classList.remove('visible');
      setTimeout(() => {
        if (this.current < this.steps.length - 1) this._showStep(this.current + 1);
        else this._complete();
      }, 200);
    }

    _prev() {
      if (this.current > 0) {
        this.tooltip.classList.remove('visible');
        setTimeout(() => this._showStep(this.current - 1), 200);
      }
    }

    _skip() {
      this._cleanup();
      this.onSkip();
    }

    _complete() {
      this._cleanup();
      this._showCompletion();
      this.onComplete();
    }

    _showCompletion() {
      const toast = document.createElement('div');
      toast.className = 'jt-completion';
      toast.innerHTML = `
        <div class="jt-completion-backdrop"></div>
        <div class="jt-completion-content">
          <div class="jt-checkmark">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle class="jt-check-circle" cx="40" cy="40" r="36" stroke="#c9a961" stroke-width="2"/>
              <path class="jt-check-tick" d="M24 42l10 10 22-24" stroke="#c9a961" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </div>
          <h3>Bienvenue</h3>
          <div class="jt-user-name">Votre espace professionnel est pret.</div>
          <p>Vous maitrisez maintenant les fonctionnalites essentielles. Vous pouvez relancer ce tour a tout moment depuis les parametres.</p>
        </div>`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 800);
      }, 4000);
    }

    _cleanup() {
      if (this.overlay) { this.overlay.remove(); this.overlay = null; }
      if (this.tooltip) { this.tooltip.remove(); this.tooltip = null; }
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    }
  }

  window.JadomiTourGuide = JadomiTourGuide;
})();
