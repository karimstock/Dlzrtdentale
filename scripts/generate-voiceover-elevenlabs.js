#!/usr/bin/env node
// =============================================
// JADOMI — Voix-off ElevenLabs PREMIUM
// Voix française naturelle, chaleureuse, pro
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/audio/home');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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

async function listVoices() {
  const resp = await axios.get('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': ELEVENLABS_KEY }
  });
  return resp.data.voices || [];
}

async function generateTTS(text, voiceId) {
  const resp = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.80,
        style: 0.15,
        use_speaker_boost: true
      }
    },
    {
      headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      responseType: 'arraybuffer',
      timeout: 30000
    }
  );
  return Buffer.from(resp.data);
}

async function main() {
  console.log('=== JADOMI — Voix-off ElevenLabs PREMIUM ===\n');

  // 1. Lister les voix disponibles
  console.log('Voix disponibles :');
  const voices = await listVoices();
  const frVoices = [];

  for (const v of voices) {
    const labels = v.labels || {};
    const lang = (labels.language || '').toLowerCase();
    const accent = (labels.accent || '').toLowerCase();
    const gender = labels.gender || '?';
    const desc = labels.description || '';

    // Montrer toutes les voix pour choisir
    if (lang.includes('fr') || accent.includes('fr') ||
        ['Daniel', 'Thomas', 'Charlotte', 'Antoni', 'Adam', 'Bill'].includes(v.name)) {
      frVoices.push(v);
      console.log(`  ${v.name} (${v.voice_id}) — ${gender} / ${accent || lang || 'multilingual'} / ${desc}`);
    }
  }

  if (frVoices.length === 0) {
    console.log('  Aucune voix FR trouvée, affichage des 15 premières :');
    voices.slice(0, 15).forEach(v => {
      console.log(`  ${v.name} (${v.voice_id}) — ${v.labels?.gender || '?'} / ${v.labels?.accent || v.labels?.language || '?'} / ${v.labels?.description || ''}`);
    });
  }

  // Choisir la meilleure voix FR
  // Priorité : voix française masculine chaleureuse
  const preferred = ['Daniel', 'Thomas', 'Adam', 'Antoni', 'Bill', 'Charlie'];
  let selectedVoice = null;

  for (const name of preferred) {
    const found = voices.find(v => v.name === name);
    if (found) { selectedVoice = found; break; }
  }

  // Fallback : première voix FR ou première voix tout court
  if (!selectedVoice && frVoices.length > 0) selectedVoice = frVoices[0];
  if (!selectedVoice) selectedVoice = voices[0];

  console.log(`\nVoix selectionnee : ${selectedVoice.name} (${selectedVoice.voice_id})`);
  console.log(`  Genre: ${selectedVoice.labels?.gender || '?'}`);
  console.log(`  Accent: ${selectedVoice.labels?.accent || selectedVoice.labels?.language || '?'}`);

  // 2. Générer chaque segment
  const totalChars = SEGMENTS.reduce((s, seg) => s + seg.text.length, 0);
  console.log(`\nTexte total : ${totalChars} caractères (${SEGMENTS.length} segments)\n`);

  for (const seg of SEGMENTS) {
    const filepath = path.join(OUTPUT_DIR, `${seg.id}.mp3`);
    console.log(`[${seg.id}] "${seg.text.slice(0, 55)}..."`);

    try {
      const buffer = await generateTTS(seg.text, selectedVoice.voice_id);
      fs.writeFileSync(filepath, buffer);
      const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`).toString().trim();
      console.log(`  OK — ${(buffer.length / 1024).toFixed(0)} KB — ${parseFloat(dur).toFixed(1)}s`);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data ? Buffer.from(err.response.data).toString().slice(0, 300) : err.message;
      console.error(`  ERREUR (${status}): ${detail}`);
      if (status === 401) { console.error('  → Clé API invalide ou expirée'); return; }
      if (status === 402) { console.error('  → Plan gratuit — upgrader le compte ElevenLabs'); return; }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. Concaténer avec silences
  console.log('\nConcaténation...');
  const silencePath = path.join(OUTPUT_DIR, 'silence-400ms.mp3');
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.4 -c:a libmp3lame -q:a 9 "${silencePath}" 2>/dev/null`);

  const entries = [];
  for (let i = 0; i < SEGMENTS.length; i++) {
    const fp = path.join(OUTPUT_DIR, `${SEGMENTS[i].id}.mp3`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 100) {
      entries.push(`file '${fp}'`);
      if (i < SEGMENTS.length - 1) entries.push(`file '${silencePath}'`);
    }
  }

  const listPath = path.join(OUTPUT_DIR, 'concat-list.txt');
  fs.writeFileSync(listPath, entries.join('\n'));

  const outputPath = path.join(OUTPUT_DIR, 'voiceover-complete.mp3');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${outputPath}" 2>/dev/null`);
  const size = fs.statSync(outputPath).size;
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`).toString().trim();

  console.log(`\nVoix-off complète : ${(size / 1024).toFixed(0)} KB — ${parseFloat(dur).toFixed(1)}s`);
  console.log(`Fichier : ${outputPath}`);
  console.log('\n=== TERMINE ===');
}

main().catch(err => { console.error('ERREUR:', err.message); process.exit(1); });
