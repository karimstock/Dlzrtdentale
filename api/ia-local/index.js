// =============================================
// JADOMI IA LOCAL — API endpoints
// Routeur intelligent : local → Ollama → Claude
// =============================================

const express = require('express');
const router = express.Router();
const iaRouter = require('../../lib/ia-router');

// Health check
router.get('/health', async (req, res) => {
  const status = await iaRouter.healthCheck();
  res.json(status);
});

// Route principale : envoyer une tâche au routeur
router.post('/process', async (req, res) => {
  try {
    const { task, input, options } = req.body || {};
    if (!task) return res.status(400).json({ error: 'task requis' });

    const result = await iaRouter.route(task, input, options || {});
    res.json(result);
  } catch (e) {
    console.error('[ia-local] process error:', e.message);
    res.status(500).json({ error: 'Erreur IA' });
  }
});

// Raccourcis pour les tâches courantes

// Détecter actes + dents dans un texte
router.post('/detect', (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text requis' });
  const actes = iaRouter.LOCAL_RULES.detectActes(text);
  const dents = iaRouter.LOCAL_RULES.detectDents(text);
  const intent = iaRouter.LOCAL_RULES.classifyIntent(text);
  res.json({ actes, dents, intent, level: 'local', cost: 0 });
});

// Résumer des notes (Ollama)
router.post('/summarize', async (req, res) => {
  try {
    const { notes } = req.body || {};
    if (!notes) return res.status(400).json({ error: 'notes requis' });
    const result = await iaRouter.route('summarize-notes', notes);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Générer un message patient (Ollama)
router.post('/message', async (req, res) => {
  try {
    const { type, patient, details } = req.body || {};
    if (!type || !patient) return res.status(400).json({ error: 'type et patient requis' });
    const result = await iaRouter.route('generate-message', { type, patient, details });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Classifier un produit (Ollama)
router.post('/classify-product', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name requis' });
    const result = await iaRouter.route('classify-product', name);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alertes médicales (local)
router.post('/alertes', (req, res) => {
  const { reponses } = req.body || {};
  if (!reponses) return res.status(400).json({ error: 'reponses requis' });
  const alertes = iaRouter.LOCAL_RULES.detectAlertesMedicales(reponses);
  res.json({ alertes, level: 'local', cost: 0 });
});

// Générer un document depuis template (0€)
router.post('/document', (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (!type) return res.status(400).json({ error: 'type requis (cr_consultation, cr_implant, certificat_medical, courrier_confrere, ordonnance, devis_patient, bon_labo, consentement_eclaire)' });

    const templates = require('../../lib/ia-templates');
    const document = templates.generateFromCopilot(type, data || {});

    if (!document) return res.status(400).json({ error: 'Type de document inconnu: ' + type });

    res.json({ document, type, level: 'template', cost: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lister les types de documents disponibles
router.get('/templates', (req, res) => {
  res.json({
    templates: [
      { type: 'cr_consultation', label: 'Compte rendu de consultation' },
      { type: 'cr_implant', label: 'Compte rendu chirurgie implantaire' },
      { type: 'certificat_medical', label: 'Certificat médical' },
      { type: 'courrier_confrere', label: 'Courrier confrère' },
      { type: 'ordonnance', label: 'Ordonnance' },
      { type: 'devis_patient', label: 'Devis patient' },
      { type: 'bon_labo', label: 'Bon de laboratoire' },
      { type: 'consentement_eclaire', label: 'Consentement éclairé' },
    ],
    cost: 0,
    note: 'Documents générés par templates, sans appel API'
  });
});

module.exports = router;
