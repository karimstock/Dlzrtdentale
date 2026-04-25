/**
 * tab-chat.js — JADOMI Dentiste Pro — Chat Module
 * Standalone split-layout chat: conversation list + message thread
 * Export: renderChat(container), refreshChat()
 */

/* ------------------------------------------------------------------ */
/*  DEMO DATA                                                         */
/* ------------------------------------------------------------------ */
const DEMO_CONVERSATIONS = [
  {
    id: 1,
    patientId: 'p1',
    name: 'Nadia Boukhris',
    phone: '06 12 34 56 78',
    initials: 'NB',
    color: '#0d9488',
    unread: 3,
    messages: [
      { id: 1, from: 'patient', text: 'Bonjour, je souhaiterais déplacer mon rendez-vous de jeudi.', ts: Date.now() - 3600000 * 2, read: true },
      { id: 2, from: 'praticien', text: 'Bonjour Nadia, bien sûr. Quel créneau vous conviendrait ?', ts: Date.now() - 3600000 * 1.5, read: true },
      { id: 3, from: 'patient', text: 'Vendredi matin si possible, vers 10h ?', ts: Date.now() - 3600000, read: true },
      { id: 4, from: 'praticien', text: 'C\'est noté, je vous confirme vendredi 10h00.', ts: Date.now() - 1800000, read: true },
      { id: 5, from: 'patient', text: 'Merci beaucoup docteur !', ts: Date.now() - 600000, read: false },
      { id: 6, from: 'patient', text: 'J\'ai aussi une question sur ma couronne.', ts: Date.now() - 400000, read: false },
      { id: 7, from: 'patient', text: 'Est-ce normal qu\'elle soit un peu sensible au froid ?', ts: Date.now() - 300000, read: false }
    ]
  },
  {
    id: 2,
    patientId: 'p2',
    name: 'Youssef Amrani',
    phone: '06 98 76 54 32',
    initials: 'YA',
    color: '#7c3aed',
    unread: 1,
    messages: [
      { id: 1, from: 'praticien', text: 'Bonjour Youssef, votre panoramique est prêt.', ts: Date.now() - 86400000, read: true },
      { id: 2, from: 'patient', text: 'Super, je peux passer le récupérer ?', ts: Date.now() - 7200000, read: true },
      { id: 3, from: 'praticien', text: 'Oui, le cabinet est ouvert de 9h à 18h.', ts: Date.now() - 5400000, read: true },
      { id: 4, from: 'patient', text: 'Voici la radio que j\'ai faite chez le spécialiste.', ts: Date.now() - 1200000, read: false, photo: 'panoramique.jpg' }
    ]
  },
  {
    id: 3,
    patientId: 'p3',
    name: 'Fatima Zerhouni',
    phone: '07 55 44 33 22',
    initials: 'FZ',
    color: '#e11d48',
    unread: 0,
    messages: [
      { id: 1, from: 'system', text: 'Rappel automatique envoyé pour le RDV du 25/04/2026', ts: Date.now() - 172800000 },
      { id: 2, from: 'patient', text: 'Je confirme ma présence pour demain.', ts: Date.now() - 86400000, read: true },
      { id: 3, from: 'praticien', text: 'Parfait, à demain Fatima. N\'oubliez pas votre dossier.', ts: Date.now() - 82800000, read: true }
    ]
  },
  {
    id: 4,
    patientId: 'p4',
    name: 'Omar Bensalem',
    phone: '06 77 88 99 00',
    initials: 'OB',
    color: '#ea580c',
    unread: 0,
    messages: [
      { id: 1, from: 'praticien', text: 'Bonjour Omar, comment allez-vous après l\'extraction ?', ts: Date.now() - 259200000, read: true },
      { id: 2, from: 'patient', text: 'Ça va beaucoup mieux, merci docteur.', ts: Date.now() - 172800000, read: true },
      { id: 3, from: 'praticien', text: 'Très bien, n\'hésitez pas si la douleur revient.', ts: Date.now() - 169200000, read: true }
    ]
  },
  {
    id: 5,
    patientId: 'p5',
    name: 'Leila Haddad',
    phone: '07 11 22 33 44',
    initials: 'LH',
    color: '#0284c7',
    unread: 0,
    messages: [
      { id: 1, from: 'system', text: 'Nouvelle patiente inscrite via JADOMI', ts: Date.now() - 604800000 },
      { id: 2, from: 'patient', text: 'Bonjour, je souhaite prendre un premier rendez-vous.', ts: Date.now() - 518400000, read: true },
      { id: 3, from: 'praticien', text: 'Bienvenue Leila ! Je vous propose lundi 28 à 14h.', ts: Date.now() - 432000000, read: true },
      { id: 4, from: 'patient', text: 'C\'est parfait, merci !', ts: Date.now() - 345600000, read: true }
    ]
  }
];

let _chatState = {
  conversations: JSON.parse(JSON.stringify(DEMO_CONVERSATIONS)),
  activeId: null,
  sseSource: null
};

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */
function _relativeTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)}j`;
  return new Date(ts).toLocaleDateString('fr-FR');
}

function _formatTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function _animateCount(el, target) {
  let cur = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const iv = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(iv);
  }, 20);
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                            */
/* ------------------------------------------------------------------ */
function _injectChatStyles() {
  if (document.getElementById('jadomi-chat-styles')) return;
  const style = document.createElement('style');
  style.id = 'jadomi-chat-styles';
  style.textContent = `
    .jd-chat-wrap{display:flex;height:100%;min-height:600px;border-radius:16px;overflow:hidden;background:rgba(15,23,42,.6);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.06)}

    /* LEFT PANEL */
    .jd-chat-left{width:320px;min-width:320px;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;background:rgba(15,23,42,.4)}
    .jd-chat-search{padding:16px;border-bottom:1px solid rgba(255,255,255,.06)}
    .jd-chat-search input{width:100%;padding:10px 14px 10px 38px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.04);color:#e2e8f0;font-size:14px;outline:none;transition:border .2s}
    .jd-chat-search input:focus{border-color:#0d9488}
    .jd-chat-search-icon{position:absolute;left:28px;top:50%;transform:translateY(-50%);color:#64748b;font-size:14px;pointer-events:none}
    .jd-chat-search{position:relative}
    .jd-conv-list{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}
    .jd-conv-item{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:background .15s;border-bottom:1px solid rgba(255,255,255,.03)}
    .jd-conv-item:hover{background:rgba(255,255,255,.04)}
    .jd-conv-item.active{background:rgba(13,148,136,.12);border-left:3px solid #0d9488}
    .jd-conv-avatar{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;flex-shrink:0}
    .jd-conv-info{flex:1;min-width:0}
    .jd-conv-name{font-weight:600;color:#e2e8f0;font-size:14px;margin-bottom:2px}
    .jd-conv-preview{color:#64748b;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .jd-conv-meta{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .jd-conv-time{color:#64748b;font-size:11px;white-space:nowrap}
    .jd-conv-badge{background:#0d9488;color:#fff;font-size:11px;font-weight:700;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center}

    /* RIGHT PANEL */
    .jd-chat-right{flex:1;display:flex;flex-direction:column;background:rgba(15,23,42,.3)}
    .jd-chat-header{padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between}
    .jd-chat-header-info h3{margin:0;font-size:16px;font-weight:600;color:#e2e8f0}
    .jd-chat-header-info span{color:#64748b;font-size:13px}
    .jd-chat-voir-profil{color:#0d9488;font-size:13px;text-decoration:none;cursor:pointer;transition:color .15s}
    .jd-chat-voir-profil:hover{color:#14b8a6}

    .jd-chat-messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}

    .jd-msg{max-width:72%;padding:10px 16px;border-radius:16px;font-size:14px;line-height:1.5;position:relative;animation:jdMsgIn .25s ease}
    @keyframes jdMsgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .jd-msg.patient{align-self:flex-start;background:rgba(255,255,255,.08);color:#e2e8f0;border-bottom-left-radius:4px}
    .jd-msg.praticien{align-self:flex-end;background:rgba(13,148,136,.25);color:#e2e8f0;border-bottom-right-radius:4px}
    .jd-msg.system{align-self:center;background:rgba(255,255,255,.04);color:#64748b;font-size:12px;border-radius:20px;padding:6px 16px}
    .jd-msg-time{font-size:11px;color:#64748b;margin-top:4px;display:flex;align-items:center;gap:4px}
    .jd-msg.praticien .jd-msg-time{justify-content:flex-end}
    .jd-msg-read{color:#0d9488;font-size:12px}
    .jd-msg-photo{width:200px;border-radius:10px;margin-top:6px;cursor:pointer;transition:transform .15s;display:block;background:rgba(255,255,255,.06);height:130px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px}
    .jd-msg-photo:hover{transform:scale(1.03)}

    /* INPUT */
    .jd-chat-input-wrap{padding:14px 20px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:flex-end;gap:10px}
    .jd-chat-input{flex:1;resize:none;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04);color:#e2e8f0;padding:10px 14px;font-size:14px;font-family:inherit;line-height:1.5;max-height:120px;outline:none;transition:border .2s}
    .jd-chat-input:focus{border-color:#0d9488}
    .jd-chat-btn{width:40px;height:40px;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:background .15s,transform .1s}
    .jd-chat-btn:active{transform:scale(.92)}
    .jd-chat-btn-attach{background:rgba(255,255,255,.06);color:#94a3b8}
    .jd-chat-btn-attach:hover{background:rgba(255,255,255,.1)}
    .jd-chat-btn-send{background:#0d9488;color:#fff}
    .jd-chat-btn-send:hover{background:#14b8a6}

    /* EMPTY STATE */
    .jd-chat-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#64748b;gap:12px}
    .jd-chat-empty-icon{font-size:56px;opacity:.3}
    .jd-chat-empty-text{font-size:15px}

    /* LIGHTBOX */
    .jd-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;animation:jdFadeIn .2s}
    @keyframes jdFadeIn{from{opacity:0}to{opacity:1}}
    .jd-lightbox-content{max-width:90vw;max-height:90vh;border-radius:12px;background:rgba(255,255,255,.06);width:500px;height:340px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:15px}
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  RENDER FUNCTIONS                                                  */
/* ------------------------------------------------------------------ */
function _renderConvList(container, filter) {
  const list = container.querySelector('.jd-conv-list');
  if (!list) return;
  const q = (filter || '').toLowerCase();
  const convs = _chatState.conversations
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const lastA = a.messages[a.messages.length - 1]?.ts || 0;
      const lastB = b.messages[b.messages.length - 1]?.ts || 0;
      return lastB - lastA;
    });

  list.innerHTML = convs.map(c => {
    const last = c.messages[c.messages.length - 1];
    const preview = last ? (last.photo ? '📷 Photo' : last.text) : '';
    const active = _chatState.activeId === c.id ? ' active' : '';
    return `
      <div class="jd-conv-item${active}" data-id="${c.id}">
        <div class="jd-conv-avatar" style="background:${c.color}">${c.initials}</div>
        <div class="jd-conv-info">
          <div class="jd-conv-name">${c.name}</div>
          <div class="jd-conv-preview">${preview}</div>
        </div>
        <div class="jd-conv-meta">
          <span class="jd-conv-time">${last ? _relativeTime(last.ts) : ''}</span>
          ${c.unread > 0 ? `<span class="jd-conv-badge">${c.unread}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.jd-conv-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id);
      _chatState.activeId = id;
      const conv = _chatState.conversations.find(c => c.id === id);
      if (conv) conv.unread = 0;
      _renderConvList(container, container.querySelector('.jd-chat-search input')?.value);
      _renderThread(container);
    });
  });
}

function _renderThread(container) {
  const right = container.querySelector('.jd-chat-right');
  if (!right) return;
  const conv = _chatState.conversations.find(c => c.id === _chatState.activeId);

  if (!conv) {
    right.innerHTML = `
      <div class="jd-chat-empty">
        <div class="jd-chat-empty-icon">💬</div>
        <div class="jd-chat-empty-text">Sélectionnez une conversation</div>
      </div>`;
    return;
  }

  right.innerHTML = `
    <div class="jd-chat-header">
      <div class="jd-chat-header-info">
        <h3>${conv.name}</h3>
        <span>${conv.phone}</span>
      </div>
      <a class="jd-chat-voir-profil">Voir profil</a>
    </div>
    <div class="jd-chat-messages"></div>
    <div class="jd-chat-input-wrap">
      <textarea class="jd-chat-input" rows="1" placeholder="Écrire un message..."></textarea>
      <button class="jd-chat-btn jd-chat-btn-attach" title="Joindre une photo">📎</button>
      <button class="jd-chat-btn jd-chat-btn-send" title="Envoyer">➤</button>
    </div>`;

  const msgArea = right.querySelector('.jd-chat-messages');
  conv.messages.forEach(m => {
    const div = document.createElement('div');
    div.className = `jd-msg ${m.from}`;
    let content = `<div>${m.text || ''}</div>`;
    if (m.photo) {
      content += `<div class="jd-msg-photo" data-photo="${m.photo}">📷 ${m.photo}</div>`;
    }
    if (m.from !== 'system') {
      const readMark = m.from === 'praticien' ? `<span class="jd-msg-read">${m.read !== false ? '✓✓' : '✓'}</span>` : '';
      content += `<div class="jd-msg-time">${_formatTime(m.ts)} ${readMark}</div>`;
    }
    div.innerHTML = content;
    msgArea.appendChild(div);
  });

  msgArea.scrollTop = msgArea.scrollHeight;

  // Photo lightbox
  msgArea.querySelectorAll('.jd-msg-photo').forEach(ph => {
    ph.addEventListener('click', () => {
      const lb = document.createElement('div');
      lb.className = 'jd-lightbox';
      lb.innerHTML = `<div class="jd-lightbox-content">📷 ${ph.dataset.photo}</div>`;
      lb.addEventListener('click', () => lb.remove());
      document.body.appendChild(lb);
    });
  });

  // Auto-expand textarea
  const ta = right.querySelector('.jd-chat-input');
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });

  // Send message
  const sendMsg = () => {
    const text = ta.value.trim();
    if (!text) return;
    conv.messages.push({ id: Date.now(), from: 'praticien', text, ts: Date.now(), read: false });
    ta.value = '';
    ta.style.height = 'auto';
    _renderThread(container);
    _renderConvList(container, container.querySelector('.jd-chat-search input')?.value);
  };

  right.querySelector('.jd-chat-btn-send').addEventListener('click', sendMsg);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
}

/* ------------------------------------------------------------------ */
/*  SSE (graceful fail)                                               */
/* ------------------------------------------------------------------ */
function _connectSSE() {
  try {
    if (typeof EventSource === 'undefined') return;
    _chatState.sseSource = new EventSource('/api/dentiste-pro/chat/stream');
    _chatState.sseSource.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data && data.conversationId) {
          // handle real-time update
        }
      } catch (_err) { /* ignore parse errors */ }
    });
    _chatState.sseSource.addEventListener('error', function() {
      if (_chatState.sseSource) _chatState.sseSource.close();
    });
  } catch (_e) { /* SSE not available */ }
}

/* ------------------------------------------------------------------ */
/*  PUBLIC API                                                        */
/* ------------------------------------------------------------------ */
function renderChat(container) {
  _injectChatStyles();
  _chatState.conversations = JSON.parse(JSON.stringify(DEMO_CONVERSATIONS));
  _chatState.activeId = null;

  container.innerHTML = `
    <div class="jd-chat-wrap">
      <div class="jd-chat-left">
        <div class="jd-chat-search">
          <span class="jd-chat-search-icon">🔍</span>
          <input type="text" placeholder="Rechercher un patient...">
        </div>
        <div class="jd-conv-list"></div>
      </div>
      <div class="jd-chat-right">
        <div class="jd-chat-empty">
          <div class="jd-chat-empty-icon">💬</div>
          <div class="jd-chat-empty-text">Sélectionnez une conversation</div>
        </div>
      </div>
    </div>`;

  _renderConvList(container, '');

  container.querySelector('.jd-chat-search input').addEventListener('input', function(e) {
    _renderConvList(container, e.target.value);
  });

  _connectSSE();
}

function refreshChat() {
  // In production: fetch /api/dentiste-pro/chat/conversations then re-render
  // Demo: reset to initial data
  _chatState.conversations = JSON.parse(JSON.stringify(DEMO_CONVERSATIONS));
}

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderChat: renderChat, refreshChat: refreshChat };
}
