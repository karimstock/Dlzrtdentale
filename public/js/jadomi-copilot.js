/**
 * JADOMI COPILOT — Widget global flottant
 * S'injecte sur TOUTES les pages. FAB bottom-right.
 * Chat conversationnel + vocal + notifications.
 * Auto-init : inclure le script, c'est tout.
 */
(function () {
  'use strict';
  if (window.__jadomiCopilotLoaded) return;
  window.__jadomiCopilotLoaded = true;

  // ================================================================
  // THEME
  // ================================================================
  var ACCENT = '#6366f1';
  var GOLD = '#c9a961';
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
  var style = document.createElement('style');
  style.id = 'jadomi-copilot-css';
  style.textContent = `
/* JADOMI Copilot Widget */
.jcp-fab{position:fixed;bottom:24px;right:24px;z-index:99990;width:56px;height:56px;border-radius:16px;border:none;background:linear-gradient(135deg,${ACCENT},#8b5cf6);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 30px rgba(99,102,241,.35);transition:all .4s ${EASE};}
.jcp-fab:hover{transform:scale(1.06);box-shadow:0 12px 40px rgba(99,102,241,.45)}
.jcp-fab svg{width:24px;height:24px;fill:currentColor;transition:transform .3s ${EASE}}
.jcp-fab.open svg{transform:rotate(90deg)}
.jcp-fab.open{border-radius:50%;background:${BG3};box-shadow:0 4px 20px rgba(0,0,0,.3)}
.jcp-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid ${BG};animation:jcpBounce 1s ${EASE} infinite;}
@keyframes jcpBounce{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.jcp-badge:empty,.jcp-badge[data-count="0"]{display:none}
.jcp-panel{position:fixed;bottom:92px;right:24px;z-index:99991;width:400px;max-height:600px;background:${BG};border:1px solid ${BORDER};border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.04);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);opacity:0;transform:translateY(20px) scale(.96);pointer-events:none;transition:opacity .35s ${EASE},transform .35s ${EASE};}
.jcp-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.jcp-header{padding:14px 18px;display:flex;align-items:center;gap:12px;background:${BG2};border-bottom:1px solid ${BORDER};flex-shrink:0;}
.jcp-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,${ACCENT},#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800;font-size:14px;color:#fff;}
.jcp-title{flex:1;min-width:0;}
.jcp-title-name{font-size:14px;font-weight:700;color:${TEXT};}
.jcp-title-status{font-size:11px;color:${TEXT2};display:flex;align-items:center;gap:5px;}
.jcp-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0;}
.jcp-close{background:none;border:none;color:${TEXT2};cursor:pointer;padding:6px;display:flex;transition:color .2s;}
.jcp-close:hover{color:${TEXT}}
.jcp-close svg{width:16px;height:16px;fill:currentColor}
.jcp-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:200px;max-height:400px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent;}
.jcp-messages::-webkit-scrollbar{width:4px}
.jcp-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
.jcp-msg{max-width:88%;display:flex;gap:8px;animation:jcpFade .3s ease;}
.jcp-msg-bot{align-self:flex-start;}
.jcp-msg-user{align-self:flex-end;flex-direction:row-reverse;}
.jcp-avatar{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;}
.jcp-msg-bot .jcp-avatar{background:linear-gradient(135deg,${ACCENT},#8b5cf6);color:#fff;}
.jcp-msg-user .jcp-avatar{background:${BG3};color:${TEXT};}
.jcp-bubble{padding:10px 14px;font-size:13px;line-height:1.6;border-radius:14px;word-break:break-word;color:${TEXT};}
.jcp-msg-bot .jcp-bubble{background:${BG2};border:1px solid ${BORDER};border-bottom-left-radius:4px;}
.jcp-msg-user .jcp-bubble{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.2);border-bottom-right-radius:4px;}
.jcp-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.jcp-sug{padding:5px 12px;border:1px solid ${BORDER};border-radius:20px;font-size:11px;color:${TEXT2};background:transparent;cursor:pointer;transition:all .15s;}
.jcp-sug:hover{border-color:${ACCENT};color:${ACCENT};background:rgba(99,102,241,.08);}
.jcp-typing{align-self:flex-start;display:flex;gap:4px;padding:10px 16px;}
.jcp-typing span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);animation:jcpDot 1.2s ease-in-out infinite;}
.jcp-typing span:nth-child(2){animation-delay:.15s}
.jcp-typing span:nth-child(3){animation-delay:.3s}
@keyframes jcpDot{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
@keyframes jcpFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.jcp-input-area{padding:10px 14px;display:flex;align-items:center;gap:8px;border-top:1px solid ${BORDER};background:${BG2};flex-shrink:0;}
.jcp-mic{width:36px;height:36px;border-radius:10px;border:1px solid ${BORDER};background:transparent;color:${TEXT2};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;}
.jcp-mic:hover{border-color:${ACCENT};color:${ACCENT}}
.jcp-mic.active{background:#ef4444;border-color:#ef4444;color:#fff;animation:jcpPulse 1.5s infinite;}
@keyframes jcpPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
.jcp-mic svg{width:16px;height:16px;fill:currentColor}
.jcp-input{flex:1;background:${BG3};border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:9px 14px;color:${TEXT};font-size:13px;font-family:inherit;outline:none;resize:none;transition:border-color .3s;}
.jcp-input::placeholder{color:${TEXT2}}
.jcp-input:focus{border-color:${ACCENT}}
.jcp-send{width:36px;height:36px;border-radius:10px;border:none;background:${ACCENT};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s ${EASE};flex-shrink:0;}
.jcp-send:hover{transform:scale(1.06)}
.jcp-send:disabled{opacity:.4;cursor:default;transform:none}
.jcp-send svg{width:16px;height:16px;fill:currentColor}
.jcp-action{display:inline-block;padding:4px 10px;border:1px solid ${ACCENT};border-radius:8px;font-size:11px;color:${ACCENT};background:transparent;cursor:pointer;margin:4px 4px 0 0;transition:all .15s;}
.jcp-action:hover{background:${ACCENT};color:#fff;}
@media(max-width:480px){.jcp-panel{right:0;bottom:0;left:0;width:100%;max-height:90vh;border-radius:20px 20px 0 0;}.jcp-fab{bottom:16px;right:16px;width:50px;height:50px}.jcp-messages{max-height:calc(90vh - 140px)}}
`;
  document.head.appendChild(style);

  // ================================================================
  // ICONS
  // ================================================================
  var ICON_CHAT = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5-1.34C8.47 21.51 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.12-.46-4.39-1.25l-.31-.19-3.23.87.87-3.23-.19-.31A7.94 7.94 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  // ================================================================
  // AUTH (même pattern que organisation.html)
  // ================================================================
  function getHeaders() {
    var tk = null;
    // window._jToken (set by organisation.html)
    if (window._jToken) tk = window._jToken;
    // Supabase localStorage
    if (!tk) { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > 0) { try { var v = JSON.parse(localStorage.getItem(k)); tk = v.access_token; } catch (_) {} break; } } }
    // jadomi_session
    if (!tk) { try { tk = JSON.parse(localStorage.getItem('jadomi_session') || '{}').access_token; } catch (_) {} }

    var sid = window._jSocieteId || localStorage.getItem('jadomi_societe_active') || null;

    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (tk || ''), 'X-Societe-Id': sid || '' };
  }

  // ================================================================
  // CONTEXT DETECTION
  // ================================================================
  function detectContext() {
    var path = window.location.pathname;
    if (path.includes('dentiste-pro')) return 'agenda';
    if (path.includes('organisation')) return 'organisation';
    if (path.includes('/ide')) return 'tournees';
    if (path.includes('/labo')) return 'labo';
    if (path.includes('/medecin')) return 'medecin';
    if (path.includes('/kine')) return 'kine';
    if (path.includes('/comparateur')) return 'comparateur';
    if (path === '/' || path.includes('index')) return 'stock';
    return 'general';
  }

  // ================================================================
  // BUILD DOM
  // ================================================================
  function buildDOM() {
    var fab = document.createElement('button');
    fab.className = 'jcp-fab';
    fab.innerHTML = ICON_CHAT + '<span class="jcp-badge" id="jcp-badge" data-count="0"></span>';
    fab.id = 'jcp-fab';

    var panel = document.createElement('div');
    panel.className = 'jcp-panel';
    panel.id = 'jcp-panel';
    panel.innerHTML = [
      '<div class="jcp-header">',
      '  <div class="jcp-logo">J</div>',
      '  <div class="jcp-title">',
      '    <div class="jcp-title-name">JADOMI Copilot</div>',
      '    <div class="jcp-title-status"><span class="jcp-dot"></span>En ligne</div>',
      '  </div>',
      '  <button class="jcp-close" id="jcp-close">' + ICON_CLOSE + '</button>',
      '</div>',
      '<div class="jcp-messages" id="jcp-messages"></div>',
      '<div class="jcp-input-area">',
      '  <button class="jcp-mic" id="jcp-mic" title="Dicter">' + ICON_MIC + '</button>',
      '  <input class="jcp-input" id="jcp-input" type="text" placeholder="Demandez quelque chose..." autocomplete="off">',
      '  <button class="jcp-send" id="jcp-send">' + ICON_SEND + '</button>',
      '</div>'
    ].join('');

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    return { fab: fab, panel: panel };
  }

  // ================================================================
  // WIDGET
  // ================================================================
  function init() {
    var dom = buildDOM();
    var fab = dom.fab;
    var panel = dom.panel;
    var messages = document.getElementById('jcp-messages');
    var input = document.getElementById('jcp-input');
    var sendBtn = document.getElementById('jcp-send');
    var closeBtn = document.getElementById('jcp-close');
    var micBtn = document.getElementById('jcp-mic');
    var badge = document.getElementById('jcp-badge');
    var isOpen = false;
    var isWaiting = false;

    // Toggle
    function toggle() {
      isOpen = !isOpen;
      fab.classList.toggle('open', isOpen);
      panel.classList.toggle('open', isOpen);
      fab.innerHTML = (isOpen ? ICON_CLOSE : ICON_CHAT) + '<span class="jcp-badge" id="jcp-badge" data-count="' + (badge ? badge.dataset.count : '0') + '">' + (badge ? badge.textContent : '') + '</span>';
      badge = document.getElementById('jcp-badge');
      if (isOpen) setTimeout(function () { input.focus(); }, 350);
    }
    fab.addEventListener('click', toggle);
    closeBtn.addEventListener('click', toggle);

    // Messages
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function addMsg(html, isUser) {
      var div = document.createElement('div');
      div.className = 'jcp-msg ' + (isUser ? 'jcp-msg-user' : 'jcp-msg-bot');
      div.innerHTML = '<div class="jcp-avatar">' + (isUser ? 'V' : 'J') + '</div><div class="jcp-bubble">' + html + '</div>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    function showTyping() {
      var d = document.createElement('div');
      d.className = 'jcp-typing'; d.id = 'jcp-typing';
      d.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(d);
      messages.scrollTop = messages.scrollHeight;
    }
    function hideTyping() { var e = document.getElementById('jcp-typing'); if (e) e.remove(); }

    // Welcome
    var ctx = detectContext();
    var welcome = 'Bonjour Docteur, comment puis-je vous aider ?';
    var suggestions = [
      'Mails importants',
      'Résumé du jour',
      'Envoie un mail au comptable'
    ];
    if (ctx === 'stock') suggestions.push('Alertes stock');
    if (ctx === 'agenda') suggestions.push('Planning du jour');

    var sugHtml = '<div class="jcp-suggestions">' +
      suggestions.map(function (s) { return '<button class="jcp-sug" onclick="window.__jcpSend(\'' + s.replace(/'/g, "\\'") + '\')">' + s + '</button>'; }).join('') +
      '</div>';
    addMsg(welcome + '<br>' + sugHtml, false);

    // Send
    function send(text) {
      var msg = text || input.value.trim();
      if (!msg || isWaiting) return;
      input.value = '';
      addMsg(esc(msg), true);
      isWaiting = true;
      sendBtn.disabled = true;
      showTyping();

      fetch('/api/copilot/message', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ message: msg, context: ctx })
      })
        .then(function (r) {
          var ct = r.headers.get('content-type') || '';
          if (!ct.includes('json')) throw new Error('Session expirée');
          return r.json();
        })
        .then(function (data) {
          hideTyping();
          isWaiting = false;
          sendBtn.disabled = false;
          var reply = (data && data.reply) || 'Je n\'ai pas compris. Pouvez-vous reformuler ?';
          // Convertir les \n en <br> pour l'affichage
          addMsg(reply.replace(/\n/g, '<br>'), false);
        })
        .catch(function (e) {
          hideTyping();
          isWaiting = false;
          sendBtn.disabled = false;
          addMsg('Erreur : ' + esc(e.message), false);
        });
    }

    window.__jcpSend = send;
    sendBtn.addEventListener('click', function () { send(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

    // ================================================================
    // VOICE (Web Speech API — gratuit)
    // ================================================================
    var recognition = null;
    var voiceActive = false;

    micBtn.addEventListener('click', function () {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        addMsg('Votre navigateur ne supporte pas le micro. Utilisez Chrome.', false);
        return;
      }
      if (voiceActive) { stopVoice(); return; }

      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SR();
      recognition.lang = 'fr-FR';
      recognition.continuous = true;
      recognition.interimResults = true;
      voiceActive = true;
      micBtn.classList.add('active');
      micBtn.innerHTML = ICON_STOP;

      var final = input.value ? input.value + ' ' : '';
      recognition.onresult = function (e) {
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
          else interim += e.results[i][0].transcript;
        }
        input.value = final + interim;
      };
      recognition.onerror = function (e) { if (e.error !== 'no-speech') stopVoice(); };
      recognition.onend = function () { if (voiceActive) try { recognition.start(); } catch (_) {} };
      recognition.start();
    });

    function stopVoice() {
      voiceActive = false;
      if (recognition) try { recognition.stop(); } catch (_) {}
      recognition = null;
      micBtn.classList.remove('active');
      micBtn.innerHTML = ICON_MIC;
    }

    // ================================================================
    // NOTIFICATIONS (polling toutes les 60s)
    // ================================================================
    function checkNotifications() {
      fetch('/api/copilot/notifications', { headers: getHeaders() })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          badge = document.getElementById('jcp-badge');
          if (badge) {
            badge.dataset.count = data.count || 0;
            badge.textContent = data.count > 0 ? data.count : '';
          }
        })
        .catch(function () {});
    }

    // Premier check après 5s, puis toutes les 60s
    setTimeout(checkNotifications, 5000);
    setInterval(checkNotifications, 60000);
  }

  // ================================================================
  // AUTO-INIT
  // ================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
