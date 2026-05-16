#!/usr/bin/env node
// =============================================
// JADOMI — Génération chanson brossage enfant
// ElevenLabs Music API (eleven_music_v1)
// Chanson CHANTÉE + fond musical enfantin
// =============================================

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error('❌ ELEVENLABS_API_KEY manquante'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'assets', 'brossage');

// ── Chanson brossage 90 secondes ──
const SONG_PROMPT = `A joyful, upbeat children's song in French about brushing teeth.
Sung by a sweet, warm female voice (like a kind kindergarten teacher).
The style should be playful pop for toddlers, similar to nursery rhymes.
Fun, bouncy instrumental background with xylophone, ukulele, light claps, and soft synth pads.
Tempo: moderato, catchy and easy to follow for a 3-6 year old child.

The song must follow this structure:

[Intro - 8 seconds]
Bright, sparkly instrumental intro with xylophone melody

[Verse 1 - "En haut" - 20 seconds]
"Allez on brosse, on brosse en haut,
Tout doucement, c'est rigolo,
Chaque petite dent qui brille,
Comme une étoile qui scintille !"

[Verse 2 - "En bas" - 20 seconds]
"Et maintenant on brosse en bas,
Mes dents comptent sur moi, hourra !
En rond, en rond, sans oublier,
Mes dents vont toutes bien briller !"

[Bridge - fun section - 15 seconds]
"À droite, à gauche, devant, derrière,
On brosse partout, quelle belle affaire !
Et la langue aussi, blaaaa,
Un sourire de star, me voilà !"

[Chorus/Refrain - catchy, singalong - 20 seconds]
"Brosse, brosse, matin et soir,
Pour des dents pleines d'espoir,
Blanches, propres, qui brillent fort,
Comme un trésor en or !
Brosse, brosse, c'est le moment,
De sourire à pleines dents !"

[Outro - 7 seconds]
"Bravo champion, à demain !"
Sparkly ending with gentle fade

The overall mood should make children WANT to brush their teeth.
Think Baby Shark energy but for tooth brushing. Irresistibly catchy.
Sung in French with perfect pronunciation.`;

async function generateSong() {
  console.log('🎵 Génération de la chanson brossage via ElevenLabs Music...');
  console.log(`📏 Durée demandée : 90 secondes`);
  console.log(`💰 Coût estimé : ~0.25$ (musique ElevenLabs)\n`);

  const body = JSON.stringify({
    prompt: SONG_PROMPT,
    music_length_ms: 90000, // 90 secondes
    model_id: 'music_v1',
    force_instrumental: false, // On veut du CHANT
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: '/v1/music?output_format=mp3_44100_128',
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 300000, // 5 min max (génération longue)
    };

    console.log('⏳ Envoi de la requête... (peut prendre 1-3 minutes)');

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', c => errData += c);
        res.on('end', () => {
          console.error(`❌ Erreur API ${res.statusCode}:`, errData.substring(0, 500));
          reject(new Error(`ElevenLabs Music API ${res.statusCode}: ${errData.substring(0, 200)}`));
        });
        return;
      }

      // Réponse = audio binaire
      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
        process.stdout.write(`\r📥 Téléchargement : ${(totalBytes / 1024).toFixed(0)} KB`);
      });

      res.on('end', () => {
        console.log(`\n✅ Audio reçu : ${(totalBytes / 1024).toFixed(0)} KB`);

        const audioBuffer = Buffer.concat(chunks);
        const outputPath = path.join(OUTPUT_DIR, 'chanson-brossage.mp3');
        fs.writeFileSync(outputPath, audioBuffer);
        console.log(`💾 Sauvegardé : ${outputPath}`);

        resolve(outputPath);
      });
    });

    req.on('error', (err) => {
      console.error('❌ Erreur réseau :', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout après 5 minutes'));
    });

    req.write(body);
    req.end();
  });
}

// ── Exécution ──
generateSong()
  .then((file) => {
    console.log(`\n🎉 Chanson générée avec succès !`);
    console.log(`📂 Fichier : ${file}`);
    console.log(`🔗 URL : https://jadomi.fr/studio/assets/brossage/chanson-brossage.mp3`);
  })
  .catch((err) => {
    console.error('\n💥 Échec génération :', err.message);
    process.exit(1);
  });
