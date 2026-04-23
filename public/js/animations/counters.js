/**
 * JADOMI Passe 35 — Animated Counters
 * Stats numbers that count up on scroll
 */

(function() {
  'use strict';

  function init() {
    if (!window.__gsapReady) {
      window.addEventListener('gsap-ready', init);
      return;
    }

    document.querySelectorAll('[data-counter]').forEach(el => {
      const target = parseInt(el.dataset.counter, 10);
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      const numberEl = el.querySelector('.stat-number') || el;
      const obj = { val: 0 };

      gsap.to(obj, {
        val: target,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true
        },
        onUpdate: function() {
          numberEl.textContent = prefix + Math.round(obj.val).toLocaleString('fr-FR') + suffix;
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
