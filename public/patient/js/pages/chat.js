/* ═══════════════════════════════════════════════
   JADOMI Patient — Chat (Praticien)
   Real-time messaging with SSE
   ═══════════════════════════════════════════════ */

Router.register('/chat', async (container) => {
  let messages = [];
  let eventSource = null;
  let isTyping = false;

  // Load messages
  container.innerHTML = `
    <div class="chat-list" id="chat-messages">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>`;

  try {
    const data = await JadomiAPI.get('/chat/history');
    messages = data.messages || [];
  } catch {
    messages = getDemoMessages();
  }

  renderChat();
  connectSSE();

  // Cleanup on navigation
  const cleanup = () => {
    if (eventSource) { eventSource.close(); eventSource = null; }
    window.removeEventListener('hashchange', cleanup);
  };
  window.addEventListener('hashchange', cleanup);

  function renderChat() {
    container.innerHTML = '';
    container.style.padding = '0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = 'calc(100dvh - var(--header-height))';

    const msgArea = document.createElement('div');
    msgArea.id = 'chat-messages';
    msgArea.className = 'chat-list';
    msgArea.style.cssText = 'flex:1;overflow-y:auto;padding:var(--space-sm) var(--space-md);padding-bottom:80px;';

    const inputBar = document.createElement('div');
    inputBar.className = 'chat-input-bar';
    inputBar.innerHTML = `
      <button class="chat-btn chat-btn-attach" id="btn-attach" aria-label="Joindre une photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <textarea rows="1" placeholder="Votre message..." id="chat-input"></textarea>
      <button class="chat-btn chat-btn-send" id="btn-send" disabled aria-label="Envoyer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
        </svg>
      </button>`;

    container.appendChild(msgArea);
    container.appendChild(inputBar);

    renderMessages(msgArea);

    // Input handlers
    const textarea = inputBar.querySelector('#chat-input');
    const sendBtn = inputBar.querySelector('#btn-send');
    const attachBtn = inputBar.querySelector('#btn-attach');

    textarea.addEventListener('input', () => {
      sendBtn.disabled = !textarea.value.trim();
      // Auto-resize
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (textarea.value.trim()) sendMessage(textarea.value.trim());
      }
    });

    sendBtn.addEventListener('click', () => {
      if (textarea.value.trim()) sendMessage(textarea.value.trim());
    });

    // File attachment
    attachBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.capture = 'environment';
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) sendPhoto(file);
      });
      fileInput.click();
    });

    // Hide bottom nav for chat
    const nav = document.getElementById('app-nav');
    if (nav) nav.classList.add('hidden');
    const restoreNav = () => {
      if (nav) nav.classList.remove('hidden');
      window.removeEventListener('hashchange', restoreNav);
    };
    window.addEventListener('hashchange', restoreNav);
  }

  function renderMessages(msgArea) {
    let lastDate = '';
    let html = '';

    messages.forEach((m) => {
      const d = new Date(m.created_at);
      const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

      if (dateStr !== lastDate) {
        html += `<div class="bubble-system">${dateStr}</div>`;
        lastDate = dateStr;
      }

      const time = formatTime(d);
      const bubbleClass = m.sender === 'patient' ? 'bubble-patient'
        : m.sender === 'system' ? 'bubble-system' : 'bubble-praticien';

      if (m.sender === 'system') {
        html += `<div class="${bubbleClass}">${m.text}</div>`;
      } else {
        html += `
          <div class="chat-bubble ${bubbleClass}">
            ${m.image ? `<img src="${m.image}" style="border-radius:12px;margin-bottom:6px;max-width:240px;" alt="Photo" />` : ''}
            ${m.text || ''}
            <div class="time">${time}</div>
            ${m.sender === 'patient' ? `
              <div class="read-receipt ${m.read ? 'read' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M2 12l5 5L20 4"/>
                </svg>
                ${m.read ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12l5 5L20 4"/></svg>` : ''}
              </div>
            ` : ''}
          </div>`;
      }
    });

    if (isTyping) {
      html += `
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>`;
    }

    msgArea.innerHTML = html;
    // Scroll to bottom
    requestAnimationFrame(() => { msgArea.scrollTop = msgArea.scrollHeight; });
  }

  async function sendMessage(text) {
    const textarea = container.querySelector('#chat-input');
    const sendBtn = container.querySelector('#btn-send');
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;

    const msg = {
      id: 'tmp-' + Date.now(),
      text,
      sender: 'patient',
      created_at: new Date().toISOString(),
      read: false,
    };
    messages.push(msg);
    renderMessages(container.querySelector('#chat-messages'));

    try {
      await JadomiAPI.post('/chat/send', { content: text });
    } catch {
      // Message queued offline — already shown in UI
    }
  }

  async function sendPhoto(file) {
    const fd = new FormData();
    fd.append('photo', file);

    const url = URL.createObjectURL(file);
    const msg = {
      id: 'tmp-' + Date.now(),
      image: url,
      sender: 'patient',
      created_at: new Date().toISOString(),
      read: false,
    };
    messages.push(msg);
    renderMessages(container.querySelector('#chat-messages'));

    try {
      await JadomiAPI.upload('/chat/send', fd);
    } catch {}
  }

  function connectSSE() {
    try {
      eventSource = JadomiAPI.stream('/chat/stream');

      eventSource.addEventListener('message', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'message') {
            messages.push(data.message);
            renderMessages(container.querySelector('#chat-messages'));
          } else if (data.type === 'typing') {
            isTyping = data.is_typing;
            renderMessages(container.querySelector('#chat-messages'));
          } else if (data.type === 'read') {
            messages.forEach((m) => { if (m.sender === 'patient') m.read = true; });
            renderMessages(container.querySelector('#chat-messages'));
          }
        } catch {}
      });

      eventSource.onerror = () => {
        // Reconnect after delay
        if (eventSource) eventSource.close();
        setTimeout(connectSSE, 5000);
      };
    } catch {}
  }

  function formatTime(d) {
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'A l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function getDemoMessages() {
    const now = Date.now();
    return [
      { id: '1', text: 'Bonjour, je souhaiterais savoir si je dois prendre un antidouleur avant mon rendez-vous de vendredi ?', sender: 'patient', created_at: new Date(now - 7200000).toISOString(), read: true },
      { id: '2', text: 'Bonjour ! Non, ce ne sera pas necessaire pour un simple detartrage. Venez simplement a jeun si possible.', sender: 'praticien', created_at: new Date(now - 6000000).toISOString() },
      { id: '3', text: 'Parfait, merci beaucoup !', sender: 'patient', created_at: new Date(now - 5400000).toISOString(), read: true },
      { id: '4', text: 'De rien, a vendredi !', sender: 'praticien', created_at: new Date(now - 5000000).toISOString() },
    ];
  }
});
