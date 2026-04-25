/* ═══════════════════════════════════════════════
   JADOMI Patient — Chat IA
   Conversational AI assistant
   ═══════════════════════════════════════════════ */

Router.register('/chat-ia', async (container) => {
  let messages = [];
  let isWaiting = false;

  const suggestions = [
    'Combien coute un detartrage ?',
    'Quels sont vos horaires ?',
    'Comment preparer ma visite ?',
    'Quels documents apporter ?',
    'Urgence dentaire, que faire ?',
  ];

  renderPage();

  function renderPage() {
    container.innerHTML = '';
    container.style.padding = '0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = 'calc(100dvh - var(--header-height))';

    // Header
    const header = document.createElement('div');
    header.innerHTML = `
      <div class="ia-header" style="margin:var(--space-md);margin-bottom:0;">
        <div class="ia-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z"/>
            <path d="M6 10v1a6 6 0 0012 0v-1"/>
            <path d="M12 18v4M8 22h8"/>
          </svg>
        </div>
        <div class="ia-header-text">
          <h3>Assistant IA du cabinet</h3>
          <p>Reponses instantanees 24h/24</p>
        </div>
      </div>`;

    const msgArea = document.createElement('div');
    msgArea.id = 'ia-messages';
    msgArea.className = 'chat-list';
    msgArea.style.cssText = 'flex:1;overflow-y:auto;padding:var(--space-sm) var(--space-md);padding-bottom:80px;';

    const inputBar = document.createElement('div');
    inputBar.className = 'chat-input-bar';
    inputBar.innerHTML = `
      <textarea rows="1" placeholder="Posez votre question..." id="ia-input"></textarea>
      <button class="chat-btn chat-btn-send" id="ia-send" disabled aria-label="Envoyer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
        </svg>
      </button>`;

    container.appendChild(header);
    container.appendChild(msgArea);
    container.appendChild(inputBar);

    renderMessages();

    // Input
    const textarea = inputBar.querySelector('#ia-input');
    const sendBtn = inputBar.querySelector('#ia-send');

    textarea.addEventListener('input', () => {
      sendBtn.disabled = !textarea.value.trim() || isWaiting;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (textarea.value.trim() && !isWaiting) sendMessage(textarea.value.trim());
      }
    });

    sendBtn.addEventListener('click', () => {
      if (textarea.value.trim() && !isWaiting) sendMessage(textarea.value.trim());
    });

    // Hide bottom nav
    const nav = document.getElementById('app-nav');
    if (nav) nav.classList.add('hidden');
    const restoreNav = () => {
      if (nav) nav.classList.remove('hidden');
      window.removeEventListener('hashchange', restoreNav);
    };
    window.addEventListener('hashchange', restoreNav);
  }

  function renderMessages() {
    const msgArea = container.querySelector('#ia-messages');
    if (!msgArea) return;

    let html = '';

    if (messages.length === 0) {
      // Welcome + suggestions
      html += `
        <div class="chat-bubble bubble-ia">
          Bonjour ! Je suis l'assistant IA du cabinet. Je peux repondre a vos questions sur nos services, tarifs, et modalites de rendez-vous. Comment puis-je vous aider ?
          <div class="time">Maintenant</div>
        </div>
        <div class="suggestions" id="ia-suggestions">
          ${suggestions.map((s) => `<button class="suggestion-chip">${s}</button>`).join('')}
        </div>`;
    } else {
      messages.forEach((m) => {
        if (m.sender === 'patient') {
          html += `
            <div class="chat-bubble bubble-patient">
              ${m.text}
              <div class="time">${formatTime(m.created_at)}</div>
            </div>`;
        } else if (m.sender === 'system') {
          html += `
            <div class="notice-escalated">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
              ${m.text}
            </div>`;
        } else {
          html += `
            <div class="chat-bubble bubble-ia">
              ${m.text}
              <div class="time">${formatTime(m.created_at)}</div>
            </div>`;
        }
      });
    }

    if (isWaiting) {
      html += `
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>`;
    }

    msgArea.innerHTML = html;

    // Suggestion click handlers
    msgArea.querySelectorAll('.suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        sendMessage(chip.textContent);
      });
    });

    requestAnimationFrame(() => { msgArea.scrollTop = msgArea.scrollHeight; });
  }

  async function sendMessage(text) {
    const textarea = container.querySelector('#ia-input');
    const sendBtn = container.querySelector('#ia-send');
    if (textarea) { textarea.value = ''; textarea.style.height = 'auto'; }
    if (sendBtn) sendBtn.disabled = true;

    messages.push({
      sender: 'patient',
      text,
      created_at: new Date().toISOString(),
    });

    isWaiting = true;
    renderMessages();

    try {
      const res = await JadomiAPI.post('/chat-ia/message', { message: text });

      isWaiting = false;

      messages.push({
        sender: 'ia',
        text: res.reply || res.message || 'Je n\'ai pas pu traiter votre demande.',
        created_at: new Date().toISOString(),
      });

      if (res.escalated) {
        messages.push({
          sender: 'system',
          text: 'Votre question a ete transmise a l\'equipe du cabinet. Vous recevrez une reponse personnalisee.',
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      isWaiting = false;
      // Demo response
      messages.push({
        sender: 'ia',
        text: getDemoResponse(text),
        created_at: new Date().toISOString(),
      });
    }

    renderMessages();
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function getDemoResponse(q) {
    const lower = q.toLowerCase();
    if (lower.includes('cout') || lower.includes('tarif') || lower.includes('prix')) {
      return 'Nos tarifs dependent du type de soin. Un detartrage est a partir de 60\u20ac (base de remboursement Secu). Pour un devis personnalise, n\'hesitez pas a prendre rendez-vous.';
    }
    if (lower.includes('horaire') || lower.includes('heure')) {
      return 'Le cabinet est ouvert du lundi au vendredi de 9h a 19h, et le samedi matin de 9h a 13h. Vous pouvez prendre rendez-vous directement depuis l\'application.';
    }
    if (lower.includes('urgence')) {
      return 'En cas d\'urgence dentaire, appelez directement le cabinet. En dehors des heures d\'ouverture, contactez le 15 (SAMU) ou rendez-vous aux urgences de l\'hopital le plus proche.';
    }
    if (lower.includes('document') || lower.includes('apporter')) {
      return 'Pensez a apporter votre carte Vitale, votre mutuelle, et une piece d\'identite. Si c\'est votre premiere visite, arrivez 10 minutes en avance pour remplir le questionnaire medical.';
    }
    return 'Merci pour votre question. Je vais transmettre votre demande a l\'equipe du cabinet pour une reponse personnalisee. Vous serez notifie des qu\'une reponse sera disponible.';
  }
});
