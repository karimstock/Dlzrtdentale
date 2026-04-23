// =============================================
// JADOMI — Coach Bootstrap
// Auto-loads tour guide + help button on all dashboard pages
// Include via <script src="/public/js/coach-bootstrap.js" defer></script>
// =============================================
(function() {
  'use strict';

  // Floating help button CSS
  const HELP_CSS = `
.floating-help{position:fixed;bottom:28px;right:28px;width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#c9a961,#e8c77b);color:#0a0a0f;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;text-decoration:none;box-shadow:0 8px 28px rgba(201,169,97,.3);z-index:100;transition:all .4s cubic-bezier(.16,1,.3,1)}
.floating-help:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 12px 40px rgba(201,169,97,.5)}
`;

  function injectHelpCSS() {
    if (document.getElementById('coach-help-css')) return;
    const s = document.createElement('style');
    s.id = 'coach-help-css';
    s.textContent = HELP_CSS;
    document.head.appendChild(s);
  }

  function addHelpButton() {
    if (document.querySelector('.floating-help')) return;
    const btn = document.createElement('a');
    btn.href = '/aide';
    btn.className = 'floating-help';
    btn.setAttribute('aria-label', 'Centre d\'aide');
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    document.body.appendChild(btn);
  }

  function getToken() {
    try {
      var keys = Object.keys(localStorage).filter(function(k) { return k.startsWith('sb-'); });
      for (var i = 0; i < keys.length; i++) {
        var v = JSON.parse(localStorage.getItem(keys[i]));
        if (v && v.access_token) return v.access_token;
      }
    } catch (e) {}
    return null;
  }

  function getSocieteId() {
    return localStorage.getItem('societe_active_id') ||
           localStorage.getItem('selectedSocieteId') ||
           localStorage.getItem('societe_id') || null;
  }

  function detectMetier() {
    var path = window.location.pathname;
    if (path.includes('avocat')) return 'avocat';
    if (path.includes('ortho')) return 'orthodontiste';
    if (path.includes('prothes')) return 'prothesiste';
    if (path.includes('paramedical')) return 'paramedical';
    if (path.includes('sci')) return 'sci';
    if (path.includes('coiff') || path.includes('bien-etre')) return 'coiffeur';
    if (path.includes('btp')) return 'btp';
    if (path.includes('creat')) return 'createur';
    return localStorage.getItem('jadomi_profession') || 'dentiste';
  }

  async function initTour() {
    var token = getToken();
    var societeId = getSocieteId();
    if (!token || !societeId) return;

    // Check state
    try {
      var stateRes = await fetch('/api/coach/state?societe_id=' + societeId, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!stateRes.ok) return;
      var result = await stateRes.json();
      var state = result.state;
      if (state && (state.tour_completed || state.tour_skipped)) return;
    } catch (e) { return; }

    // Detect profession
    var metier = detectMetier();
    try {
      var socRes = await fetch('/api/societes/' + societeId, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (socRes.ok) {
        var soc = await socRes.json();
        var type = (soc.societe || soc).type;
        if (type === 'cabinet_dentaire') metier = 'dentiste';
        else if (type === 'juridique') metier = 'avocat';
        else if (type === 'paramedical') metier = 'paramedical';
        else if (type === 'services') metier = 'coiffeur';
        else if (type === 'artisan_btp') metier = 'btp';
        else if (type === 'createur') metier = 'createur';
        else if (type === 'sci') metier = 'sci';
        // Store for future use
        localStorage.setItem('jadomi_profession', metier);
      }
    } catch (e) {}

    // Get steps
    var steps = window.getTourSteps ? window.getTourSteps(metier) : null;
    if (!steps || !steps.length || !window.JadomiTourGuide) return;

    // Launch tour
    var tour = new window.JadomiTourGuide({
      steps: steps,
      onComplete: function() {
        fetch('/api/coach/tour-completed', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ societe_id: societeId })
        }).catch(function() {});
      },
      onSkip: function() {
        fetch('/api/coach/tour-skipped', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ societe_id: societeId })
        }).catch(function() {});
      }
    });
    tour.start();
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    injectHelpCSS();
    addHelpButton();
    // Delay tour to let dashboard load
    setTimeout(function() { initTour().catch(function(e) { console.warn('[Coach]', e); }); }, 2000);
  });
})();
