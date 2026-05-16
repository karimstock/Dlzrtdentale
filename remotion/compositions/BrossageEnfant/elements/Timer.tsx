import React from 'react';
import { interpolate } from 'remotion';

interface TimerProps {
  currentFrame: number;
  totalFrames: number;
  color: string;
}

export const Timer: React.FC<TimerProps> = ({ currentFrame, totalFrames, color }) => {
  // Temps restant en secondes
  const elapsed = currentFrame / 30; // 30fps
  const total = totalFrames / 30;
  const remaining = Math.max(0, total - elapsed);

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Progrès du sablier
  const progress = elapsed / total;

  // Sablier SVG animé
  const sandHeight = interpolate(progress, [0, 1], [0, 100]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        right: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(10px)',
        padding: '8px 16px',
        borderRadius: 30,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}
    >
      {/* Mini sablier SVG */}
      <svg width="20" height="24" viewBox="0 0 20 24">
        {/* Contour sablier */}
        <path
          d="M2 2 L18 2 L12 12 L18 22 L2 22 L8 12 Z"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Sable en bas (se remplit) */}
        <clipPath id="sandClip">
          <path d="M2 22 L18 22 L12 12 L8 12 Z" />
        </clipPath>
        <rect
          x="2"
          y={22 - sandHeight * 0.1}
          width="16"
          height={sandHeight * 0.1}
          fill={color}
          clipPath="url(#sandClip)"
          opacity="0.6"
        />
        {/* Sable en haut (se vide) */}
        <clipPath id="topClip">
          <path d="M2 2 L18 2 L12 12 L8 12 Z" />
        </clipPath>
        <rect
          x="2"
          y="2"
          width="16"
          height={(1 - progress) * 10}
          fill={color}
          clipPath="url(#topClip)"
          opacity="0.4"
        />
      </svg>

      {/* Temps */}
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: remaining < 10 ? '#FF6B6B' : color,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.05em',
        }}
      >
        {display}
      </span>
    </div>
  );
};
