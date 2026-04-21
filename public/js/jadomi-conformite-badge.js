/* ==============================================================
 * JADOMI — Ticker conformite facturation electronique
 * Inclure sur toutes les pages dashboard :
 * <script src="/public/js/jadomi-conformite-badge.js" defer></script>
 * ============================================================== */
(function() {
  'use strict';

  var STORAGE_KEY = 'jcb-ticker-dismissed';

  function isDismissed() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch(e) { return false; }
  }

  function injectTicker() {
    if (isDismissed()) return;

    var style = document.createElement('style');
    style.id = 'jcb-styles';
    style.textContent = [
      '.jcb-ticker{position:fixed;top:0;left:0;right:0;z-index:9999;height:35px;background:#0f172a;overflow:hidden;display:flex;align-items:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
      '.jcb-ticker-track{flex:1;overflow:hidden;height:100%;display:flex;align-items:center;}',
      '.jcb-ticker-text{display:inline-block;white-space:nowrap;color:#fff;font-size:13px;font-weight:500;letter-spacing:.3px;animation:jcb-scroll 18s linear infinite;padding-left:100%;}',
      '@keyframes jcb-scroll{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}',
      '.jcb-ticker-close{flex-shrink:0;background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:16px;padding:0 12px;height:100%;display:flex;align-items:center;transition:color .2s;}',
      '.jcb-ticker-close:hover{color:#fff;}',
      'body.jcb-has-ticker{padding-top:35px;}'
    ].join('\n');
    document.head.appendChild(style);

    var ticker = document.createElement('div');
    ticker.className = 'jcb-ticker';
    ticker.setAttribute('role', 'marquee');
    ticker.innerHTML =
      '<div class="jcb-ticker-track">' +
        '<span class="jcb-ticker-text">\u26a1 Facturation \u00e9lectronique obligatoire d\u00e8s le 1er septembre 2026 \u2014 JADOMI vous met en conformit\u00e9</span>' +
      '</div>' +
      '<button class="jcb-ticker-close" aria-label="Fermer">\u2715</button>';

    ticker.querySelector('.jcb-ticker-close').addEventListener('click', function() {
      ticker.remove();
      document.body.classList.remove('jcb-has-ticker');
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch(ex) {}
    });

    document.body.insertBefore(ticker, document.body.firstChild);
    document.body.classList.add('jcb-has-ticker');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectTicker);
  } else {
    injectTicker();
  }
})();
