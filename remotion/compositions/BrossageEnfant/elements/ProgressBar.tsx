import React from 'react';
import { interpolate } from 'remotion';

interface ProgressBarProps {
  progress: number; // 0→1
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  primaryColor,
  secondaryColor,
  accentColor,
}) => {
  // Couleur qui évolue : rouge → orange → jaune → vert
  const hue = interpolate(progress, [0, 0.33, 0.66, 1], [0, 30, 55, 130]);
  const barColor = `hsl(${hue}, 70%, 55%)`;

  // Largeur
  const width = `${Math.min(progress * 100, 100)}%`;

  // Étoiles gagnées
  const stars = progress < 0.33 ? 0 : progress < 0.66 ? 1 : progress < 0.9 ? 2 : 3;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 24,
        right: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Barre */}
      <div
        style={{
          flex: 1,
          height: 14,
          borderRadius: 7,
          background: 'rgba(0,0,0,0.06)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width,
            height: '100%',
            borderRadius: 7,
            background: `linear-gradient(90deg, ${secondaryColor}, ${barColor})`,
            boxShadow: `0 0 12px ${barColor}60`,
            transition: 'width 0.5s ease-out',
          }}
        />
        {/* Particules sur la barre */}
        {progress > 0.1 && (
          <div
            style={{
              position: 'absolute',
              right: `${100 - progress * 100}%`,
              top: -2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'white',
              boxShadow: `0 0 8px ${barColor}`,
              border: `2px solid ${barColor}`,
            }}
          />
        )}
      </div>

      {/* Étoiles */}
      <div style={{ display: 'flex', gap: 2 }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              fontSize: 20,
              opacity: i < stars ? 1 : 0.2,
              filter: i < stars ? 'none' : 'grayscale(1)',
            }}
          >
            &#x2B50;
          </span>
        ))}
      </div>
    </div>
  );
};
