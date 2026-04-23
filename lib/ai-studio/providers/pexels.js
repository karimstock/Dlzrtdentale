// =============================================
// JADOMI Studio — Pexels Stock Videos Provider
// =============================================
const AIProvider = require('./base-provider');
const axios = require('axios');

class PexelsProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'pexels';
  }

  getCost() {
    return { usd: 0, coins: 0 };
  }

  async searchVideos(query, options = {}) {
    const perPage = options.per_page || 20;
    const page = options.page || 1;

    const response = await axios.get('https://api.pexels.com/videos/search', {
      params: {
        query: query + ' dental dentist',
        per_page: perPage,
        page,
        orientation: options.orientation || undefined,
        size: options.size || undefined,
      },
      headers: { 'Authorization': this.apiKey },
      timeout: 10000
    });

    return {
      total: response.data.total_results,
      results: (response.data.videos || []).map(video => {
        const bestFile = video.video_files
          .filter(f => f.quality === 'hd' || f.quality === 'sd')
          .sort((a, b) => (b.width || 0) - (a.width || 0))[0] || video.video_files[0];
        return {
          id: video.id,
          url: bestFile ? bestFile.link : null,
          thumb: video.image,
          duration: video.duration,
          width: bestFile ? bestFile.width : null,
          height: bestFile ? bestFile.height : null,
          photographer: video.user.name,
          photographer_url: video.user.url,
          source: 'pexels',
        };
      })
    };
  }

  async searchPhotos(query, options = {}) {
    const perPage = options.per_page || 20;
    const page = options.page || 1;

    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: {
        query: query + ' dental',
        per_page: perPage,
        page,
      },
      headers: { 'Authorization': this.apiKey },
      timeout: 10000
    });

    return {
      total: response.data.total_results,
      results: (response.data.photos || []).map(photo => ({
        id: photo.id,
        url: photo.src.large2x,
        thumb: photo.src.medium,
        photographer: photo.photographer,
        photographer_url: photo.photographer_url,
        alt: photo.alt || query,
        width: photo.width,
        height: photo.height,
        source: 'pexels',
      }))
    };
  }

  async generate() {
    throw new Error('Pexels is search-only, use searchVideos() or searchPhotos()');
  }
}

module.exports = PexelsProvider;
