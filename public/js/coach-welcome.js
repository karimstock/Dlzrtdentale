// =============================================
// JADOMI — Coach Welcome Modal
// Personnalised onboarding 3 steps
// Passe 25
// =============================================

(function() {
  'use strict';

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
.coach-welcome-overlay{position:fixed;inset:0;background:rgba(10,10,15,0.85);backdrop-filter:blur(20px);z-index:10000;display:flex;align-items:center;justify-content:center;animation:cwFadeIn 600ms cubic-bezier(.16,1,.3,1)}
.coach-welcome-modal{width:min(820px,92vw);max-height:88vh;overflow-y:auto;background:linear-gradient(145deg,rgba(124,58,237,0.06),rgba(10,10,15,0.97));border:1px solid rgba(201,169,97,0.2);border-radius:24px;padding:2.5rem 3rem;position:relative;box-shadow:0 40px 120px rgba(0,0,0,0.6),0 0 60px rgba(124,58,237,0.15);animation:cwSlideUp 800ms cubic-bezier(.16,1,.3,1)}
.cw-particles{position:absolute;inset:0;border-radius:24px;overflow:hidden;pointer-events:none;background:radial-gradient(circle at 20% 30%,rgba(201,169,97,0.1),transparent 50%),radial-gradient(circle at 80% 70%,rgba(124,58,237,0.1),transparent 50%);animation:cwDrift 15s ease-in-out infinite}
.cw-content{position:relative;z-index:2}
.cw-step{display:none}.cw-step.active{display:block}
.cw-badge{display:inline-block;padding:0.35rem 0.9rem;background:rgba(201,169,97,0.12);border:1px solid rgba(201,169,97,0.25);border-radius:99px;color:#c9a961;font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin-bottom:1.5rem;opacity:0;animation:cwFadeUp 800ms cubic-bezier(.16,1,.3,1) 200ms forwards}
.cw-greeting{font-family:'Syne','Playfair Display',serif;font-size:clamp(1.8rem,4vw,3rem);font-weight:700;letter-spacing:-0.02em;color:white;margin-bottom:0.75rem;opacity:0;animation:cwFadeUp 900ms cubic-bezier(.16,1,.3,1) 400ms forwards;text-shadow:0 0 60px rgba(255,255,255,0.08)}
.cw-sub{font-size:1.1rem;color:rgba(255,255,255,0.85);margin-bottom:0.5rem;opacity:0;animation:cwFadeUp 900ms cubic-bezier(.16,1,.3,1) 550ms forwards}
.cw-desc{font-size:0.95rem;color:rgba(255,255,255,0.65);line-height:1.6;margin-bottom:2rem;opacity:0;animation:cwFadeUp 900ms cubic-bezier(.16,1,.3,1) 700ms forwards}
.cw-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.9rem;margin:1.5rem 0 2rem}
.cw-feature{padding:1.25rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;transition:all 400ms cubic-bezier(.16,1,.3,1);cursor:pointer}
.cw-feature:hover{transform:translateY(-3px);border-color:rgba(201,169,97,0.35);background:rgba(201,169,97,0.04)}
.cw-feature-icon{font-size:1.8rem;margin-bottom:0.6rem}
.cw-feature-title{font-family:'Syne',sans-serif;font-size:0.95rem;color:white;margin-bottom:0.35rem;font-weight:600}
.cw-feature-desc{font-size:0.8rem;color:rgba(255,255,255,0.6);line-height:1.5}
.cw-quickwins{list-style:none;padding:0;counter-reset:qw;margin:1.5rem 0 2rem}
.cw-quickwins li{counter-increment:qw;padding:1.1rem 1.1rem 1.1rem 3.8rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin-bottom:0.7rem;position:relative;color:white;transition:all 300ms cubic-bezier(.16,1,.3,1);cursor:pointer;font-size:0.95rem}
.cw-quickwins li::before{content:counter(qw);position:absolute;left:1rem;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#c9a961,#e8c77b);color:#1a1a1a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem}
.cw-quickwins li:hover{border-color:rgba(201,169,97,0.35);transform:translateX(4px)}
.cw-actions{display:flex;gap:0.7rem;margin-top:1.5rem}
.cw-btn-primary{background:linear-gradient(135deg,#c9a961,#e8c77b);color:#1a1a1a;padding:0.85rem 1.8rem;border:none;border-radius:12px;font-weight:600;font-size:0.9rem;cursor:pointer;transition:all 400ms cubic-bezier(.16,1,.3,1);box-shadow:0 8px 30px rgba(201,169,97,0.3);font-family:inherit}
.cw-btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(201,169,97,0.5)}
.cw-btn-ghost{background:transparent;color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);padding:0.85rem 1.8rem;border-radius:12px;font-weight:500;cursor:pointer;transition:all 300ms;font-family:inherit;font-size:0.9rem}
.cw-btn-ghost:hover{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.3)}
.cw-dots{display:flex;gap:6px;justify-content:center;margin-top:1.5rem}
.cw-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.2);transition:all 300ms}
.cw-dot.active{background:#c9a961;box-shadow:0 0 8px rgba(201,169,97,0.5)}
@keyframes cwFadeIn{from{opacity:0}to{opacity:1}}
@keyframes cwSlideUp{from{opacity:0;transform:translateY(40px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes cwFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes cwDrift{0%,100%{transform:translate(0,0)}33%{transform:translate(-15px,8px)}66%{transform:translate(10px,-8px)}}
@media(max-width:640px){.coach-welcome-modal{padding:1.5rem 1.25rem;border-radius:16px}.cw-features{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  class JadomiCoachWelcome {
    constructor() {
      this.currentStep = 1;
      this.data = null;
      this.overlay = null;
    }

    async init() {
      try {
        const token = this._getToken();
        const societeId = this._getSocieteId();
        if (!token || !societeId) return;

        // Check state
        const stateRes = await fetch('/api/coach/state?societe_id=' + societeId, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!stateRes.ok) return;
        const { state } = await stateRes.json();

        if (state && state.welcome_shown) return;

        // Generate welcome data
        const welcomeRes = await fetch('/api/coach/generate-welcome', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId })
        });
        if (!welcomeRes.ok) return;
        const result = await welcomeRes.json();
        this.data = result.welcome;

        this._render();
        this._attachListeners();

        // Mark as shown
        fetch('/api/coach/welcome-shown', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId })
        }).catch(() => {});
      } catch (err) {
        console.warn('[Coach Welcome]', err.message);
      }
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

    _render() {
      const d = this.data;
      if (!d) return;

      this.overlay = document.createElement('div');
      this.overlay.className = 'coach-welcome-overlay';
      this.overlay.setAttribute('role', 'dialog');
      this.overlay.setAttribute('aria-label', 'Bienvenue dans JADOMI');

      const featuresHtml = (d.features || []).map(f => `
        <div class="cw-feature" data-route="${f.route || '#'}">
          <div class="cw-feature-icon">${f.icon}</div>
          <div class="cw-feature-title">${f.title}</div>
          <div class="cw-feature-desc">${f.description}</div>
        </div>
      `).join('');

      const quickwinsHtml = (d.quickwins || []).map(q => `
        <li data-action="${q.action || ''}" data-route="${q.route || '#'}">${q.label}</li>
      `).join('');

      this.overlay.innerHTML = `
        <div class="coach-welcome-modal">
          <div class="cw-particles"></div>
          <div class="cw-content">
            <div class="cw-step active" data-step="1">
              <div class="cw-badge">JADOMI vous accueille</div>
              <div class="cw-greeting">${d.titre} ${d.nom},</div>
              <div class="cw-sub">${d.sous_titre}</div>
              <div class="cw-desc">${d.description}</div>
              <div class="cw-actions">
                <button class="cw-btn-primary" data-action="next">Decouvrir en 2 minutes</button>
                <button class="cw-btn-ghost" data-action="skip">Passer l'introduction</button>
              </div>
            </div>
            <div class="cw-step" data-step="2">
              <div class="cw-greeting" style="font-size:clamp(1.4rem,3vw,2rem);animation:none;opacity:1;">Votre tableau de bord en 1 coup d'oeil</div>
              <div class="cw-features">${featuresHtml}</div>
              <div class="cw-actions">
                <button class="cw-btn-ghost" data-action="back">Retour</button>
                <button class="cw-btn-primary" data-action="next">Continuer</button>
              </div>
            </div>
            <div class="cw-step" data-step="3">
              <div class="cw-greeting" style="font-size:clamp(1.4rem,3vw,2rem);animation:none;opacity:1;">Vos 3 prochaines actions</div>
              <div class="cw-desc" style="animation:none;opacity:1;">Commencez par ces etapes pour demarrer fort.</div>
              <ol class="cw-quickwins">${quickwinsHtml}</ol>
              <div class="cw-actions">
                <button class="cw-btn-primary" data-action="complete">Lancer mon experience JADOMI</button>
              </div>
            </div>
            <div class="cw-dots">
              <div class="cw-dot active" data-dot="1"></div>
              <div class="cw-dot" data-dot="2"></div>
              <div class="cw-dot" data-dot="3"></div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.overlay);
    }

    _attachListeners() {
      if (!this.overlay) return;

      this.overlay.querySelectorAll('[data-action="next"]').forEach(b =>
        b.addEventListener('click', () => this._goStep(this.currentStep + 1)));
      this.overlay.querySelectorAll('[data-action="back"]').forEach(b =>
        b.addEventListener('click', () => this._goStep(this.currentStep - 1)));
      this.overlay.querySelectorAll('[data-action="skip"]').forEach(b =>
        b.addEventListener('click', () => this._skip()));
      this.overlay.querySelectorAll('[data-action="complete"]').forEach(b =>
        b.addEventListener('click', () => this._complete()));

      // Feature card clicks
      this.overlay.querySelectorAll('.cw-feature').forEach(card =>
        card.addEventListener('click', () => {
          const route = card.dataset.route;
          if (route && route !== '#') {
            this._close();
            window.location.href = route;
          }
        }));

      // Quickwin clicks
      this.overlay.querySelectorAll('.cw-quickwins li').forEach(li =>
        li.addEventListener('click', () => {
          const route = li.dataset.route;
          if (route && route !== '#') {
            this._close();
            window.location.href = route;
          }
        }));
    }

    _goStep(step) {
      if (step < 1 || step > 3) return;
      this.overlay.querySelectorAll('.cw-step').forEach(s => s.classList.remove('active'));
      this.overlay.querySelector(`[data-step="${step}"]`).classList.add('active');
      this.overlay.querySelectorAll('.cw-dot').forEach(d => d.classList.remove('active'));
      this.overlay.querySelector(`[data-dot="${step}"]`).classList.add('active');
      this.currentStep = step;
    }

    async _complete() {
      const token = this._getToken();
      const societeId = this._getSocieteId();
      try {
        await fetch('/api/coach/welcome-completed', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId })
        });
      } catch {}
      this._close();
    }

    async _skip() {
      const token = this._getToken();
      const societeId = this._getSocieteId();
      try {
        await fetch('/api/coach/welcome-skipped', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ societe_id: societeId })
        });
      } catch {}
      this._close();
    }

    _close() {
      if (this.overlay) {
        this.overlay.style.opacity = '0';
        this.overlay.style.transition = 'opacity 300ms';
        setTimeout(() => this.overlay.remove(), 300);
      }
    }
  }

  window.JadomiCoachWelcome = JadomiCoachWelcome;

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => new JadomiCoachWelcome().init(), 1500);
  });
})();
