// =============================================
// JADOMI — Dentiste Pro : Chat IA 24/7
// Assistant virtuel Claude pour les patients
// Fonctionne pour TOUTES les professions de sante
// =============================================
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { admin, requirePatient } = require('./shared');

const router = express.Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// =========================================================
// POST /chat-ia/message — Patient pose une question a l'IA
// Body: { message, session_id? }
// Auth: requirePatient
// =========================================================
router.post('/message', requirePatient(), async (req, res) => {
  try {
    const { message, session_id } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message requis' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message trop long (2000 caracteres max)' });
    }

    const patientId = req.patient.id;
    const cabinetId = req.patient.cabinet_id;

    // --- Charger le cabinet ---
    const { data: cabinet, error: cabErr } = await admin()
      .from('dentiste_pro_cabinets')
      .select('id, nom, profession_type, telephone, email, adresse')
      .eq('id', cabinetId)
      .maybeSingle();

    if (cabErr) throw cabErr;
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet introuvable' });
    }

    // --- Charger la config IA ---
    const { data: iaConfig } = await admin()
      .from('dentiste_pro_ia_config')
      .select('*')
      .eq('cabinet_id', cabinetId)
      .maybeSingle();

    const knowledgeBase = iaConfig?.knowledge_base || iaConfig?.ia_knowledge_base || {};
    const iaEnabled = iaConfig?.enabled ?? iaConfig?.ia_enabled ?? true;

    if (!iaEnabled) {
      return res.json({
        response: 'L\'assistant IA n\'est pas disponible pour le moment. Veuillez contacter directement le cabinet.',
        escalated: false
      });
    }

    // --- Charger l'historique de la session ---
    const sessionFilter = session_id || `patient_${patientId}`;
    const { data: previousEvents } = await admin()
      .from('dentiste_pro_events')
      .select('metadata')
      .eq('cabinet_id', cabinetId)
      .eq('patient_id', patientId)
      .eq('event_type', 'ia_message')
      .eq('session_id', sessionFilter)
      .order('created_at', { ascending: true })
      .limit(20);

    // Construire les messages de contexte
    const conversationMessages = [];
    if (previousEvents && previousEvents.length > 0) {
      for (const evt of previousEvents) {
        const meta = evt.metadata || {};
        if (meta.role && meta.content) {
          conversationMessages.push({
            role: meta.role === 'user' ? 'user' : 'assistant',
            content: meta.content
          });
        }
      }
    }
    conversationMessages.push({ role: 'user', content: message.trim() });

    // --- Construire le system prompt ---
    const professionLabel = cabinet.profession_type || 'professionnel de sante';
    const knowledgeStr = Object.keys(knowledgeBase).length > 0
      ? JSON.stringify(knowledgeBase, null, 2)
      : 'Aucune information specifique configuree.';

    const customPrompt = iaConfig?.ia_prompt_system || iaConfig?.prompt_system || '';

    const systemPrompt = `Vous etes l'assistant IA du cabinet ${cabinet.nom} (${professionLabel}).
Repondez aux questions des patients de maniere professionnelle et bienveillante.
Vouvoyez toujours le patient. Pas d'emoji.

Informations du cabinet:
${knowledgeStr}

Coordonnees:
- Telephone: ${cabinet.telephone || 'Non renseigne'}
- Email: ${cabinet.email || 'Non renseigne'}
- Adresse: ${cabinet.adresse || 'Non renseignee'}

Si vous n'etes pas sur de la reponse (confiance < 70%), repondez:
"[ESCALADE] Je ne suis pas en mesure de vous repondre avec certitude. Je transmets votre question a l'equipe du cabinet."

Ne donnez JAMAIS de diagnostic medical.
Ne prescrivez JAMAIS de medicament.
Orientez vers un RDV en cas de doute clinique.
${customPrompt ? '\nInstructions supplementaires du cabinet:\n' + customPrompt : ''}`;

    // --- Appel Claude Haiku ---
    const claudeRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages: conversationMessages
    });

    const responseText = claudeRes.content && claudeRes.content[0] && claudeRes.content[0].text
      ? claudeRes.content[0].text
      : 'Je ne suis pas en mesure de vous repondre pour le moment. Veuillez contacter directement le cabinet.';

    const escalated = responseText.includes('[ESCALADE]');

    // --- Sauvegarder les messages dans les events ---
    const now = new Date().toISOString();
    const eventsToInsert = [
      {
        cabinet_id: cabinetId,
        patient_id: patientId,
        event_type: 'ia_message',
        session_id: sessionFilter,
        metadata: { role: 'user', content: message.trim() },
        created_at: now
      },
      {
        cabinet_id: cabinetId,
        patient_id: patientId,
        event_type: 'ia_message',
        session_id: sessionFilter,
        metadata: { role: 'assistant', content: responseText },
        created_at: new Date(Date.now() + 1).toISOString() // +1ms pour l'ordre
      }
    ];

    await admin()
      .from('dentiste_pro_events')
      .insert(eventsToInsert);

    // --- Si escalade : creer un message systeme pour le praticien ---
    if (escalated) {
      // Message dans la messagerie directe pour alerter le praticien
      await admin()
        .from('dentiste_pro_messages')
        .insert({
          cabinet_id: cabinetId,
          patient_id: patientId,
          sender_type: 'system',
          sender_id: null,
          content: `[IA] Question patient non resolue par l'IA : "${message.trim().substring(0, 500)}"`,
          created_at: new Date().toISOString()
        });

      // Creer un event d'escalade
      await admin()
        .from('dentiste_pro_events')
        .insert({
          cabinet_id: cabinetId,
          patient_id: patientId,
          event_type: 'ia_escalade',
          session_id: sessionFilter,
          metadata: {
            question: message.trim(),
            ia_response: responseText
          },
          created_at: new Date().toISOString()
        });
    }

    return res.json({
      response: responseText,
      escalated,
      session_id: sessionFilter
    });

  } catch (err) {
    console.error('[chat-ia/message]', err);
    return res.status(500).json({ error: 'Erreur de l\'assistant IA' });
  }
});

// =========================================================
// GET /chat-ia/history — Historique conversation IA du patient
// Query: ?session_id=xxx&page=1&limit=50
// Auth: requirePatient
// =========================================================
router.get('/history', requirePatient(), async (req, res) => {
  try {
    const patientId = req.patient.id;
    const cabinetId = req.patient.cabinet_id;
    const sessionFilter = req.query.session_id || `patient_${patientId}`;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Compter le total
    const { count, error: countErr } = await admin()
      .from('dentiste_pro_events')
      .select('id', { count: 'exact', head: true })
      .eq('cabinet_id', cabinetId)
      .eq('patient_id', patientId)
      .eq('event_type', 'ia_message')
      .eq('session_id', sessionFilter);

    if (countErr) throw countErr;

    // Recuperer les events
    const { data: events, error } = await admin()
      .from('dentiste_pro_events')
      .select('id, metadata, created_at')
      .eq('cabinet_id', cabinetId)
      .eq('patient_id', patientId)
      .eq('event_type', 'ia_message')
      .eq('session_id', sessionFilter)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Formater pour le frontend
    const messages = (events || []).map(evt => ({
      id: evt.id,
      role: evt.metadata?.role || 'unknown',
      content: evt.metadata?.content || '',
      created_at: evt.created_at
    }));

    return res.json({
      ok: true,
      messages,
      session_id: sessionFilter,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (err) {
    console.error('[chat-ia/history]', err);
    return res.status(500).json({ error: 'Erreur chargement historique IA' });
  }
});

module.exports = router;
