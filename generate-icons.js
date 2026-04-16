// JADOMI PWA icons generator (sharp + SVG source)
// Usage: node generate-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function svgIcon(size) {
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.62);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#0f0e0d"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="'Segoe UI', Arial, sans-serif" font-weight="900"
        font-size="${fontSize}" fill="#c8f060">J</text>
</svg>`;
}

function svgScreenshot() {
  // Mockup mobile narrow 390x844
  return `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
  <rect width="390" height="844" fill="#0f0e0d"/>
  <rect x="20" y="60" width="350" height="80" rx="16" fill="#1a1917" stroke="#2f2c28"/>
  <text x="40" y="110" font-family="Arial" font-size="28" font-weight="900" fill="#c8f060">JADOMI</text>
  <rect x="20" y="160" width="350" height="120" rx="16" fill="#1a1917" stroke="#2f2c28"/>
  <text x="40" y="200" font-family="Arial" font-size="16" fill="#9c9890">Stock intelligent</text>
  <text x="40" y="240" font-family="Arial" font-size="32" font-weight="700" fill="#c8f060">142 produits</text>
  <rect x="20" y="300" width="350" height="120" rx="16" fill="#1a1917" stroke="#2f2c28"/>
  <text x="40" y="340" font-family="Arial" font-size="16" fill="#9c9890">Commandes</text>
  <text x="40" y="380" font-family="Arial" font-size="32" font-weight="700" fill="#c8f060">8 en cours</text>
  <rect x="20" y="440" width="350" height="120" rx="16" fill="#1a1917" stroke="#2f2c28"/>
  <text x="40" y="480" font-family="Arial" font-size="16" fill="#9c9890">IA Claude</text>
  <text x="40" y="520" font-family="Arial" font-size="24" font-weight="700" fill="#c8f060">Active</text>
  <rect x="20" y="760" width="350" height="60" rx="30" fill="#c8f060"/>
  <text x="195" y="798" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#0f0e0d">Scanner un produit</text>
</svg>`;
}

async function build() {
  const tasks = [
    { name: 'icon-192.png', size: 192, svg: svgIcon(192) },
    { name: 'icon-512.png', size: 512, svg: svgIcon(512) }
  ];
  for (const t of tasks) {
    const dest = path.join(OUT_DIR, t.name);
    await sharp(Buffer.from(t.svg)).png().toFile(dest);
    console.log('[icons] wrote', dest);
  }
  // Screenshot
  const scDest = path.join(OUT_DIR, 'screenshot.png');
  await sharp(Buffer.from(svgScreenshot())).png().toFile(scDest);
  console.log('[icons] wrote', scDest);
}

build().catch(e => { console.error(e); process.exit(1); });
