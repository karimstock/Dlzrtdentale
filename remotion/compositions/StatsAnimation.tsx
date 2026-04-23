/**
 * JADOMI Remotion — Stats Animation Composition
 * Passe 35 — Animated stats for social media
 * 4 seconds (120 frames @ 30fps)
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { GoldParticles } from '../elements/GoldParticles';
import { CounterAnimation } from '../elements/CounterAnimation';

export const StatsAnimation: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 15], [30, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #0a0a0f 0%, #111118 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 120px',
        gap: 80,
      }}
    >
      <GoldParticles count={60} />

      {/* Title */}
      <div
        style={{
          fontFamily: 'Syne, sans-serif',
          fontSize: 48,
          fontWeight: 800,
          color: '#ffffff',
          textAlign: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        JADOMI en chiffres
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 100,
          position: 'relative',
        }}
      >
        <CounterAnimation target={42000} label="dentistes vérifiés" delay={15} />
        <CounterAnimation target={500} label="professionnels" suffix="+" delay={25} />
        <CounterAnimation target={6} label="métiers" delay={35} />
        <CounterAnimation target={100} label="vérifié RPPS" suffix="%" delay={45} />
      </div>

      {/* Bottom watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          fontFamily: 'Syne, sans-serif',
          fontSize: 20,
          fontWeight: 700,
          color: 'rgba(201, 169, 97, 0.3)',
          letterSpacing: '0.15em',
          opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        jadomi.fr
      </div>
    </AbsoluteFill>
  );
};
