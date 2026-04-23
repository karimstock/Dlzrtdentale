/* =============================================
   JADOMI — Onboarding V2 : Immersive Generative UI
   ============================================= */

(function() {
  'use strict';

  // --- Supabase init ---
  const SUPABASE_URL = window.__SUPABASE_URL__ || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
  const SUPABASE_KEY = window.__SUPABASE_KEY__ || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzYm9td2p6ZWhuZmluZmp2aHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM3NTE4NDQsImV4cCI6MjA0OTMyNzg0NH0.sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // --- Auth helpers ---
  async function getToken() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { window.location.href = '/login.html'; return null; }
    return session.access_token;
  }

  function getSocieteId() {
    return localStorage.getItem('societe_active_id');
  }

  async function apiJson(path, opts = {}) {
    const token = await getToken();
    if (!token) return null;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'X-Societe-Id': getSocieteId(),
      ...(opts.headers || {})
    };
    try {
      const res = await fetch(path, { ...opts, headers });
      return await res.json();
    } catch (err) {
      console.error('[onboarding-v2] API error:', err.message);
      return null;
    }
  }

  // --- Fallback themes (if API fails) ---
  const FALLBACK_THEMES = [
    { slug: 'ivory_gold', name: 'Ivoire & Or', description: 'Luxe mineral, marbre et dore chaud', metier_category: 'sante', professions: ['dentiste','medecin','kine'], color_primary: '#c9a961', color_primary_dark: '#a8893f', color_text: '#1a1a1a', color_text_muted: '#666', color_background: '#faf8f5', color_surface: '#f0ece4', color_border: '#e0d8cc', color_footer_bg: '#0f1629', color_footer_text: '#fff', font_heading: 'Playfair Display', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 1 },
    { slug: 'midnight_emerald', name: 'Minuit Emeraude', description: 'Profondeur nocturne et eclats verts', metier_category: 'droit', professions: ['avocat','notaire'], color_primary: '#2ecc71', color_primary_dark: '#27ae60', color_text: '#e8e8e8', color_text_muted: '#aaa', color_background: '#0a1a14', color_surface: '#0d2018', color_border: '#1a3028', color_footer_bg: '#060e0a', color_footer_text: '#ccc', font_heading: 'Cormorant Garamond', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 2 },
    { slug: 'bordeaux_velvet', name: 'Bordeaux Velours', description: 'Richesse textile et tons chauds', metier_category: 'all', professions: ['*'], color_primary: '#8b2252', color_primary_dark: '#6a1a3f', color_text: '#f5f0eb', color_text_muted: '#c0b0a0', color_background: '#1a0a12', color_surface: '#2a1420', color_border: '#3a2030', color_footer_bg: '#0a0408', color_footer_text: '#ddd', font_heading: 'Playfair Display', font_body: 'Lora', premium: false, min_plan: 'essentiel', sort_order: 3 },
    { slug: 'clinical_white', name: 'Clinique Blanc', description: 'Precision medicale et proprete absolue', metier_category: 'sante', professions: ['dentiste','medecin','kine','osteopathe'], color_primary: '#0077b6', color_primary_dark: '#005f92', color_text: '#1a1a1a', color_text_muted: '#666', color_background: '#ffffff', color_surface: '#f5f7fa', color_border: '#e0e4e8', color_footer_bg: '#1a2030', color_footer_text: '#fff', font_heading: 'Montserrat', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 4 },
    { slug: 'terracotta_earth', name: 'Terre Cuite', description: 'Chaleur naturelle, authenticite brute', metier_category: 'all', professions: ['*'], color_primary: '#c0734a', color_primary_dark: '#a05c38', color_text: '#2a1f18', color_text_muted: '#6b5a4e', color_background: '#faf5f0', color_surface: '#f0e8df', color_border: '#d8c8b8', color_footer_bg: '#2a1f18', color_footer_text: '#f0e8df', font_heading: 'Lora', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 5 },
    { slug: 'sage_forest', name: 'Sauge & Foret', description: 'Serenite vegetale et equilibre', metier_category: 'sante', professions: ['kine','osteopathe','medecin'], color_primary: '#6b8f71', color_primary_dark: '#557a5b', color_text: '#1a2a1e', color_text_muted: '#5a6a5e', color_background: '#f5f8f5', color_surface: '#e8f0e8', color_border: '#c8d8c8', color_footer_bg: '#1a2a1e', color_footer_text: '#e8f0e8', font_heading: 'Raleway', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 6 },
    { slug: 'ocean_deep', name: 'Ocean Profond', description: 'Abysses bleues et luminescence', metier_category: 'all', professions: ['*'], color_primary: '#1e90ff', color_primary_dark: '#1876cc', color_text: '#e0e8f0', color_text_muted: '#8a9ab0', color_background: '#080c18', color_surface: '#0c1224', color_border: '#1a2240', color_footer_bg: '#04060c', color_footer_text: '#c0c8d0', font_heading: 'Syne', font_body: 'Inter', premium: false, min_plan: 'professionnel', sort_order: 7 },
    { slug: 'rose_porcelain', name: 'Rose Porcelaine', description: 'Delicatesse et raffinement pastel', metier_category: 'beaute', professions: ['coiffeur'], color_primary: '#d4a0a0', color_primary_dark: '#b88888', color_text: '#3a2a2a', color_text_muted: '#8a7070', color_background: '#fdf5f5', color_surface: '#f8eaea', color_border: '#e8d0d0', color_footer_bg: '#3a2a2a', color_footer_text: '#f8eaea', font_heading: 'Cormorant Garamond', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 8 },
    { slug: 'charcoal_bronze', name: 'Charbon & Bronze', description: 'Puissance industrielle et metal chaud', metier_category: 'all', professions: ['*'], color_primary: '#cd7f32', color_primary_dark: '#a86828', color_text: '#e0d8d0', color_text_muted: '#9a9088', color_background: '#1a1816', color_surface: '#242220', color_border: '#3a3836', color_footer_bg: '#0e0d0c', color_footer_text: '#c0b8b0', font_heading: 'Montserrat', font_body: 'Inter', premium: false, min_plan: 'professionnel', sort_order: 9 },
    { slug: 'navy_saffron', name: 'Marine & Safran', description: 'Contraste maritime et epices chaudes', metier_category: 'restauration', professions: ['restaurant'], color_primary: '#e8a838', color_primary_dark: '#c88c28', color_text: '#e8e0d8', color_text_muted: '#a0988c', color_background: '#0c1428', color_surface: '#101a30', color_border: '#1a2a48', color_footer_bg: '#060a14', color_footer_text: '#c8c0b8', font_heading: 'Poppins', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 10 },
    { slug: 'pure_minimal', name: 'Pure Minimal', description: 'Simplicite radicale et espace', metier_category: 'all', professions: ['architecte','*'], color_primary: '#1a1a1a', color_primary_dark: '#000000', color_text: '#1a1a1a', color_text_muted: '#888', color_background: '#ffffff', color_surface: '#f8f8f8', color_border: '#e8e8e8', color_footer_bg: '#1a1a1a', color_footer_text: '#fff', font_heading: 'Syne', font_body: 'Inter', premium: false, min_plan: 'essentiel', sort_order: 11 },
    { slug: 'royal_purple', name: 'Pourpre Royal', description: 'Noblesse violette et prestige absolu', metier_category: 'droit', professions: ['avocat','notaire'], color_primary: '#7b2d8e', color_primary_dark: '#5c2268', color_text: '#f0e8f5', color_text_muted: '#b0a0c0', color_background: '#0e0818', color_surface: '#140c20', color_border: '#2a1a3a', color_footer_bg: '#08040e', color_footer_text: '#d0c0e0', font_heading: 'Cormorant Garamond', font_body: 'Inter', premium: true, min_plan: 'prestige', sort_order: 12 }
  ];

  // --- Profession list ---
  const PROFESSIONS = [
    { slug: 'dentiste', name: 'Dentiste' },
    { slug: 'medecin', name: 'Medecin' },
    { slug: 'avocat', name: 'Avocat(e)' },
    { slug: 'kine', name: 'Kinesitherapeute' },
    { slug: 'notaire', name: 'Notaire' },
    { slug: 'architecte', name: 'Architecte' },
    { slug: 'restaurant', name: 'Restaurant' },
    { slug: 'coiffeur', name: 'Coiffeur' },
    { slug: 'osteopathe', name: 'Osteopathe' },
  ];

  // SVG icons for professions (no emojis)
  const PROF_ICONS = {
    dentiste: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C8 2 5 5 5 8c0 4 2 6 3 10 .5 2 1.5 4 4 4s3.5-2 4-4c1-4 3-6 3-10 0-3-3-6-7-6z"/></svg>',
    medecin: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4v8m-4-4h8"/><circle cx="12" cy="12" r="10"/></svg>',
    avocat: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7h20L12 2zM4 7v10h16V7M2 22h20M12 7v10"/></svg>',
    kine: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="3"/><path d="M12 8v6m-4 2l4-2 4 2m-8 0v4m8-4v4"/></svg>',
    notaire: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h5"/></svg>',
    architecte: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V7l7-5 7 5v14M9 21v-6h6v6"/></svg>',
    restaurant: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 2v20M14 2v6c0 2 2 4 4 4M6 2v4a4 4 0 004 4h0a4 4 0 004-4V2M10 10v12"/></svg>',
    coiffeur: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2l6 10-6 10M18 2l-6 10 6 10"/></svg>',
    osteopathe: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="3"/><path d="M8 22c0-4 1-7 4-10 3 3 4 6 4 10"/></svg>',
  };

  // =============================================
  // ThemeCarousel Class
  // =============================================
  class ThemeCarousel {
    constructor(container, themes, onSelect) {
      this.container = container;
      this.themes = themes;
      this.onSelect = onSelect;
      this.currentIndex = 0;
      this.selectedSlug = null;
      this.isMobile = window.innerWidth < 768;
      this.render();
      this.attachEvents();
    }

    render() {
      const track = this.container.querySelector('.tc-track');
      track.innerHTML = this.themes.map((t, i) => this.renderCard(t, i)).join('');
      if (!this.isMobile) {
        this.updatePositions();
      }
      this.renderIndicators();
    }

    renderCard(theme, index) {
      const bg = 'linear-gradient(135deg, ' + theme.color_background + ', ' + (theme.color_surface || theme.color_background) + ')';
      return '<div class="tc-card" data-theme-slug="' + theme.slug + '" data-index="' + index + '">' +
        '<div class="tc-check" aria-hidden="true">&#10003;</div>' +
        '<div class="tc-hero" style="background: ' + bg + '; font-family: ' + theme.font_heading + ', serif; color: ' + theme.color_text + ';">' +
          '<div class="tc-eyebrow" style="color: ' + theme.color_primary + '">CABINET</div>' +
          '<div class="tc-hero-title" style="font-family: ' + theme.font_heading + ', serif;">Votre Marque</div>' +
          '<div class="tc-hero-cta" style="background: ' + theme.color_primary + '; color: ' + theme.color_background + '; border: none; border-radius: 8px;">Decouvrir</div>' +
        '</div>' +
        '<div class="tc-swatch">' +
          '<span style="background: ' + theme.color_primary + '"></span>' +
          '<span style="background: ' + theme.color_text + '"></span>' +
          '<span style="background: ' + theme.color_background + '"></span>' +
          '<span style="background: ' + theme.color_footer_bg + '"></span>' +
        '</div>' +
        '<div class="tc-card-info">' +
          '<h3 class="tc-name">' + theme.name + '</h3>' +
          '<p class="tc-desc">' + theme.description + '</p>' +
          '<div class="tc-meta">' +
            '<span class="tc-metier">' + (theme.metier_category || 'all') + '</span>' +
            '<span class="tc-plan">Inclus ' + (theme.min_plan || 'essentiel') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    updatePositions() {
      if (this.isMobile) return;
      const cards = this.container.querySelectorAll('.tc-card');
      cards.forEach(function(card, i) {
        card.classList.remove('active', 'near');
        var diff = Math.abs(i - this.currentIndex);
        if (diff === 0) card.classList.add('active');
        else if (diff === 1) card.classList.add('near');
      }.bind(this));

      var track = this.container.querySelector('.tc-track');
      var cardWidth = 420 + 24;
      var centerOffset = window.innerWidth / 2 - (420 * 1.12 / 2);
      var offset = -(this.currentIndex * cardWidth) + centerOffset;
      track.style.transform = 'translateX(' + offset + 'px)';
      track.style.transition = 'transform 600ms cubic-bezier(.16, 1, .3, 1)';

      this.updateIndicators();
      this.applyThemeToBackground();
    }

    applyThemeToBackground() {
      var t = this.themes[this.currentIndex];
      if (!t) return;
      document.body.style.setProperty('--ob-primary', t.color_primary);
      document.body.style.setProperty('--ob-text', t.color_text);
      document.body.style.setProperty('--ob-bg', t.color_background);
      document.body.style.setProperty('--ob-footer', t.color_footer_bg);

      var overlay = document.querySelector('.ob-gradient-overlay');
      if (overlay) {
        overlay.style.background = 'linear-gradient(135deg, ' + t.color_footer_bg + 'ee, ' + t.color_background + '88)';
      }
    }

    next() {
      if (this.currentIndex < this.themes.length - 1) {
        this.currentIndex++;
        this.updatePositions();
      }
    }

    prev() {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.updatePositions();
      }
    }

    select(slug) {
      // Deselect previous
      var prev = this.container.querySelector('.tc-card.selected');
      if (prev) prev.classList.remove('selected');

      this.selectedSlug = slug;
      var card = this.container.querySelector('[data-theme-slug="' + slug + '"]');
      if (card) {
        card.classList.add('selected');
        var btn = this.container.querySelector('.tc-btn-validate');
        btn.classList.remove('hidden');
        var theme = this.themes.find(function(t) { return t.slug === slug; });
        btn.textContent = 'Valider "' + (theme ? theme.name : slug) + '"';
      }
    }

    attachEvents() {
      var self = this;

      // Arrows
      var leftArrow = this.container.querySelector('.tc-arrow-left');
      var rightArrow = this.container.querySelector('.tc-arrow-right');
      if (leftArrow) leftArrow.addEventListener('click', function() { self.prev(); });
      if (rightArrow) rightArrow.addEventListener('click', function() { self.next(); });

      // Card clicks
      this.container.addEventListener('click', function(e) {
        var card = e.target.closest('.tc-card');
        if (!card) return;
        var index = parseInt(card.dataset.index, 10);
        if (self.isMobile || index === self.currentIndex) {
          self.select(card.dataset.themeSlug);
          // On mobile, also apply theme
          if (self.isMobile) {
            self.currentIndex = index;
            self.applyThemeToBackground();
          }
        } else {
          self.currentIndex = index;
          self.updatePositions();
        }
      });

      // Validate
      this.container.querySelector('.tc-btn-validate').addEventListener('click', function() {
        if (self.selectedSlug) {
          self.onSelect(self.selectedSlug);
        }
      });

      // Keyboard
      this._keyHandler = function(e) {
        if (!self.container.isConnected) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); self.prev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); self.next(); }
        if (e.key === 'Enter' && self.themes[self.currentIndex]) {
          self.select(self.themes[self.currentIndex].slug);
        }
        if (e.key === 'Escape' && self.selectedSlug) {
          self.onSelect(self.selectedSlug);
        }
      };
      document.addEventListener('keydown', this._keyHandler);

      // Touch swipe
      var startX = 0;
      var track = this.container.querySelector('.tc-track');
      track.addEventListener('touchstart', function(e) {
        startX = e.touches[0].clientX;
      }, { passive: true });
      track.addEventListener('touchend', function(e) {
        var deltaX = e.changedTouches[0].clientX - startX;
        if (deltaX > 60) self.prev();
        else if (deltaX < -60) self.next();
      }, { passive: true });
    }

    renderIndicators() {
      var indicators = this.container.querySelector('.tc-indicators');
      if (!indicators) return;
      indicators.innerHTML = this.themes.map(function(_, i) {
        return '<span class="tc-dot ' + (i === this.currentIndex ? 'active' : '') + '" data-index="' + i + '" role="button" aria-label="Theme ' + (i + 1) + '"></span>';
      }.bind(this)).join('');
      var self = this;
      indicators.querySelectorAll('.tc-dot').forEach(function(dot) {
        dot.addEventListener('click', function() {
          self.currentIndex = parseInt(dot.dataset.index, 10);
          self.updatePositions();
        });
      });
    }

    updateIndicators() {
      this.container.querySelectorAll('.tc-dot').forEach(function(dot, i) {
        dot.classList.toggle('active', i === this.currentIndex);
      }.bind(this));
    }

    destroy() {
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler);
      }
    }
  }

  // =============================================
  // OnboardingOrchestrator Class
  // =============================================
  var STEPS = [
    { id: 1, botMessage: 'Bienvenue. Je vais creer votre univers en 3 minutes.', ui: 'welcome_cta', mode: 'chat' },
    { id: 2, botMessage: 'Quel est votre metier ?', ui: 'profession_grid', mode: 'immersive' },
    { id: 3, botMessage: null, ui: 'text_input', field: 'cabinet_name', mode: 'chat' },
    { id: 4, botMessage: 'Avez-vous un logo ?', ui: 'logo_choice', mode: 'immersive' },
    { id: 5, botMessage: 'Voici 12 univers visuels. Lequel vous ressemble ?', ui: 'theme_carousel', mode: 'immersive' },
    { id: 6, botMessage: 'Parfait. Maintenant, vos photos.', ui: 'photo_upload', mode: 'immersive' },
    { id: 7, botMessage: 'Mon IA analyse vos photos...', ui: 'ai_processing', mode: 'immersive' },
    { id: 8, botMessage: 'Voici votre site.', ui: 'site_reveal', mode: 'immersive' },
    { id: 9, botMessage: null, ui: 'success_screen', mode: 'immersive' },
  ];

  // Logo suggestions by profession
  var LOGO_SUGGESTIONS = {
    dentiste: ['precision', 'sourire', 'confiance', 'excellence'],
    medecin: ['soin', 'bienveillance', 'expertise', 'confiance'],
    avocat: ['rigueur', 'justice', 'prestige', 'confidentialite'],
    kine: ['mouvement', 'equilibre', 'vitalite', 'harmonie'],
    notaire: ['heritage', 'confiance', 'tradition', 'rigueur'],
    architecte: ['espace', 'lumiere', 'structure', 'vision'],
    restaurant: ['terroir', 'partage', 'saveur', 'raffinement'],
    coiffeur: ['style', 'elegance', 'creativite', 'beaute'],
    osteopathe: ['equilibre', 'harmonie', 'bien-etre', 'serenite'],
  };

  function OnboardingOrchestrator() {
    this.currentStep = 0;
    this.context = {};
    this.carousel = null;
    this.siteId = new URLSearchParams(window.location.search).get('siteId') || null;
  }

  OnboardingOrchestrator.prototype.start = async function() {
    // Try to resume existing session
    if (this.siteId) {
      try {
        var res = await apiJson('/api/vitrines/onboarding/resume');
        if (res && res.session && !res.session.completed) {
          this.context = res.session.context || {};
          // Start from beginning for clean UX
        }
      } catch (e) { /* ignore */ }
    }
    await this.renderStep(1);
  };

  OnboardingOrchestrator.prototype.renderStep = async function(stepId) {
    var step = STEPS.find(function(s) { return s.id === stepId; });
    if (!step) return;
    this.currentStep = stepId;
    document.body.dataset.step = stepId;

    // Set mode (chat vs immersive)
    var mode = step.mode || 'chat';
    document.body.dataset.mode = mode;

    // In immersive mode, hide old messages (keep only latest bot msg)
    var messages = document.getElementById('chat-messages');
    if (mode === 'immersive') {
      var allMsgs = messages.querySelectorAll('.ob-msg');
      allMsgs.forEach(function(msg) {
        msg.style.transition = 'all 300ms ease-out';
        msg.style.opacity = '0';
        msg.style.maxHeight = '0';
        msg.style.marginBottom = '0';
        msg.style.padding = '0 1.4rem';
        msg.style.overflow = 'hidden';
      });
    } else {
      // In chat mode, show all messages normally
      var allMsgs = messages.querySelectorAll('.ob-msg');
      allMsgs.forEach(function(msg) {
        msg.style.opacity = '';
        msg.style.maxHeight = '';
        msg.style.marginBottom = '';
        msg.style.padding = '';
        msg.style.overflow = '';
      });
    }

    this.updateProgressDots();

    // Build bot message
    var msg = step.botMessage;
    if (stepId === 3) {
      msg = 'Comment s\'appelle votre cabinet ?';
    }
    if (stepId === 9) {
      var slug = this.context.site_slug || '';
      msg = slug
        ? 'Votre univers est en ligne a l\'adresse ' + slug + '.jadomi.fr'
        : 'Votre univers est en ligne.';
    }

    if (msg) {
      await this.addBotMessage(msg);
    }

    // Render UI
    await this.renderUI(step.ui, step);
  };

  OnboardingOrchestrator.prototype.addBotMessage = async function(text) {
    var messages = document.getElementById('chat-messages');
    var msgDiv = document.createElement('div');
    msgDiv.className = 'ob-msg ob-msg-bot';
    msgDiv.setAttribute('role', 'status');
    messages.appendChild(msgDiv);
    await this.typewriter(msgDiv, text);
    messages.scrollTop = messages.scrollHeight;
  };

  OnboardingOrchestrator.prototype.addUserMessage = function(text) {
    var messages = document.getElementById('chat-messages');
    var msg = document.createElement('div');
    msg.className = 'ob-msg ob-msg-user';
    msg.textContent = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  };

  OnboardingOrchestrator.prototype.typewriter = function(el, text, speed) {
    speed = speed || 22;
    return new Promise(function(resolve) {
      var i = 0;
      function tick() {
        if (i <= text.length) {
          el.textContent = text.substring(0, i);
          i++;
          setTimeout(tick, speed);
        } else {
          resolve();
        }
      }
      tick();
    });
  };

  OnboardingOrchestrator.prototype.renderUI = async function(uiType, step) {
    var zone = document.getElementById('chat-input-zone');
    var gui = document.getElementById('gui-layer');
    zone.innerHTML = '';
    gui.innerHTML = '';

    switch (uiType) {
      case 'welcome_cta':
        this.showWelcome(zone);
        break;
      case 'profession_grid':
        this.showProfessionGrid(gui);
        break;
      case 'text_input':
        this.showTextInput(zone, step.field);
        break;
      case 'logo_choice':
        this.showLogoChoice(gui);
        break;
      case 'theme_carousel':
        await this.showThemeCarousel(gui);
        break;
      case 'photo_upload':
        this.showPhotoUpload(gui);
        break;
      case 'ai_processing':
        this.showAIProcessing(gui);
        break;
      case 'site_reveal':
        await this.showSiteReveal(gui);
        break;
      case 'success_screen':
        this.showSuccess(gui);
        break;
    }
  };

  OnboardingOrchestrator.prototype.next = async function() {
    await this.saveProgress();
    await this.renderStep(this.currentStep + 1);
  };

  OnboardingOrchestrator.prototype.goTo = async function(stepId) {
    await this.saveProgress();
    await this.renderStep(stepId);
  };

  OnboardingOrchestrator.prototype.updateProgressDots = function() {
    var dots = document.querySelectorAll('.ob-progress-dots span');
    var step = this.currentStep;
    dots.forEach(function(dot, i) {
      dot.classList.remove('done', 'current');
      if (i < step - 1) dot.classList.add('done');
      else if (i === step - 1) dot.classList.add('current');
    });
  };

  OnboardingOrchestrator.prototype.saveProgress = async function() {
    try {
      await apiJson('/api/vitrines/onboarding/save', {
        method: 'POST',
        body: JSON.stringify({
          step: this.currentStep,
          context: this.context
        })
      });
    } catch (e) { /* non-blocking */ }
  };

  // =============================================
  // Step 1: Welcome
  // =============================================
  OnboardingOrchestrator.prototype.showWelcome = function(zone) {
    var self = this;
    var btn = document.createElement('button');
    btn.className = 'ob-cta pulse';
    btn.textContent = 'Commencer';
    btn.setAttribute('aria-label', 'Commencer la creation de votre site');
    btn.addEventListener('click', function() {
      btn.classList.remove('pulse');
      self.next();
    });
    zone.appendChild(btn);
  };

  // =============================================
  // Step 2: Profession Grid
  // =============================================
  OnboardingOrchestrator.prototype.showProfessionGrid = function(gui) {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'profession-grid-overlay';

    var grid = document.createElement('div');
    grid.className = 'pg-grid';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Choisissez votre metier');

    PROFESSIONS.forEach(function(m) {
      var card = document.createElement('div');
      card.className = 'pg-card';
      card.dataset.slug = m.slug;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      card.setAttribute('aria-label', m.name);
      card.setAttribute('tabindex', '0');

      var icon = document.createElement('div');
      icon.className = 'pg-icon';
      icon.innerHTML = PROF_ICONS[m.slug] || '';
      icon.style.color = 'var(--ob-primary)';

      var name = document.createElement('div');
      name.className = 'pg-name';
      name.textContent = m.name;

      card.appendChild(icon);
      card.appendChild(name);

      function handleSelect() {
        self.context.profession = m.slug;
        self.context.profession_name = m.name;
        self.addUserMessage(m.name);
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 400ms';
        setTimeout(function() { self.next(); }, 400);
      }

      card.addEventListener('click', handleSelect);
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(); }
      });

      grid.appendChild(card);
    });

    overlay.appendChild(grid);
    gui.appendChild(overlay);
  };

  // =============================================
  // Step 3: Text Input
  // =============================================
  OnboardingOrchestrator.prototype.showTextInput = function(zone, field) {
    var self = this;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ob-chat-input';
    input.placeholder = 'Nom de votre cabinet';
    input.setAttribute('aria-label', 'Nom du cabinet');
    input.autofocus = true;

    var btn = document.createElement('button');
    btn.className = 'ob-chat-send';
    btn.innerHTML = '&#10140;';
    btn.setAttribute('aria-label', 'Valider');

    function submit() {
      var val = input.value.trim();
      if (!val) return;
      self.context[field] = val;
      self.addUserMessage(val);
      setTimeout(function() { self.next(); }, 300);
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submit();
    });
    btn.addEventListener('click', submit);

    zone.appendChild(input);
    zone.appendChild(btn);

    setTimeout(function() { input.focus(); }, 100);
  };

  // =============================================
  // Step 4: Logo Choice
  // =============================================
  OnboardingOrchestrator.prototype.showLogoChoice = function(gui) {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'logo-choice-overlay';

    var grid = document.createElement('div');
    grid.className = 'logo-choice-grid';

    // Card 1: Upload existing logo
    var card1 = document.createElement('div');
    card1.className = 'logo-card';
    card1.dataset.choice = 'upload';
    card1.setAttribute('tabindex', '0');
    card1.setAttribute('role', 'button');
    card1.setAttribute('aria-label', 'Telecharger votre logo existant');
    card1.innerHTML =
      '<div class="logo-card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
      '<div class="logo-card-title">J\'ai deja mon logo</div>' +
      '<div class="logo-card-desc">Telechargez votre logo existant</div>';

    // Card 2: Generate with AI
    var card2 = document.createElement('div');
    card2.className = 'logo-card';
    card2.dataset.choice = 'generate';
    card2.setAttribute('tabindex', '0');
    card2.setAttribute('role', 'button');
    card2.setAttribute('aria-label', 'Generer un logo par intelligence artificielle');
    card2.innerHTML =
      '<div class="logo-card-price">+59 EUR</div>' +
      '<div class="logo-card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 21 12 16.5 5.8 21l2.4-7.1L2 9.4h7.6L12 2z"/></svg></div>' +
      '<div class="logo-card-title">Generez mon logo par IA</div>' +
      '<div class="logo-card-desc">4 variantes uniques creees pour vous en 30 secondes</div>';

    // Card 3: Skip
    var card3 = document.createElement('div');
    card3.className = 'logo-card';
    card3.dataset.choice = 'skip';
    card3.setAttribute('tabindex', '0');
    card3.setAttribute('role', 'button');
    card3.setAttribute('aria-label', 'Passer cette etape');
    card3.innerHTML =
      '<div class="logo-card-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' +
      '<div class="logo-card-title">Plus tard</div>' +
      '<div class="logo-card-desc">Je configure mon logo ulterieurement</div>';

    grid.appendChild(card1);
    grid.appendChild(card2);
    grid.appendChild(card3);
    overlay.appendChild(grid);
    gui.appendChild(overlay);

    function handleChoice(choice) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 400ms';
      setTimeout(function() {
        gui.innerHTML = '';
        if (choice === 'upload') {
          self.showLogoUpload(gui);
        } else if (choice === 'generate') {
          self.showLogoUniverseInput(gui);
        } else {
          self.addUserMessage('Plus tard');
          self.next();
        }
      }, 400);
    }

    [card1, card2, card3].forEach(function(card) {
      card.addEventListener('click', function() { handleChoice(card.dataset.choice); });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleChoice(card.dataset.choice); }
      });
    });
  };

  OnboardingOrchestrator.prototype.showLogoUpload = function(gui) {
    var self = this;
    var zone = document.createElement('div');
    zone.className = 'photo-upload-zone';
    zone.style.maxWidth = '400px';
    zone.innerHTML =
      '<div class="pu-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
      '<div class="pu-title">Deposez votre logo</div>' +
      '<div class="pu-subtitle">PNG ou SVG recommande</div>';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.svg';
    fileInput.style.display = 'none';
    zone.appendChild(fileInput);
    gui.appendChild(zone);

    zone.addEventListener('click', function() { fileInput.click(); });

    fileInput.addEventListener('change', async function() {
      if (!fileInput.files || !fileInput.files[0]) return;
      var file = fileInput.files[0];
      self.addUserMessage('Logo importe');
      self.context.has_logo = true;

      // Upload via existing photo API if siteId
      if (self.siteId) {
        try {
          var formData = new FormData();
          formData.append('photo', file);
          formData.append('siteId', self.siteId);
          formData.append('category', 'logo');
          var token = await getToken();
          await fetch('/api/vitrines/photos/upload', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'X-Societe-Id': getSocieteId()
            },
            body: formData
          });
        } catch (e) { /* continue */ }
      }

      setTimeout(function() { self.next(); }, 400);
    });
  };

  OnboardingOrchestrator.prototype.showLogoUniverseInput = function(gui) {
    var self = this;
    var suggestions = LOGO_SUGGESTIONS[this.context.profession] || ['excellence', 'confiance', 'precision', 'elegance'];

    var panel = document.createElement('div');
    panel.className = 'logo-universe-panel';

    var title = document.createElement('div');
    title.className = 'logo-universe-title';
    title.textContent = 'En un mot, votre univers ?';
    panel.appendChild(title);

    var chips = document.createElement('div');
    chips.className = 'universe-chips';
    suggestions.forEach(function(word) {
      var chip = document.createElement('span');
      chip.className = 'universe-chip';
      chip.textContent = word;
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.addEventListener('click', function() {
        input.value = word;
        input.focus();
      });
      chips.appendChild(chip);
    });
    panel.appendChild(chips);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'logo-universe-input';
    input.placeholder = 'Votre mot-cle...';
    input.setAttribute('aria-label', 'Mot-cle pour la generation du logo');
    panel.appendChild(input);

    var btn = document.createElement('button');
    btn.className = 'ob-cta';
    btn.textContent = 'Generer mes 4 logos';
    btn.setAttribute('aria-label', 'Lancer la generation de logos');
    panel.appendChild(btn);

    gui.appendChild(panel);

    function launch() {
      var word = input.value.trim();
      if (!word) return;
      self.addUserMessage(word);
      self.context.logo_universe = word;
      gui.innerHTML = '';
      self.generateLogos(gui, word);
    }

    btn.addEventListener('click', launch);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') launch();
    });

    setTimeout(function() { input.focus(); }, 100);
  };

  OnboardingOrchestrator.prototype.generateLogos = async function(gui, universe) {
    var self = this;

    // Show loading
    var loading = document.createElement('div');
    loading.className = 'logo-loading';
    loading.innerHTML =
      '<div class="logo-loading-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 21 12 16.5 5.8 21l2.4-7.1L2 9.4h7.6L12 2z"/></svg></div>' +
      '<div class="logo-loading-title">Creation de votre identite en cours...</div>' +
      '<div class="logo-loading-desc">4 variantes sur mesure</div>';
    gui.appendChild(loading);

    try {
      var res = await apiJson('/api/vitrines/logo-ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          profession: this.context.profession,
          cabinetName: this.context.cabinet_name,
          universe: universe
        })
      });

      if (res && res.success && res.logos) {
        gui.innerHTML = '';
        self.showLogoVariants(gui, res.logos);
      } else {
        throw new Error((res && res.error) || 'Generation indisponible');
      }
    } catch (err) {
      gui.innerHTML = '';
      self.showToast('Fonctionnalite bientot disponible. Contactez-nous pour votre logo.');
      self.addUserMessage('Plus tard');
      setTimeout(function() { self.next(); }, 1500);
    }
  };

  OnboardingOrchestrator.prototype.showLogoVariants = function(gui, logos) {
    var self = this;
    var selectedUrl = null;

    var panel = document.createElement('div');
    panel.className = 'logo-variants-panel';

    var title = document.createElement('div');
    title.className = 'logo-variants-title';
    title.textContent = 'Choisissez votre logo';
    panel.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'logo-variants-grid';

    logos.forEach(function(logo) {
      if (!logo.url) return;
      var variant = document.createElement('div');
      variant.className = 'logo-variant';
      variant.dataset.url = logo.url;
      variant.setAttribute('role', 'radio');
      variant.setAttribute('aria-checked', 'false');
      variant.setAttribute('tabindex', '0');

      var img = document.createElement('img');
      img.src = logo.url;
      img.alt = 'Logo variante ' + (logo.style || '');
      img.loading = 'lazy';
      variant.appendChild(img);

      var style = document.createElement('div');
      style.className = 'logo-variant-style';
      style.textContent = logo.style || '';
      variant.appendChild(style);

      variant.addEventListener('click', function() {
        grid.querySelectorAll('.logo-variant').forEach(function(v) {
          v.classList.remove('selected');
          v.setAttribute('aria-checked', 'false');
        });
        variant.classList.add('selected');
        variant.setAttribute('aria-checked', 'true');
        selectedUrl = logo.url;
        validateBtn.style.opacity = '1';
        validateBtn.style.pointerEvents = 'auto';
      });

      grid.appendChild(variant);
    });

    panel.appendChild(grid);

    var actions = document.createElement('div');
    actions.className = 'logo-actions';

    var regenBtn = document.createElement('button');
    regenBtn.className = 'ob-cta-secondary';
    regenBtn.textContent = 'Regenerer 4 variantes';
    regenBtn.setAttribute('aria-label', 'Regenerer de nouvelles variantes');
    regenBtn.addEventListener('click', function() {
      gui.innerHTML = '';
      self.generateLogos(gui, self.context.logo_universe);
    });

    var validateBtn = document.createElement('button');
    validateBtn.className = 'ob-cta';
    validateBtn.textContent = 'Valider ce logo';
    validateBtn.setAttribute('aria-label', 'Valider le logo selectionne');
    validateBtn.style.opacity = '0.4';
    validateBtn.style.pointerEvents = 'none';
    validateBtn.addEventListener('click', async function() {
      if (!selectedUrl) return;
      self.context.logo_url = selectedUrl;
      self.addUserMessage('Logo choisi');

      // Save logo to server
      if (self.siteId) {
        apiJson('/api/vitrines/logo-ai/save', {
          method: 'POST',
          body: JSON.stringify({ siteId: self.siteId, logoUrl: selectedUrl })
        });
      }

      panel.style.opacity = '0';
      panel.style.transition = 'opacity 400ms';
      setTimeout(function() { self.next(); }, 400);
    });

    actions.appendChild(regenBtn);
    actions.appendChild(validateBtn);
    panel.appendChild(actions);
    gui.appendChild(panel);
  };

  OnboardingOrchestrator.prototype.showToast = function(msg) {
    var toast = document.createElement('div');
    toast.className = 'ob-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('visible'); }, 50);
    setTimeout(function() {
      toast.classList.remove('visible');
      setTimeout(function() { toast.remove(); }, 400);
    }, 3000);
  };

  // =============================================
  // Step 5: Theme Carousel
  // =============================================
  OnboardingOrchestrator.prototype.showThemeCarousel = async function(gui) {
    var self = this;
    var themes = FALLBACK_THEMES;

    // Try API first
    try {
      var res = await apiJson('/api/vitrines/themes');
      if (res && res.themes && res.themes.length > 0) {
        themes = res.themes;
      }
    } catch (e) { /* use fallback */ }

    // Sort: matching profession first
    var prof = this.context.profession;
    if (prof) {
      themes.sort(function(a, b) {
        var aMatch = (a.professions && (a.professions.includes(prof) || a.professions.includes('*'))) ? 0 : 1;
        var bMatch = (b.professions && (b.professions.includes(prof) || b.professions.includes('*'))) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
    }

    var html =
      '<div class="theme-carousel" id="theme-carousel">' +
        '<div class="tc-header">' +
          '<h2 class="tc-title">Choisissez votre univers</h2>' +
          '<p class="tc-subtitle">12 ambiances calibrees pour votre metier</p>' +
        '</div>' +
        '<div class="tc-viewport">' +
          '<button class="tc-arrow tc-arrow-left" aria-label="Theme precedent">&#9664;</button>' +
          '<div class="tc-track"></div>' +
          '<button class="tc-arrow tc-arrow-right" aria-label="Theme suivant">&#9654;</button>' +
        '</div>' +
        '<div class="tc-indicators"></div>' +
        '<div class="tc-actions">' +
          '<button class="tc-btn-validate hidden" aria-label="Valider le theme selectionne">Valider ce theme</button>' +
        '</div>' +
      '</div>';

    gui.innerHTML = html;

    var container = document.getElementById('theme-carousel');
    this.carousel = new ThemeCarousel(container, themes, function(slug) {
      self.context.theme_slug = slug;
      var theme = themes.find(function(t) { return t.slug === slug; });
      self.addUserMessage(theme ? theme.name : slug);

      // Apply theme to site if siteId exists
      if (self.siteId) {
        apiJson('/api/vitrines/sites/' + self.siteId + '/theme', {
          method: 'PATCH',
          body: JSON.stringify({ theme_slug: slug })
        });
      }

      // Close carousel with animation
      container.style.opacity = '0';
      container.style.transform = 'translateY(40px)';
      container.style.transition = 'all 500ms cubic-bezier(.16, 1, .3, 1)';
      setTimeout(function() {
        if (self.carousel) { self.carousel.destroy(); self.carousel = null; }
        self.next();
      }, 500);
    });
  };

  // =============================================
  // Step 5: Photo Upload
  // =============================================
  OnboardingOrchestrator.prototype.showPhotoUpload = function(gui) {
    var self = this;
    var uploadedFiles = [];

    var zone = document.createElement('div');
    zone.className = 'photo-upload-zone';
    zone.setAttribute('role', 'button');
    zone.setAttribute('aria-label', 'Zone de depot de photos');
    zone.setAttribute('tabindex', '0');

    zone.innerHTML =
      '<div class="pu-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
      '<div class="pu-title">Deposez vos photos ici</div>' +
      '<div class="pu-subtitle">ou cliquez pour parcourir vos fichiers</div>' +
      '<button class="pu-btn" aria-label="Parcourir les fichiers">Parcourir</button>' +
      '<div class="pu-thumbnails" id="pu-thumbs"></div>' +
      '<div class="pu-progress" style="display:none" id="pu-progress">' +
        '<div class="pu-progress-bar"><div class="pu-progress-fill" id="pu-fill"></div></div>' +
        '<div class="pu-progress-text" id="pu-text"></div>' +
      '</div>';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';

    zone.appendChild(fileInput);
    gui.appendChild(zone);

    // Skip button (photos optional)
    var skipWrap = document.createElement('div');
    skipWrap.style.cssText = 'text-align:center;margin-top:1rem;';
    var skipBtn = document.createElement('button');
    skipBtn.className = 'ob-cta-secondary';
    skipBtn.textContent = 'Passer cette etape';
    skipBtn.style.cssText = 'font-size:0.85rem;padding:0.6rem 1.5rem;';
    skipBtn.addEventListener('click', function() {
      self.addUserMessage('Photos ajoutees plus tard');
      self.next();
    });
    skipWrap.appendChild(skipBtn);
    gui.appendChild(skipWrap);

    // Interactions
    zone.addEventListener('click', function(e) {
      if (e.target.closest('.pu-btn') || e.target === zone) {
        fileInput.click();
      }
    });

    zone.addEventListener('dragover', function(e) {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', function() {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', function() {
      handleFiles(fileInput.files);
    });

    async function handleFiles(files) {
      if (!files || !files.length) return;
      var progress = document.getElementById('pu-progress');
      var fill = document.getElementById('pu-fill');
      var text = document.getElementById('pu-text');
      var thumbs = document.getElementById('pu-thumbs');
      progress.style.display = 'block';

      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (!file.type.startsWith('image/')) continue;

        text.textContent = 'Upload ' + (i + 1) + '/' + files.length + '...';
        fill.style.width = ((i + 1) / files.length * 100) + '%';

        // Show thumbnail
        var reader = new FileReader();
        reader.onload = function(ev) {
          var img = document.createElement('img');
          img.className = 'pu-thumb';
          img.src = ev.target.result;
          thumbs.appendChild(img);
        };
        reader.readAsDataURL(file);

        // Upload via existing API
        if (self.siteId) {
          try {
            var formData = new FormData();
            formData.append('photo', file);
            formData.append('siteId', self.siteId);
            var token = await getToken();
            await fetch('/api/vitrines/photos/upload', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + token,
                'X-Societe-Id': getSocieteId()
              },
              body: formData
            });
            uploadedFiles.push(file.name);
          } catch (err) { /* continue */ }
        }

        await new Promise(function(r) { setTimeout(r, 200); });
      }

      text.textContent = files.length + ' photo(s) importee(s)';
      self.context.photos_count = (self.context.photos_count || 0) + files.length;

      // Auto-advance after brief pause
      setTimeout(function() {
        self.addUserMessage(files.length + ' photo(s)');
        self.next();
      }, 1000);
    }
  };

  // =============================================
  // Step 6: AI Processing
  // =============================================
  OnboardingOrchestrator.prototype.showAIProcessing = function(gui) {
    var self = this;
    var div = document.createElement('div');
    div.className = 'ai-processing';
    div.innerHTML =
      '<div class="ai-spinner"></div>' +
      '<div class="ai-status" id="ai-status">Analyse en cours...</div>';
    gui.appendChild(div);

    var status = document.getElementById('ai-status');
    var messages = [
      'Identification des sujets...',
      'Classification par categorie...',
      'Optimisation des images...',
      'Finalisation...'
    ];

    var i = 0;
    var interval = setInterval(function() {
      i++;
      if (i < messages.length) {
        status.textContent = messages[i];
      } else {
        clearInterval(interval);
        status.textContent = 'Analyse terminee.';
        setTimeout(function() { self.next(); }, 800);
      }
    }, 1500);

    // If no photos were uploaded, skip faster
    if (!this.context.photos_count) {
      clearInterval(interval);
      setTimeout(function() {
        status.textContent = 'Preparation de votre site...';
        setTimeout(function() { self.next(); }, 1000);
      }, 1200);
    }
  };

  // =============================================
  // Step 7: Site Reveal
  // =============================================
  OnboardingOrchestrator.prototype.showSiteReveal = async function(gui) {
    var self = this;

    // Try to get site info
    var siteSlug = '';
    if (this.siteId) {
      try {
        var token = await getToken();
        var res = await fetch('/api/vitrines/public/site/' + this.siteId, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        var data = await res.json();
        if (data && data.slug) {
          siteSlug = data.slug;
          this.context.site_slug = siteSlug;
        }
      } catch (e) { /* ignore */ }
    }

    var reveal = document.createElement('div');
    reveal.className = 'site-reveal';

    var iframe = document.createElement('iframe');
    iframe.src = this.siteId ? '/site/preview-' + this.siteId : 'about:blank';
    iframe.title = 'Apercu de votre site';
    reveal.appendChild(iframe);

    var actions = document.createElement('div');
    actions.className = 'site-reveal-actions';

    var btnOk = document.createElement('button');
    btnOk.className = 'ob-cta';
    btnOk.textContent = 'C\'est parfait';
    btnOk.addEventListener('click', function() {
      reveal.style.opacity = '0';
      reveal.style.transform = 'scale(0.95)';
      reveal.style.transition = 'all 500ms cubic-bezier(.16, 1, .3, 1)';
      setTimeout(function() { self.next(); }, 500);
    });

    var btnAdjust = document.createElement('button');
    btnAdjust.className = 'ob-cta-secondary';
    btnAdjust.textContent = 'Ajuster quelques details';
    btnAdjust.addEventListener('click', function() {
      // Go to dashboard for fine-tuning
      window.location.href = '/public/vitrines/mon-site-v2.html' + (self.siteId ? '?siteId=' + self.siteId : '');
    });

    actions.appendChild(btnOk);
    actions.appendChild(btnAdjust);
    reveal.appendChild(actions);
    gui.appendChild(reveal);
  };

  // =============================================
  // Step 8: Success
  // =============================================
  OnboardingOrchestrator.prototype.showSuccess = function(gui) {
    var self = this;
    var slug = this.context.site_slug || '';

    var div = document.createElement('div');
    div.className = 'success-screen';

    if (slug) {
      var urlDiv = document.createElement('div');
      urlDiv.className = 'success-url';
      urlDiv.textContent = slug + '.jadomi.fr';
      div.appendChild(urlDiv);
    }

    var actions = document.createElement('div');
    actions.className = 'success-actions';

    if (slug) {
      var btnOpen = document.createElement('a');
      btnOpen.className = 'ob-cta';
      btnOpen.href = '/site/' + slug;
      btnOpen.target = '_blank';
      btnOpen.textContent = 'Ouvrir mon site';
      btnOpen.style.textDecoration = 'none';
      btnOpen.style.display = 'inline-block';
      actions.appendChild(btnOpen);
    }

    var btnDash = document.createElement('a');
    btnDash.className = 'ob-cta-secondary';
    btnDash.href = '/public/vitrines/mon-site-v2.html' + (self.siteId ? '?siteId=' + self.siteId : '');
    btnDash.textContent = 'Acceder au dashboard';
    btnDash.style.textDecoration = 'none';
    btnDash.style.display = 'inline-block';
    actions.appendChild(btnDash);

    div.appendChild(actions);
    gui.appendChild(div);

    // Mark completed
    this.saveProgress();

    // Subtle confetti
    this.spawnConfetti();
  };

  OnboardingOrchestrator.prototype.spawnConfetti = function() {
    var colors = ['#c9a961', '#a8893f', '#e8d5a8', '#fff', 'rgba(201,169,97,0.6)'];
    for (var i = 0; i < 40; i++) {
      (function(delay) {
        setTimeout(function() {
          var particle = document.createElement('div');
          particle.className = 'confetti-particle';
          particle.style.left = (Math.random() * 100) + 'vw';
          particle.style.top = '-10px';
          particle.style.background = colors[Math.floor(Math.random() * colors.length)];
          particle.style.width = (3 + Math.random() * 5) + 'px';
          particle.style.height = (3 + Math.random() * 5) + 'px';
          particle.style.animationDuration = (2 + Math.random() * 2) + 's';
          particle.style.animationDelay = '0s';
          document.body.appendChild(particle);
          setTimeout(function() { particle.remove(); }, 4000);
        }, delay);
      })(i * 50);
    }
  };

  // =============================================
  // Video fallback
  // =============================================
  function setupVideoFallback() {
    var video = document.getElementById('bg-video');
    if (!video) return;
    video.addEventListener('error', function() {
      video.style.display = 'none';
    });
    // If video doesn't load in 3s, hide it (gradient animated serves as fallback)
    setTimeout(function() {
      if (video.readyState === 0) {
        video.style.display = 'none';
      }
    }, 3000);
  }

  // =============================================
  // Init
  // =============================================
  var orchestrator;

  document.addEventListener('DOMContentLoaded', function() {
    setupVideoFallback();
    orchestrator = new OnboardingOrchestrator();
    orchestrator.start();
  });

  // Expose for debugging only in dev
  window._ob = function() { return orchestrator; };

})();
