// =============================================
// JADOMI — Services : Prestations CRUD + JADOMI IA
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // LIST prestations
  router.get('/prestations', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_prestations')
        .select('*')
        .eq('societe_id', req.societe.id)
        .order('categorie', { ascending: true })
        .order('nom', { ascending: true });
      if (error) throw error;
      res.json({ prestations: data || [] });
    } catch (e) {
      console.error('[services/prestations] GET:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET single
  router.get('/prestations/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_prestations')
        .select('*')
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .single();
      if (error) throw error;
      res.json({ prestation: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE
  router.post('/prestations', requireSociete(), async (req, res) => {
    try {
      const { nom, description, categorie, duree, prix, acompte_pct, couleur,
              praticiens, actif, seo_keywords, photo_url } = req.body;
      const { data, error } = await admin()
        .from('services_prestations')
        .insert({
          societe_id: req.societe.id,
          nom, description, categorie,
          duree: duree || 30,
          prix: prix || 0,
          acompte_pct: acompte_pct || 30,
          couleur: couleur || '#6366f1',
          praticiens: praticiens || [],
          actif: actif !== false,
          seo_keywords: seo_keywords || null,
          photo_url: photo_url || null
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'prestation_create', entity: 'services_prestations', entityId: data.id, req });
      res.json({ prestation: data });
    } catch (e) {
      console.error('[services/prestations] POST:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE
  router.patch('/prestations/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      const fields = ['nom', 'description', 'categorie', 'duree', 'prix', 'acompte_pct',
        'couleur', 'praticiens', 'actif', 'seo_keywords', 'photo_url'];
      fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin()
        .from('services_prestations')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'prestation_update', entity: 'services_prestations', entityId: data.id, req });
      res.json({ prestation: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE
  router.delete('/prestations/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_prestations')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'prestation_delete', entity: 'services_prestations', entityId: req.params.id, req });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // JADOMI IA — Génération description + SEO
  router.post('/prestations/ia-description', requireSociete(), async (req, res) => {
    try {
      const { nom, categorie, duree, prix } = req.body;
      if (!nom) return res.status(400).json({ error: 'nom requis' });

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic();

      const prompt = `Tu es un expert en rédaction marketing pour les professionnels de services.
Génère pour la prestation suivante :
- Nom : ${nom}
- Catégorie : ${categorie || 'Non précisée'}
- Durée : ${duree || 30} min
- Prix : ${prix || 'Non précisé'}€

Réponds UNIQUEMENT en JSON valide avec ce format :
{
  "description": "Description professionnelle et engageante de 2-3 phrases",
  "seo_keywords": ["mot-clé1", "mot-clé2", "mot-clé3", "mot-clé4", "mot-clé5"]
}`;

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = message.content[0].text;
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        result = match ? JSON.parse(match[0]) : { description: text, seo_keywords: [] };
      }

      res.json({ description: result.description, seo_keywords: result.seo_keywords });
    } catch (e) {
      console.error('[services/prestations] IA:', e.message);
      res.status(500).json({ error: 'Erreur JADOMI IA : ' + e.message });
    }
  });
};
