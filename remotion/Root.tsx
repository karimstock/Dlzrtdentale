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
import { TourneesLivreurDemo } from './compositions/TourneesLivreurDemo';
import { TourneesPub } from './compositions/TourneesPub';
import { Prothesiste13Features } from './compositions/Prothesiste13Features';
import { BrossageEnfant } from './compositions/BrossageEnfant';
import { BrossageClipFinal } from './compositions/BrossageClipFinal';
import { JADOMI_CONFIG } from './config';

export const Root: React.FC = () => {
  return (
    <>
      {/* JADOMI Studio — Clip Brossage Final (Vidu + chanson + lip-sync) */}
      <Composition
        id="BrossageClipFinal"
        component={BrossageClipFinal}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          assetsBase: '/studio/assets/brossage',
          cabinetName: 'Mon Dentiste',
        }}
      />

      {/* JADOMI Studio — Vidéo Brossage Enfant 1m30 */}
      <Composition
        id="BrossageEnfant"
        component={BrossageEnfant}
        durationInFrames={2700}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          primaryColor: '#4ECDC4',
          secondaryColor: '#FF6B6B',
          accentColor: '#FFE66D',
          mascotte: 'dino',
          cabinetName: 'Mon Dentiste',
          duree: 90,
          langue: 'fr',
          mascotteUrl: '/studio/assets/mascottes/mascotte-dino.png',
        }}
      />
      <Composition
        id="BrossageEnfantHorizontal"
        component={BrossageEnfant}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          primaryColor: '#4ECDC4',
          secondaryColor: '#FF6B6B',
          accentColor: '#FFE66D',
          mascotte: 'dino',
          cabinetName: 'Mon Dentiste',
          duree: 90,
          langue: 'fr',
          mascotteUrl: '/studio/assets/mascottes/mascotte-dino.png',
        }}
      />
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
      <Composition
        id="TourneesPub"
        component={TourneesPub}
        durationInFrames={1455}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Prothesiste13Features"
        component={Prothesiste13Features}
        durationInFrames={1198}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TourneesLivreurDemo"
        component={TourneesLivreurDemo}
        durationInFrames={1920}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
