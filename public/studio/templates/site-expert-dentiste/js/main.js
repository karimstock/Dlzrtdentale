/* JADOMI — Site Expert Dentiste — Scripts partagés */

// Navbar scroll effect
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  navbar?.classList.toggle('scrolled', window.scrollY > 50);
});

// Reveal on scroll
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach(el => observer.observe(el));

// Counter animation
document.querySelectorAll('[data-count]').forEach(el => {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const hasDecimal = String(target).includes('.');
  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      io.disconnect();
      const start = performance.now();
      const duration = 2000;
      function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = t * (2 - t);
        const val = ease * target;
        el.textContent = (hasDecimal ? val.toFixed(1) : Math.round(val).toLocaleString('fr-FR')) + suffix;
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  }, { threshold: 0.5 });
  io.observe(el);
});

// Mobile menu toggle
document.querySelector('.nav-burger')?.addEventListener('click', function() {
  const links = document.querySelector('.nav-links');
  links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
  links.style.flexDirection = 'column';
  links.style.position = 'absolute';
  links.style.top = '72px';
  links.style.left = '0';
  links.style.right = '0';
  links.style.background = 'rgba(250,247,242,.98)';
  links.style.padding = '16px';
  links.style.backdropFilter = 'blur(20px)';
  links.style.borderBottom = '1px solid rgba(0,0,0,.06)';
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
