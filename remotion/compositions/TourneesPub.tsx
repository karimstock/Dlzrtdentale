/**
 * JADOMI Remotion — Pub Tournées Livreur (Animation Motion Graphics)
 * Personnages SVG, van coursier, bâtiments, notifications
 * Style flat design premium — 45 secondes
 */
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, spring, Sequence, Easing, Audio, staticFile,
} from 'remotion';

const PINK = '#be185d';
const PINK_L = '#f472b6';
const GREEN = '#10b981';
const GREEN_L = '#4ade80';
const BLUE = '#3b82f6';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const INDIGO = '#6366f1';
const BG = '#0a0a12';
const SURFACE = '#14141f';
const TEXT = '#fafafa';
const MUTED = '#71717a';
const FD = 'Syne, sans-serif';
const FB = 'Inter, system-ui, sans-serif';

// ═══════════════════════════════════
// SVG CHARACTERS & ELEMENTS
// ═══════════════════════════════════

const Van: React.FC<{ x: number; y: number; color: string; scale?: number; flip?: boolean }> = ({ x, y, color, scale = 1, flip }) => (
  <g transform={`translate(${x},${y}) scale(${scale * (flip ? -1 : 1)}, ${scale})`}>
    {/* Shadow */}
    <ellipse cx="0" cy="12" rx="52" ry="6" fill="#000" opacity="0.2" />
    {/* Cargo area — rectangle arrondi */}
    <rect x="-50" y="-32" width="65" height="38" rx="3" fill={color} />
    <rect x="-50" y="-35" width="65" height="6" rx="3" fill={color} opacity="0.7" />
    {/* Cargo door lines */}
    <line x1="-48" y1="-10" x2="-48" y2="4" stroke="#fff" strokeWidth="0.8" opacity="0.2" />
    <line x1="-30" y1="-10" x2="-30" y2="4" stroke="#fff" strokeWidth="0.8" opacity="0.2" />
    {/* Cabin — forme arrondie type utilitaire */}
    <path d="M 15,-32 L 15,-48 Q 15,-55 22,-55 L 42,-55 Q 48,-55 48,-48 L 48,-32 Z" fill={color} />
    {/* Windshield */}
    <path d="M 18,-50 L 18,-36 L 45,-36 L 45,-50 Q 45,-52 43,-52 L 20,-52 Q 18,-52 18,-50 Z" fill="#1e3a5f" opacity="0.7" />
    {/* Windshield reflection */}
    <path d="M 20,-50 L 24,-38 L 22,-38 L 18,-50 Z" fill="#fff" opacity="0.1" />
    {/* Headlight */}
    <rect x="46" y="-42" width="4" height="6" rx="1" fill="#fbbf24" opacity="0.8" />
    {/* Bumper */}
    <rect x="-50" y="4" width="100" height="5" rx="2" fill="#1e293b" />
    {/* Wheels with detail */}
    <circle cx="-30" cy="10" r="9" fill="#1e293b" />
    <circle cx="-30" cy="10" r="6" fill="#334155" />
    <circle cx="-30" cy="10" r="2" fill="#475569" />
    <circle cx="30" cy="10" r="9" fill="#1e293b" />
    <circle cx="30" cy="10" r="6" fill="#334155" />
    <circle cx="30" cy="10" r="2" fill="#475569" />
    {/* JADOMI branding on cargo */}
    <rect x="-47" y="-26" width="58" height="16" rx="3" fill={`${color}`} opacity="0.6" />
    <text x="-18" y="-15" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" opacity="0.95" fontFamily={FD}>JADOMI</text>
    {/* Small tooth icon */}
    <text x="-42" y="-14" fontSize="8" fill="#fff" opacity="0.6">🦷</text>
  </g>
);

const Building: React.FC<{ x: number; y: number; width: number; height: number; color: string; label?: string; lit?: boolean }> = ({ x, y, width, height, color, label, lit }) => (
  <g transform={`translate(${x},${y})`}>
    <rect x={0} y={-height} width={width} height={height} rx="4" fill={color} />
    {/* Windows */}
    {Array.from({ length: Math.floor(height / 25) }).map((_, row) =>
      Array.from({ length: Math.floor(width / 18) }).map((_, col) => (
        <rect key={`${row}-${col}`}
          x={6 + col * 18} y={-height + 8 + row * 25}
          width="10" height="14" rx="1"
          fill={lit && row === 0 ? '#fbbf24' : '#1e293b'}
          opacity={lit && row === 0 ? 0.8 : 0.3}
        />
      ))
    )}
    {/* Door */}
    <rect x={width / 2 - 8} y={-18} width="16" height="18" rx="2" fill="#1e293b" opacity="0.5" />
    {label && <text x={width / 2} y={-height - 12} textAnchor="middle" fontSize="16" fill={MUTED} fontFamily={FB} fontWeight="700">{label}</text>}
  </g>
);

const Person: React.FC<{ x: number; y: number; color: string; hasBox?: boolean; scale?: number }> = ({ x, y, color, hasBox, scale = 1.8 }) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    {/* Head */}
    <circle cx="0" cy="-35" r="8" fill="#f5d0a9" />
    {/* Hair */}
    <ellipse cx="0" cy="-40" rx="8" ry="5" fill="#4a3728" />
    {/* Body */}
    <rect x="-8" y="-26" width="16" height="22" rx="3" fill={color} />
    {/* Arms */}
    <rect x="-14" y="-24" width="6" height="16" rx="3" fill={color} opacity="0.85" />
    <rect x="8" y="-24" width="6" height="16" rx="3" fill={color} opacity="0.85" />
    {/* Legs */}
    <rect x="-7" y="-4" width="6" height="14" rx="2" fill="#1e293b" />
    <rect x="1" y="-4" width="6" height="14" rx="2" fill="#1e293b" />
    {/* Box if carrying */}
    {hasBox && (
      <>
        <rect x="-12" y="-22" width="24" height="16" rx="2" fill="#c9a961" />
        <line x1="-12" y1="-14" x2="12" y2="-14" stroke="#a07830" strokeWidth="1" />
        <text x="0" y="-10" textAnchor="middle" fontSize="5" fill="#fff" fontWeight="700">JADOMI</text>
      </>
    )}
  </g>
);

const Phone: React.FC<{ x: number; y: number; scale?: number; notifProgress: number }> = ({ x, y, scale = 1, notifProgress }) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    {/* Phone body */}
    <rect x="-28" y="-50" width="56" height="100" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
    {/* Screen */}
    <rect x="-24" y="-44" width="48" height="82" rx="4" fill="#0f172a" />
    {/* Notch */}
    <rect x="-8" y="-48" width="16" height="3" rx="1.5" fill="#334155" />
    {/* Notification */}
    {notifProgress > 0 && (
      <g opacity={notifProgress} transform={`translate(0, ${interpolate(notifProgress, [0, 1], [-10, 0])})`}>
        <rect x="-20" y="-36" width="40" height="32" rx="6" fill={`${PINK}30`} stroke={PINK} strokeWidth="0.5" />
        <circle cx="-12" cy="-26" r="5" fill={PINK} />
        <text x="-12" y="-24" textAnchor="middle" fontSize="5" fill="#fff" fontWeight="900">J</text>
        <text x="2" y="-26" fontSize="5" fill={PINK_L} fontWeight="700" fontFamily={FB}>Livreur en route</text>
        <text x="-12" y="-16" fontSize="4" fill={MUTED} fontFamily={FB}>Arrivée dans 8 min</text>
        <text x="-12" y="-10" fontSize="4" fill={MUTED} fontFamily={FB}>Préparez vos travaux</text>
      </g>
    )}
  </g>
);

const Road: React.FC<{ y: number; frame: number }> = ({ y, frame }) => {
  const dashOffset = frame * 3;
  return (
    <g>
      {/* Trottoir */}
      <rect x="0" y={y - 10} width="1920" height="70" fill="#1a1a2a" />
      {/* Asphalte */}
      <rect x="0" y={y - 5} width="1920" height="55" fill="#252535" />
      {/* Ligne centrale jaune */}
      <line x1="0" y1={y + 22} x2="1920" y2={y + 22}
        stroke="#fbbf24" strokeWidth="3" strokeDasharray="30 20"
        strokeDashoffset={-dashOffset} opacity="0.5" />
      {/* Bandes blanches latérales */}
      <line x1="0" y1={y - 3} x2="1920" y2={y - 3} stroke="#fff" strokeWidth="2" opacity="0.15" />
      <line x1="0" y1={y + 48} x2="1920" y2={y + 48} stroke="#fff" strokeWidth="2" opacity="0.15" />
      {/* Bordures trottoir */}
      <line x1="0" y1={y - 10} x2="1920" y2={y - 10} stroke="#334155" strokeWidth="1.5" />
      <line x1="0" y1={y + 60} x2="1920" y2={y + 60} stroke="#334155" strokeWidth="1.5" />
    </g>
  );
};

const Package: React.FC<{ x: number; y: number; scale: number; opacity: number }> = ({ x, y, scale, opacity }) => (
  <g transform={`translate(${x},${y}) scale(${scale})`} opacity={opacity}>
    <rect x="-12" y="-10" width="24" height="20" rx="3" fill="#c9a961" />
    <line x1="-12" y1="0" x2="12" y2="0" stroke="#a07830" strokeWidth="1" />
    <rect x="-2" y="-5" width="4" height="10" rx="1" fill="#a07830" opacity="0.5" />
    <text x="0" y="16" textAnchor="middle" fontSize="6" fill={MUTED} fontFamily={FB}>CAS-2026</text>
  </g>
);

const Star: React.FC<{ x: number; y: number; size: number; opacity: number; color: string }> = ({ x, y, size, opacity, color }) => (
  <circle cx={x} cy={y} r={size} fill={color} opacity={opacity} />
);

// ═══════════════════════════════════
// SCENE 0 — INTRO ACCROCHE (3.5s)
// ═══════════════════════════════════
const INTRO_DUR = 105; // 3.5s

const SceneIntroAccroche: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const logoIn = spring({ frame: frame - 5, fps, config: { damping: 14, mass: 0.4 } });
  const line1 = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const line2 = spring({ frame: frame - 35, fps, config: { damping: 12 } });
  const line3 = spring({ frame: frame - 50, fps, config: { damping: 12 } });
  const fadeAll = interpolate(frame, [85, 105], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB, color: TEXT }}>
      {/* Glows */}
      <div style={{ position: 'absolute', top: '30%', left: '30%', width: 600, height: 600, background: `radial-gradient(circle, ${PINK}12, transparent 70%)`, borderRadius: '50%', filter: 'blur(80px)' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '20%', width: 400, height: 400, background: `radial-gradient(circle, ${INDIGO}08, transparent 70%)`, borderRadius: '50%', filter: 'blur(80px)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', opacity: fadeAll }}>
        {/* Logo JADOMI */}
        <div style={{
          fontFamily: FD, fontSize: 42, fontWeight: 900, letterSpacing: -1, marginBottom: 40,
          background: `linear-gradient(135deg, ${PINK}, ${PINK_L})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          transform: `scale(${logoIn})`, opacity: logoIn,
        }}>JADOMI</div>

        {/* Phrase d'accroche — ligne par ligne */}
        <div style={{
          fontFamily: FD, fontSize: 72, fontWeight: 800, letterSpacing: -3, lineHeight: 1.2,
          transform: `translateY(${interpolate(line1, [0, 1], [20, 0])}px)`, opacity: line1,
        }}>
          Au plus près des prothésistes,
        </div>
        <div style={{
          fontFamily: FD, fontSize: 72, fontWeight: 800, letterSpacing: -3, lineHeight: 1.2,
          transform: `translateY(${interpolate(line2, [0, 1], [20, 0])}px)`, opacity: line2,
        }}>
          des livreurs et des dentistes.
        </div>
        <div style={{
          fontFamily: FD, fontSize: 28, fontWeight: 500, color: MUTED, marginTop: 30, lineHeight: 1.6,
          transform: `translateY(${interpolate(line3, [0, 1], [15, 0])}px)`, opacity: line3,
        }}>
          La livraison de prothèses, réinventée.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 1 — LE LABO (6.5s)
// ═══════════════════════════════════
const SceneLabo: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const titleIn = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  const prothesisteIn = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const boxIn = spring({ frame: frame - 50, fps, config: { damping: 10, mass: 0.3 } });
  const checkIn = spring({ frame: frame - 70, fps, config: { damping: 8 } });
  const boxFloat = Math.sin(frame * 0.05) * 3;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB }}>
      <svg width="1920" height="1080" viewBox="0 0 960 540">
        {/* Background glow */}
        <defs>
          <radialGradient id="glow1" cx="50%" cy="60%">
            <stop offset="0%" stopColor={PINK} stopOpacity="0.08" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#glow1)" />

        {/* Stars */}
        {[...Array(30)].map((_, i) => (
          <Star key={i} x={100 + (i * 61) % 1800} y={50 + (i * 37) % 300}
            size={1 + (i % 3)} opacity={0.1 + Math.sin(frame * 0.03 + i) * 0.1} color="#fff" />
        ))}

        {/* City skyline background */}
        <Building x={20} y={400} width={40} height={80} color="#151520" />
        <Building x={70} y={400} width={30} height={120} color="#12121c" />
        <Building x={750} y={400} width={35} height={100} color="#12121c" />
        <Building x={800} y={400} width={40} height={70} color="#151520" />
        <Building x={860} y={400} width={50} height={130} color="#12121c" />

        {/* Lab building - center */}
        <g transform={`scale(${prothesisteIn})`} style={{ transformOrigin: '480px 400px' }}>
          <Building x={280} y={420} width={400} height={220} color="#1a1a2e" label="VOTRE LABORATOIRE" lit />
          {/* Lab sign */}
          <rect x={400} y={206} width={160} height={30} rx="8" fill={PINK} opacity="0.9" />
          <text x={480} y={226} textAnchor="middle" fontSize="14" fill="#fff" fontWeight="800" fontFamily={FD}>LABO PROTHÈSE</text>
        </g>

        {/* Prothésiste character */}
        <g transform={`translate(0, ${interpolate(prothesisteIn, [0, 1], [15, 0])})`} opacity={prothesisteIn}>
          <Person x={420} y={380} color={INDIGO} scale={2} />
          {/* Work table */}
          <rect x={470} y={355} width={80} height={5} rx="2" fill="#2a2a3e" />
          <rect x={475} y={340} width="12" height="14" rx="2" fill="#f5d0a9" opacity="0.6" />
          <rect x={495} y={343} width="18" height="11" rx="2" fill="#e2e8f0" opacity="0.5" />
        </g>

        {/* Box appearing */}
        <g transform={`translate(0, ${boxFloat})`}>
          <Package x={530} y={350} scale={boxIn * 1.5} opacity={boxIn} />
        </g>

        {/* Check mark */}
        {checkIn > 0.1 && (
          <g transform={`translate(530, 320) scale(${checkIn})`} opacity={checkIn}>
            <circle r="14" fill={GREEN} />
            <path d="M-5,0 L-2,4 L6,-4" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* BL badge */}
        {checkIn > 0.5 && (
          <g opacity={checkIn - 0.5} transform={`translate(480, ${interpolate(checkIn, [0.5, 1], [310, 295])})`}>
            <rect x="-90" y="-12" width="180" height="24" rx="12" fill={`${GREEN}30`} stroke={GREEN} strokeWidth="1" />
            <text x="0" y="4" textAnchor="middle" fontSize="9" fill={GREEN_L} fontWeight="700" fontFamily={FB}>BL-2026-0847 validé — Prêt à livrer</text>
          </g>
        )}
      </svg>

      {/* Title overlay */}
      <div style={{
        position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center',
        transform: `translateY(${interpolate(titleIn, [0, 1], [30, 0])}px)`, opacity: titleIn,
      }}>
        <div style={{ fontFamily: FD, fontSize: 68, fontWeight: 800, color: TEXT, letterSpacing: -3 }}>
          Le labo finalise. <span style={{ color: PINK_L }}>La tournée commence.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 2 — LE VAN PART (7s)
// ═══════════════════════════════════
const SceneVanDepart: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const vanX = interpolate(frame, [0, 180], [-100, 700], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const vanBounce = Math.sin(frame * 0.4) * 1.5;
  const routeIn = spring({ frame: frame - 30, fps, config: { damping: 14 } });
  const feuilleIn = spring({ frame: frame - 60, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB }}>
      <svg width="1920" height="1080" viewBox="0 0 960 540">
        {/* Sky gradient */}
        <defs>
          <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0a18" />
            <stop offset="100%" stopColor="#141428" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#sky2)" />

        {/* Stars */}
        {[...Array(20)].map((_, i) => (
          <Star key={i} x={80 + (i * 97) % 1800} y={40 + (i * 43) % 250}
            size={1 + (i % 2)} opacity={0.15 + Math.sin(frame * 0.02 + i) * 0.1} color="#fff" />
        ))}

        {/* City silhouette */}
        <Building x={10} y={330} width={35} height={90} color="#0d0d1a" />
        <Building x={55} y={330} width={25} height={130} color="#0a0a15" />
        <Building x={700} y={330} width={30} height={110} color="#0d0d1a" />
        <Building x={750} y={330} width={35} height={80} color="#0a0a15" />
        <Building x={870} y={330} width={40} height={140} color="#0d0d1a" />

        {/* Dental offices along the road */}
        <Building x={150} y={340} width={80} height={100} color="#1a1a2e" label="Cabinet A." lit />
        <Building x={340} y={340} width={70} height={80} color="#1a1a2e" label="Cabinet B." />
        <Building x={510} y={340} width={85} height={110} color="#1a1a2e" label="Cabinet C." />
        <Building x={700} y={340} width={75} height={90} color="#1a1a2e" label="Votre cabinet" lit />

        {/* Road */}
        <Road y={360} frame={frame} />

        {/* Route line (GPS trail) */}
        <path d={`M ${vanX / 2 + 25} 385 Q ${vanX / 2 + 80} 360, 190 360 T 375 360 T 553 360 T 738 360`}
          stroke={PINK} strokeWidth="2" strokeDasharray="8 4" fill="none"
          opacity={routeIn * 0.6}
          strokeDashoffset={-frame * 2} />

        {/* GPS dots on route */}
        {[190, 375, 553, 738].map((dx, i) => (
          <g key={i}>
            <circle cx={dx} cy={360} r={5} fill={vanX / 2 > dx - 30 ? GREEN : PINK}
              opacity={routeIn * (vanX / 2 > dx - 30 ? 1 : 0.4)} />
            {vanX / 2 > dx - 30 && <circle cx={dx} cy={360} r={9} fill="none" stroke={GREEN} strokeWidth="1" opacity="0.3" />}
          </g>
        ))}

        {/* Van */}
        <g transform={`translate(0, ${vanBounce})`}>
          <Van x={vanX / 2} y={380} color={PINK} scale={0.8} />
        </g>

        {/* Exhaust particles */}
        {frame > 10 && [...Array(4)].map((_, i) => {
          const age = (frame - i * 5) % 20;
          return (
            <circle key={i} cx={vanX - 55 - age * 4} cy={688 - age * 2}
              r={2 + age * 0.3} fill="#64748b" opacity={Math.max(0, 0.3 - age * 0.015)} />
          );
        })}
      </svg>

      {/* GRANDE Feuille de route — droite, très visible */}
      {feuilleIn > 0.1 && (
        <div style={{
          position: 'absolute', top: 50, right: 50, width: 620,
          background: 'rgba(14,14,24,.97)', border: '2px solid rgba(255,255,255,.1)',
          borderRadius: 28, padding: '32px 36px', backdropFilter: 'blur(16px)',
          boxShadow: `0 40px 100px rgba(0,0,0,.7), 0 0 40px ${INDIGO}10`,
          transform: `translateX(${interpolate(feuilleIn, [0, 1], [50, 0])}px)`, opacity: feuilleIn,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${INDIGO}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🚚</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, fontFamily: FD }}>Feuille de route</div>
              <div style={{ fontSize: 14, color: MUTED }}>Coursier B — Secteur Roubaix</div>
            </div>
          </div>
          {[
            { name: 'Cabinet A. — Lille', type: 'Livraison', colis: 2 },
            { name: 'Cabinet B. — Roubaix', type: 'Récupération', colis: 1 },
            { name: 'Cabinet C. — Tourcoing', type: 'Livraison + Récup', colis: 3 },
            { name: 'Votre cabinet — Roubaix', type: 'Livraison', colis: 2 },
          ].map((stop, i) => {
            const s = spring({ frame: frame - 65 - i * 7, fps, config: { damping: 12 } });
            const done = vanX > [500, 800, 1050, 1300][i];
            const active = !done && i === Math.min(3, Math.floor((vanX + 100) / 300));
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', marginBottom: 10,
                borderRadius: 14,
                background: done ? `${GREEN}10` : active ? `${PINK}12` : 'rgba(255,255,255,.02)',
                border: `1.5px solid ${done ? `${GREEN}30` : active ? `${PINK}35` : 'rgba(255,255,255,.05)'}`,
                transform: `translateX(${interpolate(s, [0, 1], [30, 0])}px)`, opacity: s,
                boxShadow: active ? `0 0 20px ${PINK}15` : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', fontSize: 14, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                  background: done ? GREEN : active ? PINK : '#333',
                  boxShadow: active ? `0 0 12px ${PINK}50` : 'none',
                }}>{done ? '✓' : i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, color: done ? '#a1a1aa' : active ? PINK_L : TEXT, fontWeight: active ? 700 : 500 }}>{stop.name}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{stop.type} — {stop.colis} colis</div>
                </div>
                {active && <div style={{ fontSize: 12, fontWeight: 700, color: PINK_L, padding: '4px 12px', borderRadius: 8, background: `${PINK}20` }}>EN ROUTE</div>}
              </div>
            );
          })}
          {/* Stats bas */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {[
              { val: '34 km', label: 'Distance', color: INDIGO },
              { val: '1h45', label: 'Durée', color: AMBER },
              { val: '20', label: 'Arrêts total', color: GREEN },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10,
                background: `${s.color}08`, border: `1px solid ${s.color}15`,
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: FD }}>{s.val}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Titre — en bas à gauche, GRAND */}
      <div style={{
        position: 'absolute', bottom: 60, left: 60,
        opacity: spring({ frame: frame - 5, fps, config: { damping: 14 } }),
      }}>
        <div style={{ fontFamily: FD, fontSize: 62, fontWeight: 800, color: TEXT, letterSpacing: -3 }}>
          Routage intelligent.
        </div>
        <div style={{ fontFamily: FD, fontSize: 62, fontWeight: 800, color: AMBER, letterSpacing: -3 }}>
          40 arrêts optimisés.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 3 — NOTIFICATION APPROCHE (7s)
// ═══════════════════════════════════
const SceneNotifApproche: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const buildingIn = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  const phoneIn = spring({ frame: frame - 25, fps, config: { damping: 12, mass: 0.5 } });
  const notifDrop = spring({ frame: frame - 50, fps, config: { damping: 10, mass: 0.3 } });
  const secretaireIn = spring({ frame: frame - 40, fps, config: { damping: 12 } });
  const vanApproach = interpolate(frame, [80, 180], [1920, 1200], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pulseGlow = Math.sin(frame * 0.08) * 0.3 + 0.7;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB }}>
      <svg width="1920" height="1080" viewBox="0 0 960 540">
        <defs>
          <radialGradient id="glow3" cx="30%" cy="60%">
            <stop offset="0%" stopColor={PINK} stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#glow3)" />

        {/* Dental office */}
        <g transform={`scale(${buildingIn})`} style={{ transformOrigin: '200px 400px' }}>
          <Building x={50} y={420} width={300} height={200} color="#1a1a2e" label="CABINET DENTAIRE" lit />
          {/* Cross sign */}
          <rect x={160} y={228} width="50" height="50" rx="10" fill={`${GREEN}30`} stroke={GREEN} strokeWidth="1" />
          <rect x={180} y={238} width="10" height="30" rx="2" fill={GREEN} />
          <rect x={170} y={248} width="30" height="10" rx="2" fill={GREEN} />
        </g>

        {/* Secretary character */}
        <g opacity={secretaireIn} transform={`translate(0, ${interpolate(secretaireIn, [0, 1], [10, 0])})`}>
          <Person x={280} y={380} color="#7c3aed" scale={1.8} />
          {/* Desk */}
          <rect x={310} y={358} width={60} height={5} rx="2" fill="#2a2a3e" />
        </g>

        {/* Phone with notification */}
        <g transform={`translate(0, ${interpolate(phoneIn, [0, 1], [15, 0])})`} opacity={phoneIn}>
          <Phone x={380} y={340} scale={2.5} notifProgress={notifDrop} />
        </g>

        {/* Notification glow ring */}
        {notifDrop > 0.5 && (
          <circle cx={580} cy={620} r={40 + (1 - pulseGlow) * 20}
            fill="none" stroke={PINK} strokeWidth="2" opacity={pulseGlow * 0.4} />
        )}

        {/* Road */}
        <Road y={420} frame={frame} />

        {/* Van approaching from right */}
        {frame > 80 && (
          <g transform={`translate(0, ${Math.sin(frame * 0.4) * 1})`}>
            <Van x={vanApproach / 2} y={440} color={PINK} scale={0.7} flip />
          </g>
        )}

        {/* Distance indicator */}
        {frame > 90 && (
          <g opacity={interpolate(frame, [90, 110], [0, 1], { extrapolateRight: 'clamp' })}>
            <line x1={350} y1={435} x2={vanApproach / 2 - 30} y2={435}
              stroke={PINK} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />
            <rect x={(350 + vanApproach / 2 - 30) / 2 - 25} y={425} width="50" height="18" rx="9" fill={`${PINK}40`} />
            <text x={(350 + vanApproach / 2 - 30) / 2} y={438} textAnchor="middle" fontSize="9" fill={PINK_L} fontWeight="700">8 min</text>
          </g>
        )}
      </svg>

      {/* Title */}
      <div style={{
        position: 'absolute', top: 80, right: 80, textAlign: 'right',
        opacity: spring({ frame: frame - 5, fps, config: { damping: 14 } }),
      }}>
        <div style={{ fontFamily: FD, fontSize: 56, fontWeight: 800, color: TEXT, letterSpacing: -2 }}>
          L'assistante est prévenue.<br /><span style={{ color: PINK_L }}>Elle prépare les travaux.</span>
        </div>
        <div style={{ fontSize: 16, color: MUTED, marginTop: 12, lineHeight: 1.7 }}>
          Liste des travaux reçue par notification.<br />
          Si un travail manque, elle décale le patient.
        </div>
      </div>

      {/* Travaux list overlay */}
      {notifDrop > 0.3 && (
        <div style={{
          position: 'absolute', bottom: 80, right: 80, width: 340,
          background: 'rgba(20,20,31,.95)', border: `1px solid ${PINK}30`,
          borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)',
          transform: `translateY(${interpolate(notifDrop, [0.3, 1], [20, 0])}px)`,
          opacity: interpolate(notifDrop, [0.3, 1], [0, 1]),
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: PINK_L, marginBottom: 10 }}>Travaux prévus pour ce passage :</div>
          {[
            { type: 'Livraison', desc: 'Couronne 14 céramo — CAS-0847', color: GREEN },
            { type: 'Livraison', desc: 'Bridge 45-47 — CAS-0912', color: GREEN },
            { type: 'Récupération', desc: 'Empreinte implant 36', color: AMBER },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: `${item.color}08`, border: `1px solid ${item.color}15`,
              borderRadius: 8, marginBottom: 4, fontSize: 11,
            }}>
              <span style={{ color: item.color, fontWeight: 700, fontSize: 10 }}>{item.type}</span>
              <span style={{ color: MUTED, flex: 1 }}>{item.desc}</span>
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 4 — ARRIVÉE + VALIDATION (7s)
// ═══════════════════════════════════
const SceneArriveeValidation: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const vanStop = interpolate(frame, [0, 40], [500, 320], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const coursierOut = spring({ frame: frame - 45, fps, config: { damping: 12 } });
  const exchange = spring({ frame: frame - 70, fps, config: { damping: 10 } });
  const validateBtn = spring({ frame: frame - 100, fps, config: { damping: 8, mass: 0.3 } });
  const confetti = spring({ frame: frame - 110, fps, config: { damping: 12 } });
  const checkBig = spring({ frame: frame - 115, fps, config: { damping: 8 } });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB }}>
      <svg width="1920" height="1080" viewBox="0 0 960 540">
        <defs>
          <radialGradient id="glow4" cx="40%" cy="55%">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#glow4)" />

        {/* Building */}
        <Building x={20} y={390} width={250} height={180} color="#1a1a2e" label="CABINET DENTAIRE" lit />

        {/* Road */}
        <Road y={400} frame={frame} />

        {/* Van stopping */}
        <g transform={`translate(0, ${Math.sin(frame * 0.4) * (frame < 40 ? 1 : 0)})`}>
          <Van x={vanStop / 2 + 30} y={418} color={PINK} scale={0.8} />
        </g>

        {/* Coursier gets out */}
        {coursierOut > 0.1 && (
          <g opacity={coursierOut} transform={`translate(${interpolate(coursierOut, [0, 1], [180, 140])}, 0)`}>
            <Person x={0} y={370} color={PINK} hasBox scale={1.8} />
          </g>
        )}

        {/* Secretary at door */}
        {exchange > 0.1 && (
          <g opacity={exchange} transform={`translate(0, ${interpolate(exchange, [0, 1], [10, 0])})`}>
            <Person x={110} y={370} color="#7c3aed" scale={1.8} />
          </g>
        )}

        {/* Exchange arrows */}
        {exchange > 0.5 && (
          <g opacity={exchange - 0.5}>
            <path d="M 120 345 Q 130 335, 140 345" stroke={GREEN} strokeWidth="2" fill="none" markerEnd="url(#arrowG)" />
            <path d="M 140 355 Q 130 365, 120 355" stroke={AMBER} strokeWidth="2" fill="none" markerEnd="url(#arrowA)" />
            <defs>
              <marker id="arrowG" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 z" fill={GREEN} /></marker>
              <marker id="arrowA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 z" fill={AMBER} /></marker>
            </defs>
            <text x="130" y="332" textAnchor="middle" fontSize="7" fill={GREEN_L} fontWeight="600">Livraison</text>
            <text x="130" y="370" textAnchor="middle" fontSize="7" fill={AMBER} fontWeight="600">Récupération</text>
          </g>
        )}

        {/* Big check mark */}
        {checkBig > 0.1 && (
          <g transform={`translate(480, 220) scale(${checkBig * 2.5})`} opacity={checkBig}>
            <circle r="30" fill={GREEN} opacity="0.9" />
            <path d="M-12,2 L-4,11 L14,-8" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* Confetti */}
        {confetti > 0.1 && [...Array(20)].map((_, i) => {
          const angle = (i / 20) * Math.PI * 2;
          const dist = confetti * 120;
          const cx = 480 + Math.cos(angle) * dist;
          const cy = 220 + Math.sin(angle) * dist - confetti * 40;
          const colors = [PINK, GREEN, AMBER, BLUE, INDIGO, '#c9a961'];
          return (
            <rect key={i} x={cx - 4} y={cy - 4} width={8} height={8}
              rx={i % 2 === 0 ? 4 : 0} fill={colors[i % colors.length]}
              opacity={1 - confetti * 0.6}
              transform={`rotate(${confetti * 360 + i * 30}, ${cx}, ${cy})`} />
          );
        })}
      </svg>

      {/* Validate button overlay */}
      {validateBtn > 0.1 && (
        <div style={{
          position: 'absolute', right: 80, top: '50%', transform: `translateY(-50%) scale(${validateBtn})`,
          opacity: validateBtn,
        }}>
          <div style={{
            width: 350, background: 'rgba(20,20,31,.95)', border: `1px solid ${GREEN}30`,
            borderRadius: 20, padding: 28, textAlign: 'center',
            boxShadow: `0 0 60px ${GREEN}15`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MUTED, marginBottom: 8 }}>App Livreur</div>
            <div style={{ fontFamily: FD, fontSize: 28, fontWeight: 800, color: TEXT, marginBottom: 16 }}>Passage validé</div>
            <div style={{
              padding: '16px 32px', borderRadius: 14,
              background: `linear-gradient(135deg, ${GREEN}, #059669)`,
              fontSize: 18, fontWeight: 800, color: '#fff',
              boxShadow: `0 8px 30px ${GREEN}40`,
            }}>
              ✓ Bon de passage signé
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>
              Le prothésiste voit tout en temps réel
            </div>
          </div>
        </div>
      )}

      {/* Title */}
      <div style={{
        position: 'absolute', bottom: 100, left: 80,
        opacity: spring({ frame: frame - 5, fps, config: { damping: 14 } }),
      }}>
        <div style={{ fontFamily: FD, fontSize: 56, fontWeight: 800, color: TEXT, letterSpacing: -2 }}>
          Échange express. <span style={{ color: GREEN_L }}>Validé en un clic.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 5 — SUIVI GPS LIVE (7s)
// ═══════════════════════════════════
const SceneGPSLive: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const mapIn = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  const drivers = [
    { name: 'Coursier A', color: INDIGO, baseX: 200, baseY: 220, progress: '14/20' },
    { name: 'Coursier B', color: GREEN, baseX: 500, baseY: 280, progress: '8/20' },
    { name: 'Coursier C', color: AMBER, baseX: 350, baseY: 350, progress: '11/20' },
    { name: 'Coursier D', color: RED, baseX: 650, baseY: 240, progress: '16/20' },
  ];

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB }}>
      <svg width="1920" height="1080" viewBox="0 0 960 540">
        <defs>
          <radialGradient id="mapBg" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#141428" />
            <stop offset="100%" stopColor="#0a0a18" />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#mapBg)" opacity={mapIn} />

        {/* Grid */}
        {[...Array(20)].map((_, i) => (
          <React.Fragment key={i}>
            <line x1={0} y1={i * 54} x2={1920} y2={i * 54} stroke="rgba(255,255,255,.02)" />
            <line x1={i * 96} y1={0} x2={i * 96} y2={1080} stroke="rgba(255,255,255,.02)" />
          </React.Fragment>
        ))}

        {/* Roads */}
        <line x1="100" y1="300" x2="1800" y2="500" stroke="rgba(255,255,255,.04)" strokeWidth="3" />
        <line x1="200" y1="700" x2="1700" y2="400" stroke="rgba(255,255,255,.04)" strokeWidth="3" />
        <line x1="960" y1="100" x2="960" y2="900" stroke="rgba(255,255,255,.04)" strokeWidth="3" />

        {/* City labels */}
        <text x="160" y="190" fontSize="14" fill="#2a2a3e" fontWeight="800" letterSpacing="3" fontFamily={FD}>LILLE</text>
        <text x="460" y="250" fontSize="14" fill="#2a2a3e" fontWeight="800" letterSpacing="3" fontFamily={FD}>ROUBAIX</text>
        <text x="310" y="320" fontSize="14" fill="#2a2a3e" fontWeight="800" letterSpacing="3" fontFamily={FD}>VDA</text>
        <text x="620" y="210" fontSize="14" fill="#2a2a3e" fontWeight="800" letterSpacing="3" fontFamily={FD}>TOURCOING</text>

        {/* Drivers with trails */}
        {drivers.map((d, i) => {
          const s = spring({ frame: frame - 20 - i * 10, fps, config: { damping: 12 } });
          const moveX = d.baseX + Math.sin(frame * 0.03 + i * 2) * 30;
          const moveY = d.baseY + Math.cos(frame * 0.025 + i * 3) * 20;
          return (
            <g key={i} opacity={s}>
              {/* Trail */}
              {[...Array(5)].map((_, j) => (
                <circle key={j}
                  cx={moveX - Math.sin(frame * 0.03 + i * 2 - j * 0.3) * 30 * (1 - j * 0.15)}
                  cy={moveY - Math.cos(frame * 0.025 + i * 3 - j * 0.3) * 20 * (1 - j * 0.15)}
                  r={3 - j * 0.5} fill={d.color} opacity={0.3 - j * 0.06} />
              ))}
              {/* Dot */}
              <circle cx={moveX} cy={moveY} r={12} fill={d.color}
                style={{ filter: `drop-shadow(0 0 8px ${d.color})` }} />
              <circle cx={moveX} cy={moveY} r={22} fill="none"
                stroke={d.color} strokeWidth="1.5" opacity={0.3 + Math.sin(frame * 0.1 + i) * 0.15} />
              {/* Label */}
              <rect x={moveX + 18} y={moveY - 14} width={120} height={28} rx="14" fill={`${d.color}30`} />
              <text x={moveX + 28} y={moveY + 4} fontSize="14" fill={d.color} fontWeight="700" fontFamily={FB}>{d.name} {d.progress}</text>
            </g>
          );
        })}
      </svg>

      {/* Title */}
      <div style={{
        position: 'absolute', top: 60, left: 80,
        opacity: spring({ frame: frame - 5, fps, config: { damping: 14 } }),
      }}>
        <div style={{ fontFamily: FD, fontSize: 62, fontWeight: 800, color: TEXT, letterSpacing: -3 }}>
          4 coursiers. <span style={{ color: PINK_L }}>Temps réel.</span>
        </div>
        <div style={{ fontSize: 16, color: MUTED, marginTop: 8 }}>
          Suivi GPS live de toute votre flotte sur une carte
        </div>
      </div>

      {/* Stats bar bottom */}
      <div style={{
        position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 20,
        opacity: spring({ frame: frame - 30, fps, config: { damping: 14 } }),
      }}>
        {[
          { val: '160', label: 'dentistes/jour', color: PINK_L },
          { val: '-35%', label: 'km gaspillés', color: GREEN_L },
          { val: '8 min', label: 'anticipation', color: AMBER },
          { val: '100%', label: 'tracé et signé', color: BLUE },
        ].map((s, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '16px 28px',
            background: 'rgba(20,20,31,.9)', border: `1px solid ${s.color}20`,
            borderRadius: 14,
          }}>
            <div style={{ fontFamily: FD, fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 6 — CTA FINALE (6s)
// ═══════════════════════════════════
const SceneCTAFinale: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const btnPulse = Math.sin(frame * 0.06) * 4 + 4;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB, color: TEXT }}>
      {/* Ambient glows */}
      <div style={{ position: 'absolute', top: '30%', left: '20%', width: 500, height: 500, background: `radial-gradient(circle, ${PINK}15, transparent 70%)`, borderRadius: '50%', filter: 'blur(80px)' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: 400, height: 400, background: `radial-gradient(circle, ${INDIGO}10, transparent 70%)`, borderRadius: '50%', filter: 'blur(80px)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 100px' }}>
        <div style={{
          fontFamily: FD, fontSize: 18, fontWeight: 700, color: PINK_L, letterSpacing: 4,
          textTransform: 'uppercase' as const, marginBottom: 24,
          opacity: spring({ frame: frame - 5, fps, config: { damping: 14 } }),
        }}>JADOMI pour prothésistes</div>

        <div style={{
          fontFamily: FD, fontSize: 64, fontWeight: 800, letterSpacing: -3, lineHeight: 1.1, marginBottom: 24,
          opacity: spring({ frame: frame - 12, fps, config: { damping: 14 } }),
          transform: `translateY(${interpolate(spring({ frame: frame - 12, fps, config: { damping: 14 } }), [0, 1], [20, 0])}px)`,
        }}>
          Vos livraisons méritent<br />
          <span style={{ background: `linear-gradient(135deg, ${PINK}, ${PINK_L}, ${AMBER})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            l'excellence.
          </span>
        </div>

        <div style={{
          fontSize: 20, color: MUTED, maxWidth: 580, lineHeight: 1.8, marginBottom: 40,
          opacity: spring({ frame: frame - 22, fps, config: { damping: 14 } }),
        }}>
          160 dentistes. 4 coursiers. GPS temps réel.<br />
          Notifications intelligentes. Zéro perte de temps.
        </div>

        <div style={{
          padding: '20px 52px', borderRadius: 16,
          background: `linear-gradient(135deg, ${PINK}, #9d174d)`,
          fontFamily: FD, fontSize: 22, fontWeight: 800, color: '#fff',
          boxShadow: `0 ${btnPulse}px ${btnPulse * 4}px ${PINK}40`,
          opacity: spring({ frame: frame - 32, fps, config: { damping: 14 } }),
        }}>
          jadomi.fr — Essai gratuit →
        </div>
      </div>

      {/* JADOMI watermark */}
      <div style={{ position: 'absolute', bottom: 30, right: 40, fontFamily: FD, fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,.06)', letterSpacing: 3 }}>
        JADOMI — 100% Made in France
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// SCENE 1b — NOTIFICATION LISTE TRAVAUX (6s)
// Le dentiste reçoit la liste complète
// ═══════════════════════════════════
const SceneListeTravaux: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const buildingIn = spring({ frame: frame - 3, fps, config: { damping: 14 } });
  const assistanteIn = spring({ frame: frame - 15, fps, config: { damping: 12 } });
  const phoneVibrate = frame > 25 && frame < 40 ? Math.sin(frame * 2) * 2 : 0;
  const notifPop = spring({ frame: frame - 35, fps, config: { damping: 10, mass: 0.3 } });
  const listItems = (i: number) => spring({ frame: frame - 50 - i * 8, fps, config: { damping: 12 } });
  const checkReaction = spring({ frame: frame - 90, fps, config: { damping: 8 } });
  const bulleIn = spring({ frame: frame - 100, fps, config: { damping: 10 } });

  const travaux = [
    { type: 'Livraison', ref: 'CAS-0847', desc: 'Couronne 14 céramo', color: GREEN },
    { type: 'Livraison', ref: 'CAS-0912', desc: 'Bridge 45-47', color: GREEN },
    { type: 'Récupération', ref: '', desc: 'Empreinte implant 36', color: AMBER },
  ];

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FB, color: TEXT }}>
      <svg width="1920" height="1080" viewBox="0 0 960 540">
        <defs>
          <radialGradient id="glowLT" cx="30%" cy="50%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="960" height="540" fill="url(#glowLT)" />

        {/* Cabinet dentaire */}
        <g transform={`scale(${buildingIn})`} style={{ transformOrigin: '180px 380px' }}>
          <Building x={30} y={400} width={300} height={200} color="#1a1a2e" label="CABINET DENTAIRE" lit />
          <rect x={140} y={208} width={50} height={50} rx={10} fill={`${GREEN}30`} stroke={GREEN} strokeWidth="1" />
          <rect x={160} y={218} width="10" height="30" rx="2" fill={GREEN} />
          <rect x={150} y={228} width="30" height="10" rx="2" fill={GREEN} />
        </g>

        {/* Assistante dentaire — GRANDE au premier plan */}
        <g opacity={assistanteIn} transform={`translate(${interpolate(assistanteIn, [0, 1], [20, 0])}, 0)`}>
          <Person x={340} y={370} color="#7c3aed" scale={2.2} />
          {/* Bureau / comptoir */}
          <rect x={370} y={348} width={80} height={5} rx="2" fill="#2a2a3e" />
        </g>

        {/* Téléphone dans la main de l'assistante */}
        <g transform={`translate(${phoneVibrate}, ${phoneVibrate * 0.5})`}>
          <g opacity={assistanteIn}>
            {/* Téléphone corps */}
            <rect x={385} y={290} width={50} height={85} rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1" />
            <rect x={389} y={296} width={42} height={70} rx="4" fill="#0f172a" />
            <rect x={403} y={292} width={14} height={3} rx="1.5" fill="#334155" />

            {/* Notification qui pop sur le téléphone */}
            {notifPop > 0.1 && (
              <g opacity={notifPop} transform={`translate(0, ${interpolate(notifPop, [0, 1], [-8, 0])})`}>
                <rect x={391} y={300} width={38} height={56} rx="4" fill={`${PINK}25`} stroke={PINK} strokeWidth="0.5" />
                <circle cx={397} cy={308} r="4" fill={PINK} />
                <text x={397} y={310} textAnchor="middle" fontSize="4" fill="#fff" fontWeight="900">J</text>
                <text x={404} y={308} fontSize="3.5" fill={PINK_L} fontWeight="700">Livreur en route</text>
                <text x={393} y={316} fontSize="3" fill={MUTED}>3 travaux prévus</text>
                {/* Mini liste */}
                {travaux.map((t, i) => (
                  <g key={i} opacity={listItems(i)}>
                    <rect x={393} y={320 + i * 12} width={34} height={10} rx="2" fill={`${t.color}15`} stroke={`${t.color}30`} strokeWidth="0.3" />
                    <text x={395} y={327 + i * 12} fontSize="3" fill={t.color} fontWeight="600">{t.type}</text>
                    <text x={416} y={327 + i * 12} fontSize="2.5" fill={MUTED}>{t.ref || t.desc}</text>
                  </g>
                ))}
              </g>
            )}

            {/* Glow pulsant autour du téléphone */}
            {notifPop > 0.5 && (
              <rect x={383} y={288} width={54} height={89} rx="10" fill="none"
                stroke={PINK} strokeWidth="1.5"
                opacity={0.3 + Math.sin(frame * 0.1) * 0.15} />
            )}
          </g>
        </g>

        {/* Bulle de réaction de l'assistante */}
        {checkReaction > 0.1 && (
          <g opacity={checkReaction} transform={`translate(0, ${interpolate(checkReaction, [0, 1], [5, 0])})`}>
            {/* Bulle */}
            <rect x={310} y={240} width={60} height={30} rx="10" fill="#111" stroke="rgba(255,255,255,.1)" strokeWidth="0.8" />
            <polygon points="340,270 345,278 350,270" fill="#111" />
            <text x={340} y={258} textAnchor="middle" fontSize="14" fill={GREEN_L}>&#x1F44D;</text>
          </g>
        )}

        {/* Bulle texte */}
        {bulleIn > 0.1 && (
          <g opacity={bulleIn} transform={`translate(0, ${interpolate(bulleIn, [0, 1], [5, 0])})`}>
            <rect x={290} y={200} width={120} height={28} rx="8" fill="#111" stroke="rgba(6,182,212,.2)" strokeWidth="0.8" />
            <polygon points="340,228 345,235 350,228" fill="#111" />
            <text x={350} y={218} textAnchor="middle" fontSize="5.5" fill="#22d3ee" fontWeight="600" fontFamily={FB}>Tout est en ordre !</text>
          </g>
        )}
      </svg>

      {/* Grande carte notification — côté droit */}
      <div style={{
        position: 'absolute', top: 80, right: 60, width: 680,
        background: '#111118', border: '2px solid rgba(255,255,255,.08)',
        borderRadius: 28, padding: '28px 32px', boxShadow: `0 40px 100px rgba(0,0,0,.6), 0 0 60px ${PINK}10`,
        opacity: notifPop, transform: `translateY(${interpolate(notifPop, [0, 1], [30, 0])}px)`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14,
            background: `linear-gradient(135deg, ${PINK}, #9d174d)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 900, color: '#fff',
          }}>J</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Notification JADOMI</div>
            <div style={{ fontSize: 13, color: MUTED }}>Le coursier démarre sa tournée</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>8h15</div>
        </div>
        <div style={{ fontSize: 16, color: '#a1a1aa', marginBottom: 14 }}>Travaux prévus pour votre cabinet :</div>
        {/* Liste travaux */}
        {travaux.map((t, i) => {
          const s = listItems(i);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 8,
              background: `${t.color}10`, border: `1px solid ${t.color}20`, borderRadius: 12,
              transform: `translateX(${interpolate(s, [0, 1], [30, 0])}px)`, opacity: s,
            }}>
              <span style={{ fontSize: 15, color: t.color, fontWeight: 700, minWidth: 110 }}>{t.type}</span>
              <div style={{ flex: 1 }}>
                {t.ref && <span style={{ fontSize: 14, color: t.color, fontWeight: 600, marginRight: 8 }}>{t.ref}</span>}
                <span style={{ fontSize: 13, color: MUTED }}>{t.desc}</span>
              </div>
              <div style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                background: `${t.color}15`, color: t.color, fontWeight: 800,
              }}>{t.type === 'Livraison' ? '✓ OK' : 'À PRÉPARER'}</div>
            </div>
          );
        })}
        {/* Footer */}
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(6,182,212,.06)', border: '1px solid rgba(6,182,212,.15)',
          display: 'flex', alignItems: 'center', gap: 8,
          opacity: interpolate(bulleIn, [0, 1], [0, 1]),
        }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ fontSize: 14, color: '#22d3ee', fontWeight: 700 }}>Un travail manque ? Décalez le patient avant l'arrivée</span>
        </div>
      </div>

      {/* Titre en bas à gauche */}
      <div style={{
        position: 'absolute', bottom: 50, left: 60,
        opacity: spring({ frame: frame - 5, fps, config: { damping: 14 } }),
      }}>
        <div style={{ fontFamily: FD, fontSize: 52, fontWeight: 800, letterSpacing: -2, lineHeight: 1.15 }}>
          L'assistante vérifie.<br /><span style={{ color: '#22d3ee' }}>Rien n'est oublié.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════
// MAIN COMPOSITION — 48 SECONDES
// ═══════════════════════════════════
const S = 195; // 6.5 seconds per scene at 30fps

export const TourneesPub: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* Musique de fond — dès le début */}
      <Audio src={staticFile('assets/audio/tournees-music.mp3')} volume={0.7} startFrom={0} />
      {/* 0. Intro accroche */}
      <Sequence from={0} durationInFrames={INTRO_DUR}>
        <SceneIntroAccroche frame={frame} fps={fps} />
      </Sequence>
      {/* 1. Le labo prépare et valide les BL */}
      <Sequence from={INTRO_DUR} durationInFrames={S}>
        <SceneLabo frame={frame - INTRO_DUR} fps={fps} />
      </Sequence>
      {/* 2. Les dentistes reçoivent la liste des travaux */}
      <Sequence from={INTRO_DUR + S} durationInFrames={S}>
        <SceneListeTravaux frame={frame - INTRO_DUR - S} fps={fps} />
      </Sequence>
      {/* 3. Le coursier part — feuille de route */}
      <Sequence from={INTRO_DUR + S * 2} durationInFrames={S}>
        <SceneVanDepart frame={frame - INTRO_DUR - S * 2} fps={fps} />
      </Sequence>
      {/* 4. Notification approche — assistante prépare */}
      <Sequence from={INTRO_DUR + S * 3} durationInFrames={S}>
        <SceneNotifApproche frame={frame - INTRO_DUR - S * 3} fps={fps} />
      </Sequence>
      {/* 5. Arrivée + validation du passage */}
      <Sequence from={INTRO_DUR + S * 4} durationInFrames={S}>
        <SceneArriveeValidation frame={frame - INTRO_DUR - S * 4} fps={fps} />
      </Sequence>
      {/* 6. Suivi GPS temps réel */}
      <Sequence from={INTRO_DUR + S * 5} durationInFrames={S}>
        <SceneGPSLive frame={frame - INTRO_DUR - S * 5} fps={fps} />
      </Sequence>
      {/* 7. CTA finale */}
      <Sequence from={INTRO_DUR + S * 6} durationInFrames={180}>
        <SceneCTAFinale frame={frame - INTRO_DUR - S * 6} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};
