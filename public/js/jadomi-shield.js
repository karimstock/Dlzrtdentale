// JADOMI Shield — Protection propriete intellectuelle
// (c) 2026 JADOMI — Dr Karim Bahmed — Tous droits reserves
(function(){
  'use strict';

  // Bloquer clic droit (sauf en dev)
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    });
  }

  // Bloquer raccourcis source/devtools
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return false; }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) { e.preventDefault(); return false; }
    if (e.key === 'F12') { e.preventDefault(); return false; }
  });

  // Detecter ouverture DevTools
  var devtoolsOpen = false;
  setInterval(function() {
    var w = window.outerWidth - window.innerWidth > 160;
    var h = window.outerHeight - window.innerHeight > 160;
    if ((w || h) && !devtoolsOpen) {
      devtoolsOpen = true;
      console.log('%c⚠ JADOMI — Code protege par la propriete intellectuelle', 'color:red;font-size:20px;font-weight:bold;');
      console.log('%cToute copie, reproduction ou ingenierie inverse est interdite.', 'color:red;font-size:14px;');
      console.log('%c© 2026 JADOMI — Dr Karim Bahmed — Tous droits reserves', 'color:gray;font-size:12px;');
    } else if (!w && !h) { devtoolsOpen = false; }
  }, 1000);

  // Bloquer selection texte sur elements proteges
  document.addEventListener('selectstart', function(e) {
    if (e.target.closest && e.target.closest('[data-protected]')) {
      e.preventDefault(); return false;
    }
  });

  // Bloquer drag images
  document.addEventListener('dragstart', function(e) {
    if (e.target.tagName === 'IMG') { e.preventDefault(); return false; }
  });

  // CSS anti-drag images
  var s = document.createElement('style');
  s.textContent = 'img { -webkit-user-drag: none; user-select: none; } [data-protected] { user-select: none; -webkit-user-select: none; }';
  document.head.appendChild(s);

  // Fingerprint session (tracage fuites)
  window.__jadomi_fp = btoa(navigator.userAgent + '|' + screen.width + 'x' + screen.height + '|' + new Date().getTimezoneOffset());
})();
