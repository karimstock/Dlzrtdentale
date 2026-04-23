// =============================================
// JADOMI Studio — OpenAI Sora Video Provider
// =============================================
const AIProvider = require('./base-provider');

const COSTS = {
  'standard-4': { usd: 0.40, coins: 40 },
  'standard-8': { usd: 0.80, coins: 80 },
  'standard-12': { usd: 1.20, coins: 120 },
  'pro-4': { usd: 1.20, coins: 120 },
  'pro-8': { usd: 2.40, coins: 240 },
  'pro-12': { usd: 3.60, coins: 360 },
};

class OpenAIVideoProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'openai-sora';
  }

  getCost(options) {
    const quality = options.quality || 'standard';
    const duration = options.duration || 4;
    const key = `${quality}-${duration}`;
    return COSTS[key] || COSTS['standard-4'];
  }

  async generate(type, options) {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const quality = options.quality || 'standard';
    const duration = options.duration || 4;
    const resolution = quality === 'pro' ? '1080p' : '720p';

    // Sora API via OpenAI responses endpoint
    const response = await client.responses.create({
      model: quality === 'pro' ? 'sora' : 'sora',
      input: options.prompt,
      tools: [{
        type: 'video_generation',
        duration: duration,
        resolution: resolution,
      }]
    });

    // Extraire l'URL video de la reponse
    let videoUrl = null;
    for (const item of (response.output || [])) {
      if (item.type === 'video_generation_call' && item.video_url) {
        videoUrl = item.video_url;
        break;
      }
    }

    if (!videoUrl) {
      throw new Error('sora_no_video_generated');
    }

    const axios = require('axios');
    const videoResp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 });

    return {
      buffer: Buffer.from(videoResp.data),
      ext: 'mp4',
      contentType: 'video/mp4',
      metadata: {
        model: 'sora',
        duration,
        resolution,
        quality,
      }
    };
  }
}

module.exports = OpenAIVideoProvider;
