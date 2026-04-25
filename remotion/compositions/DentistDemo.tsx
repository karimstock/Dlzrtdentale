/**
 * JADOMI Remotion — Demo Interface Dentiste
 * Passe 44 — Transition page-flip 3D entre les 5 ecrans
 * Rendu artistique : spring physics, blur, glow, parallax
 */
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, spring, Sequence,
} from 'remotion';

const SCREENS = [
  {
    title: 'Stock — Inventaire intelligent',
    icon: '📦',
    badge: '247 references',
    stats: [
      { val: '247', lbl: 'References', color: '#6366f1', delta: '+12 ce mois' },
      { val: '12', lbl: 'Critiques', color: '#ef4444', delta: 'Action requise' },
      { val: '28', lbl: 'Faibles', color: '#06b6d4', delta: 'A surveiller' },
      { val: '1 840€', lbl: 'Economies', color: '#10b981', delta: '+23%' },
    ],
    rows: [
      ['Composite A2 Filtek Supreme', '3', 'Critique', '#fca5a5'],
      ['Anesth. Articaine 4%', '48', 'OK', '#6ee7b7'],
      ['Gants nitrile M (x100)', '8', 'Faible', '#fcd34d'],
      ['Ciment verre ionomere GC', '2', 'Critique', '#fca5a5'],
    ],
  },
  {
    title: 'Scanner IA — Import factures',
    icon: '📄',
    badge: 'IA Claude',
    scanner: true,
    rows: [
      ['FAC-2026-0342', 'Henry Schein', '1 247€', '#6ee7b7'],
      ['FAC-2026-0341', 'GACD', '483€', '#6ee7b7'],
      ['FAC-2026-0340', 'Dental Express', '892€', '#6ee7b7'],
    ],
  },
  {
    title: 'Paniers groupes',
    icon: '🤝',
    badge: '4 campagnes',
    cards: [
      { name: 'Composite A2', pct: 80, discount: '-22%', color: '#6366f1' },
      { name: 'Articaine 4%', pct: 60, discount: '-18%', color: '#06b6d4' },
      { name: 'Gants nitrile', pct: 100, discount: '-25%', color: '#10b981' },
      { name: 'Gutta percha', pct: 40, discount: '-15%', color: '#f59e0b' },
    ],
  },
  {
    title: 'SOS Stock — Urgences confreres',
    icon: '🆘',
    badge: 'Solidarite',
    sos: true,
  },
  {
    title: 'JADOMI Green',
    icon: '🌱',
    badge: 'Eco-responsable',
    green: [
      { ico: '♻️', lbl: 'Produits sauves', val: '34' },
      { ico: '💰', lbl: 'Economies', val: '892€' },
      { ico: '🌍', lbl: 'CO2 evite', val: '12kg' },
    ],
  },
];

const DURATION_PER_SCREEN = 105; // 3.5s at 30fps
const TRANSITION = 20; // transition frames

const Sidebar: React.FC<{ activeIdx: number; frame: number }> = ({ activeIdx, frame }) => {
  const items = [
    { icon: '📦', name: 'Stock', idx: 0 },
    { icon: '📄', name: 'Scanner IA', idx: 1 },
    { icon: '🤝', name: 'Paniers groupes', idx: 2 },
    { icon: '🆘', name: 'SOS Stock', idx: 3 },
    { icon: '🌱', name: 'JADOMI Green', idx: 4 },
  ];

  return (
    <div style={{
      width: 200, background: 'linear-gradient(180deg,#0a1628,#0d1a30,#080e1c)',
      borderRight: '1px solid rgba(99,102,241,.1)', padding: '14px 0',
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'linear-gradient(180deg,#6366f1,#8b5cf6,#06b6d4,transparent)' }} />
      <div style={{ padding: '14px 18px 20px', fontSize: 18, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg,#6366f1,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        JADOMI<span style={{ fontSize: 8, color: '#c9a961', WebkitTextFillColor: '#c9a961', verticalAlign: 'super', marginLeft: 2, letterSpacing: 1 }}>IA</span>
      </div>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#334155', padding: '10px 18px 4px', textTransform: 'uppercase' as const, letterSpacing: 1.5 }}>Cabinet</div>
      {items.slice(0, 2).map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: 11,
          color: activeIdx === item.idx ? '#a5b4fc' : '#64748b', fontWeight: activeIdx === item.idx ? 600 : 400,
          background: activeIdx === item.idx ? 'rgba(99,102,241,.08)' : 'transparent',
          borderLeft: `2px solid ${activeIdx === item.idx ? '#6366f1' : 'transparent'}`,
          transition: 'all .3s',
        }}>{item.icon} {item.name}</div>
      ))}
      <div style={{ fontSize: 8, fontWeight: 700, color: '#334155', padding: '10px 18px 4px', textTransform: 'uppercase' as const, letterSpacing: 1.5 }}>Achats</div>
      {items.slice(2, 3).map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: 11,
          color: activeIdx === item.idx ? '#a5b4fc' : '#64748b', fontWeight: activeIdx === item.idx ? 600 : 400,
          background: activeIdx === item.idx ? 'rgba(99,102,241,.08)' : 'transparent',
          borderLeft: `2px solid ${activeIdx === item.idx ? '#6366f1' : 'transparent'}`,
        }}>{item.icon} {item.name}</div>
      ))}
      <div style={{ fontSize: 8, fontWeight: 700, color: '#334155', padding: '10px 18px 4px', textTransform: 'uppercase' as const, letterSpacing: 1.5 }}>Communaute</div>
      {items.slice(3).map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: 11,
          color: activeIdx === item.idx ? '#a5b4fc' : '#64748b', fontWeight: activeIdx === item.idx ? 600 : 400,
          background: activeIdx === item.idx ? 'rgba(99,102,241,.08)' : 'transparent',
          borderLeft: `2px solid ${activeIdx === item.idx ? '#6366f1' : 'transparent'}`,
        }}>{item.icon} {item.name}</div>
      ))}
    </div>
  );
};

const ScreenContent: React.FC<{ screen: typeof SCREENS[0]; frame: number; fps: number }> = ({ screen, frame, fps }) => {
  const stagger = (i: number) => spring({ frame: frame - i * 4, fps, config: { damping: 15, mass: 0.5 } });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 48, background: 'linear-gradient(90deg,#0f172a,#111827)', borderBottom: '1px solid rgba(99,102,241,.06)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{screen.icon} {screen.title}</span>
        <span style={{ fontSize: 9, background: 'rgba(99,102,241,.1)', color: '#a5b4fc', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{screen.badge}</span>
      </div>
      <div style={{ flex: 1, padding: 18, overflow: 'hidden' }}>
        {screen.stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {screen.stats.map((s, i) => {
              const scale = stagger(i);
              return (
                <div key={i} style={{
                  padding: 16, borderRadius: 12,
                  background: `linear-gradient(135deg,${s.color}18,${s.color}08)`,
                  border: `1px solid ${s.color}25`,
                  transform: `scale(${scale})`, opacity: scale,
                }}>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1 }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{s.lbl}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: s.color === '#ef4444' ? '#fca5a5' : '#34d399', marginTop: 4 }}>{s.delta}</div>
                </div>
              );
            })}
          </div>
        )}
        {screen.rows && (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(99,102,241,.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 16px', fontSize: 9, fontWeight: 600, color: '#475569', textTransform: 'uppercase' as const, background: 'rgba(15,23,42,.8)' }}>
              <span>{screen.scanner ? 'Facture' : 'Produit'}</span><span>{screen.scanner ? 'Fournisseur' : 'Stock'}</span><span>{screen.scanner ? 'Montant' : 'Statut'}</span>
            </div>
            {screen.rows.map((r, i) => {
              const y = interpolate(stagger(i + 2), [0, 1], [20, 0]);
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '11px 16px', fontSize: 11,
                  borderTop: '1px solid rgba(99,102,241,.04)', transform: `translateY(${y}px)`, opacity: stagger(i + 2),
                }}>
                  <span>{r[0]}</span><span>{r[1]}</span>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 600, background: r[3] + '18', color: r[3] }}>{r[2]}</span>
                </div>
              );
            })}
          </div>
        )}
        {screen.cards && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {screen.cards.map((c, i) => {
              const s = stagger(i);
              return (
                <div key={i} style={{
                  background: 'rgba(30,41,59,.6)', border: '1px solid rgba(99,102,241,.06)', borderRadius: 12, padding: 18,
                  transform: `scale(${s})`, opacity: s,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🦷 {c.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.pct === 100 ? 'Complet !' : `${c.pct}%`} · <span style={{ color: '#10b981', fontWeight: 600 }}>{c.discount}</span></div>
                  <div style={{ height: 5, background: 'rgba(30,41,59,.8)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${interpolate(s, [0, 1], [0, c.pct])}%`, height: '100%', background: `linear-gradient(90deg,${c.color},${c.color}aa)`, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {screen.green && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {screen.green.map((g, i) => {
              const s = stagger(i);
              return (
                <div key={i} style={{
                  background: 'linear-gradient(135deg,rgba(16,185,129,.06),rgba(20,184,166,.03))',
                  border: '1px solid rgba(16,185,129,.1)', borderRadius: 12, padding: 18, textAlign: 'center' as const,
                  transform: `scale(${s})`, opacity: s,
                }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>{g.ico}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{g.lbl}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{g.val}</div>
                </div>
              );
            })}
          </div>
        )}
        {screen.sos && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { title: '🚨 Demande urgente', desc: 'Dr. Martin (2km) cherche 3x Composite A2', accent: '#ef4444' },
              { title: '✅ Resolu hier', desc: 'Dr. Leroy vous a prete 5x Articaine', accent: '#10b981' },
            ].map((c, i) => {
              const s = stagger(i);
              return (
                <div key={i} style={{
                  background: 'rgba(30,41,59,.6)', border: `1px solid ${c.accent}25`, borderRadius: 12, padding: 18,
                  transform: `scale(${s})`, opacity: s,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6 }}>{c.desc}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const DentistDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalDuration = SCREENS.length * DURATION_PER_SCREEN;
  const loopFrame = frame % totalDuration;
  const screenIdx = Math.floor(loopFrame / DURATION_PER_SCREEN);
  const screenFrame = loopFrame % DURATION_PER_SCREEN;

  // Page flip transition
  const isTransitioning = screenFrame > DURATION_PER_SCREEN - TRANSITION;
  const transProgress = isTransitioning ? (screenFrame - (DURATION_PER_SCREEN - TRANSITION)) / TRANSITION : 0;

  const rotateY = interpolate(transProgress, [0, 1], [0, -90]);
  const scale = interpolate(transProgress, [0, 0.5, 1], [1, 0.92, 0.85]);
  const blur = interpolate(transProgress, [0, 1], [0, 8]);
  const opacity = interpolate(transProgress, [0, 0.8, 1], [1, 0.6, 0]);

  // Enter animation for new screen
  const enterRotate = screenFrame < TRANSITION ? interpolate(screenFrame, [0, TRANSITION], [90, 0]) : 0;
  const enterScale = screenFrame < TRANSITION ? interpolate(screenFrame, [0, TRANSITION], [0.85, 1]) : 1;
  const enterBlur = screenFrame < TRANSITION ? interpolate(screenFrame, [0, TRANSITION], [8, 0]) : 0;
  const enterOpacity = screenFrame < TRANSITION ? interpolate(screenFrame, [0, TRANSITION], [0, 1]) : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: '#080b14', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', height: '100%' }}>
        <Sidebar activeIdx={screenIdx} frame={frame} />
        <div style={{ flex: 1, position: 'relative', perspective: 1200, overflow: 'hidden' }}>
          {/* Current screen */}
          <div style={{
            position: 'absolute', inset: 0,
            transform: `rotateY(${isTransitioning ? rotateY : enterRotate}deg) scale(${isTransitioning ? scale : enterScale})`,
            filter: `blur(${isTransitioning ? blur : enterBlur}px)`,
            opacity: isTransitioning ? opacity : enterOpacity,
            transformOrigin: 'left center',
            backfaceVisibility: 'hidden' as const,
          }}>
            <ScreenContent screen={SCREENS[screenIdx]} frame={screenFrame} fps={fps} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
