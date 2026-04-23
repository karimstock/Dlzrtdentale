/**
 * JADOMI Remotion Configuration
 * Passe 35 — Video generation settings
 */

export const JADOMI_CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 150, // 5 seconds default

  colors: {
    background: '#0a0a0f',
    backgroundAlt: '#111118',
    gold: '#c9a961',
    goldLight: '#e8c77b',
    text: '#f4f6f8',
    textMuted: '#8a8a9a',
  },

  fonts: {
    display: 'Syne, sans-serif',
    body: 'Inter, sans-serif',
  },

  templates: {
    heroHomepage: {
      id: 'HeroHomepage',
      durationInFrames: 150,
      title: 'Hero Homepage JADOMI',
    },
    adTemplate: {
      id: 'AdTemplate',
      durationInFrames: 180, // 6 seconds
      title: 'Ad Template Annonceur',
    },
    statsAnimation: {
      id: 'StatsAnimation',
      durationInFrames: 120, // 4 seconds
      title: 'Stats Animation',
    },
  },
};
