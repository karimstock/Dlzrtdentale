/**
 * JADOMI Remotion — Ad Template Composition
 * Passe 35 — Data-driven ad video for advertisers
 * 6 seconds (180 frames @ 30fps), 1920x1080
 */

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, Img } from 'remotion';
import { GoldParticles } from '../elements/GoldParticles';

interface AdProps {
  title: string;
  price: string;
  duration: string;
  location: string;
  logoUrl: string;
  brandColor: string;
  ctaText: string;
}

export const AdTemplate: React.FC<AdProps> = ({
  title,
  price,
  duration,
  location,
  logoUrl,
  brandColor,
  ctaText,
}) => {
  const frame = useCurrentFrame();

  // Phase transitions
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [40, 0], { extrapolateRight: 'clamp' });

  const detailsOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: 'clamp' });
  const detailsY = interpolate(frame, [25, 45], [30, 0], { extrapolateRight: 'clamp' });

  const ctaScale = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: 'clamp' });
  const ctaPulse = frame > 80 ? 1 + Math.sin((frame - 80) * 0.1) * 0.03 : ctaScale;

  const logoOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateRight: 'clamp' });

  // JADOMI watermark at the end
  const watermarkOpacity = interpolate(frame, [140, 160], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, #0a0a0f 0%, ${brandColor}15 50%, #0a0a0f 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 120px',
      }}
    >
      <GoldParticles count={80} />

      {/* Top gold line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)`,
          opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      />

      {/* Title */}
      <h1
        style={{
          fontFamily: 'Syne, sans-serif',
          fontSize: 72,
          fontWeight: 800,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.1,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          marginBottom: 40,
        }}
      >
        {title}
      </h1>

      {/* Details row */}
      <div
        style={{
          display: 'flex',
          gap: 60,
          opacity: detailsOpacity,
          transform: `translateY(${detailsY}px)`,
          marginBottom: 60,
        }}
      >
        {[
          { label: 'Tarif', value: price },
          { label: 'Durée', value: duration },
          { label: 'Lieu', value: location },
        ].map((item, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 16,
                color: '#8a8a9a',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 8,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 32,
                fontWeight: 700,
                color: brandColor,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <div
        style={{
          padding: '20px 60px',
          background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)`,
          color: '#0a0a0f',
          fontFamily: 'Inter, sans-serif',
          fontSize: 24,
          fontWeight: 700,
          borderRadius: 16,
          transform: `scale(${ctaPulse})`,
        }}
      >
        {ctaText}
      </div>

      {/* Logo */}
      {logoUrl && (
        <div style={{ position: 'absolute', bottom: 60, right: 80, opacity: logoOpacity }}>
          <Img src={logoUrl} style={{ height: 50, objectFit: 'contain' }} />
        </div>
      )}

      {/* JADOMI watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: 80,
          fontFamily: 'Syne, sans-serif',
          fontSize: 18,
          fontWeight: 700,
          color: 'rgba(201, 169, 97, 0.4)',
          opacity: watermarkOpacity,
          letterSpacing: '0.1em',
        }}
      >
        JADOMI ADS
      </div>
    </AbsoluteFill>
  );
};
