// =============================================
// JADOMI Studio — Flyer Builder API
// Agents DeepSeek spécialisés + Gemini + ImageMagick + Puppeteer
// =============================================

const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const { validatePrompt, validateText, MODERATION_SYSTEM_PROMPT } = require('../../lib/ai-studio/moderator');
const { buildSystemPrompt, validateResponse, JADOMI_BASE_PROMPT } = require('../../lib/ai-studio/jadomi-brain');
const { sanitizeForExternalAPI } = require('../../lib/ai-studio/data-guard');
const { compositeFromBuffer, detourProduct } = require('../../lib/ai-studio/product-compositor');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const iaRouter = require('../../lib/ia-router');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);
const UPLOAD_DIR = path.join(__dirname, '../../uploads/flyer-builder');
const OUTPUT_DIR = path.join(__dirname, '../../public/studio/generated/flyers');

// Créer dossiers si nécessaire
[UPLOAD_DIR, OUTPUT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Upload multer
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'application/pdf',
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
      'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

// ══════════════════════════════════════════════
// AGENTS DEEPSEEK SPÉCIALISÉS
// ══════════════════════════════════════════════

const AGENTS = {
  // Agent 0 : PATRON — Chef d'orchestre des agents
  patron: {
    name: 'Patron',
    system: `${buildSystemPrompt('studio', 'Tu es le PATRON du Flyer Builder. Tu orchestres 4 agents.')}

Tu reçois les demandes de l'utilisateur et tu décides quoi faire.

Tu as 4 agents sous tes ordres :
- "redacteur" : lit des documents, rédige des fiches produit structurées
- "designer" : propose des layouts de pages (cover, produit, specs, contact)
- "copywriter" : écrit du texte marketing premium (titres, slogans, descriptions)
- "photo_advisor" : analyse des images et propose des améliorations (détourage, composite, etc.)

Tu as aussi des OUTILS que tu peux déclencher :
- "edit_image" : édite une image avec Gemini (détourage, composite, ouverture branches)
- "detour" : détourage ImageMagick (vraie transparence)
- "generate_video" : génère une vidéo Vidu depuis une image
- "generate_pdf" : génère un PDF avec Puppeteer

Pour chaque demande utilisateur, tu réponds en JSON :
{
  "understanding": "Ce que tu as compris de la demande (1 phrase)",
  "plan": [
    { "step": 1, "agent": "redacteur|designer|copywriter|photo_advisor", "task": "Ce que l'agent doit faire" },
    { "step": 2, "tool": "edit_image|detour|generate_video|generate_pdf", "params": {} }
  ],
  "message": "Message pour l'utilisateur (en français, vouvoiement, professionnel)",
  "needs_input": true/false,
  "input_type": "file|text|choice|confirm|none"
}

Tu es organisé, efficace, bienveillant. Tu guides l'utilisateur étape par étape.
Tu ne fais JAMAIS tout en même temps — tu valides chaque étape avant de passer à la suivante.
Tu demandes TOUJOURS confirmation avant de générer des vidéos (ça coûte des tokens).`
  },

  // Agent 1 : Rédacteur fiche produit
  redacteur: {
    name: 'Rédacteur Fiche Produit',
    system: `${buildSystemPrompt('studio', 'Tu es le rédacteur fiche produit. Tu extrais les informations et génères des fiches structurées.')}
Tu peux utiliser tes connaissances pour compléter les specs techniques si l'utilisateur ne les fournit pas toutes.

Format de sortie JSON :
{
  "brand": "Nom de la marque",
  "products": [
    {
      "name": "Nom du produit",
      "type": "Type (loupe, LED, instrument...)",
      "tagline": "Sous-titre marketing (1 ligne)",
      "description": "Description 2-3 phrases",
      "features": ["Feature 1", "Feature 2", "Feature 3"],
      "specs": { "Poids": "55 g", "Grossissement": "×2,5 à ×7" },
      "price": "1 400 €",
      "certifications": ["ISO 13485", "CE"]
    }
  ],
  "contact": { "email": "", "phone": "", "website": "" }
}

Sois précis sur les specs techniques. Ne jamais inventer de données.`
  },

  // Agent 2 : Designer layout
  designer: {
    name: 'Designer Layout',
    system: `${buildSystemPrompt('studio', 'Tu es le designer UI/UX. Tu proposes des layouts premium en JSON.')}
Tu proposes des layouts en JSON pour le builder JADOMI.

Format de sortie JSON :
{
  "theme": "creme|dark|medical|moderne",
  "pages": [
    {
      "type": "cover|product|specs|contact",
      "layout": "hero-photo|split-50-50|full-width|grid-2x2",
      "slots": [
        { "id": "slot_1", "type": "image|text|price|specs-table", "label": "Photo produit principal", "position": "left|right|center|background" }
      ]
    }
  ]
}

Design premium : espacements généreux, typographie Playfair Display + Inter, couleurs or/teal.`
  },

  // Agent 3 : Copywriter marketing
  copywriter: {
    name: 'Copywriter Marketing',
    system: `${buildSystemPrompt('studio', 'Tu es le copywriter marketing B2B. Tu génères titres, slogans, descriptions, CTA.')}
Style : Apple, Vercel, Linear — premium et épuré.
Jamais de promesses médicales trompeuses (code déontologie).`
  },

  // Agent 4 : Conseiller photo IA
  photo_advisor: {
    name: 'Conseiller Photo IA',
    system: `${buildSystemPrompt('studio', 'Tu es le conseiller photo IA. Tu analyses images et proposes améliorations.')}
Tu proposes des mots-clés en anglais pour Unsplash quand on cherche des photos.
Tu conseilles : détourage, composite, amélioration qualité, fond professionnel.

Tu réponds TOUJOURS en JSON :
{
  "analysis": "Ce que tu proposes (1-2 phrases)",
  "search_queries": ["mot cle 1 en anglais", "mot cle 2"],
  "suggestions": [
    { "action": "search_photos|detour|composite|enhance", "description": "...", "priority": "high|medium|low" }
  ]
}`
  }
};

// ══════════════════════════════════════════════
// HELPER : Appel IA avec FALLBACK automatique
// DeepSeek → Mistral → Claude (escalade coût)
// ══════════════════════════════════════════════

const PROVIDERS = [
  {
    name: 'deepseek',
    host: 'api.deepseek.com',
    path: '/chat/completions',
    model: 'deepseek-chat',
    key: () => process.env.DEEPSEEK_API_KEY,
    costPerToken: 0.00000014
  },
  {
    name: 'mistral',
    host: 'api.mistral.ai',
    path: '/v1/chat/completions',
    model: 'mistral-small-latest',
    key: () => process.env.MISTRAL_API_KEY,
    costPerToken: 0.00000013
  },
  {
    name: 'claude',
    host: 'api.anthropic.com',
    path: '/v1/messages',
    model: 'claude-haiku-4-5-20251001',
    key: () => process.env.ANTHROPIC_API_KEY,
    costPerToken: 0.0000008,
    isAnthropic: true
  }
];

function callProvider(provider, systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const key = provider.key();
    if (!key) return reject(new Error(`${provider.name}: clé API manquante`));

    // DATA GUARD : filtrer avant envoi externe
    const guard = sanitizeForExternalAPI(userMessage, provider.name);
    if (guard.blocked) return reject(new Error(`DATA-GUARD: données sensibles bloquées pour ${provider.name}`));
    userMessage = guard.cleaned;

    let body, headers;

    if (provider.isAnthropic) {
      body = JSON.stringify({
        model: provider.model,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      };
    } else {
      body = JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      };
    }

    const req = https.request({
      hostname: provider.host,
      path: provider.path,
      method: 'POST',
      headers,
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          let content;
          if (provider.isAnthropic) {
            content = json.content?.[0]?.text || '';
          } else {
            content = json.choices?.[0]?.message?.content || '';
          }
          if (!content) return reject(new Error(`${provider.name}: réponse vide`));
          const totalTokens = json.usage?.total_tokens || json.usage?.input_tokens + json.usage?.output_tokens || 0;
          resolve({ content, provider: provider.name, cost: totalTokens * provider.costPerToken });
        } catch (e) { reject(new Error(`${provider.name}: parse error`)); }
      });
    });
    req.on('error', () => reject(new Error(`${provider.name}: connexion échouée`)));
    req.on('timeout', () => { req.destroy(); reject(new Error(`${provider.name}: timeout`)); });
    req.write(body);
    req.end();
  });
}

async function callAI(agent, userMessage) {
  for (const provider of PROVIDERS) {
    try {
      const result = await callProvider(provider, agent.system, userMessage);
      return result;
    } catch (e) {
      console.log(`[FLYER-BUILDER] ${e.message} → fallback suivant`);
      continue;
    }
  }
  throw new Error('Tous les providers IA sont indisponibles (DeepSeek, Mistral, Claude)');
}

// ── Helper : appel Gemini image edit ──
function callGeminiEdit(imageBuffer, prompt) {
  return new Promise((resolve, reject) => {
    const imgB64 = imageBuffer.toString('base64');
    const body = JSON.stringify({
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: imgB64 } }
      ] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const parts = json.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData) {
              resolve(Buffer.from(p.inlineData.data, 'base64'));
              return;
            }
          }
          reject(new Error('Gemini: pas d\'image dans la réponse'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════
// ENDPOINTS
// ══════════════════════════════════════════════

// ── GET /themes — 70 thèmes visuels, 10 catégories ──
router.get('/themes', (req, res) => {
  try {
    const { THEMES, getAllCategories } = require('../../lib/ai-studio/flyer-themes');
    res.json({ ok: true, themes: THEMES, categories: getAllCategories() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /templates — Templates flyer disponibles ──
router.get('/templates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('studio_templates')
      .select('id, nom, type, categorie, preview_url, usage, format')
      .in('type', ['flyer', 'fiche'])
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    res.json({ ok: true, templates: data || [] });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /parse-document — DeepSeek lit un document et rédige la fiche ──
router.post('/parse-document', upload.single('file'), async (req, res) => {
  try {
    const text = req.body.text || '';
    let content = text;

    // Si fichier uploadé, lire le contenu
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Extraire texte du PDF avec pdftotext
        const pdfPath = req.file.path;
        content = await new Promise((resolve, reject) => {
          exec(`pdftotext "${pdfPath}" -`, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          });
        });
      } else {
        content = `[Image uploadée : ${req.file.originalname}] ${text}`;
      }
    }

    if (!content || content.length < 10) {
      return res.json({ ok: false, error: 'Contenu insuffisant. Uploadez un PDF ou décrivez vos produits.' });
    }

    // Modération
    try { validateText(content.substring(0, 4000)); } catch (e) {
      return res.json({ ok: false, error: e.message });
    }

    const result = await callAI(AGENTS.redacteur, `Analyse ce document et génère une fiche produit structurée :\n\n${content.substring(0, 8000)}`);

    let parsed;
    try { let c = result.content.trim(); const m = c.match(/```(?:json)?\s*([\s\S]*?)```/); if(m) c=m[1].trim(); parsed = JSON.parse(c); } catch(e) { try { const bm = result.content.match(/\{[\s\S]*\}/); parsed = bm ? JSON.parse(bm[0]) : { raw: result.content }; } catch(e2) { parsed = { raw: result.content }; } }

    res.json({ ok: true, fiche: parsed, cost: result.cost, tokens: result.usage });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /suggest-copy — Copywriter génère du texte marketing ──
router.post('/suggest-copy', async (req, res) => {
  try {
    const { product_name, product_type, specs, style } = req.body;
    if (!product_name) return res.json({ ok: false, error: 'product_name requis' });

    try { validateText(product_name); } catch (e) {
      return res.json({ ok: false, error: e.message });
    }

    const prompt = `Génère du contenu marketing premium pour ce produit :
Nom : ${product_name}
Type : ${product_type || 'produit médical'}
Specs : ${JSON.stringify(specs || {})}
Style demandé : ${style || 'premium épuré'}

Génère en JSON :
{
  "headline": "Titre accrocheur",
  "tagline": "Sous-titre 1 ligne",
  "description": "Description 2-3 phrases",
  "features_titles": ["Titre feature 1", "Titre feature 2", "Titre feature 3"],
  "cta": "Texte bouton CTA"
}`;

    const result = await callAI(AGENTS.copywriter, prompt);
    let parsed;
    try { let c = result.content.trim(); const m = c.match(/```(?:json)?\s*([\s\S]*?)```/); if(m) c=m[1].trim(); parsed = JSON.parse(c); } catch(e) { try { const bm = result.content.match(/\{[\s\S]*\}/); parsed = bm ? JSON.parse(bm[0]) : { raw: result.content }; } catch(e2) { parsed = { raw: result.content }; } }

    res.json({ ok: true, copy: parsed, cost: result.cost });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /analyze-image — Conseiller photo analyse et propose ──
router.post('/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: 'Image requise' });

    const result = await callAI(AGENTS.photo_advisor,
      `Analyse cette image produit : ${req.file.originalname} (${req.file.mimetype}, ${(req.file.size / 1024).toFixed(0)} KB).
      L'utilisateur veut l'utiliser dans un flyer/landing page premium.
      Quelles améliorations proposes-tu ?`
    );

    let parsed;
    try { let c = result.content.trim(); const m = c.match(/```(?:json)?\s*([\s\S]*?)```/); if(m) c=m[1].trim(); parsed = JSON.parse(c); } catch(e) { try { const bm = result.content.match(/\{[\s\S]*\}/); parsed = bm ? JSON.parse(bm[0]) : { raw: result.content }; } catch(e2) { parsed = { raw: result.content }; } }

    res.json({ ok: true, analysis: parsed, cost: result.cost });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /edit-image — Gemini édite une image (détourage, composite, etc.) ──
// Route JSON (URL externe)
router.post('/edit-image-url', express.json(), async (req, res) => {
  try {
    const { image_url, action } = req.body;
    if (!image_url) return res.json({ ok: false, error: 'image_url requis' });
    if (action) try { validateText(action); } catch(e) { return res.json({ ok: false, error: e.message }); }

    // Si chemin local → lire le fichier directement
    let imageBuffer;
    if (image_url.startsWith('/') || image_url.startsWith('./')) {
      const localPath = path.join(__dirname, '../../public', image_url);
      if (!fs.existsSync(localPath)) return res.json({ ok: false, error: 'Fichier local introuvable' });
      imageBuffer = fs.readFileSync(localPath);
    } else {
      const imgResp = await fetch(image_url);
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
    }

    const prompts = {
      detour: 'Remove the background from this product image completely and replace with solid cream color (#FAF7F2). Clean edges, professional result.',
      enhance: 'Enhance this product image: improve lighting, sharpen details, make it look more professional and premium. Keep the product exactly as is.'
    };

    // RÈGLE ABSOLUE : ne JAMAIS régénérer/modifier le produit réel
    let finalPrompt;
    if (prompts[action]) {
      finalPrompt = prompts[action];
    } else {
      finalPrompt = `RÈGLE ABSOLUE — NE MODIFIE PAS LE PRODUIT :
Le produit dans cette image est un VRAI produit commercial. Tu ne dois JAMAIS :
- Changer sa forme, sa couleur, son design, ses proportions
- Le remplacer par un autre objet
- Ajouter des câbles/fils si le produit est sans fil
- Inventer des détails qui n'existent pas sur le produit
- Le flouter ou le déformer

Ce que tu PEUX faire :
- Changer le FOND/DÉCOR autour du produit
- Ajouter des personnes qui TIENNENT le produit tel quel
- Améliorer la lumière et la netteté SANS changer le produit
- Détourer le produit (supprimer le fond)

ACTION DEMANDÉE : ${action}

Le produit dans cette photo doit rester PIXEL-PERFECT identique à l'original.`;
    }

    console.log('[EDIT-IMAGE-URL] action:', action?.substring(0, 60), '| image:', image_url?.substring(0, 60));

    // DÉTECTION : si l'action demande un DÉCOR/COMPOSITE → pipeline ImageMagick
    const isCompositeRequest = /cabinet|clinique|dentiste.*tient|dentiste.*porte|dans.*main|dans.*cabinet|decor|mise en.*situation|en situation/i.test(action || '');

    let resultUrl;
    if (isCompositeRequest) {
      // PIPELINE SÉCURISÉ : détourage ImageMagick + scène Gemini + composite ImageMagick
      console.log('[EDIT-IMAGE-URL] → Pipeline COMPOSITE (produit réel protégé)');
      const result = await compositeFromBuffer(imageBuffer, action, {
        scale: '35%', gravity: 'center'
      });
      resultUrl = result.outputUrl;
    } else {
      // Gemini direct pour les modifications simples (détourage, amélioration)
      const resultBuffer = await callGeminiEdit(imageBuffer, finalPrompt);
      const outputName = 'edited-' + Date.now() + '.png';
      const outputPath = path.join(OUTPUT_DIR, outputName);
      fs.writeFileSync(outputPath, resultBuffer);
      resultUrl = '/studio/generated/flyers/' + outputName;
    }

    res.json({ ok: true, image_url: resultUrl });
  } catch(e) {
    console.error('[EDIT-IMAGE-URL] Erreur:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Route fichier upload
router.post('/edit-image', upload.single('image'), async (req, res) => {
  try {
    const action = req.body?.action;
    const image_url = req.body?.image_url;

    // Modération
    if (action) {
      try { validateText(action); } catch (e) {
        return res.json({ ok: false, error: e.message });
      }
    }

    // Recuperer l'image — fichier upload OU URL externe
    let imageBuffer;
    if (req.file) {
      imageBuffer = fs.readFileSync(req.file.path);
    } else if (image_url) {
      try {
        const imgResp = await fetch(image_url);
        imageBuffer = Buffer.from(await imgResp.arrayBuffer());
      } catch(e) {
        return res.json({ ok: false, error: 'Impossible de telecharger l\'image : ' + e.message });
      }
    } else {
      return res.json({ ok: false, error: 'Image requise (fichier ou URL)' });
    }

    const prompts = {
      detour: 'Remove the background from this product image completely and replace with solid cream color (#FAF7F2). Clean edges, professional result.',
      open_branches: 'Edit this image of dental loupes: spread the temple arms (branches) WIDE apart like they are being worn on a head. Keep everything else identical. White background.',
      composite_blonde: 'Create a professional photo of a beautiful blonde female dentist wearing these exact dental loupes. White coat, modern dental clinic. Warm lighting. Arms behind ears, NOT in front of eyes.',
      composite_brun: 'Create a professional photo of a handsome brown-haired male dentist wearing these exact dental loupes. White coat, modern dental clinic. Golden lighting. Arms behind ears.',
      enhance: 'Enhance this product image: improve lighting, sharpen details, make it look more professional and premium. Keep the product exactly as is.'
    };

    let finalPrompt;
    if (prompts[action]) {
      finalPrompt = prompts[action];
    } else {
      finalPrompt = `RÈGLE ABSOLUE — NE MODIFIE PAS LE PRODUIT :
Le produit dans cette image est un VRAI produit commercial. Tu ne dois JAMAIS :
- Changer sa forme, sa couleur, son design, ses proportions
- Le remplacer par un autre objet
- Ajouter des câbles/fils si le produit est sans fil
- Inventer des détails qui n'existent pas

ACTION DEMANDÉE : ${action || 'Améliorer l image'}

Le produit doit rester PIXEL-PERFECT identique à l'original.`;
    }

    console.log('[EDIT-IMAGE] action:', (action || '').substring(0, 60));

    // DÉTECTION COMPOSITE : si demande de décor/mise en situation → pipeline sécurisé
    const isCompositeRequest = /cabinet|clinique|dentiste.*tient|dentiste.*porte|dans.*main|dans.*cabinet|decor|mise en.*situation|en situation/i.test(action || '');

    if (isCompositeRequest) {
      console.log('[EDIT-IMAGE] → Pipeline COMPOSITE (produit réel protégé)');
      const result = await compositeFromBuffer(imageBuffer, action, { scale: '35%', gravity: 'center' });
      if (req.file && req.file.path) try { fs.unlinkSync(req.file.path); } catch(e) {}
      return res.json({ ok: true, image_url: result.outputUrl });
    }

    const resultBuffer = await callGeminiEdit(imageBuffer, finalPrompt);

    // Sauvegarder le résultat
    const outputName = `edited-${Date.now()}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputName);
    fs.writeFileSync(outputPath, resultBuffer);

    // Nettoyer le fichier uploadé si il existe
    if (req.file && req.file.path) try { fs.unlinkSync(req.file.path); } catch(e) {}

    res.json({
      ok: true,
      image_url: `/studio/generated/flyers/${outputName}`,
      size: resultBuffer.length
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /detour-imagemagick — Détourage vraie transparence ──
router.post('/detour-imagemagick', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: 'Image requise' });
    const fuzz = req.body.fuzz || '20';

    const outputName = `detoured-${Date.now()}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputName);

    await new Promise((resolve, reject) => {
      exec(`convert "${req.file.path}" -fuzz ${fuzz}% -transparent white "${outputPath}"`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    fs.unlinkSync(req.file.path);

    res.json({
      ok: true,
      image_url: `/studio/generated/flyers/${outputName}`,
      size: fs.statSync(outputPath).size
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /generate-pdf — Puppeteer génère le PDF (module centralisé) ──
router.post('/generate-pdf', async (req, res) => {
  try {
    const { html_url, html, filename } = req.body;
    if (!html_url && !html) return res.json({ ok: false, error: 'html_url ou html requis' });

    const { generatePDF, generatePDFFromHTML } = require('../../lib/pdf-generator');
    const pdfName = filename || `flyer-${Date.now()}.pdf`;
    const pdfPath = path.join(OUTPUT_DIR, pdfName);

    let result;
    if (html) {
      // Génération depuis HTML brut (preview builder)
      result = await generatePDFFromHTML({ html, outputPath: pdfPath });
    } else {
      // Génération depuis URL ou chemin fichier
      result = await generatePDF({ htmlUrl: html_url, outputPath: pdfPath });
    }

    if (!result.ok) return res.json({ ok: false, error: result.error });

    res.json({
      ok: true,
      pdf_url: `/studio/generated/flyers/${pdfName}`,
      size: result.size
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /suggest-layout — Designer propose un layout ──
router.post('/suggest-layout', async (req, res) => {
  try {
    const { products_count, brand_name, theme } = req.body;

    const prompt = `Propose un layout de flyer PDF 4 pages A4 pour :
Marque : ${brand_name || 'Marque professionnelle'}
Nombre de produits : ${products_count || 3}
Thème : ${theme || 'crème premium'}

Génère le layout en JSON avec les pages et slots.`;

    const result = await callAI(AGENTS.designer, prompt);
    let parsed;
    try { let c = result.content.trim(); const m = c.match(/```(?:json)?\s*([\s\S]*?)```/); if(m) c=m[1].trim(); parsed = JSON.parse(c); } catch(e) { try { const bm = result.content.match(/\{[\s\S]*\}/); parsed = bm ? JSON.parse(bm[0]) : { raw: result.content }; } catch(e2) { parsed = { raw: result.content }; } }

    res.json({ ok: true, layout: parsed, cost: result.cost });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /chat — Chat IA interactif dans le builder ──
router.post('/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.json({ ok: false, error: 'message requis' });

    // Modération
    try { validatePrompt(message); } catch (e) {
      return res.json({ ok: false, error: e.message });
    }

    const agent = context === 'photo' ? AGENTS.photo_advisor
      : context === 'copy' ? AGENTS.copywriter
      : context === 'design' ? AGENTS.designer
      : AGENTS.redacteur;

    const result = await callAI(agent, message);
    res.json({ ok: true, response: result.content, agent: agent.name, cost: result.cost });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════
// PATRON LOCAL — Moteur de règles GRATUIT (0€)
// Analyse le message, route vers le bon agent
// Zéro appel API, instantané
// ══════════════════════════════════════════════

const ROUTING_RULES = [
  // Scraping site web
  { keywords: ['site', 'mon site', '.fr', '.com', 'http', 'www', 'url', 'cherche sur', 'trouve sur', 'va sur'], agent: 'redacteur', tool_hint: 'scrape_site' },
  // Photo / Image
  { keywords: ['photo', 'image', 'détour', 'detour', 'détoure', 'fond', 'branche', 'ouvrir', 'composite', 'visage', 'dentiste porte', 'améliorer image', 'recadrer', 'luminosité', 'camera', 'caméra'], agent: 'photo_advisor', tool_hint: 'edit_image' },
  // Texte / Rédaction — mots larges pour capter un max
  { keywords: ['rédige', 'redige', 'fiche', 'produit', 'specs', 'spécification', 'specification', 'caractéristique', 'caracteristique', 'document', 'catalogue', 'extraire', 'analyser', 'info', 'information', 'chercher', 'recherche', 'vente', 'flyer', 'brochure', 'prix', 'tarif'], agent: 'redacteur' },
  // Marketing / Copy
  { keywords: ['titre', 'slogan', 'description', 'marketing', 'accroche', 'tagline', 'texte', 'copywriting', 'cta', 'bouton', 'pub', 'publicite', 'promo'], agent: 'copywriter' },
  // Design / Layout
  { keywords: ['layout', 'design', 'mise en page', 'template', 'thème', 'theme', 'structure', 'couleur', 'grille', 'style', 'look'], agent: 'designer' },
  // Vidéo
  { keywords: ['vidéo', 'video', 'rotation', 'animer', 'animation', 'vidu', 'tourner', 'clip'], agent: null, tool_hint: 'generate_video' },
  // PDF
  { keywords: ['pdf', 'télécharger', 'telecharger', 'imprimer', 'export', 'générer pdf', 'download'], agent: null, tool_hint: 'generate_pdf' },
  // Détourage technique
  { keywords: ['transparence', 'transparent', 'imagemagick', 'fond blanc', 'supprimer fond'], agent: null, tool_hint: 'detour' },
];

function localPatron(message) {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lowerOriginal = message.toLowerCase();

  // 1. Utiliser le classifyIntent du ia-router existant (mémoire partagée)
  let globalIntent = 'general';
  try { globalIntent = iaRouter.LOCAL_RULES.classifyIntent(message); } catch(e) {}

  // 2. Scorer chaque règle flyer-builder
  const scores = ROUTING_RULES.map(rule => {
    const score = rule.keywords.filter(kw => {
      const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return lower.includes(kwNorm) || lowerOriginal.includes(kw);
    }).length;
    return { ...rule, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

  // 3. Plan automatique
  const plan = [];
  const seenAgents = new Set();
  const seenTools = new Set();

  for (const match of scores) {
    if (match.agent && !seenAgents.has(match.agent)) {
      seenAgents.add(match.agent);
      plan.push({ step: plan.length + 1, agent: match.agent, task: message });
    }
    if (match.tool_hint && !seenTools.has(match.tool_hint)) {
      seenTools.add(match.tool_hint);
      plan.push({ step: plan.length + 1, tool: match.tool_hint, status: 'pending' });
    }
  }

  // 4. Si pricing/stock intent détecté par ia-router → enrichir le plan
  if (globalIntent === 'pricing') {
    if (!seenAgents.has('redacteur')) {
      plan.push({ step: plan.length + 1, agent: 'redacteur', task: 'Extraire les prix et tarifs du document' });
      seenAgents.add('redacteur');
    }
  }

  // 5. Si aucun match → rédacteur par défaut
  if (plan.length === 0) {
    plan.push({ step: 1, agent: 'redacteur', task: message });
  }

  // 6. Déterminer si on a besoin d'un input
  const needsFile = lower.includes('upload') || lower.includes('fichier') || lower.includes('catalogue') || lower.includes('pdf');
  const needsImage = seenTools.has('edit_image') || seenTools.has('detour') || lower.includes('photo');
  const needsConfirm = seenTools.has('generate_video');

  return {
    understanding: `Demande analysée : ${seenAgents.size} agent(s) + ${seenTools.size} outil(s) identifiés`,
    global_intent: globalIntent,
    plan,
    needs_input: needsFile || needsImage || needsConfirm,
    input_type: needsImage ? 'image' : needsFile ? 'file' : needsConfirm ? 'confirm' : 'none',
    routing_cost: 0 // GRATUIT — moteur de règles local
  };
}

// ══════════════════════════════════════════════
// POST /orchestrate — PATRON LOCAL + Agents IA
// Routage gratuit, agents payants uniquement si nécessaire
// ══════════════════════════════════════════════
router.post('/orchestrate', async (req, res) => {
  try {
    const { message, session_id, execute } = req.body;
    if (!message) return res.json({ ok: false, error: 'message requis' });

    // Modération
    try { validatePrompt(message); } catch (e) {
      return res.json({ ok: false, error: e.message });
    }

    // Étape 1 : Patron LOCAL analyse et route (GRATUIT, instantané)
    const routing = localPatron(message);

    // Étape 2 : Exécuter les agents si demandé (execute=true)
    const results = [];
    let totalCost = 0;

    if (execute !== false) {
      for (const step of routing.plan) {
        if (step.agent && AGENTS[step.agent]) {
          try {
            const agentResult = await callAI(AGENTS[step.agent], step.task || message);
            let parsed;
            try { parsed = JSON.parse(agentResult.content); } catch (e) { parsed = { raw: agentResult.content }; }
            results.push({
              step: step.step,
              agent: step.agent,
              agent_name: AGENTS[step.agent].name,
              result: parsed,
              provider: agentResult.provider
            });
            totalCost += agentResult.cost;
          } catch (e) {
            results.push({ step: step.step, agent: step.agent, error: e.message });
          }
        }
        if (step.tool === 'scrape_site') {
          // AUTO-SCRAPE : détecter l'URL dans le message et scraper automatiquement
          const urlMatch = message.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
          if (urlMatch) {
            try {
              const scrapeUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : 'https://' + urlMatch[0];
              console.log('[ORCHESTRATE] Auto-scrape:', scrapeUrl);
              const cheerio = require('cheerio');
              const ctrl = new AbortController();
              const to = setTimeout(() => ctrl.abort(), 15000);
              const resp = await fetch(scrapeUrl, {
                headers: { 'User-Agent': 'JADOMI-Studio/1.0', 'Accept': 'text/html' },
                signal: ctrl.signal, redirect: 'follow'
              });
              clearTimeout(to);
              const html = await resp.text();
              const $ = cheerio.load(html);

              // Extraire les images
              const images = [];
              $('img').each((i, el) => {
                let src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (!src || src.startsWith('data:') || src.length < 10) return;
                if (src.startsWith('/')) src = new URL(src, scrapeUrl).href;
                else if (!src.startsWith('http')) src = new URL(src, scrapeUrl).href;
                const alt = $(el).attr('alt') || '';
                if (src.match(/\.(jpg|jpeg|png|webp|gif)/i) && !src.includes('logo') && !src.includes('icon') && !src.includes('favicon')) {
                  images.push({ url: src, alt });
                }
              });

              // Extraire le contenu texte principal
              const title = $('h1').first().text().trim() || $('title').text().trim();
              const price = html.match(/(\d[\d\s]*[.,]\d{2})\s*€|€\s*(\d[\d\s]*[.,]\d{2})/)?.[0] || '';

              results.push({
                step: step.step, tool: 'scrape_site', status: 'done',
                data: { url: scrapeUrl, title, price, images: images.slice(0, 20), image_count: images.length }
              });
            } catch (e) {
              results.push({ step: step.step, tool: 'scrape_site', status: 'error', error: e.message });
            }
          } else {
            results.push({ step: step.step, tool: step.tool, status: 'pending', instruction: 'URL non détectée dans le message' });
          }
        } else if (step.tool) {
          results.push({ step: step.step, tool: step.tool, status: 'pending', instruction: 'À déclencher via le frontend' });
        }
      }
    }

    res.json({
      ok: true,
      patron: {
        understanding: routing.understanding,
        needs_input: routing.needs_input,
        input_type: routing.input_type,
        routing_cost: 0
      },
      plan: routing.plan,
      results,
      total_cost: totalCost,
      session_id: session_id || `flyer-${Date.now()}`
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /scrape-site — Scrape un site web pour extraire infos produit + images ──
router.post('/scrape-site', async (req, res) => {
  try {
    const { url, product_name } = req.body;
    if (!url) return res.json({ ok: false, error: 'url requis' });

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    // SECURITE SSRF
    const parsed = new URL(targetUrl);
    const h = parsed.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.') || h.startsWith('192.168.')) {
      return res.json({ ok: false, error: 'URL non autorisee' });
    }

    const cheerio = require('cheerio');
    const fetchPage = async (pageUrl) => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch(pageUrl, {
        headers: { 'User-Agent': 'JADOMI-Studio/1.0 (https://jadomi.fr)', 'Accept': 'text/html' },
        signal: ctrl.signal, redirect: 'follow'
      });
      clearTimeout(to);
      return resp.text();
    };

    // 1. Fetch la page principale
    let html = await fetchPage(targetUrl);
    let $ = cheerio.load(html);

    // 2. Si un produit est recherche, chercher le lien vers sa page
    if (product_name) {
      let productSlug = product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const links = [];
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase();
        if (href.toLowerCase().includes(productSlug) || text.includes(product_name.toLowerCase())) {
          let fullHref = href;
          if (fullHref.startsWith('/')) fullHref = new URL(fullHref, targetUrl).href;
          else if (!fullHref.startsWith('http')) fullHref = new URL(fullHref, targetUrl).href;
          links.push(fullHref);
        }
      });
      // Essayer des URLs classiques — TOUJOURS, même si des liens sont trouvés
      // Extraire le NOM DU PRODUIT depuis le message brut
      // Chercher le pattern : camera/loupe/scanner + NOM ou juste les mots en majuscule
      const pnLower = product_name.toLowerCase();
      let extractedName = '';
      // Pattern 1: "camera X Y", "loupe X Y", "scanner X Y"
      const nameMatch = pnLower.match(/(?:camera|caméra|loupe|scanner|fauteuil)\s+(.{3,30}?)(?:\s+(?:dentaire|dental|que|qui|pour|sur|de|du|a |à|je|mon|est))/);
      if (nameMatch) extractedName = nameMatch[1].trim();
      // Pattern 2: mots avec majuscule dans le message original
      if (!extractedName) {
        const capWords = product_name.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
        if (capWords) extractedName = capWords.filter(w => w.length > 2 && !['Dental', 'Evolution', 'Cabinet', 'Flyer'].includes(w)).join(' ');
      }
      // Pattern 3: garder max 3 mots non-generiques
      if (!extractedName) {
        const stopWords = ['salut', 'bonjour', 'veu', 'veux', 'veut', 'flyer', 'flyers', 'sur', 'mon', 'site', 'les', 'des', 'que', 'qui', 'pour', 'trouver', 'trouve', 'cherche', 'info', 'information', 'technique', 'photo', 'belle', 'net', 'metttre', 'mettre', 'directement', 'camera', 'caméra', 'dentaire', 'dental', 'scanner', 'loupe', 'vend', 'ttc', 'dans', 'avec', 'une', 'produit', 'pourai', 'pourrais'];
        const useful = product_name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2 && !stopWords.includes(w) && !/^\d+$/.test(w));
        extractedName = useful.slice(0, 3).join(' ');
      }
      console.log('[SCRAPER] Product name extracted:', extractedName, 'from:', product_name.substring(0, 50));

      productSlug = extractedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const words = extractedName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      // Generer des combinaisons — PAIRES en premier (plus specifiques), puis mots seuls
      const slugs = [];
      // D'abord les paires (plus specifique = mieux)
      for (let i = 0; i < words.length; i++)
        for (let j = i + 1; j < words.length; j++)
          slugs.push(words[i] + '-' + words[j]);
      // Puis les mots seuls
      for (const w of words) slugs.push(w);
      // Puis le slug complet
      slugs.push(productSlug);
      const tryUrls = [];
      // PRIORITE : /produit/slug en premier (WooCommerce standard)
      for (const slug of slugs) {
        tryUrls.push(targetUrl + '/produit/' + slug + '/');
        tryUrls.push(targetUrl + '/product/' + slug + '/');
      }
      // Puis les URLs directes
      for (const slug of slugs) {
        tryUrls.push(targetUrl + '/' + slug + '/');
      }
      // Puis la recherche WordPress
      tryUrls.push(targetUrl + '/?s=' + encodeURIComponent(product_name));
      // Ajouter les liens trouvés dans la page
      tryUrls.unshift(...links.slice(0, 5));

      let found = false;
      // Limiter a 15 essais max pour pas timeout
      for (const tryUrl of tryUrls.slice(0, 15)) {
        try {
          console.log('[SCRAPER] Trying:', tryUrl);
          const pageHtml = await fetchPage(tryUrl);
          const pageNorm = pageHtml.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          // Verifier que la page contient AU MOINS 2 mots du produit
          const searchWords = product_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => w.length > 2);
          const matchCount = searchWords.filter(w => pageNorm.includes(w)).length;
          // Detecter page produit unique vs categorie/listing
          const hasAddToCart = pageHtml.includes('single_add_to_cart') || pageHtml.includes('add-to-cart') || pageHtml.includes('ajouter-au-panier');
          const hasProductGallery = pageHtml.includes('woocommerce-product-gallery__image');
          const isSingleProduct = hasAddToCart || (hasProductGallery && pageHtml.includes('product_title'));
          console.log('[SCRAPER] Got', pageHtml.length, 'chars, match:', matchCount + '/' + searchWords.length, 'single:', isSingleProduct, 'cart:', hasAddToCart);
          if (pageHtml.length > 1000 && matchCount >= 2 && isSingleProduct) {
            html = pageHtml;
            $ = cheerio.load(html);
            found = true;
            break;
          }
        } catch(e) { continue; }
      }
    }

    // Extraire le texte principal — prioriser le contenu produit
    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    // Contenu riche : description produit, article, main content
    const richContent = $('.entry-content, .product-description, .woocommerce-product-details__short-description, .woocommerce-Tabs-panel, main article, .product_description, [class*="description"], [class*="specs"], [class*="technical"]').text().replace(/\s+/g, ' ');
    const bodyText = richContent.length > 200 ? richContent.substring(0, 8000) : $('body').text().replace(/\s+/g, ' ').substring(0, 8000);

    // Extraire toutes les images — filtrage intelligent
    const images = [];
    const seenSrcs = new Set();
    $('img').each((i, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
      if (!src || src.startsWith('data:')) return;
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = new URL(src, targetUrl).href;
      if (seenSrcs.has(src)) return;
      seenSrcs.add(src);
      const alt = $(el).attr('alt') || '';
      const width = parseInt($(el).attr('width') || '0');
      const height = parseInt($(el).attr('height') || '0');
      // Filtrer les petites icones, logos, favicons, pixels tracking
      if (width > 0 && width < 80) return;
      if (height > 0 && height < 80) return;
      const srcLower = src.toLowerCase();
      if (srcLower.includes('icon') || srcLower.includes('favicon') || srcLower.includes('pixel') || srcLower.includes('tracking') || srcLower.includes('badge') || srcLower.includes('payment') || srcLower.includes('sprite')) return;
      // Filtrer TOUS les logos sans exception
      if (srcLower.includes('logo') || srcLower.includes('brand') || srcLower.includes('header') || srcLower.includes('footer') || srcLower.includes('menu')) return;
      // Filtrer les images trop petites par nom de fichier
      if (srcLower.includes('thumb') && !srcLower.includes('thumbnail-large')) return;
      if (srcLower.match(/\d+x\d+/) && srcLower.match(/(\d+)x/)?.[1] < 150) return;
      // Filtrer download-3 type logos
      if (srcLower.includes('download-3')) return;
      // Prioriser les grandes images produit
      const isProduct = alt.toLowerCase().includes(product_name?.toLowerCase().split(' ')[0] || '___') || srcLower.includes(product_name?.toLowerCase().replace(/\s+/g, '-').split(' ')[0] || '___');
      images.push({ src, alt, isProduct, width: width || 999 });
    });
    // Gallery WooCommerce — images FULL SIZE (priorité max)
    const galleryImages = [];
    $('.woocommerce-product-gallery__image a').each((i, el) => {
      let src = $(el).attr('href') || '';
      if (!src || src.startsWith('data:') || seenSrcs.has(src)) return;
      if (src.startsWith('/')) src = new URL(src, targetUrl).href;
      seenSrcs.add(src);
      const alt = $(el).find('img').attr('alt') || '';
      galleryImages.push({ src, alt, isProduct: true, width: 9999 });
    });
    // Si gallery WooCommerce trouvee → utiliser UNIQUEMENT ces images
    if (galleryImages.length > 3) {
      images.length = 0; // vider les images generiques
      galleryImages.forEach(img => images.push(img));
    } else {
      // Sinon ajouter les galleries generiques
      $('[data-large_image], .wp-block-gallery img, figure img').each((i, el) => {
        let src = $(el).attr('data-large_image') || $(el).attr('href') || $(el).attr('src') || '';
        if (!src || src.startsWith('data:') || seenSrcs.has(src)) return;
        if (src.startsWith('/')) src = new URL(src, targetUrl).href;
        seenSrcs.add(src);
        const alt = $(el).attr('alt') || '';
        images.push({ src, alt, isProduct: true, width: 999 });
      });
    }
    // Trier : images produit en premier, puis les plus grandes
    images.sort((a, b) => (b.isProduct ? 1 : 0) - (a.isProduct ? 1 : 0) || b.width - a.width);

    // Chercher les prix
    const priceMatches = bodyText.match(/\d[\d\s]*[,.]?\d*\s*€|\d[\d\s]*[,.]?\d*\s*EUR/gi) || [];

    // Envoyer le contenu scrappe a DeepSeek pour structurer
    const scrapedContent = `Site: ${targetUrl}
Titre: ${title}
H1: ${h1}
Description: ${metaDesc}
Produit recherche: ${product_name || 'non specifie'}
Prix trouves: ${priceMatches.join(', ')}
Nombre d'images: ${images.length}

CONTENU COMPLET DE LA PAGE :
${bodyText.substring(0, 6000)}

IMPORTANT : Utilise UNIQUEMENT les informations ci-dessus. Ne jamais inventer de specs. Extrais tous les details techniques (poids, resolution, autonomie, connectivite, dimensions, etc).`;

    const aiResult = await callAI(AGENTS.redacteur,
      'Analyse ce contenu scrappe d\'un site web et genere une fiche produit structuree en JSON.\n' +
      'REGLES STRICTES :\n' +
      '1. Utilise UNIQUEMENT les informations de la page scrappee ci-dessous\n' +
      '2. NE JAMAIS inventer de specs techniques — si une info n\'est pas dans le contenu, ne la mets pas\n' +
      '3. Le nom du produit est dans le H1 ou le titre de la page\n' +
      '4. Extrais TOUTES les specs techniques trouvees (poids, autonomie, resolution, connectivite, dimensions, etc.)\n' +
      '5. Le prix mentionne par l\'utilisateur est : ' + (product_name.match(/\d[\d\s,.]*€/)?.[0] || 'non precise') + '\n\n' +
      scrapedContent
    );

    let fiche;
    try {
      // DeepSeek renvoie parfois ```json ... ``` — nettoyer
      let cleaned = aiResult.content.trim();
      const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) cleaned = jsonMatch[1].trim();
      fiche = JSON.parse(cleaned);
    } catch(e) {
      // Dernier essai : chercher un { ... } dans le texte
      const braceMatch = aiResult.content.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try { fiche = JSON.parse(braceMatch[0]); } catch(e2) { fiche = { raw: aiResult.content }; }
      } else {
        fiche = { raw: aiResult.content };
      }
    }

    res.json({
      ok: true,
      fiche,
      images: images.slice(0, 12),
      scraped: { title, h1, meta_desc: metaDesc, prices: priceMatches },
      cost: aiResult.cost
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /search-photos — Recherche photos stock Unsplash (GRATUIT) ──
router.get('/search-photos', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ ok: false, error: 'q requis' });
    const axios = require('axios');
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return res.json({ ok: false, error: 'Unsplash non configure' });
    const resp = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query: q, per_page: 8, orientation: 'landscape' },
      headers: { 'Authorization': `Client-ID ${key}` }
    });
    const photos = (resp.data.results || []).map(p => ({
      id: p.id,
      url_small: p.urls.small,
      url_regular: p.urls.regular,
      url_full: p.urls.full,
      alt: p.alt_description || p.description || q,
      photographer: p.user.name
    }));
    res.json({ ok: true, photos });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════
// PROJETS FLYER — CRUD Sauvegarde/Chargement
// ══════════════════════════════════════════════

// ── GET /projects — Liste des projets utilisateur ──
router.get('/projects', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('studio_flyer_projects')
      .select('id, nom, theme, status, template_id, preview_url, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ ok: true, projects: data || [] });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /projects/:id — Charger un projet ──
router.get('/projects/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('studio_flyer_projects')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json({ ok: true, project: data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── POST /projects — Sauvegarder un projet ──
router.post('/projects', async (req, res) => {
  try {
    const { id, nom, template_id, theme, fiche_data, slots, status, preview_url, pdf_url } = req.body;
    const payload = { nom, template_id, theme, fiche_data, slots, status, preview_url, pdf_url, updated_at: new Date().toISOString() };

    let result;
    if (id) {
      const { data, error } = await supabase.from('studio_flyer_projects').update(payload).eq('id', id).select().single();
      if (error) throw error;
      result = data;
    } else {
      payload.user_id = req.body.user_id || '00000000-0000-0000-0000-000000000000';
      const { data, error } = await supabase.from('studio_flyer_projects').insert(payload).select().single();
      if (error) throw error;
      result = data;
    }
    res.json({ ok: true, project: result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── DELETE /projects/:id — Supprimer un projet ──
router.delete('/projects/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('studio_flyer_projects').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
