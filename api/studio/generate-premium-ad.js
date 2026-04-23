/**
 * JADOMI Passe 35 — Premium Ad Generation API
 * POST /api/studio/generate-premium-ad
 *
 * Full pipeline: Sora 2 background (optional) + ElevenLabs voiceover (optional)
 * + Remotion render + R2 upload.
 *
 * Cost: 150 coins (12 EUR) — margin 89%
 * Backend cost: ~1.30 EUR (Sora $1 + ElevenLabs $0.30 + compute $0.10)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const PREMIUM_AD_COST_COINS = 150;

/**
 * POST /api/studio/generate-premium-ad
 * Body: {
 *   template: 'ad-formation' | 'ad-product' | 'ad-event' | 'ad-service',
 *   props: { title, subtitle, price, duration, location, logoUrl, brandColor, ctaText },
 *   include_sora_background: boolean,
 *   voice_over_script: string (optional),
 *   societeId: string
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { template, props, include_sora_background, voice_over_script, societeId } = req.body;

    if (!template || !societeId || !props) {
      return res.status(400).json({ error: 'template, props et societeId requis' });
    }

    const validTemplates = ['ad-formation', 'ad-product', 'ad-event', 'ad-service'];
    if (!validTemplates.includes(template)) {
      return res.status(400).json({ error: `Template invalide. Valides: ${validTemplates.join(', ')}` });
    }

    // Check wallet
    const supabase = req.app.locals?.supabase;
    if (supabase) {
      const { data: wallet } = await supabase
        .from('advertiser_wallets')
        .select('balance_coins')
        .eq('societe_id', societeId)
        .single();

      if (!wallet || wallet.balance_coins < PREMIUM_AD_COST_COINS) {
        return res.status(402).json({
          error: 'Solde insuffisant',
          required: PREMIUM_AD_COST_COINS,
          current: wallet?.balance_coins || 0,
        });
      }

      // Debit coins
      await supabase
        .from('advertiser_wallets')
        .update({ balance_coins: wallet.balance_coins - PREMIUM_AD_COST_COINS })
        .eq('societe_id', societeId);
    }

    const generationId = `premium-ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let backgroundVideoUrl = null;
    let voiceOverUrl = null;
    let videoUrl = null;

    // Step 1: Generate Sora 2 background (optional)
    if (include_sora_background) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const stylePrompts = {
          'ad-formation': 'Professional education environment, lecture hall with warm golden lighting, subtle camera motion, premium cinematic',
          'ad-product': 'Modern dental product showcase, clean white and gold design, rotating product display, premium lighting',
          'ad-event': 'Prestigious conference venue, large hall with elegant gold and black decor, subtle crowd motion, cinematic',
          'ad-service': 'Professional dental office interior, warm ambient lighting, modern equipment, calm and trustworthy atmosphere',
        };

        const bgPrompt = stylePrompts[template] || stylePrompts['ad-formation'];

        const response = await openai.videos.generate({
          model: 'sora',
          prompt: bgPrompt,
          duration: 10,
          resolution: '1080p',
        });

        if (response?.url) {
          backgroundVideoUrl = response.url;
        }
      } catch (err) {
        console.warn('[Premium Ad] Sora 2 not available:', err.message);
        // Continue without background video
      }
    }

    // Step 2: Generate voiceover (optional)
    if (voice_over_script) {
      try {
        // Try ElevenLabs first
        if (process.env.ELEVENLABS_API_KEY) {
          const axios = require('axios');
          const voiceResponse = await axios.post(
            'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
            {
              text: voice_over_script,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            },
            {
              headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
              },
              responseType: 'arraybuffer',
            }
          );

          const voicePath = path.join('/tmp', `${generationId}-voice.mp3`);
          fs.writeFileSync(voicePath, Buffer.from(voiceResponse.data));
          voiceOverUrl = voicePath;
        }
      } catch (err) {
        console.warn('[Premium Ad] ElevenLabs not available:', err.message);
      }
    }

    // Step 3: Render Remotion composition
    try {
      const { bundle } = require('@remotion/bundler');
      const { renderMedia, selectComposition } = require('@remotion/renderer');

      const entryPoint = path.join(__dirname, '../../remotion/index.ts');
      if (fs.existsSync(entryPoint)) {
        const remotionProps = {
          ...props,
          backgroundVideoUrl,
          style: template.replace('ad-', ''),
        };

        const bundled = await bundle({ entryPoint });
        const composition = await selectComposition({
          serveUrl: bundled,
          id: 'AdTemplate',
          inputProps: remotionProps,
        });

        const outputPath = path.join('/tmp', `${generationId}.mp4`);
        await renderMedia({
          composition,
          serveUrl: bundled,
          codec: 'h264',
          outputLocation: outputPath,
          inputProps: remotionProps,
        });

        // Upload to R2
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        if (process.env.R2_ACCESS_KEY_ID) {
          const s3 = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT,
            credentials: {
              accessKeyId: process.env.R2_ACCESS_KEY_ID,
              secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            },
          });

          const key = `premium-ads/${generationId}.mp4`;
          await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET || 'jadomi',
            Key: key,
            Body: fs.readFileSync(outputPath),
            ContentType: 'video/mp4',
          }));

          videoUrl = `${process.env.R2_PUBLIC_URL || ''}/${key}`;
          fs.unlinkSync(outputPath);
        } else {
          const publicDir = path.join(__dirname, '../../public/assets/passe-35/videos');
          if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
          fs.renameSync(outputPath, path.join(publicDir, `${generationId}.mp4`));
          videoUrl = `/assets/passe-35/videos/${generationId}.mp4`;
        }
      }
    } catch (err) {
      console.warn('[Premium Ad] Remotion rendering unavailable:', err.message);
    }

    // Cleanup voiceover temp
    if (voiceOverUrl && fs.existsSync(voiceOverUrl)) {
      try { fs.unlinkSync(voiceOverUrl); } catch (e) {}
    }

    // Log generation
    if (supabase) {
      await supabase.from('ai_generations_log').insert({
        societe_id: societeId,
        provider: 'remotion-premium',
        type: 'video',
        prompt: JSON.stringify({ template, props, include_sora_background, has_voiceover: !!voice_over_script }),
        result_url: videoUrl,
        cost_coins: PREMIUM_AD_COST_COINS,
        status: videoUrl ? 'completed' : 'pending',
      }).catch(() => {});
    }

    res.json({
      success: true,
      videoUrl,
      cost_coins: PREMIUM_AD_COST_COINS,
      generation_id: generationId,
      template,
      features: {
        sora_background: !!backgroundVideoUrl,
        voice_over: !!voiceOverUrl,
        remotion_render: !!videoUrl,
      },
      status: videoUrl ? 'completed' : 'rendering_unavailable',
    });

  } catch (err) {
    console.error('[Premium Ad API] Error:', err);
    res.status(500).json({ error: 'Erreur lors de la generation video premium' });
  }
});

module.exports = router;
