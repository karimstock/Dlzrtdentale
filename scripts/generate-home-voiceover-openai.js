#!/usr/bin/env node
// =============================================
// Generate JADOMI home video voiceover via OpenAI TTS
// Fallback while ElevenLabs is on free plan
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/audio/home');

if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY manquante dans .env');
  process.exit(1);
}

// Script voix-off — segments du storyboard
const SEGMENTS = [
  { id: '01-intro', text: "Bonjour. Je suis JADOMI. Une intelligence artificielle au service des professionnels." },
  { id: '02-stock', text: "Chaque matin, elle ouvre ce tiroir sans savoir ce qui manque. Maintenant, elle sait." },
  { id: '03-tournees', text: "Quinze patients. Trois tournées. Zéro détour." },
  { id: '04-labo', text: "Chaque prothèse, suivie. De la cire au fauteuil." },
  { id: '05-livraison', text: "Livré. Le patient est déjà au fauteuil." },
  { id: '06-negociation', text: "Vos fournisseurs en concurrence. Vos prix au plus bas." },
  { id: '07-compta', text: "La compta du dimanche soir. C'est fini." },
  { id: '08-recap', text: "Stock. Tournées. Négociation. Comptabilité." },
  { id: '09-final', text: "Je suis JADOMI. L'intelligence artificielle au service des professionnels." },
];

async function generateTTS(text, voice = 'onyx') {
  // OpenAI TTS-1-HD — voices: alloy, echo, fable, onyx, nova, shimmer
  // onyx = grave, chaleureux, masculin — bon pour narration corporate FR
  const resp = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model: 'tts-1-hd',
      input: text,
      voice: voice,
      response_format: 'mp3',
      speed: 0.95 // legèrement plus lent pour narration
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      timeout: 30000
    }
  );
  return Buffer.from(resp.data);
}

async function main() {
  console.log('=== JADOMI Home Video — Voix-off OpenAI TTS-1-HD ===\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const totalChars = SEGMENTS.reduce((sum, s) => sum + s.text.length, 0);
  console.log(`Texte total: ${totalChars} caracteres (${SEGMENTS.length} segments)`);
  console.log(`Voix: onyx (grave, chaleureux) — speed: 0.95\n`);

  for (const segment of SEGMENTS) {
    const filepath = path.join(OUTPUT_DIR, `${segment.id}.mp3`);

    console.log(`[${segment.id}] "${segment.text.slice(0, 60)}..." (${segment.text.length} chars)`);

    try {
      const buffer = await generateTTS(segment.text);
      fs.writeFileSync(filepath, buffer);

      // Obtenir duree
      const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}" 2>/dev/null`).toString().trim();
      console.log(`  OK — ${(buffer.length / 1024).toFixed(0)} KB — ${parseFloat(duration).toFixed(1)}s`);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data ? Buffer.from(err.response.data).toString().slice(0, 200) : err.message;
      console.error(`  ERREUR (${status}): ${detail}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // Concatener tous les segments avec 0.5s de silence entre chaque
  console.log('\nConcatenation avec silences...');

  // Generer 0.5s de silence
  const silencePath = path.join(OUTPUT_DIR, 'silence-500ms.mp3');
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.5 -c:a libmp3lame -q:a 9 "${silencePath}" 2>/dev/null`);

  // Creer la liste de concat
  const concatEntries = [];
  for (let i = 0; i < SEGMENTS.length; i++) {
    const fp = path.join(OUTPUT_DIR, `${SEGMENTS[i].id}.mp3`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 100) {
      concatEntries.push(`file '${fp}'`);
      if (i < SEGMENTS.length - 1) {
        concatEntries.push(`file '${silencePath}'`);
      }
    }
  }

  const concatFilePath = path.join(OUTPUT_DIR, 'concat-list.txt');
  fs.writeFileSync(concatFilePath, concatEntries.join('\n'));

  const outputPath = path.join(OUTPUT_DIR, 'voiceover-complete.mp3');
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c:a libmp3lame -q:a 2 "${outputPath}" 2>/dev/null`);
    const size = fs.statSync(outputPath).size;
    const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}" 2>/dev/null`).toString().trim();
    console.log(`\nVoix-off complete: ${(size / 1024).toFixed(0)} KB — ${parseFloat(duration).toFixed(1)}s`);
  } catch (err) {
    console.error('Erreur FFmpeg concat:', err.message);
  }

  console.log('\n=== TERMINE ===');
  console.log(`Fichiers dans: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
