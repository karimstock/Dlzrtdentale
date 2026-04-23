/**
 * JADOMI Passe 35 — JADOMI Studio Hero Animations
 * Orbiting logos, price shrink, lightbox gallery
 */

(function() {
  'use strict';

  function init() {
    // Orbiting logos animation (CSS-based, enhanced)
    const orbitLogos = document.querySelectorAll('.orbit-logo');
    if (orbitLogos.length > 0) {
      const container = document.querySelector('.orbit-container');
      if (container) {
        const radius = container.clientWidth * 0.38;
        const centerX = container.clientWidth / 2;
        const centerY = container.clientHeight / 2;

        orbitLogos.forEach((logo, i) => {
          const angle = (i / orbitLogos.length) * Math.PI * 2;
          function updatePosition(time) {
            const a = angle + time * 0.0003;
            const x = centerX + Math.cos(a) * radius - logo.clientWidth / 2;
            const y = centerY + Math.sin(a) * radius - logo.clientHeight / 2;
            logo.style.left = x + 'px';
            logo.style.top = y + 'px';
            requestAnimationFrame(updatePosition.bind(null, performance.now()));
          }
          // Only animate on desktop
          if (window.innerWidth > 768) {
            updatePosition(performance.now() + i * 1000);
          } else {
            // Static positions for mobile
            const a = (i / orbitLogos.length) * Math.PI * 2;
            const x = centerX + Math.cos(a) * radius * 0.7 - logo.clientWidth / 2;
            const y = centerY + Math.sin(a) * radius * 0.7 - logo.clientHeight / 2;
            logo.style.left = x + 'px';
            logo.style.top = y + 'px';
          }
        });
      }
    }

    // Price shrink animation
    const priceShrink = document.querySelector('[data-price-shrink]');
    if (priceShrink && window.__gsapReady) {
      const oldPrice = priceShrink.querySelector('.old-price');
      const newPrice = priceShrink.querySelector('.new-price');

      if (oldPrice && newPrice) {
        gsap.fromTo(oldPrice,
          { scale: 1, opacity: 1 },
          {
            scale: 0.5,
            opacity: 0.3,
            textDecoration: 'line-through',
            duration: 1.2,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: priceShrink, start: 'top 75%', once: true }
          }
        );

        gsap.fromTo(newPrice,
          { scale: 0.5, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 1,
            delay: 0.8,
            ease: 'back.out(1.7)',
            scrollTrigger: { trigger: priceShrink, start: 'top 75%', once: true }
          }
        );
      }
    }

    // Lightbox gallery
    initLightbox();
  }

  function initLightbox() {
    // Create lightbox element if not exists
    let lightbox = document.querySelector('.lightbox');
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = `
        <button class="lightbox-close" aria-label="Fermer">&times;</button>
        <img src="" alt="">
      `;
      document.body.appendChild(lightbox);
    }

    const lightboxImg = lightbox.querySelector('img');
    const lightboxClose = lightbox.querySelector('.lightbox-close');

    document.querySelectorAll('[data-lightbox]').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const img = item.querySelector('img') || item;
        lightboxImg.src = img.dataset.fullsrc || img.src;
        lightboxImg.alt = img.alt || '';
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    function closeLightbox() {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
