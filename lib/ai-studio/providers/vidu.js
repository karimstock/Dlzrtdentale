// =============================================
// JADOMI Studio — Vidu AI Provider
// Génération vidéo IA (Shengshu Technology)
// 4x moins cher que Kling, cohérence multi-personnages
// API: api.vidu.com/ent/v2 (doc officielle mai 2026)
// =============================================
const AIProvider = require('./base-provider');
const https = require('https');

const VIDU_BASE_URL = 'https://api.vidu.com';

// RÈGLE ABSOLUE : NE JAMAIS lancer une génération sans calcul de coût + confirmation
// Chaque appel API est logué avec le coût dans /tmp/vidu-spending.log

class ViduProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey || process.env.VIDU_API_KEY);
    this.name = 'vidu';
  }

  getCost(options) {
    const duration = options.duration || 5;
    const model = options.model || 'q3-turbo';
    const resolution = options.resolution || '720p';
    const offPeak = options.off_peak || false;
    const genType = options.generation_type || 'image-to-video';

    // Pricing complet Vidu (mai 2026)
    const pricing = {
      // Q3 — img2video / text2video / start-end2video
      'q3-pro-1080p':   { credits: 30, usd: 0.15, offCredits: 15, offUsd: 0.075 },
      'q3-pro-720p':    { credits: 25, usd: 0.125, offCredits: 13, offUsd: 0.065 },
      'q3-pro-540p':    { credits: 10, usd: 0.05, offCredits: 5, offUsd: 0.025 },
      'q3-turbo-1080p': { credits: 14, usd: 0.07, offCredits: 7, offUsd: 0.035 },
      'q3-turbo-720p':  { credits: 12, usd: 0.06, offCredits: 6, offUsd: 0.03 },
      'q3-turbo-540p':  { credits: 8, usd: 0.04, offCredits: 4, offUsd: 0.02 },
      // Q3 — reference2video
      'q3-mix-1080p':   { credits: 30, usd: 0.15 },
      'q3-mix-720p':    { credits: 25, usd: 0.125 },
      'q3-turbo-ref-1080p': { credits: 13, usd: 0.065, offCredits: 7, offUsd: 0.035 },
      'q3-turbo-ref-720p':  { credits: 10, usd: 0.05, offCredits: 5, offUsd: 0.025 },
      'q3-turbo-ref-540p':  { credits: 5, usd: 0.025, offCredits: 3, offUsd: 0.015 },
    };

    const key = genType === 'reference-to-video'
      ? `${model}-ref-${resolution}` : `${model}-${resolution}`;
    const rate = pricing[key] || pricing['q3-turbo-720p'];

    const perSec = offPeak && rate.offUsd ? rate.offUsd : rate.usd;
    const creditsPerSec = offPeak && rate.offCredits ? rate.offCredits : rate.credits;
    const usd = duration * perSec;
    const credits = duration * creditsPerSec;

    // Lip-sync additionnel
    let lipSyncCost = 0;
    if (genType === 'lip-sync' || genType === 'digital-human') {
      lipSyncCost = Math.ceil(duration / 5) * 0.10; // 20 credits par 5s
    }

    // Tokens JADOMI (marge ~80%)
    const totalUsd = usd + lipSyncCost;
    const coins = Math.max(10, Math.ceil(totalUsd / 0.05));

    return {
      usd: Math.round(totalUsd * 1000) / 1000,
      coins,
      credits,
      perSecond: perSec,
      offPeak,
      lipSyncCost,
    };
  }

  async generate(type, options) {
    // SÉCURITÉ : calcul de coût obligatoire avant toute génération
    const cost = this.getCost(options);
    const fs = require('fs');
    const logLine = `[${new Date().toISOString()}] ${options.generation_type || type} | ${options.duration || 5}s ${options.resolution || '720p'} | ${cost.credits} credits | $${cost.usd}\n`;
    fs.appendFileSync('/tmp/vidu-spending.log', logLine);

    // Bloquer si coût > 5$ sans confirmation explicite
    if (cost.usd > 5 && !options._confirmed) {
      throw new Error(`VIDU_COST_CHECK: Cette génération coûte $${cost.usd} (${cost.credits} crédits). Ajoutez _confirmed:true pour valider.`);
    }

    const genType = options.generation_type || 'image-to-video';
    switch (genType) {
      case 'text-to-video': return this._textToVideo(options);
      case 'image-to-video': return this._imageToVideo(options);
      case 'reference-to-video': return this._referenceToVideo(options);
      case 'lip-sync': return this._lipSync(options);
      default: throw new Error(`vidu_unknown_type: ${genType}`);
    }
  }

  // ── Text to Video ──
  async _textToVideo(options) {
    const body = {
      model: options.model || 'viduq3-turbo',
      prompt: options.prompt,
      duration: options.duration || 5,
      resolution: options.resolution || '720p',
    };
    return this._createAndPoll('/text2video', body);
  }

  // ── Image to Video ──
  async _imageToVideo(options) {
    if (!options.image_url && !options.image_base64) throw new Error('image_url ou image_base64 requis');
    const body = {
      model: options.model || 'viduq3-turbo',
      prompt: options.prompt || '',
      images: [options.image_url || `data:image/jpeg;base64,${options.image_base64}`],
      duration: options.duration || 5,
      resolution: options.resolution || '720p',
    };
    return this._createAndPoll('/img2video', body);
  }

  // ── Reference to Video (multi-personnages cohérents) ──
  async _referenceToVideo(options) {
    if (!options.references || !options.references.length) throw new Error('references requis (2-7 images)');
    const body = {
      model: options.model || 'viduq3-pro',
      prompt: options.prompt,
      references: options.references,
      duration: options.duration || 5,
      resolution: options.resolution || '720p',
    };
    return this._createAndPoll('/reference2video', body);
  }

  // ── Lip Sync ──
  async _lipSync(options) {
    if (!options.video_url && !options.image_url) throw new Error('video_url ou image_url requis');
    if (!options.audio_url) throw new Error('audio_url requis');
    const body = {
      model: options.model || 'viduq3-turbo',
      input_video: options.video_url || null,
      input_image: options.image_url || null,
      audio_url: options.audio_url,
    };
    return this._createAndPoll('/lip-sync', body);
  }

  // ── Helpers ──

  async _createAndPoll(endpoint, body) {
    // Créer la tâche
    const createResp = await this._request('POST', endpoint, body);
    const taskId = createResp.id || createResp.task_id || createResp.generation_id;
    if (!taskId) throw new Error('Vidu: pas de task ID dans la réponse');

    // Polling
    const result = await this._pollTask(taskId);
    return result;
  }

  async _pollTask(taskId) {
    const maxAttempts = 120; // 10 min max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      // API v2 : GET /tasks?task_ids=ID
      const resp = await this._request('GET', `/tasks?task_ids=${taskId}`);
      const task = resp.tasks?.[0] || resp;
      const state = task.state || task.status;

      if (state === 'success' || state === 'completed') {
        const creation = task.creations?.[0] || {};
        return {
          provider: 'vidu',
          taskId,
          videoUrl: creation.url || task.video_url || task.output?.video_url,
          thumbnailUrl: creation.cover_url || task.thumbnail_url,
          duration: task.duration,
          model: task.model,
        };
      }
      if (state === 'failed') {
        throw new Error(`Vidu generation failed: ${task.err_msg || task.error || task.message || 'unknown'}`);
      }
    }
    throw new Error('Vidu: timeout après 10 minutes de polling');
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const options = {
        hostname: 'api.vidu.com',
        path: '/ent/v2' + path,
        method,
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`Vidu API ${res.statusCode}: ${parsed.message || data.substring(0, 200)}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Vidu API parse error: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Vidu API timeout')); });
      if (payload) req.end(payload);
      else req.end();
    });
  }
}

module.exports = ViduProvider;
