// =============================================
// JADOMI Ads — Plateforme publicitaire
// Routes /api/ads/*
// Monte sur l'app principale via require('./api/ads')(app, supabase, anthropic)
// =============================================
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

// --- Stripe (optionnel) ---
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('[ADS] Stripe initialisé');
  } else {
    console.log('[ADS] STRIPE_SECRET_KEY absent — paiements désactivés');
  }
} catch (e) { console.warn('[ADS] Stripe non configuré'); }

// --- Multer config (images/vidéos publicitaires) ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max pour créatifs pub
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|mp4|mov|webm/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Formats acceptés : JPEG, PNG, WebP, GIF, MP4, MOV, WebM'));
    }
  }
});

// --- Constantes ---
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'jadomi_admin_karim_2026';
const TIER_PRIORITY = { enterprise: 3, pro: 2, starter: 1, free: 0 };
const CAMPAIGN_REQUIRED_FIELDS = ['name', 'objective', 'budget_total', 'bid_amount', 'slot_type'];
const VALID_STATUSES = ['draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'archived'];
const VALID_OBJECTIVES = ['visibility', 'traffic', 'conversion', 'lead_generation'];
const VALID_SLOT_TYPES = ['banner_top', 'sidebar', 'native_feed', 'interstitial', 'sponsored_listing'];

// =============================================
// Helpers
// =============================================

/**
 * Hash SHA256 pour anonymiser les user_id (conformité RGPD)
 */
function hashUserId(userId) {
  if (!userId) return null;
  return crypto.createHash('sha256').update(String(userId)).digest('hex');
}

/**
 * Génère un identifiant unique pour les impressions
 */
function generateImpressionId() {
  return crypto.randomUUID();
}

/**
 * Upload fichier vers R2 ou fallback local
 */
async function uploadFile(buffer, filename, mimetype, subdir = 'creatives') {
  let url = null;
  try {
    const { R2Client } = require('../../lib/r2-client');
    const r2 = new R2Client();
    const key = `ads/${subdir}/${filename}`;
    url = await r2.upload(key, buffer, { contentType: mimetype });
  } catch (e) {
    // Fallback : sauvegarde locale
    const fs = require('fs');
    const uploadDir = `/home/ubuntu/jadomi/uploads/ads/${subdir}`;
    fs.mkdirSync(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, buffer);
    url = `/uploads/ads/${subdir}/${filename}`;
  }
  return url;
}

/**
 * Demande Claude IA (helper)
 */
async function claudeAsk(anthropic, prompt, maxTokens = 2000) {
  if (!anthropic) return { content: 'IA indisponible (anthropic non initialisé)' };
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    return { content: r.content?.[0]?.text || '' };
  } catch (e) {
    console.error('[ADS/Claude]', e.message);
    return { content: null, error: e.message };
  }
}

// =============================================
// Module export
// =============================================
module.exports = function mountAds(app, supabase, anthropic) {

  // ---- Auth middleware : JWT cookie ou header Authorization ----
  async function requireAuth(req, res, next) {
    try {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies?.access_token || null);
      if (!token) return res.status(401).json({ error: 'Veuillez vous connecter pour accéder à cette ressource.' });
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
      req.user = data.user;
      req.accessToken = token;
      next();
    } catch (e) {
      console.error('[ADS/auth]', e.message);
      res.status(401).json({ error: 'Erreur d\'authentification.' });
    }
  }

  // ---- Vérifie que l'utilisateur est annonceur ----
  async function requireAdvertiser(req, res, next) {
    try {
      const { data, error } = await supabase
        .from('ad_advertisers')
        .select('id, tier, status, wallet_balance')
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(403).json({ error: 'Vous devez créer un compte annonceur pour accéder à cette fonctionnalité.' });
      if (data.status === 'suspended') return res.status(403).json({ error: 'Votre compte annonceur est suspendu. Veuillez contacter le support.' });
      req.advertiser = data;
      next();
    } catch (e) {
      console.error('[ADS/requireAdvertiser]', e.message);
      res.status(500).json({ error: 'Erreur lors de la vérification du compte annonceur.' });
    }
  }

  // ---- Vérifie que l'utilisateur est admin ----
  function requireAdmin(req, res, next) {
    const tok = req.headers['x-admin-token'];
    if (!tok || tok !== ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Accès réservé aux administrateurs.' });
    }
    next();
  }

  // =============================================
  // 1. CAMPAIGN CRUD (auth + advertiser)
  // =============================================
  const campaignRouter = express.Router();
  campaignRouter.use(requireAuth, requireAdvertiser);

  // POST /api/ads/campaigns — Créer une campagne
  campaignRouter.post('/', async (req, res) => {
    try {
      const body = req.body;
      // Validation des champs obligatoires
      const missing = CAMPAIGN_REQUIRED_FIELDS.filter(f => !body[f]);
      if (missing.length > 0) {
        return res.status(400).json({ error: `Champs obligatoires manquants : ${missing.join(', ')}` });
      }
      if (body.objective && !VALID_OBJECTIVES.includes(body.objective)) {
        return res.status(400).json({ error: `Objectif invalide. Valeurs acceptées : ${VALID_OBJECTIVES.join(', ')}` });
      }
      if (body.slot_type && !VALID_SLOT_TYPES.includes(body.slot_type)) {
        return res.status(400).json({ error: `Type d'emplacement invalide. Valeurs acceptées : ${VALID_SLOT_TYPES.join(', ')}` });
      }

      const { data, error } = await supabase
        .from('ad_campaigns')
        .insert({
          advertiser_id: req.advertiser.id,
          name: body.name,
          objective: body.objective,
          budget_total: parseFloat(body.budget_total),
          budget_daily: body.budget_daily ? parseFloat(body.budget_daily) : null,
          budget_remaining: parseFloat(body.budget_total),
          bid_amount: parseFloat(body.bid_amount),
          slot_type: body.slot_type,
          targeting: body.targeting || {},
          creative_ids: body.creative_ids || [],
          start_date: body.start_date || null,
          end_date: body.end_date || null,
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, campaign: data });
    } catch (e) {
      console.error('[ADS/campaigns/create]', e.message);
      res.status(500).json({ error: 'Erreur lors de la création de la campagne.' });
    }
  });

  // GET /api/ads/campaigns — Lister les campagnes de l'annonceur
  campaignRouter.get('/', async (req, res) => {
    try {
      let query = supabase
        .from('ad_campaigns')
        .select('*')
        .eq('advertiser_id', req.advertiser.id)
        .order('created_at', { ascending: false });

      // Filtres optionnels
      if (req.query.status) query = query.eq('status', req.query.status);
      if (req.query.objective) query = query.eq('objective', req.query.objective);
      if (req.query.from) query = query.gte('created_at', req.query.from);
      if (req.query.to) query = query.lte('created_at', req.query.to);

      const { data, error } = await query;
      if (error) throw error;
      res.json({ campaigns: data });
    } catch (e) {
      console.error('[ADS/campaigns/list]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération des campagnes.' });
    }
  });

  // GET /api/ads/campaigns/:id — Détail d'une campagne + stats basiques
  campaignRouter.get('/:id', async (req, res) => {
    try {
      const { data: campaign, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('id', req.params.id)
        .eq('advertiser_id', req.advertiser.id)
        .single();

      if (error || !campaign) return res.status(404).json({ error: 'Campagne introuvable.' });

      // Stats basiques
      const [impressionsRes, clicksRes, conversionsRes] = await Promise.all([
        supabase.from('ad_impressions').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign.id),
        supabase.from('ad_clicks').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign.id),
        supabase.from('ad_conversions').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign.id)
      ]);

      const stats = {
        impressions: impressionsRes.count || 0,
        clicks: clicksRes.count || 0,
        conversions: conversionsRes.count || 0,
        ctr: impressionsRes.count > 0 ? ((clicksRes.count || 0) / impressionsRes.count * 100).toFixed(2) + '%' : '0%'
      };

      res.json({ campaign, stats });
    } catch (e) {
      console.error('[ADS/campaigns/detail]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération de la campagne.' });
    }
  });

  // PUT /api/ads/campaigns/:id — Modifier (seulement si draft ou paused)
  campaignRouter.put('/:id', async (req, res) => {
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from('ad_campaigns')
        .select('id, status')
        .eq('id', req.params.id)
        .eq('advertiser_id', req.advertiser.id)
        .single();

      if (fetchErr || !existing) return res.status(404).json({ error: 'Campagne introuvable.' });
      if (!['draft', 'paused'].includes(existing.status)) {
        return res.status(400).json({ error: 'Vous ne pouvez modifier une campagne que si elle est en brouillon ou en pause.' });
      }

      const updates = {};
      const allowedFields = ['name', 'objective', 'budget_total', 'budget_daily', 'bid_amount', 'slot_type', 'targeting', 'creative_ids', 'start_date', 'end_date'];
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      if (updates.budget_total) updates.budget_total = parseFloat(updates.budget_total);
      if (updates.budget_daily) updates.budget_daily = parseFloat(updates.budget_daily);
      if (updates.bid_amount) updates.bid_amount = parseFloat(updates.bid_amount);
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('ad_campaigns')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, campaign: data });
    } catch (e) {
      console.error('[ADS/campaigns/update]', e.message);
      res.status(500).json({ error: 'Erreur lors de la mise à jour de la campagne.' });
    }
  });

  // DELETE /api/ads/campaigns/:id — Archiver (soft delete)
  campaignRouter.delete('/:id', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('advertiser_id', req.advertiser.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Campagne introuvable.' });
      res.json({ success: true, message: 'Campagne archivée avec succès.' });
    } catch (e) {
      console.error('[ADS/campaigns/archive]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'archivage de la campagne.' });
    }
  });

  // POST /api/ads/campaigns/:id/submit — Soumettre pour validation
  campaignRouter.post('/:id/submit', async (req, res) => {
    try {
      const { data: campaign, error: fetchErr } = await supabase
        .from('ad_campaigns')
        .select('id, status')
        .eq('id', req.params.id)
        .eq('advertiser_id', req.advertiser.id)
        .single();

      if (fetchErr || !campaign) return res.status(404).json({ error: 'Campagne introuvable.' });
      if (campaign.status !== 'draft') {
        return res.status(400).json({ error: 'Seule une campagne en brouillon peut être soumise pour validation.' });
      }

      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({ status: 'pending_review', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, message: 'Votre campagne a été soumise pour validation. Vous serez notifié dès qu\'elle sera approuvée.', campaign: data });
    } catch (e) {
      console.error('[ADS/campaigns/submit]', e.message);
      res.status(500).json({ error: 'Erreur lors de la soumission de la campagne.' });
    }
  });

  // POST /api/ads/campaigns/:id/pause — Mettre en pause
  campaignRouter.post('/:id/pause', async (req, res) => {
    try {
      const { data: campaign, error: fetchErr } = await supabase
        .from('ad_campaigns')
        .select('id, status')
        .eq('id', req.params.id)
        .eq('advertiser_id', req.advertiser.id)
        .single();

      if (fetchErr || !campaign) return res.status(404).json({ error: 'Campagne introuvable.' });
      if (campaign.status !== 'active') {
        return res.status(400).json({ error: 'Seule une campagne active peut être mise en pause.' });
      }

      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({ status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, message: 'Campagne mise en pause.', campaign: data });
    } catch (e) {
      console.error('[ADS/campaigns/pause]', e.message);
      res.status(500).json({ error: 'Erreur lors de la mise en pause.' });
    }
  });

  // POST /api/ads/campaigns/:id/resume — Reprendre une campagne en pause
  campaignRouter.post('/:id/resume', async (req, res) => {
    try {
      const { data: campaign, error: fetchErr } = await supabase
        .from('ad_campaigns')
        .select('id, status')
        .eq('id', req.params.id)
        .eq('advertiser_id', req.advertiser.id)
        .single();

      if (fetchErr || !campaign) return res.status(404).json({ error: 'Campagne introuvable.' });
      if (campaign.status !== 'paused') {
        return res.status(400).json({ error: 'Seule une campagne en pause peut être reprise.' });
      }

      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({ status: 'active', resumed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, message: 'Campagne réactivée avec succès.', campaign: data });
    } catch (e) {
      console.error('[ADS/campaigns/resume]', e.message);
      res.status(500).json({ error: 'Erreur lors de la reprise de la campagne.' });
    }
  });

  app.use('/api/ads/campaigns', campaignRouter);

  // =============================================
  // 2. CREATIVES (auth + advertiser)
  // =============================================
  const creativeRouter = express.Router();
  creativeRouter.use(requireAuth, requireAdvertiser);

  // POST /api/ads/creatives — Upload créatif publicitaire
  creativeRouter.post('/', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });

      const file = req.file;
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '') || 'bin';
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

      const url = await uploadFile(file.buffer, filename, file.mimetype);

      // Métadonnées image
      let metadata = { original_filename: file.originalname, mimetype: file.mimetype, size: file.size };
      if (file.mimetype.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          const meta = await sharp(file.buffer).metadata();
          metadata.width = meta.width;
          metadata.height = meta.height;
          metadata.format = meta.format;
        } catch (e) { /* sharp non disponible */ }
      }

      const { data, error } = await supabase
        .from('ad_creatives')
        .insert({
          advertiser_id: req.advertiser.id,
          file_url: url,
          file_type: file.mimetype.startsWith('image/') ? 'image' : 'video',
          metadata,
          name: req.body.name || file.originalname,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, creative: data });
    } catch (e) {
      console.error('[ADS/creatives/upload]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'upload du créatif.' });
    }
  });

  // POST /api/ads/creatives/ai-analyze — Analyse de créatif par Claude Vision
  creativeRouter.post('/ai-analyze', upload.single('file'), async (req, res) => {
    try {
      if (!req.file && !req.body.image_url) {
        return res.status(400).json({ error: 'Veuillez fournir une image (fichier ou URL).' });
      }
      if (!anthropic) {
        return res.status(503).json({ error: 'Service d\'analyse IA temporairement indisponible.' });
      }

      let imageContent;
      if (req.file) {
        const base64 = req.file.buffer.toString('base64');
        const mediaType = req.file.mimetype;
        imageContent = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
      } else {
        imageContent = { type: 'image', source: { type: 'url', url: req.body.image_url } };
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: `Vous êtes un expert en publicité digitale. Analysez ce créatif publicitaire et fournissez :
1. **Score de qualité** (1-10) avec justification
2. **Points forts** du visuel
3. **Points d'amélioration** concrets
4. **Conformité** : vérifiez qu'il n'y a pas de contenu trompeur, inapproprié ou non conforme aux standards publicitaires
5. **Recommandations** pour optimiser le taux de clic (CTR)

Répondez en français avec le vouvoiement. Format JSON :
{ "quality_score": number, "strengths": string[], "improvements": string[], "compliance": { "ok": boolean, "issues": string[] }, "recommendations": string[] }`
            }
          ]
        }]
      });

      const analysisText = response.content?.[0]?.text || '';
      let analysis;
      try {
        // Extraire le JSON de la réponse
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: analysisText };
      } catch (e) {
        analysis = { raw: analysisText };
      }

      res.json({ success: true, analysis });
    } catch (e) {
      console.error('[ADS/creatives/ai-analyze]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'analyse du créatif.' });
    }
  });

  // POST /api/ads/creatives/ai-generate — Générer du texte publicitaire avec Claude
  creativeRouter.post('/ai-generate', async (req, res) => {
    try {
      const { product_name, product_description, target_audience, tone } = req.body;
      if (!product_name || !product_description) {
        return res.status(400).json({ error: 'Veuillez fournir le nom et la description du produit/service.' });
      }
      if (!anthropic) {
        return res.status(503).json({ error: 'Service de génération IA temporairement indisponible.' });
      }

      const prompt = `Vous êtes un copywriter publicitaire expert. Générez 3 variantes de texte publicitaire pour :

**Produit/Service** : ${product_name}
**Description** : ${product_description}
**Audience cible** : ${target_audience || 'professionnels de santé'}
**Ton demandé** : ${tone || 'professionnel'}

Créez exactement 3 variantes avec des tons différents :
1. **Percutante** : accroche forte, urgence, impact émotionnel
2. **Rassurante** : confiance, expertise, témoignage social
3. **Scientifique** : données factuelles, preuves, résultats mesurables

Pour chaque variante, fournissez :
- titre (max 60 caractères)
- accroche (max 120 caractères)
- corps (max 200 caractères)
- call_to_action (max 30 caractères)

Répondez en français avec le vouvoiement. Format JSON :
{ "variants": [{ "style": string, "title": string, "hook": string, "body": string, "call_to_action": string }] }`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content?.[0]?.text || '';
      let variants;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        variants = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
      } catch (e) {
        variants = { raw: text };
      }

      res.json({ success: true, ...variants });
    } catch (e) {
      console.error('[ADS/creatives/ai-generate]', e.message);
      res.status(500).json({ error: 'Erreur lors de la génération du texte publicitaire.' });
    }
  });

  app.use('/api/ads/creatives', creativeRouter);

  // =============================================
  // 3. AUDIENCE (auth + advertiser)
  // =============================================
  const audienceRouter = express.Router();
  audienceRouter.use(requireAuth, requireAdvertiser);

  // POST /api/ads/audience/estimate — Estimer la portée d'un ciblage
  audienceRouter.post('/estimate', async (req, res) => {
    try {
      const { professions, specialties, regions, structure_types, min_ca, max_ca } = req.body;

      let query = supabase.from('societes').select('id', { count: 'exact', head: true }).eq('actif', true);

      if (professions && professions.length > 0) {
        query = query.in('profession', professions);
      }
      if (specialties && specialties.length > 0) {
        query = query.in('specialite', specialties);
      }
      if (regions && regions.length > 0) {
        query = query.in('region', regions);
      }
      if (structure_types && structure_types.length > 0) {
        query = query.in('type', structure_types);
      }
      if (min_ca) query = query.gte('chiffre_affaires', min_ca);
      if (max_ca) query = query.lte('chiffre_affaires', max_ca);

      const { count, error } = await query;
      if (error) throw error;

      res.json({
        success: true,
        estimated_reach: count || 0,
        message: `Votre ciblage correspond à environ ${count || 0} structures sur la plateforme.`
      });
    } catch (e) {
      console.error('[ADS/audience/estimate]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'estimation de l\'audience.' });
    }
  });

  // POST /api/ads/audience/save — Sauvegarder un segment d'audience
  audienceRouter.post('/save', async (req, res) => {
    try {
      const { name, targeting_rules } = req.body;
      if (!name || !targeting_rules) {
        return res.status(400).json({ error: 'Veuillez fournir un nom et les règles de ciblage.' });
      }

      const { data, error } = await supabase
        .from('ad_audience_segments')
        .insert({
          advertiser_id: req.advertiser.id,
          name,
          targeting_rules
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, segment: data });
    } catch (e) {
      console.error('[ADS/audience/save]', e.message);
      res.status(500).json({ error: 'Erreur lors de la sauvegarde du segment.' });
    }
  });

  // GET /api/ads/audience/saved — Lister les segments sauvegardés
  audienceRouter.get('/saved', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ad_audience_segments')
        .select('*')
        .eq('advertiser_id', req.advertiser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ segments: data });
    } catch (e) {
      console.error('[ADS/audience/saved]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération des segments.' });
    }
  });

  app.use('/api/ads/audience', audienceRouter);

  // =============================================
  // 4. AD DELIVERY (public, pas d'auth pour le viewer)
  // =============================================

  // POST /api/ads/delivery — Sélectionner la meilleure pub pour un emplacement
  app.post('/api/ads/delivery', async (req, res) => {
    try {
      const { slot_type, user_context } = req.body;
      if (!slot_type) return res.status(400).json({ error: 'slot_type requis.' });

      // 1. Récupérer toutes les campagnes actives avec budget restant
      const { data: campaigns, error } = await supabase
        .from('ad_campaigns')
        .select('*, ad_advertisers!inner(tier)')
        .eq('status', 'active')
        .gt('budget_remaining', 0)
        .eq('slot_type', slot_type);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) {
        return res.json({ ad: null, message: 'Aucune publicité disponible pour cet emplacement.' });
      }

      // 2. Filtrer par ciblage (professions, spécialités, régions, structure)
      let eligible = campaigns;
      if (user_context) {
        eligible = campaigns.filter(c => {
          const t = c.targeting || {};
          if (t.professions && t.professions.length > 0 && user_context.profession) {
            if (!t.professions.includes(user_context.profession)) return false;
          }
          if (t.specialties && t.specialties.length > 0 && user_context.specialty) {
            if (!t.specialties.includes(user_context.specialty)) return false;
          }
          if (t.regions && t.regions.length > 0 && user_context.region) {
            if (!t.regions.includes(user_context.region)) return false;
          }
          if (t.structure_types && t.structure_types.length > 0 && user_context.structure_type) {
            if (!t.structure_types.includes(user_context.structure_type)) return false;
          }
          return true;
        });
      }

      if (eligible.length === 0) {
        return res.json({ ad: null, message: 'Aucune publicité correspondant à votre profil.' });
      }

      // 3. Trier par (bid * quality_score), avec tier comme priorité secondaire
      eligible.sort((a, b) => {
        const scoreA = (a.bid_amount || 0) * (a.quality_score || 1);
        const scoreB = (b.bid_amount || 0) * (b.quality_score || 1);
        if (scoreA !== scoreB) return scoreB - scoreA;
        // Tiebreaker : priorité du tier
        const tierA = TIER_PRIORITY[a.ad_advertisers?.tier] || 0;
        const tierB = TIER_PRIORITY[b.ad_advertisers?.tier] || 0;
        return tierB - tierA;
      });

      // 4. Sélectionner le gagnant
      const winner = eligible[0];
      const impressionId = generateImpressionId();

      res.json({
        ad: {
          campaign_id: winner.id,
          advertiser_id: winner.advertiser_id,
          name: winner.name,
          creative_ids: winner.creative_ids,
          slot_type: winner.slot_type,
          bid_amount: winner.bid_amount,
          targeting: winner.targeting
        },
        impression_id: impressionId
      });
    } catch (e) {
      console.error('[ADS/delivery]', e.message);
      res.status(500).json({ error: 'Erreur lors de la sélection publicitaire.' });
    }
  });

  // POST /api/ads/impressions — Enregistrer une impression
  app.post('/api/ads/impressions', async (req, res) => {
    try {
      const { campaign_id, impression_id, user_id, slot_type, page_url } = req.body;
      if (!campaign_id || !impression_id) {
        return res.status(400).json({ error: 'campaign_id et impression_id requis.' });
      }

      const { data, error } = await supabase
        .from('ad_impressions')
        .insert({
          campaign_id,
          impression_id,
          user_hash: hashUserId(user_id),
          slot_type: slot_type || null,
          page_url: page_url || null,
          ip_hash: hashUserId(req.ip),
          user_agent: req.headers['user-agent'] || null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      // Décrémenter le budget (coût par impression = bid / 1000 CPM)
      await supabase.rpc('ad_decrement_budget', {
        p_campaign_id: campaign_id,
        p_amount: 0 // Le coût réel est calculé côté DB via trigger ou fonction RPC
      }).catch(() => { /* non bloquant */ });

      res.json({ success: true, id: data.id });
    } catch (e) {
      console.error('[ADS/impressions]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement de l\'impression.' });
    }
  });

  // POST /api/ads/clicks — Enregistrer un clic + retourner l'URL de redirection
  app.post('/api/ads/clicks', async (req, res) => {
    try {
      const { campaign_id, impression_id, user_id, redirect_url } = req.body;
      if (!campaign_id || !impression_id) {
        return res.status(400).json({ error: 'campaign_id et impression_id requis.' });
      }

      const { data, error } = await supabase
        .from('ad_clicks')
        .insert({
          campaign_id,
          impression_id,
          user_hash: hashUserId(user_id),
          ip_hash: hashUserId(req.ip),
          user_agent: req.headers['user-agent'] || null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      // Récupérer l'URL de redirection depuis la campagne si non fournie
      let finalUrl = redirect_url;
      if (!finalUrl) {
        const { data: campaign } = await supabase
          .from('ad_campaigns')
          .select('targeting')
          .eq('id', campaign_id)
          .single();
        finalUrl = campaign?.targeting?.landing_url || '#';
      }

      res.json({ success: true, id: data.id, redirect_url: finalUrl });
    } catch (e) {
      console.error('[ADS/clicks]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement du clic.' });
    }
  });

  // POST /api/ads/conversions — Enregistrer une conversion (pixel)
  app.post('/api/ads/conversions', async (req, res) => {
    try {
      const { campaign_id, impression_id, user_id, conversion_type, conversion_value } = req.body;
      if (!campaign_id) {
        return res.status(400).json({ error: 'campaign_id requis.' });
      }

      const { data, error } = await supabase
        .from('ad_conversions')
        .insert({
          campaign_id,
          impression_id: impression_id || null,
          user_hash: hashUserId(user_id),
          conversion_type: conversion_type || 'generic',
          conversion_value: conversion_value ? parseFloat(conversion_value) : null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;
      res.json({ success: true, id: data.id });
    } catch (e) {
      console.error('[ADS/conversions]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la conversion.' });
    }
  });

  // =============================================
  // 5. WALLET (auth + advertiser)
  // =============================================
  const walletRouter = express.Router();
  walletRouter.use(requireAuth, requireAdvertiser);

  // GET /api/ads/wallet — Solde + historique récent
  walletRouter.get('/', async (req, res) => {
    try {
      const { data: transactions, error } = await supabase
        .from('ad_wallet_transactions')
        .select('*')
        .eq('advertiser_id', req.advertiser.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      res.json({
        balance: req.advertiser.wallet_balance || 0,
        transactions: transactions || []
      });
    } catch (e) {
      console.error('[ADS/wallet]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération du portefeuille.' });
    }
  });

  // POST /api/ads/wallet/deposit — Créer une session Stripe pour recharger le portefeuille
  walletRouter.post('/deposit', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'Le système de paiement n\'est pas configuré.' });

      const { amount } = req.body;
      if (!amount || amount < 10) {
        return res.status(400).json({ error: 'Le montant minimum de recharge est de 10 €.' });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Recharge portefeuille JADOMI Ads',
              description: `Recharge de ${amount} € sur votre portefeuille publicitaire`
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        metadata: {
          type: 'ads_wallet_deposit',
          advertiser_id: req.advertiser.id,
          user_id: req.user.id
        },
        success_url: `${req.headers.origin || 'https://jadomi.fr'}/ads?deposit=success`,
        cancel_url: `${req.headers.origin || 'https://jadomi.fr'}/ads?deposit=cancel`
      });

      res.json({ success: true, checkout_url: session.url, session_id: session.id });
    } catch (e) {
      console.error('[ADS/wallet/deposit]', e.message);
      res.status(500).json({ error: 'Erreur lors de la création de la session de paiement.' });
    }
  });

  // GET /api/ads/invoices — Lister les factures
  walletRouter.get('/invoices', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ad_invoices')
        .select('*')
        .eq('advertiser_id', req.advertiser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ invoices: data || [] });
    } catch (e) {
      console.error('[ADS/invoices]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération des factures.' });
    }
  });

  app.use('/api/ads/wallet', walletRouter);

  // GET /api/ads/invoices (alias direct)
  app.get('/api/ads/invoices', requireAuth, requireAdvertiser, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ad_invoices')
        .select('*')
        .eq('advertiser_id', req.advertiser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json({ invoices: data || [] });
    } catch (e) {
      console.error('[ADS/invoices]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération des factures.' });
    }
  });

  // =============================================
  // 6. SUBSCRIPTION (auth + advertiser)
  // =============================================
  const subRouter = express.Router();
  subRouter.use(requireAuth, requireAdvertiser);

  // POST /api/ads/subscription — Choisir un tier (créer abonnement Stripe)
  subRouter.post('/', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'Le système de paiement n\'est pas configuré.' });

      const { tier, price_id } = req.body;
      if (!tier || !price_id) {
        return res.status(400).json({ error: 'Veuillez sélectionner une offre publicitaire.' });
      }

      // Créer ou récupérer le customer Stripe
      let stripeCustomerId = req.advertiser.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { advertiser_id: req.advertiser.id, user_id: req.user.id }
        });
        stripeCustomerId = customer.id;
        await supabase
          .from('ad_advertisers')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', req.advertiser.id);
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: price_id, quantity: 1 }],
        metadata: {
          type: 'ads_subscription',
          advertiser_id: req.advertiser.id,
          tier
        },
        success_url: `${req.headers.origin || 'https://jadomi.fr'}/ads?subscription=success`,
        cancel_url: `${req.headers.origin || 'https://jadomi.fr'}/ads?subscription=cancel`
      });

      res.json({ success: true, checkout_url: session.url, session_id: session.id });
    } catch (e) {
      console.error('[ADS/subscription/create]', e.message);
      res.status(500).json({ error: 'Erreur lors de la création de l\'abonnement.' });
    }
  });

  // POST /api/ads/subscription/change — Changer de tier
  subRouter.post('/change', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'Le système de paiement n\'est pas configuré.' });

      const { new_price_id, new_tier } = req.body;
      if (!new_price_id || !new_tier) {
        return res.status(400).json({ error: 'Veuillez sélectionner la nouvelle offre souhaitée.' });
      }

      const { data: advertiser } = await supabase
        .from('ad_advertisers')
        .select('stripe_subscription_id')
        .eq('id', req.advertiser.id)
        .single();

      if (!advertiser?.stripe_subscription_id) {
        return res.status(400).json({ error: 'Vous n\'avez pas d\'abonnement actif à modifier.' });
      }

      const subscription = await stripe.subscriptions.retrieve(advertiser.stripe_subscription_id);
      const updated = await stripe.subscriptions.update(advertiser.stripe_subscription_id, {
        items: [{
          id: subscription.items.data[0].id,
          price: new_price_id
        }],
        proration_behavior: 'create_prorations'
      });

      // Mettre à jour le tier en base
      await supabase
        .from('ad_advertisers')
        .update({ tier: new_tier, updated_at: new Date().toISOString() })
        .eq('id', req.advertiser.id);

      res.json({ success: true, message: `Votre abonnement a été mis à jour vers le plan ${new_tier}.`, subscription_id: updated.id });
    } catch (e) {
      console.error('[ADS/subscription/change]', e.message);
      res.status(500).json({ error: 'Erreur lors de la modification de l\'abonnement.' });
    }
  });

  // POST /api/ads/subscription/cancel — Annuler l'abonnement
  subRouter.post('/cancel', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'Le système de paiement n\'est pas configuré.' });

      const { data: advertiser } = await supabase
        .from('ad_advertisers')
        .select('stripe_subscription_id')
        .eq('id', req.advertiser.id)
        .single();

      if (!advertiser?.stripe_subscription_id) {
        return res.status(400).json({ error: 'Vous n\'avez pas d\'abonnement actif à annuler.' });
      }

      await stripe.subscriptions.update(advertiser.stripe_subscription_id, {
        cancel_at_period_end: true
      });

      res.json({
        success: true,
        message: 'Votre abonnement sera annulé à la fin de la période en cours. Vous conservez l\'accès jusqu\'à cette date.'
      });
    } catch (e) {
      console.error('[ADS/subscription/cancel]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'annulation de l\'abonnement.' });
    }
  });

  app.use('/api/ads/subscription', subRouter);

  // =============================================
  // 7. ADMIN (admin token required)
  // =============================================
  const adminRouter = express.Router();
  adminRouter.use(requireAdmin);

  // GET /api/ads/admin/pending — Campagnes en attente de validation
  adminRouter.get('/pending', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*, ad_advertisers(user_id, tier, company_name)')
        .eq('status', 'pending_review')
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      res.json({ campaigns: data || [] });
    } catch (e) {
      console.error('[ADS/admin/pending]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération des campagnes.' });
    }
  });

  // POST /api/ads/admin/:id/approve — Approuver une campagne
  adminRouter.post('/:id/approve', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({
          status: 'active',
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'admin',
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id)
        .eq('status', 'pending_review')
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Campagne introuvable ou déjà traitée.' });
      res.json({ success: true, message: 'Campagne approuvée et activée.', campaign: data });
    } catch (e) {
      console.error('[ADS/admin/approve]', e.message);
      res.status(500).json({ error: 'Erreur lors de l\'approbation.' });
    }
  });

  // POST /api/ads/admin/:id/reject — Rejeter une campagne avec motif
  adminRouter.post('/:id/reject', async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: 'Veuillez fournir un motif de rejet.' });

      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'admin',
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id)
        .eq('status', 'pending_review')
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Campagne introuvable ou déjà traitée.' });
      res.json({ success: true, message: 'Campagne rejetée.', campaign: data });
    } catch (e) {
      console.error('[ADS/admin/reject]', e.message);
      res.status(500).json({ error: 'Erreur lors du rejet.' });
    }
  });

  // GET /api/ads/admin/stats — Statistiques globales de la plateforme publicitaire
  adminRouter.get('/stats', async (req, res) => {
    try {
      // Statistiques en parallèle
      const [
        campaignsRes,
        activeCampaignsRes,
        impressionsRes,
        clicksRes,
        conversionsRes,
        advertisersRes
      ] = await Promise.all([
        supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }),
        supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('ad_impressions').select('id', { count: 'exact', head: true }),
        supabase.from('ad_clicks').select('id', { count: 'exact', head: true }),
        supabase.from('ad_conversions').select('id', { count: 'exact', head: true }),
        supabase.from('ad_advertisers').select('id', { count: 'exact', head: true })
      ]);

      // Top annonceurs (par budget total dépensé)
      const { data: topAdvertisers } = await supabase
        .from('ad_campaigns')
        .select('advertiser_id, ad_advertisers(company_name, tier)')
        .eq('status', 'active')
        .order('budget_total', { ascending: false })
        .limit(10);

      // Revenus totaux (somme des transactions de type deposit)
      const { data: revenueData } = await supabase
        .from('ad_wallet_transactions')
        .select('amount')
        .eq('type', 'deposit');

      const totalRevenue = (revenueData || []).reduce((sum, t) => sum + (t.amount || 0), 0);

      res.json({
        stats: {
          total_campaigns: campaignsRes.count || 0,
          active_campaigns: activeCampaignsRes.count || 0,
          total_impressions: impressionsRes.count || 0,
          total_clicks: clicksRes.count || 0,
          total_conversions: conversionsRes.count || 0,
          total_advertisers: advertisersRes.count || 0,
          total_revenue: totalRevenue,
          global_ctr: impressionsRes.count > 0
            ? ((clicksRes.count || 0) / impressionsRes.count * 100).toFixed(2) + '%'
            : '0%'
        },
        top_advertisers: topAdvertisers || []
      });
    } catch (e) {
      console.error('[ADS/admin/stats]', e.message);
      res.status(500).json({ error: 'Erreur lors de la récupération des statistiques.' });
    }
  });

  app.use('/api/ads/admin', adminRouter);

  console.log('[JADOMI] Routes /api/ads montées');
};
