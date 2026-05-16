import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';

// ═══════════════════════════════════════════════════
// Lip-Sync — Bouche animée synchronisée avec l'audio
// Utilise l'amplitude audio pour animer l'ouverture
// ═══════════════════════════════════════════════════

interface LipSyncProps {
  audioSrc: string;
  currentTime: number;
  fps: number;
  frame: number;
  lyrics: Array<{ from: number; to: number; text: string }>;
}

export const LipSync: React.FC<LipSyncProps> = ({
  audioSrc,
  currentTime,
  fps,
  frame,
  lyrics,
}) => {
  const audioData = useAudioData(audioSrc);

  // Pas de lip-sync pendant l'intro instrumentale (0-11s)
  // ou si pas de paroles à ce moment
  const hasLyrics = lyrics.some(
    (l) => currentTime >= l.from && currentTime <= l.to
  );

  if (!audioData || !hasLyrics) return null;

  // Analyser l'audio pour obtenir l'amplitude
  const visualization = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: 32,
  });

  // Prendre les fréquences vocales (bandes 2-8, ~200Hz-2kHz)
  const vocalBands = visualization.slice(2, 8);
  const avgAmplitude =
    vocalBands.reduce((sum, v) => sum + v, 0) / vocalBands.length;

  // Mapper l'amplitude à l'ouverture de la bouche (0 = fermée, 1 = ouverte)
  const mouthOpen = interpolate(avgAmplitude, [0.05, 0.4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Position en bas à gauche (comme un personnage qui chante)
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 120,
        left: 30,
        width: 90,
        height: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* Bulle de chant */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Visage licorne simplifié */}
        <LicorneFace mouthOpen={mouthOpen} />
      </div>

      {/* Notes de musique flottantes */}
      <MusicNotes frame={frame} amplitude={avgAmplitude} />
    </div>
  );
};

// ═══ Visage licorne avec bouche animée ═══
const LicorneFace: React.FC<{ mouthOpen: number }> = ({ mouthOpen }) => {
  // Hauteur de la bouche proportionnelle à l'amplitude
  const mouthHeight = interpolate(mouthOpen, [0, 1], [4, 22]);
  const mouthWidth = interpolate(mouthOpen, [0, 1], [16, 24]);
  const mouthY = interpolate(mouthOpen, [0, 1], [48, 46]);
  const mouthRadius = interpolate(mouthOpen, [0, 1], [2, 12]);

  return (
    <svg viewBox="0 0 80 80" width={65} height={65}>
      {/* Tête licorne */}
      <circle cx="40" cy="42" r="28" fill="#E8B4D8" />

      {/* Corne */}
      <polygon points="40,6 36,22 44,22" fill="#FFD700" />
      <line x1="38" y1="10" x2="42" y2="18" stroke="#FFA500" strokeWidth="1" />
      <line x1="37" y1="14" x2="43" y2="14" stroke="#FFA500" strokeWidth="1" />

      {/* Crinière */}
      <ellipse cx="22" cy="28" rx="8" ry="12" fill="#C77DBA" opacity="0.7" />
      <ellipse cx="58" cy="28" rx="8" ry="12" fill="#C77DBA" opacity="0.7" />

      {/* Yeux */}
      <ellipse cx="30" cy="38" rx="5" ry="5.5" fill="white" />
      <ellipse cx="50" cy="38" rx="5" ry="5.5" fill="white" />
      <circle cx="31" cy="37" r="3" fill="#2D1B69" />
      <circle cx="51" cy="37" r="3" fill="#2D1B69" />
      {/* Reflets */}
      <circle cx="32.5" cy="36" r="1.2" fill="white" />
      <circle cx="52.5" cy="36" r="1.2" fill="white" />

      {/* Joues roses */}
      <ellipse cx="22" cy="46" rx="6" ry="4" fill="#FF9EC7" opacity="0.5" />
      <ellipse cx="58" cy="46" rx="6" ry="4" fill="#FF9EC7" opacity="0.5" />

      {/* Bouche animée */}
      <ellipse
        cx="40"
        cy={mouthY}
        rx={mouthWidth / 2}
        ry={mouthHeight / 2}
        fill={mouthOpen > 0.3 ? '#FF6B8A' : '#E8789A'}
        stroke="#D4567A"
        strokeWidth="1"
      />
      {/* Langue visible quand bouche ouverte */}
      {mouthOpen > 0.4 && (
        <ellipse
          cx="40"
          cy={mouthY + mouthHeight * 0.2}
          rx={mouthWidth * 0.25}
          ry={mouthHeight * 0.2}
          fill="#FF8FAA"
        />
      )}
    </svg>
  );
};

// ═══ Notes de musique flottantes ═══
const MusicNotes: React.FC<{ frame: number; amplitude: number }> = ({
  frame,
  amplitude,
}) => {
  if (amplitude < 0.1) return null;

  const notes = ['♪', '♫', '♬'];

  return (
    <>
      {notes.map((note, i) => {
        const t = ((frame + i * 20) % 60) / 60;
        const x = 70 + Math.sin(t * Math.PI * 2 + i) * 20;
        const y = -t * 50;
        const opacity = interpolate(t, [0, 0.3, 0.9, 1], [0, 1, 1, 0]);
        const scale = 0.6 + amplitude * 0.8;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              fontSize: 20,
              opacity: opacity * amplitude * 2,
              transform: `scale(${scale}) rotate(${t * 30 - 15}deg)`,
              color: ['#FF6B6B', '#4ECDC4', '#FFE66D'][i],
              pointerEvents: 'none',
              textShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          >
            {note}
          </div>
        );
      })}
    </>
  );
};
