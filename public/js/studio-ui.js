// =============================================
// JADOMI Studio — Frontend UI Logic
// Gere tabs, modals, generations, bibliotheque
// =============================================

class StudioUI {
  constructor() {
    this.currentTab = 'images';
    this.currentGeneration = null;
    this.currentType = null;
    this.providersStatus = {};
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadProvidersStatus();
    await this.loadWallet();
  }

  getToken() {
    // Meme pattern que dashboard-annonceur
    const raw = localStorage.getItem('sb-vsbomwjzehnfinfjvhqp-auth-token');
    if (raw) {
      try { return JSON.parse(raw).access_token; } catch(e) {}
    }
    return localStorage.getItem('sb-access-token') || '';
  }

  async callAPI(endpoint, method, body) {
    const opts = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.getToken()
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const response = await fetch(endpoint, opts);
    if (!response.ok) {
      const text = await response.text();
      let msg;
      try { msg = JSON.parse(text).error; } catch(e) { msg = text; }
      throw new Error(msg || 'Erreur serveur');
    }
    return response.json();
  }

  // === Wallet ===
  async loadWallet() {
    try {
      const wallet = await this.callAPI('/api/studio/wallet');
      const el = document.getElementById('studioCoinsBalance');
      if (el) el.textContent = (wallet.balance || 0).toLocaleString('fr-FR') + ' coins';
    } catch(e) {
      console.warn('[STUDIO] Wallet load failed:', e.message);
    }
  }

  // === Providers Status ===
  async loadProvidersStatus() {
    try {
      this.providersStatus = await this.callAPI('/api/studio/providers-status');
      this.updateCardsAvailability();
    } catch(e) {
      console.warn('[STUDIO] Providers status failed:', e.message);
    }
  }

  updateCardsAvailability() {
    document.querySelectorAll('.studio-card[data-provider]').forEach(card => {
      const provider = card.dataset.provider;
      if (provider && this.providersStatus[provider] === false) {
        card.classList.add('unavailable');
      }
    });
  }

  // === Events ===
  bindEvents() {
    // Tabs
    document.querySelectorAll('.studio-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Cards generation
    document.querySelectorAll('.studio-card .btn-generate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = e.target.closest('.studio-card');
        if (card.classList.contains('unavailable')) return;
        const type = card.dataset.type;
        if (type && (type.startsWith('image-stock') || type.startsWith('video-stock'))) {
          this.switchTab('stock');
          return;
        }
        this.openGenerationModal(type);
      });
    });

    // Modal close
    const modal = document.getElementById('studioModal');
    if (modal) {
      modal.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

    // Style cards
    document.querySelectorAll('.style-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Voice cards
    document.querySelectorAll('.voice-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.voice-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Step navigation
    const btnNext = document.getElementById('studioStepNext');
    if (btnNext) btnNext.addEventListener('click', () => this.handleStepNext());

    const btnBack = document.getElementById('studioStepBack');
    if (btnBack) btnBack.addEventListener('click', () => this.showStep(1));

    const btnGenerate = document.getElementById('studioGenerateBtn');
    if (btnGenerate) btnGenerate.addEventListener('click', () => this.handleGenerate());

    // Result actions
    document.getElementById('studioUseCampaign')?.addEventListener('click', () => this.usInCampaign());
    document.getElementById('studioSaveLibrary')?.addEventListener('click', () => this.saveToLibrary());
    document.getElementById('studioRegenerate')?.addEventListener('click', () => this.showStep(1));

    // Stock search
    document.getElementById('stockSearchBtn')?.addEventListener('click', () => this.searchStock());
    document.getElementById('stockSearchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.searchStock();
    });

    // Stock filters
    document.querySelectorAll('.stock-filters button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stock-filters button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Library filters
    document.querySelectorAll('.library-filters button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.library-filters button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadLibrary(btn.dataset.filter || 'all');
      });
    });
  }

  // === Tabs ===
  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.studio-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.studio-tabs .tab[data-tab="${tabName}"]`)?.classList.add('active');

    document.querySelectorAll('.studio-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`studio-tab-${tabName}`)?.classList.add('active');

    if (tabName === 'library') this.loadLibrary();
  }

  // === Modal ===
  openGenerationModal(type) {
    this.currentType = type;
    const modal = document.getElementById('studioModal');
    if (!modal) return;

    // Configurer le titre
    const titles = {
      'image-standard': 'Image IA Standard (DALL-E 3)',
      'image-banner': 'Image Banner Pro (DALL-E 3 HD)',
      'image-luxury': 'Image Ultra Realiste',
      'video-4s': 'Video IA 4 sec (Sora 2)',
      'video-8s': 'Video IA 8 sec (Sora 2)',
      'video-12s': 'Video IA 12 sec (Sora 2)',
      'video-pro': 'Video Pro HD (Sora 2 Pro)',
      'voice-basic': 'Voix Standard (OpenAI TTS)',
      'voice-premium': 'Voix Premium (ElevenLabs)',
      'avatar-heygen': 'Avatar IA Parlant (HeyGen)',
    };

    document.getElementById('studioModalTitle').textContent = titles[type] || 'Generation IA';

    // Afficher/masquer sections selon le type
    const isVoice = type && type.startsWith('voice');
    const isAvatar = type && type.startsWith('avatar');
    const isVisual = !isVoice && !isAvatar;

    document.getElementById('studioPromptSection').style.display = isVisual ? 'block' : 'none';
    document.getElementById('studioStyleSection').style.display = isVisual ? 'block' : 'none';
    document.getElementById('studioTextSection').style.display = (isVoice || isAvatar) ? 'block' : 'none';
    document.getElementById('studioVoiceSection').style.display = isVoice ? 'block' : 'none';
    document.getElementById('studioOverlaySection').style.display = isVisual ? 'block' : 'none';

    modal.classList.add('active');
    this.showStep(1);
  }

  closeModal() {
    const modal = document.getElementById('studioModal');
    if (modal) modal.classList.remove('active');
    this.currentGeneration = null;
  }

  showStep(n) {
    document.querySelectorAll('#studioModal .step').forEach(s => s.classList.remove('active'));
    const step = document.getElementById(`studioStep${n}`);
    if (step) step.classList.add('active');
  }

  // === Step navigation ===
  async handleStepNext() {
    const type = this.currentType;
    const isVoice = type && type.startsWith('voice');
    const isAvatar = type && type.startsWith('avatar');

    if (isVoice || isAvatar) {
      const text = document.getElementById('studioTextInput')?.value?.trim();
      if (!text) { alert('Veuillez entrer un texte.'); return; }

      // Recap
      document.getElementById('recapBrief').textContent = text.substring(0, 150) + (text.length > 150 ? '...' : '');
      document.getElementById('recapPrompt').textContent = '(Texte brut, pas d\'optimisation)';
      const cost = this.estimateCost();
      document.getElementById('recapCost').textContent = cost + ' coins';
    } else {
      const brief = document.getElementById('studioBriefInput')?.value?.trim();
      if (!brief) { alert('Veuillez decrire ce que vous souhaitez creer.'); return; }

      // Optimiser le prompt
      try {
        document.getElementById('recapBrief').textContent = brief;
        document.getElementById('recapPrompt').textContent = 'Optimisation en cours...';
        this.showStep(2);

        const style = document.querySelector('.style-card.active')?.dataset.style || 'pro';
        const mediaType = type.startsWith('video') ? 'video' : 'image';
        const result = await this.callAPI('/api/studio/enhance-prompt', 'POST', {
          user_brief: brief,
          media_type: mediaType,
          style
        });
        document.getElementById('recapPrompt').textContent = result.optimized_prompt;
      } catch(err) {
        document.getElementById('recapPrompt').textContent = '(Optimisation indisponible — prompt original utilise)';
      }

      const cost = this.estimateCost();
      document.getElementById('recapCost').textContent = cost + ' coins';
    }

    this.showStep(2);
  }

  estimateCost() {
    const costs = {
      'image-standard': 30, 'image-banner': 50, 'image-luxury': 100,
      'video-4s': 40, 'video-8s': 80, 'video-12s': 120, 'video-pro': 300,
      'voice-basic': 10, 'voice-premium': 30,
      'avatar-heygen': 200,
    };
    return costs[this.currentType] || 30;
  }

  // === Generate ===
  async handleGenerate() {
    const type = this.currentType;
    this.showStep(3);

    try {
      this.updateLoader('Preparation...', 1);

      const isVoice = type && type.startsWith('voice');
      const isAvatar = type && type.startsWith('avatar');
      let result;

      if (isVoice) {
        this.updateLoader('Generation de la voix...', 2);
        const text = document.getElementById('studioTextInput').value.trim();
        const voice = document.querySelector('#studioVoiceSection .voice-card.active')?.dataset.voice || 'nova';
        const provider = type === 'voice-premium' ? 'elevenlabs' : 'openai';
        result = await this.callAPI('/api/studio/generate-voice', 'POST', { text, voice, provider });

      } else if (isAvatar) {
        this.updateLoader('Creation de l\'avatar parlant...', 2);
        const text = document.getElementById('studioTextInput').value.trim();
        result = await this.callAPI('/api/studio/generate-avatar', 'POST', { text });

      } else {
        // Image ou video
        const brief = document.getElementById('studioBriefInput').value.trim();
        const optimizedPrompt = document.getElementById('recapPrompt').textContent;
        const prompt = optimizedPrompt && !optimizedPrompt.includes('indisponible') ? optimizedPrompt : brief;

        if (type.startsWith('video')) {
          this.updateLoader('Generation de la video IA...', 2);
          const durations = { 'video-4s': 4, 'video-8s': 8, 'video-12s': 12, 'video-pro': 12 };
          const quality = type === 'video-pro' ? 'pro' : 'standard';
          result = await this.callAPI('/api/studio/generate-video', 'POST', {
            prompt, duration: durations[type] || 4, quality, user_brief: brief
          });
        } else {
          this.updateLoader('Generation de l\'image IA...', 2);
          const sizes = { 'image-standard': '1024x1024', 'image-banner': '1792x1024', 'image-luxury': '1024x1024' };
          const qualities = { 'image-standard': 'standard', 'image-banner': 'hd', 'image-luxury': 'luxury' };
          result = await this.callAPI('/api/studio/generate-image', 'POST', {
            prompt, size: sizes[type] || '1024x1024', quality: qualities[type] || 'standard', user_brief: brief
          });
        }
      }

      this.updateLoader('Finalisation...', 4);
      this.currentGeneration = result;
      setTimeout(() => this.showResult(result), 500);

    } catch(err) {
      alert('Erreur : ' + err.message);
      this.showStep(1);
    }
  }

  showResult(result) {
    this.showStep(4);
    const preview = document.getElementById('studioResultPreview');
    if (!preview) return;

    const url = result.url || '';
    if (url.includes('.mp4') || url.includes('video')) {
      preview.innerHTML = '<video src="' + url + '" controls autoplay muted style="width:100%;max-height:500px;"></video>';
    } else if (url.includes('.mp3') || url.includes('audio')) {
      preview.innerHTML = '<audio src="' + url + '" controls style="width:100%;margin:20px 0;"></audio>';
    } else {
      preview.innerHTML = '<img src="' + url + '" alt="Generation JADOMI Studio" style="width:100%;max-height:500px;object-fit:contain;">';
    }

    document.getElementById('studioResultCost').textContent = (result.cost_coins || 0) + ' coins debites';
    this.loadWallet();
  }

  updateLoader(message, step) {
    const msgEl = document.getElementById('studioLoaderMsg');
    const progressEl = document.getElementById('studioLoaderProgress');
    if (msgEl) msgEl.textContent = message;
    if (progressEl) progressEl.textContent = 'Etape ' + step + '/4';
  }

  // === Library ===
  async saveToLibrary() {
    if (!this.currentGeneration) return;
    try {
      await this.callAPI('/api/studio/library/save', 'POST', {
        generation_id: this.currentGeneration.generation_id,
        name: document.getElementById('studioBriefInput')?.value?.substring(0, 100) || 'Creation Studio',
        tags: ['studio'],
      });
      alert('Sauvegarde dans votre bibliotheque !');
    } catch(err) {
      alert('Erreur : ' + err.message);
    }
  }

  async loadLibrary(filter) {
    const grid = document.getElementById('studioLibraryGrid');
    if (!grid) return;

    try {
      const items = await this.callAPI('/api/studio/library?type=' + (filter || 'all'));

      if (!items.length) {
        grid.innerHTML = '<div class="library-empty"><div class="empty-icon">📁</div><p>Votre bibliotheque est vide.<br>Generez du contenu pour commencer !</p></div>';
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="library-item" data-id="${item.id}">
          ${item.media_type === 'voice' ?
            '<div class="preview" style="display:flex;align-items:center;justify-content:center;font-size:3rem;">🎙️</div>' :
            '<img class="preview" src="${item.r2_url || item.thumbnail_url || ''}" alt="${item.name || ''}" onerror="this.style.display=\'none\'">'
          }
          <div class="lib-meta">
            <h4>${item.name || 'Sans titre'}</h4>
            <span>${item.media_type || ''} · ${new Date(item.created_at).toLocaleDateString('fr-FR')}</span>
          </div>
          <div class="lib-actions">
            <button onclick="studioUI.useLibraryItem('${item.id}')">Utiliser</button>
            <button onclick="studioUI.deleteLibraryItem('${item.id}')">Supprimer</button>
          </div>
        </div>
      `).join('');
    } catch(err) {
      grid.innerHTML = '<div class="library-empty"><p>Erreur de chargement</p></div>';
    }
  }

  async deleteLibraryItem(id) {
    if (!confirm('Supprimer cet element ?')) return;
    try {
      await this.callAPI('/api/studio/library/' + id, 'DELETE');
      this.loadLibrary();
    } catch(err) {
      alert('Erreur : ' + err.message);
    }
  }

  useLibraryItem(id) {
    // Fermer le modal studio et passer l'item a la campagne
    alert('Fonctionnalite bientot disponible : integration directe dans vos campagnes.');
  }

  usInCampaign() {
    if (!this.currentGeneration) return;
    this.closeModal();
    // Naviguer vers le panel creatives avec l'URL pre-remplie
    if (typeof switchPanel === 'function') {
      switchPanel('creatives');
    }
    alert('Creatif pret ! Vous pouvez maintenant l\'utiliser dans une campagne.');
  }

  // === Stock search ===
  async searchStock() {
    const query = document.getElementById('stockSearchInput')?.value?.trim();
    if (!query) return;

    const grid = document.getElementById('stockResultsGrid');
    if (!grid) return;

    const isPhotos = document.querySelector('.stock-filters button.active')?.dataset.type === 'photos';
    grid.innerHTML = '<p style="text-align:center;color:var(--studio-text-muted);padding:40px;">Recherche en cours...</p>';

    try {
      const endpoint = isPhotos !== false ? '/api/studio/stock/images' : '/api/studio/stock/videos';
      const results = await this.callAPI(endpoint + '?q=' + encodeURIComponent(query) + '&per_page=20');

      if (!results.results || !results.results.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--studio-text-muted);padding:40px;">Aucun resultat pour "' + query + '"</p>';
        return;
      }

      grid.innerHTML = results.results.map(item => `
        <div class="stock-item">
          <img src="${item.thumb || item.url}" alt="${item.alt || ''}" loading="lazy">
          <div class="stock-meta">${item.photographer || ''} · ${item.source}</div>
          <button class="stock-use-btn" onclick="studioUI.useStockItem('${item.url || item.full || ''}')">Utiliser</button>
        </div>
      `).join('');
    } catch(err) {
      grid.innerHTML = '<p style="text-align:center;color:var(--studio-text-muted);padding:40px;">Service indisponible : ' + err.message + '</p>';
    }
  }

  useStockItem(url) {
    if (!url) return;
    // Sauvegarder dans bibliotheque
    this.callAPI('/api/studio/library/save', 'POST', {
      r2_url: url,
      media_type: 'stock',
      name: 'Stock media',
      tags: ['stock'],
    }).then(() => {
      alert('Media ajoute a votre bibliotheque !');
    }).catch(err => alert('Erreur : ' + err.message));
  }
}

let studioUI;
document.addEventListener('DOMContentLoaded', () => {
  // Init uniquement si on est sur le panel studio
  const observer = new MutationObserver(() => {
    const studioPanel = document.getElementById('panel-studio');
    if (studioPanel && studioPanel.style.display !== 'none' && !studioUI) {
      studioUI = new StudioUI();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });

  // Init immediate si panel deja visible
  setTimeout(() => {
    if (document.getElementById('panel-studio') && !studioUI) {
      studioUI = new StudioUI();
    }
  }, 500);
});
