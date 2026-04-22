// =============================================
// JADOMI — Module Mon site internet
// chatbot-public.js — Chatbot widget public (sans auth)
// Utilise par les visiteurs sur le site du professionnel
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

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
  // POST /chatbot/message — Envoyer un message au chatbot public
  // Body: { site_id, session_id, message }
  // ------------------------------------------
  router.post('/chatbot/message', async (req, res) => {
    try {
      const { site_id, session_id, message } = req.body || {};

      // --- Validation des inputs ---
      if (!site_id || typeof site_id !== 'string') {
        return res.json({ error: 'site_id requis' });
      }
      if (!session_id || typeof session_id !== 'string') {
        return res.json({ error: 'session_id requis' });
      }
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.json({ error: 'message requis' });
      }
      if (message.length > 2000) {
        return res.json({ error: 'Message trop long (2000 caracteres max)' });
      }

      // --- Recuperer la config chatbot ---
      const { data: config, error: configErr } = await admin()
        .from('vitrine_chatbot_configs')
        .select('*')
        .eq('site_id', site_id)
        .maybeSingle();
      if (configErr) throw configErr;
      if (!config || !config.enabled) {
        return res.json({ error: 'Chatbot non disponible pour ce site' });
      }

      // --- Recuperer les infos du site ---
      const { data: site, error: siteErr } = await admin()
        .from('vitrines_sites')
        .select('id, slug, profession_id, societe_id, societes(nom, adresse, code_postal, ville, telephone, email, type)')
        .eq('id', site_id)
        .maybeSingle();
      if (siteErr) throw siteErr;
      if (!site) {
        return res.json({ error: 'Site introuvable' });
      }

      const societe = site.societes || {};
      const cabinetName = societe.nom || 'Le cabinet';
      const cabinetType = societe.type || site.profession_id || 'professionnel';
      const address = [societe.adresse, societe.code_postal, societe.ville].filter(Boolean).join(', ');
      const phone = societe.telephone || '';
      const email = societe.email || '';

      // --- Recuperer ou creer la conversation ---
      let conversation;
      const { data: existingConv, error: convErr } = await admin()
        .from('vitrine_chatbot_conversations')
        .select('*')
        .eq('site_id', site_id)
        .eq('session_id', session_id)
        .maybeSingle();
      if (convErr) throw convErr;

      if (existingConv) {
        conversation = existingConv;
      } else {
        const { data: newConv, error: createErr } = await admin()
          .from('vitrine_chatbot_conversations')
          .insert({
            site_id,
            session_id,
            messages: [],
            created_at: new Date().toISOString()
          })
          .select('*')
          .single();
        if (createErr) throw createErr;
        conversation = newConv;
      }

      const existingMessages = conversation.messages || [];

      // --- Construire le system prompt ---
      const tone = config.tone || 'professionnel';
      const toneInstructions = {
        professionnel: 'Adoptez un ton professionnel, clair et rassurant.',
        chaleureux: 'Adoptez un ton chaleureux, empathique et bienveillant, tout en restant professionnel.',
        formel: 'Adoptez un ton formel, courtois et respectueux des conventions.'
      };

      const faqSection = config.faq && Array.isArray(config.faq) && config.faq.length > 0
        ? '\n\nFAQ du cabinet :\n' + config.faq.map(f => `Q: ${f.question}\nR: ${f.answer}`).join('\n\n')
        : '';

      const hoursSection = config.hours
        ? `\nHoraires d'ouverture : ${config.hours}`
        : '';

      const expertisesSection = config.expertises && Array.isArray(config.expertises) && config.expertises.length > 0
        ? `\nExpertises : ${config.expertises.join(', ')}`
        : '';

      const systemPrompt = `Vous etes l'assistant virtuel de ${cabinetName}, ${cabinetType}.
${toneInstructions[tone] || toneInstructions.professionnel}

Informations sur le cabinet :
- Nom : ${cabinetName}
- Type : ${cabinetType}
- Adresse : ${address || 'Non renseignee'}
- Telephone : ${phone || 'Non renseigne'}
- Email : ${email || 'Non renseigne'}${hoursSection}${expertisesSection}${faqSection}

Regles strictes :
- Utilisez TOUJOURS le vouvoiement.
- Ne donnez JAMAIS de conseil juridique, medical ou professionnel specifique.
- Pour les questions complexes ou specifiques, orientez le visiteur vers une prise de rendez-vous.
- Reponses courtes et concises : 50 a 100 mots maximum.
- Restez toujours dans le cadre du cabinet et de ses services.
- Si vous ne savez pas, dites-le honnêtement et proposez de contacter le cabinet directement.`;

      // --- Construire les messages pour Claude ---
      const conversationMessages = [];
      for (const msg of existingMessages) {
        conversationMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
      conversationMessages.push({ role: 'user', content: message.trim() });

      // --- Appel Claude ---
      const claudeRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: conversationMessages
      });

      const responseText = claudeRes.content && claudeRes.content[0] && claudeRes.content[0].text
        ? claudeRes.content[0].text
        : 'Desolee, je ne peux pas repondre pour le moment.';

      // --- Mettre a jour la conversation ---
      const updatedMessages = [
        ...existingMessages,
        { role: 'user', content: message.trim(), timestamp: new Date().toISOString() },
        { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }
      ];

      const { error: updateErr } = await admin()
        .from('vitrine_chatbot_conversations')
        .update({
          messages: updatedMessages,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id);
      if (updateErr) throw updateErr;

      // --- Verification escalade ---
      const redirectAfter = config.redirect_to_contact_after || 5;
      const messageCount = updatedMessages.filter(m => m.role === 'user').length;
      const shouldEscalate = messageCount >= redirectAfter;
      const escalateMessage = shouldEscalate
        ? `Pour mieux vous accompagner, je vous invite a contacter directement ${cabinetName}${phone ? ` au ${phone}` : ''}${email ? ` ou par email a ${email}` : ''}.`
        : null;

      return res.json({
        response: responseText,
        escalate: shouldEscalate,
        escalate_message: escalateMessage
      });

    } catch (err) {
      console.error('[vitrines/chatbot]', err);
      return res.json({ error: 'Erreur interne du chatbot' });
    }
  });

  // ------------------------------------------
  // GET /chatbot/config/:siteId — Config publique du chatbot
  // Retourne uniquement les donnees non sensibles
  // ------------------------------------------
  router.get('/chatbot/config/:siteId', async (req, res) => {
    try {
      const { siteId } = req.params;

      if (!siteId) {
        return res.json({ error: 'siteId requis' });
      }

      const { data: config, error: configErr } = await admin()
        .from('vitrine_chatbot_configs')
        .select('site_id, enabled, greeting, tone, hours, expertises')
        .eq('site_id', siteId)
        .maybeSingle();
      if (configErr) throw configErr;

      if (!config) {
        return res.json({ enabled: false });
      }

      return res.json({
        enabled: config.enabled || false,
        greeting: config.greeting || 'Bonjour, comment puis-je vous aider ?',
        tone: config.tone || 'professionnel',
        hours: config.hours || null,
        expertises: config.expertises || []
      });

    } catch (err) {
      console.error('[vitrines/chatbot]', err);
      return res.json({ error: 'Erreur lors du chargement de la configuration' });
    }
  });

};
