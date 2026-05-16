require('dotenv').config({ path: '/home/ubuntu/jadomi/.env' });
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_DIR = '/home/ubuntu/jadomi/public/studio/assets/brossage';

const assets = [
  {
    name: 'dents-sales',
    prompt: 'A row of 8 cartoon teeth with yellow plaque and cute friendly little microbes (not scary, adorable round bacteria with big eyes), Pixar kids style, flat design with soft volume and shading, transparent background, vibrant colors, premium illustration quality, dental hygiene theme for children'
  },
  {
    name: 'dents-propres',
    prompt: 'A row of 8 cartoon teeth that are sparkling clean, bright white and shiny, with golden sparkles and glitter effects around them, each tooth has a cute happy smiling face, Pixar kids style, flat design with soft volume and shading, transparent background, vibrant colors, premium illustration quality, dental hygiene theme for children'
  },
  {
    name: 'brosse-a-dents',
    prompt: 'A single colorful cartoon toothbrush in turquoise/mint color with white foamy toothpaste on the bristles, bubbly foam effect, premium cartoon style illustration, flat design with soft volume, transparent background, dental hygiene theme for children, Pixar kids quality'
  },
  {
    name: 'etoile-recompense',
    prompt: 'A big golden star reward icon with sparkle and glitter effects, shiny metallic gold with bright highlights, premium mobile game style, celebration theme, transparent background, flat design with soft 3D volume, vibrant and eye-catching, kids reward badge'
  },
  {
    name: 'fond-salle-de-bain',
    prompt: 'A modern children bathroom interior illustration, soft pastel colors (light blue, pink, mint), smooth rounded tiles, a round mirror on the wall, a cute sink at child height, warm cozy lighting, premium illustration style, no characters, clean and inviting atmosphere, suitable as a background for a kids dental hygiene app'
  }
];

async function generateAsset(asset) {
  console.log(`Generating: ${asset.name}...`);
  const startTime = Date.now();
  try {
    const params = {
      model: 'gpt-image-1',
      prompt: asset.prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
    };

    // Request transparent background for all except fond-salle-de-bain
    if (asset.name !== 'fond-salle-de-bain') {
      params.background = 'transparent';
      params.output_format = 'png';
    }

    const response = await openai.images.generate(params);

    const b64 = response.data[0].b64_json;
    const filePath = path.join(OUTPUT_DIR, asset.name + '.png');

    // Save base64 to PNG file
    const buffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeKB = (buffer.length / 1024).toFixed(0);
    console.log(`  OK: ${asset.name}.png (${sizeKB} KB) en ${elapsed}s`);
    return { name: asset.name, path: filePath, size: buffer.length, success: true };
  } catch (err) {
    console.error(`  ERREUR ${asset.name}: ${err.message}`);
    return { name: asset.name, success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Generation des assets de brossage JADOMI Studio ===');
  console.log(`Modele: gpt-image-1 | Qualite: high | Taille: 1024x1024\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];
  for (const asset of assets) {
    const result = await generateAsset(asset);
    results.push(result);
  }

  console.log('\n=== RESUME ===');
  let totalSize = 0;
  for (const r of results) {
    if (r.success) {
      totalSize += r.size;
      console.log(`  [OK] ${r.path} (${(r.size / 1024).toFixed(0)} KB)`);
    } else {
      console.log(`  [ERREUR] ${r.name}: ${r.error}`);
    }
  }

  const ok = results.filter(r => r.success).length;
  console.log(`\n${ok}/${results.length} assets generes. Taille totale: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
