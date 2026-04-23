/**
 * JADOMI Remotion — Ad Template Composition (v2 - Passe 35.2)
 * Data-driven ad video for advertisers
 * 10 seconds (300 frames @ 30fps), 1920x1080
 */

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { GoldParticles } from '../elements/GoldParticles';

interface AdProps {
  title: string;
  subtitle?: string;
  price: string;
  duration: string;
  location: string;
  logoUrl: string;
  brandColor: string;
  ctaText: string;
  dates?: string;
}

export const AdTemplate: React.FC<AdProps> = ({
  title = 'Formation Implantologie Avancee',
  subtitle = 'Devenez expert en 3 jours',
  price = '1 500 EUR',
  duration = '3 jours intensifs',
  location = 'Paris - Centre JADOMI',
  logoUrl = '',
  brandColor = '#c9a961',
  ctaText = "S'inscrire maintenant",
  dates = '15-17 Mai 2026',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ===== PHASE 1: Intro logo + gold line (0-60 frames / 0-2s) =====
  const introLineWidth = interpolate(frame, [0, 40], [0, 100], { extrapolateRight: 'clamp' });
  const logoScale = spring({ frame, fps, from: 0, to: 1, config: { damping: 12, stiffness: 100 } });
  const logoFade = interpolate(frame, [50, 60], [1, 0], { extrapolateRight: 'clamp' });

  // ===== PHASE 2: Title + subtitle + price (60-180 frames / 2-6s) =====
  const titleSpring = spring({ frame: Math.max(frame - 60, 0), fps, from: 0, to: 1, config: { damping: 15 } });
  const subtitleOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleY = interpolate(frame, [80, 100], [20, 0], { extrapolateRight: 'clamp' });
  const priceScale = spring({ frame: Math.max(frame - 110, 0), fps, from: 0, to: 1, config: { damping: 10, stiffness: 80 } });

  // ===== PHASE 3: Info cards (180-240 frames / 6-8s) =====
  const card1Spring = spring({ frame: Math.max(frame - 180, 0), fps, from: 0, to: 1, config: { damping: 12 } });
  const card2Spring = spring({ frame: Math.max(frame - 195, 0), fps, from: 0, to: 1, config: { damping: 12 } });
  const card3Spring = spring({ frame: Math.max(frame - 210, 0), fps, from: 0, to: 1, config: { damping: 12 } });

  // ===== PHASE 4: CTA + outro (240-300 frames / 8-10s) =====
  const ctaSpring = spring({ frame: Math.max(frame - 240, 0), fps, from: 0, to: 1, config: { damping: 10 } });
  const ctaPulse = frame > 260 ? 1 + Math.sin((frame - 260) * 0.15) * 0.04 : ctaSpring;
  const outroOpacity = interpolate(frame, [270, 290], [0, 1], { extrapolateRight: 'clamp' });

  // Background gradient rotation
  const bgAngle = interpolate(frame, [0, 300], [135, 225]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${bgAngle}deg, #0a0a0f 0%, ${brandColor}12 40%, #0a0a0f 70%, ${brandColor}08 100%)`,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <GoldParticles count={100} />

      {/* Top + bottom gold lines */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)`,
        clipPath: `inset(0 ${100 - introLineWidth}% 0 0)`,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)`,
        clipPath: `inset(0 0 0 ${100 - introLineWidth}%)`,
      }} />

      {/* PHASE 1: JADOMI Logo intro */}
      {frame < 65 && (
        <AbsoluteFill style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: logoFade,
        }}>
          <div style={{
            transform: `scale(${logoScale})`,
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'Syne, sans-serif', fontSize: 80, fontWeight: 800,
              background: `linear-gradient(135deg, ${brandColor}, #e8c77b)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}>
              JADOMI STUDIO
            </div>
            <div style={{
              fontSize: 20, color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.2em', marginTop: 12,
            }}>
              PRESENTE
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* PHASE 2: Main content */}
      {frame >= 55 && (
        <AbsoluteFill style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '60px 100px',
          opacity: frame < 65 ? interpolate(frame, [55, 65], [0, 1]) : 1,
        }}>
          {/* Title */}
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontSize: 68, fontWeight: 800,
            color: '#ffffff', textAlign: 'center', lineHeight: 1.1,
            transform: `scale(${titleSpring}) translateY(${(1 - titleSpring) * 30}px)`,
            marginBottom: 12,
          }}>
            {title}
          </h1>

          {/* Subtitle */}
          {subtitle && (
            <div style={{
              fontSize: 26, color: 'rgba(255,255,255,0.6)',
              textAlign: 'center', marginBottom: 32,
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
            }}>
              {subtitle}
            </div>
          )}

          {/* Price big */}
          <div style={{
            fontFamily: 'Syne, sans-serif', fontSize: 64, fontWeight: 800,
            color: brandColor, textAlign: 'center', marginBottom: 40,
            transform: `scale(${priceScale})`,
          }}>
            {price}
          </div>

          {/* Info cards row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 40 }}>
            {[
              { icon: '📅', label: dates || '', spring: card1Spring },
              { icon: '⏱', label: duration, spring: card2Spring },
              { icon: '📍', label: location, spring: card3Spring },
            ].map((card, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${brandColor}30`,
                borderRadius: 14, padding: '16px 28px',
                textAlign: 'center',
                transform: `scale(${card.spring}) translateY(${(1 - card.spring) * 20}px)`,
                opacity: card.spring,
              }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{card.icon}</div>
                <div style={{ fontSize: 18, color: '#fff', fontWeight: 600 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <div style={{
            padding: '22px 64px', borderRadius: 99,
            background: `linear-gradient(135deg, ${brandColor}, #e8c77b)`,
            color: '#0a0a0f', fontSize: 26, fontWeight: 700,
            transform: `scale(${ctaPulse})`,
            boxShadow: frame > 250 ? `0 0 ${40 + Math.sin(frame * 0.1) * 20}px ${brandColor}40` : 'none',
          }}>
            {ctaText}
          </div>
        </AbsoluteFill>
      )}

      {/* PHASE 4: Outro watermark */}
      <div style={{
        position: 'absolute', bottom: 30, width: '100%',
        textAlign: 'center', opacity: outroOpacity,
      }}>
        <span style={{
          fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700,
          color: `${brandColor}60`, letterSpacing: '0.15em',
        }}>
          Cree avec JADOMI Studio — jadomi.fr
        </span>
      </div>
    </AbsoluteFill>
  );
};
