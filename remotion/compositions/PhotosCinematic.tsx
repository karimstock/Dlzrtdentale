// =============================================
// JADOMI Remotion — PhotosCinematic
// Passe 41B — Slideshow Ken Burns pour formule Expert
// Input : array de photos + nom cabinet
// Output : video 30-60s slideshow cinematique
// =============================================
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig, Sequence } from 'remotion';

interface PhotosCinematicProps {
  photos: string[]; // URLs des photos
  cabinetName: string;
  accentColor?: string;
}

const DURATION_PER_PHOTO = 150; // 5s a 30fps
const CROSSFADE = 30; // 1s crossfade

const KenBurnsPhoto: React.FC<{ src: string; index: number }> = ({ src, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Alternating Ken Burns directions
  const directions = [
    { startScale: 1, endScale: 1.15, startX: 0, endX: -3, startY: 0, endY: -2 },
    { startScale: 1.1, endScale: 1, startX: -3, endX: 2, startY: -2, endY: 1 },
    { startScale: 1, endScale: 1.12, startX: 2, endX: -1, startY: 1, endY: -3 },
    { startScale: 1.08, endScale: 1, startX: -2, endX: 3, startY: -1, endY: 2 },
  ];

  const dir = directions[index % directions.length];
  const progress = frame / DURATION_PER_PHOTO;

  const scale = interpolate(progress, [0, 1], [dir.startScale, dir.endScale]);
  const translateX = interpolate(progress, [0, 1], [dir.startX, dir.endX]);
  const translateY = interpolate(progress, [0, 1], [dir.startY, dir.endY]);

  // Fade in/out
  const opacity = interpolate(frame, [0, CROSSFADE, DURATION_PER_PHOTO - CROSSFADE, DURATION_PER_PHOTO], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const PhotosCinematic: React.FC<PhotosCinematicProps> = ({ photos, cabinetName, accentColor = '#C9A961' }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const totalDuration = photos.length * DURATION_PER_PHOTO;

  // Overlay text (cabinet name, appears briefly)
  const textOpacity = interpolate(frame, [totalDuration - 90, totalDuration - 60, totalDuration - 30, totalDuration], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A1628' }}>
      {photos.map((photo, i) => (
        <Sequence key={i} from={i * DURATION_PER_PHOTO} durationInFrames={DURATION_PER_PHOTO}>
          <KenBurnsPhoto src={photo} index={i} />
        </Sequence>
      ))}

      {/* Cabinet name overlay at the end */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity: textOpacity,
        }}
      >
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 48,
            fontStyle: 'italic',
            color: 'white',
            textShadow: '0 4px 20px rgba(0,0,0,0.5)',
            letterSpacing: -1,
          }}
        >
          {cabinetName}
        </div>
        <div
          style={{
            width: 60,
            height: 2,
            backgroundColor: accentColor,
            marginTop: 16,
          }}
        />
      </AbsoluteFill>

      {/* Vignette overlay */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(10,22,40,0.4) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
