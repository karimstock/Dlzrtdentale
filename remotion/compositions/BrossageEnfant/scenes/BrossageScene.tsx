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

interface BrossageSceneProps extends BrossageEnfantProps {
  zone: 'haut' | 'bas';
}

export const BrossageScene: React.FC<BrossageSceneProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isHaut = props.zone === 'haut';

  // Entrée de la scène
  const enterScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });

  // Oscillation de la brosse (mouvement de brossage)
  const brosseX = Math.sin(frame * 0.3) * 30;
  const brosseY = Math.cos(frame * 0.2) * 5;

  // Progression du nettoyage (0→1 sur la durée de la scène)
  const cleanProgress = interpolate(frame, [0, 23 * fps], [0, 1], { extrapolateRight: 'clamp' });

  // Plaque qui disparaît
  const plaqueOpacity = interpolate(cleanProgress, [0, 0.8], [0.7, 0], { extrapolateRight: 'clamp' });

  // Sparkles qui apparaissent
  const sparkleOpacity = interpolate(cleanProgress, [0.3, 0.7], [0, 1], { extrapolateRight: 'clamp' });

  // Étoile reward à 80% de progression
  const starScale = spring({
    frame: Math.max(0, frame - 19 * fps),
    fps,
    config: { damping: 8, stiffness: 200 },
  });

  // Texte chanson
  const lyrics = isHaut
    ? ['Je brosse en haut !', 'Tout doucement...', 'Chaque dent qui brille !', 'Super !']
    : ['Je brosse en bas !', 'Mes dents comptent sur moi !', 'En rond, en rond...', 'Champion !'];

  const lyricIndex = Math.min(Math.floor(cleanProgress * lyrics.length), lyrics.length - 1);

  // Mascotte position
  const mascotteY = Math.sin(frame * 0.08) * 8;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${enterScale})`,
      }}
    >
      {/* Zone titre */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          textAlign: 'center',
          width: '100%',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: props.primaryColor,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 4,
          }}
        >
          {isHaut ? 'Les dents du haut' : 'Les dents du bas'}
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#333',
            transition: 'all 0.3s',
          }}
        >
          {lyrics[lyricIndex]}
        </div>
      </div>

      {/* Dents */}
      <div style={{ position: 'relative', marginTop: 20 }}>
        {/* Rangée de dents stylisées */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            transform: isHaut ? 'none' : 'scaleY(-1)',
          }}
        >
          {Array.from({ length: 8 }, (_, i) => {
            const toothClean = interpolate(
              cleanProgress,
              [i * 0.1, i * 0.1 + 0.3],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            );

            return (
              <div
                key={i}
                style={{
                  width: 45,
                  height: 60,
                  borderRadius: '12px 12px 8px 8px',
                  background: `linear-gradient(180deg,
                    hsl(${interpolate(toothClean, [0, 1], [45, 0])},
                        ${interpolate(toothClean, [0, 1], [60, 0])}%,
                        ${interpolate(toothClean, [0, 1], [85, 98])}%) 0%,
                    hsl(0, 0%, ${interpolate(toothClean, [0, 1], [80, 95])}%) 100%)`,
                  boxShadow: toothClean > 0.5
                    ? `0 0 ${toothClean * 15}px rgba(255,255,255,0.5)`
                    : '0 2px 8px rgba(0,0,0,0.1)',
                  transition: 'box-shadow 0.3s',
                  position: 'relative',
                  transform: `scale(${1 + Math.sin(frame * 0.1 + i) * 0.03})`,
                }}
              >
                {/* Plaque */}
                {toothClean < 0.8 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 4,
                      borderRadius: 8,
                      background: `rgba(200, 180, 50, ${(1 - toothClean) * 0.3})`,
                    }}
                  />
                )}

                {/* Sparkle */}
                {toothClean > 0.7 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -5,
                      fontSize: 16,
                      opacity: sparkleOpacity,
                      transform: `rotate(${frame * 3}deg)`,
                    }}
                  >
                    &#x2728;
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Brosse à dents animée */}
        <div
          style={{
            position: 'absolute',
            top: isHaut ? -30 : 40,
            left: `calc(50% + ${brosseX}px - 20px)`,
            transform: `translateY(${brosseY}px) rotate(${isHaut ? -30 : 30}deg)`,
            fontSize: 40,
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))',
          }}
        >
          &#x1FAA5;
        </div>
      </div>

      {/* Mascotte encouragement */}
      {props.mascotteUrl && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            right: 40,
            transform: `translateY(${mascotteY}px)`,
          }}
        >
          <Img
            src={props.mascotteUrl}
            style={{ width: 120, height: 120, objectFit: 'contain' }}
          />
        </div>
      )}

      {/* Étoile reward */}
      {starScale > 0.01 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${starScale * 1.5})`,
            fontSize: 60,
            opacity: interpolate(starScale, [0, 0.5, 1], [0, 1, 0.8]),
          }}
        >
          &#x2B50;
        </div>
      )}
    </AbsoluteFill>
  );
};
