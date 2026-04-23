/**
 * JADOMI Chatbot Widget
 * Self-contained JS file — injects its own CSS and DOM.
 * Include on any public site and call:
 *   window.JadomiChatbot.init('your-site-id');
 *
 * Config is loaded from /api/vitrines/public/chatbot/config/{siteId}
 * Messages are sent to /api/vitrines/public/chatbot/message
 */
(function () {
  'use strict';

  // Prevent double-init
  if (window.__jadomiChatbotLoaded) return;
  window.__jadomiChatbotLoaded = true;

  // ================================================================
  // CONSTANTS
  // ================================================================
  var ACCENT        = '#c9a961';
  var BG_DARK       = '#1a1a1a';
  var BG_PANEL      = '#1e1e1e';
  var BG_INPUT      = '#2a2a2a';
  var TEXT_PRIMARY   = '#f0f0f0';
  var TEXT_SECONDARY = 'rgba(255,255,255,.55)';
  var BORDER_GLASS   = 'rgba(255,255,255,.08)';
  var ESCALATION_AFTER = 5; // suggest escalation after N user messages
  var EASE = 'cubic-bezier(.16,1,.3,1)';

  // ================================================================
  // CSS INJECTION
  // ================================================================
  var CSS = [
    '/* JADOMI Chatbot Widget */',
    '.jcb-fab{',
    '  position:fixed;bottom:24px;right:24px;z-index:99990;',
    '  width:60px;height:60px;border-radius:50%;border:none;',
    '  background:' + ACCENT + ';color:#fff;cursor:pointer;',
    '  display:flex;align-items:center;justify-content:center;',
    '  box-shadow:0 8px 30px rgba(201,169,97,.35);',
    '  transition:all .4s ' + EASE + ';',
    '}',
    '.jcb-fab:hover{transform:scale(1.08);box-shadow:0 12px 40px rgba(201,169,97,.45)}',
    '.jcb-fab svg{width:28px;height:28px;fill:currentColor;transition:transform .3s ' + EASE + '}',
    '.jcb-fab.open svg{transform:rotate(90deg)}',

    // Pulse animation
    '.jcb-fab::before{',
    '  content:"";position:absolute;inset:-4px;border-radius:50%;',
    '  border:2px solid ' + ACCENT + ';opacity:0;',
    '  animation:jcbPulse 2.5s ' + EASE + ' infinite;',
    '}',
    '@keyframes jcbPulse{',
    '  0%{transform:scale(1);opacity:.6}',
    '  100%{transform:scale(1.5);opacity:0}',
    '}',
    '.jcb-fab.open::before{animation:none;opacity:0}',

    // Panel
    '.jcb-panel{',
    '  position:fixed;bottom:100px;right:24px;z-index:99991;',
    '  width:380px;max-height:560px;',
    '  background:' + BG_PANEL + ';',
    '  border:1px solid ' + BORDER_GLASS + ';',
    '  border-radius:16px;overflow:hidden;',
    '  display:flex;flex-direction:column;',
    '  box-shadow:0 25px 60px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04);',
    '  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
    '  opacity:0;transform:translateY(20px) scale(.96);pointer-events:none;',
    '  transition:opacity .35s ' + EASE + ',transform .35s ' + EASE + ';',
    '}',
    '.jcb-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}',

    // Header
    '.jcb-header{',
    '  padding:16px 18px;display:flex;align-items:center;gap:12px;',
    '  background:' + BG_DARK + ';border-bottom:1px solid ' + BORDER_GLASS + ';',
    '  flex-shrink:0;',
    '}',
    '.jcb-header-icon{',
    '  width:38px;height:38px;border-radius:10px;',
    '  background:' + ACCENT + ';display:flex;align-items:center;justify-content:center;',
    '  flex-shrink:0;',
    '}',
    '.jcb-header-icon svg{width:20px;height:20px;fill:#fff}',
    '.jcb-header-info{flex:1;min-width:0}',
    '.jcb-header-name{',
    '  font-size:14px;font-weight:600;color:' + TEXT_PRIMARY + ';',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
    '}',
    '.jcb-header-status{',
    '  font-size:11px;color:' + TEXT_SECONDARY + ';display:flex;align-items:center;gap:5px;',
    '}',
    '.jcb-status-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0}',
    '.jcb-close{',
    '  background:none;border:none;color:' + TEXT_SECONDARY + ';cursor:pointer;',
    '  padding:6px;display:flex;align-items:center;justify-content:center;',
    '  transition:color .2s;',
    '}',
    '.jcb-close:hover{color:' + TEXT_PRIMARY + '}',
    '.jcb-close svg{width:18px;height:18px;fill:currentColor}',

    // Messages area
    '.jcb-messages{',
    '  flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px;',
    '  min-height:200px;max-height:350px;',
    '  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent;',
    '}',
    '.jcb-messages::-webkit-scrollbar{width:4px}',
    '.jcb-messages::-webkit-scrollbar-track{background:transparent}',
    '.jcb-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}',

    // Message bubbles
    '.jcb-msg{max-width:85%;padding:12px 16px;font-size:14px;line-height:1.55;border-radius:14px;word-break:break-word}',
    '.jcb-msg.bot{',
    '  align-self:flex-start;background:' + BG_INPUT + ';color:' + TEXT_PRIMARY + ';',
    '  border-bottom-left-radius:4px;',
    '}',
    '.jcb-msg.user{',
    '  align-self:flex-end;background:' + ACCENT + ';color:#1a1a1a;',
    '  border-bottom-right-radius:4px;',
    '}',

    // Typing indicator
    '.jcb-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 18px}',
    '.jcb-typing span{',
    '  width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.3);',
    '  animation:jcbTyping 1.2s ease-in-out infinite;',
    '}',
    '.jcb-typing span:nth-child(2){animation-delay:.15s}',
    '.jcb-typing span:nth-child(3){animation-delay:.3s}',
    '@keyframes jcbTyping{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}',

    // Escalation suggestion
    '.jcb-escalation{',
    '  align-self:flex-start;max-width:90%;padding:14px 16px;',
    '  background:rgba(201,169,97,.1);border:1px solid rgba(201,169,97,.25);',
    '  border-radius:12px;font-size:13px;color:' + TEXT_PRIMARY + ';line-height:1.5;',
    '}',
    '.jcb-escalation a{',
    '  color:' + ACCENT + ';font-weight:600;text-decoration:underline;',
    '  text-underline-offset:2px;',
    '}',

    // Input area
    '.jcb-input-area{',
    '  padding:12px 14px;display:flex;align-items:center;gap:10px;',
    '  border-top:1px solid ' + BORDER_GLASS + ';background:' + BG_DARK + ';',
    '  flex-shrink:0;',
    '}',
    '.jcb-input{',
    '  flex:1;background:' + BG_INPUT + ';border:1px solid rgba(255,255,255,.06);',
    '  border-radius:10px;padding:10px 14px;color:' + TEXT_PRIMARY + ';',
    '  font-size:14px;font-family:inherit;outline:none;resize:none;',
    '  transition:border-color .3s;',
    '}',
    '.jcb-input::placeholder{color:' + TEXT_SECONDARY + '}',
    '.jcb-input:focus{border-color:' + ACCENT + '}',
    '.jcb-send{',
    '  width:38px;height:38px;border-radius:10px;border:none;',
    '  background:' + ACCENT + ';color:#1a1a1a;cursor:pointer;',
    '  display:flex;align-items:center;justify-content:center;',
    '  transition:all .3s ' + EASE + ';flex-shrink:0;',
    '}',
    '.jcb-send:hover{transform:scale(1.08)}',
    '.jcb-send:disabled{opacity:.4;cursor:default;transform:none}',
    '.jcb-send svg{width:18px;height:18px;fill:currentColor}',

    // Mobile responsive
    '@media(max-width:480px){',
    '  .jcb-panel{',
    '    right:0;bottom:0;left:0;width:100%;max-height:100%;',
    '    border-radius:16px 16px 0 0;max-height:85vh;',
    '  }',
    '  .jcb-fab{bottom:16px;right:16px;width:54px;height:54px}',
    '  .jcb-fab svg{width:24px;height:24px}',
    '  .jcb-messages{max-height:calc(85vh - 140px)}',
    '}'
  ].join('\n');

  function injectCSS() {
    var style   = document.createElement('style');
    style.id    = 'jadomi-chatbot-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ================================================================
  // SVG ICONS
  // ================================================================
  var ICON_CHAT = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
  var ICON_CABINET = '<svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>';

  // ================================================================
  // DOM CONSTRUCTION
  // ================================================================
  function buildDOM() {
    // FAB
    var fab = document.createElement('button');
    fab.className     = 'jcb-fab';
    fab.innerHTML     = ICON_CHAT;
    fab.setAttribute('aria-label', 'Ouvrir le chat');
    fab.id = 'jcb-fab';

    // Panel
    var panel = document.createElement('div');
    panel.className = 'jcb-panel';
    panel.id = 'jcb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat en ligne');

    panel.innerHTML = [
      '<div class="jcb-header">',
      '  <div class="jcb-header-icon">' + ICON_CABINET + '</div>',
      '  <div class="jcb-header-info">',
      '    <div class="jcb-header-name" id="jcb-header-name">Cabinet</div>',
      '    <div class="jcb-header-status"><span class="jcb-status-dot"></span>En ligne</div>',
      '  </div>',
      '  <button class="jcb-close" id="jcb-close" aria-label="Fermer le chat">' + ICON_CLOSE + '</button>',
      '</div>',
      '<div class="jcb-messages" id="jcb-messages"></div>',
      '<div class="jcb-input-area">',
      '  <input class="jcb-input" id="jcb-input" type="text" placeholder="Ecrivez votre message..." autocomplete="off">',
      '  <button class="jcb-send" id="jcb-send" aria-label="Envoyer">' + ICON_SEND + '</button>',
      '</div>'
    ].join('\n');

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    return { fab: fab, panel: panel };
  }

  // ================================================================
  // WIDGET LOGIC
  // ================================================================
  function createWidget(siteId) {
    injectCSS();
    var dom = buildDOM();
    var fab         = dom.fab;
    var panel       = dom.panel;
    var messagesEl  = document.getElementById('jcb-messages');
    var inputEl     = document.getElementById('jcb-input');
    var sendBtn     = document.getElementById('jcb-send');
    var closeBtn    = document.getElementById('jcb-close');
    var headerName  = document.getElementById('jcb-header-name');
    var isOpen      = false;
    var userMsgCount = 0;
    var escalationShown = false;
    var isWaiting   = false;

    // Session
    var sessionKey = 'jadomi_chatbot_session_' + siteId;
    var sessionId  = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = 'jcb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(sessionKey, sessionId);
    }

    // Config
    var config = {
      greeting: 'Bonjour, comment puis-je vous aider ?',
      cabinetName: 'Cabinet',
      escalationText: 'Souhaitez-vous etre mis en relation avec un membre de notre équipe ?',
      contactUrl: '#contact'
    };

    function loadConfig() {
      fetch('/api/vitrines/public/chatbot/config/' + encodeURIComponent(siteId))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success !== false) {
            if (data.greeting)       config.greeting      = data.greeting;
            if (data.cabinet_name)   config.cabinetName   = data.cabinet_name;
            if (data.escalation_text) config.escalationText = data.escalation_text;
            if (data.contact_url)    config.contactUrl     = data.contact_url;
          }
          headerName.textContent = config.cabinetName;
          addBotMessage(config.greeting);
        })
        .catch(function () {
          headerName.textContent = config.cabinetName;
          addBotMessage(config.greeting);
        });
    }

    // Toggle
    function toggle() {
      isOpen = !isOpen;
      fab.classList.toggle('open', isOpen);
      panel.classList.toggle('open', isOpen);
      fab.innerHTML = isOpen ? ICON_CLOSE : ICON_CHAT;
      fab.setAttribute('aria-label', isOpen ? 'Fermer le chat' : 'Ouvrir le chat');
      if (isOpen) {
        setTimeout(function () { inputEl.focus(); }, 350);
      }
    }

    fab.addEventListener('click', toggle);
    closeBtn.addEventListener('click', toggle);

    // Messages
    function addMessage(text, cls) {
      var div = document.createElement('div');
      div.className = 'jcb-msg ' + cls;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function addBotMessage(text) {
      return addMessage(text, 'bot');
    }

    function addUserMessage(text) {
      return addMessage(text, 'user');
    }

    function showTyping() {
      var div = document.createElement('div');
      div.className = 'jcb-typing';
      div.id = 'jcb-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      var el = document.getElementById('jcb-typing');
      if (el) el.remove();
    }

    function showEscalation() {
      if (escalationShown) return;
      escalationShown = true;
      var div = document.createElement('div');
      div.className = 'jcb-escalation';
      div.innerHTML = config.escalationText +
        '<br><a href="' + config.contactUrl + '" target="_self">Contacter un conseiller</a>';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Send
    function send() {
      var text = inputEl.value.trim();
      if (!text || isWaiting) return;

      addUserMessage(text);
      inputEl.value = '';
      userMsgCount++;
      isWaiting = true;
      sendBtn.disabled = true;

      showTyping();

      var payload = {
        site_id:    siteId,
        session_id: sessionId,
        message:    text
      };

      fetch('/api/vitrines/public/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          hideTyping();
          isWaiting = false;
          sendBtn.disabled = false;

          var reply = (data && data.reply) ? data.reply : 'Merci pour votre message. Un membre de notre équipe reviendra vers vous.';
          addBotMessage(reply);

          if (userMsgCount >= ESCALATION_AFTER) {
            showEscalation();
          }
        })
        .catch(function () {
          hideTyping();
          isWaiting = false;
          sendBtn.disabled = false;
          addBotMessage('Nous rencontrons un problème technique. Veuillez reessayer ou nous contacter directement.');
        });
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    // Init
    loadConfig();
  }

  // ================================================================
  // PUBLIC API
  // ================================================================
  window.JadomiChatbot = {
    init: function (siteId) {
      if (!siteId) {
        console.error('[JadomiChatbot] siteId is required. Usage: JadomiChatbot.init("your-site-id")');
        return;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { createWidget(siteId); });
      } else {
        createWidget(siteId);
      }
    }
  };

})();
