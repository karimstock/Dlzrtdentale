#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEY = process.env.ELEVENLABS_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/audio/home');
const VOICE_ID = 'lmMH7HJkyAb80H3rpokz'; // Joseph - Calm narrator, doux, moins grave

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SEGMENTS = [
  // ═══ INTRO ═══
  { id: '01-intro', text: "Je suis JADOMI. Une intelligence artificielle au service des professionnels. Bienvenue dans mon univers." },
  // ═══ SCENARIO A : Dentiste → Prothésiste → Livraison ═══
  { id: '02-dentiste-patient', text: "Le dentiste examine son patient. Une couronne est nécessaire. Il ouvre JADOMI, crée une communication, prend les photos avant traitement." },
  { id: '03-dentiste-photo', text: "Photo du substrat, prise de teinte. Le patient aussi peut envoyer ses photos. Tout est centralisé." },
  { id: '04-prothesiste-recoit', text: "Le prothésiste reçoit le dossier. Photos, consignes, empreinte. Ils peuvent discuter directement entre eux." },
  { id: '05-etude-cas', text: "Étude du cas ensemble. Pas de mail perdu, pas d'appel raté." },
  { id: '06-prothesiste-valide', text: "Le prothésiste valide. Le dentiste est notifié : travail en cours." },
  { id: '07-coursier-tournee', text: "Travail terminé. Le coursier démarre sa tournée. Le dentiste sait quels travaux vont lui être livrés aujourd'hui." },
  { id: '08-suivi-direct', text: "Suivi en direct. Dix minutes avant, une dernière alerte." },
  { id: '09-couronne-posee', text: "Couronne posée. Tout le monde a collaboré sur une seule plateforme." },
  // ═══ SCENARIO B : Infirmière ═══
  { id: '10-infirmiere-tournee', text: "L'infirmière démarre sa tournée. Chaque patient est classé selon la gravité des soins, matin ou après-midi, réveil tardif ou non. Tout est optimisé." },
  { id: '11-patient-annule', text: "Un patient annule. L'itinéraire se recalcule directement." },
  { id: '12-preuve-passage', text: "Elle arrive chez le patient. JADOMI génère une preuve de passage : géolocalisée, horodatée. Le passage est certifié." },
  { id: '13-patient-appelle', text: "Un patient appelle. JADOMI lui propose le meilleur créneau, automatiquement." },
  { id: '14-care-network', text: "Une question juridique. L'infirmière ouvre le Care Network, demande une assistance juridique. Une avocate reçoit la demande. Le rendez-vous est planifié. La visio a lieu directement dans JADOMI." },
  // ═══ FINAL ═══
  { id: '15-metiers', text: "Dentistes. Infirmières. Kinés. Avocats. BTP. Gestion locative. Et tous les autres." },
  { id: '16-cri', text: "Je suis JADOMI !" },
  { id: '17-final', text: "Le futur de votre profession est déjà là." },
];

async function generateTTS(text) {
  const resp = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.65, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true }
    },
    {
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      responseType: 'arraybuffer',
      timeout: 60000
    }
  );
  return Buffer.from(resp.data);
}

async function main() {
  console.log('=== Voix-off JADOMI — Nicolas (Parisien Pro Naturel) ===\n');

  const totalChars = SEGMENTS.reduce((s, seg) => s + seg.text.length, 0);
  console.log(`Texte : ${totalChars} caractères — ${SEGMENTS.length} segments\n`);

  for (const seg of SEGMENTS) {
    const fp = path.join(OUTPUT_DIR, `${seg.id}.mp3`);
    console.log(`[${seg.id}] ${seg.text.slice(0, 65)}...`);

    try {
      const buf = await generateTTS(seg.text);
      fs.writeFileSync(fp, buf);
      const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fp}"`).toString().trim();
      console.log(`  ${(buf.length / 1024).toFixed(0)} KB — ${parseFloat(dur).toFixed(1)}s`);
    } catch (err) {
      console.error(`  ERREUR: ${err.response?.status} ${JSON.stringify(err.response?.data ? Buffer.from(err.response.data).toString().slice(0,200) : err.message)}`);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Concat avec silences de 0.6s entre chaque segment
  console.log('\nConcaténation...');
  const silence = path.join(OUTPUT_DIR, 'silence-600ms.mp3');
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.6 -c:a libmp3lame -q:a 9 "${silence}" 2>/dev/null`);

  const entries = [];
  for (let i = 0; i < SEGMENTS.length; i++) {
    const fp = path.join(OUTPUT_DIR, `${SEGMENTS[i].id}.mp3`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 100) {
      entries.push(`file '${fp}'`);
      if (i < SEGMENTS.length - 1) entries.push(`file '${silence}'`);
    }
  }

  const listPath = path.join(OUTPUT_DIR, 'concat-list.txt');
  fs.writeFileSync(listPath, entries.join('\n'));

  const output = path.join(OUTPUT_DIR, 'voiceover-complete.mp3');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${output}" 2>/dev/null`);
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${output}"`).toString().trim();
  const size = fs.statSync(output).size;

  console.log(`\nVOIX-OFF COMPLETE : ${parseFloat(dur).toFixed(1)}s — ${(size / 1024).toFixed(0)} KB`);
  console.log(`Fichier : ${output}`);
  console.log('\nEcoutez : https://jadomi.fr/assets/audio/home/voiceover-complete.mp3');
}

main().catch(err => { console.error(err.message); process.exit(1); });
