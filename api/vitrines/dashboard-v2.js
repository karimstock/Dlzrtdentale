// =============================================
// JADOMI — Module Mon site internet
// dashboard-v2.js — Dashboard modulable endpoints
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

// Default tabs created on first access
var DEFAULT_TABS = [
  { name: 'Apercu', icon: '👁️', tab_type: 'apercu', widgets: [{ widget_type: 'preview_iframe', width: 12, height: 8 }] },
  { name: 'Medias', icon: '📸', tab_type: 'medias', widgets: [{ widget_type: 'media_manager', width: 12, height: 10 }] },
  { name: 'Contenu', icon: '✏️', tab_type: 'contenu', widgets: [{ widget_type: 'content_editor', width: 12, height: 10 }] },
  { name: 'Themes', icon: '🎨', tab_type: 'themes', widgets: [{ widget_type: 'theme_selector', width: 12, height: 10 }] },
  { name: 'Parametres', icon: '⚙️', tab_type: 'params', widgets: [{ widget_type: 'params_form', width: 8, height: 8 }, { widget_type: 'publish_card', width: 4, height: 8 }] },
  { name: 'Statistiques', icon: '📊', tab_type: 'stats', widgets: [{ widget_type: 'kpi_row', width: 12, height: 3 }, { widget_type: 'contact_list', width: 12, height: 7 }] },
  { name: 'Legal', icon: '⚖️', tab_type: 'legal', widgets: [{ widget_type: 'legal_checker', width: 12, height: 10 }] }
];

// IA contexts by tab type
var IA_CONTEXTS = {
  apercu: 'Tu es l\'assistant de l\'onglet Apercu. L\'utilisateur voit son site. Tu peux suggerer des ameliorations visuelles, de palette, de layout. Sois concis et propose des actions concretes.',
  medias: 'Tu es l\'assistant Medias. L\'utilisateur gere photos/videos. Conseille sur le placement, les photos manquantes, la qualite. Ton de directeur artistique.',
  contenu: 'Tu es l\'assistant Contenu editorial. L\'utilisateur modifie les textes. Propose des versions plus impactantes, SEO-optimisees, emotionnelles. Adapte au metier.',
  params: 'Tu es l\'assistant Parametres. Aide a completer les infos du cabinet, mentions legales, reseaux sociaux. Signale les champs obligatoires manquants.',
  stats: 'Tu es l\'assistant Statistiques. Analyse les visites, conversions, contacts. Propose des actions pour ameliorer le trafic et les demandes.',
  legal: 'Tu es l\'assistant Legal. Verifie les mentions obligatoires, RGPD, CGV. Cite les articles de loi pertinents. Sois precis juridiquement.',
  themes: 'Tu es l\'assistant de l\'onglet Themes & Apparence. L\'utilisateur choisit un theme de couleurs pour son site vitrine. Tu peux : 1) Recommander un theme selon son metier (ex: avocat → Nuit Emeraude pour la gravite et le prestige). 2) Expliquer l\'impact emotionnel d\'une palette. 3) Donner des conseils sur la coherence couleurs × photos. Sois concis, precis, evocateur. Tu parles directement au proprietaire du cabinet/commerce.',
  custom: 'Tu es un assistant polyvalent JADOMI. Aide l\'utilisateur avec ce qu\'il demande.'
};

module.exports = function(router) {

  // ------------------------------------------
  // GET /v2/tabs — Liste les onglets (cree les defauts si premiere fois)
  // ------------------------------------------
  router.get('/v2/tabs', requireSociete(), async function(req, res) {
    try {
      // Find site for this societe
      var siteRes = await admin().from('vitrines_sites').select('id, profession_id').eq('societe_id', req.societe.id).order('is_primary', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (!siteRes.data) return res.json({ success: true, tabs: [], has_site: false });
      var siteId = siteRes.data.id;

      var tabsRes = await admin().from('dashboard_tabs').select('*').eq('site_id', siteId).eq('is_archived', false).order('position');
      var tabs = tabsRes.data || [];

      // First time: create default tabs
      if (!tabs.length) {
        for (var i = 0; i < DEFAULT_TABS.length; i++) {
          var dt = DEFAULT_TABS[i];
          var tabInsert = await admin().from('dashboard_tabs').insert({
            site_id: siteId, user_id: req.user.id,
            name: dt.name, icon: dt.icon, tab_type: dt.tab_type,
            position: i, is_default: true,
            ia_context: IA_CONTEXTS[dt.tab_type] || IA_CONTEXTS.custom
          }).select('*').single();
          if (tabInsert.data && dt.widgets) {
            for (var w = 0; w < dt.widgets.length; w++) {
              await admin().from('dashboard_widgets').insert({
                tab_id: tabInsert.data.id,
                widget_type: dt.widgets[w].widget_type,
                width: dt.widgets[w].width || 12,
                height: dt.widgets[w].height || 4,
                position_y: w
              });
            }
          }
        }
        // Re-fetch
        tabsRes = await admin().from('dashboard_tabs').select('*').eq('site_id', siteId).eq('is_archived', false).order('position');
        tabs = tabsRes.data || [];
      }

      res.json({ success: true, tabs: tabs, site_id: siteId });
    } catch (err) {
      console.error('[vitrines/dashboard-v2]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /v2/tabs — Creer un onglet
  // ------------------------------------------
  router.post('/v2/tabs', requireSociete(), async function(req, res) {
    try {
      var siteRes = await admin().from('vitrines_sites').select('id').eq('societe_id', req.societe.id).order('is_primary', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (!siteRes.data) return res.status(404).json({ error: 'Site introuvable' });

      var maxPos = await admin().from('dashboard_tabs').select('position').eq('site_id', siteRes.data.id).order('position', { ascending: false }).limit(1).maybeSingle();

      var insRes = await admin().from('dashboard_tabs').insert({
        site_id: siteRes.data.id, user_id: req.user.id,
        name: req.body.name || 'Nouvel onglet',
        icon: req.body.icon || '📄',
        tab_type: req.body.tab_type || 'custom',
        position: (maxPos.data ? maxPos.data.position : 0) + 1,
        ia_context: IA_CONTEXTS[req.body.tab_type] || req.body.ia_context || IA_CONTEXTS.custom
      }).select('*').single();
      if (insRes.error) throw insRes.error;

      res.json({ success: true, tab: insRes.data });
    } catch (err) {
      console.error('[vitrines/dashboard-v2]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /v2/tabs/:tabId — Renommer, icone, position
  // ------------------------------------------
  router.patch('/v2/tabs/:tabId', requireSociete(), async function(req, res) {
    try {
      var updates = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.icon !== undefined) updates.icon = req.body.icon;
      if (req.body.position !== undefined) updates.position = req.body.position;
      if (req.body.ia_context !== undefined) updates.ia_context = req.body.ia_context;
      updates.updated_at = new Date().toISOString();

      var updRes = await admin().from('dashboard_tabs').update(updates).eq('id', req.params.tabId).select('*').single();
      if (updRes.error) throw updRes.error;
      res.json({ success: true, tab: updRes.data });
    } catch (err) {
      console.error('[vitrines/dashboard-v2]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // DELETE /v2/tabs/:tabId — Archive
  // ------------------------------------------
  router.delete('/v2/tabs/:tabId', requireSociete(), async function(req, res) {
    try {
      await admin().from('dashboard_tabs').update({ is_archived: true }).eq('id', req.params.tabId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /v2/tabs/:tabId/widgets — Widgets d'un onglet
  // ------------------------------------------
  router.get('/v2/tabs/:tabId/widgets', requireSociete(), async function(req, res) {
    try {
      var wRes = await admin().from('dashboard_widgets').select('*').eq('tab_id', req.params.tabId).order('position_y').order('position_x');
      res.json({ success: true, widgets: wRes.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /v2/tabs/:tabId/widgets — Ajouter widget
  // ------------------------------------------
  router.post('/v2/tabs/:tabId/widgets', requireSociete(), async function(req, res) {
    try {
      var insRes = await admin().from('dashboard_widgets').insert({
        tab_id: req.params.tabId,
        widget_type: req.body.widget_type,
        title: req.body.title || '',
        config: req.body.config || {},
        width: req.body.width || 12,
        height: req.body.height || 4,
        position_x: req.body.position_x || 0,
        position_y: req.body.position_y || 0
      }).select('*').single();
      if (insRes.error) throw insRes.error;
      res.json({ success: true, widget: insRes.data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /v2/widgets/:widgetId — Update widget
  // ------------------------------------------
  router.patch('/v2/widgets/:widgetId', requireSociete(), async function(req, res) {
    try {
      var updates = {};
      ['title', 'config', 'width', 'height', 'position_x', 'position_y'].forEach(function(f) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      });
      var updRes = await admin().from('dashboard_widgets').update(updates).eq('id', req.params.widgetId).select('*').single();
      if (updRes.error) throw updRes.error;
      res.json({ success: true, widget: updRes.data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // DELETE /v2/widgets/:widgetId
  // ------------------------------------------
  router.delete('/v2/widgets/:widgetId', requireSociete(), async function(req, res) {
    try {
      await admin().from('dashboard_widgets').delete().eq('id', req.params.widgetId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // POST /v2/tabs/:tabId/ia — Message IA contextuel
  // ------------------------------------------
  router.post('/v2/tabs/:tabId/ia', requireSociete(), async function(req, res) {
    try {
      var message = req.body.message;
      if (!message) return res.status(400).json({ error: 'message requis' });

      // Get tab context
      var tabRes = await admin().from('dashboard_tabs').select('ia_context, name, tab_type, site_id').eq('id', req.params.tabId).maybeSingle();
      if (!tabRes.data) return res.status(404).json({ error: 'Tab introuvable' });
      var tab = tabRes.data;

      // Get site + profession for context
      var siteRes = await admin().from('vitrines_sites').select('profession_id, slug').eq('id', tab.site_id).maybeSingle();
      var profConfig = siteRes.data ? getProfession(siteRes.data.profession_id) : null;

      // Get or create conversation
      var convRes = await admin().from('dashboard_ia_conversations').select('*').eq('tab_id', req.params.tabId).maybeSingle();
      var messages = convRes.data ? (convRes.data.messages || []) : [];
      messages.push({ role: 'user', content: message });

      // System prompt
      var system = (tab.ia_context || IA_CONTEXTS[tab.tab_type] || IA_CONTEXTS.custom)
        + (profConfig ? '\n\nMetier : ' + profConfig.description_courte + '. Vocabulaire : ' + JSON.stringify(profConfig.vocabulaire) : '')
        + '\nSois concis (3-5 phrases max). Propose des actions concretes.';

      // Call Claude
      var response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        system: system,
        messages: messages.slice(-10).map(function(m) { return { role: m.role, content: m.content }; })
      });

      var assistantMsg = response.content[0].text;
      messages.push({ role: 'assistant', content: assistantMsg });

      // Save conversation
      if (convRes.data) {
        await admin().from('dashboard_ia_conversations').update({ messages: messages, updated_at: new Date().toISOString() }).eq('id', convRes.data.id);
      } else {
        await admin().from('dashboard_ia_conversations').insert({ tab_id: req.params.tabId, messages: messages });
      }

      res.json({ success: true, response: assistantMsg });
    } catch (err) {
      console.error('[vitrines/dashboard-v2]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /v2/tabs/:tabId/ia — Historique IA
  // ------------------------------------------
  router.get('/v2/tabs/:tabId/ia', requireSociete(), async function(req, res) {
    try {
      var convRes = await admin().from('dashboard_ia_conversations').select('messages').eq('tab_id', req.params.tabId).maybeSingle();
      res.json({ success: true, messages: convRes.data ? convRes.data.messages : [] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
