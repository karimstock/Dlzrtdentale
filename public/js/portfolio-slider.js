/**
 * JADOMI Portfolio Before/After Slider
 * Self-contained component for public portfolio display.
 *
 * Usage:
 *   <script src="/public/js/portfolio-slider.js"></script>
 *   <script>JadomiPortfolio.init('site-id-here', '#portfolio-container');</script>
 */
(function () {
  'use strict';

  /* ── CSS (injected once) ── */
  const STYLES = `
.jp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;padding:1rem 0}
.jp-filters{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.25rem}
.jp-pill{padding:.4rem 1rem;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.6);font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:500;cursor:pointer;transition:all .4s cubic-bezier(.16,1,.3,1)}
.jp-pill:hover{background:rgba(201,169,97,.1);color:rgba(255,255,255,.85)}
.jp-pill.active{background:#c9a961;color:#0f1629;border-color:#c9a961;font-weight:600}
.jp-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;cursor:pointer;transition:all .5s cubic-bezier(.16,1,.3,1)}
.jp-card:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.3);border-color:rgba(201,169,97,.2)}
.jp-card-slider{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none}
.jp-card-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.jp-card-after{clip-path:inset(0 0 0 50%);z-index:2}
.jp-card-handle{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#c9a961;z-index:3;transform:translateX(-50%);pointer-events:none}
.jp-card-handle::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:26px;height:26px;background:#c9a961;border-radius:50%;box-shadow:0 0 12px rgba(201,169,97,.35)}
.jp-card-handle-arrows{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:4;width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:#0f1629;font-size:.65rem;font-weight:700;pointer-events:none}
.jp-card-info{padding:1rem 1.15rem}
.jp-card-type{font-size:.72rem;color:#c9a961;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.25rem}
.jp-card-label{font-family:'Syne',sans-serif;font-size:.92rem;font-weight:600;color:#fff}
.jp-card-dates{font-size:.75rem;color:rgba(255,255,255,.45);margin-top:.25rem}

/* Full-screen modal */
.jp-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);display:none;align-items:center;justify-content:center;flex-direction:column;opacity:0;transition:opacity .5s cubic-bezier(.16,1,.3,1)}
.jp-modal.open{display:flex;opacity:1}
.jp-modal-close{position:absolute;top:1.25rem;right:1.5rem;background:none;border:none;color:rgba(255,255,255,.6);font-size:1.6rem;cursor:pointer;z-index:10;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:all .3s cubic-bezier(.16,1,.3,1)}
.jp-modal-close:hover{background:rgba(255,255,255,.08);color:#fff}
.jp-modal-container{position:relative;width:90vw;max-width:720px;aspect-ratio:4/3;border-radius:16px;overflow:hidden;box-shadow:0 0 60px rgba(201,169,97,.2),0 30px 80px rgba(0,0,0,.5);user-select:none;-webkit-user-select:none;touch-action:none}
.jp-modal-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.jp-modal-after{clip-path:inset(0 0 0 50%);z-index:2}
.jp-modal-handle{position:absolute;top:0;bottom:0;left:50%;width:3px;background:#c9a961;z-index:5;transform:translateX(-50%);pointer-events:none}
.jp-modal-handle::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:#c9a961;border-radius:50%;box-shadow:0 0 20px rgba(201,169,97,.35)}
.jp-modal-arrows{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:6;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:#0f1629;font-size:.85rem;font-weight:700;pointer-events:none}
.jp-modal-dates{position:absolute;bottom:1.25rem;left:0;right:0;display:flex;justify-content:space-between;padding:0 1.25rem;z-index:8;pointer-events:none}
.jp-modal-date{padding:.4rem .85rem;background:rgba(15,22,41,.8);backdrop-filter:blur(8px);border-radius:6px;font-size:.78rem;font-weight:600;color:#c9a961;letter-spacing:.03em;font-family:'DM Sans',sans-serif}
.jp-modal-info{margin-top:1.25rem;text-align:center;color:rgba(255,255,255,.55);font-size:.85rem;font-family:'DM Sans',sans-serif}
.jp-empty{text-align:center;padding:3rem 1rem;color:rgba(255,255,255,.4);font-family:'DM Sans',sans-serif}
.jp-loader{display:flex;justify-content:center;padding:3rem}
.jp-spinner{width:28px;height:28px;border:3px solid rgba(255,255,255,.08);border-top-color:#c9a961;border-radius:50%;animation:jp-spin .8s linear infinite}
@keyframes jp-spin{to{transform:rotate(360deg)}}

@media(max-width:900px){.jp-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.jp-grid{grid-template-columns:1fr}.jp-modal-container{width:95vw;border-radius:12px}}
`;

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
    stylesInjected = true;
  }

  /* ── Slider Logic (reusable) ── */
  function initSlider(container, afterImg, handle) {
    let isDragging = false;

    function updatePosition(x) {
      const rect = container.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
      afterImg.style.clipPath = `inset(0 0 0 ${pct}%)`;
      handle.style.left = pct + '%';
    }

    container.addEventListener('mousedown', function (e) { isDragging = true; updatePosition(e.clientX); });
    document.addEventListener('mousemove', function (e) { if (isDragging) updatePosition(e.clientX); });
    document.addEventListener('mouseup', function () { isDragging = false; });

    container.addEventListener('touchstart', function (e) { isDragging = true; updatePosition(e.touches[0].clientX); }, { passive: true });
    container.addEventListener('touchmove', function (e) { if (isDragging) { e.preventDefault(); updatePosition(e.touches[0].clientX); } }, { passive: false });
    container.addEventListener('touchend', function () { isDragging = false; });
  }

  /* ── Main module ── */
  const JadomiPortfolio = {
    _cases: [],
    _container: null,
    _activeFilter: null,

    init: function (siteId, selector) {
      injectStyles();
      const root = document.querySelector(selector);
      if (!root) { console.warn('[JadomiPortfolio] Container not found:', selector); return; }
      this._container = root;
      root.innerHTML = '<div class="jp-loader"><div class="jp-spinner"></div></div>';
      this._fetchPortfolio(siteId);
    },

    _fetchPortfolio: function (siteId) {
      const self = this;
      fetch('/api/timeline/public/portfolio/' + encodeURIComponent(siteId))
        .then(function (res) {
          if (!res.ok) throw new Error('Fetch failed');
          return res.json();
        })
        .then(function (data) {
          self._cases = data.cases || data || [];
          self._render();
        })
        .catch(function () {
          self._container.innerHTML = '<div class="jp-empty">Portfolio indisponible pour le moment.</div>';
        });
    },

    _render: function () {
      const self = this;
      const root = this._container;
      root.innerHTML = '';

      if (!this._cases.length) {
        root.innerHTML = '<div class="jp-empty">Aucun cas a afficher pour le moment.</div>';
        return;
      }

      /* Filter pills */
      const types = [...new Set(this._cases.map(function (c) { return c.treatmentType || c.treatment_type || 'Autre'; }))];
      if (types.length > 1) {
        const filtersDiv = document.createElement('div');
        filtersDiv.className = 'jp-filters';
        const allPill = document.createElement('button');
        allPill.className = 'jp-pill active';
        allPill.textContent = 'Tous';
        allPill.onclick = function () { self._filter(null); };
        filtersDiv.appendChild(allPill);
        types.forEach(function (t) {
          const pill = document.createElement('button');
          pill.className = 'jp-pill';
          pill.textContent = t;
          pill.onclick = function () { self._filter(t); };
          filtersDiv.appendChild(pill);
        });
        root.appendChild(filtersDiv);
      }

      /* Grid */
      const grid = document.createElement('div');
      grid.className = 'jp-grid';
      grid.id = 'jp-grid';
      root.appendChild(grid);

      this._renderCards(this._cases);

      /* Modal (appended once) */
      this._createModal();
    },

    _renderCards: function (cases) {
      const self = this;
      const grid = document.getElementById('jp-grid');
      grid.innerHTML = '';

      cases.forEach(function (c, idx) {
        const card = document.createElement('div');
        card.className = 'jp-card';
        card.setAttribute('data-type', c.treatmentType || c.treatment_type || 'Autre');

        const beforeSrc = (c.beforePhoto || c.before_photo || {}).url || c.beforeUrl || '';
        const afterSrc = (c.afterPhoto || c.after_photo || {}).url || c.afterUrl || '';
        const type = c.treatmentType || c.treatment_type || '';
        const label = c.label || c.title || 'Cas ' + (idx + 1);
        const dateBefore = self._fmtDate(c.dateStart || c.date_start);
        const dateAfter = self._fmtDate(c.dateEnd || c.date_end);

        card.innerHTML = `
          <div class="jp-card-slider">
            <img class="jp-card-img jp-card-before" src="${self._esc(beforeSrc)}" alt="Avant" loading="lazy">
            <img class="jp-card-img jp-card-after" src="${self._esc(afterSrc)}" alt="Apres" loading="lazy">
            <div class="jp-card-handle"></div>
            <div class="jp-card-handle-arrows">&#9664;&#9654;</div>
          </div>
          <div class="jp-card-info">
            ${type ? '<div class="jp-card-type">' + self._esc(type) + '</div>' : ''}
            <div class="jp-card-label">${self._esc(label)}</div>
            ${dateBefore || dateAfter ? '<div class="jp-card-dates">' + self._esc(dateBefore) + ' — ' + self._esc(dateAfter) + '</div>' : ''}
          </div>`;

        /* Init mini slider */
        const sliderEl = card.querySelector('.jp-card-slider');
        const afterImg = card.querySelector('.jp-card-after');
        const handle = card.querySelector('.jp-card-handle');
        initSlider(sliderEl, afterImg, handle);

        /* Click to open modal */
        card.querySelector('.jp-card-info').addEventListener('click', function () {
          self._openModal(c, idx);
        });

        grid.appendChild(card);
      });
    },

    _filter: function (type) {
      this._activeFilter = type;
      const pills = this._container.querySelectorAll('.jp-pill');
      pills.forEach(function (p) {
        p.classList.toggle('active', type === null ? p.textContent === 'Tous' : p.textContent === type);
      });
      const filtered = type ? this._cases.filter(function (c) { return (c.treatmentType || c.treatment_type || 'Autre') === type; }) : this._cases;
      this._renderCards(filtered);
    },

    _createModal: function () {
      if (document.getElementById('jp-modal')) return;
      const self = this;
      const modal = document.createElement('div');
      modal.className = 'jp-modal';
      modal.id = 'jp-modal';
      modal.innerHTML = `
        <button class="jp-modal-close" aria-label="Fermer">&#10005;</button>
        <div class="jp-modal-container" id="jp-modal-container">
          <img class="jp-modal-img jp-modal-before" id="jp-modal-before" alt="Avant">
          <img class="jp-modal-img jp-modal-after" id="jp-modal-after" alt="Apres">
          <div class="jp-modal-handle" id="jp-modal-handle"></div>
          <div class="jp-modal-arrows">&#9664;&#9654;</div>
          <div class="jp-modal-dates">
            <span class="jp-modal-date" id="jp-modal-date-before">Avant</span>
            <span class="jp-modal-date" id="jp-modal-date-after">Apres</span>
          </div>
        </div>
        <div class="jp-modal-info" id="jp-modal-info"></div>`;
      document.body.appendChild(modal);

      /* Init modal slider */
      const container = document.getElementById('jp-modal-container');
      const afterImg = document.getElementById('jp-modal-after');
      const handle = document.getElementById('jp-modal-handle');
      initSlider(container, afterImg, handle);

      /* Close */
      modal.querySelector('.jp-modal-close').addEventListener('click', function () {
        modal.classList.remove('open');
        document.body.style.overflow = '';
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
          modal.classList.remove('open');
          document.body.style.overflow = '';
        }
      });
    },

    _openModal: function (c, idx) {
      const modal = document.getElementById('jp-modal');
      const beforeSrc = (c.beforePhoto || c.before_photo || {}).url || c.beforeUrl || '';
      const afterSrc = (c.afterPhoto || c.after_photo || {}).url || c.afterUrl || '';
      document.getElementById('jp-modal-before').src = beforeSrc;
      document.getElementById('jp-modal-after').src = afterSrc;
      document.getElementById('jp-modal-date-before').textContent = this._fmtDate(c.dateStart || c.date_start) || 'Avant';
      document.getElementById('jp-modal-date-after').textContent = this._fmtDate(c.dateEnd || c.date_end) || 'Apres';

      const label = c.label || c.title || 'Cas ' + (idx + 1);
      const type = c.treatmentType || c.treatment_type || '';
      document.getElementById('jp-modal-info').textContent = (type ? type + ' — ' : '') + label;

      /* Reset slider to 50% */
      document.getElementById('jp-modal-after').style.clipPath = 'inset(0 0 0 50%)';
      document.getElementById('jp-modal-handle').style.left = '50%';

      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    },

    _esc: function (s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    },

    _fmtDate: function (d) {
      if (!d) return '';
      try {
        return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return d; }
    }
  };

  /* Expose globally */
  window.JadomiPortfolio = JadomiPortfolio;
})();
