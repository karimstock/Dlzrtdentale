import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
} from 'remotion';
import type { BrossageEnfantProps } from '../index';

export const IntroScene: React.FC<BrossageEnfantProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo cabinet fade in (0→2s)
  const logoOpacity = interpolate(frame, [0, fps * 1.5], [0, 1], { extrapolateRight: 'clamp' });
  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });

  // Mascotte bounce in (1s→3s)
  const mascotteSpring = spring({
    frame: Math.max(0, frame - fps),
    fps,
    config: { damping: 8, stiffness: 120, mass: 0.8 },
  });

  // Texte "Salut !" (2s→4s)
  const textOpacity = interpolate(frame, [fps * 2, fps * 3], [0, 1], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [fps * 2, fps * 3], [20, 0], { extrapolateRight: 'clamp' });

  // Timer apparaît (4s→5s)
  const timerScale = spring({
    frame: Math.max(0, frame - fps * 4),
    fps,
    config: { damping: 10, stiffness: 150 },
  });

  // "C'est parti !" (5s→6s)
  const goOpacity = interpolate(frame, [fps * 5, fps * 5.5], [0, 1], { extrapolateRight: 'clamp' });

  // Flash transition out (11s→12s)
  const exitOpacity = interpolate(frame, [fps * 10, fps * 12], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: exitOpacity,
      }}
    >
      {/* Logo cabinet */}
      {props.logoUrl && (
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            marginBottom: 20,
          }}
        >
          <Img
            src={props.logoUrl}
            style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover' }}
          />
        </div>
      )}

      {/* Nom cabinet */}
      <div
        style={{
          opacity: logoOpacity,
          fontSize: 18,
          fontWeight: 600,
          color: props.secondaryColor || '#333',
          marginBottom: 30,
          letterSpacing: '0.05em',
        }}
      >
        {props.cabinetName}
      </div>

      {/* Mascotte */}
      {props.mascotteUrl && (
        <div
          style={{
            transform: `scale(${mascotteSpring}) translateY(${(1 - mascotteSpring) * 50}px)`,
            marginBottom: 20,
          }}
        >
          <Img
            src={props.mascotteUrl}
            style={{ width: 200, height: 200, objectFit: 'contain' }}
          />
        </div>
      )}

      {/* Texte principal */}
      <div
        style={{
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          textAlign: 'center',
          maxWidth: 500,
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: props.primaryColor,
            marginBottom: 8,
            lineHeight: 1.2,
          }}
        >
          {props.prenomEnfant
            ? `Salut ${props.prenomEnfant} !`
            : 'Salut !'}
        </div>
        <div style={{ fontSize: 22, color: '#555', fontWeight: 500 }}>
          C'est l'heure de se brosser les dents !
        </div>
      </div>

      {/* Timer preview */}
      <div
        style={{
          marginTop: 30,
          transform: `scale(${timerScale})`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(255,255,255,0.8)',
          padding: '12px 24px',
          borderRadius: 50,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}
      >
        <span style={{ fontSize: 28 }}>&#x23F3;</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: props.primaryColor }}>
          1:30
        </span>
      </div>

      {/* C'est parti ! */}
      <div
        style={{
          marginTop: 20,
          opacity: goOpacity,
          fontSize: 28,
          fontWeight: 800,
          color: props.secondaryColor,
          transform: `scale(${1 + Math.sin(frame * 0.15) * 0.05})`,
        }}
      >
        Tu es pr&ecirc;t ? C'est parti ! &#x1F680;
      </div>
    </AbsoluteFill>
  );
};
