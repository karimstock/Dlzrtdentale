/**
 * JADOMI Passe 35 — Scroll Reveal Animations
 * Progressive reveal of sections and cards on scroll
 */

(function() {
  'use strict';

  function init() {
    if (!window.__gsapReady) {
      window.addEventListener('gsap-ready', init);
      return;
    }

    // Reveal all [data-reveal] elements
    document.querySelectorAll('[data-reveal]').forEach((el, i) => {
      gsap.fromTo(el,
        { y: 60, opacity: 0, scale: 0.95 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: 'power4.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true
          }
        }
      );
    });

    // Staggered card reveals
    document.querySelectorAll('[data-stagger-group]').forEach(group => {
      const cards = group.querySelectorAll('[data-stagger-item]');
      if (!cards.length) return;

      gsap.fromTo(cards,
        { y: 80, opacity: 0, scale: 0.9 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power4.out',
          scrollTrigger: {
            trigger: group,
            start: 'top 80%',
            once: true
          }
        }
      );
    });

    // Parallax images
    document.querySelectorAll('[data-parallax]').forEach(el => {
      const speed = parseFloat(el.dataset.parallax) || 0.3;
      gsap.to(el, {
        yPercent: -30 * speed,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    // Fade-up elements
    document.querySelectorAll('[data-fade-up]').forEach(el => {
      gsap.fromTo(el,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power4.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true
          }
        }
      );
    });

    // Section tag reveals (slide from left)
    document.querySelectorAll('.section-tag').forEach(el => {
      gsap.fromTo(el,
        { x: -20, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.6,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true
          }
        }
      );
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
