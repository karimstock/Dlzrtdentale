/**
 * JADOMI Passe 35 — Lottie Animation Loader
 * Loads and manages Lottie JSON animations
 */

(function() {
  'use strict';

  window.JadomiLottie = {
    instances: [],

    load: function(containerId, jsonPath, options) {
      if (typeof lottie === 'undefined') return null;

      const container = document.getElementById(containerId);
      if (!container) return null;

      const defaults = {
        container: container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: jsonPath
      };

      const anim = lottie.loadAnimation(Object.assign(defaults, options || {}));
      this.instances.push({ id: containerId, animation: anim });

      // Pause when offscreen
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            anim.play();
          } else {
            anim.pause();
          }
        });
      }, { threshold: 0.1 });

      observer.observe(container);

      return anim;
    },

    // Replace all spinners with premium loader
    replaceSpinners: function() {
      document.querySelectorAll('.spinner, .loading-spinner').forEach(el => {
        el.classList.add('loader-premium');
        el.innerHTML = '';
      });
    }
  };

  // Auto-init all [data-lottie] elements
  function init() {
    document.querySelectorAll('[data-lottie]').forEach(el => {
      const path = el.dataset.lottie;
      const loop = el.dataset.lottieLoop !== 'false';
      const autoplay = el.dataset.lottieAutoplay !== 'false';
      window.JadomiLottie.load(el.id, path, { loop, autoplay });
    });

    window.JadomiLottie.replaceSpinners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
