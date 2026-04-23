// =============================================
// JADOMI Studio — Base AI Provider
// Interface commune pour tous les providers IA
// =============================================

class AIProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.name = 'base';
  }

  async isAvailable() {
    return !!this.apiKey;
  }

  async generate(type, options) {
    throw new Error('Not implemented');
  }

  getCost(options) {
    throw new Error('Not implemented');
  }
}

module.exports = AIProvider;
