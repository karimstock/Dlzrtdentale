// =============================================
// JADOMI Studio — Kling AI Provider (Kuaishou)
// Vidéo génération + avatars parlants + image-to-video
// Remplace HeyGen — plus complet, moins cher
// =============================================
const AIProvider = require('./base-provider');
const axios = require('axios');
const crypto = require('crypto');

const KLING_BASE_URL = 'https://api.klingai.com/v1';

class KlingProvider extends AIProvider {
  constructor(accessKeyOrLegacy, secretKey) {
    super(accessKeyOrLegacy);
    // Support deux modes : (accessKey, secretKey) ou (legacyKey) avec fallback .env
    if (secretKey) {
      this.accessKey = accessKeyOrLegacy;
      this.secretKey = secretKey;
    } else {
      this.accessKey = process.env.KLING_ACCESS_KEY || accessKeyOrLegacy;
      this.secretKey = process.env.KLING_SECRET_KEY || '';
    }
    this.name = 'kling';
  }

  /**
   * Génère un JWT signé HMAC-SHA256 pour l'API Kling v1
   * Spec : header { alg:HS256, typ:JWT } + payload { iss:accessKey, exp:+30min, iat:now }
   * Signé avec secretKey
   */
  _generateJWT() {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      iss: this.accessKey,
      exp: now + 1800,
      iat: now,
      nbf: now - 5
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secretKey)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  /**
   * Calcul du coût selon le type de génération
   * Kling est ~10x moins cher que HeyGen pour les avatars
   * et propose text-to-video / image-to-video en plus
   */
  getCost(options) {
    const type = options.generation_type || 'text-to-video';
    const duration = options.duration || 5; // secondes

    const pricing = {
      'text-to-video':   { usdPerSec: 0.03, coinsPerSec: 8 },
      'image-to-video':  { usdPerSec: 0.03, coinsPerSec: 8 },
      'avatar':          { usdPerSec: 0.05, coinsPerSec: 12 },
      'lip-sync':        { usdPerSec: 0.04, coinsPerSec: 10 },
    };

    const rate = pricing[type] || pricing['text-to-video'];
    const usd = Math.max(0.10, duration * rate.usdPerSec);
    const coins = Math.max(30, Math.ceil(duration * rate.coinsPerSec));

    return { usd: Math.round(usd * 100) / 100, coins };
  }

  /**
   * Génération vidéo via Kling AI API
   * Supporte : text-to-video, image-to-video, avatar (lip-sync)
   */
  async generate(type, options) {
    const generationType = options.generation_type || 'text-to-video';

    switch (generationType) {
      case 'text-to-video':
        return this._generateTextToVideo(options);
      case 'image-to-video':
        return this._generateImageToVideo(options);
      case 'avatar':
      case 'lip-sync':
        return this._generateLipSync(options);
      default:
        throw new Error(`kling_unknown_type: ${generationType}`);
    }
  }

  /**
   * Text-to-video : génère une vidéo à partir d'un prompt texte
   */
  async _generateTextToVideo(options) {
    const prompt = options.prompt;
    if (!prompt || prompt.length < 5) throw new Error('Prompt requis (min 5 caractères)');

    const createResp = await axios.post(
      `${KLING_BASE_URL}/videos/text2video`,
      {
        model: options.model || 'kling-v1-5',
        prompt: prompt,
        negative_prompt: options.negative_prompt || '',
        cfg_scale: options.cfg_scale || 0.5,
        mode: options.mode || 'std', // std ou pro
        aspect_ratio: options.aspect_ratio || '16:9',
        duration: String(options.duration || 5), // "5" ou "10"
      },
      this._getRequestConfig()
    );

    const taskId = this._extractTaskId(createResp.data);
    const result = await this._pollTask(`${KLING_BASE_URL}/videos/text2video/${taskId}`, taskId);
    return this._downloadResult(result, 'kling-text2video');
  }

  /**
   * Image-to-video : anime une image statique
   * Idéal pour : animer photo cabinet, produit dentaire, portrait
   */
  async _generateImageToVideo(options) {
    const imageUrl = options.image_url;
    if (!imageUrl) throw new Error('image_url requis pour image-to-video');

    const body = {
      model: options.model || 'kling-v1-5',
      image: imageUrl,
      prompt: options.prompt || '',
      negative_prompt: options.negative_prompt || '',
      cfg_scale: options.cfg_scale || 0.5,
      mode: options.mode || 'std',
      duration: String(options.duration || 5),
    };

    // Support image en base64
    if (options.image_base64) {
      body.image = `data:image/jpeg;base64,${options.image_base64}`;
    }

    const createResp = await axios.post(
      `${KLING_BASE_URL}/videos/image2video`,
      body,
      this._getRequestConfig()
    );

    const taskId = this._extractTaskId(createResp.data);
    const result = await this._pollTask(`${KLING_BASE_URL}/videos/image2video/${taskId}`, taskId);
    return this._downloadResult(result, 'kling-image2video');
  }

  /**
   * Lip-sync / Avatar parlant : fait parler un visage
   * Remplace HeyGen — même feature, prix divisé par 10
   */
  async _generateLipSync(options) {
    const text = options.text;
    if (!text || text.length < 5) throw new Error('Texte requis (min 5 caractères)');
    if (!options.image_url && !options.video_url) {
      throw new Error('image_url ou video_url requis pour lip-sync');
    }

    const body = {
      model: options.model || 'kling-v1-5',
      input: options.video_url || options.image_url,
      text: text,
      voice_id: options.voice_id || 'default_fr',
      voice_language: 'fr',
    };

    const createResp = await axios.post(
      `${KLING_BASE_URL}/videos/lip-sync`,
      body,
      this._getRequestConfig()
    );

    const taskId = this._extractTaskId(createResp.data);
    const result = await this._pollTask(`${KLING_BASE_URL}/videos/lip-sync/${taskId}`, taskId);
    return this._downloadResult(result, 'kling-lip-sync');
  }

  // --- Helpers ---

  _getRequestConfig() {
    return {
      headers: {
        'Authorization': `Bearer ${this._generateJWT()}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };
  }

  _extractTaskId(data) {
    const taskId = data?.data?.task_id || data?.task_id;
    if (!taskId) throw new Error('kling_task_creation_failed');
    return taskId;
  }

  /**
   * Polling : attend que la vidéo soit prête
   * Kling génère en 30s-3min selon la durée et le mode
   */
  async _pollTask(statusUrl, taskId) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusResp = await axios.get(statusUrl, this._getRequestConfig());
      const taskData = statusResp.data?.data;
      const status = taskData?.task_status;

      if (status === 'succeed') {
        const videoUrl = taskData?.task_result?.videos?.[0]?.url;
        if (!videoUrl) throw new Error('kling_no_video_url');
        return { videoUrl, taskData };
      }

      if (status === 'failed') {
        const errMsg = taskData?.task_status_msg || 'unknown';
        throw new Error(`kling_generation_failed: ${errMsg}`);
      }

      // status = 'submitted' ou 'processing' → continuer polling
    }

    throw new Error('kling_timeout');
  }

  async _downloadResult(result, model) {
    const videoResp = await axios.get(result.videoUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });

    return {
      buffer: Buffer.from(videoResp.data),
      ext: 'mp4',
      contentType: 'video/mp4',
      metadata: {
        model,
        task_id: result.taskData?.task_id,
        duration: result.taskData?.task_result?.videos?.[0]?.duration,
      },
    };
  }
}

module.exports = KlingProvider;
