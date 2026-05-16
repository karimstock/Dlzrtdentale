#!/usr/bin/env node
// =============================================
// JADOMI Home Video — Assemblage Final FFmpeg
// Combine stock footage + voiceover + music + text overlays
// Produit un MP4 1080p prêt pour la home page
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'public/assets');
const VIDEO_DIR = path.join(ASSETS, 'videos/home');
const AUDIO_DIR = path.join(ASSETS, 'audio/home');
const OUTPUT = path.join(ASSETS, 'videos/home/jadomi-home-final.mp4');
const TEMP = path.join(__dirname, '..', '/tmp/video-assembly');

fs.mkdirSync(TEMP, { recursive: true });

// =============================================
// STORYBOARD — Chaque scène calée sur son segment audio
// La durée vidéo = durée audio + 0.8s de respiration
// Synchronisation parfaite voix ↔ image
// =============================================
const SCENES = [
  // Intro : logo noir + voix "Je suis JADOMI..."
  {
    id: 'plan01-intro',
    type: 'black',
    overlay_text: 'JADOMI',
    overlay_style: 'logo',
    audio: '01-intro.mp3', // 3.5s
  },
  // Scénario A : Dentiste → Prothésiste → Livraison
  {
    id: 'plan02-dentiste',
    type: 'video',
    source: 'scenes/01-dentiste-patient.mp4',
    audio: '02-dentiste-patient.mp3', // 4.6s
  },
  {
    id: 'plan03-photo',
    type: 'video',
    source: 'scenes/02-dentiste-photo-shade.mp4',
    audio: '03-dentiste-photo.mp3', // 4.2s
  },
  {
    id: 'plan04-prothesiste',
    type: 'video',
    source: 'scenes/03-prothesiste-recoit.mp4',
    audio: '04-prothesiste-recoit.mp3', // 4.6s
  },
  {
    id: 'plan05-fabrique',
    type: 'video',
    source: 'scenes/04-prothesiste-fabrique.mp4',
    audio: '05-prothesiste-fabrique.mp3', // 2.4s
  },
  {
    id: 'plan06-coursier',
    type: 'video',
    source: 'scenes/05-coursier-route.mp4',
    audio: '06-coursier-route.mp3', // 4.5s
  },
  {
    id: 'plan07-recoit',
    type: 'video',
    source: 'scenes/06-dentiste-recoit-couronne.mp4',
    audio: '07-dentiste-recoit.mp3', // 3.2s
  },
  // Scénario B : Infirmière
  {
    id: 'plan08-infirmiere',
    type: 'video',
    source: 'scenes/07-infirmiere-notif-annulation.mp4',
    audio: '08-infirmiere-annulation.mp3', // 5.2s
  },
  {
    id: 'plan09-visio',
    type: 'video',
    source: 'scenes/08-infirmiere-visio-avocate.mp4',
    audio: '09-infirmiere-visio.mp3', // 4.5s
  },
  // Final
  {
    id: 'plan10-final',
    type: 'black',
    overlay_text: 'jadomi.fr',
    overlay_style: 'endcard',
    audio: '10-final.mp3', // 5.4s
  },
];

// =============================================
// FONCTIONS D'ASSEMBLAGE
// =============================================

function getAudioDuration(filepath) {
  try {
    const d = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}" 2>/dev/null`).toString().trim();
    return parseFloat(d);
  } catch { return 0; }
}

function buildSceneClip(scene, index) {
  const outPath = path.join(TEMP, `scene-${String(index).padStart(2, '0')}.mp4`);

  // Font pour les overlays
  const fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const fontExists = fs.existsSync(fontFile);
  const font = fontExists ? fontFile : '';

  let drawtext = '';
  if (scene.overlay_text && fontExists) {
    if (scene.overlay_style === 'logo') {
      // Grande typo doree centree
      drawtext = `drawtext=text='${scene.overlay_text}':fontfile='${font}':fontsize=80:fontcolor=0xC9A961:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.5),t/0.5,1)'`;
    } else if (scene.overlay_style === 'hero') {
      // Texte hero grand centre
      drawtext = `drawtext=text='${scene.overlay_text}':fontfile='${font}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.5),t/0.5,1)'`;
    } else if (scene.overlay_style === 'endcard') {
      // End card
      drawtext = `drawtext=text='${scene.overlay_text}':fontfile='${font}':fontsize=48:fontcolor=0xC9A961:x=(w-text_w)/2:y=(h-text_h)/2-20:alpha='if(lt(t,0.3),t/0.3,1)',drawtext=text='IA au service des professionnels':fontfile='${font}':fontsize=22:fontcolor=0x94A3B8:x=(w-text_w)/2:y=(h/2)+30:alpha='if(lt(t,0.8),0,min((t-0.8)/0.5,1))'`;
    } else {
      // Subtitle en bas a gauche avec fond semi-transparent
      drawtext = `drawtext=text='${scene.overlay_text}':fontfile='${font}':fontsize=28:fontcolor=white:x=60:y=h-80:alpha='if(lt(t,0.3),t/0.3,if(gt(t,${scene.duration - 0.5}),(${scene.duration}-t)/0.5,1))',drawbox=x=50:y=h-90:w=text_w+20:h=45:color=black@0.5:t=fill:enable='between(t,0,${scene.duration})'`;
      // Drawbox avant drawtext pour l'ordre
      drawtext = `drawbox=x=50:y=h-92:w=400:h=48:color=black@0.5:t=fill,drawtext=text='${scene.overlay_text}':fontfile='${font}':fontsize=28:fontcolor=white:x=60:y=h-82:alpha='if(lt(t,0.3),t/0.3,if(gt(t,${scene.duration - 0.5}),(${scene.duration}-t)/0.5,1))'`;
    }
  }

  let inputCmd;
  if (scene.type === 'black') {
    // Fond noir
    inputCmd = `-f lavfi -i "color=c=black:s=1920x1080:d=${scene.duration}:r=30"`;
  } else {
    const videoPath = path.join(VIDEO_DIR, scene.source);
    const ss = scene.source_start ? `-ss ${scene.source_start}` : '';
    inputCmd = `${ss} -i "${videoPath}"`;
  }

  // Construire la commande video
  let filterChain = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;

  // Ajouter fade in/out
  filterChain += `,fade=t=in:d=0.3,fade=t=out:st=${Math.max(0, scene.duration - 0.3)}:d=0.3`;

  if (drawtext) {
    filterChain += `,${drawtext}`;
  }

  const cmd = `ffmpeg -y ${inputCmd} -t ${scene.duration} -vf "${filterChain}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an "${outPath}" 2>/dev/null`;

  try {
    execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    return outPath;
  } catch (err) {
    console.error(`  Erreur scene ${scene.id}:`, err.message?.slice(0, 200));
    // Essayer sans drawtext en cas d'erreur
    const fallbackFilter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,fade=t=in:d=0.3,fade=t=out:st=${Math.max(0, scene.duration - 0.3)}:d=0.3`;
    const fallbackCmd = `ffmpeg -y ${inputCmd} -t ${scene.duration} -vf "${fallbackFilter}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an "${outPath}" 2>/dev/null`;
    execSync(fallbackCmd, { maxBuffer: 50 * 1024 * 1024 });
    return outPath;
  }
}

function buildAudioTrack() {
  const totalDuration = SCENES.reduce((sum, s) => sum + s.duration, 0);
  const voiceoverPath = path.join(AUDIO_DIR, 'voiceover-complete.mp3');
  const musicPath = path.join(AUDIO_DIR, 'music-ambient-placeholder.mp3');
  const mixedAudioPath = path.join(TEMP, 'audio-mixed.mp3');

  // Mixer : voix-off volume normal + musique ambient volume bas
  const cmd = `ffmpeg -y -i "${voiceoverPath}" -i "${musicPath}" -filter_complex "[0:a]volume=1.0,apad[v];[1:a]volume=0.15,aloop=loop=-1:size=2e+09,atrim=0:${totalDuration},afade=t=in:d=1,afade=t=out:st=${totalDuration - 2}:d=2[m];[v][m]amix=inputs=2:duration=first:dropout_transition=2" -t ${totalDuration} -c:a libmp3lame -q:a 2 "${mixedAudioPath}" 2>/dev/null`;

  execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
  return { mixedAudioPath, totalDuration };
}

// =============================================
// MAIN
// =============================================
function main() {
  console.log('=== JADOMI Home Video — Assemblage Final ===\n');

  // 1. Generer chaque scene video
  console.log('ETAPE 1 — Generation des scenes video...');
  const sceneClips = [];
  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    process.stdout.write(`  [${scene.id}] ${scene.duration}s... `);
    const clipPath = buildSceneClip(scene, i);
    sceneClips.push(clipPath);
    console.log('OK');
  }

  // 2. Concatener les scenes video
  console.log('\nETAPE 2 — Concatenation video...');
  const concatList = sceneClips.map(p => `file '${p}'`).join('\n');
  const concatPath = path.join(TEMP, 'concat-video.txt');
  fs.writeFileSync(concatPath, concatList);
  const videoOnlyPath = path.join(TEMP, 'video-only.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${videoOnlyPath}" 2>/dev/null`, { maxBuffer: 50 * 1024 * 1024 });

  const videoDuration = getAudioDuration(videoOnlyPath);
  console.log(`  Video assemblée: ${videoDuration.toFixed(1)}s`);

  // 3. Mixer audio (voix-off + musique)
  console.log('\nETAPE 3 — Mixage audio (voix-off + musique)...');
  const { mixedAudioPath, totalDuration } = buildAudioTrack();
  const audioDuration = getAudioDuration(mixedAudioPath);
  console.log(`  Audio mixé: ${audioDuration.toFixed(1)}s`);

  // 4. Combiner video + audio
  console.log('\nETAPE 4 — Fusion video + audio...');
  execSync(`ffmpeg -y -i "${videoOnlyPath}" -i "${mixedAudioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${OUTPUT}" 2>/dev/null`, { maxBuffer: 50 * 1024 * 1024 });

  const finalSize = fs.statSync(OUTPUT).size;
  const finalDuration = getAudioDuration(OUTPUT);

  console.log('\n' + '='.repeat(50));
  console.log('VIDEO FINALE GENEREE');
  console.log('='.repeat(50));
  console.log(`  Fichier: ${OUTPUT}`);
  console.log(`  Durée: ${finalDuration.toFixed(1)}s`);
  console.log(`  Taille: ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Format: H.264 1080p + AAC 192kbps`);
  console.log('='.repeat(50));

  // Cleanup temp
  // fs.rmSync(TEMP, { recursive: true, force: true });
}

main();
