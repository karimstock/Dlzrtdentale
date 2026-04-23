/**
 * JADOMI Passe 35 — Homepage Hero Animation
 * GSAP timeline for hero section entrance
 */

(function() {
  'use strict';

  function init() {
    if (!window.__gsapReady) {
      window.addEventListener('gsap-ready', init);
      return;
    }

    const heroTitle = document.querySelectorAll('.hero-title-line');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const heroActions = document.querySelector('.hero-actions');
    const heroStats = document.querySelector('.hero-stats');
    const heroBadge = document.querySelector('.hero-badge');

    if (!heroTitle.length) return;

    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    // Badge
    if (heroBadge) {
      tl.fromTo(heroBadge,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
        0
      );
    }

    // Title lines stagger (letter-by-letter simulation via line reveal)
    heroTitle.forEach((line, i) => {
      tl.fromTo(line,
        { y: 60, opacity: 0, rotateX: 90 },
        { y: 0, opacity: 1, rotateX: 0, duration: 1.2 },
        0.2 + i * 0.15
      );
    });

    // Subtitle
    if (heroSubtitle) {
      tl.fromTo(heroSubtitle,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
        0.8
      );
    }

    // Actions
    if (heroActions) {
      tl.fromTo(heroActions,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
        1.0
      );
    }

    // Stats
    if (heroStats) {
      tl.fromTo(heroStats,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
        1.2
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
