// =============================================
// JADOMI — Product Compositor
// RÈGLE ABSOLUE : le produit réel ne doit JAMAIS être modifié par l'IA
//
// Pipeline :
// 1. Détourer le produit avec ImageMagick (pas Gemini)
// 2. Générer le décor SANS le produit (Gemini/NanoBanana)
// 3. Superposer le produit détouré sur le décor (ImageMagick composite)
//
// Résultat : produit PIXEL-PERFECT identique + décor IA
// =============================================

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '../../public/studio/generated/flyers');

// ═══ ÉTAPE 1 : Détourer le produit avec ImageMagick ═══
function detourProduct(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const fuzz = options.fuzz || 20;
    const bgColor = options.bgColor || 'white';

    // ImageMagick : supprime le fond blanc/coloré → transparence
    const cmd = `convert "${inputPath}" -fuzz ${fuzz}% -transparent ${bgColor} -trim +repage "${outputPath}"`;

    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(new Error('ImageMagick detour failed: ' + err.message));
      console.log('[COMPOSITOR] Détouré:', path.basename(outputPath));
      resolve(outputPath);
    });
  });
}

// ═══ ÉTAPE 2 : Générer le décor SANS le produit ═══
function generateScene(scenePrompt) {
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) return reject(new Error('GEMINI_API_KEY manquant'));

    // IMPORTANT : le prompt dit explicitement de NE PAS inclure le produit
    const fullPrompt = `Generate a photorealistic background scene for a product photo.
IMPORTANT: DO NOT include any product, device, or equipment in the scene.
Generate ONLY the environment/context:
${scenePrompt}
The scene must have an EMPTY space where a product will be placed later.
Professional photography lighting, high quality.`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const parts = json.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData) {
              const scenePath = path.join(OUTPUT_DIR, `scene-${Date.now()}.png`);
              fs.writeFileSync(scenePath, Buffer.from(p.inlineData.data, 'base64'));
              console.log('[COMPOSITOR] Scène générée:', path.basename(scenePath));
              resolve(scenePath);
              return;
            }
          }
          reject(new Error('Gemini: pas d\'image de scène générée'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ═══ ÉTAPE 3 : Superposer le produit sur le décor ═══
function compositeProductOnScene(scenePath, productPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const gravity = options.gravity || 'center';
    const scale = options.scale || '40%'; // Taille du produit par rapport à la scène
    const offsetX = options.offsetX || '+0';
    const offsetY = options.offsetY || '+0';

    // Redimensionner le produit puis le superposer sur la scène
    const cmd = `convert "${scenePath}" \\( "${productPath}" -resize ${scale} \\) -gravity ${gravity} -geometry ${offsetX}${offsetY} -composite "${outputPath}"`;

    exec(cmd, (err) => {
      if (err) return reject(new Error('ImageMagick composite failed: ' + err.message));
      console.log('[COMPOSITOR] Composite final:', path.basename(outputPath));
      resolve(outputPath);
    });
  });
}

// ═══ PIPELINE COMPLET : détourage + scène + composite ═══
async function compositeProduct(productImagePath, scenePrompt, options = {}) {
  const timestamp = Date.now();
  const detouredPath = path.join(OUTPUT_DIR, `detoured-${timestamp}.png`);
  const outputPath = path.join(OUTPUT_DIR, `composite-${timestamp}.png`);

  // 1. Détourer le produit
  console.log('[COMPOSITOR] === PIPELINE START ===');
  console.log('[COMPOSITOR] Produit:', path.basename(productImagePath));
  await detourProduct(productImagePath, detouredPath, {
    fuzz: options.fuzz || 20,
    bgColor: options.bgColor || 'white'
  });

  // 2. Générer la scène SANS le produit
  const scenePath = await generateScene(scenePrompt);

  // 3. Superposer le produit sur la scène
  await compositeProductOnScene(scenePath, detouredPath, outputPath, {
    gravity: options.gravity || 'center',
    scale: options.scale || '35%',
    offsetX: options.offsetX || '+0',
    offsetY: options.offsetY || '+0'
  });

  // Nettoyer les fichiers intermédiaires
  try { fs.unlinkSync(detouredPath); } catch (e) {}
  try { fs.unlinkSync(scenePath); } catch (e) {}

  console.log('[COMPOSITOR] === PIPELINE DONE ===');
  return {
    outputPath,
    outputUrl: '/studio/generated/flyers/' + path.basename(outputPath)
  };
}

// ═══ COMPOSITE DEPUIS BUFFER (pour les routes API) ═══
async function compositeFromBuffer(productBuffer, scenePrompt, options = {}) {
  const timestamp = Date.now();
  const tempProductPath = path.join(OUTPUT_DIR, `temp-product-${timestamp}.png`);
  fs.writeFileSync(tempProductPath, productBuffer);

  try {
    const result = await compositeProduct(tempProductPath, scenePrompt, options);
    return result;
  } finally {
    try { fs.unlinkSync(tempProductPath); } catch (e) {}
  }
}

module.exports = {
  detourProduct,
  generateScene,
  compositeProductOnScene,
  compositeProduct,
  compositeFromBuffer
};
