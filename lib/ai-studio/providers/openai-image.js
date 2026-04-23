// =============================================
// JADOMI Studio — OpenAI DALL-E 3 Image Provider
// =============================================
const AIProvider = require('./base-provider');

const COSTS = {
  'standard-1024x1024': { usd: 0.04, coins: 30 },
  'standard-1792x1024': { usd: 0.08, coins: 50 },
  'standard-1024x1792': { usd: 0.08, coins: 50 },
  'hd-1024x1024': { usd: 0.08, coins: 50 },
  'hd-1792x1024': { usd: 0.12, coins: 80 },
  'hd-1024x1792': { usd: 0.12, coins: 80 },
  'luxury-1024x1024': { usd: 0.12, coins: 100 },
  'luxury-1792x1024': { usd: 0.12, coins: 100 },
};

class OpenAIImageProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'openai-dalle3';
  }

  getCost(options) {
    const quality = options.quality || 'standard';
    const size = options.size || '1024x1024';
    const key = `${quality}-${size}`;
    return COSTS[key] || COSTS['standard-1024x1024'];
  }

  async generate(type, options) {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const quality = options.quality === 'luxury' ? 'hd' : (options.quality || 'standard');
    const size = options.size || '1024x1024';

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: options.prompt,
      n: 1,
      size: size,
      quality: quality,
      response_format: 'url',
    });

    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;

    // Telecharger l'image pour upload R2
    const axios = require('axios');
    const imageResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });

    return {
      buffer: Buffer.from(imageResp.data),
      ext: 'png',
      contentType: 'image/png',
      metadata: {
        revised_prompt: revisedPrompt,
        model: 'dall-e-3',
        size,
        quality: options.quality || 'standard',
      }
    };
  }
}

module.exports = OpenAIImageProvider;
