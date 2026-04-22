#!/usr/bin/env node
// =============================================
// JADOMI — Generate demo videos from slide PNGs
// Usage: node scripts/generate-demo-videos.js
// Prerequis: ffmpeg installed, slides captured via capture-slides.js
// =============================================
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const METIERS = ['avocats','dentistes','coiffeurs','btp','prothesistes','sci','createurs'];

function generateVideo(metier) {
  const slidesDir = path.join(__dirname, '..', 'public', 'assets', 'landings', metier, 'slides');
  const outputDir = path.join(__dirname, '..', 'public', 'assets', 'videos');
  const outputPath = path.join(outputDir, `demo-${metier}.mp4`);
  const posterPath = path.join(outputDir, `poster-${metier}.webp`);

  fs.mkdirSync(outputDir, { recursive: true });

  // Check slides exist
  const slides = fs.readdirSync(slidesDir).filter(f => f.match(/slide-\d+\.png/)).sort();
  if (slides.length === 0) {
    console.log(`  ⏭ No slides found for ${metier}, skipping`);
    return;
  }

  console.log(`  Assembling ${slides.length} slides...`);

  // FFmpeg: create video from slides with Ken Burns zoom + crossfade
  const cmd = [
    'ffmpeg', '-y',
    `-framerate 1/4`,
    `-i "${path.join(slidesDir, 'slide-%d.png')}"`,
    `-vf "zoompan=z='min(zoom+0.001,1.2)':d=120:s=1920x1200:fps=30,format=yuv420p"`,
    `-c:v libx264 -preset medium -crf 23`,
    `-pix_fmt yuv420p -movflags +faststart`,
    `"${outputPath}"`
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
    const size = fs.statSync(outputPath).size;
    console.log(`  ✓ ${path.basename(outputPath)} (${Math.round(size / 1024 / 1024 * 10) / 10} MB)`);
  } catch (err) {
    console.error(`  ❌ FFmpeg error:`, err.stderr?.toString().slice(-200));
    return;
  }

  // Generate poster (first frame as WebP)
  try {
    const posterCmd = `ffmpeg -y -i "${outputPath}" -vframes 1 -vf "scale=1920:1200" -f image2pipe - | npx sharp --input - --output "${posterPath}" --format webp --quality 80`;
    // Simpler approach: just copy first slide as poster
    const sharp = require('sharp');
    sharp(path.join(slidesDir, slides[0]))
      .resize(1920, 1200)
      .webp({ quality: 80 })
      .toFile(posterPath)
      .then(() => console.log(`  ✓ ${path.basename(posterPath)}`))
      .catch(() => {});
  } catch {}
}

console.log('🎬 Generating demo videos...\n');
for (const metier of METIERS) {
  console.log(`=== ${metier.toUpperCase()} ===`);
  generateVideo(metier);
}
console.log('\n✅ Generation terminee');
console.log('Videos dans: /public/assets/videos/');
