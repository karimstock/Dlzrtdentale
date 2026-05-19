/**
 * JADOMI COPILOT — Widget global flottant
 * Chat + Panneau latéral (mails, docs, brouillons)
 * S'injecte sur TOUTES les pages. Auto-init.
 */
(function () {
  'use strict';
  if (window.__jadomiCopilotLoaded) return;
  window.__jadomiCopilotLoaded = true;

  var ACCENT = '#6366f1';
  var BG = '#0f0f1a';
  var BG2 = '#1a1a28';
  var BG3 = '#252535';
  var TEXT = '#f0f0f0';
  var TEXT2 = 'rgba(255,255,255,.55)';
  var BORDER = 'rgba(255,255,255,.08)';
  var EASE = 'cubic-bezier(.16,1,.3,1)';

  // ================================================================
  // CSS
  // ================================================================
  var s = document.createElement('style');
  s.textContent = `
.jcp-fab{position:fixed;bottom:24px;right:24px;z-index:99990;width:56px;height:56px;border-radius:16px;border:none;background:linear-gradient(135deg,${ACCENT},#8b5cf6);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 30px rgba(99,102,241,.35);transition:all .4s ${EASE};}
.jcp-fab:hover{transform:scale(1.06)}
.jcp-fab svg{width:24px;height:24px;fill:currentColor;transition:transform .3s ${EASE}}
.jcp-fab.open svg{transform:rotate(90deg)}
.jcp-fab.open{border-radius:50%;background:${BG3};box-shadow:0 4px 20px rgba(0,0,0,.3)}
.jcp-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid ${BG};animation:jcpB 1s ${EASE} infinite;}
@keyframes jcpB{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.jcp-badge:empty{display:none}

/* Panel principal — plus large pour accueillir le split */
.jcp-panel{position:fixed;bottom:92px;right:24px;z-index:99991;width:780px;max-height:620px;background:${BG};border:1px solid ${BORDER};border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.5);backdrop-filter:blur(24px);opacity:0;transform:translateY(20px) scale(.96);pointer-events:none;transition:opacity .35s ${EASE},transform .35s ${EASE};}
.jcp-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}

.jcp-header{padding:12px 18px;display:flex;align-items:center;gap:12px;background:${BG2};border-bottom:1px solid ${BORDER};flex-shrink:0;}
.jcp-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,${ACCENT},#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;flex-shrink:0;}
.jcp-title{flex:1;}.jcp-title-name{font-size:14px;font-weight:700;color:${TEXT};}.jcp-title-status{font-size:10px;color:${TEXT2};display:flex;align-items:center;gap:4px;}
.jcp-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;}
.jcp-close{background:none;border:none;color:${TEXT2};cursor:pointer;padding:4px;display:flex;}.jcp-close:hover{color:${TEXT}}.jcp-close svg{width:16px;height:16px;fill:currentColor}

/* Split view : chat + panneau */
.jcp-body{display:flex;flex:1;overflow:hidden;min-height:0;}
.jcp-chat-side{flex:1;min-width:300px;display:flex;flex-direction:column;border-right:1px solid ${BORDER};}
.jcp-panel-side{width:380px;display:flex;flex-direction:column;overflow:hidden;transition:width .3s ${EASE};}
.jcp-panel-side.empty{width:0;border:none;}
.jcp-panel-side-header{padding:10px 16px;font-size:12px;font-weight:700;color:${TEXT2};border-bottom:1px solid ${BORDER};display:flex;align-items:center;justify-content:space-between;background:${BG2};}
.jcp-panel-side-content{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent;}

/* Messages chat */
.jcp-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:200px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent;}
.jcp-msg{max-width:92%;display:flex;gap:8px;animation:jcpF .3s ease;}.jcp-msg-bot{align-self:flex-start;}.jcp-msg-user{align-self:flex-end;flex-direction:row-reverse;}
.jcp-avatar{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;}
.jcp-msg-bot .jcp-avatar{background:linear-gradient(135deg,${ACCENT},#8b5cf6);color:#fff;}.jcp-msg-user .jcp-avatar{background:${BG3};color:${TEXT};}
.jcp-bubble{padding:9px 13px;font-size:13px;line-height:1.6;border-radius:14px;word-break:break-word;color:${TEXT};}
.jcp-msg-bot .jcp-bubble{background:${BG2};border:1px solid ${BORDER};border-bottom-left-radius:4px;}.jcp-msg-user .jcp-bubble{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.2);border-bottom-right-radius:4px;}
.jcp-sug{padding:5px 12px;border:1px solid ${BORDER};border-radius:20px;font-size:11px;color:${TEXT2};background:transparent;cursor:pointer;transition:all .15s;}.jcp-sug:hover{border-color:${ACCENT};color:${ACCENT};background:rgba(99,102,241,.08);}
.jcp-typing{align-self:flex-start;display:flex;gap:4px;padding:10px 16px;}.jcp-typing span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);animation:jcpD 1.2s ease-in-out infinite;}.jcp-typing span:nth-child(2){animation-delay:.15s}.jcp-typing span:nth-child(3){animation-delay:.3s}
@keyframes jcpD{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
@keyframes jcpF{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* Input */
.jcp-input-area{padding:10px 14px;display:flex;align-items:center;gap:8px;border-top:1px solid ${BORDER};background:${BG2};flex-shrink:0;}
.jcp-mic{width:34px;height:34px;border-radius:10px;border:1px solid ${BORDER};background:transparent;color:${TEXT2};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;}.jcp-mic:hover{border-color:${ACCENT};color:${ACCENT}}.jcp-mic.active{background:#ef4444;border-color:#ef4444;color:#fff;animation:jcpP 1.5s infinite;}
@keyframes jcpP{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
.jcp-mic svg,.jcp-send svg,.jcp-close svg{width:16px;height:16px;fill:currentColor}
.jcp-input{flex:1;background:${BG3};border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:9px 14px;color:${TEXT};font-size:13px;font-family:inherit;outline:none;transition:border-color .3s;}.jcp-input::placeholder{color:${TEXT2}}.jcp-input:focus{border-color:${ACCENT}}
.jcp-send{width:34px;height:34px;border-radius:10px;border:none;background:${ACCENT};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s ${EASE};flex-shrink:0;}.jcp-send:hover{transform:scale(1.06)}.jcp-send:disabled{opacity:.4;cursor:default;transform:none}

/* Cards dans le panneau */
.jcp-card{background:${BG2};border:1px solid ${BORDER};border-radius:12px;padding:14px;transition:border-color .2s;}.jcp-card:hover{border-color:rgba(99,102,241,.3);}
.jcp-card-from{font-size:13px;font-weight:600;color:${TEXT};margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;}
.jcp-card-subject{font-size:12px;color:${TEXT};margin-bottom:6px;}
.jcp-card-meta{font-size:10px;color:${TEXT2};display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.jcp-card-tag{padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;}
.jcp-card-tag-urgent{background:rgba(239,68,68,.15);color:#ef4444;}.jcp-card-tag-response{background:rgba(245,158,11,.12);color:#f59e0b;}.jcp-card-tag-cat{background:rgba(99,102,241,.12);color:#6366f1;}.jcp-card-tag-pdf{background:rgba(52,211,153,.12);color:#34d399;}.jcp-card-tag-fin{background:rgba(245,158,11,.12);color:#f59e0b;}
.jcp-card-actions{display:flex;gap:6px;margin-top:10px;}
.jcp-card-btn{padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;border:none;}
.jcp-card-btn-primary{background:${ACCENT};color:#fff;}.jcp-card-btn-primary:hover{background:#4f46e5;}
.jcp-card-btn-ghost{background:transparent;border:1px solid ${BORDER};color:${TEXT2};}.jcp-card-btn-ghost:hover{border-color:${ACCENT};color:${ACCENT};}

/* Draft card (brouillon mail) */
.jcp-draft{background:${BG2};border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:18px;animation:jcpF .3s ease;}
.jcp-draft-field{margin-bottom:10px;}
.jcp-draft-label{font-size:10px;color:${TEXT2};margin-bottom:3px;font-weight:600;}
.jcp-draft-value{font-size:13px;color:${TEXT};padding:6px 10px;background:${BG3};border:1px solid ${BORDER};border-radius:8px;}
.jcp-draft-body{font-size:13px;color:${TEXT};padding:10px;background:${BG3};border:1px solid ${BORDER};border-radius:8px;min-height:100px;white-space:pre-wrap;line-height:1.6;}
.jcp-draft-body[contenteditable]{outline:none;cursor:text;}.jcp-draft-body[contenteditable]:focus{border-color:${ACCENT};}

@media(max-width:768px){
  .jcp-panel{right:0;bottom:0;left:0;width:100%;max-height:92vh;border-radius:20px 20px 0 0;}
  .jcp-body{flex-direction:column;}
  .jcp-chat-side{min-width:auto;border-right:none;border-bottom:1px solid ${BORDER};max-height:45vh;}
  .jcp-panel-side{width:100%!important;max-height:45vh;}
  .jcp-panel-side.empty{height:0;}
  .jcp-fab{bottom:16px;right:16px;width:50px;height:50px}
  .jcp-messages{max-height:none;}
}
`;
  document.head.appendChild(s);

  // Icons
  var IC = {
    chat: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5-1.34C8.47 21.51 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.12-.46-4.39-1.25l-.31-.19-3.23.87.87-3.23-.19-.31A7.94 7.94 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
  };

  // Auth
  var _cpToken = null, _cpSocieteId = null;

  function initAuth() {
    // Token
    if (window._jToken) _cpToken = window._jToken;
    if (!_cpToken) { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > 0) { try { _cpToken = JSON.parse(localStorage.getItem(k)).access_token; } catch (_) {} break; } } }
    if (!_cpToken) try { _cpToken = JSON.parse(localStorage.getItem('jadomi_session') || '{}').access_token; } catch (_) {}
    // Societe
    _cpSocieteId = window._jSocieteId || localStorage.getItem('jadomi_societe_active') || null;
    // Si pas de societe_id, aller chercher via API
    if (!_cpSocieteId && _cpToken) {
      fetch('/api/societes', { headers: { 'Authorization': 'Bearer ' + _cpToken } })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          if (d && d.societes && d.societes.length > 0) {
            _cpSocieteId = d.societes[0].id;
            localStorage.setItem('jadomi_societe_active', _cpSocieteId);
          }
        }).catch(function() {});
    }
  }

  function getHeaders() {
    if (!_cpToken) initAuth();
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_cpToken || ''), 'X-Societe-Id': _cpSocieteId || '' };
  }

  // Init auth au chargement
  setTimeout(initAuth, 500);

  function detectContext() {
    var p = window.location.pathname;
    if (p.includes('dentiste-pro')) return 'agenda';
    if (p.includes('organisation')) return 'organisation';
    if (p.includes('/ide')) return 'tournees';
    if (p.includes('/labo')) return 'labo';
    if (p.includes('/comparateur')) return 'comparateur';
    if (p === '/' || p.includes('index')) return 'stock';
    return 'general';
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ================================================================
  // BUILD DOM
  // ================================================================
  function init() {
    // FAB
    var fab = document.createElement('button');
    fab.className = 'jcp-fab'; fab.id = 'jcp-fab';
    fab.innerHTML = IC.chat + '<span class="jcp-badge" id="jcp-badge"></span>';

    // Panel
    var panel = document.createElement('div');
    panel.className = 'jcp-panel'; panel.id = 'jcp-panel';
    panel.innerHTML =
      '<div class="jcp-header">' +
        '<div class="jcp-logo">J</div>' +
        '<div class="jcp-title"><div class="jcp-title-name">JADOMI Copilot</div><div class="jcp-title-status"><span class="jcp-dot"></span>En ligne</div></div>' +
        '<button class="jcp-close" id="jcp-close">' + IC.close + '</button>' +
      '</div>' +
      '<div class="jcp-body">' +
        '<div class="jcp-chat-side">' +
          '<div class="jcp-messages" id="jcp-messages"></div>' +
        '</div>' +
        '<div class="jcp-panel-side empty" id="jcp-side">' +
          '<div class="jcp-panel-side-header"><span id="jcp-side-title">Détails</span><button onclick="window.__jcpClosePanel()" style="background:none;border:none;color:' + TEXT2 + ';cursor:pointer;font-size:14px;">✕</button></div>' +
          '<div class="jcp-panel-side-content" id="jcp-side-content"></div>' +
        '</div>' +
      '</div>' +
      '<div class="jcp-input-area">' +
        '<button class="jcp-mic" id="jcp-mic" title="Dicter">' + IC.mic + '</button>' +
        '<input class="jcp-input" id="jcp-input" type="text" placeholder="Demandez quelque chose..." autocomplete="off">' +
        '<button class="jcp-send" id="jcp-send">' + IC.send + '</button>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var messages = document.getElementById('jcp-messages');
    var input = document.getElementById('jcp-input');
    var sendBtn = document.getElementById('jcp-send');
    var micBtn = document.getElementById('jcp-mic');
    var sidePanel = document.getElementById('jcp-side');
    var sideContent = document.getElementById('jcp-side-content');
    var sideTitle = document.getElementById('jcp-side-title');
    var isOpen = false, isWaiting = false;
    var ctx = detectContext();
    var currentDraft = null;

    // Toggle
    function toggle() {
      isOpen = !isOpen;
      fab.classList.toggle('open', isOpen);
      panel.classList.toggle('open', isOpen);
      fab.innerHTML = (isOpen ? IC.close : IC.chat) + '<span class="jcp-badge" id="jcp-badge">' + (document.getElementById('jcp-badge')?.textContent || '') + '</span>';
      if (isOpen) setTimeout(function () { input.focus(); }, 350);
    }
    fab.onclick = toggle;
    document.getElementById('jcp-close').onclick = toggle;

    // Panel latéral
    function openSidePanel(title, html) {
      sideTitle.textContent = title;
      sideContent.innerHTML = html;
      sidePanel.classList.remove('empty');
    }
    function closeSidePanel() { sidePanel.classList.add('empty'); }
    window.__jcpClosePanel = closeSidePanel;

    // Messages
    function addMsg(html, isUser) {
      var d = document.createElement('div');
      d.className = 'jcp-msg ' + (isUser ? 'jcp-msg-user' : 'jcp-msg-bot');
      d.innerHTML = '<div class="jcp-avatar">' + (isUser ? 'V' : 'J') + '</div><div class="jcp-bubble">' + html + '</div>';
      messages.appendChild(d);
      messages.scrollTop = messages.scrollHeight;
    }
    function showTyping() { var d = document.createElement('div'); d.className = 'jcp-typing'; d.id = 'jcp-typing'; d.innerHTML = '<span></span><span></span><span></span>'; messages.appendChild(d); messages.scrollTop = messages.scrollHeight; }
    function hideTyping() { var e = document.getElementById('jcp-typing'); if (e) e.remove(); }

    // Welcome dynamique — résumé dashboard
    function buildDashboardCard(icon, label, detail, command) {
      return '<div onclick="window.__jcpSend(\'' + command.replace(/'/g, "\\'") + '\')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' + BG3 + ';border:1px solid ' + BORDER + ';border-radius:10px;cursor:pointer;transition:border-color .2s;" onmouseover="this.style.borderColor=\'rgba(99,102,241,.4)\'" onmouseout="this.style.borderColor=\'' + BORDER + '\'">' +
        '<span style="font-size:15px;flex-shrink:0;width:20px;text-align:center;">' + icon + '</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;font-weight:600;color:' + TEXT + ';">' + label + '</div>' +
          (detail ? '<div style="font-size:10px;color:' + TEXT2 + ';margin-top:1px;">' + detail + '</div>' : '') +
        '</div>' +
        '<span style="font-size:10px;color:' + TEXT2 + ';">&#9656;</span>' +
      '</div>';
    }

    function loadWelcome() {
      fetch('/api/copilot/dashboard-summary', { headers: getHeaders() })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          if (!d) return;
          var el = document.querySelector('.jcp-msg-bot .jcp-bubble');
          if (!el) return;

          var html = '<div style="font-size:13px;font-weight:600;color:' + TEXT + ';margin-bottom:10px;">' + (d.greeting || 'Bonjour Docteur') + '</div>';
          html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">';

          // Mails
          var mailLabel = (d.mails.unread || 0) + ' mail(s) non lu(s)';
          var mailDetail = '';
          if (d.mails.needs_response > 0) mailDetail += d.mails.needs_response + ' attendent une reponse';
          if (d.mails.urgent > 0) mailDetail += (mailDetail ? ' · ' : '') + d.mails.urgent + ' urgent(s)';
          if (d.mails.factures_new > 0) mailDetail += (mailDetail ? ' · ' : '') + d.mails.factures_new + ' facture(s)';
          html += buildDashboardCard('&#9993;', mailLabel, mailDetail, 'Mes mails du jour');

          // Agenda
          var agLabel = (d.agenda.today_count || 0) + ' RDV aujourd\'hui';
          var agDetail = '';
          if (d.agenda.next_patient) {
            agDetail = 'Prochain : ' + d.agenda.next_patient.name + ' a ' + d.agenda.next_patient.time;
            if (d.agenda.next_patient.acte) agDetail += ' (' + d.agenda.next_patient.acte + ')';
          }
          if (d.agenda.cancellations_today > 0) agDetail += (agDetail ? ' · ' : '') + d.agenda.cancellations_today + ' annulation(s)';
          html += buildDashboardCard('&#9735;', agLabel, agDetail, 'Mon agenda du jour');

          // Stock (afficher seulement si alertes)
          if ((d.stock.low_alerts || 0) > 0 || (d.stock.expiring_soon || 0) > 0) {
            var stLabel = (d.stock.low_alerts || 0) + ' alerte(s) stock bas';
            var stDetail = '';
            if (d.stock.expiring_soon > 0) stDetail = d.stock.expiring_soon + ' produit(s) bientot perimes';
            html += buildDashboardCard('&#9830;', stLabel, stDetail, 'Alertes stock');
          }

          // Tasks (afficher seulement si en attente)
          if ((d.tasks.pending || 0) > 0) {
            var tkLabel = (d.tasks.pending || 0) + ' tache(s) en attente';
            var tkDetail = d.tasks.urgent > 0 ? d.tasks.urgent + ' urgente(s)' : '';
            html += buildDashboardCard('&#10003;', tkLabel, tkDetail, 'Mes taches en attente');
          }

          // Rapport matinal (scan auto des factures)
          if (d.morning_report && d.morning_report.total_factures > 0) {
            var mrLabel = d.morning_report.total_factures + ' facture(s) triee(s) ce matin';
            var mrDetail = d.morning_report.categorized > 0 ? d.morning_report.categorized + ' classee(s) automatiquement' : '';
            html += buildDashboardCard('&#128204;', mrLabel, mrDetail, 'Mes factures');
          }

          // Notifications fourmilière (recasage, alertes, etc.)
          if (d.fourmiliere_notifications && d.fourmiliere_notifications.length > 0) {
            d.fourmiliere_notifications.forEach(function(n) {
              html += buildDashboardCard('&#129520;', n.title, n.message, null);
            });
          }

          html += '</div>';

          // Suggestions rapides
          var sugs2 = ['Mails importants', 'Scan mes factures', 'Aide'];
          html += '<div style="display:flex;flex-wrap:wrap;gap:5px;">' +
            sugs2.map(function (s) { return '<button class="jcp-sug" onclick="window.__jcpSend(\'' + s.replace(/'/g, "\\'") + '\')">' + s + '</button>'; }).join('') + '</div>';

          el.innerHTML = html;
        }).catch(function() {
          // Fallback silencieux — le message par défaut reste affiché
        });
    }

    var sugs = ['Mes mails du jour', 'Mails importants', 'Scan mes factures', 'Envoie un mail au comptable', 'Aide'];
    addMsg('Bonjour Docteur, comment puis-je vous aider ?<br><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;">' +
      sugs.map(function (s) { return '<button class="jcp-sug" onclick="window.__jcpSend(\'' + s.replace(/'/g, "\\'") + '\')">' + s + '</button>'; }).join('') + '</div>', false);

    // Charger le résumé dynamique après 1.5s
    setTimeout(loadWelcome, 1500);

    // ================================================================
    // RENDER CARDS dans le panneau latéral
    // ================================================================
    function renderMailCards(mails, title, pubs) {
      var html = '';
      // Section mails importants
      if (mails && mails.length > 0) {
        html += '<div style="font-size:12px;font-weight:700;color:' + ACCENT + ';margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Importants (' + mails.length + ')</div>';
        mails.forEach(function (m) {
          html += renderOneMailCard(m, true);
        });
      }
      // Section pubs/newsletters (séparée, style atténué)
      if (pubs && pubs.length > 0) {
        html += '<div style="font-size:12px;font-weight:700;color:' + TEXT2 + ';margin:16px 0 8px;text-transform:uppercase;letter-spacing:1px;opacity:0.6;">Pubs & Newsletters (' + pubs.length + ')</div>';
        pubs.forEach(function (m) {
          html += renderOneMailCard(m, false);
        });
      }
      openSidePanel(title, html);
    }

    function renderOneMailCard(m, isImportant) {
      var date = m.date_received ? new Date(m.date_received).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      var mid = m.id || '';
      var opacity = isImportant ? '1' : '0.6';
      var html = '<div class="jcp-card" style="cursor:pointer;opacity:' + opacity + ';" onclick="window.__jcpReadMail(\'' + mid + '\')">';
      html += '<div class="jcp-card-from"><span>' + esc(m.from_name || m.from_address || '?') + '</span><span style="font-size:10px;color:' + TEXT2 + ';">' + date + '</span></div>';
      html += '<div class="jcp-card-subject">' + esc(m.subject || '(sans objet)') + '</div>';
      html += '<div class="jcp-card-meta">';
      if (m.needs_response) html += '<span class="jcp-card-tag jcp-card-tag-response">Réponse attendue</span>';
      if (m.priority === 'urgent') html += '<span class="jcp-card-tag jcp-card-tag-urgent">Urgent</span>';
      if (!isImportant) html += '<span class="jcp-card-tag" style="background:rgba(148,163,184,0.15);color:' + TEXT2 + ';">Pub</span>';
      if (m.category && m.category !== 'autre' && m.category !== 'newsletter') html += '<span class="jcp-card-tag jcp-card-tag-cat">' + esc(m.category) + '</span>';
      if (m.has_pdf) html += '<span class="jcp-card-tag jcp-card-tag-pdf">PDF</span>';
      if (m.financial_type && m.financial_type !== 'inconnu') html += '<span class="jcp-card-tag jcp-card-tag-fin">' + esc(m.financial_type) + (m.financial_montant ? ' ' + m.financial_montant + ' EUR' : '') + '</span>';
      html += '</div>';
      if (m.body_preview) html += '<div style="font-size:11px;color:' + TEXT2 + ';margin-top:6px;line-height:1.5;">' + esc(m.body_preview.substring(0, 120)) + '...</div>';
      html += '<div class="jcp-card-actions">';
      html += '<button class="jcp-card-btn jcp-card-btn-ghost" onclick="event.stopPropagation();window.__jcpReadMail(\'' + mid + '\')">Lire</button>';
      if (m.needs_response && isImportant) html += '<button class="jcp-card-btn jcp-card-btn-primary" onclick="event.stopPropagation();window.__jcpSend(\'réponds à ' + esc(m.from_name || m.from_address).replace(/'/g, "\\'") + ' que \')">Répondre</button>';
      html += '</div>';
      html += '</div>';
      return html;
    }

    // Lire un mail complet
    window.__jcpReadMail = function(mailId) {
      if (!mailId) return;
      openSidePanel('Chargement...', '<div style="text-align:center;padding:30px;color:' + TEXT2 + ';">Téléchargement du mail...</div>');
      fetch('/api/brain/mail/read', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ mail_id: mailId }) })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var html = '<div style="margin-bottom:14px;">';
          html += '<div style="font-size:14px;font-weight:700;color:' + TEXT + ';margin-bottom:4px;">' + esc(data.subject || '') + '</div>';
          html += '<div style="font-size:12px;color:' + TEXT2 + ';">De : ' + esc(data.from || '') + '</div>';
          html += '<div style="font-size:11px;color:' + TEXT2 + ';">' + (data.date ? new Date(data.date).toLocaleString('fr-FR') : '') + '</div>';
          if (data.category) html += '<span class="jcp-card-tag jcp-card-tag-cat" style="margin-top:6px;display:inline-block;">' + esc(data.category) + '</span>';
          html += '</div>';
          // Pièces jointes
          if (data.attachments && data.attachments.length > 0) {
            html += '<div style="margin-bottom:12px;padding:8px 10px;background:' + BG3 + ';border-radius:8px;">';
            html += '<div style="font-size:10px;color:' + TEXT2 + ';margin-bottom:4px;font-weight:600;">Pièces jointes :</div>';
            data.attachments.forEach(function(a) {
              html += '<div style="font-size:12px;color:' + TEXT + ';">📎 ' + esc(a.filename || '?') + ' <span style="color:' + TEXT2 + ';">(' + Math.round((a.size||0)/1024) + ' KB)</span></div>';
            });
            html += '</div>';
          }
          // Corps du mail — HTML dans une iframe sandbox (sécurisé) ou texte brut
          if (data.html || (data.body && data.body.trim().startsWith('<'))) {
            var mailHtml = data.html || data.body;
            html += '<iframe id="jcp-mail-iframe" sandbox="allow-same-origin" style="width:100%;min-height:350px;max-height:500px;border:none;border-radius:10px;background:#fff;" onload="try{var d=this.contentDocument;d.open();d.write(atob(this.dataset.content));d.close();this.style.height=Math.min(d.body.scrollHeight+20,500)+\'px\';}catch(e){}"></iframe>';
            // On encode le HTML en base64 pour éviter les injections dans le template
            setTimeout(function() {
              var iframe = document.getElementById('jcp-mail-iframe');
              if (iframe) { iframe.dataset.content = btoa(unescape(encodeURIComponent(mailHtml))); iframe.onload(); }
            }, 100);
          } else {
            html += '<div style="font-size:13px;color:' + TEXT + ';line-height:1.7;white-space:pre-wrap;padding:12px;background:' + BG3 + ';border-radius:10px;max-height:350px;overflow-y:auto;">' + esc(data.body || '(vide)') + '</div>';
          }
          // Actions
          html += '<div class="jcp-card-actions" style="margin-top:12px;">';
          html += '<button class="jcp-card-btn jcp-card-btn-primary" onclick="window.__jcpSend(\'réponds à ' + esc(data.from || '').replace(/'/g, "\\'") + ' que \')">Répondre</button>';
          html += '<button class="jcp-card-btn jcp-card-btn-ghost" onclick="history.back()">Retour</button>';
          html += '</div>';
          openSidePanel('Mail', html);
        })
        .catch(function(e) {
          openSidePanel('Erreur', '<div style="color:#ef4444;padding:20px;">' + esc(e.message) + '</div>');
        });
    };

    function renderDraftCard(data) {
      currentDraft = data;
      var html = '<div class="jcp-draft">';
      html += '<div class="jcp-draft-field"><div class="jcp-draft-label">Destinataire</div><div class="jcp-draft-value">' + esc(data.to || '(à renseigner)') + '</div></div>';
      html += '<div class="jcp-draft-field"><div class="jcp-draft-label">Objet</div><div class="jcp-draft-value">' + esc(data.subject || '') + '</div></div>';
      html += '<div class="jcp-draft-field"><div class="jcp-draft-label">Message</div><div class="jcp-draft-body" contenteditable="true" id="jcp-draft-body">' + esc(data.body || '').replace(/\n/g, '<br>') + '</div></div>';
      html += '<div class="jcp-card-actions" style="margin-top:14px;">';
      if (data.to) html += '<button class="jcp-card-btn jcp-card-btn-primary" onclick="window.__jcpSendDraft()" id="jcp-send-draft-btn">Envoyer</button>';
      html += '<button class="jcp-card-btn jcp-card-btn-ghost" onclick="window.__jcpSend(\'modifie le mail : \')">Modifier via chat</button>';
      html += '</div>';
      if (data.need_email) html += '<div style="color:#f59e0b;font-size:11px;margin-top:10px;">Email du destinataire inconnu. Renseignez-le dans Mon cabinet.</div>';
      html += '</div>';
      openSidePanel('Brouillon', html);
    }

    function renderDocCards(docs, title) {
      var html = '';
      docs.forEach(function (d) {
        html += '<div class="jcp-card">';
        html += '<div class="jcp-card-from">' + esc(d.title || d.from_name || '?') + '</div>';
        if (d.doc_type) html += '<span class="jcp-card-tag jcp-card-tag-cat">' + esc(d.doc_type) + '</span> ';
        if (d.financial_montant) html += '<span class="jcp-card-tag jcp-card-tag-fin">' + d.financial_montant + ' EUR</span>';
        if (d.content_text) html += '<div style="font-size:11px;color:' + TEXT2 + ';margin-top:6px;">' + esc(d.content_text.substring(0, 120)) + '</div>';
        html += '</div>';
      });
      openSidePanel(title, html || '<div style="color:' + TEXT2 + ';text-align:center;padding:20px;">Aucun document</div>');
    }

    // Rendu factures scannées avec checkboxes
    function renderFactures(data) {
      var docs = data.documents || [];
      if (docs.length === 0) {
        openSidePanel('Scan ' + (data.mois || ''), '<div style="text-align:center;padding:30px;color:' + TEXT2 + ';">Aucune facture trouvée pour cette période.</div>');
        return;
      }
      var html = '<div style="font-size:12px;color:' + TEXT2 + ';margin-bottom:12px;">' + docs.length + ' document(s) trouvé(s) — ' + data.claude_calls + ' analyses IA</div>';
      docs.forEach(function(d, i) {
        var a = d.analyse || {};
        html += '<div class="jcp-card" style="padding:12px;">';
        html += '<div style="display:flex;gap:8px;align-items:flex-start;">';
        html += '<input type="checkbox" ' + (d.selectionne ? 'checked' : '') + ' id="jcp-fac-' + i + '" style="margin-top:3px;accent-color:' + ACCENT + ';cursor:pointer;">';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:13px;font-weight:600;color:' + TEXT + ';">' + esc(a.fournisseur_ou_etablissement || d.from) + '</div>';
        html += '<div style="font-size:11px;color:' + TEXT2 + ';">' + esc(d.filename) + '</div>';
        if (a.type_document) html += '<span class="jcp-card-tag jcp-card-tag-cat" style="margin:4px 4px 0 0;">' + esc(a.type_document) + '</span>';
        if (a.total_ttc) html += '<span class="jcp-card-tag jcp-card-tag-fin" style="margin:4px 4px 0 0;">' + a.total_ttc + ' EUR TTC</span>';
        if (a.total_ht) html += '<span style="font-size:10px;color:' + TEXT2 + ';margin-left:4px;">' + a.total_ht + ' EUR HT</span>';
        if (a.date) html += '<div style="font-size:10px;color:' + TEXT2 + ';margin-top:4px;">Date : ' + a.date + '</div>';
        if (a.numero_facture) html += '<div style="font-size:10px;color:' + TEXT2 + ';">Réf : ' + esc(a.numero_facture) + '</div>';
        if (a.produits && a.produits.length > 0) {
          html += '<div style="font-size:10px;color:' + TEXT2 + ';margin-top:4px;">' + a.produits.length + ' ligne(s) : ';
          html += a.produits.slice(0, 3).map(function(p) { return esc(p.designation || '?'); }).join(', ');
          if (a.produits.length > 3) html += '...';
          html += '</div>';
        }
        html += '</div></div></div>';
      });
      html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid ' + BORDER + ';">';
      html += '<button class="jcp-card-btn jcp-card-btn-primary" onclick="window.__jcpValiderFactures()" style="width:100%;justify-content:center;">Importer les documents sélectionnés</button>';
      html += '</div>';
      openSidePanel('Factures — ' + (data.mois || ''), html);
      window.__jcpFacturesData = docs;
    }

    window.__jcpValiderFactures = function() {
      var docs = window.__jcpFacturesData || [];
      var selected = [];
      docs.forEach(function(d, i) {
        var cb = document.getElementById('jcp-fac-' + i);
        if (cb && cb.checked) selected.push(d);
      });
      addMsg(selected.length + ' document(s) validé(s) et importé(s).', false);
      // TODO: sauvegarder en base cabinet_brain_documents
      closeSidePanel();
    };

    // Lancer un scan factures avec barre de progression (polling)
    function launchScanFactures(params) {
      var moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      var moisLabel = (moisNoms[(params.mois||1)-1] || '') + ' ' + (params.annee || '');

      function updateProgress(pct, msg, found) {
        var html = '<div style="padding:30px;">';
        html += '<div style="font-size:14px;font-weight:600;color:' + TEXT + ';margin-bottom:12px;">Scan ' + moisLabel + '</div>';
        html += '<div style="background:' + BG3 + ';border-radius:8px;overflow:hidden;height:8px;margin-bottom:10px;">';
        html += '<div style="height:100%;background:linear-gradient(90deg,' + ACCENT + ',#8b5cf6);width:' + pct + '%;transition:width .3s;border-radius:8px;"></div></div>';
        html += '<div style="font-size:12px;color:' + TEXT2 + ';">' + esc(msg || 'Analyse en cours...') + '</div>';
        if (found > 0) html += '<div style="font-size:13px;color:' + ACCENT + ';margin-top:8px;font-weight:600;">' + found + ' facture(s) trouvée(s)</div>';
        html += '</div>';
        openSidePanel('Scan en cours', html);
      }

      updateProgress(2, 'Lancement du scan...', 0);

      // Barre qui avance doucement pendant l'attente
      var fakePct = 5;
      var progressTimer = setInterval(function() {
        fakePct = Math.min(fakePct + 2, 90);
        updateProgress(fakePct, 'JADOMI IA analyse vos mails de ' + moisLabel + '...', 0);
      }, 3000);

      // Appel POST classique (pas SSE, pas de problème nginx)
      fetch('/api/copilot/scan-factures', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(params)
      })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          clearInterval(progressTimer);
          if (data.documents) {
            addMsg(data.total_factures + ' facture(s) trouvée(s) pour ' + (data.mois || moisLabel) + '. Vérifiez dans le panneau.', false);
            renderFactures(data);
          } else {
            addMsg(data.error || 'Aucune facture trouvée.', false);
            closeSidePanel();
          }
        })
        .catch(function(e) {
          clearInterval(progressTimer);
          addMsg('Erreur : ' + e.message, false);
          closeSidePanel();
        });
    }

    // ================================================================
    // SEND MESSAGE
    // ================================================================
    function send(text) {
      var msg = text || input.value.trim();
      if (!msg || isWaiting) return;
      input.value = '';
      addMsg(esc(msg), true);
      isWaiting = true; sendBtn.disabled = true;
      showTyping();

      fetch('/api/copilot/message', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ message: msg, context: ctx }) })
        .then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(t); }); })
        .then(function (data) {
          hideTyping(); isWaiting = false; sendBtn.disabled = false;

          // Scan factures → lancer le scan et afficher les résultats
          if (data.action === 'scan_factures' && data.scan_params) {
            launchScanFactures(data.scan_params);
          }
          // Si le backend retourne des données structurées → panneau latéral
          else if (data.data && data.action === 'mail_composed') {
            addMsg('Brouillon préparé, Docteur. Vérifiez dans le panneau à droite.', false);
            renderDraftCard(data.data);
          } else if (data.mails && data.mails.length > 0) {
            var pubCount = data.pubs ? data.pubs.length : 0;
            addMsg(data.mails.length + ' mail(s) important(s)' + (pubCount > 0 ? ' + ' + pubCount + ' pub(s)/newsletter(s)' : '') + '. Détails dans le panneau.', false);
            renderMailCards(data.mails, 'Mails importants', data.pubs);
          } else if (data.documents && data.documents.length > 0) {
            addMsg(data.documents.length + ' document(s). Détails dans le panneau.', false);
            renderDocCards(data.documents, 'Documents');
          } else {
            // Réponse texte classique
            var reply = (data.reply || '').replace(/\n/g, '<br>');
            addMsg(reply, false);

            // Si la réponse contient des mails en texte, essayer de les afficher en cards aussi
            // (le backend retourne reply en texte mais on peut parser les mails inline)
          }
        })
        .catch(function (e) {
          hideTyping(); isWaiting = false; sendBtn.disabled = false;
          addMsg('Erreur : ' + esc(e.message).substring(0, 80), false);
        });
    }

    window.__jcpSend = send;
    sendBtn.onclick = function () { send(); };
    input.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

    // Envoyer le brouillon
    window.__jcpSendDraft = function () {
      if (!currentDraft || !currentDraft.to) { addMsg('Pas de destinataire.', false); return; }
      var bodyEl = document.getElementById('jcp-draft-body');
      var body = bodyEl ? bodyEl.innerText : currentDraft.body;
      var btn = document.getElementById('jcp-send-draft-btn');
      if (btn) { btn.textContent = 'Envoi...'; btn.disabled = true; }

      fetch('/api/brain/mail/send', { method: 'POST', headers: getHeaders(), body: JSON.stringify({
        account_id: window.__jcpAccountId || '',
        to: currentDraft.to, subject: currentDraft.subject, body: body
      })})
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) {
            addMsg('Mail envoyé avec succès à ' + esc(currentDraft.to) + '.', false);
            closeSidePanel();
          } else { addMsg('Erreur d\'envoi : ' + (d.error || 'inconnu'), false); }
          if (btn) { btn.textContent = 'Envoyer'; btn.disabled = false; }
        })
        .catch(function (e) {
          addMsg('Erreur : ' + e.message, false);
          if (btn) { btn.textContent = 'Envoyer'; btn.disabled = false; }
        });
    };

    // ================================================================
    // VOICE
    // ================================================================
    var recognition = null, voiceActive = false;
    micBtn.onclick = function () {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { addMsg('Micro non supporté. Utilisez Chrome.', false); return; }
      if (voiceActive) { stopV(); return; }
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SR(); recognition.lang = 'fr-FR'; recognition.continuous = true; recognition.interimResults = true;
      voiceActive = true; micBtn.classList.add('active'); micBtn.innerHTML = IC.stop;
      var fin = input.value ? input.value + ' ' : '';
      recognition.onresult = function (e) { var int = ''; for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' '; else int += e.results[i][0].transcript; } input.value = fin + int; };
      recognition.onerror = function (e) { if (e.error !== 'no-speech') stopV(); };
      recognition.onend = function () { if (voiceActive) try { recognition.start(); } catch (_) {} };
      recognition.start();
    };
    function stopV() { voiceActive = false; if (recognition) try { recognition.stop(); } catch (_) {} recognition = null; micBtn.classList.remove('active'); micBtn.innerHTML = IC.mic; }

    // ================================================================
    // NOTIFICATIONS
    // ================================================================
    function checkNotif() {
      fetch('/api/copilot/notifications', { headers: getHeaders() })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          var b = document.getElementById('jcp-badge');
          if (b) b.textContent = d.count > 0 ? d.count : '';
        }).catch(function () {});
    }
    // Aussi récupérer l'account_id pour l'envoi de mails
    fetch('/api/brain/mail/status', { headers: getHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.accounts && d.accounts.length) window.__jcpAccountId = d.accounts[0].id; })
      .catch(function () {});

    // Badge cliquable → ouvre le copilot et montre les notifications
    fab.addEventListener('dblclick', function(e) {
      e.preventDefault();
      if (!isOpen) toggle();
      send('quels mails attendent une réponse');
    });

    setTimeout(checkNotif, 5000);
    setInterval(checkNotif, 60000);
  }

  // Auto-init
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
