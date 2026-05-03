/**
 * JADOMI — Prothesiste 13 Features Motion Design
 * Passe 71 — 40s teaser video (1200 frames @ 30fps)
 * Style : Linear / Vercel / minimal premium
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Sequence,
} from 'remotion';

/* ═══════════════════════════════════════════
   DATA — 13 features with icons and taglines
   ═══════════════════════════════════════════ */
const FEATURES = [
  { icon: '▦', name: 'Suivi Kanban', tagline: 'Vos cas avancent visuellement' },
  { icon: '👤', name: 'Portail patient', tagline: 'Le patient suit sa prothèse' },
  { icon: '💬', name: 'Chat temps réel', tagline: 'Cabinet et labo, un seul fil' },
  { icon: '📋', name: 'Fil de suivi par cas', tagline: 'Labo, dentiste, patient : un seul fil' },
  { icon: '📐', name: 'Fichiers STL', tagline: 'Validation 3D en ligne' },
  { icon: '🎙️', name: 'BL vocal', tagline: 'Dictez, JADOMI rédige' },
  { icon: '🛒', name: 'Achats groupés', tagline: 'Prix fabricant collectif' },
  { icon: '🤝', name: 'Sous-traitance qualifiée', tagline: 'Débordement géré sereinement' },
  { icon: '🔧', name: 'Maintenance équipement', tagline: 'Fours et fraiseuses sous contrôle' },
  { icon: '🛡️', name: 'Garanties tracées', tagline: 'Chaque ouvrage protégé' },
  { icon: '🌐', name: 'Réseau interlaboratoires', tagline: 'Une filière connectée' },
  { icon: '📊', name: 'KPI dashboard', tagline: 'Vos indicateurs en direct' },
  { icon: '📄', name: 'Factur-X 2026', tagline: 'Conformité réglementaire incluse' },
];

const ACCENT = '#be185d';
const BG = '#0a0a0f';
const TEXT = '#fafafa';
const MUTED = '#71717a';
const FPS = 30;
const FEATURE_DURATION = 76; // ~2.53s per feature
const INTRO_DURATION = 90;   // 3s
const OUTRO_DURATION = 120;  // 4s

/* ═══════════════════════════════════════════
   INTRO — Logo + "13 fonctions"
   ═══════════════════════════════════════════ */
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const textOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [30, 50], [20, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        fontFamily: 'Syne, sans-serif',
        fontSize: 72,
        fontWeight: 800,
        color: TEXT,
        transform: `scale(${logoScale})`,
        letterSpacing: '-0.03em',
      }}>
        JADO<span style={{ color: ACCENT }}>MI</span>
      </div>
      <div style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 28,
        color: MUTED,
        marginTop: 24,
        opacity: textOpacity,
        transform: `translateY(${textY}px)`,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        13 fonctions pour votre laboratoire
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   FEATURE CARD — one per feature
   ═══════════════════════════════════════════ */
const FeatureCard: React.FC<{ icon: string; name: string; tagline: string; index: number }> = ({ icon, name, tagline, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const exit = interpolate(frame, [FEATURE_DURATION - 10, FEATURE_DURATION], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const combined = enter * exit;

  const iconScale = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 10, stiffness: 120 } });
  const textOpacity = interpolate(frame, [12, 22], [0, 1], { extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [20, 32], [0, 1], { extrapolateRight: 'clamp' });
  const taglineY = interpolate(frame, [20, 32], [15, 0], { extrapolateRight: 'clamp' });

  // Counter badge
  const counterNum = index + 1;

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: combined }}>
      {/* Counter */}
      <div style={{
        position: 'absolute',
        top: 60,
        right: 80,
        fontFamily: 'Syne, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: MUTED,
        opacity: 0.4,
      }}>
        {String(counterNum).padStart(2, '0')} / 13
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${(counterNum / 13) * 100}%`,
        height: 3,
        background: `linear-gradient(90deg, ${ACCENT}, #f472b6)`,
        transition: 'width 0.3s',
      }} />

      {/* Icon */}
      <div style={{
        fontSize: 80,
        transform: `scale(${iconScale})`,
        marginBottom: 32,
        filter: 'drop-shadow(0 0 40px rgba(190, 24, 93, 0.3))',
      }}>
        {icon}
      </div>

      {/* Name */}
      <div style={{
        fontFamily: 'Syne, sans-serif',
        fontSize: 48,
        fontWeight: 700,
        color: TEXT,
        opacity: textOpacity,
        letterSpacing: '-0.02em',
        textAlign: 'center',
        maxWidth: 800,
      }}>
        {name}
      </div>

      {/* Tagline */}
      <div style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 24,
        color: MUTED,
        marginTop: 16,
        opacity: taglineOpacity,
        transform: `translateY(${taglineY}px)`,
        fontWeight: 400,
      }}>
        {tagline}
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   OUTRO — "Tout cela, sur JADOMI."
   ═══════════════════════════════════════════ */
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const mainOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const ctaOpacity = interpolate(frame, [40, 55], [0, 1], { extrapolateRight: 'clamp' });
  const ctaY = interpolate(frame, [40, 55], [20, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* Glow */}
      <div style={{
        position: 'absolute',
        width: 500,
        height: 500,
        background: `radial-gradient(circle, rgba(190,24,93,0.15), transparent 70%)`,
        borderRadius: '50%',
        filter: 'blur(80px)',
      }} />

      <div style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 36,
        color: MUTED,
        opacity: mainOpacity,
        transform: `scale(${mainScale})`,
        marginBottom: 16,
        fontWeight: 400,
      }}>
        Tout cela, sur
      </div>
      <div style={{
        fontFamily: 'Syne, sans-serif',
        fontSize: 80,
        fontWeight: 800,
        color: TEXT,
        opacity: mainOpacity,
        transform: `scale(${mainScale})`,
        letterSpacing: '-0.03em',
      }}>
        JADO<span style={{ color: ACCENT }}>MI</span>
      </div>

      {/* CTA */}
      <div style={{
        marginTop: 48,
        padding: '16px 48px',
        borderRadius: 14,
        background: `linear-gradient(135deg, ${ACCENT}, #9d174d)`,
        fontFamily: 'Inter, sans-serif',
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        opacity: ctaOpacity,
        transform: `translateY(${ctaY}px)`,
        letterSpacing: '0.02em',
      }}>
        Découvrir la plateforme
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   MAIN COMPOSITION
   ═══════════════════════════════════════════ */
export const Prothesiste13Features: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* Intro: 0-3s (frames 0-89) */}
      <Sequence from={0} durationInFrames={INTRO_DURATION}>
        <Intro />
      </Sequence>

      {/* 13 features: 3s-36s */}
      {FEATURES.map((feat, i) => (
        <Sequence
          key={feat.name}
          from={INTRO_DURATION + i * FEATURE_DURATION}
          durationInFrames={FEATURE_DURATION}
        >
          <FeatureCard icon={feat.icon} name={feat.name} tagline={feat.tagline} index={i} />
        </Sequence>
      ))}

      {/* Outro: last 4s */}
      <Sequence from={INTRO_DURATION + 13 * FEATURE_DURATION} durationInFrames={OUTRO_DURATION}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
