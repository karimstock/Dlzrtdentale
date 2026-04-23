/**
 * JADOMI Logo Element for Remotion
 */

import React from 'react';
import { interpolate } from 'remotion';

interface JadomiLogoProps {
  progress: number;
}

export const JadomiLogo: React.FC<JadomiLogoProps> = ({ progress }) => {
  const opacity = interpolate(progress, [0, 0.5, 1], [0, 1, 1]);
  const scale = interpolate(progress, [0, 0.5, 1], [0.8, 1.05, 1]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: 'Syne, sans-serif',
          fontSize: 120,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #c9a961 20%, #e8c77b 50%, #c9a961 80%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        JADOMI
      </span>
    </div>
  );
};
