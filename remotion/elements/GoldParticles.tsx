/**
 * Gold Particles Element for Remotion
 * Renders floating gold dots
 */

import React, { useMemo } from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface GoldParticlesProps {
  count?: number;
}

export const GoldParticles: React.FC<GoldParticlesProps> = ({ count = 100 }) => {
  const frame = useCurrentFrame();

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.5 + 0.1,
      phase: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.5 + 0.1,
    }));
  }, [count]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {particles.map((p, i) => {
        const y = (p.y + frame * p.speed * 0.3) % 100;
        const pulse = Math.sin(frame * 0.05 + p.phase) * 0.3 + 0.7;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              backgroundColor: '#c9a961',
              opacity: p.opacity * pulse,
            }}
          />
        );
      })}
    </div>
  );
};
