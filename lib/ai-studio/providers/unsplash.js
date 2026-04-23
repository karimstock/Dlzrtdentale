// =============================================
// JADOMI Studio — Unsplash Stock Photos Provider
// =============================================
const AIProvider = require('./base-provider');
const axios = require('axios');

class UnsplashProvider extends AIProvider {
  constructor(apiKey) {
    super(apiKey);
    this.name = 'unsplash';
  }

  getCost() {
    return { usd: 0, coins: 0 };
  }

  async search(query, options = {}) {
    const perPage = options.per_page || 20;
    const page = options.page || 1;

    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: {
        query: query + ' dental dentist clinic',
        per_page: perPage,
        page,
        orientation: options.orientation || undefined,
      },
      headers: {
        'Authorization': `Client-ID ${this.apiKey}`,
        'Accept-Version': 'v1'
      },
      timeout: 10000
    });

    return {
      total: response.data.total,
      results: (response.data.results || []).map(photo => ({
        id: photo.id,
        url: photo.urls.regular,
        thumb: photo.urls.thumb,
        full: photo.urls.full,
        download: photo.links.download_location,
        photographer: photo.user.name,
        photographer_url: photo.user.links.html,
        alt: photo.alt_description || photo.description || query,
        width: photo.width,
        height: photo.height,
        source: 'unsplash',
      }))
    };
  }

  async trackDownload(downloadLocation) {
    // Requis par les terms Unsplash
    await axios.get(downloadLocation, {
      headers: { 'Authorization': `Client-ID ${this.apiKey}` },
      timeout: 5000
    }).catch(() => {});
  }

  async generate() {
    throw new Error('Unsplash is search-only, use search() instead');
  }
}

module.exports = UnsplashProvider;
