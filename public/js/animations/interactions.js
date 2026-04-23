/**
 * JADOMI Passe 35 — Premium Micro-Interactions
 * Hover effects, 3D tilt, ripple, link animations
 */

(function() {
  'use strict';

  function init() {
    // === Premium card hover (add class to existing cards) ===
    document.querySelectorAll('.card-xl, .card-standard, [data-card-hover]').forEach(card => {
      card.classList.add('card-premium-hover');
    });

    // === 3D Tilt on pricing cards ===
    document.querySelectorAll('.pricing-card-3d, [data-tilt]').forEach(card => {
      card.addEventListener('mousemove', function(e) {
        if (window.innerWidth < 768) return;
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;
        this.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
      });

      card.addEventListener('mouseleave', function() {
        this.style.transform = '';
      });
    });

    // === FAQ Accordion smooth ===
    document.querySelectorAll('[data-faq-toggle]').forEach(toggle => {
      toggle.addEventListener('click', function() {
        const item = this.closest('[data-faq-item]') || this.closest('.faq-item');
        if (!item) return;
        const answer = item.querySelector('[data-faq-answer]') || item.querySelector('.faq-answer-content');
        if (!answer) return;

        const isOpen = item.classList.contains('open');

        // Close all others
        document.querySelectorAll('.faq-item.open, [data-faq-item].open').forEach(other => {
          if (other !== item) {
            other.classList.remove('open');
            const otherAnswer = other.querySelector('[data-faq-answer]') || other.querySelector('.faq-answer-content');
            if (otherAnswer) otherAnswer.style.maxHeight = '0';
          }
        });

        if (isOpen) {
          item.classList.remove('open');
          answer.style.maxHeight = '0';
        } else {
          item.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });

    // === Ripple effect on CTA buttons ===
    document.querySelectorAll('.cta-premium, [data-ripple]').forEach(btn => {
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.cssText = `
          position:absolute; border-radius:50%; pointer-events:none;
          width:${size}px; height:${size}px;
          left:${e.clientX - rect.left - size/2}px;
          top:${e.clientY - rect.top - size/2}px;
          background:rgba(255,255,255,0.3);
          transform:scale(0); opacity:1;
          animation: ripple-anim 0.6s ease-out forwards;
        `;
        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    });

    // Add ripple animation
    if (!document.getElementById('ripple-style')) {
      const style = document.createElement('style');
      style.id = 'ripple-style';
      style.textContent = `
        @keyframes ripple-anim {
          to { transform: scale(2.5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    // === Smooth link underline on all footer/nav links ===
    document.querySelectorAll('.footer a, [data-link-animated]').forEach(link => {
      link.classList.add('link-animated');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
