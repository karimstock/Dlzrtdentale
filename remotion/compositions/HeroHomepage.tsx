/**
 * JADOMI Remotion — Hero Homepage Composition
 * Passe 35 — 5 second hero animation (150 frames @ 30fps)
 * Resolution: 1920x1080
 */

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { JadomiLogo } from '../elements/JadomiLogo';
import { GoldParticles } from '../elements/GoldParticles';
import { TextReveal } from '../elements/TextReveal';
import { CounterAnimation } from '../elements/CounterAnimation';

export const HeroHomepage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bgOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #0a0a0f 0%, #1a1015 100%)',
      }}
    >
      {/* Gold particles background */}
      <GoldParticles count={150} />

      {/* Phase 1: Logo reveal (frames 0-30) */}
      <Sequence from={0} durationInFrames={45}>
        <JadomiLogo progress={Math.min(frame / 30, 1)} />
      </Sequence>

      {/* Phase 2: Tagline text reveal (frames 30-90) */}
      <Sequence from={30} durationInFrames={60}>
        <TextReveal
          text="Votre métier mérite un outil à sa hauteur"
          frame={frame - 30}
          fontSize={64}
        />
      </Sequence>

      {/* Phase 3: Stats counters (frames 90-150) */}
      <Sequence from={90} durationInFrames={60}>
        <AbsoluteFill
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 120,
          }}
        >
          <CounterAnimation target={500} label="professionnels" suffix="+" delay={0} />
          <CounterAnimation target={6} label="métiers" delay={10} />
          <CounterAnimation target={100} label="vérifié RPPS" suffix="%" delay={20} />
        </AbsoluteFill>
      </Sequence>

      {/* Bottom gradient */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          background: 'linear-gradient(to top, #0a0a0f, transparent)',
        }}
      />
    </AbsoluteFill>
  );
};
