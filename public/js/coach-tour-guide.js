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
.jt-overlay .jt-spotlight{rx:12;ry:12;transition:x .5s cubic-bezier(.16,1,.3,1),y .5s cubic-bezier(.16,1,.3,1),width .5s cubic-bezier(.16,1,.3,1),height .5s cubic-bezier(.16,1,.3,1)}
.jt-overlay .jt-spotlight-glow{stroke:#c9a961;stroke-width:2;fill:none;rx:12;ry:12;filter:url(#jt-glow);transition:x .5s cubic-bezier(.16,1,.3,1),y .5s cubic-bezier(.16,1,.3,1),width .5s cubic-bezier(.16,1,.3,1),height .5s cubic-bezier(.16,1,.3,1)}
.jt-tooltip{position:fixed;z-index:9999;width:380px;background:linear-gradient(145deg,#1f1f2b,#12121a);border:1px solid rgba(201,169,97,.3);border-radius:20px;padding:0;box-shadow:0 24px 80px rgba(0,0,0,.5),0 0 60px rgba(201,169,97,.12);opacity:0;transform:translateY(12px) scale(.96);transition:all .5s cubic-bezier(.16,1,.3,1);pointer-events:auto}
.jt-tooltip.visible{opacity:1;transform:translateY(0) scale(1)}
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
.jt-completion{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(.85);z-index:10000;background:linear-gradient(145deg,#1f1f2b,#12121a);border:2px solid #c9a961;border-radius:24px;padding:48px 40px;text-align:center;box-shadow:0 40px 120px rgba(201,169,97,.25);opacity:0;transition:all .6s cubic-bezier(.16,1,.3,1);min-width:380px}
.jt-completion.visible{opacity:1;transform:translate(-50%,-50%) scale(1)}
.jt-completion-icon{font-size:3.5rem;margin-bottom:16px}
.jt-completion h3{font-family:'Syne',serif;font-size:1.6rem;color:#c9a961;margin:0 0 10px}
.jt-completion p{color:rgba(255,255,255,.75);font-size:.95rem;line-height:1.5;margin:0}
.jt-confetti{position:fixed;inset:0;pointer-events:none;z-index:10001}
.jt-confetti span{position:absolute;top:-10px;animation:jtFall 2.5s ease-out forwards}
@keyframes jtFall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
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

      // Scroll to element
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 350));

      // Position spotlight
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

      // Position tooltip
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
      this._showConfetti();
      this._showCompletion();
      this.onComplete();
    }

    _showConfetti() {
      const container = document.createElement('div');
      container.className = 'jt-confetti';
      const colors = ['#c9a961', '#e8c77b', '#7c3aed', '#22c55e', '#3b82f6', '#ec4899'];
      for (let i = 0; i < 60; i++) {
        const c = document.createElement('span');
        const size = 5 + Math.random() * 8;
        c.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random() * colors.length)]};border-radius:${Math.random() > .5 ? '50%' : '2px'};animation-delay:${Math.random() * .6}s;animation-duration:${1.8 + Math.random() * 1.5}s;`;
        container.appendChild(c);
      }
      document.body.appendChild(container);
      setTimeout(() => container.remove(), 4000);
    }

    _showCompletion() {
      const toast = document.createElement('div');
      toast.className = 'jt-completion';
      toast.innerHTML = `
        <div class="jt-completion-icon">🎉</div>
        <h3>Bienvenue sur JADOMI !</h3>
        <p>Vous maitrisez maintenant les fonctionnalites essentielles.<br>Vous pouvez relancer ce tour a tout moment depuis les parametres.</p>`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 500);
      }, 4500);
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
