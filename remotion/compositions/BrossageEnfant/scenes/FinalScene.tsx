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

export const FinalScene: React.FC<BrossageEnfantProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Refrain (0→6s)
  // Phase 2: Bravo + confettis (6s→10s)
  // Phase 3: Logo + à demain (10s→12s)
  const phase = frame < 6 * fps ? 'refrain' : frame < 10 * fps ? 'bravo' : 'outro';

  // Jauge complète
  const jaugeWidth = spring({ frame, fps, config: { damping: 15, stiffness: 60 } });

  // Bravo scale
  const bravoScale = spring({
    frame: Math.max(0, frame - 6 * fps),
    fps,
    config: { damping: 6, stiffness: 120, mass: 0.6 },
  });

  // Confettis
  const confettiActive = frame >= 6 * fps && frame < 10 * fps;
  const confettis = confettiActive
    ? Array.from({ length: 30 }, (_, i) => ({
        x: Math.sin(i * 2.4) * 50 + 50,
        y: ((frame - 6 * fps) * (1 + (i % 4) * 0.5) * 0.8 + i * 10) % 120 - 10,
        color: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8C94', '#C9A84C'][i % 6],
        size: 6 + (i % 3) * 4,
        rotation: frame * (2 + i % 5),
      }))
    : [];

  // Logo fade in
  const logoOpacity = interpolate(frame, [10 * fps, 11 * fps], [0, 1], { extrapolateRight: 'clamp' });

  // Texte refrain
  const refrainLines = [
    'Brosse brosse matin et soir,',
    'Pour des dents pleines d\'espoir,',
    'Blanches, propres, qui brillent fort,',
    'Comme un trésor en or !',
  ];
  const currentLine = Math.min(
    Math.floor(interpolate(frame, [0, 5.5 * fps], [0, 4], { extrapolateRight: 'clamp' })),
    3
  );

  // Dents qui brillent
  const sparkleIntensity = interpolate(frame, [0, 6 * fps], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Confettis */}
      {confettis.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${c.x}%`,
            top: `${c.y}%`,
            width: c.size,
            height: c.size * 0.6,
            background: c.color,
            borderRadius: 2,
            transform: `rotate(${c.rotation}deg)`,
            opacity: 0.9,
          }}
        />
      ))}

      {/* Phase Refrain */}
      {phase === 'refrain' && (
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          {/* Dents brillantes en haut */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 24 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 35,
                  height: 45,
                  borderRadius: '10px 10px 6px 6px',
                  background: `linear-gradient(180deg, #fff 0%, #f0f0f0 100%)`,
                  boxShadow: `0 0 ${sparkleIntensity * 20}px rgba(255,255,255,0.8), 0 0 ${sparkleIntensity * 10}px ${props.accentColor}60`,
                  transform: `scale(${1 + Math.sin(frame * 0.1 + i * 0.5) * 0.05})`,
                }}
              />
            ))}
          </div>

          {/* Paroles */}
          {refrainLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: i <= currentLine ? 28 : 22,
                fontWeight: i <= currentLine ? 800 : 400,
                color: i <= currentLine ? props.primaryColor : '#ccc',
                marginBottom: 8,
                transform: i === currentLine ? `scale(1.05)` : 'scale(1)',
                transition: 'all 0.3s',
                lineHeight: 1.4,
              }}
            >
              {i === currentLine ? `♪ ${line}` : line}
            </div>
          ))}
        </div>
      )}

      {/* Phase Bravo */}
      {phase === 'bravo' && (
        <div
          style={{
            textAlign: 'center',
            transform: `scale(${bravoScale})`,
          }}
        >
          {/* Pouce */}
          <div style={{ fontSize: 100, marginBottom: 16 }}>
            &#x1F44D;
          </div>

          {/* BRAVO */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              background: `linear-gradient(135deg, ${props.primaryColor}, ${props.accentColor}, ${props.secondaryColor})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '0.05em',
              transform: `rotate(${Math.sin(frame * 0.1) * 3}deg)`,
            }}
          >
            BRAVO !
          </div>

          {/* Sourire */}
          <div style={{ fontSize: 60, marginTop: 12 }}>
            &#x1F601;
          </div>

          {/* 3 étoiles */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  fontSize: 44,
                  transform: `rotate(${Math.sin(frame * 0.08 + i * 2) * 15}deg) scale(${1 + Math.sin(frame * 0.1 + i) * 0.1})`,
                }}
              >
                &#x2B50;
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase Outro */}
      {phase === 'outro' && (
        <div
          style={{
            textAlign: 'center',
            opacity: logoOpacity,
          }}
        >
          {props.logoUrl && (
            <Img
              src={props.logoUrl}
              style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', marginBottom: 16 }}
            />
          )}
          <div style={{ fontSize: 20, fontWeight: 600, color: '#555', marginBottom: 8 }}>
            {props.cabinetName}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: props.primaryColor,
            }}
          >
            À demain pour un nouveau brossage !
          </div>
          <div style={{ fontSize: 40, marginTop: 12 }}>
            &#x1F44B;
          </div>
        </div>
      )}

      {/* Jauge finale VERTE */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: 30,
          right: 30,
          height: 12,
          borderRadius: 6,
          background: 'rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${jaugeWidth * 100}%`,
            height: '100%',
            borderRadius: 6,
            background: `linear-gradient(90deg, ${props.primaryColor}, #4DCE7B)`,
            boxShadow: '0 0 12px rgba(77,206,123,0.4)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
