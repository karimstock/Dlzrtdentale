// =============================================
// JADOMI AVOCAT — Copilot Avocat
// 5 fonctionnalités IA : classement pièces, brouillon réponse,
// détection délais, résumé mail, brouillon conclusions
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { callOllama, callMistral, callClaude } = require('../../lib/legal-providers/legal-ia-router');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE (identique à legal-engine.js) ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

// === AUDIT TRAIL ===
async function logAudit(userId, action, targetType, targetId, societeId, details) {
  try {
    await admin().from('avocat_audit_log').insert({
      user_id: userId,
      action,
      target_type: targetType,
      target_id: targetId,
      societe_id: societeId,
      details: details || null
    });
  } catch {
    // Audit silencieux pour ne pas bloquer les opérations
  }
}

// === UTILITAIRE : parse JSON depuis réponse IA ===
function parseJsonResponse(text) {
  let clean = (text || '').trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('Aucun JSON trouvé dans la réponse IA');
}

// ================================================
// 1. POST /classify-attachment — Auto-classement pièce par dossier
// IA : Mistral (RGPD, données client OK)
// ================================================
router.post('/classify-attachment', requireAvocat, async (req, res) => {
  try {
    const { filename, text_content, email_subject, email_from } = req.body || {};

    if (!text_content && !filename) {
      return res.status(400).json({ error: 'filename ou text_content requis' });
    }

    // Récupérer tous les dossiers de la société avec leurs mots-clés
    const { data: dossiers, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, titre, domaine, client_id, reference, veille_keywords')
      .eq('avocat_societe_id', req.societeId);

    if (dErr) {
      console.error('[copilot-avocat/classify-attachment] Dossiers error:', dErr.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération des dossiers' });
    }

    const dossiersContext = (dossiers || []).map(d =>
      'Dossier "' + d.titre + '" (réf: ' + (d.reference || 'N/A') + ', domaine: ' + (d.domaine || 'non précisé') + ', id: ' + d.id + ', mots-clés: ' + (d.veille_keywords || []).join(', ') + ')'
    ).join('\n');

    const systemPrompt = `Tu es l'assistant de classement juridique JADOMI. Tu analyses des pièces jointes reçues par email pour les classer automatiquement dans le bon dossier.

RÈGLES :
- Retourne UNIQUEMENT du JSON strict, sans texte avant ni après.
- Analyse le contenu, le nom de fichier, l'objet du mail et l'expéditeur pour déterminer le dossier.
- Types de pièces possibles : contrat, jugement, courrier, attestation, bulletin_salaire, facture, ordonnance, assignation, conclusions, requete, pv, expertise, rapport, correspondance, piece_identite, autre.
- Importance : faible, moyenne, elevee.
- Si tu n'es pas sûr (confiance < 50), retourne des suggestions au lieu d'un classement définitif.

FORMAT JSON OBLIGATOIRE :
{
  "dossier_id": "uuid ou null",
  "dossier_titre": "titre ou null",
  "type_piece": "type",
  "importance": "faible|moyenne|elevee",
  "date_document": "YYYY-MM-DD ou null",
  "confidence": 0-100,
  "suggestions": [{"dossier_id":"uuid","dossier_titre":"titre","confidence":0-100,"raison":"..."}]
}`;

    const userPrompt = 'Fichier : ' + (filename || 'inconnu') + '\n' +
      'Objet du mail : ' + (email_subject || 'non fourni') + '\n' +
      'Expéditeur : ' + (email_from || 'non fourni') + '\n\n' +
      'DOSSIERS DISPONIBLES :\n' + dossiersContext + '\n\n' +
      'CONTENU DE LA PIÈCE :\n' + (text_content || '').substring(0, 5000);

    const result = await callMistral(systemPrompt, userPrompt, { maxTokens: 800, json: true });
    const parsed = parseJsonResponse(result);

    // Si confiance < 50, forcer le mode suggestions
    if (parsed.confidence < 50 && (!parsed.suggestions || parsed.suggestions.length === 0)) {
      parsed.dossier_id = null;
      parsed.dossier_titre = null;
      parsed.suggestions = (dossiers || []).slice(0, 3).map(d => ({
        dossier_id: d.id,
        dossier_titre: d.titre,
        confidence: 0,
        raison: 'Classement automatique incertain — veuillez vérifier manuellement'
      }));
    }

    await logAudit(req.userId, 'copilot_classify_attachment', 'piece', parsed.dossier_id, req.societeId, {
      filename,
      confidence: parsed.confidence,
      type_piece: parsed.type_piece
    });

    return res.json(parsed);
  } catch (err) {
    console.error('[copilot-avocat/classify-attachment]', err.message);
    return res.status(500).json({ error: 'Erreur lors du classement de la pièce' });
  }
});

// ================================================
// 2. POST /draft-response — Réponse type avocat
// IA : Mistral (RGPD, données client OK)
// ================================================
router.post('/draft-response', requireAvocat, async (req, res) => {
  try {
    const { mail_content, mail_from, dossier_id, response_type } = req.body || {};

    if (!mail_content) {
      return res.status(400).json({ error: 'mail_content requis' });
    }

    const validTypes = ['accuse_reception', 'demande_pieces', 'mise_en_demeure', 'relance', 'information', 'convocation', 'transmission_pieces'];
    const type = validTypes.includes(response_type) ? response_type : 'accuse_reception';

    // Récupérer les infos du dossier si fourni
    let dossierContext = '';
    let dossierRef = null;
    if (dossier_id) {
      const { data: dossier } = await admin().from('avocat_dossiers')
        .select('id, titre, reference, domaine, etape')
        .eq('id', dossier_id)
        .eq('avocat_societe_id', req.societeId)
        .single();

      if (dossier) {
        dossierRef = dossier.reference;
        dossierContext = '\nDossier de référence : ' + dossier.titre + ' (réf. ' + (dossier.reference || 'N/A') + ', domaine : ' + (dossier.domaine || 'non précisé') + ', étape : ' + (dossier.etape || 'en cours') + ')';
      }
    }

    const typeLabels = {
      accuse_reception: 'accusé de réception',
      demande_pieces: 'demande de pièces complémentaires',
      mise_en_demeure: 'mise en demeure',
      relance: 'relance',
      information: 'courrier d\'information',
      convocation: 'convocation',
      transmission_pieces: 'transmission de pièces'
    };

    const systemPrompt = `Tu es un assistant juridique qui rédige des brouillons de courriers pour un cabinet d'avocats.

RÈGLES DE STYLE OBLIGATOIRES :
- Vouvoiement systématique
- Formules juridiques : "Je vous prie de bien vouloir...", "Par la présente...", "Veuillez agréer...", "Je me permets de..."
- Structure : Objet, Contexte/rappel des faits, Corps du courrier (demande ou information), Formule de politesse
- Ton professionnel, précis, sans familiarité
- Références au dossier si fournies
- JAMAIS d'envoi automatique — c'est un BROUILLON que l'avocat modifiera

Tu rédiges un(e) ${typeLabels[type]}.

Retourne UNIQUEMENT du JSON strict :
{
  "draft": "Le texte complet du brouillon",
  "subject": "L'objet du courrier",
  "response_type": "${type}",
  "dossier_ref": "référence du dossier ou null"
}`;

    const userPrompt = 'Mail reçu de : ' + (mail_from || 'expéditeur inconnu') + '\n' +
      dossierContext + '\n\n' +
      'CONTENU DU MAIL REÇU :\n' + (mail_content || '').substring(0, 5000) + '\n\n' +
      'Rédige un brouillon de ' + typeLabels[type] + ' en réponse.';

    const result = await callMistral(systemPrompt, userPrompt, { maxTokens: 2000, json: true });
    const parsed = parseJsonResponse(result);

    // S'assurer des champs obligatoires
    parsed.response_type = type;
    parsed.dossier_ref = parsed.dossier_ref || dossierRef || null;

    await logAudit(req.userId, 'copilot_draft_response', 'mail', null, req.societeId, {
      response_type: type,
      dossier_id: dossier_id || null
    });

    return res.json(parsed);
  } catch (err) {
    console.error('[copilot-avocat/draft-response]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la génération du brouillon' });
  }
});

// ================================================
// 3. POST /detect-deadlines — Détection de délais dans un texte
// IA : Ollama (0€)
// ================================================
router.post('/detect-deadlines', requireAvocat, async (req, res) => {
  try {
    const { text, dossier_id } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: 'text requis' });
    }

    // Vérifier le dossier si fourni
    if (dossier_id) {
      const { data: dossier } = await admin().from('avocat_dossiers')
        .select('id')
        .eq('id', dossier_id)
        .eq('avocat_societe_id', req.societeId)
        .single();

      if (!dossier) {
        return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });
      }
    }

    const today = new Date().toISOString().split('T')[0];

    const prompt = `Tu es un assistant juridique spécialisé dans la détection de délais légaux.
Analyse le texte suivant et extrait TOUS les délais mentionnés.

Date du jour : ${today}

RÈGLES :
- Extrais chaque délai mentionné ("15 jours", "un mois", "avant le 30 juin", "dans les 48 heures", etc.)
- Calcule la date limite exacte à partir de la date du jour ou de la date mentionnée dans le texte
- Types de délais : prescription, recours, mise_en_demeure, audience, delibere, reponse, execution, appel, opposition, signification, autre
- Gravité : critique (< 7 jours), urgent (< 30 jours), normal (> 30 jours)
- Retourne UNIQUEMENT du JSON strict

FORMAT :
{"deadlines":[{"type":"type_delai","texte_source":"extrait exact du texte","date_limite":"YYYY-MM-DD","gravite":"critique|urgent|normal","description":"explication courte"}]}

TEXTE À ANALYSER :
${text.substring(0, 4000)}`;

    const result = await callOllama(prompt, { maxTokens: 1000, temperature: 0.1 });
    let parsed;
    try {
      parsed = parseJsonResponse(result);
    } catch {
      parsed = { deadlines: [] };
    }

    const deadlines = parsed.deadlines || [];

    // Insérer les délais dans la timeline du dossier si dossier_id fourni
    const insertedDeadlines = [];
    if (dossier_id && deadlines.length > 0) {
      for (const dl of deadlines) {
        try {
          const { data: evt, error: insertErr } = await admin().from('avocat_timeline_events')
            .insert({
              dossier_id,
              societe_id: req.societeId,
              type: 'deadline',
              date_event: dl.date_limite || null,
              titre: (dl.type || 'délai') + ' — ' + (dl.description || dl.texte_source || '').substring(0, 100),
              description: 'Délai détecté automatiquement : ' + (dl.texte_source || '') + '\nGravité : ' + (dl.gravite || 'normal'),
              source: 'copilot_detect_deadlines',
              created_by: req.userId
            })
            .select('id')
            .single();

          if (!insertErr && evt) {
            dl.inserted = true;
            dl.timeline_event_id = evt.id;
          } else {
            dl.inserted = false;
          }
        } catch {
          dl.inserted = false;
        }
        insertedDeadlines.push(dl);
      }
    } else {
      for (const dl of deadlines) {
        dl.inserted = false;
        insertedDeadlines.push(dl);
      }
    }

    await logAudit(req.userId, 'copilot_detect_deadlines', 'dossier', dossier_id || null, req.societeId, {
      deadlines_found: insertedDeadlines.length
    });

    return res.json({ deadlines: insertedDeadlines });
  } catch (err) {
    console.error('[copilot-avocat/detect-deadlines]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la détection des délais' });
  }
});

// ================================================
// 4. POST /summarize-mail — Résumé mail pour le dossier
// IA : Mistral (RGPD, données client OK)
// ================================================
router.post('/summarize-mail', requireAvocat, async (req, res) => {
  try {
    const { mail_content, mail_from, mail_subject, dossier_id } = req.body || {};

    if (!mail_content) {
      return res.status(400).json({ error: 'mail_content requis' });
    }

    // Récupérer les infos du dossier si fourni
    let dossierContext = '';
    if (dossier_id) {
      const { data: dossier } = await admin().from('avocat_dossiers')
        .select('id, titre, reference, domaine')
        .eq('id', dossier_id)
        .eq('avocat_societe_id', req.societeId)
        .single();

      if (dossier) {
        dossierContext = '\nDossier associé : ' + dossier.titre + ' (réf. ' + (dossier.reference || 'N/A') + ', domaine : ' + (dossier.domaine || 'non précisé') + ')';
      }
    }

    const systemPrompt = `Tu es un assistant juridique qui résume les emails reçus par un cabinet d'avocats.

RÈGLES :
- Résumé concis en 3 à 5 lignes maximum
- Extrais les faits importants : dates, montants, noms de personnes, décisions, numéros de dossier
- Détecte les pièces jointes mentionnées dans le corps du mail ("ci-joint", "en pièce jointe", "vous trouverez annexé", etc.)
- Détecte les demandes explicites du client (questions, requêtes, besoins)
- Propose un événement à ajouter à la timeline du dossier si pertinent

Retourne UNIQUEMENT du JSON strict :
{
  "summary": "Résumé en 3-5 lignes",
  "facts": [{"type":"date|montant|nom|decision|reference","valeur":"...","contexte":"..."}],
  "client_requests": ["demande 1", "demande 2"],
  "timeline_event": {"titre":"titre court","description":"description","date_event":"YYYY-MM-DD ou null","type":"mail_recu|demande_client|information|decision"},
  "pieces_mentionnees": ["nom ou description de la pièce mentionnée"]
}`;

    const userPrompt = 'Expéditeur : ' + (mail_from || 'inconnu') + '\n' +
      'Objet : ' + (mail_subject || 'sans objet') + '\n' +
      dossierContext + '\n\n' +
      'CONTENU DU MAIL :\n' + (mail_content || '').substring(0, 5000);

    const result = await callMistral(systemPrompt, userPrompt, { maxTokens: 1500, json: true });
    const parsed = parseJsonResponse(result);

    // S'assurer que tous les champs existent
    parsed.summary = parsed.summary || 'Résumé non disponible';
    parsed.facts = parsed.facts || [];
    parsed.client_requests = parsed.client_requests || [];
    parsed.timeline_event = parsed.timeline_event || null;
    parsed.pieces_mentionnees = parsed.pieces_mentionnees || [];

    await logAudit(req.userId, 'copilot_summarize_mail', 'mail', null, req.societeId, {
      mail_from,
      mail_subject,
      dossier_id: dossier_id || null,
      facts_count: parsed.facts.length,
      requests_count: parsed.client_requests.length
    });

    return res.json(parsed);
  } catch (err) {
    console.error('[copilot-avocat/summarize-mail]', err.message);
    return res.status(500).json({ error: 'Erreur lors du résumé du mail' });
  }
});

// ================================================
// 5. POST /draft-conclusions — Brouillon de conclusions
// IA : Claude (analyse complexe, raisonnement juridique avancé)
// ================================================
router.post('/draft-conclusions', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, type } = req.body || {};

    if (!dossier_id) {
      return res.status(400).json({ error: 'dossier_id requis' });
    }

    const validTypes = ['conclusions_demandeur', 'conclusions_defendeur', 'conclusions_recapitulatives'];
    const conclusionType = validTypes.includes(type) ? type : 'conclusions_demandeur';

    // Vérifier le dossier
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, titre, reference, domaine, etape, client_id')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (dErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });
    }

    // Récupérer toutes les pièces du dossier
    const { data: pieces } = await admin().from('avocat_pieces')
      .select('id, nom_fichier, type_piece, importance, date_document, texte_extrait')
      .eq('dossier_id', dossier_id)
      .eq('societe_id', req.societeId)
      .order('date_document', { ascending: true });

    // Récupérer la mémoire juridique du dossier
    let memoryContext = '';
    try {
      const { data: memory } = await admin().from('legal_dossier_memory')
        .select('key, value, category')
        .eq('dossier_id', dossier_id);

      if (memory && memory.length > 0) {
        memoryContext = '\n\nMÉMOIRE JURIDIQUE DU DOSSIER :\n' +
          memory.map(m => '- [' + (m.category || 'général') + '] ' + m.key + ' : ' + m.value).join('\n');
      }
    } catch {
      // La table peut ne pas exister, on continue
    }

    // Récupérer la timeline
    let timelineContext = '';
    try {
      const { data: timeline } = await admin().from('avocat_timeline_events')
        .select('date_event, titre, description, type')
        .eq('dossier_id', dossier_id)
        .order('date_event', { ascending: true });

      if (timeline && timeline.length > 0) {
        timelineContext = '\n\nTIMELINE DU DOSSIER :\n' +
          timeline.map(t => '- ' + (t.date_event || '?') + ' : [' + (t.type || '') + '] ' + t.titre + (t.description ? ' — ' + t.description : '')).join('\n');
      }
    } catch {
      // Continue sans timeline
    }

    // Construire le contexte des pièces (max 30000 chars pour laisser de la place au prompt)
    const MAX_PIECES_CHARS = 30000;
    let totalChars = 0;
    const piecesTextes = [];
    const piecesListe = [];

    for (let i = 0; i < (pieces || []).length; i++) {
      const p = pieces[i];
      const numero = i + 1;
      piecesListe.push('Pièce n°' + numero + ' : ' + p.nom_fichier + ' (' + (p.type_piece || 'autre') + ', ' + (p.date_document || 'non datée') + ')');

      if (!p.texte_extrait) {
        piecesTextes.push('--- Pièce n°' + numero + ' : ' + p.nom_fichier + ' (' + (p.type_piece || 'autre') + ') ---\n[Texte non disponible]\n');
        continue;
      }

      const header = '--- Pièce n°' + numero + ' : ' + p.nom_fichier + ' (' + (p.type_piece || 'autre') + ', date: ' + (p.date_document || 'non datée') + ') ---\n';
      const remaining = MAX_PIECES_CHARS - totalChars - header.length;

      if (remaining <= 0) {
        piecesTextes.push(header + '[Texte tronqué — limite atteinte]\n');
        break;
      }

      const texte = p.texte_extrait.length > remaining
        ? p.texte_extrait.substring(0, remaining) + '\n[... texte tronqué]'
        : p.texte_extrait;

      totalChars += header.length + texte.length;
      piecesTextes.push(header + texte + '\n');
    }

    const typeLabels = {
      conclusions_demandeur: 'conclusions en demande',
      conclusions_defendeur: 'conclusions en défense',
      conclusions_recapitulatives: 'conclusions récapitulatives'
    };

    const systemPrompt = `Tu es un assistant juridique expert qui aide à la rédaction de ${typeLabels[conclusionType]} pour un cabinet d'avocats français.

RÈGLES ABSOLUES :
1. Tu génères un SQUELETTE STRUCTURÉ, pas un document final.
2. Chaque argument DOIT citer les pièces par leur numéro (Pièce n°X).
3. Structure OBLIGATOIRE :
   - I. RAPPEL DES FAITS (chronologique, basé sur les pièces et la timeline)
   - II. DISCUSSION (sous-parties par argument juridique, chaque argument cite ses sources)
   - III. PAR CES MOTIFS (demandes ou moyens de défense)
4. Vouvoiement, style juridique professionnel.
5. Inclure un score de confiance global (0-100).
6. Le garde-fou est OBLIGATOIRE.

Retourne UNIQUEMENT du JSON strict :
{
  "conclusions": {
    "type": "${conclusionType}",
    "juridiction": "à compléter par l'avocat",
    "faits": "I. RAPPEL DES FAITS\\n\\nTexte structuré...",
    "discussion": [
      {
        "titre": "Titre de l'argument",
        "contenu": "Développement de l'argument avec citations de pièces",
        "pieces_citees": [1, 3, 5],
        "fondement_juridique": "Article X du Code Y"
      }
    ],
    "par_ces_motifs": "III. PAR CES MOTIFS\\n\\nTexte des demandes..."
  },
  "pieces_citees": [{"numero": 1, "nom": "nom_fichier", "usage": "cité pour..."}],
  "confidence_score": 0,
  "garde_fou": "Ce brouillon est une aide à la rédaction. Il doit être entièrement revu et adapté par l'avocat."
}`;

    const userPrompt = 'DOSSIER : ' + dossier.titre + ' (réf. ' + (dossier.reference || 'N/A') + ')\n' +
      'Domaine : ' + (dossier.domaine || 'non précisé') + '\n' +
      'Étape : ' + (dossier.etape || 'en cours') + '\n' +
      'Type de conclusions : ' + typeLabels[conclusionType] + '\n\n' +
      'LISTE DES PIÈCES :\n' + piecesListe.join('\n') + '\n' +
      memoryContext + '\n' +
      timelineContext + '\n\n' +
      'CONTENU DES PIÈCES :\n\n' + piecesTextes.join('\n');

    const result = await callClaude(systemPrompt, userPrompt, { maxTokens: 8192 });
    let parsed;
    try {
      parsed = parseJsonResponse(result);
    } catch {
      // Si le JSON ne parse pas, retourner le texte brut avec garde-fou
      parsed = {
        conclusions: {
          type: conclusionType,
          juridiction: 'à compléter par l\'avocat',
          faits: result,
          discussion: [],
          par_ces_motifs: ''
        },
        pieces_citees: [],
        confidence_score: 0,
        garde_fou: 'Ce brouillon est une aide à la rédaction. Il doit être entièrement revu et adapté par l\'avocat.',
        parse_error: true
      };
    }

    // S'assurer que le garde-fou est toujours présent
    parsed.garde_fou = 'Ce brouillon est une aide à la rédaction. Il doit être entièrement revu et adapté par l\'avocat.';

    await logAudit(req.userId, 'copilot_draft_conclusions', 'dossier', dossier_id, req.societeId, {
      type: conclusionType,
      pieces_count: (pieces || []).length,
      confidence_score: parsed.confidence_score || 0
    });

    return res.json(parsed);
  } catch (err) {
    console.error('[copilot-avocat/draft-conclusions]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la génération du brouillon de conclusions' });
  }
});

module.exports = router;
