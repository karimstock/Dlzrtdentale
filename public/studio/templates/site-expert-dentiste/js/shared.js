/* Site Expert Dentiste — Composants partagés */
const ROOT = location.pathname.includes('/pages/') ? '..' : '.';
const PAGES = location.pathname.includes('/pages/') ? '.' : 'pages';

function renderNav(active) {
  const nav = document.createElement('nav');
  nav.className = 'n';
  nav.id = 'nv';
  nav.innerHTML = `
    <a href="${ROOT}/index.html" class="nl"><span class="d"></span>Dr. Martin</a>
    <div class="nk">
      <a href="${ROOT}/index.html" ${active==='accueil'?'class="active"':''}>Accueil</a>
      <a href="${PAGES}/cabinet.html" ${active==='cabinet'?'class="active"':''}>Le Cabinet</a>
      <a href="${PAGES}/soins.html" ${active==='soins'?'class="active"':''}>Nos Soins</a>
      <a href="${PAGES}/equipe.html" ${active==='equipe'?'class="active"':''}>Équipe</a>
      <a href="${PAGES}/resultats.html" ${active==='resultats'?'class="active"':''}>Résultats</a>
      <a href="${PAGES}/contact.html" ${active==='contact'?'class="active"':''}>Contact</a>
    </div>
    <a href="${PAGES}/contact.html#rdv" class="nc">Prendre RDV</a>
  `;
  document.body.prepend(nav);
  window.addEventListener('scroll', () => nav.classList.toggle('s', scrollY > 50));
}

function renderFooter() {
  const ft = document.createElement('footer');
  ft.className = 'ft';
  ft.innerHTML = `
    <div class="fg">
      <div><div class="fb">Dr. Martin</div><p style="font-size:12px;color:var(--t2);line-height:1.6">Cabinet dentaire moderne à Roubaix. Implantologie, esthétique, orthodontie.</p></div>
      <div><h4>Soins</h4><a href="${PAGES}/soins.html#esthetique">Esthétique</a><a href="${PAGES}/soins.html#implants">Implantologie</a><a href="${PAGES}/soins.html#orthodontie">Orthodontie</a><a href="${PAGES}/soins.html#urgences">Urgences</a></div>
      <div><h4>Cabinet</h4><a href="${PAGES}/cabinet.html">Visite</a><a href="${PAGES}/equipe.html">Équipe</a><a href="${PAGES}/resultats.html">Résultats</a><a href="${PAGES}/nouveau-patient.html">Nouveau patient</a></div>
      <div><h4>Contact</h4><a href="tel:0320734512">03 20 73 45 12</a><a>12 rue de la Santé</a><a>59100 Roubaix</a><a>Lun-Ven 9h-19h</a></div>
    </div>
    <div class="fx">© 2026 Dr. Martin — <a href="https://jadomi.fr">JADOMI</a></div>
  `;
  document.body.appendChild(ft);
}

function renderCTA() {
  const cta = document.createElement('section');
  cta.className = 'cta rv';
  cta.id = 'rdv';
  cta.innerHTML = `
    <h2>Prenez soin de votre sourire</h2>
    <p>Lundi au vendredi, 9h à 19h. RDV en ligne 24h/24.</p>
    <a href="${PAGES}/contact.html#rdv" class="bp" style="padding:15px 40px;font-size:16px;text-decoration:none;display:inline-block;border-radius:12px">Prendre rendez-vous</a>
    <a href="tel:0320734512" class="ph">03 20 73 45 12</a>
  `;
  document.body.appendChild(cta);
}

function initAnimations() {
  gsap.registerPlugin(ScrollTrigger);
  const o = new IntersectionObserver(e => e.forEach(x => { if (x.isIntersecting) x.target.classList.add('v'); }), { threshold: 0.08 });
  document.querySelectorAll('.rv').forEach(el => o.observe(el));
}

function imgPath(name) {
  return ROOT + '/img/' + name;
}
