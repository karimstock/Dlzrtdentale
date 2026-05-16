import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Audio,
  Sequence,
  Video,
  staticFile,
} from 'remotion';
import { LipSync } from './LipSync';
import { Paroles } from './Paroles';

// ═══════════════════════════════════════════════════
// JADOMI Studio — Clip Brossage Final 1min30
// 2 vidéos continues (extend chain) + chanson + lip-sync
// Partie 1 : 60s (réveil → brossage → danse)
// Partie 2 : 28s (refrain → bravo → au revoir)
// Crossfade de 2s entre les deux parties
// ═══════════════════════════════════════════════════

// Paroles synchronisées (timestamp en secondes)
const LYRICS = [
  // Intro instrumentale (0-11s) — pas de paroles
  { from: 11, to: 15, text: 'Allez on brosse, on brosse en haut' },
  { from: 15, to: 19, text: 'Tout doucement, c\'est rigolo' },
  { from: 19, to: 23, text: 'Chaque petite dent qui brille' },
  { from: 23, to: 27, text: 'Comme une étoile qui scintille !' },
  // Couplet 2
  { from: 31, to: 35, text: 'Et maintenant on brosse en bas' },
  { from: 35, to: 39, text: 'Mes dents comptent sur moi, hourra !' },
  { from: 39, to: 43, text: 'En rond, en rond, sans oublier' },
  { from: 43, to: 47, text: 'Mes dents vont toutes bien briller !' },
  // Pont
  { from: 51, to: 55, text: 'À droite, à gauche, devant, derrière' },
  { from: 55, to: 59, text: 'On brosse partout, quelle belle affaire !' },
  { from: 59, to: 62, text: 'Et la langue aussi, blaaaa' },
  { from: 62, to: 66, text: 'Un sourire de star, me voilà !' },
  // Refrain
  { from: 66, to: 70, text: 'Brosse, brosse, matin et soir' },
  { from: 70, to: 74, text: 'Pour des dents pleines d\'espoir' },
  { from: 74, to: 78, text: 'Blanches, propres, qui brillent fort' },
  { from: 78, to: 82, text: 'Comme un trésor en or !' },
  // Outro
  { from: 83, to: 87, text: 'Bravo champion !' },
  { from: 87, to: 90, text: 'À demain !' },
];

// Timeline : Partie 1 = 0-62s, Partie 2 commence à 60s (2s overlap = crossfade)
const PART1_DURATION = 60; // secondes
const PART2_START = 58;    // commence 2s avant la fin de P1 (crossfade)
const PART2_DURATION = 28; // secondes
const CROSSFADE = 2;       // secondes de fondu

export interface BrossageClipFinalProps {
  assetsBase?: string;
  cabinetName?: string;
  logoUrl?: string;
}

export const BrossageClipFinal: React.FC<BrossageClipFinalProps> = ({
  assetsBase = 'studio/assets/brossage',
  cabinetName = 'Mon Dentiste',
  logoUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const asset = (name: string) => staticFile(`${assetsBase}/${name}`);

  // Opacité partie 1 : plein jusqu'à PART2_START, puis fade out sur CROSSFADE
  const part1Opacity = interpolate(
    currentTime,
    [PART2_START, PART2_START + CROSSFADE],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Opacité partie 2 : fade in sur CROSSFADE, puis plein
  const part2Opacity = interpolate(
    currentTime,
    [PART2_START, PART2_START + CROSSFADE],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Fade to black final (dernières 2s)
  const finalFade = interpolate(
    currentTime,
    [88, 90],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>

      {/* ── PARTIE 1 : Vidéo continue 60s (réveil → danse) ── */}
      <Sequence from={0} durationInFrames={PART1_DURATION * fps}>
        <AbsoluteFill style={{ opacity: part1Opacity }}>
          <Video
            src={asset('continu/clip-13-extend.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      </Sequence>

      {/* ── PARTIE 2 : Vidéo continue 28s (refrain → au revoir) ── */}
      <Sequence from={PART2_START * fps} durationInFrames={PART2_DURATION * fps}>
        <AbsoluteFill style={{ opacity: part2Opacity * finalFade }}>
          <Video
            src={asset('continu/part2-05-extend.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      </Sequence>

      {/* ── Audio : chanson complète ── */}
      <Audio
        src={asset('chanson-brossage.mp3')}
        volume={0.85}
      />

      {/* ── Lip-sync overlay (bouche animée) ── */}
      <LipSync
        audioSrc={asset('chanson-brossage.mp3')}
        currentTime={currentTime}
        fps={fps}
        frame={frame}
        lyrics={LYRICS}
      />

      {/* ── Paroles karaoké ── */}
      <Paroles
        lyrics={LYRICS}
        currentTime={currentTime}
        fps={fps}
        frame={frame}
      />

      {/* ── Timer en haut à droite (à partir de 11s) ── */}
      {currentTime >= 11 && (
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 30,
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 20,
            padding: '8px 18px',
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "'Nunito', sans-serif",
            color: currentTime >= 80 ? '#FF4444' : '#4ECDC4',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {formatTime(90 - Math.floor(currentTime))}
        </div>
      )}

      {/* ── Logo cabinet en fin ── */}
      {currentTime >= 83 && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 0,
            right: 0,
            textAlign: 'center',
            opacity: interpolate(
              currentTime,
              [83, 85],
              [0, 1],
              { extrapolateRight: 'clamp' }
            ) * finalFade,
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#fff',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            {cabinetName}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
