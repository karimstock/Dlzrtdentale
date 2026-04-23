// =============================================
// JADOMI — Module Mon site internet
// edit.js — Routes d'edition (texte, photo, regenerate, conversation)
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { uploadToR2, deleteFromR2 } = require('../../services/r2-storage');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');
const { getEditSystemPrompt, getRegeneratePrompt } = require('./professions/edit-prompts');
const { parseActions } = require('./professions/base');

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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = function(router) {

  // ------------------------------------------
  // Helper : verifier acces au site + recuperer site
  // ------------------------------------------
  async function getSiteOrFail(siteId, societeId, res) {
    const { data, error } = await admin()
      .from('vitrines_sites')
      .select('*')
      .eq('id', siteId)
      .eq('societe_id', societeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Site introuvable' });
      return null;
    }
    return data;
  }

  // ------------------------------------------
  // Helper : verifier et decrementer un quota
  // ------------------------------------------
  async function checkQuota(siteId, quotaField, res) {
    const now = new Date();
    const { data: quota } = await admin()
      .from('vitrines_usage_quotas')
      .select('*')
      .eq('site_id', siteId)
      .eq('period_year', now.getFullYear())
      .eq('period_month', now.getMonth() + 1)
      .maybeSingle();

    if (!quota) {
      // Creer le quota mensuel
      const { data: newQuota, error } = await admin()
        .from('vitrines_usage_quotas')
        .insert({
          site_id: siteId,
          period_year: now.getFullYear(),
          period_month: now.getMonth() + 1
        })
        .select('*')
        .single();
      if (error) throw error;
      return newQuota;
    }

    const usedField = quotaField + '_used';
    const limitField = quotaField + '_limit';
    if (quota[usedField] >= quota[limitField]) {
      res.status(429).json({
        error: 'Quota atteint pour ' + quotaField,
        used: quota[usedField],
        limit: quota[limitField]
      });
      return null;
    }

    return quota;
  }

  // ------------------------------------------
  // PATCH /edit/text — Modifier un champ texte
  // ------------------------------------------
  router.patch('/edit/text', requireSociete(), async (req, res) => {
    try {
      const { siteId, sectionId, fieldPath, value } = req.body;
      if (!siteId || !sectionId || !fieldPath) {
        return res.status(400).json({ error: 'siteId, sectionId et fieldPath requis' });
      }

      const site = await getSiteOrFail(siteId, req.societe.id, res);
      if (!site) return;

      // Recuperer la section
      const { data: section, error: secErr } = await admin()
        .from('vitrines_sections')
        .select('*')
        .eq('id', sectionId)
        .eq('site_id', siteId)
        .maybeSingle();
      if (secErr) throw secErr;
      if (!section) return res.status(404).json({ error: 'Section introuvable' });

      // Modifier le champ dans le content JSONB
      const content = { ...section.content };
      setNestedValue(content, fieldPath, value);

      const { data: updated, error } = await admin()
        .from('vitrines_sections')
        .update({ content: content })
        .eq('id', sectionId)
        .select('*')
        .single();
      if (error) throw error;

      // Logger l'edition
      await admin().from('vitrines_edits').insert({
        site_id: siteId,
        edit_type: 'text',
        edited_by: req.user.id,
        target_section_id: sectionId,
        meta: { fieldPath: fieldPath, old_value: getNestedValue(section.content, fieldPath), new_value: value }
      });

      res.json({ success: true, section: updated });
    } catch (err) {
      console.error('[vitrines/edit]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /edit/regenerate — Regenerer un champ via IA
  // ------------------------------------------
  router.post('/edit/regenerate', requireSociete(), async (req, res) => {
    try {
      const { siteId, sectionId, fieldPath, instructions } = req.body;
      if (!siteId || !sectionId || !fieldPath) {
        return res.status(400).json({ error: 'siteId, sectionId et fieldPath requis' });
      }

      const site = await getSiteOrFail(siteId, req.societe.id, res);
      if (!site) return;

      // Verifier quota
      const quota = await checkQuota(siteId, 'ai_regenerations', res);
      if (!quota) return;

      const profConfig = getProfession(site.profession_id);
      if (!profConfig) return res.status(400).json({ error: 'Profession non configuree' });

      const { data: section } = await admin()
        .from('vitrines_sections')
        .select('*')
        .eq('id', sectionId)
        .eq('site_id', siteId)
        .maybeSingle();
      if (!section) return res.status(404).json({ error: 'Section introuvable' });

      const prompt = getRegeneratePrompt(profConfig, section, fieldPath, instructions);

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });

      const newValue = response.content[0].text.trim();
      const tokensUsed = response.usage ? response.usage.output_tokens : 0;

      // Appliquer la modification
      const content = { ...section.content };
      setNestedValue(content, fieldPath, newValue);

      const { data: updated, error } = await admin()
        .from('vitrines_sections')
        .update({ content: content })
        .eq('id', sectionId)
        .select('*')
        .single();
      if (error) throw error;

      // Incrementer quota
      const now = new Date();
      await admin()
        .from('vitrines_usage_quotas')
        .update({ ai_regenerations_used: quota.ai_regenerations_used + 1 })
        .eq('site_id', siteId)
        .eq('period_year', now.getFullYear())
        .eq('period_month', now.getMonth() + 1);

      // Logger
      await admin().from('vitrines_edits').insert({
        site_id: siteId,
        edit_type: 'ai_regenerate',
        edited_by: req.user.id,
        target_section_id: sectionId,
        ai_tokens_consumed: tokensUsed,
        meta: { fieldPath: fieldPath, instructions: instructions }
      });

      res.json({ success: true, section: updated, new_value: newValue });
    } catch (err) {
      console.error('[vitrines/edit]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /edit/photo — Upload / remplacer / supprimer photo
  // ------------------------------------------
  router.post('/edit/photo', requireSociete(), upload.single('photo'), async (req, res) => {
    try {
      const { siteId, mediaId, action, category } = req.body;
      if (!siteId) return res.status(400).json({ error: 'siteId requis' });

      const site = await getSiteOrFail(siteId, req.societe.id, res);
      if (!site) return;

      if (action === 'delete' && mediaId) {
        // Supprimer
        const { data: media } = await admin()
          .from('vitrines_medias')
          .select('storage_path')
          .eq('id', mediaId)
          .eq('site_id', siteId)
          .maybeSingle();
        if (media) {
          try { await deleteFromR2(media.storage_path); } catch (e) { /* ignore */ }
          await admin().from('vitrines_medias').delete().eq('id', mediaId);
        }
        await admin().from('vitrines_edits').insert({
          site_id: siteId, edit_type: 'photo_delete', edited_by: req.user.id,
          target_media_id: mediaId
        });
        return res.json({ success: true });
      }

      if (!req.file) return res.status(400).json({ error: 'Fichier photo requis' });

      // Upload nouvelle photo sur R2
      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const r2Result = await uploadToR2(req.file.buffer, {
        format: ext,
        contentType: req.file.mimetype,
        compress: false,
        encrypt: false
      });

      if (action === 'replace' && mediaId) {
        // Remplacer : supprimer l'ancien, mettre a jour le path
        const { data: oldMedia } = await admin()
          .from('vitrines_medias')
          .select('storage_path')
          .eq('id', mediaId)
          .eq('site_id', siteId)
          .maybeSingle();
        if (oldMedia) {
          try { await deleteFromR2(oldMedia.storage_path); } catch (e) { /* ignore */ }
        }

        const { data: updated, error } = await admin()
          .from('vitrines_medias')
          .update({
            storage_path: r2Result.key,
            rgpd_validated: false,
            ai_analysis: null,
            alt_text: null
          })
          .eq('id', mediaId)
          .select('*')
          .single();
        if (error) throw error;

        await admin().from('vitrines_edits').insert({
          site_id: siteId, edit_type: 'photo_replace', edited_by: req.user.id,
          target_media_id: mediaId
        });

        return res.json({ success: true, media: updated });
      }

      // Ajouter nouvelle photo
      const { count } = await admin()
        .from('vitrines_medias')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('category', category || 'general');

      const { data: newMedia, error } = await admin()
        .from('vitrines_medias')
        .insert({
          site_id: siteId,
          category: category || 'general',
          storage_path: r2Result.key,
          position: count || 0,
          rgpd_validated: false
        })
        .select('*')
        .single();
      if (error) throw error;

      await admin().from('vitrines_edits').insert({
        site_id: siteId, edit_type: 'photo_add', edited_by: req.user.id,
        target_media_id: newMedia.id
      });

      res.json({ success: true, media: newMedia });
    } catch (err) {
      console.error('[vitrines/edit]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /edit/conversation — Mode edition conversationnel
  // ------------------------------------------
  router.post('/edit/conversation', requireSociete(), async (req, res) => {
    try {
      const { siteId, message } = req.body;
      if (!siteId || !message) {
        return res.status(400).json({ error: 'siteId et message requis' });
      }

      const site = await getSiteOrFail(siteId, req.societe.id, res);
      if (!site) return;

      const profConfig = getProfession(site.profession_id);
      if (!profConfig) return res.status(400).json({ error: 'Profession non configuree' });

      // Sections actuelles
      const { data: sections } = await admin()
        .from('vitrines_sections')
        .select('*')
        .eq('site_id', siteId)
        .order('position');

      // Recuperer ou creer conversation edition
      let conversation;
      const { data: existingConv } = await admin()
        .from('vitrines_conversations')
        .select('*')
        .eq('site_id', siteId)
        .maybeSingle();

      if (existingConv) {
        // Passer en mode edition
        if (existingConv.mode !== 'edition') {
          await admin()
            .from('vitrines_conversations')
            .update({ mode: 'edition' })
            .eq('id', existingConv.id);
        }
        conversation = existingConv;
      } else {
        const { data: newConv, error } = await admin()
          .from('vitrines_conversations')
          .insert({ site_id: siteId, mode: 'edition', messages: '[]' })
          .select('*')
          .single();
        if (error) throw error;
        conversation = newConv;
      }

      const messages = Array.isArray(conversation.messages)
        ? conversation.messages
        : JSON.parse(conversation.messages || '[]');
      messages.push({ role: 'user', content: message });

      const systemPrompt = getEditSystemPrompt(profConfig, site, sections || []);

      // Streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let assistantMessage = '';
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      });

      stream.on('text', (text) => {
        assistantMessage += text;
        res.write('data: ' + JSON.stringify({ type: 'text', content: text }) + '\n\n');
      });

      stream.on('end', async () => {
        try {
          messages.push({ role: 'assistant', content: assistantMessage });

          // Parser les actions
          const actions = parseActions(assistantMessage);

          await admin()
            .from('vitrines_conversations')
            .update({ messages: JSON.stringify(messages) })
            .eq('id', conversation.id);

          res.write('data: ' + JSON.stringify({
            type: 'done',
            actions: actions
          }) + '\n\n');
          res.end();
        } catch (saveErr) {
          console.error('[vitrines/edit] Erreur sauvegarde:', saveErr);
          res.write('data: ' + JSON.stringify({ type: 'error', error: saveErr.message }) + '\n\n');
          res.end();
        }
      });

      stream.on('error', (err) => {
        console.error('[vitrines/edit] Erreur Claude:', err);
        res.write('data: ' + JSON.stringify({ type: 'error', error: err.message }) + '\n\n');
        res.end();
      });

    } catch (err) {
      console.error('[vitrines/edit]', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  });

};

// ------------------------------------------
// Helpers JSONB
// ------------------------------------------

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}
