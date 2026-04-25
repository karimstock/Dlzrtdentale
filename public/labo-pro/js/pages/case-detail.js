/* ═══════════════════════════════════════════════
   JADOMI Labo — Case Detail
   Photos, upload, message thread
   ═══════════════════════════════════════════════ */

Router.register('/cas/:id', async (container, params) => {
  const caseId = params.id;
  const cases = window.__DEMO_CASES || [];
  const cas = cases.find(c => c.id === caseId);

  if (!cas) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Cas introuvable</h3>
        <p>Ce cas n'existe pas ou a ete supprime.</p>
        <button class="btn btn-primary mt-md" onclick="Router.navigate('/mes-cas')">Retour aux cas</button>
      </div>`;
    return;
  }

  // Mark as read
  cas.unread = 0;

  render();

  function render() {
    const photosBySource = {
      cabinet: cas.photos.filter(p => p.source === 'cabinet'),
      labo: cas.photos.filter(p => p.source === 'labo'),
    };

    container.innerHTML = `
      <!-- Back button -->
      <button class="back-btn" id="btn-back" aria-label="Retour aux cas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Mes Cas
      </button>

      <!-- Header -->
      <div class="case-detail-header">
        <div class="case-detail-ref">${cas.reference}</div>
        <h1 class="case-detail-title">${cas.titre}</h1>
        <div class="flex items-center gap-sm">
          <span class="status-badge status-${cas.statut}">${cas.statutLabel}</span>
          <span class="case-card-teinte">
            <span class="dot" style="background:${cas.teinteColor}"></span>
            ${cas.teinte}
          </span>
        </div>
      </div>

      <!-- Info Grid -->
      <div class="case-info-grid">
        <div class="case-info-item">
          <div class="case-info-label">Type</div>
          <div class="case-info-value">${cas.type}</div>
        </div>
        <div class="case-info-item">
          <div class="case-info-label">Dent(s)</div>
          <div class="case-info-value">${cas.dent}</div>
        </div>
        <div class="case-info-item">
          <div class="case-info-label">Cabinet</div>
          <div class="case-info-value" style="font-size:12px">${cas.dentiste}</div>
        </div>
        <div class="case-info-item">
          <div class="case-info-label">Livraison</div>
          <div class="case-info-value">${formatDateFull(cas.dateLivraison)}</div>
        </div>
      </div>

      <!-- Cercle de soins -->
      <div style="margin:var(--space-md,16px) 0;padding:14px 16px;border-radius:12px;background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          <span style="font-size:12px;font-weight:600;color:#a78bfa;text-transform:uppercase;letter-spacing:.05em">Cercle de soins</span>
        </div>
        <div style="font-size:13px;color:var(--text-primary,#e4e4e7);line-height:1.5">
          Ce cas implique : <strong>${cas.dentiste}</strong> (dentiste) + <strong>Patient${cas.patient ? ' ' + cas.patient : ' Mme Dupont'}</strong>
        </div>
        <div style="font-size:11px;color:var(--text-secondary,#71717a);margin-top:6px;display:flex;align-items:center;gap:6px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Les echanges entre praticiens restent dans le cercle de soins du patient
        </div>
      </div>

      <!-- Instructions -->
      ${cas.instructions ? `
      <div class="case-instructions">
        <h4>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
          </svg>
          Instructions du praticien
        </h4>
        <p>${cas.instructions}</p>
      </div>` : ''}

      <!-- Photos Section -->
      <div class="section-divider">
        <span>Photos (${cas.photos.length})</span>
      </div>

      <!-- Photos from cabinet -->
      ${photosBySource.cabinet.length > 0 ? `
      <div class="section-subtitle" style="margin-top:var(--space-sm)">
        <span style="display:inline-flex;align-items:center;gap:4px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1"/><rect x="5" y="3" width="14" height="18" rx="1"/></svg>
          Recues du cabinet
        </span>
      </div>
      <div class="photo-grid" id="photos-cabinet">
        ${photosBySource.cabinet.map(p => renderPhotoItem(p)).join('')}
      </div>` : ''}

      <!-- Photos from labo -->
      ${photosBySource.labo.length > 0 ? `
      <div class="section-subtitle">
        <span style="display:inline-flex;align-items:center;gap:4px;color:var(--pink-400)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          Envoyees par le labo
        </span>
      </div>
      <div class="photo-grid" id="photos-labo">
        ${photosBySource.labo.map(p => renderPhotoItem(p)).join('')}
      </div>` : ''}

      <!-- Upload Button -->
      <div class="upload-section">
        <button class="upload-btn" id="btn-upload" aria-label="Envoyer une photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Envoyer une photo
        </button>
      </div>

      <!-- Message Thread -->
      <div class="message-thread">
        <div class="message-thread-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <h3>Messages (${cas.messages.length})</h3>
        </div>

        <div class="chat-list" id="message-list">
          ${cas.messages.map(m => `
            <div class="chat-bubble ${m.from === 'labo' ? 'bubble-labo' : 'bubble-cabinet'}">
              <div class="sender">${m.from === 'labo' ? 'Vous' : cas.dentiste}</div>
              ${m.text}
              <div class="time">${formatMessageTime(m.time)}</div>
            </div>
          `).join('')}
        </div>

        <!-- Message input -->
        <div class="chat-input-bar">
          <textarea id="msg-input" rows="1" placeholder="Ecrire un message..."></textarea>
          <button class="chat-btn chat-btn-send" id="btn-send" disabled aria-label="Envoyer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // ── Event Listeners ─────────────────────

    // Back
    container.querySelector('#btn-back').addEventListener('click', () => {
      Router.navigate('/mes-cas');
    });

    // Photo click -> fullscreen
    container.querySelectorAll('.photo-grid-item').forEach(item => {
      item.addEventListener('click', () => {
        const photoId = item.dataset.photoId;
        const photo = cas.photos.find(p => p.id === photoId);
        if (photo) openPhotoViewer(photo);
      });
    });

    // Upload button
    container.querySelector('#btn-upload').addEventListener('click', () => {
      openUploadModal();
    });

    // Message input
    const msgInput = container.querySelector('#msg-input');
    const sendBtn = container.querySelector('#btn-send');

    msgInput.addEventListener('input', () => {
      sendBtn.disabled = !msgInput.value.trim();
      // Auto-resize
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    });

    sendBtn.addEventListener('click', () => sendMessage());
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function sendMessage() {
      const text = msgInput.value.trim();
      if (!text) return;

      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

      cas.messages.push({
        id: 'm-' + Date.now(),
        from: 'labo',
        text: text,
        time: timeStr,
      });

      // Append bubble
      const list = container.querySelector('#message-list');
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble bubble-labo';
      bubble.innerHTML = `
        <div class="sender">Vous</div>
        ${text}
        <div class="time">${formatMessageTime(timeStr)}</div>
      `;
      bubble.style.animation = 'pageIn .3s var(--ease-out-expo) both';
      list.appendChild(bubble);
      bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });

      msgInput.value = '';
      msgInput.style.height = 'auto';
      sendBtn.disabled = true;

      showSuccess('Message envoye');
    }

    // Scroll to last message
    setTimeout(() => {
      const list = container.querySelector('#message-list');
      if (list && list.lastElementChild) {
        list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 400);
  }

  function renderPhotoItem(photo) {
    // Generate a gradient placeholder based on photo type
    const gradients = {
      'Clinique': 'linear-gradient(135deg, #1a2332, #2d3748)',
      'Teinte': 'linear-gradient(135deg, #2d2518, #4a3f2f)',
      'Empreinte': 'linear-gradient(135deg, #1a2840, #2b3a52)',
      'Fabrication': 'linear-gradient(135deg, #2a1830, #3d2845)',
      'Essayage': 'linear-gradient(135deg, #1a3028, #2d4a3c)',
      'Produit fini': 'linear-gradient(135deg, #301a28, #4a2d3c)',
      'Question': 'linear-gradient(135deg, #30291a, #4a3f2d)',
    };
    const gradient = gradients[photo.type] || gradients['Clinique'];

    return `
      <div class="photo-grid-item" data-photo-id="${photo.id}" role="button" tabindex="0" aria-label="${photo.type}: ${photo.desc}">
        <div class="photo-placeholder" style="background:${gradient}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span>${photo.desc.substring(0, 30)}${photo.desc.length > 30 ? '...' : ''}</span>
        </div>
        <span class="photo-type">${photo.type}</span>
        <span class="photo-source ${photo.source === 'cabinet' ? 'photo-source-cabinet' : 'photo-source-labo'}">
          ${photo.source === 'cabinet' ? 'Cabinet' : 'Envoye'}
        </span>
        ${photo.source === 'cabinet' && photo.fromPatient ? '<span style="display:block;font-size:10px;color:#71717a;margin-top:4px;font-style:italic">Photo transmise par le praticien (origine: patient)</span>' : ''}
      </div>`;
  }

  function openPhotoViewer(photo) {
    const gradients = {
      'Clinique': 'linear-gradient(135deg, #1a2332 0%, #2d3748 50%, #1a2840 100%)',
      'Teinte': 'linear-gradient(135deg, #2d2518 0%, #4a3f2f 50%, #3d3525 100%)',
      'Empreinte': 'linear-gradient(135deg, #1a2840 0%, #2b3a52 50%, #1d2e45 100%)',
      'Fabrication': 'linear-gradient(135deg, #2a1830 0%, #3d2845 50%, #2f1d38 100%)',
      'Essayage': 'linear-gradient(135deg, #1a3028 0%, #2d4a3c 50%, #1f3830 100%)',
      'Produit fini': 'linear-gradient(135deg, #301a28 0%, #4a2d3c 50%, #381f30 100%)',
    };
    const gradient = gradients[photo.type] || gradients['Clinique'];

    const viewer = document.createElement('div');
    viewer.className = 'photo-viewer';
    viewer.innerHTML = `
      <button class="photo-viewer-close" aria-label="Fermer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
      <div style="width:85%;max-width:400px;aspect-ratio:4/3;border-radius:12px;background:${gradient};display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--text-secondary)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <span style="font-size:14px;text-align:center;padding:0 20px">${photo.desc}</span>
      </div>
      <div class="photo-viewer-info">
        <div class="photo-viewer-type">${photo.type} — ${photo.source === 'labo' ? 'Envoye par le labo' : 'Recu du cabinet'}${photo.fromPatient ? ' <span style="opacity:.7;font-style:italic">(origine: patient)</span>' : ''}</div>
        <div>${photo.desc}</div>
        <div style="margin-top:4px;opacity:.6;font-size:12px">${formatDateFull(photo.date)}</div>
      </div>
    `;

    document.body.appendChild(viewer);

    viewer.querySelector('.photo-viewer-close').addEventListener('click', () => {
      viewer.style.animation = 'fadeOut .2s ease forwards';
      setTimeout(() => viewer.remove(), 200);
    });

    viewer.addEventListener('click', (e) => {
      if (e.target === viewer) {
        viewer.style.animation = 'fadeOut .2s ease forwards';
        setTimeout(() => viewer.remove(), 200);
      }
    });
  }

  function openUploadModal() {
    const overlay = document.createElement('div');
    overlay.className = 'upload-modal';

    let selectedType = 'Fabrication';
    let selectedFile = null;
    let description = '';

    overlay.innerHTML = `
      <div class="upload-modal-bg"></div>
      <div class="upload-modal-sheet">
        <div class="handle"></div>
        <h3 class="section-title" style="font-size:18px;margin-bottom:var(--space-md)">Envoyer une photo</h3>

        <!-- Type selector -->
        <div class="section-subtitle" style="margin-top:0">Type de photo</div>
        <div class="type-selector" id="upload-type-selector">
          <button class="type-pill selected" data-type="Fabrication">Fabrication</button>
          <button class="type-pill" data-type="Essayage">Essayage</button>
          <button class="type-pill" data-type="Produit fini">Produit fini</button>
          <button class="type-pill" data-type="Question">Question</button>
        </div>

        <!-- File picker -->
        <div class="upload-preview" id="upload-preview">
          <div class="placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <p style="margin-top:8px">Appuyez pour prendre ou choisir une photo</p>
          </div>
        </div>
        <input type="file" id="upload-file" accept="image/*" capture="environment" style="display:none" />

        <!-- Description -->
        <div class="input-group mb-md">
          <label>Description (optionnel)</label>
          <textarea class="input" id="upload-desc" placeholder="Decrire la photo..." rows="2"></textarea>
        </div>

        <!-- Progress bar (hidden initially) -->
        <div class="upload-progress" id="upload-progress" style="display:none">
          <div class="upload-progress-bar" id="upload-progress-bar"></div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-sm mt-md">
          <button class="btn btn-primary btn-block" id="btn-confirm-upload" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            Envoyer
          </button>
          <button class="btn btn-secondary btn-block" id="btn-cancel-upload">Annuler</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const fileInput = overlay.querySelector('#upload-file');
    const preview = overlay.querySelector('#upload-preview');
    const confirmBtn = overlay.querySelector('#btn-confirm-upload');
    const descInput = overlay.querySelector('#upload-desc');

    // Type selector
    overlay.querySelector('#upload-type-selector').addEventListener('click', (e) => {
      const pill = e.target.closest('.type-pill');
      if (!pill) return;
      overlay.querySelectorAll('#upload-type-selector .type-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      selectedType = pill.dataset.type;
    });

    // Preview click -> file picker
    preview.addEventListener('click', () => fileInput.click());

    // File selected
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      selectedFile = file;
      confirmBtn.disabled = false;

      const reader = new FileReader();
      reader.onload = (ev) => {
        preview.innerHTML = `<img src="${ev.target.result}" alt="Apercu" />`;
      };
      reader.readAsDataURL(file);
    });

    // Confirm upload
    confirmBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<div class="spinner spinner-sm"></div> Envoi en cours...';

      const progressEl = overlay.querySelector('#upload-progress');
      const progressBar = overlay.querySelector('#upload-progress-bar');
      progressEl.style.display = 'block';

      // Simulate upload progress
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress > 95) progress = 95;
        progressBar.style.width = progress + '%';
      }, 200);

      // Simulate upload delay
      await new Promise(r => setTimeout(r, 1500));

      clearInterval(progressInterval);
      progressBar.style.width = '100%';

      // Add photo to case
      description = descInput.value.trim();
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      cas.photos.push({
        id: 'p-' + Date.now(),
        type: selectedType,
        source: 'labo',
        desc: description || `${selectedType} - ${cas.titre}`,
        date: dateStr,
      });
      cas.photoCount = cas.photos.length;

      setTimeout(() => {
        overlay.remove();
        render();
        showSuccess('Photo envoyee avec succes');
      }, 500);
    });

    // Cancel / close
    overlay.querySelector('#btn-cancel-upload').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.upload-modal-bg').addEventListener('click', () => overlay.remove());
  }
});

function formatDateFull(dateStr) {
  const d = new Date(dateStr);
  const months = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatMessageTime(timeStr) {
  const parts = timeStr.split(' ');
  if (parts.length < 2) return timeStr;
  const dateParts = parts[0].split('-');
  const timeParts = parts[1];
  const months = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec'];
  const month = months[parseInt(dateParts[1], 10) - 1] || '';
  return `${parseInt(dateParts[2], 10)} ${month} - ${timeParts}`;
}
