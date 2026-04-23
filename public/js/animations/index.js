/**
 * JADOMI Passe 35 — Animation Orchestrator
 * Loads the right animation scripts per page
 * Include this single file + CDN scripts, it handles the rest
 */

(function() {
  'use strict';

  const page = detectPage();

  // Common scripts for all pages
  loadScript('/js/animations/gsap-core.js');
  loadScript('/js/animations/scroll-reveals.js');
  loadScript('/js/animations/counters.js');
  loadScript('/js/animations/interactions.js');
  loadScript('/js/animations/lottie-loader.js');

  // Page-specific scripts
  switch (page) {
    case 'homepage':
      loadScript('/js/animations/hero-homepage.js');
      loadScript('/js/animations/particles-three.js');
      break;
    case 'jadomi-ads':
      loadScript('/js/animations/hero-ads.js');
      loadScript('/js/animations/dataflow-three.js');
      break;
    case 'jadomi-studio':
      loadScript('/js/animations/hero-studio.js');
      break;
  }

  function detectPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '/landing.html' || path.endsWith('/landing.html')) return 'homepage';
    if (path.includes('jadomi-ads')) return 'jadomi-ads';
    if (path.includes('jadomi-studio')) return 'jadomi-studio';
    return 'other';
  }

  function loadScript(src) {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }
})();
