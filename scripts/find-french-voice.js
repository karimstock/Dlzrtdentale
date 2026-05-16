#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const KEY = process.env.ELEVENLABS_API_KEY;

async function main() {
  // Chercher dans la bibliothèque partagée les voix françaises
  console.log('=== Recherche voix françaises ElevenLabs ===\n');

  // 1. Shared voices (community library)
  try {
    const resp = await axios.get('https://api.elevenlabs.io/v1/shared-voices', {
      headers: { 'xi-api-key': KEY },
      params: { language: 'fr', gender: 'male', page_size: 20, sort: 'usage_character_count_7d', use_cases: 'narration' }
    });
    const voices = resp.data?.voices || [];
    console.log(`Voix FR masculines narration : ${voices.length} trouvées\n`);
    voices.slice(0, 15).forEach((v, i) => {
      console.log(`${i+1}. ${v.name} (${v.public_owner_id}/${v.voice_id})`);
      console.log(`   Accent: ${v.accent || '?'} | Age: ${v.age || '?'} | Style: ${v.descriptive || '?'}`);
      console.log(`   Usage 7j: ${v.usage_character_count_7d || 0} chars | Category: ${v.category}`);
      console.log(`   Preview: ${v.preview_url || 'aucun'}`);
      console.log('');
    });
  } catch (err) {
    console.error('Erreur shared-voices:', err.response?.status, err.response?.data?.detail || err.message);
  }

  // 2. Essayer aussi avec "conversational" use case
  try {
    const resp2 = await axios.get('https://api.elevenlabs.io/v1/shared-voices', {
      headers: { 'xi-api-key': KEY },
      params: { language: 'fr', gender: 'male', page_size: 10, sort: 'usage_character_count_7d', use_cases: 'conversational' }
    });
    const voices2 = resp2.data?.voices || [];
    console.log(`\n--- Voix FR masculines conversationnelles : ${voices2.length} ---\n`);
    voices2.slice(0, 10).forEach((v, i) => {
      console.log(`${i+1}. ${v.name} (${v.voice_id}) — ${v.accent || '?'} / ${v.age || '?'} / ${v.descriptive || '?'}`);
    });
  } catch (err) {
    console.error('Erreur:', err.message);
  }
}

main();
