require('dotenv').config({ path: '/home/ubuntu/jadomi/.env' });
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = '/home/ubuntu/jadomi/public/studio/assets/mascottes';

const mascots = [
  {
    name: 'dino',
    prompt: `A cute small turquoise/mint dinosaur character mascot for a children dental health app. Flat design with soft 3D volume, Pixar kids movie style. The dinosaur has big round expressive eyes, a friendly warm smile showing clean white teeth, and is holding a colorful toothbrush in its tiny hand. The character is playful and adorable with smooth rounded shapes. Premium quality illustration, modern flat design with subtle 3D shading. Transparent background, PNG style, no text, centered composition.`
  },
  {
    name: 'licorne',
    prompt: `A cute pastel pink and violet unicorn character mascot for a children dental health app. Duolingo style design with soft 3D volume. The unicorn has a shiny sparkly horn, big expressive eyes, and a friendly smile showing perfect white teeth. It is holding a colorful toothbrush. Kawaii and adorable character design, modern premium illustration. Flat design with subtle 3D shading. Transparent background, PNG style, no text, centered composition.`
  },
  {
    name: 'robot',
    prompt: `A cute small round blue and silver robot character mascot for a children dental health app. Apple Animoji style with soft 3D volume. The robot has cute antennas on top, joyful LED-style glowing eyes, and a friendly digital smile. It is holding a colorful toothbrush with its mechanical hand. Modern premium character design, adorable and friendly. Flat design with subtle 3D shading. Transparent background, PNG style, no text, centered composition.`
  },
  {
    name: 'chat',
    prompt: `A cute playful orange kitten character mascot for a children dental health app. Pusheen/kawaii style with soft 3D volume. The kitten is wearing a tiny superhero dentist cape (blue cape), has big expressive eyes and a friendly smile. It is holding a colorful toothbrush. Adorable cat character, premium quality illustration, modern design. Flat design with subtle 3D shading. Transparent background, PNG style, no text, centered composition.`
  },
  {
    name: 'ours',
    prompt: `A cute white polar bear cub character mascot for a children dental health app. Soft cozy kawaii style with 3D volume. The bear cub is wearing a colorful knitted scarf (rainbow colors), has big warm expressive eyes and a gentle friendly smile. It is holding a colorful toothbrush. Adorable and huggable character design, premium quality illustration. Flat design with subtle 3D shading. Transparent background, PNG style, no text, centered composition.`
  }
];

// === Strategy 1: Gemini 2.5 Flash Image (Nano Banana) ===
async function generateWithNanoBanana(mascot) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{ text: `Generate an image: ${mascot.prompt}` }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT']
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Nano Banana API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }
  throw new Error('No image in Nano Banana response: ' + JSON.stringify(data).substring(0, 500));
}

// === Strategy 2: Imagen 4.0 via REST API ===
async function generateWithImagen4(mascot) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

  const body = {
    instances: [{ prompt: mascot.prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '1:1'
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Imagen 4 API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
    return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
  }
  throw new Error('No image in Imagen 4 response: ' + JSON.stringify(data).substring(0, 500));
}

// === Strategy 3: Imagen 4.0 Fast ===
async function generateWithImagen4Fast(mascot) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;

  const body = {
    instances: [{ prompt: mascot.prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '1:1'
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Imagen 4 Fast API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
    return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
  }
  throw new Error('No image in Imagen 4 Fast response: ' + JSON.stringify(data).substring(0, 500));
}

// === Strategy 4: Gemini 2.0 Flash with image generation ===
async function generateWithGeminiFlash(mascot) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{ text: `Generate an image: ${mascot.prompt}` }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT']
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Flash API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }
  throw new Error('No image in Gemini Flash response: ' + JSON.stringify(data).substring(0, 500));
}

async function generateMascot(mascot) {
  const outputPath = path.join(OUTPUT_DIR, `mascotte-${mascot.name}.png`);
  console.log(`\n=== Generating: ${mascot.name} ===`);

  const strategies = [
    { name: 'Nano Banana (gemini-2.5-flash-image)', fn: generateWithNanoBanana },
    { name: 'Imagen 4.0', fn: generateWithImagen4 },
    { name: 'Imagen 4.0 Fast', fn: generateWithImagen4Fast },
    { name: 'Gemini 2.0 Flash', fn: generateWithGeminiFlash }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`  Trying: ${strategy.name}...`);
      const imageBuffer = await strategy.fn(mascot);
      fs.writeFileSync(outputPath, imageBuffer);
      const stats = fs.statSync(outputPath);
      console.log(`  SUCCESS with ${strategy.name} - ${(stats.size / 1024).toFixed(1)} KB`);
      return { name: mascot.name, path: outputPath, size: stats.size, method: strategy.name };
    } catch (err) {
      console.log(`  FAILED: ${err.message.substring(0, 150)}`);
    }
  }

  console.log(`  FAILED ALL STRATEGIES for ${mascot.name}`);
  return { name: mascot.name, error: 'All strategies failed' };
}

async function main() {
  console.log('JADOMI Studio - Mascot Generator');
  console.log('================================');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Mascots to generate: ${mascots.length}`);

  const results = [];
  for (const mascot of mascots) {
    const result = await generateMascot(mascot);
    results.push(result);
  }

  console.log('\n\n=== RESULTS ===');
  for (const r of results) {
    if (r.error) {
      console.log(`  FAIL: ${r.name} - ${r.error}`);
    } else {
      console.log(`  OK: ${r.name} - ${(r.size / 1024).toFixed(1)} KB - ${r.method} - ${r.path}`);
    }
  }

  const successes = results.filter(r => !r.error);
  console.log(`\n${successes.length}/${results.length} images generated successfully.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
