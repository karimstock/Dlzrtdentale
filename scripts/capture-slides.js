#!/usr/bin/env node
// =============================================
// JADOMI — Capture slides PNG pour generation video
// Usage: node scripts/capture-slides.js
// Prerequis: npm install puppeteer
// =============================================
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const METIERS = ['avocats','dentistes','coiffeurs','btp','prothesistes','sci','createurs'];
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function captureSlides() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1200 });

  for (const metier of METIERS) {
    const url = `${BASE_URL}/${metier}`;
    console.log(`\n📸 ${metier.toUpperCase()}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (err) {
      console.error(`  ❌ Failed to load ${url}:`, err.message);
      continue;
    }

    const outDir = path.join(__dirname, '..', 'public', 'assets', 'landings', metier, 'slides');
    fs.mkdirSync(outDir, { recursive: true });

    // Count slides
    const slideCount = await page.evaluate(() =>
      document.querySelectorAll('.slider__slide').length
    );
    console.log(`  Found ${slideCount} slides`);

    for (let i = 0; i < slideCount; i++) {
      // Activate slide i
      await page.evaluate(idx => {
        document.querySelectorAll('.slider__slide').forEach((s, j) => {
          s.classList.toggle('active', j === idx);
        });
      }, i);

      await new Promise(r => setTimeout(r, 500));

      const slideEl = await page.$('.slider__slide.active');
      if (slideEl) {
        const outPath = path.join(outDir, `slide-${i + 1}.png`);
        await slideEl.screenshot({ path: outPath, omitBackground: false });
        const size = fs.statSync(outPath).size;
        console.log(`  ✓ slide-${i + 1}.png (${Math.round(size / 1024)} KB)`);
      }
    }
  }

  await browser.close();
  console.log('\n✅ Toutes les slides capturees');
}

captureSlides().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
