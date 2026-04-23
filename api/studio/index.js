// =============================================
// JADOMI Studio — API Endpoints
// Routes /api/studio/*
// Monte sur l'app principale via require('./api/studio')(app, supabase, anthropic)
// =============================================
const express = require('express');
const { generateCreative, getProvider, getWallet, getProvidersStatus, uploadToR2 } = require('../../lib/ai-studio/router');
const { enhancePrompt } = require('../../lib/ai-studio/prompt-enhancer');
const { validatePrompt, validateText } = require('../../lib/ai-studio/moderator');

module.exports = function mountStudio(app, supabase, anthropic) {
  const router = express.Router();

  // --- Auth middleware ---
  async function requireAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Token invalide' });

      req.userId = user.id;
      req.userEmail = user.email;

      // Chercher societe_id
      const { data: membership } = await supabase
        .from('user_societes')
        .select('societe_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      req.societeId = membership ? membership.societe_id : null;

      next();
    } catch (err) {
      return res.status(401).json({ error: 'Authentification echouee' });
    }
  }

  // ================================================
  // POST /api/studio/enhance-prompt
  // Optimisation IA du brief utilisateur
  // ================================================
  router.post('/enhance-prompt', requireAuth, async (req, res) => {
    try {
      const { user_brief, media_type, style } = req.body || {};
      if (!user_brief) return res.status(400).json({ error: 'user_brief requis' });

      validatePrompt(user_brief);

      const optimized = await enhancePrompt(
        anthropic,
        user_brief,
        media_type || 'image',
        style || 'pro'
      );

      return res.json({ optimized_prompt: optimized });
    } catch (err) {
      console.error('[STUDIO] enhance-prompt error:', err.message);
      return res.status(400).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/generate-image
  // ================================================
  router.post('/generate-image', requireAuth, async (req, res) => {
    try {
      const { prompt, quality, size } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'prompt requis' });

      validatePrompt(prompt);

      const result = await generateCreative(supabase, req.userId, req.societeId, 'image', quality || 'standard', {
        prompt,
        quality: quality || 'standard',
        size: size || '1024x1024',
        user_prompt: req.body.user_brief || prompt,
      });

      return res.json(result);
    } catch (err) {
      console.error('[STUDIO] generate-image error:', err.message);
      const status = err.message.includes('insufficient_coins') ? 402
        : err.message.includes('rate_limit') ? 429
        : err.message.includes('provider_not_available') ? 503
        : 500;
      return res.status(status).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/generate-video
  // ================================================
  router.post('/generate-video', requireAuth, async (req, res) => {
    try {
      const { prompt, duration, quality } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'prompt requis' });

      validatePrompt(prompt);

      const result = await generateCreative(supabase, req.userId, req.societeId, 'video', quality || 'standard', {
        prompt,
        quality: quality || 'standard',
        duration: duration || 4,
        user_prompt: req.body.user_brief || prompt,
      });

      return res.json(result);
    } catch (err) {
      console.error('[STUDIO] generate-video error:', err.message);
      const status = err.message.includes('insufficient_coins') ? 402
        : err.message.includes('rate_limit') ? 429
        : err.message.includes('provider_not_available') ? 503
        : 500;
      return res.status(status).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/generate-voice
  // ================================================
  router.post('/generate-voice', requireAuth, async (req, res) => {
    try {
      const { text, voice, provider } = req.body || {};
      if (!text) return res.status(400).json({ error: 'text requis' });

      validateText(text);

      const quality = provider === 'elevenlabs' ? 'premium' : 'standard';

      const result = await generateCreative(supabase, req.userId, req.societeId, 'voice', quality, {
        text,
        voice: voice || 'nova',
        voice_id: voice,
        user_prompt: text.substring(0, 200),
      });

      return res.json(result);
    } catch (err) {
      console.error('[STUDIO] generate-voice error:', err.message);
      const status = err.message.includes('insufficient_coins') ? 402
        : err.message.includes('rate_limit') ? 429
        : err.message.includes('provider_not_available') ? 503
        : 500;
      return res.status(status).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/generate-avatar
  // ================================================
  router.post('/generate-avatar', requireAuth, async (req, res) => {
    try {
      const { text, avatar_id, voice } = req.body || {};
      if (!text) return res.status(400).json({ error: 'text requis' });

      validateText(text);

      const result = await generateCreative(supabase, req.userId, req.societeId, 'avatar', 'premium', {
        text,
        avatar_id: avatar_id || 'default',
        voice_id: voice,
        user_prompt: text.substring(0, 200),
      });

      return res.json(result);
    } catch (err) {
      console.error('[STUDIO] generate-avatar error:', err.message);
      const status = err.message.includes('insufficient_coins') ? 402
        : err.message.includes('rate_limit') ? 429
        : err.message.includes('provider_not_available') ? 503
        : 500;
      return res.status(status).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/stock/images?q=...&per_page=20
  // ================================================
  router.get('/stock/images', requireAuth, async (req, res) => {
    try {
      const { q, per_page, page, orientation } = req.query;
      if (!q) return res.status(400).json({ error: 'q (query) requis' });

      const unsplash = getProvider('unsplash');
      if (!unsplash || !await unsplash.isAvailable()) {
        return res.status(503).json({ error: 'Unsplash non disponible' });
      }

      const results = await unsplash.search(q, {
        per_page: parseInt(per_page) || 20,
        page: parseInt(page) || 1,
        orientation,
      });

      return res.json(results);
    } catch (err) {
      console.error('[STUDIO] stock/images error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/stock/videos?q=...&per_page=20
  // ================================================
  router.get('/stock/videos', requireAuth, async (req, res) => {
    try {
      const { q, per_page, page } = req.query;
      if (!q) return res.status(400).json({ error: 'q (query) requis' });

      const pexels = getProvider('pexels');
      if (!pexels || !await pexels.isAvailable()) {
        return res.status(503).json({ error: 'Pexels non disponible' });
      }

      const results = await pexels.searchVideos(q, {
        per_page: parseInt(per_page) || 20,
        page: parseInt(page) || 1,
      });

      return res.json(results);
    } catch (err) {
      console.error('[STUDIO] stock/videos error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/library
  // ================================================
  router.get('/library', requireAuth, async (req, res) => {
    try {
      const { type } = req.query;
      let query = supabase
        .from('studio_library')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (type && type !== 'all') {
        query = query.eq('media_type', type);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.json(data || []);
    } catch (err) {
      console.error('[STUDIO] library error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // POST /api/studio/library/save
  // ================================================
  router.post('/library/save', requireAuth, async (req, res) => {
    try {
      const { generation_id, name, tags, r2_url, media_type } = req.body || {};

      const item = {
        user_id: req.userId,
        societe_id: req.societeId,
        name: name || 'Sans titre',
        tags: tags || [],
      };

      if (generation_id) {
        item.source_generation_id = generation_id;
        // Recuperer infos de la generation
        const { data: gen } = await supabase
          .from('ai_generations_log')
          .select('r2_url, generation_type')
          .eq('id', generation_id)
          .single();
        if (gen) {
          item.r2_url = gen.r2_url;
          item.media_type = gen.generation_type;
        }
      } else {
        item.r2_url = r2_url;
        item.media_type = media_type || 'image';
      }

      const { data, error } = await supabase
        .from('studio_library')
        .insert(item)
        .select()
        .single();

      if (error) throw error;

      return res.json(data);
    } catch (err) {
      console.error('[STUDIO] library/save error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // DELETE /api/studio/library/:id
  // ================================================
  router.delete('/library/:id', requireAuth, async (req, res) => {
    try {
      const { error } = await supabase
        .from('studio_library')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.userId);

      if (error) throw error;

      return res.json({ success: true });
    } catch (err) {
      console.error('[STUDIO] library/delete error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/providers-status
  // ================================================
  router.get('/providers-status', requireAuth, async (req, res) => {
    try {
      const status = await getProvidersStatus();
      return res.json(status);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ================================================
  // GET /api/studio/wallet
  // ================================================
  router.get('/wallet', requireAuth, async (req, res) => {
    try {
      const wallet = await getWallet(supabase, req.userId);
      return res.json({
        balance: wallet.balance,
        level: wallet.level,
        total_earned: wallet.total_earned,
        total_spent: wallet.total_spent,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Mount
  app.use('/api/studio', router);
  console.log('[JADOMI] Module Studio (hub IA creatif) monte — 12 endpoints');
};
