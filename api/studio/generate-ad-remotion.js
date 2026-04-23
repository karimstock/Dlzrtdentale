/**
 * JADOMI Passe 35 — Remotion Video Generation API
 * POST /api/studio/generate-ad-remotion
 *
 * Generates personalized ad videos using Remotion compositions.
 * Debits coins from advertiser wallet, renders video, uploads to R2.
 *
 * Note: Remotion rendering requires @remotion/bundler and @remotion/renderer
 * which are installed but rendering is compute-intensive.
 * For production, consider Lambda rendering.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Cost per video in coins
const VIDEO_COST_COINS = 50;

/**
 * POST /api/studio/generate-ad-remotion
 * Body: {
 *   template: 'AdTemplate' | 'HeroHomepage' | 'StatsAnimation',
 *   props: { title, price, duration, location, logoUrl, brandColor, ctaText },
 *   societeId: string (for wallet debit)
 * }
 * Returns: { success, videoUrl, cost_coins, generation_id }
 */
router.post('/', async (req, res) => {
  try {
    const { template, props, societeId } = req.body;

    if (!template || !societeId) {
      return res.status(400).json({ error: 'template et societeId requis' });
    }

    // Validate template
    const validTemplates = ['AdTemplate', 'HeroHomepage', 'StatsAnimation'];
    if (!validTemplates.includes(template)) {
      return res.status(400).json({ error: `Template invalide. Valides: ${validTemplates.join(', ')}` });
    }

    // Check wallet balance (using existing studio wallet system)
    const supabase = req.app.locals?.supabase;
    if (supabase) {
      const { data: wallet } = await supabase
        .from('advertiser_wallets')
        .select('balance_coins')
        .eq('societe_id', societeId)
        .single();

      if (!wallet || wallet.balance_coins < VIDEO_COST_COINS) {
        return res.status(402).json({
          error: 'Solde insuffisant',
          required: VIDEO_COST_COINS,
          current: wallet?.balance_coins || 0
        });
      }

      // Debit coins
      await supabase
        .from('advertiser_wallets')
        .update({ balance_coins: wallet.balance_coins - VIDEO_COST_COINS })
        .eq('societe_id', societeId);
    }

    // Generate unique ID for this generation
    const generationId = `remotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Attempt Remotion rendering
    let videoUrl = null;
    try {
      const { bundle } = require('@remotion/bundler');
      const { renderMedia, selectComposition } = require('@remotion/renderer');

      const entryPoint = path.join(__dirname, '../../remotion/index.ts');

      // Check if entry point exists
      if (!fs.existsSync(entryPoint)) {
        throw new Error('Remotion entry point not found. Run setup first.');
      }

      const bundled = await bundle({
        entryPoint,
        webpackOverride: (config) => config,
      });

      const composition = await selectComposition({
        serveUrl: bundled,
        id: template,
        inputProps: props || {},
      });

      const outputPath = path.join('/tmp', `${generationId}.mp4`);

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: props || {},
      });

      // Upload to R2 if available
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      if (process.env.R2_ACCESS_KEY_ID && process.env.R2_ENDPOINT) {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        });

        const fileBuffer = fs.readFileSync(outputPath);
        const key = `remotion-videos/${generationId}.mp4`;

        await s3.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET || 'jadomi',
          Key: key,
          Body: fileBuffer,
          ContentType: 'video/mp4',
        }));

        videoUrl = `${process.env.R2_PUBLIC_URL || ''}/${key}`;

        // Cleanup temp file
        fs.unlinkSync(outputPath);
      } else {
        // Serve locally
        const publicDir = path.join(__dirname, '../../public/assets/passe-35/videos');
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        const localPath = path.join(publicDir, `${generationId}.mp4`);
        fs.renameSync(outputPath, localPath);
        videoUrl = `/assets/passe-35/videos/${generationId}.mp4`;
      }
    } catch (renderErr) {
      console.warn('[Remotion] Rendering not available:', renderErr.message);
      // Return graceful fallback — video generation is pending
      videoUrl = null;
    }

    // Log generation
    if (supabase) {
      await supabase.from('ai_generations_log').insert({
        societe_id: societeId,
        provider: 'remotion',
        type: 'video',
        prompt: JSON.stringify({ template, props }),
        result_url: videoUrl,
        cost_coins: VIDEO_COST_COINS,
        status: videoUrl ? 'completed' : 'pending',
      }).catch(() => {});
    }

    res.json({
      success: true,
      videoUrl,
      cost_coins: VIDEO_COST_COINS,
      generation_id: generationId,
      template,
      status: videoUrl ? 'completed' : 'rendering_unavailable',
      message: videoUrl
        ? 'Video generee avec succes'
        : 'Remotion rendering non disponible sur ce serveur. La video sera generee ulterieurement.',
    });

  } catch (err) {
    console.error('[Remotion API] Error:', err);
    res.status(500).json({ error: 'Erreur lors de la generation video' });
  }
});

/**
 * GET /api/studio/generate-ad-remotion/templates
 * Returns available Remotion templates
 */
router.get('/templates', (req, res) => {
  res.json({
    templates: [
      {
        id: 'AdTemplate',
        name: 'Publicite Annonceur',
        description: 'Video publicitaire personnalisable (formation, produit, evenement)',
        duration: '6 secondes',
        cost_coins: VIDEO_COST_COINS,
        props: ['title', 'price', 'duration', 'location', 'logoUrl', 'brandColor', 'ctaText'],
      },
      {
        id: 'HeroHomepage',
        name: 'Hero JADOMI',
        description: 'Animation hero pour site web JADOMI',
        duration: '5 secondes',
        cost_coins: VIDEO_COST_COINS,
        props: [],
      },
      {
        id: 'StatsAnimation',
        name: 'Stats Animees',
        description: 'Chiffres cles animes pour reseaux sociaux',
        duration: '4 secondes',
        cost_coins: VIDEO_COST_COINS,
        props: [],
      },
    ],
  });
});

module.exports = router;
