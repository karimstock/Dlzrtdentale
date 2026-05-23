// =============================================
// JADOMI AVOCAT EXPERT — Génération de documents juridiques
// Templates prud'homaux + génération IA
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// === IMPORTS ===
const { dispatch } = require('../../lib/legal-providers/legal-ia-router');
let templates = null;
try {
  templates = require('../../lib/legal-providers/templates-prudhomaux');
} catch {
  // Module sera créé en parallèle par un autre builder
  templates = null;
}

// === CATALOGUE DES 8 TEMPLATES ===
const TEMPLATES_CATALOGUE = [
  {
    id: 'requete_cph',
    nom: 'Requête introductive d\'instance',
    description: 'Saisine du Conseil de Prud\'hommes - formulaire de requête avec exposé des demandes',
    variables_requises: ['client_nom', 'client_prenom', 'employeur_nom', 'poste_occupe', 'date_embauche', 'date_rupture', 'motif_saisine', 'demandes']
  },
  {
    id: 'conclusions',
    nom: 'Conclusions au fond',
    description: 'Conclusions structurées (I. Rappel des faits / II. Discussion juridique / III. Demandes)',
    variables_requises: ['client_nom', 'client_prenom', 'employeur_nom', 'rappel_des_faits', 'discussion_juridique', 'demandes']
  },
  {
    id: 'bordereau',
    nom: 'Bordereau de communication de pièces',
    description: 'Liste numérotée des pièces communiquées à l\'adversaire et au greffe',
    variables_requises: ['client_nom', 'client_prenom', 'employeur_nom', 'pieces_liste']
  },
  {
    id: 'mise_en_demeure',
    nom: 'Mise en demeure de l\'employeur',
    description: 'Courrier de mise en demeure avec rappel des obligations légales et délai de réponse',
    variables_requises: ['client_nom', 'client_prenom', 'employeur_nom', 'objet_mise_en_demeure', 'delai_reponse']
  },
  {
    id: 'demande_renvoi',
    nom: 'Demande de renvoi d\'audience',
    description: 'Requête motivée de renvoi d\'audience adressée au greffe du CPH',
    variables_requises: ['client_nom', 'client_prenom', 'employeur_nom', 'date_audience', 'motif_renvoi']
  },
  {
    id: 'courrier_client',
    nom: 'Courrier d\'information au client',
    description: 'Courrier d\'information à destination du client sur l\'avancement de son dossier',
    variables_requises: ['client_nom', 'client_prenom', 'objet_courrier', 'contenu_information']
  },
  {
    id: 'courrier_confrere',
    nom: 'Courrier au conseil adverse',
    description: 'Correspondance confraternelle adressée à l\'avocat de la partie adverse',
    variables_requises: ['client_nom', 'client_prenom', 'confrere_nom', 'objet_courrier', 'contenu_courrier']
  },
  {
    id: 'note_audience',
    nom: 'Note d\'audience',
    description: 'Fiche synthétique pour l\'audience : chronologie, pièces clés, points à plaider, demandes',
    variables_requises: ['client_nom', 'client_prenom', 'employeur_nom', 'date_audience', 'chronologie', 'pieces_cles', 'points_a_plaider']
  }
];

// === HELPERS ===

/**
 * Charge un dossier complet avec client, pièces et timeline
 */
async function chargerDossierComplet(dossierId, societeId) {
  // Dossier
  const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
    .select('*')
    .eq('id', dossierId)
    .eq('avocat_societe_id', societeId)
    .single();
  if (dErr || !dossier) return null;

  // Client
  let client = null;
  if (dossier.client_id) {
    const { data: c } = await admin().from('avocat_clients')
      .select('*')
      .eq('id', dossier.client_id)
      .single();
    client = c;
  }

  // Pièces
  const { data: pieces } = await admin().from('avocat_pieces')
    .select('id, nom_fichier, type_piece, texte_extrait, created_at')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: true });

  // Timeline
  const { data: timeline } = await admin().from('avocat_timeline_events')
    .select('id, date_evenement, description')
    .eq('dossier_id', dossierId)
    .order('date_evenement', { ascending: true });

  return { dossier, client, pieces: pieces || [], timeline: timeline || [] };
}

/**
 * Formate la liste des pièces en texte numéroté
 */
function formaterPieces(pieces) {
  if (!pieces || pieces.length === 0) return 'Aucune pièce communiquée';
  return pieces.map((p, i) => `${i + 1}. ${p.nom_fichier || 'Pièce sans nom'}${p.type_piece ? ' (' + p.type_piece + ')' : ''}`).join('\n');
}

/**
 * Formate la chronologie en texte
 */
function formaterChronologie(timeline) {
  if (!timeline || timeline.length === 0) return 'Aucun événement enregistré';
  return timeline.map(e => {
    const date = e.date_evenement ? new Date(e.date_evenement).toLocaleDateString('fr-FR') : 'Date inconnue';
    return `- ${date} : ${e.description || 'Événement non décrit'}`;
  }).join('\n');
}

/**
 * Pré-remplit les variables automatiques depuis le dossier
 */
function preRemplirVariables(data) {
  const { dossier, client, pieces, timeline } = data;
  const vars = {};

  // Depuis avocat_clients
  vars.client_nom = client ? client.nom || '' : '';
  vars.client_prenom = client ? client.prenom || '' : '';

  // Depuis avocat_dossiers
  vars.reference_dossier = dossier.reference || '';
  vars.date_ouverture = dossier.date_ouverture
    ? new Date(dossier.date_ouverture).toLocaleDateString('fr-FR')
    : '';

  // Date du jour
  vars.date_du_jour = new Date().toLocaleDateString('fr-FR');

  // Pièces et chronologie formatées
  vars.pieces_liste = formaterPieces(pieces);
  vars.chronologie = formaterChronologie(timeline);

  return vars;
}

/**
 * Applique un template en remplaçant les {{variable}} par leurs valeurs
 */
function appliquerTemplate(templateHtml, variables) {
  let resultat = templateHtml;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    resultat = resultat.replace(regex, value || '');
  }
  return resultat;
}

/**
 * Trouve un template par son ID (depuis la lib ou le catalogue local)
 */
function trouverTemplate(templateId) {
  // D'abord chercher dans la lib templates-prudhomaux
  if (templates && typeof templates.getTemplate === 'function') {
    const tmpl = templates.getTemplate(templateId);
    if (tmpl) return tmpl;
  }
  // Sinon chercher dans le catalogue local (metadata seulement)
  return TEMPLATES_CATALOGUE.find(t => t.id === templateId) || null;
}

/**
 * Récupère le contenu HTML du template
 */
function getTemplateContenu(templateId) {
  if (templates && typeof templates.getTemplateContenu === 'function') {
    return templates.getTemplateContenu(templateId);
  }
  // Fallback : template HTML minimal
  const tmpl = TEMPLATES_CATALOGUE.find(t => t.id === templateId);
  if (!tmpl) return null;
  const varsHtml = tmpl.variables_requises.map(v => `<p><strong>${v}</strong> : {{${v}}}</p>`).join('\n');
  return `<div class="document-juridique">
<h1>${tmpl.nom}</h1>
<p><em>Référence : {{reference_dossier}} - Date : {{date_du_jour}}</em></p>
<hr>
${varsHtml}
</div>`;
}

// ================================================
// GET /templates — Liste des templates disponibles
// ================================================
router.get('/templates', requireAvocat, async (req, res) => {
  try {
    res.json({
      success: true,
      templates: TEMPLATES_CATALOGUE
    });
  } catch (err) {
    console.error('[generation-docs] Erreur /templates:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des templates' });
  }
});

// ================================================
// POST /generer — Génération template + IA partielle
// ================================================
router.post('/generer', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, template_id, variables_supplementaires } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });
    if (!template_id) return res.status(400).json({ error: 'template_id requis' });

    // Vérifier que le template existe
    const tmpl = trouverTemplate(template_id);
    if (!tmpl) return res.status(404).json({ error: 'Template non trouvé' });

    // Charger le dossier complet
    const data = await chargerDossierComplet(dossier_id, req.societeId);
    if (!data) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Pré-remplir les variables automatiques
    const varsAuto = preRemplirVariables(data);

    // Pour les champs complexes, appeler l'IA (Mistral, RGPD-safe)
    const varsIA = {};
    const champsComplexes = ['rappel_des_faits', 'discussion_juridique', 'demandes'];
    const champsRequis = tmpl.variables_requises || [];

    for (const champ of champsComplexes) {
      if (champsRequis.includes(champ) && !varsAuto[champ] && !(variables_supplementaires && variables_supplementaires[champ])) {
        try {
          const systemPrompt = 'Vous êtes un avocat prud\'homal français expérimenté. Rédigez en français juridique soutenu. Vouvoiement obligatoire. Ne citez JAMAIS d\'articles inventés. Citez les articles du Code du travail pertinents.';
          const contextePieces = data.pieces.map(p => p.texte_extrait || '').filter(Boolean).join('\n---\n').substring(0, 3000);
          const contexteTimeline = formaterChronologie(data.timeline);

          let userPrompt = '';
          if (champ === 'rappel_des_faits') {
            userPrompt = `Rédigez un rappel des faits pour le dossier de ${varsAuto.client_prenom} ${varsAuto.client_nom}.\n\nChronologie :\n${contexteTimeline}\n\nExtraits des pièces :\n${contextePieces}\n\nRédigez un récit factuel structuré, en paragraphes, sans opinion.`;
          } else if (champ === 'discussion_juridique') {
            userPrompt = `Rédigez la discussion juridique (argumentation en droit) pour le dossier de ${varsAuto.client_prenom} ${varsAuto.client_nom}.\n\nFaits :\n${contexteTimeline}\n\nPièces :\n${contextePieces}\n\nStructurez en I/II/III avec les fondements juridiques (articles du Code du travail).`;
          } else if (champ === 'demandes') {
            userPrompt = `Listez les demandes chiffrées pour le dossier prud'homal de ${varsAuto.client_prenom} ${varsAuto.client_nom}.\n\nContexte :\n${contexteTimeline}\n\nFormez les demandes sous forme de liste numérotée (indemnités, dommages-intérêts, rappels de salaire, etc.).`;
          }

          const iaResult = await dispatch('summarize_dossier', systemPrompt, userPrompt, { maxTokens: 1500 });
          if (iaResult && iaResult.result) {
            varsIA[champ] = iaResult.result;
          }
        } catch (iaErr) {
          console.warn(`[generation-docs] IA indisponible pour ${champ}:`, iaErr.message);
          varsIA[champ] = `[${champ} - à compléter manuellement]`;
        }
      }
    }

    // Fusionner : auto + IA + manuelles (les manuelles ont priorité)
    const variablesFinales = { ...varsAuto, ...varsIA, ...(variables_supplementaires || {}) };

    // Récupérer le contenu du template et appliquer
    const templateContenu = getTemplateContenu(template_id);
    if (!templateContenu) return res.status(500).json({ error: 'Contenu du template introuvable' });

    const documentHtml = appliquerTemplate(templateContenu, variablesFinales);

    // Sauvegarder dans avocat_analyses (type='document')
    try {
      await admin().from('avocat_analyses').insert({
        dossier_id: dossier_id,
        societe_id: req.societeId,
        type: 'document',
        titre: tmpl.nom,
        contenu: documentHtml,
        metadata: { template_id, variables_utilisees: Object.keys(variablesFinales) },
        created_at: new Date().toISOString()
      });
    } catch (saveErr) {
      console.warn('[generation-docs] Sauvegarde historique échouée:', saveErr.message);
    }

    res.json({
      success: true,
      template_id,
      template_nom: tmpl.nom,
      document_html: documentHtml,
      variables_utilisees: variablesFinales,
      ia_generee: Object.keys(varsIA)
    });
  } catch (err) {
    console.error('[generation-docs] Erreur /generer:', err);
    res.status(500).json({ error: 'Erreur lors de la génération du document' });
  }
});

// ================================================
// POST /generer-ia/:dossierId — Génération 100% IA
// ================================================
router.post('/generer-ia/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const { template_id, instructions_supplementaires } = req.body || {};
    if (!template_id) return res.status(400).json({ error: 'template_id requis' });

    // Vérifier que le template existe
    const tmpl = trouverTemplate(template_id);
    if (!tmpl) return res.status(404).json({ error: 'Template non trouvé' });

    // Charger le dossier complet
    const data = await chargerDossierComplet(dossierId, req.societeId);
    if (!data) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Construire le contexte complet
    const varsAuto = preRemplirVariables(data);
    const contextePieces = data.pieces.map(p => `Pièce "${p.nom_fichier}" : ${(p.texte_extrait || '').substring(0, 500)}`).join('\n\n');
    const contexteTimeline = formaterChronologie(data.timeline);

    // Charger les analyses existantes du dossier
    let contextAnalyses = '';
    try {
      const { data: analyses } = await admin().from('avocat_analyses')
        .select('type, titre, contenu')
        .eq('dossier_id', dossierId)
        .neq('type', 'document')
        .order('created_at', { ascending: false })
        .limit(5);
      if (analyses && analyses.length > 0) {
        contextAnalyses = '\n\nAnalyses précédentes :\n' + analyses.map(a => `[${a.type}] ${a.titre} : ${(a.contenu || '').substring(0, 300)}`).join('\n');
      }
    } catch { /* analyses non disponibles */ }

    const systemPrompt = `Vous êtes un avocat prud'homal français expérimenté, spécialisé en droit du travail.
Rédigez en français juridique soutenu, avec une structure professionnelle.
Citez les articles du Code du travail pertinents.
Ne citez JAMAIS d'articles inventés. Vérifiez chaque référence juridique.
Vouvoiement obligatoire dans tout le document.
Le document doit être prêt à l'emploi, au format HTML propre.`;

    const userPrompt = `Générez le document suivant : ${tmpl.nom} (${tmpl.description})

Dossier : ${data.dossier.titre || 'Sans titre'} - Référence : ${varsAuto.reference_dossier}
Client : ${varsAuto.client_prenom} ${varsAuto.client_nom}
Date d'ouverture : ${varsAuto.date_ouverture}

Chronologie des événements :
${contexteTimeline}

Pièces du dossier :
${contextePieces}
${contextAnalyses}

${instructions_supplementaires ? 'Instructions supplémentaires de l\'avocat :\n' + instructions_supplementaires : ''}

Rédigez le document complet en HTML. Utilisez des balises <h1>, <h2>, <h3>, <p>, <ul>, <ol> pour la structure.
Incluez toutes les mentions légales et les références aux articles du Code du travail applicables.
Le document doit être directement exploitable par un avocat sans modification majeure.`;

    // Dispatch Claude (analyse complexe → level 3)
    const iaResult = await dispatch('full_analysis', systemPrompt, userPrompt, { maxTokens: 4000 });

    if (!iaResult || !iaResult.result) {
      return res.status(500).json({ error: 'La génération IA a échoué. Veuillez réessayer.' });
    }

    const documentHtml = iaResult.result;

    // Calculer un score de confiance basique
    const sourcesCitees = [];
    const articlesRegex = /(?:article|art\.)\s*(?:L\.?\s*)?(\d{3,4}(?:-\d+)?(?:\s+(?:et\s+suivants|et\s+s\.))?)/gi;
    let match;
    while ((match = articlesRegex.exec(documentHtml)) !== null) {
      sourcesCitees.push(match[0].trim());
    }
    // Dédupliquer
    const sourcesUniques = [...new Set(sourcesCitees)];

    // Score basé sur la présence de structure, d'articles et de longueur
    let scoreConfiance = 0.5;
    if (documentHtml.length > 1000) scoreConfiance += 0.1;
    if (documentHtml.length > 3000) scoreConfiance += 0.1;
    if (sourcesUniques.length >= 2) scoreConfiance += 0.1;
    if (sourcesUniques.length >= 5) scoreConfiance += 0.1;
    if (/<h[12]>/i.test(documentHtml)) scoreConfiance += 0.05;
    if (/<ul>|<ol>/i.test(documentHtml)) scoreConfiance += 0.05;
    scoreConfiance = Math.min(scoreConfiance, 1.0);

    // Sauvegarder
    try {
      await admin().from('avocat_analyses').insert({
        dossier_id: dossierId,
        societe_id: req.societeId,
        type: 'document',
        titre: `[IA] ${tmpl.nom}`,
        contenu: documentHtml,
        metadata: {
          template_id,
          generation_mode: 'full_ia',
          score_confiance: scoreConfiance,
          sources_citees: sourcesUniques,
          provider: iaResult.provider || 'claude'
        },
        created_at: new Date().toISOString()
      });
    } catch (saveErr) {
      console.warn('[generation-docs] Sauvegarde historique échouée:', saveErr.message);
    }

    res.json({
      success: true,
      template_id,
      template_nom: tmpl.nom,
      document_html: documentHtml,
      score_confiance: scoreConfiance,
      sources_citees: sourcesUniques,
      generation_mode: 'full_ia',
      provider: iaResult.provider || 'claude'
    });
  } catch (err) {
    console.error('[generation-docs] Erreur /generer-ia:', err);
    res.status(500).json({ error: 'Erreur lors de la génération IA du document' });
  }
});

// ================================================
// GET /historique/:dossierId — Documents générés
// ================================================
router.get('/historique/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Vérifier que le dossier appartient à cette société
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Récupérer les documents générés depuis avocat_analyses type='document'
    const { data: documents, error: docErr } = await admin().from('avocat_analyses')
      .select('id, titre, contenu, metadata, created_at')
      .eq('dossier_id', dossierId)
      .eq('type', 'document')
      .order('created_at', { ascending: false });

    if (docErr) {
      console.error('[generation-docs] Erreur historique:', docErr);
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
    }

    const historique = (documents || []).map(doc => ({
      id: doc.id,
      template_id: doc.metadata ? doc.metadata.template_id : null,
      titre: doc.titre,
      date_generation: doc.created_at,
      apercu: doc.contenu ? doc.contenu.replace(/<[^>]+>/g, '').substring(0, 100) + '...' : '',
      score_confiance: doc.metadata ? doc.metadata.score_confiance : null,
      generation_mode: doc.metadata ? doc.metadata.generation_mode : 'template'
    }));

    res.json({
      success: true,
      dossier_id: dossierId,
      total: historique.length,
      documents: historique
    });
  } catch (err) {
    console.error('[generation-docs] Erreur /historique:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
});

// ================================================
// POST /exporter/:documentId — Export du document
// ================================================
router.post('/exporter/:documentId', requireAvocat, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { format } = req.body || {};

    if (!format) return res.status(400).json({ error: 'Format requis (html, docx, pdf)' });

    // Récupérer le document
    const { data: doc, error: docErr } = await admin().from('avocat_analyses')
      .select('id, titre, contenu, metadata')
      .eq('id', documentId)
      .eq('type', 'document')
      .single();

    if (docErr || !doc) return res.status(404).json({ error: 'Document non trouvé' });

    if (format === 'html') {
      res.json({
        success: true,
        format: 'html',
        titre: doc.titre,
        contenu: doc.contenu,
        metadata: doc.metadata
      });
    } else if (format === 'docx' || format === 'pdf') {
      return res.status(501).json({
        error: `Export ${format.toUpperCase()} sera disponible prochainement`,
        format_disponible: 'html'
      });
    } else {
      return res.status(400).json({ error: 'Format non supporté. Formats acceptés : html, docx, pdf' });
    }
  } catch (err) {
    console.error('[generation-docs] Erreur /exporter:', err);
    res.status(500).json({ error: 'Erreur lors de l\'export du document' });
  }
});

module.exports = router;
