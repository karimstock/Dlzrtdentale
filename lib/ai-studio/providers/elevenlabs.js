// =============================================
// JADOMI Studio — ElevenLabs Voice Provider
// =============================================
const AIProvider = require('./base-provider');
const axios = require('axios');

class ElevenLabsProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'elevenlabs';
  }

  getCost(options) {
    const charCount = (options.text || '').length;
    const costPer1k = 0.30;
    const usd = Math.ceil(charCount / 1000) * costPer1k;
    const coins = Math.max(30, Math.ceil(usd / 0.08));
    return { usd: Math.round(usd * 10000) / 10000, coins };
  }

  async generate(type, options) {
    const voiceId = options.voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel default
    const text = options.text;

    if (!text || text.length < 1) throw new Error('Text is required');
    if (text.length > 5000) throw new Error('Text too long (max 5000 chars)');

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer',
        timeout: 60000
      }
    );

    return {
      buffer: Buffer.from(response.data),
      ext: 'mp3',
      contentType: 'audio/mpeg',
      metadata: {
        model: 'eleven_multilingual_v2',
        voice_id: voiceId,
        char_count: text.length,
      }
    };
  }

  async listVoices() {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': this.apiKey },
      timeout: 10000
    });
    return (response.data.voices || []).map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      preview_url: v.preview_url,
    }));
  }
}

module.exports = ElevenLabsProvider;
