// =============================================
// JADOMI Studio — OpenAI TTS Provider
// =============================================
const AIProvider = require('./base-provider');

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

class OpenAITTSProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'openai-tts';
  }

  getCost(options) {
    const charCount = (options.text || '').length;
    const costPer1k = 0.015;
    const usd = Math.ceil(charCount / 1000) * costPer1k;
    const coins = Math.max(10, Math.ceil(usd / 0.08));
    return { usd: Math.round(usd * 10000) / 10000, coins };
  }

  async generate(type, options) {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const voice = VOICES.includes(options.voice) ? options.voice : 'nova';

    const response = await client.audio.speech.create({
      model: 'tts-1-hd',
      voice: voice,
      input: options.text,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      buffer,
      ext: 'mp3',
      contentType: 'audio/mpeg',
      metadata: {
        model: 'tts-1-hd',
        voice,
        char_count: (options.text || '').length,
      }
    };
  }
}

module.exports = OpenAITTSProvider;
module.exports.VOICES = VOICES;
