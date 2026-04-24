// =============================================
// JADOMI Remotion — VideoEnhanced
// Passe 41B — Intro + Outro cinematiques pour formule Expert
// Input : video originale + infos cabinet
// Output : video enrichie avec intro/outro JADOMI
// =============================================
import { AbsoluteFill, Video, interpolate, useCurrentFrame, useVideoConfig, Sequence, spring } from 'remotion';

interface VideoEnhancedProps {
  videoSrc: string;
  cabinetName: string;
  subtitle?: string; // ex: "Lyon · Cabinet dentaire"
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  accentColor?: string;
  videoDuration?: number; // en frames
}

const INTRO_DURATION = 90; // 3s at 30fps
const OUTRO_DURATION = 90; // 3s at 30fps

// === INTRO ===
const Intro: React.FC<{ cabinetName: string; subtitle?: string; accentColor: string }> = ({ cabinetName, subtitle, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineWidth = interpolate(frame, [20, 50], [0, 80], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const nameOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const nameY = interpolate(frame, [15, 35], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [70, 90], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0A1628',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeOut,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 56,
            fontStyle: 'italic',
            fontWeight: 400,
            color: 'white',
            opacity: nameOpacity,
            transform: `translateY(${nameY}px)`,
            letterSpacing: -1,
          }}
        >
          {cabinetName}
        </div>
        <div
          style={{
            width: lineWidth,
            height: 2,
            backgroundColor: accentColor,
            margin: '20px auto',
          }}
        />
        {subtitle && (
          <div
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 16,
              color: 'rgba(255,255,255,0.6)',
              opacity: subOpacity,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// === OUTRO ===
const Outro: React.FC<{
  cabinetName: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  accentColor: string;
}> = ({ cabinetName, contactPhone, contactEmail, contactAddress, accentColor }) => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const slideUp = interpolate(frame, [0, 25], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineWidth = interpolate(frame, [10, 40], [0, 120], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0A1628',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeIn,
      }}
    >
      <div style={{ textAlign: 'center', transform: `translateY(${slideUp}px)` }}>
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 36,
            fontStyle: 'italic',
            color: 'white',
            marginBottom: 16,
          }}
        >
          {cabinetName}
        </div>
        <div
          style={{
            width: lineWidth,
            height: 1,
            backgroundColor: accentColor,
            margin: '0 auto 24px',
          }}
        />
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 2 }}>
          {contactAddress && <div>{contactAddress}</div>}
          {contactPhone && <div>{contactPhone}</div>}
          {contactEmail && <div>{contactEmail}</div>}
        </div>
        <div
          style={{
            marginTop: 32,
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            color: accentColor,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Propulse par JADOMI IA
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const VideoEnhanced: React.FC<VideoEnhancedProps> = ({
  videoSrc,
  cabinetName,
  subtitle,
  contactPhone,
  contactEmail,
  contactAddress,
  accentColor = '#C9A961',
  videoDuration = 900, // 30s default
}) => {
  const totalDuration = INTRO_DURATION + videoDuration + OUTRO_DURATION;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A1628' }}>
      {/* Intro */}
      <Sequence from={0} durationInFrames={INTRO_DURATION}>
        <Intro cabinetName={cabinetName} subtitle={subtitle} accentColor={accentColor} />
      </Sequence>

      {/* Main video */}
      <Sequence from={INTRO_DURATION} durationInFrames={videoDuration}>
        <AbsoluteFill>
          <Video src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      </Sequence>

      {/* Outro */}
      <Sequence from={INTRO_DURATION + videoDuration} durationInFrames={OUTRO_DURATION}>
        <Outro
          cabinetName={cabinetName}
          contactPhone={contactPhone}
          contactEmail={contactEmail}
          contactAddress={contactAddress}
          accentColor={accentColor}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
