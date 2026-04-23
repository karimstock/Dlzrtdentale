/**
 * JADOMI Passe 35 — JADOMI Ads Hero Animations
 * Typing effect, glitch, gradient animation
 */

(function() {
  'use strict';

  function init() {
    // Typing animation
    document.querySelectorAll('[data-typing]').forEach(el => {
      const text = el.dataset.typing || el.textContent;
      el.textContent = '';
      el.style.visibility = 'visible';

      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      el.appendChild(cursor);

      let charIndex = 0;
      const speed = 25; // ms per char (~40 chars/sec)

      function typeChar() {
        if (charIndex < text.length) {
          el.insertBefore(document.createTextNode(text[charIndex]), cursor);
          charIndex++;
          setTimeout(typeChar, speed);
        }
      }

      // Start typing when element enters viewport
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            observer.disconnect();
            setTimeout(typeChar, 500);
          }
        });
      }, { threshold: 0.5 });

      observer.observe(el);
    });

    // Glitch effect on title (brief, on load)
    document.querySelectorAll('[data-glitch]').forEach(el => {
      el.style.position = 'relative';
      const text = el.textContent;

      const before = document.createElement('span');
      before.textContent = text;
      before.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;color:#c9a961;clip-path:inset(0 0 65% 0);transform:translateX(-2px);opacity:0;`;

      const after = document.createElement('span');
      after.textContent = text;
      after.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;color:#e8c77b;clip-path:inset(65% 0 0 0);transform:translateX(2px);opacity:0;`;

      el.appendChild(before);
      el.appendChild(after);

      // Quick glitch
      setTimeout(() => {
        before.style.opacity = '0.8';
        after.style.opacity = '0.8';
        setTimeout(() => {
          before.style.opacity = '0';
          after.style.opacity = '0';
        }, 150);
        setTimeout(() => {
          before.style.opacity = '0.5';
          after.style.opacity = '0.5';
          setTimeout(() => {
            before.style.opacity = '0';
            after.style.opacity = '0';
          }, 100);
        }, 300);
      }, 200);
    });

    // Comparatif reveal (column by column)
    if (window.__gsapReady) {
      initComparatifReveal();
    } else {
      window.addEventListener('gsap-ready', initComparatifReveal);
    }
  }

  function initComparatifReveal() {
    const table = document.querySelector('[data-comparatif-table]');
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    rows.forEach((row, i) => {
      gsap.fromTo(row,
        { x: -30, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.6,
          delay: i * 0.08,
          scrollTrigger: {
            trigger: table,
            start: 'top 80%',
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
