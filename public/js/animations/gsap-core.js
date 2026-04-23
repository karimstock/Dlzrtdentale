/**
 * JADOMI Passe 35 — GSAP Core Setup
 * Loads GSAP + ScrollTrigger from CDN (tree-shaking friendly)
 */

(function() {
  'use strict';

  // Wait for GSAP to be available (loaded via CDN script tags)
  function initGSAP() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      setTimeout(initGSAP, 50);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // Global GSAP defaults matching JADOMI design system
    gsap.defaults({
      ease: 'power4.out',
      duration: 1
    });

    // Refresh ScrollTrigger after all images load
    window.addEventListener('load', () => {
      ScrollTrigger.refresh();
    });

    // Dispatch ready event
    window.dispatchEvent(new Event('gsap-ready'));
    window.__gsapReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGSAP);
  } else {
    initGSAP();
  }
})();
