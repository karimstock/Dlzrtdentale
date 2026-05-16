#!/usr/bin/env node
// =============================================
// JADOMI — Assemblage vidéo finale pub TV
// Avatar Kling + Dashboards animés + Voiceover + Musique
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'public/assets');
const AVATAR_DIR = path.join(ASSETS, 'videos/home/avatar');
const CAPTURES_DIR = path.join(ASSETS, 'videos/home/captures');
const AUDIO_DIR = path.join(ASSETS, 'audio/home');
const TEMP = path.join(__dirname, '..', 'tmp/final-assembly');
const OUTPUT = path.join(ASSETS, 'videos/home/jadomi-pub-finale.mp4');

fs.mkdirSync(TEMP, { recursive: true });

// =============================================
// TIMELINE — chaque segment avec source + timing
// =============================================
function getAudioDuration(fp) {
  try {
    return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fp}"`).toString().trim());
  } catch { return 3; }
}

function buildSegment(index, type, source, duration, opts = {}) {
  const outPath = path.join(TEMP, `seg-${String(index).padStart(2, '0')}.mp4`);
  const { zoom, panDir, text } = opts;

  if (type === 'avatar') {
    // Clip avatar Kling — trim to duration
    const srcPath = path.join(AVATAR_DIR, source);
    if (!fs.existsSync(srcPath)) {
      console.log(`  [SKIP] ${source} manquant — fallback noir`);
      execSync(`ffmpeg -y -f lavfi -i "color=c=0x080c14:s=1920x1080:d=${duration}:r=30" -c:v libx264 -preset fast -pix_fmt yuv420p "${outPath}" 2>/dev/null`);
      return outPath;
    }
    execSync(`ffmpeg -y -i "${srcPath}" -t ${duration} -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "${outPath}" 2>/dev/null`, { maxBuffer: 50*1024*1024 });
    return outPath;
  }

  if (type === 'dashboard') {
    // Screenshot animé avec zoom/pan smooth
    const srcPath = path.join(CAPTURES_DIR, source);
    if (!fs.existsSync(srcPath)) {
      console.log(`  [SKIP] ${source} manquant`);
      execSync(`ffmpeg -y -f lavfi -i "color=c=0x080c14:s=1920x1080:d=${duration}:r=30" -c:v libx264 -preset fast -pix_fmt yuv420p "${outPath}" 2>/dev/null`);
      return outPath;
    }
    // Ken Burns effect — slow zoom in
    const zoomSpeed = zoom || 0.0008;
    const filter = `scale=2400:1350,zoompan=z='1+${zoomSpeed}*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 30)}:s=1920x1080:fps=30`;
    execSync(`ffmpeg -y -loop 1 -i "${srcPath}" -vf "${filter}" -t ${duration} -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${outPath}" 2>/dev/null`, { maxBuffer: 50*1024*1024 });
    return outPath;
  }

  if (type === 'transition') {
    // Flash blanc 0.3s
    execSync(`ffmpeg -y -f lavfi -i "color=c=white:s=1920x1080:d=0.3:r=30" -vf "fade=t=in:d=0.1,fade=t=out:st=0.1:d=0.2" -c:v libx264 -preset fast -pix_fmt yuv420p "${outPath}" 2>/dev/null`);
    return outPath;
  }

  if (type === 'black') {
    // Fond noir avec texte optionnel
    let filter = `color=c=0x080c14:s=1920x1080:d=${duration}:r=30`;
    if (text) {
      const fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
      if (fs.existsSync(fontFile)) {
        filter = `color=c=0x080c14:s=1920x1080:d=${duration}:r=30,drawtext=text='${text}':fontfile='${fontFile}':fontsize=64:fontcolor=0xC9A961:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.5),t/0.5,1)'`;
      }
    }
    execSync(`ffmpeg -y -f lavfi -i "${filter}" -c:v libx264 -preset fast -pix_fmt yuv420p "${outPath}" 2>/dev/null`);
    return outPath;
  }

  return outPath;
}

function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  JADOMI — Assemblage Vidéo Pub Finale');
  console.log('═══════════════════════════════════════════════════\n');

  // Durées audio
  const audioDurations = {};
  const audioFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.match(/^\d{2}-/) && f.endsWith('.mp3'));
  audioFiles.forEach(f => {
    audioDurations[f.replace('.mp3', '')] = getAudioDuration(path.join(AUDIO_DIR, f));
  });
  console.log('Segments audio:', Object.keys(audioDurations).length);

  // ═══ TIMELINE ═══
  const timeline = [
    // INTRO — Logo JADOMI + avatar marche
    { type: 'black', duration: 1.5, opts: { text: 'JADOMI' } },
    { type: 'avatar', source: 'test-marche-tablette.mp4', duration: 5 },

    // DASHBOARDS — on montre les vrais écrans
    { type: 'dashboard', source: 'stock.png', duration: audioDurations['02-dentiste-patient'] || 7 },
    { type: 'dashboard', source: 'labo-dashboard.png', duration: audioDurations['03-dentiste-photo'] || 5 },

    // TRANSITION → Cabinet dentaire
    { type: 'transition' },
    { type: 'avatar', source: 'avatar-cabinet-dentaire.mp4', duration: audioDurations['04-prothesiste-recoit'] || 5 },

    // Chat + notifications
    { type: 'dashboard', source: 'labo-chat.png', duration: audioDurations['05-etude-cas'] || 3 },
    { type: 'dashboard', source: 'labo-production.png', duration: audioDurations['06-prothesiste-valide'] || 4 },

    // TRANSITION → Labo
    { type: 'transition' },
    { type: 'avatar', source: 'avatar-labo-prothesiste.mp4', duration: audioDurations['07-coursier-tournee'] || 5 },

    // Coursier dashboard
    { type: 'dashboard', source: 'suivi-livreurs.png', duration: audioDurations['08-suivi-direct'] || 3.5 },
    { type: 'dashboard', source: 'labo-expeditions.png', duration: audioDurations['09-couronne-posee'] || 3.5 },

    // TRANSITION → Infirmière
    { type: 'transition' },
    { type: 'avatar', source: 'avatar-infirmiere-voiture.mp4', duration: audioDurations['10-infirmiere-tournee'] || 7 },

    // IDE dashboards
    { type: 'dashboard', source: 'ide-dashboard.png', duration: audioDurations['11-patient-annule'] || 3.5 },
    { type: 'dashboard', source: 'ide-dashboard.png', duration: (audioDurations['12-preuve-passage'] || 6) + (audioDurations['13-patient-appelle'] || 4) },
    { type: 'dashboard', source: 'studio.png', duration: audioDurations['14-care-network'] || 10 },

    // FINAL
    { type: 'avatar', source: 'test-marche-tablette.mp4', duration: audioDurations['15-metiers'] || 6 },
    { type: 'black', duration: (audioDurations['16-cri'] || 1.5) + (audioDurations['17-final'] || 2.5), opts: { text: 'jadomi.fr' } },
  ];

  // ═══ BUILD SEGMENTS ═══
  console.log('\nConstruction des segments...');
  const clips = [];
  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    process.stdout.write(`  [${i+1}/${timeline.length}] ${seg.type} `);
    const clip = buildSegment(i, seg.type, seg.source, seg.duration || 0.3, seg.opts || {});
    clips.push(clip);
    console.log('OK');
  }

  // ═══ CONCATENATE VIDEO ═══
  console.log('\nConcaténation vidéo...');
  const concatList = clips.map(c => `file '${c}'`).join('\n');
  const concatPath = path.join(TEMP, 'concat.txt');
  fs.writeFileSync(concatPath, concatList);
  const videoOnly = path.join(TEMP, 'video-only.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${videoOnly}" 2>/dev/null`, { maxBuffer: 100*1024*1024 });
  const videoDur = getAudioDuration(videoOnly);
  console.log(`  Vidéo: ${videoDur.toFixed(1)}s`);

  // ═══ AUDIO MIX ═══
  console.log('\nMixage audio...');
  const voiceover = path.join(AUDIO_DIR, 'voiceover-complete.mp3');
  const music = path.join(AUDIO_DIR, 'tech-corporate-energy.mp3');
  const mixedAudio = path.join(TEMP, 'audio-mixed.mp3');

  // Voix à -6dB, musique à -18dB (12dB sous la voix)
  execSync(`ffmpeg -y -i "${voiceover}" -i "${music}" -filter_complex "[0:a]volume=1.0,apad[v];[1:a]volume=0.12,aloop=loop=-1:size=2e+09,atrim=0:${videoDur},afade=t=in:d=1.5,afade=t=out:st=${videoDur-2}:d=2[m];[v][m]amix=inputs=2:duration=first:dropout_transition=2" -t ${videoDur} -c:a libmp3lame -q:a 2 "${mixedAudio}" 2>/dev/null`, { maxBuffer: 50*1024*1024 });
  console.log('  Audio mixé OK');

  // ═══ FINAL MERGE ═══
  console.log('\nFusion finale...');
  execSync(`ffmpeg -y -i "${videoOnly}" -i "${mixedAudio}" -c:v copy -c:a aac -b:a 192k -shortest "${OUTPUT}" 2>/dev/null`, { maxBuffer: 50*1024*1024 });

  const finalSize = fs.statSync(OUTPUT).size;
  const finalDur = getAudioDuration(OUTPUT);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  VIDEO PUB JADOMI TERMINÉE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Fichier: ${OUTPUT}`);
  console.log(`  Durée: ${finalDur.toFixed(1)}s`);
  console.log(`  Taille: ${(finalSize/1024/1024).toFixed(1)} MB`);
  console.log(`  URL: https://jadomi.fr/assets/videos/home/jadomi-pub-finale.mp4`);
  console.log('═══════════════════════════════════════════════════');
}

main();
