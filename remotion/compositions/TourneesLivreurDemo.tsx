/**
 * JADOMI Remotion — Tournées Livreur Prothésiste
 * Pub cinématique : 7 scènes animées ~60s
 * Flow : Dentiste valide → Production → Coursier → Recalcul → Notification → Arrivée → Validation
 */
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  interpolate, spring, Sequence, Easing,
} from 'remotion';

// ═══════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════
const PINK = '#be185d';
const PINK_LIGHT = '#f472b6';
const GREEN = '#10b981';
const GREEN_LIGHT = '#4ade80';
const BLUE = '#3b82f6';
const BLUE_LIGHT = '#60a5fa';
const AMBER = '#f59e0b';
const AMBER_LIGHT = '#fbbf24';
const RED = '#ef4444';
const INDIGO = '#6366f1';
const BG = '#0a0a0f';
const SURFACE = '#111118';
const TEXT = '#fafafa';
const MUTED = '#71717a';
const FONT = 'Inter, system-ui, sans-serif';
const FONT_DISPLAY = 'Syne, sans-serif';

// ═══════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════

const Glow: React.FC<{
  x: string; y: string; color: string; size?: number; opacity?: number;
}> = ({ x, y, color, size = 400, opacity = 0.15 }) => (
  <div style={{
    position: 'absolute', left: x, top: y, width: size, height: size,
    background: `radial-gradient(circle, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}, transparent 70%)`,
    borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
  }} />
);

const Badge: React.FC<{
  text: string; color: string; frame: number; fps: number; delay?: number;
}> = ({ text, color, frame, fps, delay = 0 }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, mass: 0.4 } });
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 16px', borderRadius: 100,
      background: `${color}18`, border: `1px solid ${color}40`,
      fontSize: 13, fontWeight: 700, letterSpacing: 2,
      textTransform: 'uppercase' as const, color,
      transform: `scale(${s}) translateY(${interpolate(s, [0, 1], [20, 0])}px)`,
      opacity: s,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {text}
    </div>
  );
};

const FadeSlide: React.FC<{
  children: React.ReactNode; frame: number; fps: number; delay?: number; direction?: 'up' | 'down' | 'left' | 'right';
}> = ({ children, frame, fps, delay = 0, direction = 'up' }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.5 } });
  const offsets = { up: [40, 0], down: [-40, 0], left: [0, 40], right: [0, -40] };
  const [dy, dx] = offsets[direction] || [40, 0];
  return (
    <div style={{
      transform: `translate(${interpolate(s, [0, 1], [dx, 0])}px, ${interpolate(s, [0, 1], [dy, 0])}px)`,
      opacity: s,
    }}>
      {children}
    </div>
  );
};

// KPI Stat block
const StatBlock: React.FC<{
  value: string; label: string; color: string; frame: number; fps: number; delay: number;
}> = ({ value, label, color, frame, fps, delay }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 12 } });
  return (
    <div style={{
      textAlign: 'center', padding: '18px 24px',
      background: `${color}10`, border: `1px solid ${color}25`,
      borderRadius: 16, transform: `scale(${s})`, opacity: s,
    }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
};

// Route stop card
const StopCard: React.FC<{
  num: number; name: string; city: string; status: 'done' | 'active' | 'pending';
  frame: number; fps: number; delay: number;
}> = ({ num, name, city, status, frame, fps, delay }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.4 } });
  const colors = {
    done: { bg: `${GREEN}12`, border: `${GREEN}30`, dot: GREEN, text: '#a1a1aa', check: true },
    active: { bg: `${PINK}15`, border: `${PINK}40`, dot: PINK, text: PINK_LIGHT, check: false },
    pending: { bg: 'rgba(255,255,255,.02)', border: 'rgba(255,255,255,.06)', dot: '#333', text: '#52525b', check: false },
  };
  const c = colors[status];
  const pulse = status === 'active' ? Math.sin(frame * 0.1) * 0.02 + 1 : 1;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12,
      transform: `scale(${s * pulse}) translateX(${interpolate(s, [0, 1], [30, 0])}px)`,
      opacity: s,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: c.dot,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color: '#fff',
        boxShadow: status === 'active' ? `0 0 16px ${PINK}60` : 'none',
      }}>{c.check ? '✓' : num}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{name}</div>
        <div style={{ fontSize: 11, color: '#52525b' }}>{city}</div>
      </div>
      {status === 'active' && (
        <div style={{ fontSize: 11, fontWeight: 700, color: PINK_LIGHT, padding: '3px 10px', borderRadius: 6, background: `${PINK}20` }}>EN ROUTE</div>
      )}
      {status === 'done' && (
        <div style={{ fontSize: 11, color: GREEN_LIGHT }}>✓</div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════
// SCENE 1 — INTRO TITRE
// ═══════════════════════════════════════
const SceneIntro: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="50%" y="40%" color={PINK} size={600} opacity={0.12} />
      <Glow x="30%" y="70%" color={INDIGO} size={400} opacity={0.08} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 100px' }}>
        <FadeSlide frame={frame} fps={fps} delay={5}>
          <Badge text="Module exclusif" color={PINK_LIGHT} frame={frame} fps={fps} delay={5} />
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={15}>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 72, fontWeight: 800, letterSpacing: -3, margin: '30px 0 20px', lineHeight: 1.1 }}>
            Tournées livreur<br />
            <span style={{ background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              intelligentes
            </span>
          </h1>
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={25}>
          <p style={{ fontSize: 22, color: MUTED, maxWidth: 650, lineHeight: 1.7 }}>
            Du bon de travail validé à la livraison au cabinet.<br />
            Chaque étape tracée, optimisée, notifiée.
          </p>
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={40}>
          <div style={{ display: 'flex', gap: 20, marginTop: 40 }}>
            <StatBlock value="160" label="dentistes/jour" color={PINK_LIGHT} frame={frame} fps={fps} delay={42} />
            <StatBlock value="4" label="coursiers" color={GREEN_LIGHT} frame={frame} fps={fps} delay={46} />
            <StatBlock value="GPS" label="temps réel" color={BLUE_LIGHT} frame={frame} fps={fps} delay={50} />
            <StatBlock value="-35%" label="km gaspillés" color={AMBER_LIGHT} frame={frame} fps={fps} delay={54} />
          </div>
        </FadeSlide>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 2 — DENTISTE VALIDE LE BON
// ═══════════════════════════════════════
const SceneLaboPrepareBL: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const checkScale = spring({ frame: frame - 50, fps, config: { damping: 8, mass: 0.3 } });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="70%" y="30%" color={GREEN} size={500} opacity={0.1} />
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Left side */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <FadeSlide frame={frame} fps={fps} delay={5}>
            <Badge text="Étape 01 — Le labo prépare" color={PINK_LIGHT} frame={frame} fps={fps} delay={3} />
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={15}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 48, fontWeight: 800, letterSpacing: -2, margin: '24px 0 16px', lineHeight: 1.15 }}>
              Le labo finalise et<br /><span style={{ color: PINK_LIGHT }}>crée le bon de livraison</span>
            </h2>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={25}>
            <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.8, maxWidth: 450 }}>
              La prothèse est prête. Le prothésiste valide le BL,<br />
              assigne le dentiste et ajoute le travail à la tournée du jour.
            </p>
          </FadeSlide>
        </div>
        {/* Right side — Mockup */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FadeSlide frame={frame} fps={fps} delay={20} direction="left">
            <div style={{
              width: 440, background: SURFACE, border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 20, padding: 28, boxShadow: '0 30px 80px rgba(0,0,0,.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${GREEN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✓</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Bon de livraison #BL-2026-0847</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Votre labo → Cabinet destinataire</div>
                </div>
              </div>
              {/* Tags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {[
                  { text: 'Couronne céramo-métallique', color: PINK },
                  { text: 'Teinte A3', color: BLUE },
                  { text: 'Délai 5j', color: AMBER },
                  { text: 'Priorité urgente', color: RED },
                ].map((tag, i) => {
                  const s = spring({ frame: frame - 35 - i * 5, fps, config: { damping: 12 } });
                  return (
                    <span key={i} style={{
                      fontSize: 12, padding: '5px 12px', borderRadius: 8,
                      background: `${tag.color}15`, border: `1px solid ${tag.color}30`, color: tag.color,
                      fontWeight: 600, transform: `scale(${s})`, opacity: s,
                    }}>{tag.text}</span>
                  );
                })}
              </div>
              {/* Validation bar */}
              <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: `${GREEN}10`, border: `1px solid ${GREEN}25`,
                display: 'flex', alignItems: 'center', gap: 10,
                transform: `scale(${checkScale})`, opacity: checkScale,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN_LIGHT, boxShadow: `0 0 12px ${GREEN}80` }} />
                <span style={{ fontSize: 14, color: GREEN_LIGHT, fontWeight: 700 }}>Ajouté à la tournée — Coursier B, arrêt #8</span>
              </div>
            </div>
          </FadeSlide>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 3 — FEUILLE DE ROUTE COURSIER
// ═══════════════════════════════════════
const SceneFeuilleRoute: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const stops = [
    { num: 1, name: 'Cabinet A.', city: 'Lille Centre', status: 'done' as const },
    { num: 2, name: 'Cabinet B.', city: 'Roubaix', status: 'done' as const },
    { num: 3, name: 'Votre cabinet Karim', city: '72 rue du Coq Français', status: 'active' as const },
    { num: 4, name: 'Cabinet D.', city: 'Tourcoing', status: 'pending' as const },
    { num: 5, name: 'Cabinet C.', city: 'Wattrelos', status: 'pending' as const },
  ];

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="25%" y="50%" color={INDIGO} size={500} opacity={0.1} />
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Left — Route card */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FadeSlide frame={frame} fps={fps} delay={10} direction="right">
            <div style={{
              width: 420, background: SURFACE, border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 20, padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${GREEN}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🚚</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Votre coursier</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Secteur Roubaix/Tourcoing — Matin</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {stops.map((s, i) => (
                  <StopCard key={i} {...s} frame={frame} fps={fps} delay={15 + i * 8} />
                ))}
              </div>
              {/* Stats bar */}
              <FadeSlide frame={frame} fps={fps} delay={55}>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { val: '34 km', label: 'Distance', color: INDIGO },
                    { val: '1h45', label: 'Durée', color: AMBER },
                    { val: '20', label: 'Arrêts', color: GREEN },
                  ].map((s, i) => (
                    <div key={i} style={{
                      flex: 1, textAlign: 'center', padding: '10px 8px',
                      background: `${s.color}10`, border: `1px solid ${s.color}20`, borderRadius: 10,
                    }}>
                      <div style={{ fontSize: 10, color: MUTED }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: FONT_DISPLAY }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </FadeSlide>
            </div>
          </FadeSlide>
        </div>
        {/* Right — Description */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <FadeSlide frame={frame} fps={fps} delay={5}>
            <Badge text="Étape 02 — Feuille de route" color={BLUE_LIGHT} frame={frame} fps={fps} delay={5} />
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={15}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: '24px 0 16px', lineHeight: 1.15 }}>
              Itinéraire optimisé,<br />routage intelligent
            </h2>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={25}>
            <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.8 }}>
              20 arrêts matin, 20 après-midi.<br />
              Waze ou Google Maps intégré.<br />
              Chaque arrêt : type, priorité, références.
            </p>
          </FadeSlide>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 4 — RECALCUL EN COURS DE ROUTE
// ═══════════════════════════════════════
const SceneRecalcul: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const cancelBounce = spring({ frame: frame - 20, fps, config: { damping: 10, mass: 0.3 } });
  const recalcBounce = spring({ frame: frame - 50, fps, config: { damping: 10, mass: 0.3 } });
  const savedBounce = spring({ frame: frame - 70, fps, config: { damping: 8, mass: 0.3 } });
  const strikethrough = interpolate(frame, [35, 45], [0, 100], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="50%" y="50%" color={AMBER} size={500} opacity={0.1} />
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <FadeSlide frame={frame} fps={fps} delay={5}>
            <Badge text="Étape 03 — Recalcul IA" color={AMBER_LIGHT} frame={frame} fps={fps} delay={5} />
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={12}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: '24px 0 16px', lineHeight: 1.15 }}>
              Un dentiste annule ?<br />
              <span style={{ color: AMBER_LIGHT }}>Route recalculée.</span>
            </h2>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={22}>
            <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.8 }}>
              JADOMI vérifie que le prothésiste n'a rien non plus pour ce dentiste, supprime l'arrêt et recalcule la feuille de route en temps réel.
            </p>
          </FadeSlide>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Cancel notification */}
            <div style={{
              background: `${RED}10`, border: `1px solid ${RED}25`, borderRadius: 16, padding: 20,
              display: 'flex', alignItems: 'center', gap: 14,
              transform: `scale(${cancelBounce}) translateY(${interpolate(cancelBounce, [0, 1], [30, 0])}px)`,
              opacity: cancelBounce,
            }}>
              <div style={{ fontSize: 28 }}>🔔</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f87171' }}>Cabinet C. — Annulation</div>
                <div style={{ fontSize: 12, color: MUTED }}>"Pas de travaux à récupérer aujourd'hui"</div>
              </div>
            </div>
            {/* Strikethrough old route */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
              background: 'rgba(255,255,255,.02)', borderRadius: 10, position: 'relative',
              opacity: frame > 30 ? 0.4 : 0.7,
            }}>
              <span style={{ fontSize: 13, color: MUTED }}>Ancien itinéraire : 20 arrêts — 38 km — 2h10</span>
              <div style={{
                position: 'absolute', left: 16, top: '50%', height: 2, background: RED,
                width: `${strikethrough}%`, transform: 'translateY(-50%)',
              }} />
            </div>
            {/* New route */}
            <div style={{
              background: `${GREEN}10`, border: `1px solid ${GREEN}25`, borderRadius: 16, padding: 20,
              display: 'flex', alignItems: 'center', gap: 14,
              transform: `scale(${recalcBounce})`, opacity: recalcBounce,
            }}>
              <div style={{ fontSize: 28 }}>⚡</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: GREEN_LIGHT }}>Nouvelle feuille de route</div>
                <div style={{ fontSize: 12, color: MUTED }}>19 arrêts — 34 km — 1h58</div>
              </div>
            </div>
            {/* Time saved */}
            <div style={{
              textAlign: 'center', padding: 20,
              background: `${AMBER}08`, border: `1px solid ${AMBER}20`, borderRadius: 16,
              transform: `scale(${savedBounce})`, opacity: savedBounce,
            }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 48, fontWeight: 800, color: AMBER_LIGHT }}>12 min</div>
              <div style={{ fontSize: 14, color: MUTED }}>gagnées sur la tournée</div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 5 — NOTIFICATION DENTISTE
// ═══════════════════════════════════════
const SceneNotification: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const phoneSlide = spring({ frame: frame - 10, fps, config: { damping: 14, mass: 0.6 } });
  const notifDrop = spring({ frame: frame - 30, fps, config: { damping: 10, mass: 0.3 } });
  const notif2 = spring({ frame: frame - 55, fps, config: { damping: 10, mass: 0.3 } });
  const pulseGlow = Math.sin(frame * 0.08) * 0.15 + 0.85;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="40%" y="50%" color={PINK} size={600} opacity={0.12} />
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Phone mockup */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 340, background: '#111118',
            border: '2px solid rgba(255,255,255,.08)', borderRadius: 36,
            padding: '40px 20px 30px', boxShadow: `0 40px 100px rgba(0,0,0,.6), 0 0 60px ${PINK}15`,
            transform: `translateY(${interpolate(phoneSlide, [0, 1], [60, 0])}px)`,
            opacity: phoneSlide,
          }}>
            {/* Notch */}
            <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,.1)', borderRadius: 3, margin: '-20px auto 24px' }} />
            {/* Notification 1 */}
            <div style={{
              background: `linear-gradient(135deg, ${PINK}22, ${PINK}08)`,
              border: `1px solid ${PINK}40`, borderRadius: 18, padding: 18, marginBottom: 14,
              transform: `scale(${notifDrop}) translateY(${interpolate(notifDrop, [0, 1], [-30, 0])}px)`,
              opacity: notifDrop, boxShadow: `0 0 ${30 * pulseGlow}px ${PINK}30`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `linear-gradient(135deg, ${PINK}, #9d174d)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 900, color: '#fff',
                }}>J</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>JADOMI</div>
                <div style={{ fontSize: 10, color: MUTED, marginLeft: 'auto' }}>maintenant</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: PINK_LIGHT, marginBottom: 6 }}>
                Votre livreur arrive dans 8 minutes
              </div>
              <div style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.6 }}>
                Votre coursier est en route vers le 72 rue du Coq Français avec votre prothèse.
              </div>
            </div>
            {/* Notification 2 */}
            <div style={{
              background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 18, padding: 14,
              transform: `scale(${notif2})`, opacity: notif2 * 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: `${GREEN}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: GREEN_LIGHT }}>✓</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa' }}>il y a 35 min</div>
              </div>
              <div style={{ fontSize: 12, color: '#52525b' }}>Livreur en route vers votre secteur.</div>
            </div>
          </div>
        </div>
        {/* Right — text */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <FadeSlide frame={frame} fps={fps} delay={5}>
            <Badge text="Étape 04 — Notification" color={PINK_LIGHT} frame={frame} fps={fps} delay={5} />
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={15}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: '24px 0 16px', lineHeight: 1.15 }}>
              Le dentiste sait<br />
              <span style={{ color: PINK_LIGHT }}>avant que ça sonne</span>
            </h2>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={25}>
            <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.8 }}>
              Dès que le coursier termine chez le dentiste précédent, JADOMI notifie le suivant.<br /><br />
              L'assistante prépare la boîte.<br />
              <span style={{ color: TEXT, fontWeight: 600 }}>Zéro temps perdu, zéro surprise.</span>
            </p>
          </FadeSlide>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 6 — APP LIVREUR + VALIDATION
// ═══════════════════════════════════════
const SceneValidation: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const btnPress = frame > 65 ? spring({ frame: frame - 65, fps, config: { damping: 8, mass: 0.2 } }) : 0;
  const confetti = frame > 70 ? spring({ frame: frame - 70, fps, config: { damping: 12 } }) : 0;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="60%" y="50%" color={GREEN} size={500} opacity={0.1} />
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
          <FadeSlide frame={frame} fps={fps} delay={5}>
            <Badge text="Étape 05 — Validation" color={GREEN_LIGHT} frame={frame} fps={fps} delay={5} />
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={12}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: '24px 0 16px', lineHeight: 1.15 }}>
              Le livreur arrive,<br />
              <span style={{ color: GREEN_LIGHT }}>la secrétaire valide</span>
            </h2>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={22}>
            <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.8 }}>
              Échange des colis, bon de passage signé numériquement.<br />
              Le prothésiste voit tout en temps réel.
            </p>
          </FadeSlide>
        </div>
        {/* Phone app livreur */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FadeSlide frame={frame} fps={fps} delay={10} direction="left">
            <div style={{
              width: 300, background: '#111118',
              border: '2px solid rgba(255,255,255,.08)', borderRadius: 36,
              padding: '40px 20px 30px', boxShadow: '0 40px 100px rgba(0,0,0,.6)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,.1)', borderRadius: 3, margin: '-20px auto 20px' }} />
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>App Livreur — Coursier 1</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, marginTop: 8 }}>Arrêt #8</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: PINK_LIGHT, marginTop: 4 }}>Votre cabinet Karim</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Adresse du cabinet</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                {[
                  { label: 'Type', value: 'Livraison', color: PINK },
                  { label: 'Priorité', value: 'Urgent', color: RED },
                  { label: 'Colis', value: '2', color: GREEN },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: 1, textAlign: 'center', padding: '8px 4px',
                    background: `${s.color}12`, border: `1px solid ${s.color}25`, borderRadius: 10,
                  }}>
                    <div style={{ fontSize: 9, color: MUTED }}>{s.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Button */}
              <div style={{
                padding: '16px 20px', borderRadius: 14,
                background: confetti > 0.5 ? `linear-gradient(135deg, ${GREEN}, #059669)` : `linear-gradient(135deg, ${GREEN}, #059669)`,
                textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#fff',
                transform: `scale(${1 - btnPress * 0.05 + confetti * 0.05})`,
                boxShadow: `0 8px 30px ${GREEN}40`,
              }}>
                {confetti > 0.5 ? '✓ Passage validé !' : '✓ Valider le passage'}
              </div>
              {/* Confetti effect */}
              {confetti > 0.2 && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {[...Array(12)].map((_, i) => {
                    const angle = (i / 12) * Math.PI * 2;
                    const dist = confetti * 120;
                    const x = 150 + Math.cos(angle) * dist;
                    const y = 250 + Math.sin(angle) * dist - confetti * 40;
                    const colors = [PINK, GREEN, AMBER, BLUE, INDIGO];
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: x, top: y,
                        width: 6, height: 6, borderRadius: i % 2 === 0 ? '50%' : 0,
                        background: colors[i % colors.length],
                        opacity: 1 - confetti * 0.5,
                        transform: `rotate(${confetti * 360}deg)`,
                      }} />
                    );
                  })}
                </div>
              )}
            </div>
          </FadeSlide>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 7 — GPS LIVE + MAP
// ═══════════════════════════════════════
const SceneGPS: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const drivers = [
    { name: 'Coursier A', color: INDIGO, x: 28, y: 32, progress: '14/20' },
    { name: 'Coursier B', color: GREEN, x: 58, y: 48, progress: '8/20' },
    { name: 'Coursier C', color: AMBER, x: 42, y: 68, progress: '11/20' },
    { name: 'Coursier D', color: RED, x: 75, y: 38, progress: '16/20' },
  ];

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Map */}
        <div style={{ flex: 1.3, position: 'relative', background: 'linear-gradient(135deg, #0f1923, #162133)', overflow: 'hidden' }}>
          {/* Grid lines */}
          {[...Array(12)].map((_, i) => (
            <React.Fragment key={i}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 8}%`, height: 1, background: 'rgba(255,255,255,.03)' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i + 1) * 8}%`, width: 1, background: 'rgba(255,255,255,.03)' }} />
            </React.Fragment>
          ))}
          {/* Roads */}
          <div style={{ position: 'absolute', top: '20%', left: '5%', width: '90%', height: 2, background: 'rgba(255,255,255,.06)', transform: 'rotate(-8deg)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '10%', width: '80%', height: 2, background: 'rgba(255,255,255,.06)', transform: 'rotate(5deg)' }} />
          <div style={{ position: 'absolute', top: '10%', left: '40%', width: 2, height: '80%', background: 'rgba(255,255,255,.06)', transform: 'rotate(12deg)' }} />
          {/* City labels */}
          <FadeSlide frame={frame} fps={fps} delay={10}>
            <div style={{ position: 'absolute', top: '15%', left: '20%', fontSize: 11, color: '#334155', fontWeight: 600, letterSpacing: 1 }}>LILLE</div>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={15}>
            <div style={{ position: 'absolute', top: '40%', left: '55%', fontSize: 11, color: '#334155', fontWeight: 600, letterSpacing: 1 }}>ROUBAIX</div>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={20}>
            <div style={{ position: 'absolute', top: '60%', left: '35%', fontSize: 11, color: '#334155', fontWeight: 600, letterSpacing: 1 }}>VDA</div>
          </FadeSlide>
          <FadeSlide frame={frame} fps={fps} delay={25}>
            <div style={{ position: 'absolute', top: '25%', left: '70%', fontSize: 11, color: '#334155', fontWeight: 600, letterSpacing: 1 }}>TOURCOING</div>
          </FadeSlide>
          {/* Driver dots */}
          {drivers.map((d, i) => {
            const s = spring({ frame: frame - 15 - i * 8, fps, config: { damping: 12 } });
            const float = Math.sin((frame + i * 20) * 0.06) * 3;
            return (
              <div key={i} style={{
                position: 'absolute', left: `${d.x}%`, top: `${d.y}%`,
                transform: `translate(-50%, -50%) scale(${s}) translateY(${float}px)`,
                opacity: s,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: d.color,
                  boxShadow: `0 0 20px ${d.color}80, 0 0 40px ${d.color}40`,
                }} />
                <div style={{
                  position: 'absolute', top: 26, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 10, fontWeight: 700, color: d.color, whiteSpace: 'nowrap',
                  background: `${d.color}20`, padding: '2px 8px', borderRadius: 6,
                }}>{d.name} — {d.progress}</div>
              </div>
            );
          })}
          {/* Title overlay */}
          <FadeSlide frame={frame} fps={fps} delay={5}>
            <div style={{ position: 'absolute', top: 30, left: 30 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 2, textTransform: 'uppercase' as const }}>Suivi en direct</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, marginTop: 4 }}>Métropole Lilloise</div>
            </div>
          </FadeSlide>
        </div>
        {/* Right panel */}
        <div style={{ width: 380, background: SURFACE, borderLeft: '1px solid rgba(255,255,255,.06)', padding: 28, display: 'flex', flexDirection: 'column' }}>
          <FadeSlide frame={frame} fps={fps} delay={8}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Tableau de bord temps réel</div>
          </FadeSlide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {[
              { val: '4', label: 'En route', color: BLUE },
              { val: '127', label: 'Livrés', color: GREEN },
              { val: '33', label: 'Restants', color: AMBER },
              { val: '142 km', label: 'Parcourus', color: INDIGO },
            ].map((s, i) => (
              <FadeSlide key={i} frame={frame} fps={fps} delay={20 + i * 6}>
                <div style={{
                  textAlign: 'center', padding: 14,
                  background: `${s.color}08`, border: `1px solid ${s.color}15`, borderRadius: 12,
                }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{s.label}</div>
                </div>
              </FadeSlide>
            ))}
          </div>
          {/* Driver list */}
          {drivers.map((d, i) => (
            <FadeSlide key={i} frame={frame} fps={fps} delay={40 + i * 6}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8,
                background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)', borderRadius: 10,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, boxShadow: `0 0 8px ${d.color}60` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: d.color }}>{d.progress}</div>
                <div style={{ fontSize: 10, color: MUTED }}>arrêts</div>
              </div>
            </FadeSlide>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// SCENE 8 — CTA FINALE
// ═══════════════════════════════════════
const SceneCTA: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const btnPulse = Math.sin(frame * 0.06) * 4 + 4;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: TEXT }}>
      <Glow x="50%" y="45%" color={PINK} size={700} opacity={0.15} />
      <Glow x="30%" y="60%" color={INDIGO} size={400} opacity={0.08} />
      <Glow x="70%" y="35%" color={GREEN} size={350} opacity={0.06} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 100px' }}>
        <FadeSlide frame={frame} fps={fps} delay={5}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: PINK_LIGHT, letterSpacing: 3, textTransform: 'uppercase' as const, marginBottom: 20 }}>
            JADOMI pour prothésistes
          </div>
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={12}>
          <h2 style={{
            fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 800, letterSpacing: -3, lineHeight: 1.1, marginBottom: 20,
          }}>
            Vos livraisons méritent<br />
            <span style={{
              background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT}, ${AMBER})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>l'excellence.</span>
          </h2>
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={22}>
          <p style={{ fontSize: 20, color: MUTED, maxWidth: 580, lineHeight: 1.8, marginBottom: 40 }}>
            160 dentistes par jour. 4 coursiers. GPS temps réel.<br />
            Notifications intelligentes. Recalcul dynamique.
          </p>
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={32}>
          <div style={{
            padding: '20px 48px', borderRadius: 16,
            background: `linear-gradient(135deg, ${PINK}, #9d174d)`,
            fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 800,
            color: '#fff', letterSpacing: 0.5,
            boxShadow: `0 ${btnPulse}px ${btnPulse * 4}px ${PINK}40`,
          }}>
            Essayer JADOMI gratuitement →
          </div>
        </FadeSlide>
        <FadeSlide frame={frame} fps={fps} delay={42}>
          <div style={{ fontSize: 13, color: '#52525b', marginTop: 20 }}>
            jadomi.fr — 100% Made in France
          </div>
        </FadeSlide>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════
// MAIN COMPOSITION — 60 SECONDES
// ═══════════════════════════════════════
const SCENE_DURATION = 240; // 8 seconds per scene at 30fps
const TRANSITION_FRAMES = 15;

export const TourneesLivreurDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* Scene 1 — Intro (0-7s) */}
      <Sequence from={0} durationInFrames={SCENE_DURATION}>
        <SceneIntro frame={frame} fps={fps} />
      </Sequence>

      {/* Scene 2 — Dentiste valide (8-15s) */}
      <Sequence from={SCENE_DURATION} durationInFrames={SCENE_DURATION}>
        <SceneLaboPrepareBL frame={frame - SCENE_DURATION} fps={fps} />
      </Sequence>

      {/* Scene 3 — Feuille de route (16-23s) */}
      <Sequence from={SCENE_DURATION * 2} durationInFrames={SCENE_DURATION}>
        <SceneFeuilleRoute frame={frame - SCENE_DURATION * 2} fps={fps} />
      </Sequence>

      {/* Scene 4 — Recalcul (24-31s) */}
      <Sequence from={SCENE_DURATION * 3} durationInFrames={SCENE_DURATION}>
        <SceneRecalcul frame={frame - SCENE_DURATION * 3} fps={fps} />
      </Sequence>

      {/* Scene 5 — Notification (32-39s) */}
      <Sequence from={SCENE_DURATION * 4} durationInFrames={SCENE_DURATION}>
        <SceneNotification frame={frame - SCENE_DURATION * 4} fps={fps} />
      </Sequence>

      {/* Scene 6 — Validation livreur (40-47s) */}
      <Sequence from={SCENE_DURATION * 5} durationInFrames={SCENE_DURATION}>
        <SceneValidation frame={frame - SCENE_DURATION * 5} fps={fps} />
      </Sequence>

      {/* Scene 7 — GPS Live (48-55s) */}
      <Sequence from={SCENE_DURATION * 6} durationInFrames={SCENE_DURATION}>
        <SceneGPS frame={frame - SCENE_DURATION * 6} fps={fps} />
      </Sequence>

      {/* Scene 8 — CTA Finale (56-63s) */}
      <Sequence from={SCENE_DURATION * 7} durationInFrames={SCENE_DURATION}>
        <SceneCTA frame={frame - SCENE_DURATION * 7} fps={fps} />
      </Sequence>

      {/* Watermark JADOMI */}
      <div style={{
        position: 'absolute', bottom: 20, right: 30,
        fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 800,
        color: 'rgba(255,255,255,.08)', letterSpacing: 2,
      }}>JADOMI</div>
    </AbsoluteFill>
  );
};
