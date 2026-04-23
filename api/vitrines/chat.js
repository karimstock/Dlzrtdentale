// =============================================
// JADOMI — Module Mon site internet
// chat.js — Chatbot conversationnel (creation + reprise)
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');
const { getProfession } = require('./professions');
const { buildSystemPrompt, parseExtractedData, parseUploadRequests, stripUploadTags, formatGreeting, generateSlug, ensureUniqueSlug } = require('./professions/base');

// Mapping complet societe.type → profession_id
const TYPE_MAP = {
  'cabinet_dentaire': 'dentiste', 'dentiste': 'dentiste',
  'prothesiste': 'prothesiste', 'laboratoire_prothese': 'prothesiste',
  'cabinet_medical': 'medecin', 'medecin': 'medecin', 'generaliste': 'medecin',
  'kinesitherapeute': 'kine', 'kine': 'kine', 'masseur_kine': 'kine',
  'osteopathe': 'osteopathe',
  'orthoptiste': 'orthoptiste',
  'sage_femme': 'sage_femme',
  'cabinet_avocat': 'avocat', 'avocat': 'avocat',
  'notaire': 'notaire', 'office_notarial': 'notaire',
  'expert_comptable': 'expert_comptable',
  'architecte': 'architecte', 'agence_architecture': 'architecte',
  'salon_coiffure': 'coiffeur', 'coiffeur': 'coiffeur', 'barbier': 'coiffeur',
  'institut_beaute': 'estheticienne', 'estheticienne': 'estheticienne', 'spa': 'estheticienne',
  'boutique_mode': 'boutique_mode', 'pret_a_porter': 'boutique_mode',
  'bijouterie': 'bijoutier', 'bijoutier': 'bijoutier', 'joaillerie': 'bijoutier',
  'fleuriste': 'fleuriste',
  'restaurant': 'restaurant', 'bistrot': 'restaurant', 'brasserie': 'restaurant',
  'traiteur': 'traiteur',
  'maroquinier': 'maroquinier',
  'plombier': 'plombier', 'chauffagiste': 'plombier'
};

function mapTypeToProfession(type, metier) {
  return TYPE_MAP[type] || TYPE_MAP[metier] || metier || 'dentiste';
}

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

module.exports = function(router) {

  // ------------------------------------------
  // POST /chat — Envoyer un message au chatbot
  // ------------------------------------------
  router.post('/chat', requireSociete(), async (req, res) => {
    try {
      const societeId = req.societe.id;
      const userId = req.user.id;
      const { siteId, message } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'message requis' });
      }

      // Recuperer ou creer le site
      let site;
      if (siteId) {
        const { data, error } = await admin()
          .from('vitrines_sites')
          .select('*')
          .eq('id', siteId)
          .eq('societe_id', societeId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Site introuvable' });
        site = data;
      } else {
        // Determiner la profession depuis la societe
        const { data: societeData, error: socErr } = await admin()
          .from('societes')
          .select('*')
          .eq('id', societeId)
          .single();
        if (socErr) throw socErr;

        // Mapping societe.type → profession_id (18 professions)
        const professionId = mapTypeToProfession(societeData.type, societeData.metier);
        if (!getProfession(professionId)) {
          return res.status(400).json({ error: 'Profession non supportee : ' + professionId });
        }

        const rawSlug = generateSlug(societeData.nom, societeData.ville || societeData.adresse_ville);
        const slug = await ensureUniqueSlug(admin(), rawSlug);

        const { data: newSite, error: createErr } = await admin()
          .from('vitrines_sites')
          .insert({
            societe_id: societeId,
            profession_id: professionId,
            slug: slug,
            status: 'draft'
          })
          .select('*')
          .single();
        if (createErr) throw createErr;
        site = newSite;
      }

      // Config profession
      const profConfig = getProfession(site.profession_id);
      if (!profConfig) {
        return res.status(400).json({ error: 'Profession non configuree : ' + site.profession_id });
      }

      // Donnees societe pour le prompt
      const { data: societeData } = await admin()
        .from('societes')
        .select('*')
        .eq('id', societeId)
        .single();

      // Recuperer ou creer la conversation
      let conversation;
      const { data: existingConv } = await admin()
        .from('vitrines_conversations')
        .select('*')
        .eq('site_id', site.id)
        .maybeSingle();

      if (existingConv) {
        conversation = existingConv;
      } else {
        const greeting = formatGreeting(profConfig, societeData || {}, req.user);
        const { data: newConv, error: convErr } = await admin()
          .from('vitrines_conversations')
          .insert({
            site_id: site.id,
            mode: 'creation',
            messages: JSON.stringify([
              { role: 'assistant', content: greeting }
            ]),
            current_step: 'introduction'
          })
          .select('*')
          .single();
        if (convErr) throw convErr;
        conversation = newConv;
      }

      // Ajouter le message utilisateur
      const messages = Array.isArray(conversation.messages)
        ? conversation.messages
        : JSON.parse(conversation.messages || '[]');
      messages.push({ role: 'user', content: message });

      // Construire les messages pour Claude
      const systemPrompt = buildSystemPrompt(profConfig, societeData || {}, conversation.mode, req.user);
      const claudeMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      // Appel Claude en streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Site-Id', site.id);

      let assistantMessage = '';

      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: systemPrompt,
        messages: claudeMessages
      });

      stream.on('text', (text) => {
        assistantMessage += text;
        res.write('data: ' + JSON.stringify({ type: 'text', content: text }) + '\n\n');
      });

      stream.on('end', async () => {
        try {
          // Sauvegarder le message assistant (texte visible sans balises)
          const visibleText = stripUploadTags(assistantMessage);
          messages.push({ role: 'assistant', content: assistantMessage });

          // Parser les demandes d'upload
          const uploadRequests = parseUploadRequests(assistantMessage);

          // Verifier si extracted_data present
          const extractedData = parseExtractedData(assistantMessage);
          const updatePayload = {
            messages: JSON.stringify(messages)
          };

          if (extractedData) {
            updatePayload.extracted_data = extractedData;
            updatePayload.is_complete = true;

            // Creer les sections initiales
            await createInitialSections(site.id, profConfig, extractedData);
          }

          await admin()
            .from('vitrines_conversations')
            .update(updatePayload)
            .eq('id', conversation.id);

          // Enrichir les upload requests avec les poetic_labels
          const enrichedUploads = uploadRequests.map(u => {
            const catConfig = profConfig.photo_categories.find(c => c.id === u.category);
            return {
              ...u,
              label: catConfig ? catConfig.label : u.category,
              poetic_label: catConfig ? (catConfig.poetic_label || catConfig.label) : u.category
            };
          });

          res.write('data: ' + JSON.stringify({
            type: 'done',
            siteId: site.id,
            extracted: !!extractedData,
            uploads: enrichedUploads
          }) + '\n\n');
          res.end();
        } catch (saveErr) {
          console.error('[vitrines/chat] Erreur sauvegarde:', saveErr);
          res.write('data: ' + JSON.stringify({ type: 'error', error: saveErr.message }) + '\n\n');
          res.end();
        }
      });

      stream.on('error', (err) => {
        console.error('[vitrines/chat] Erreur Claude:', err);
        res.write('data: ' + JSON.stringify({ type: 'error', error: err.message }) + '\n\n');
        res.end();
      });

    } catch (err) {
      console.error('[vitrines/chat]', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  });

  // ------------------------------------------
  // GET /chat/init — Initialiser une conversation (premier message)
  // IMPORTANT : doit etre AVANT /chat/:siteId pour eviter le conflit de route
  // ------------------------------------------
  router.get('/chat/init', requireSociete(), async (req, res) => {
    try {
      const societeId = req.societe.id;

      const { data: societeData } = await admin()
        .from('societes')
        .select('*')
        .eq('id', societeId)
        .single();

      const professionId = mapTypeToProfession(societeData.type, societeData.metier);
      const profConfig = getProfession(professionId);
      if (!profConfig) {
        return res.status(400).json({ error: 'Profession non supportee' });
      }

      const greeting = formatGreeting(profConfig, societeData || {}, req.user);

      res.json({
        success: true,
        greeting: greeting,
        profession: {
          id: profConfig.id,
          label: profConfig.label,
          photo_categories: profConfig.photo_categories,
          questions: profConfig.questions
        }
      });
    } catch (err) {
      console.error('[vitrines/chat]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /chat/:siteId — Recuperer la conversation
  // ------------------------------------------
  router.get('/chat/:siteId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data, error } = await admin()
        .from('vitrines_conversations')
        .select('*')
        .eq('site_id', req.params.siteId)
        .maybeSingle();
      if (error) throw error;

      res.json({ success: true, conversation: data });
    } catch (err) {
      console.error('[vitrines/chat]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};

// ------------------------------------------
// Helper : creer les sections initiales du site
// ------------------------------------------
async function createInitialSections(siteId, profConfig, extractedData) {
  const sections = profConfig.suggested_sections.map((type, index) => ({
    site_id: siteId,
    type: type,
    position: index,
    content: buildSectionContent(type, profConfig, extractedData),
    is_visible: true
  }));

  const { error } = await admin()
    .from('vitrines_sections')
    .insert(sections);

  if (error) {
    console.error('[vitrines/chat] Erreur creation sections:', error);
  }
}

function buildSectionContent(type, profConfig, data) {
  const vocab = profConfig.vocabulaire;

  switch (type) {
    case 'hero':
      return {
        titre: data.cabinet_name || data.labo_name || '',
        sous_titre: profConfig.description_courte,
        ville: data.ville || '',
        cta_text: 'Prendre rendez-vous',
        cta_url: '#contact'
      };
    case 'expertises':
      return {
        titre: 'Nos expertises',
        items: (data.specialites || data.types_protheses || []).map(s => ({
          nom: s,
          description: ''
        }))
      };
    case 'made_in_france':
      return {
        titre: 'Fabrication francaise',
        texte: '',
        materiaux: data.materiaux || []
      };
    case 'technologies':
      return {
        titre: 'Nos equipements',
        items: (data.equipements || data.technologies || []).map(e => ({
          nom: e,
          description: ''
        }))
      };
    case 'cabinet':
      return {
        titre: 'Notre ' + vocab.lieu,
        description: data.approche_valeurs || data.philosophie_labo || '',
        nombre_praticiens: data.nombre_praticiens || null
      };
    case 'process':
      return {
        titre: 'Notre processus',
        etapes: []
      };
    case 'equipe':
      return {
        titre: 'Notre équipe',
        membres: []
      };
    case 'cas_cliniques':
      return {
        titre: 'Nos realisations',
        cas: []
      };
    case 'testimonials':
      return {
        titre: 'Temoignages',
        avis: []
      };
    case 'contact':
      return {
        titre: 'Contact',
        telephone: '',
        email: '',
        adresse: data.ville || '',
        horaires: '',
        cta_rdv: 'Prendre rendez-vous'
      };
    default:
      return { titre: type };
  }
}
