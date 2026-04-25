/**
 * JADOMI Remotion Root
 * Passe 35 — Registers all video compositions
 */

import React from 'react';
import { Composition } from 'remotion';
import { HeroHomepage } from './compositions/HeroHomepage';
import { AdTemplate } from './compositions/AdTemplate';
import { StatsAnimation } from './compositions/StatsAnimation';
import { DentistDemo } from './compositions/DentistDemo';
import { JADOMI_CONFIG } from './config';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="HeroHomepage"
        component={HeroHomepage}
        durationInFrames={JADOMI_CONFIG.templates.heroHomepage.durationInFrames}
        fps={JADOMI_CONFIG.fps}
        width={JADOMI_CONFIG.width}
        height={JADOMI_CONFIG.height}
      />
      <Composition
        id="AdTemplate"
        component={AdTemplate}
        durationInFrames={JADOMI_CONFIG.templates.adTemplate.durationInFrames}
        fps={JADOMI_CONFIG.fps}
        width={JADOMI_CONFIG.width}
        height={JADOMI_CONFIG.height}
        defaultProps={{
          title: 'Formation Implantologie',
          price: '1 500 EUR',
          duration: '3 jours',
          location: 'Paris',
          logoUrl: '',
          brandColor: '#c9a961',
          ctaText: "S'inscrire",
        }}
      />
      <Composition
        id="StatsAnimation"
        component={StatsAnimation}
        durationInFrames={JADOMI_CONFIG.templates.statsAnimation.durationInFrames}
        fps={JADOMI_CONFIG.fps}
        width={JADOMI_CONFIG.width}
        height={JADOMI_CONFIG.height}
      />
      <Composition
        id="DentistDemo"
        component={DentistDemo}
        durationInFrames={525}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
