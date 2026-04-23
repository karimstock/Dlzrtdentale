// =============================================
// JADOMI Studio — HeyGen Avatar Provider
// =============================================
const AIProvider = require('./base-provider');
const axios = require('axios');

class HeyGenProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'heygen';
  }

  getCost(options) {
    // Estimation basee sur duree texte (~150 mots/min, ~750 chars/min)
    const charCount = (options.text || '').length;
    const estimatedSeconds = Math.max(10, Math.ceil(charCount / 12.5));
    const usd = estimatedSeconds * 0.50;
    const coins = Math.max(200, Math.ceil(usd / 0.08));
    return { usd: Math.round(usd * 100) / 100, coins };
  }

  async generate(type, options) {
    const avatarId = options.avatar_id || 'default';
    const text = options.text;
    const voiceId = options.voice_id;

    if (!text || text.length < 5) throw new Error('Text is required (min 5 chars)');

    // Creer la video
    const createResp = await axios.post(
      'https://api.heygen.com/v2/video/generate',
      {
        video_inputs: [{
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: text,
            voice_id: voiceId || undefined,
          },
          background: {
            type: 'color',
            value: '#1a1a1f',
          }
        }],
        dimension: { width: 1280, height: 720 },
      },
      {
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const videoId = createResp.data?.data?.video_id;
    if (!videoId) throw new Error('heygen_video_creation_failed');

    // Polling pour attendre la generation
    let videoUrl = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusResp = await axios.get(
        `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
        { headers: { 'X-Api-Key': this.apiKey }, timeout: 10000 }
      );
      const status = statusResp.data?.data?.status;
      if (status === 'completed') {
        videoUrl = statusResp.data?.data?.video_url;
        break;
      }
      if (status === 'failed') {
        throw new Error('heygen_video_generation_failed');
      }
    }

    if (!videoUrl) throw new Error('heygen_timeout');

    const videoResp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 });

    return {
      buffer: Buffer.from(videoResp.data),
      ext: 'mp4',
      contentType: 'video/mp4',
      metadata: {
        model: 'heygen-v2',
        avatar_id: avatarId,
        video_id: videoId,
        char_count: text.length,
      }
    };
  }

  async listAvatars() {
    const response = await axios.get('https://api.heygen.com/v2/avatars', {
      headers: { 'X-Api-Key': this.apiKey },
      timeout: 10000
    });
    return (response.data?.data?.avatars || []).map(a => ({
      id: a.avatar_id,
      name: a.avatar_name,
      preview: a.preview_image_url,
    }));
  }
}

module.exports = HeyGenProvider;
