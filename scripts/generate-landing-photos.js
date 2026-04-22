require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const sharp = require('sharp');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE_BASE = "cinematic photography, warm golden hour lighting, " +
  "shallow depth of field, premium editorial style, professional ambience, " +
  "high-end magazine quality, muted elegant color palette";

const PROMPTS = {
  avocats: {
    hero: `Elegant French law firm office interior in Paris, dark walnut bookshelves filled with legal tomes, Chesterfield leather armchair in deep burgundy, antique brass desk lamp on polished marble desk, large window overlooking Haussmann buildings, late afternoon golden light streaming in, no people visible. ${STYLE_BASE}`,
    portrait: `Professional French female lawyer in her 40s, wearing elegant dark navy blazer over white silk blouse, warm confident smile, soft natural light from window, sitting at antique wooden desk with legal books, Parisian law firm library background slightly blurred. Realistic editorial portrait photography, photojournalistic style`
  },
  dentistes: {
    hero: `Modern luxury dental clinic reception area, matte white walls with blonde oak accents, minimalist scandinavian design, natural linen furniture, large ficus lyrata plant, soft daylight from floor-to-ceiling windows, polished concrete floor, zen atmosphere, no people visible. ${STYLE_BASE}`,
    portrait: `Professional French male dentist in his 35s, wearing crisp white clinical coat, friendly confident smile, modern dental clinic softly blurred in background, natural window light, warm professional atmosphere. Realistic editorial portrait photography`
  },
  coiffeurs: {
    hero: `Premium hair salon interior, white marble counters with rose gold fixtures, velvet barber chairs in dusty pink, exposed brick accent wall with vintage mirrors, Edison filament pendant lights, lush tropical plants, warm evening glow, stylish and inviting, no people visible. ${STYLE_BASE}`,
    portrait: `Professional French female hairstylist in her 30s, wearing chic black apron over white shirt, warm genuine smile, trendy haircut, premium hair salon softly blurred in background with plants and mirrors, natural warm lighting. Realistic editorial portrait photography`
  },
  btp: {
    hero: `High-end artisan construction workshop, exposed steel beams, polished concrete floors, vintage Eames drafting stools, large wooden architect table with blueprints, brass tool organizers displaying artisanal tools, oversized industrial windows with soft daylight, sophisticated workspace, no workers visible. ${STYLE_BASE}`,
    portrait: `Professional French male artisan builder in his 40s, wearing high-quality dark navy work shirt rolled up at sleeves, confident warm expression, clean modern workshop softly blurred behind showing professional tools, natural daylight. Realistic editorial portrait photography, craftsman aesthetic`
  },
  prothesistes: {
    hero: `State-of-the-art dental prosthetics laboratory, pristine white quartz work surfaces, precision instruments arranged neatly, modern CAD monitor displaying 3D tooth model in soft glow, rose porcelain accent pieces, surgical precision lighting, ultra-clean modern laboratory aesthetic, no people visible. ${STYLE_BASE}`,
    portrait: `Professional French dental prosthetics technician in 40s, wearing white lab coat, wearing magnification loupes pushed up on forehead, focused intelligent expression, modern laboratory softly blurred in background with CAD screens and instruments. Realistic editorial portrait photography`
  },
  sci: {
    hero: `Elegant Parisian real estate advisor office, parquet Versailles herringbone floors, floor-to-ceiling walnut bookshelves filled with architecture books, navy blue velvet Chesterfield sofa, crystal decanter on antique brass tray, detailed architectural building model on mahogany desk, Haussmann ceiling moldings, warm library lighting, no people. ${STYLE_BASE}`,
    portrait: `Professional French male real estate advisor in 50s, wearing impeccable tailored dark suit with silk pocket square, distinguished silver hair, confident warm smile, Parisian office softly blurred behind with architectural model. Realistic editorial portrait photography, wealth advisor aesthetic`
  },
  createurs: {
    hero: `Bohemian chic artisan creator atelier, natural raw wood workbench, handcrafted ceramics and delicate jewelry beautifully displayed on linen drapes, woven rattan baskets, dried pampas flowers, natural daylight flooding from large skylights, Pantone color sample cards scattered artistically, warm authentic atmosphere, no people. ${STYLE_BASE}`,
    portrait: `Professional French female artisan creator in her 30s, wearing soft cream linen apron over earth-toned shirt, creative warm smile, bohemian aesthetic, atelier softly blurred behind with ceramics and plants, natural skylight illumination. Realistic editorial portrait photography, creative artist aesthetic`
  }
};

async function generateImage(prompt, size) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    size,
    quality: 'hd',
    n: 1
  });
  return response.data[0].url;
}

async function downloadAndOptimize(imageUrl, outputPath) {
  const res = await fetch(imageUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  await sharp(buffer)
    .webp({ quality: 82, effort: 6 })
    .toFile(outputPath);
  const stats = fs.statSync(outputPath);
  console.log(`  ✓ ${path.basename(outputPath)} (${Math.round(stats.size / 1024)} KB)`);
}

async function main() {
  const baseDir = path.join(__dirname, '..', 'public', 'assets', 'landings');
  let generated = 0;
  let skipped = 0;

  for (const [metier, prompts] of Object.entries(PROMPTS)) {
    console.log(`\n=== ${metier.toUpperCase()} ===`);
    const dir = path.join(baseDir, metier);
    fs.mkdirSync(dir, { recursive: true });

    for (const [type, prompt] of Object.entries(prompts)) {
      const outPath = path.join(dir, `${type}.webp`);
      if (fs.existsSync(outPath)) {
        console.log(`  - ${type}.webp exists, skipping`);
        skipped++;
        continue;
      }
      try {
        const size = type === 'hero' ? '1792x1024' : '1024x1024';
        console.log(`  Generating ${type}...`);
        const url = await generateImage(prompt, size);
        await downloadAndOptimize(url, outPath);
        generated++;
      } catch (err) {
        console.error(`  ERROR ${metier}/${type}:`, err.message);
      }
      // Rate limit spacing
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} skipped`);
}

main().catch(console.error);
