// =============================================
// JADOMI — Module Mon site internet
// logo-ai.js — Generation de logos IA (DALL-E 3)
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { uploadToR2 } = require('../../services/r2-storage');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Rate limit: track generation counts per user
const rateLimits = new Map();
function checkRateLimit(userId) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const entry = rateLimits.get(userId);
  if (!entry || (now - entry.start) > hour) {
    rateLimits.set(userId, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Prompts by profession
const LOGO_PROMPTS = {
  dentiste: [
    { style: 'minimaliste', base: 'Minimalist dental clinic logo, clean geometric lines, premium luxury feel, gold and ivory color palette, vector style, white background, centered composition, no text no letters no words' },
    { style: 'classique', base: 'Classic medical dental logo, elegant monogram style, deep navy and gold, professional and timeless, vector illustration, white background, no text no letters no words' },
    { style: 'moderne', base: 'Modern abstract dental logo, subtle tooth or smile reference, gradient accent, contemporary flat design, emerald green and white, sophisticated, vector, no text no letters no words' },
    { style: 'luxe', base: 'Luxury premium dental practice emblem, intricate art deco style, gold foil effect, black background, exclusive high-end feel, symmetrical composition, no text no letters no words' }
  ],
  avocat: [
    { style: 'classique', base: 'Classic law firm logo, scales of justice minimalist, serif feel, bordeaux and cream, prestigious, vector, white background, no text no letters no words' },
    { style: 'moderne', base: 'Modern law firm emblem, abstract pillar or arch, midnight blue and gold, contemporary confident, vector flat design, no text no letters no words' },
    { style: 'prestige', base: 'Prestigious law office crest, art deco inspired, emerald green and bronze, sophisticated professional, symmetrical, no text no letters no words' },
    { style: 'minimaliste', base: 'Minimalist lawyer monogram mark, single bold geometric shape, premium feel, charcoal and gold, white background, no text no letters no words' }
  ],
  medecin: [
    { style: 'minimaliste', base: 'Minimalist medical practice logo, clean cross or abstract health symbol, blue and white, premium professional, vector, white background, no text no letters no words' },
    { style: 'classique', base: 'Classic medical logo, caduceus subtle integration, deep blue and gold, timeless elegant, vector, white background, no text no letters no words' },
    { style: 'moderne', base: 'Modern healthcare logo, abstract organic shape, teal gradient, contemporary clean, vector flat design, no text no letters no words' },
    { style: 'luxe', base: 'Luxury medical practice emblem, geometric precision, navy and gold, exclusive feel, symmetrical, no text no letters no words' }
  ],
  kine: [
    { style: 'dynamique', base: 'Dynamic physiotherapy logo, abstract human motion, green and blue gradient, energetic professional, vector, white background, no text no letters no words' },
    { style: 'zen', base: 'Zen rehabilitation logo, balanced organic form, sage green and cream, calming professional, vector, white background, no text no letters no words' },
    { style: 'moderne', base: 'Modern physiotherapy emblem, abstract spine or motion, teal and white, clean contemporary, vector flat design, no text no letters no words' },
    { style: 'minimaliste', base: 'Minimalist physical therapy logo, geometric body reference, charcoal and gold, premium, white background, no text no letters no words' }
  ],
  restaurant: [
    { style: 'artisan', base: 'Artisanal restaurant logo, hand-drawn organic feel, warm earthy tones terracotta and cream, rustic premium, vector, no text no letters no words' },
    { style: 'gastronomique', base: 'Fine dining restaurant emblem, sophisticated crest, deep navy and gold, luxury dining, vector, no text no letters no words' },
    { style: 'moderne', base: 'Modern cafe logo, minimalist geometric, sage green and white, fresh contemporary, flat design, no text no letters no words' },
    { style: 'bistro', base: 'Bistro parisien logo, classic French style, burgundy and gold, elegant timeless, vector, no text no letters no words' }
  ],
  coiffeur: [
    { style: 'elegant', base: 'Elegant hair salon logo, abstract scissors or flowing hair, rose gold and black, premium feminine, vector, white background, no text no letters no words' },
    { style: 'moderne', base: 'Modern hairdresser logo, minimalist geometric, coral and white, contemporary fresh, vector flat, no text no letters no words' },
    { style: 'luxe', base: 'Luxury beauty salon emblem, art deco style, gold and black, exclusive sophisticated, symmetrical, no text no letters no words' },
    { style: 'minimaliste', base: 'Minimalist salon logo, single flowing line, charcoal on white, premium clean, vector, no text no letters no words' }
  ],
  notaire: [
    { style: 'classique', base: 'Classic notary office logo, traditional seal or crest, navy and gold, prestigious, vector, white background, no text no letters no words' },
    { style: 'moderne', base: 'Modern notary firm emblem, abstract document or key, dark blue and silver, contemporary professional, vector, no text no letters no words' },
    { style: 'prestige', base: 'Prestigious notary emblem, heraldic inspired, deep green and gold, timeless authority, symmetrical, no text no letters no words' },
    { style: 'minimaliste', base: 'Minimalist notary logo, geometric pen or seal, charcoal and cream, premium clean, white background, no text no letters no words' }
  ],
  architecte: [
    { style: 'geometrique', base: 'Geometric architecture firm logo, clean lines, black and white, modernist, Bauhaus inspired, vector, no text no letters no words' },
    { style: 'moderne', base: 'Modern architecture logo, abstract building or structure, charcoal and gold, contemporary premium, vector flat, no text no letters no words' },
    { style: 'minimaliste', base: 'Minimalist architect logo, single line house or arch, black on white, pure and clean, vector, no text no letters no words' },
    { style: 'organique', base: 'Organic architecture emblem, flowing lines and structure, warm gray and bronze, sustainable feel, vector, no text no letters no words' }
  ],
  osteopathe: [
    { style: 'zen', base: 'Zen osteopathy logo, balanced organic form, sage green and cream, calming wellness, vector, white background, no text no letters no words' },
    { style: 'anatomique', base: 'Anatomical osteopath logo, abstract spine or hands, teal and white, professional clean, vector, no text no letters no words' },
    { style: 'moderne', base: 'Modern osteopathy emblem, flowing abstract body, blue gradient, contemporary wellness, vector flat, no text no letters no words' },
    { style: 'minimaliste', base: 'Minimalist osteopath logo, single flowing line, charcoal and sage, premium clean, white background, no text no letters no words' }
  ]
};

module.exports = function(router) {

  // ------------------------------------------
  // POST /logo-ai/generate — Generer 4 logos
  // ------------------------------------------
  router.post('/logo-ai/generate', async (req, res) => {
    try {
      const userId = req.user.id;
      const { profession, cabinetName, universe } = req.body;

      if (!universe) {
        return res.status(400).json({ success: false, error: 'universe requis' });
      }

      // Rate limit
      if (!checkRateLimit(userId)) {
        return res.status(429).json({ success: false, error: 'Limite atteinte (10 generations/heure)' });
      }

      // Check OPENAI_API_KEY
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ success: false, error: 'Generation IA non configuree' });
      }

      const prompts = LOGO_PROMPTS[profession] || LOGO_PROMPTS.dentiste;

      // Generate 4 logos in parallel
      const generations = await Promise.allSettled(
        prompts.map(async (p) => {
          const fullPrompt = p.base + ', concept: "' + universe + '", ultra high quality, professional branding';

          const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
            },
            body: JSON.stringify({
              model: 'dall-e-3',
              prompt: fullPrompt,
              n: 1,
              size: '1024x1024',
              quality: 'hd',
              style: 'natural'
            })
          });

          const data = await response.json();
          if (!data.data || !data.data[0]) throw new Error('No image returned');

          return {
            style: p.style,
            url: data.data[0].url,
            revised_prompt: data.data[0].revised_prompt
          };
        })
      );

      const logos = generations
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      if (!logos.length) {
        return res.status(500).json({ success: false, error: 'Aucun logo généré' });
      }

      res.json({ success: true, logos });
    } catch (err) {
      console.error('[logo-ai/generate]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /logo-ai/save — Sauvegarder le logo choisi
  // ------------------------------------------
  router.post('/logo-ai/save', async (req, res) => {
    try {
      const { siteId, logoUrl } = req.body;
      if (!siteId || !logoUrl) {
        return res.status(400).json({ success: false, error: 'siteId et logoUrl requis' });
      }

      // Download logo from DALL-E temp URL
      const imgResponse = await fetch(logoUrl);
      if (!imgResponse.ok) throw new Error('Impossible de telecharger le logo');
      const arrayBuffer = await imgResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to R2 (no compression, no encryption for images)
      const r2Result = await uploadToR2(buffer, {
        format: 'png',
        contentType: 'image/png',
        demandeId: 'logos-' + siteId,
        compress: false,
        encrypt: false
      });

      // Get site societe_id
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('societe_id')
        .eq('id', siteId)
        .maybeSingle();

      if (site) {
        // Update societe with logo key (presigned URL will be generated on read)
        await admin()
          .from('societes')
          .update({ logo_r2_key: r2Result.key, updated_at: new Date().toISOString() })
          .eq('id', site.societe_id);
      }

      res.json({ success: true, r2_key: r2Result.key });
    } catch (err) {
      console.error('[logo-ai/save]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
