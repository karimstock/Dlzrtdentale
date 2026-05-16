#!/usr/bin/env node
// =============================================
// Generate JADOMI home video voiceover via ElevenLabs
// French voice, warm professional tone
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/audio/home');

if (!ELEVENLABS_KEY) {
  console.error('ELEVENLABS_API_KEY manquante dans .env');
  process.exit(1);
}

// Script voix-off — chaque segment correspond a un plan du storyboard
const SEGMENTS = [
  {
    id: '01-intro',
    text: "Bonjour. Je suis JADOMI. Une intelligence artificielle au service des professionnels.",
    pause_after: 0.5
  },
  {
    id: '02-stock',
    text: "Chaque matin, elle ouvre ce tiroir sans savoir ce qui manque. Maintenant, elle sait.",
    pause_after: 0.3
  },
  {
    id: '03-tournees',
    text: "Quinze patients. Trois tournées. Zéro détour.",
    pause_after: 0.3
  },
  {
    id: '04-labo',
    text: "Chaque prothèse, suivie. De la cire au fauteuil.",
    pause_after: 0.3
  },
  {
    id: '05-livraison',
    text: "Livré. Le patient est déjà au fauteuil.",
    pause_after: 0.3
  },
  {
    id: '06-negociation',
    text: "Vos fournisseurs en concurrence. Vos prix au plus bas.",
    pause_after: 0.3
  },
  {
    id: '07-compta',
    text: "La compta du dimanche soir. C'est fini.",
    pause_after: 0.5
  },
  {
    id: '08-recap',
    text: "Stock. Tournées. Négociation. Comptabilité.",
    pause_after: 0.3
  },
  {
    id: '09-final',
    text: "Je suis JADOMI. L'intelligence artificielle au service des professionnels.",
    pause_after: 0
  }
];

// Voix francaise ElevenLabs — Daniel (homme chaleureux) ou tester avec d'autres
// On genere aussi la version complete concatenee
async function generateSegment(segment, voiceId) {
  const resp = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: segment.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true
      }
    },
    {
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      responseType: 'arraybuffer',
      timeout: 30000
    }
  );

  return Buffer.from(resp.data);
}

async function listFrenchVoices() {
  try {
    const resp = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_KEY },
      timeout: 15000
    });
    const voices = resp.data.voices || [];
    // Chercher les voix francaises ou multilingues
    const frVoices = voices.filter(v => {
      const labels = v.labels || {};
      const lang = labels.language || '';
      const accent = labels.accent || '';
      return lang.includes('fr') || accent.includes('fr') || v.name === 'Daniel' || v.name === 'Thomas' || v.name === 'Charlotte' || v.name === 'Antoni';
    });
    return { all: voices.slice(0, 20), french: frVoices };
  } catch (err) {
    console.warn('Impossible de lister les voix:', err.message);
    return { all: [], french: [] };
  }
}

async function main() {
  console.log('=== JADOMI Home Video — Voix-off ElevenLabs ===\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Lister les voix disponibles
  console.log('Recherche voix francaises...');
  const { all, french } = await listFrenchVoices();
  console.log(`  ${all.length} voix totales, ${french.length} francaises/compatibles`);

  if (french.length > 0) {
    console.log('  Voix FR trouvees:');
    french.forEach(v => console.log(`    - ${v.name} (${v.voice_id}) — ${v.labels?.accent || '?'} / ${v.labels?.gender || '?'}`));
  }

  // Choisir la meilleure voix
  // Priorite : Thomas (FR natif) > Daniel > Antoni > premiere voix dispo
  let voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel default fallback
  const preferred = ['Thomas', 'Daniel', 'Antoni', 'Charlotte'];
  for (const name of preferred) {
    const found = all.find(v => v.name === name);
    if (found) {
      voiceId = found.voice_id;
      console.log(`\n  Voix selectionnee: ${found.name} (${voiceId})`);
      break;
    }
  }

  // 2. Generer chaque segment
  const totalChars = SEGMENTS.reduce((sum, s) => sum + s.text.length, 0);
  console.log(`\nTexte total: ${totalChars} caracteres (${SEGMENTS.length} segments)`);
  console.log('Generation en cours...\n');

  for (const segment of SEGMENTS) {
    const filepath = path.join(OUTPUT_DIR, `${segment.id}.mp3`);

    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1000) {
      console.log(`[${segment.id}] Deja genere — skip`);
      continue;
    }

    console.log(`[${segment.id}] "${segment.text.slice(0, 50)}..." (${segment.text.length} chars)`);

    try {
      const buffer = await generateSegment(segment, voiceId);
      fs.writeFileSync(filepath, buffer);
      console.log(`  OK — ${(buffer.length / 1024).toFixed(0)} KB`);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data ? Buffer.from(err.response.data).toString().slice(0, 200) : err.message;
      console.error(`  ERREUR (${status}): ${detail}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // 3. Concatener tous les segments en un seul fichier avec FFmpeg
  console.log('\nConcatenation avec FFmpeg...');
  const concatList = SEGMENTS.map(s => {
    const fp = path.join(OUTPUT_DIR, `${s.id}.mp3`);
    if (fs.existsSync(fp)) return `file '${fp}'`;
    return null;
  }).filter(Boolean);

  const concatFilePath = path.join(OUTPUT_DIR, 'concat-list.txt');
  fs.writeFileSync(concatFilePath, concatList.join('\n'));

  const outputPath = path.join(OUTPUT_DIR, 'voiceover-complete.mp3');
  const { execSync } = require('child_process');
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy "${outputPath}" 2>/dev/null`);
    const size = fs.statSync(outputPath).size;
    console.log(`  Voix-off complete: ${(size / 1024).toFixed(0)} KB`);

    // Duree
    const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}" 2>/dev/null`).toString().trim();
    console.log(`  Duree: ${parseFloat(probe).toFixed(1)}s`);
  } catch (err) {
    console.error('  Erreur FFmpeg concat:', err.message);
  }

  console.log('\n=== TERMINE ===');
  console.log(`Fichiers dans: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
