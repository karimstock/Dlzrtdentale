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

export const DroiteGaucheScene: React.FC<BrossageEnfantProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = interpolate(frame, [0, 20 * fps], [0, 1], { extrapolateRight: 'clamp' });

  // Phase 1: droite/gauche (0→12s)
  // Phase 2: langue (12s→18s)
  // Phase 3: récompense (18s→20s)
  const phase = frame < 12 * fps ? 'cotes' : frame < 18 * fps ? 'langue' : 'reward';

  // Brosse qui va de droite à gauche
  const brosseAngle = phase === 'cotes' ? Math.sin(frame * 0.15) * 40 : 0;
  const brosseX = phase === 'cotes' ? Math.sin(frame * 0.1) * 80 : 0;

  // Langue animation (fun)
  const langueScale = phase === 'langue'
    ? spring({ frame: frame - 12 * fps, fps, config: { damping: 6, stiffness: 80 } })
    : 0;

  // Textes par phase
  const getText = () => {
    if (phase === 'cotes') {
      const sub = Math.floor((frame / fps) % 4);
      return ['À droite !', 'À gauche !', 'Encore une fois !', 'Pour des dents comme il faut !'][sub];
    }
    if (phase === 'langue') return 'Et la langue ! Blaaaa !';
    return 'Presque fini !';
  };

  // Étoiles accumulées
  const stars = phase === 'reward' ? 3 : phase === 'langue' ? 2 : Math.floor(progress * 2);

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Titre */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          textAlign: 'center',
          width: '100%',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: props.primaryColor, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          {phase === 'cotes' ? 'Les côtés' : phase === 'langue' ? 'La langue' : 'Presque fini !'}
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#333' }}>
          {getText()}
        </div>
      </div>

      {/* Mâchoire vue de face avec côtés */}
      {phase === 'cotes' && (
        <div style={{ position: 'relative' }}>
          {/* Arcade dentaire simplifiée */}
          <div
            style={{
              width: 280,
              height: 200,
              borderRadius: '50% 50% 40% 40%',
              border: `4px solid ${props.primaryColor}40`,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Indicateur zone brossée */}
            <div
              style={{
                position: 'absolute',
                width: '40%',
                height: '80%',
                background: `${props.primaryColor}15`,
                borderRadius: 20,
                left: brosseAngle > 0 ? '55%' : '5%',
                transition: 'left 0.5s',
              }}
            />

            {/* Dents en U */}
            {Array.from({ length: 14 }, (_, i) => {
              const angle = -90 + (i / 13) * 180;
              const rad = (angle * Math.PI) / 180;
              const x = 120 * Math.cos(rad);
              const y = 80 * Math.sin(rad);
              const toothClean = interpolate(progress, [i * 0.05, i * 0.05 + 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${x}px - 12px)`,
                    top: `calc(50% + ${y}px - 15px)`,
                    width: 24,
                    height: 30,
                    borderRadius: '8px 8px 6px 6px',
                    background: `hsl(0, 0%, ${interpolate(toothClean, [0, 1], [85, 98])}%)`,
                    boxShadow: toothClean > 0.5 ? `0 0 8px rgba(255,255,255,0.6)` : '0 1px 4px rgba(0,0,0,0.1)',
                    transform: `rotate(${angle + 90}deg)`,
                  }}
                />
              );
            })}
          </div>

          {/* Brosse */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `calc(50% + ${brosseX}px)`,
              transform: `translate(-50%, -50%) rotate(${brosseAngle}deg)`,
              fontSize: 44,
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))',
            }}
          >
            &#x1FAA5;
          </div>
        </div>
      )}

      {/* Langue phase */}
      {phase === 'langue' && (
        <div
          style={{
            transform: `scale(${langueScale})`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 120,
              transform: `rotate(${Math.sin(frame * 0.1) * 10}deg)`,
            }}
          >
            &#x1F61B;
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 22,
              fontWeight: 700,
              color: props.secondaryColor,
            }}
          >
            Blaaaa !
          </div>
        </div>
      )}

      {/* Étoiles accumulées */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          display: 'flex',
          gap: 8,
        }}
      >
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            style={{
              fontSize: 36,
              opacity: i < stars ? 1 : 0.2,
              transform: i < stars ? `scale(1) rotate(${Math.sin(frame * 0.05 + i) * 10}deg)` : 'scale(0.8)',
              transition: 'all 0.3s',
            }}
          >
            &#x2B50;
          </div>
        ))}
      </div>

      {/* Mascotte */}
      {props.mascotteUrl && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            right: 30,
            transform: `translateY(${Math.sin(frame * 0.08) * 6}px)`,
          }}
        >
          <Img src={props.mascotteUrl} style={{ width: 100, height: 100, objectFit: 'contain' }} />
        </div>
      )}
    </AbsoluteFill>
  );
};
