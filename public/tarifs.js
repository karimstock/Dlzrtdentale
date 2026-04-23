/* =============================================
   JADOMI — Tarifs : Scroll Storytelling Animations
   ============================================= */
(function() {
  'use strict';

  // Intersection Observer for section animations
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.pricing-section').forEach(function(sec) {
    observer.observe(sec);
  });

  // Smooth scroll for hero arrow
  var scrollBtn = document.querySelector('.hero-scroll');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var target = document.getElementById('plans');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Subtle parallax on hero gradient
  var heroGradient = document.querySelector('.hero-bg-gradient');
  if (heroGradient) {
    window.addEventListener('scroll', function() {
      var scroll = window.scrollY;
      if (scroll < window.innerHeight) {
        heroGradient.style.transform = 'translateY(' + (scroll * 0.3) + 'px)';
        heroGradient.style.opacity = Math.max(0, 1 - scroll / (window.innerHeight * 0.8));
      }
    }, { passive: true });
  }

  // Nav background opacity based on scroll
  var nav = document.querySelector('.tarifs-nav');
  if (nav) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 100) {
        nav.style.background = 'rgba(10,14,26,0.92)';
      } else {
        nav.style.background = 'rgba(10,14,26,0.75)';
      }
    }, { passive: true });
  }

})();
