import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Audio,
  Sequence,
  Img,
} from 'remotion';
import { IntroScene } from './scenes/IntroScene';
import { BrossageScene } from './scenes/BrossageScene';
import { DroiteGaucheScene } from './scenes/DroiteGaucheScene';
import { FinalScene } from './scenes/FinalScene';
import { ProgressBar } from './elements/ProgressBar';
import { Timer } from './elements/Timer';

// ═══════════════════════════════════════
// JADOMI Studio — Vidéo Brossage Enfant
// Composition Remotion 1m30 (2700 frames @ 30fps)
// Template réutilisable par les cabinets
// ═══════════════════════════════════════

export interface BrossageEnfantProps {
  // Personnalisation cabinet
  logoUrl?: string;
  cabinetName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  // Personnalisation contenu
  mascotte?: 'dino' | 'licorne' | 'robot' | 'chat' | 'ours';
  prenomEnfant?: string;
  duree?: number; // secondes (default 90)
  langue?: 'fr' | 'en' | 'ar';
  // Assets
  mascotteUrl?: string;
  dentsSalesUrl?: string;
  dentsPropresUrl?: string;
  brosseUrl?: string;
  etoileUrl?: string;
  fondUrl?: string;
  musiqueUrl?: string;
  voixUrl?: string;
}

const DEFAULT_PROPS: BrossageEnfantProps = {
  primaryColor: '#4ECDC4',
  secondaryColor: '#FF6B6B',
  accentColor: '#FFE66D',
  mascotte: 'dino',
  cabinetName: 'Mon Dentiste',
  duree: 90,
  langue: 'fr',
};

export const BrossageEnfant: React.FC<BrossageEnfantProps> = (props) => {
  const config = { ...DEFAULT_PROPS, ...props };
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const totalFrames = config.duree! * fps;

  // Découpage scènes (en frames)
  const scenes = {
    intro:         { start: 0,            duration: 12 * fps },  // 0:00 → 0:12
    brossageHaut:  { start: 12 * fps,     duration: 23 * fps },  // 0:12 → 0:35
    brossageBas:   { start: 35 * fps,     duration: 23 * fps },  // 0:35 → 0:58
    droiteGauche:  { start: 58 * fps,     duration: 20 * fps },  // 0:58 → 1:18
    final:         { start: 78 * fps,     duration: 12 * fps },  // 1:18 → 1:30
  };

  // Progression globale 0→1
  const progress = frame / totalFrames;

  // Couleur de fond qui évolue subtilement
  const bgHue = interpolate(progress, [0, 1], [200, 160]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg,
          hsl(${bgHue}, 30%, 95%) 0%,
          hsl(${bgHue + 20}, 25%, 90%) 100%)`,
        fontFamily: "'Inter', 'Nunito', system-ui, sans-serif",
      }}
    >
      {/* Audio */}
      {config.musiqueUrl && <Audio src={config.musiqueUrl} volume={0.4} />}
      {config.voixUrl && <Audio src={config.voixUrl} volume={0.9} />}

      {/* Fond décoratif — bulles flottantes */}
      <FloatingBubbles frame={frame} color={config.primaryColor!} />

      {/* SCÈNES */}
      <Sequence from={scenes.intro.start} durationInFrames={scenes.intro.duration}>
        <IntroScene {...config} />
      </Sequence>

      <Sequence from={scenes.brossageHaut.start} durationInFrames={scenes.brossageHaut.duration}>
        <BrossageScene zone="haut" {...config} />
      </Sequence>

      <Sequence from={scenes.brossageBas.start} durationInFrames={scenes.brossageBas.duration}>
        <BrossageScene zone="bas" {...config} />
      </Sequence>

      <Sequence from={scenes.droiteGauche.start} durationInFrames={scenes.droiteGauche.duration}>
        <DroiteGaucheScene {...config} />
      </Sequence>

      <Sequence from={scenes.final.start} durationInFrames={scenes.final.duration}>
        <FinalScene {...config} />
      </Sequence>

      {/* UI persistant — Timer + ProgressBar */}
      {frame >= scenes.intro.duration && (
        <>
          <Timer
            currentFrame={frame - scenes.intro.duration}
            totalFrames={totalFrames - scenes.intro.duration}
            color={config.primaryColor!}
          />
          <ProgressBar
            progress={progress}
            primaryColor={config.primaryColor!}
            secondaryColor={config.secondaryColor!}
            accentColor={config.accentColor!}
          />
        </>
      )}
    </AbsoluteFill>
  );
};

// ═══ Bulles flottantes (fond décoratif) ═══
const FloatingBubbles: React.FC<{ frame: number; color: string }> = ({ frame, color }) => {
  const bubbles = Array.from({ length: 8 }, (_, i) => ({
    x: 10 + (i * 12) % 90,
    size: 20 + (i * 7) % 40,
    speed: 0.3 + (i * 0.1) % 0.5,
    delay: i * 0.5,
  }));

  return (
    <AbsoluteFill style={{ opacity: 0.15, pointerEvents: 'none' }}>
      {bubbles.map((b, i) => {
        const y = (100 + b.speed * frame * 0.3 + b.delay * 50) % 130 - 15;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${b.x}%`,
              bottom: `${y}%`,
              width: b.size,
              height: b.size,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${color}40, transparent)`,
              transform: `scale(${1 + Math.sin(frame * 0.02 + i) * 0.2})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
