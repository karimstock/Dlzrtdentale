// JADOMI — Showroom Créateurs : Messagerie client-créateur
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

async function getProfilId(societeId) {
  const { data } = await admin().from('showroom_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET conversations du créateur
  router.get('/messages', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, conversations: [] });

      const { data } = await admin().from('showroom_conversations')
        .select('*, dernier_message:showroom_messages(contenu, auteur_type, created_at)')
        .eq('profil_id', profilId)
        .order('updated_at', { ascending: false });

      // Ajouter le dernier message
      const conversations = (data || []).map(c => ({
        ...c,
        dernier_message: c.dernier_message?.[0] || null
      }));

      res.json({ success: true, conversations });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET messages d'une conversation
  router.get('/messages/:conversationId', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);

      // Vérifier propriété de la conversation
      const { data: conv } = await admin().from('showroom_conversations')
        .select('*').eq('id', req.params.conversationId).eq('profil_id', profilId).maybeSingle();
      if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

      const { data } = await admin().from('showroom_messages')
        .select('*').eq('conversation_id', conv.id)
        .order('created_at', { ascending: true });

      // Marquer comme lus côté créateur
      await admin().from('showroom_messages')
        .update({ lu_createur: true })
        .eq('conversation_id', conv.id).eq('auteur_type', 'client').eq('lu_createur', false);

      // Mettre à jour le compteur non lu
      await admin().from('showroom_conversations')
        .update({ nb_non_lus_createur: 0 })
        .eq('id', conv.id);

      res.json({ success: true, conversation: conv, messages: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST envoyer un message (créateur)
  router.post('/messages/:conversationId', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { contenu } = req.body;
      if (!contenu || !contenu.trim()) return res.status(400).json({ error: 'contenu requis' });

      // Vérifier propriété de la conversation
      const { data: conv } = await admin().from('showroom_conversations')
        .select('*').eq('id', req.params.conversationId).eq('profil_id', profilId).maybeSingle();
      if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

      const { data, error } = await admin().from('showroom_messages')
        .insert({
          conversation_id: conv.id,
          auteur_type: 'createur',
          auteur_id: req.user.id,
          contenu: contenu.trim(),
          lu_createur: true,
          lu_client: false
        }).select('*').single();
      if (error) throw error;

      // Mettre à jour la conversation
      await admin().from('showroom_conversations')
        .update({
          updated_at: new Date().toISOString(),
          nb_non_lus_client: (conv.nb_non_lus_client || 0) + 1
        }).eq('id', conv.id);

      // Notification email au client
      if (conv.client_email) {
        const { data: profil } = await admin().from('showroom_profil')
          .select('nom_boutique').eq('id', profilId).maybeSingle();
        await mailer.sendMail({
          to: conv.client_email,
          subject: `Nouveau message de ${profil?.nom_boutique || 'un créateur'} — JADOMI`,
          html: `<p>Bonjour ${conv.client_prenom || conv.client_nom},</p>
            <p><strong>${profil?.nom_boutique || 'Le créateur'}</strong> vous a envoyé un message :</p>
            <blockquote style="border-left:3px solid #6366f1;padding:10px 16px;margin:16px 0;background:#f8f9fc;border-radius:0 8px 8px 0;">${contenu}</blockquote>
            <p>Connectez-vous à JADOMI pour répondre.</p>
            <p>Cordialement,<br>L'équipe JADOMI</p>`
        });
      }

      res.json({ success: true, message: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET nombre de messages non lus
  router.get('/messages-non-lus', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, count: 0 });

      const { data } = await admin().from('showroom_conversations')
        .select('nb_non_lus_createur').eq('profil_id', profilId);

      const count = (data || []).reduce((s, c) => s + (c.nb_non_lus_createur || 0), 0);
      res.json({ success: true, count });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
