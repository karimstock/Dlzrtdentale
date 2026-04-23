// =============================================
// JADOMI — Module Mon site internet
// site-editor.js — Endpoints dashboard edition (sections, medias, contenu, AI regen)
// =============================================
var Anthropic = require('@anthropic-ai/sdk');
var { createClient } = require('@supabase/supabase-js');
var { requireSociete } = require('../multiSocietes/middleware');
var { getProfession } = require('./professions');

var _admin = null;
function admin() {
  if (!_admin) {
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    _admin = createClient(process.env.SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return _admin;
}

var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Section icons par type
var SECTION_ICONS = {
  hero: '🏠', expertises: '🎯', technologies: '🔧', made_in_france: '🇫🇷',
  cabinet: '🏢', equipe: '👥', cas_cliniques: '📸', testimonials: '💬',
  contact: '📞', process: '⚙️', sterilisation: '🧹', bibliotheque: '📚'
};

module.exports = function(router) {

  // ------------------------------------------
  // GET /editor/sections/:siteId — Sections + media counts
  // ------------------------------------------
  router.get('/editor/sections/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id, profession_id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var profConfig = getProfession(siteRes.data.profession_id);
      var photoCats = profConfig ? profConfig.photo_categories.filter(function(c) { return c.media_type !== 'video'; }) : [];

      // Get media counts by category
      var mediaRes = await admin().from('vitrines_medias').select('category').eq('site_id', req.params.siteId);
      var counts = {};
      (mediaRes.data || []).forEach(function(m) { counts[m.category] = (counts[m.category] || 0) + 1; });

      // Build sections list from profession photo_categories
      var sections = photoCats.map(function(c) {
        return {
          id: c.id,
          name: c.label,
          poetic_label: c.poetic_label || c.label,
          icon: SECTION_ICONS[c.id] || '📷',
          count: counts[c.id] || 0,
          is_custom: false,
          rgpd_sensible: c.rgpd_sensible || false
        };
      });

      // Add video sections
      var videoCats = profConfig && profConfig.video_categories ? profConfig.video_categories : [];
      videoCats.forEach(function(vc) {
        sections.push({
          id: vc.id,
          name: vc.label,
          poetic_label: vc.poetic_label || vc.label,
          icon: '🎬',
          count: counts[vc.id] || 0,
          is_custom: false,
          is_video: true
        });
      });

      // Add custom sections
      try {
        var customRes = await admin().from('vitrines_custom_sections').select('*').eq('site_id', req.params.siteId).order('position');
        (customRes.data || []).forEach(function(cs) {
          sections.push({
            id: 'custom_' + cs.id,
            custom_id: cs.id,
            name: cs.name,
            poetic_label: cs.description || cs.name,
            icon: cs.icon || '📁',
            count: counts['custom_' + cs.id] || 0,
            is_custom: true
          });
        });
      } catch (e) { /* table may not exist yet */ }

      res.json({ success: true, sections: sections });
    } catch (err) {
      console.error('[vitrines/site-editor]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /editor/content/:siteId — All sections content for editing
  // ------------------------------------------
  router.get('/editor/content/:siteId', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id').eq('id', req.params.siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var secRes = await admin().from('vitrines_sections').select('*').eq('site_id', req.params.siteId).order('position');
      res.json({ success: true, sections: secRes.data || [] });
    } catch (err) {
      console.error('[vitrines/site-editor]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /editor/section/:sectionId — Update section content
  // ------------------------------------------
  router.patch('/editor/section/:sectionId', requireSociete(), async function(req, res) {
    try {
      // Verify ownership via join
      var secRes = await admin().from('vitrines_sections').select('id, site_id, vitrines_sites!inner(societe_id)').eq('id', req.params.sectionId).maybeSingle();
      if (!secRes.data) return res.status(404).json({ error: 'Section introuvable' });
      if (secRes.data.vitrines_sites.societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });

      var updates = {};
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.is_visible !== undefined) updates.is_visible = req.body.is_visible;
      if (req.body.position !== undefined) updates.position = req.body.position;

      var updRes = await admin().from('vitrines_sections').update(updates).eq('id', req.params.sectionId).select('*').single();
      if (updRes.error) throw updRes.error;
      res.json({ success: true, section: updRes.data });
    } catch (err) {
      console.error('[vitrines/site-editor]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /editor/custom-sections — Create custom section
  // ------------------------------------------
  router.post('/editor/custom-sections', requireSociete(), async function(req, res) {
    try {
      var siteId = req.body.site_id;
      if (!siteId || !req.body.name) return res.status(400).json({ error: 'site_id et name requis' });

      var siteRes = await admin().from('vitrines_sites').select('id').eq('id', siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var insRes = await admin().from('vitrines_custom_sections').insert({
        site_id: siteId,
        name: req.body.name,
        description: req.body.description || '',
        icon: req.body.icon || '📁'
      }).select('*').single();
      if (insRes.error) throw insRes.error;
      res.json({ success: true, section: insRes.data });
    } catch (err) {
      console.error('[vitrines/site-editor]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /editor/ai/regenerate-field — AI regeneration with style hints + 3 propositions
  // ------------------------------------------
  router.post('/editor/ai/regenerate-field', requireSociete(), async function(req, res) {
    try {
      var siteId = req.body.site_id;
      var fieldPath = req.body.field_path;
      var currentValue = req.body.current_value || '';
      var styleHint = req.body.style_hint || 'default';
      var instructions = req.body.instructions || '';

      if (!siteId || !fieldPath) return res.status(400).json({ error: 'site_id et field_path requis' });

      var siteRes = await admin().from('vitrines_sites').select('id, profession_id, societe_id').eq('id', siteId).eq('societe_id', req.societe.id).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var profConfig = getProfession(siteRes.data.profession_id);
      var metier = profConfig ? profConfig.description_courte : 'professionnel';
      var seoKw = profConfig ? profConfig.seo_keywords.slice(0, 3).join(', ') : '';

      var styleInstructions = {
        'default': 'Propose 3 variations ameliorees, plus impactantes.',
        'shorter': 'Propose 3 versions plus courtes et percutantes (max 50% de la longueur actuelle).',
        'emotional': 'Propose 3 versions plus emotionnelles qui touchent le coeur du patient. Utilise des formulations qui evoquent la confiance, le soin, la serenite.',
        'seo': 'Propose 3 versions optimisees SEO local. Integre naturellement les mots-cles : ' + seoKw + '. Pense "dentiste Roubaix" ou "[metier] [ville]".'
      };

      var prompt = 'Tu es un redacteur web expert pour les ' + metier + 's.\n\n'
        + 'Champ : "' + fieldPath + '"\n'
        + (currentValue ? 'Contenu actuel : "' + currentValue + '"\n\n' : '\n')
        + (instructions ? 'Instructions : ' + instructions + '\n\n' : '')
        + (styleInstructions[styleHint] || styleInstructions['default']) + '\n\n'
        + 'REGLES :\n- Ton professionnel adapte au secteur ' + metier + '\n- Phrases concises\n- Pas de guillemets autour des propositions\n\n'
        + 'REPONDS EN JSON STRICT :\n{"propositions":["proposition 1","proposition 2","proposition 3"]}';

      var response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      });

      var content = response.content[0].text;
      var propositions;
      try {
        var jsonMatch = content.match(/\{[\s\S]*\}/);
        var parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        propositions = parsed.propositions || [content.trim()];
      } catch (e) {
        propositions = [content.trim()];
      }

      res.json({ success: true, propositions: propositions, field_path: fieldPath, style: styleHint });
    } catch (err) {
      console.error('[vitrines/site-editor]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
