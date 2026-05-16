import React from 'react';
import { interpolate, Easing } from 'remotion';

// ═══════════════════════════════════════════════════
// Paroles karaoké — Texte synchronisé avec la chanson
// Style enfantin avec animations fluides
// ═══════════════════════════════════════════════════

interface ParolesProps {
  lyrics: Array<{ from: number; to: number; text: string }>;
  currentTime: number;
  fps: number;
  frame: number;
}

const COLORS = [
  '#FF6B6B', // rouge corail
  '#4ECDC4', // turquoise
  '#FFE66D', // jaune
  '#A78BFA', // violet
  '#FF9EC7', // rose
  '#6BCB77', // vert
];

export const Paroles: React.FC<ParolesProps> = ({
  lyrics,
  currentTime,
  fps,
  frame,
}) => {
  // Trouver la parole active
  const activeLyric = lyrics.find(
    (l) => currentTime >= l.from - 0.3 && currentTime <= l.to + 0.1
  );

  if (!activeLyric) return null;

  const lyricIndex = lyrics.indexOf(activeLyric);
  const color = COLORS[lyricIndex % COLORS.length];

  // Progression dans cette ligne (0→1)
  const progress = interpolate(
    currentTime,
    [activeLyric.from, activeLyric.to],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Fade in
  const fadeIn = interpolate(
    currentTime,
    [activeLyric.from - 0.3, activeLyric.from],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Fade out
  const fadeOut = interpolate(
    currentTime,
    [activeLyric.to - 0.3, activeLyric.to + 0.1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Scale bounce à l'entrée
  const scale = interpolate(
    currentTime,
    [activeLyric.from - 0.3, activeLyric.from, activeLyric.from + 0.2],
    [0.7, 1.05, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Petit rebond vertical
  const translateY = interpolate(
    currentTime,
    [activeLyric.from - 0.3, activeLyric.from, activeLyric.from + 0.15],
    [15, -3, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 200,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
        opacity: fadeIn * fadeOut,
        transform: `scale(${scale}) translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(15px)',
          borderRadius: 25,
          padding: '14px 30px',
          maxWidth: '85%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Barre de progression karaoké */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            background: `${color}30`,
            borderRadius: 25,
            transition: 'width 0.1s linear',
          }}
        />

        {/* Texte */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#fff',
            textAlign: 'center',
            fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
            textShadow: `0 0 20px ${color}80, 0 2px 4px rgba(0,0,0,0.3)`,
            position: 'relative',
            zIndex: 1,
            letterSpacing: '0.5px',
          }}
        >
          {activeLyric.text}
        </div>
      </div>
    </div>
  );
};
