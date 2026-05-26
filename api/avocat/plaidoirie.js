// =============================================
// JADOMI AVOCAT — Orchestrateur Plaidoirie / Conclusions
// Génère une plaidoirie structurée complète en un seul appel API
// Charge dossier + pièces + timeline + contradictions + mémoire + trame
// Appelle Claude (niveau 3) pour rédaction, score juge simplifié, sauvegarde
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { callClaude } = require('../../lib/legal-providers/legal-ia-router');

// === Supabase admin (lazy init) ===
let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE AVOCAT (identique à coffre.js) ===
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
    // Silencieux — l'audit ne doit jamais bloquer le flux principal
  }
}

// === JSON parsing avec fallback (pattern copilot-avocat.js) ===
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

// === GARDE-FOU OBLIGATOIRE ===
const GARDE_FOU = 'Ce document est un brouillon généré par intelligence artificielle. ' +
  'Il constitue une aide à la rédaction et doit être entièrement revu, vérifié et adapté par l\'avocat ' +
  'avant toute utilisation. JADOMI décline toute responsabilité quant à l\'utilisation de ce contenu ' +
  'sans validation préalable par un professionnel du droit.';

// === Types de conclusions valides ===
const VALID_TYPES = ['conclusions_demandeur', 'conclusions_defendeur', 'conclusions_recapitulatives'];

// === Labels français pour les types ===
const TYPE_LABELS = {
  conclusions_demandeur: 'Conclusions en demande',
  conclusions_defendeur: 'Conclusions en défense',
  conclusions_recapitulatives: 'Conclusions récapitulatives'
};

// ================================================
// SCORE JUGE SIMPLIFIÉ (sans IA)
// ================================================
function calculerScoreJuge(parsed, timeline, contradictions, trameCoutume) {
  let score = 0;
  const details = {};

  // +20 pts si pièces citées > 3
  const piecesCitees = parsed.pieces_citees || [];
  details.pieces_citees = piecesCitees.length;
  if (piecesCitees.length > 3) score += 20;

  // +15 pts si discussion a > 2 arguments
  const discussion = (parsed.conclusions && parsed.conclusions.discussion) || [];
  details.arguments_discussion = discussion.length;
  if (discussion.length > 2) score += 15;

  // +15 pts si faits > 200 chars
  const faits = (parsed.conclusions && parsed.conclusions.faits) || '';
  details.faits_longueur = faits.length;
  if (faits.length > 200) score += 15;

  // +15 pts si par_ces_motifs mentionne EUR ou montant
  const pcm = (parsed.conclusions && parsed.conclusions.par_ces_motifs) || '';
  const hasMontant = /EUR|€|euros?|\d+[\s.,]*€/i.test(pcm);
  details.montant_dans_dispositif = hasMontant;
  if (hasMontant) score += 15;

  // +10 pts si articles de loi trouvés (L.xxxx)
  const texteComplet = JSON.stringify(parsed.conclusions || {});
  const hasArticles = /L\.\d{4}/.test(texteComplet);
  details.articles_loi_cites = hasArticles;
  if (hasArticles) score += 10;

  // +10 pts si timeline a des événements
  details.timeline_events = (timeline || []).length;
  if ((timeline || []).length > 0) score += 10;

  // +10 pts si pas de contradictions non résolues
  const unresolvedContradictions = (contradictions || []).filter(c => !c.resolved && !c.resolu);
  details.contradictions_non_resolues = unresolvedContradictions.length;
  if (unresolvedContradictions.length === 0) score += 10;

  // +5 pts si trame personnalisée utilisée
  details.trame_personnalisee = !!trameCoutume;
  if (trameCoutume) score += 5;

  // Cap à 100
  score = Math.min(score, 100);

  return { score, details };
}

// ================================================
// SUGGESTIONS D'AMÉLIORATION
// ================================================
function genererAmeliorations(scoreDetails) {
  const ameliorations = [];

  if (scoreDetails.pieces_citees <= 3) {
    ameliorations.push('Citez davantage de pièces justificatives (actuellement ' + scoreDetails.pieces_citees + '). Un bon jeu de conclusions en cite au moins 4.');
  }
  if (scoreDetails.arguments_discussion <= 2) {
    ameliorations.push('Développez la discussion juridique avec plus de moyens (actuellement ' + scoreDetails.arguments_discussion + '). Visez au moins 3 arguments structurés.');
  }
  if (scoreDetails.faits_longueur <= 200) {
    ameliorations.push('L\'exposé des faits est trop succinct (' + scoreDetails.faits_longueur + ' caractères). Détaillez la chronologie factuelle.');
  }
  if (!scoreDetails.montant_dans_dispositif) {
    ameliorations.push('Le dispositif (PAR CES MOTIFS) ne mentionne pas de montant chiffré. Les demandes doivent être précises et chiffrées.');
  }
  if (!scoreDetails.articles_loi_cites) {
    ameliorations.push('Aucun article de loi cité (format L.xxxx). Fondez vos arguments sur les textes applicables.');
  }
  if (scoreDetails.timeline_events === 0) {
    ameliorations.push('Aucun événement chronologique dans le dossier. Complétez la timeline pour renforcer la narration factuelle.');
  }
  if (scoreDetails.contradictions_non_resolues > 0) {
    ameliorations.push('Il reste ' + scoreDetails.contradictions_non_resolues + ' contradiction(s) non résolue(s). Traitez-les avant l\'audience.');
  }
  if (!scoreDetails.trame_personnalisee) {
    ameliorations.push('Vous n\'utilisez pas de trame personnalisée. Créez une trame adaptée à votre juridiction et votre style.');
  }

  return ameliorations;
}

// ================================================
// Convertir les conclusions JSON en HTML
// ================================================
function conclusionsToHtml(conclusions, type, gardeFou) {
  const label = TYPE_LABELS[type] || 'Conclusions';
  let html = '<div class="conclusions-generees">';
  html += '<h1>' + label + '</h1>';
  html += '<p class="garde-fou" style="background:#fff3cd;padding:12px;border-left:4px solid #ffc107;margin-bottom:20px;font-style:italic;">' + gardeFou + '</p>';

  if (conclusions.faits) {
    html += '<h2>I. EXPOSÉ DES FAITS</h2>';
    html += '<div class="faits">' + conclusions.faits.replace(/\n/g, '<br>') + '</div>';
  }

  if (conclusions.discussion && conclusions.discussion.length > 0) {
    html += '<h2>II. DISCUSSION</h2>';
    conclusions.discussion.forEach((arg, i) => {
      const titre = arg.titre || arg.title || ('Argument ' + (i + 1));
      const contenu = arg.contenu || arg.content || arg.texte || (typeof arg === 'string' ? arg : '');
      html += '<h3>' + (i + 1) + '. ' + titre + '</h3>';
      html += '<div class="argument">' + contenu.replace(/\n/g, '<br>') + '</div>';
    });
  }

  if (conclusions.par_ces_motifs) {
    html += '<h2>III. PAR CES MOTIFS</h2>';
    html += '<div class="dispositif">' + conclusions.par_ces_motifs.replace(/\n/g, '<br>') + '</div>';
  }

  html += '</div>';
  return html;
}

// ================================================
// POST /prepare — Orchestrateur plaidoirie complète
// ================================================
router.post('/prepare', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, type, trame_id } = req.body || {};

    if (!dossier_id) {
      return res.status(400).json({ error: 'dossier_id requis' });
    }

    const conclusionType = VALID_TYPES.includes(type) ? type : 'conclusions_demandeur';

    // === 1. Charger le dossier ===
    const { data: dossier, error: dossierErr } = await admin().from('avocat_dossiers')
      .select('id, titre, reference, domaine, etape, client_id, juridiction, type_contentieux, employeur_nom, employeur_siret, avocat_adverse, convention_collective, section_cph, stade_procedural, notes, salaire_brut, anciennete_mois')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (dossierErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });
    }

    // === 2-7. Charger toutes les données en parallèle ===
    const [
      { data: client },
      { data: pieces },
      { data: timeline },
      { data: contradictions },
      { data: memory },
      trameResult
    ] = await Promise.all([
      // Client
      dossier.client_id
        ? admin().from('avocat_clients').select('*').eq('id', dossier.client_id).single()
        : Promise.resolve({ data: null }),
      // Pièces (ordonnées par date)
      admin().from('avocat_pieces')
        .select('id, nom_fichier, type_piece, importance, date_document, texte_extrait')
        .eq('dossier_id', dossier_id)
        .eq('societe_id', req.societeId)
        .order('date_document', { ascending: true }),
      // Timeline
      admin().from('avocat_timeline_events')
        .select('*')
        .eq('dossier_id', dossier_id)
        .order('date_evenement', { ascending: true }),
      // Contradictions
      admin().from('avocat_contradictions')
        .select('*')
        .eq('dossier_id', dossier_id),
      // Mémoire juridique
      admin().from('legal_dossier_memory')
        .select('key, value, category')
        .eq('dossier_id', dossier_id),
      // Trame personnalisée (si trame_id fourni)
      trame_id
        ? admin().from('avocat_trames').select('*').eq('id', trame_id).eq('societe_id', req.societeId).single()
        : Promise.resolve({ data: null })
    ]);

    const trame = trameResult.data || null;

    // === Préparer le contenu des pièces (max 30000 chars) ===
    let totalChars = 0;
    const piecesTextes = [];
    for (const p of (pieces || [])) {
      if (!p.texte_extrait) continue;
      const texte = p.texte_extrait;
      if (totalChars + texte.length > 30000) {
        piecesTextes.push('Pièce ' + p.nom_fichier + ' (' + p.type_piece + ') : [tronquée — ' + texte.length + ' caractères]');
        break;
      }
      piecesTextes.push('Pièce ' + p.nom_fichier + ' (' + p.type_piece + ', ' + (p.date_document || 'date inconnue') + ') :\n' + texte);
      totalChars += texte.length;
    }

    // === Contexte timeline ===
    let timelineContext = '';
    if (timeline && timeline.length > 0) {
      timelineContext = '\n\nCHRONOLOGIE DES ÉVÉNEMENTS :\n' +
        timeline.map(e => '- ' + (e.date_evenement || '?') + ' : ' + (e.description || e.titre || '')).join('\n');
    }

    // === Contexte contradictions ===
    let contradictionsContext = '';
    if (contradictions && contradictions.length > 0) {
      contradictionsContext = '\n\nCONTRADICTIONS DÉTECTÉES :\n' +
        contradictions.map(c => '- ' + (c.description || c.titre || '') +
          (c.resolved || c.resolu ? ' [RÉSOLUE]' : ' [NON RÉSOLUE]')).join('\n');
    }

    // === Contexte mémoire ===
    let memoryContext = '';
    if (memory && memory.length > 0) {
      memoryContext = '\n\nMÉMOIRE JURIDIQUE DU DOSSIER :\n' +
        memory.map(m => '- [' + (m.category || 'général') + '] ' + m.key + ' : ' + m.value).join('\n');
    }

    // === Contexte trame ===
    let trameContext = '';
    if (trame) {
      trameContext = '\n\nTRAME PERSONNALISÉE DE L\'AVOCAT :\n' +
        'Nom : ' + (trame.nom || trame.titre || '') + '\n' +
        'Instructions : ' + (trame.contenu || trame.instructions || trame.template || '');
    }

    // === Contexte client ===
    let clientContext = '';
    if (client) {
      clientContext = '\nCLIENT : ' + (client.nom || '') + ' ' + (client.prenom || '') +
        (client.societe ? ' (' + client.societe + ')' : '');
    }

    // === System prompt ===
    const systemPrompt = `Vous êtes un assistant juridique expert spécialisé dans la rédaction de conclusions judiciaires françaises.
Vous devez produire des conclusions structurées, complètes et professionnelles de type "${TYPE_LABELS[conclusionType]}".

RÈGLES STRICTES :
- Citez systématiquement les pièces du dossier (Pièce n°X) pour appuyer chaque argument
- Citez les articles de loi applicables (L.1234-1 du Code du travail, etc.)
- Structurez en I. FAITS / II. DISCUSSION / III. PAR CES MOTIFS
- Le dispositif (PAR CES MOTIFS) doit contenir des demandes précises et chiffrées quand possible
- Utilisez un style juridique formel avec vouvoiement
- Répondez UNIQUEMENT en JSON valide

FORMAT DE RÉPONSE JSON :
{
  "conclusions": {
    "faits": "Exposé chronologique des faits avec références aux pièces",
    "discussion": [
      { "titre": "Sur le premier moyen : ...", "contenu": "Argumentation juridique..." },
      { "titre": "Sur le deuxième moyen : ...", "contenu": "..." }
    ],
    "par_ces_motifs": "Plaise au Tribunal / à la Cour de..."
  },
  "pieces_citees": ["Pièce n°1 - Contrat", "Pièce n°3 - Courrier"],
  "confidence_score": 75
}`;

    // === User prompt ===
    const userPrompt = 'DOSSIER : ' + (dossier.titre || dossier.reference || dossier_id) + '\n' +
      'Domaine : ' + (dossier.domaine || 'non précisé') + '\n' +
      'Étape : ' + (dossier.etape || 'non précisée') + '\n' +
      'Juridiction : ' + (dossier.juridiction || 'non précisée') + '\n' +
      'Type contentieux : ' + (dossier.type_contentieux || 'non précisé') + '\n' +
      'Employeur : ' + (dossier.employeur_nom || 'non précisé') + '\n' +
      'Avocat adverse : ' + (dossier.avocat_adverse || 'non précisé') + '\n' +
      'Convention collective : ' + (dossier.convention_collective || 'non précisée') + '\n' +
      (dossier.salaire_brut ? 'Salaire brut : ' + dossier.salaire_brut + ' EUR\n' : '') +
      (dossier.anciennete_mois ? 'Ancienneté : ' + dossier.anciennete_mois + ' mois\n' : '') +
      (dossier.notes ? 'Notes : ' + dossier.notes + '\n' : '') +
      clientContext + '\n' +
      'Type de conclusions : ' + TYPE_LABELS[conclusionType] + '\n\n' +
      'PIÈCES DU DOSSIER (' + (pieces || []).length + ' pièces) :\n\n' +
      piecesTextes.join('\n\n') +
      timelineContext +
      contradictionsContext +
      memoryContext +
      trameContext +
      '\n\nGénérez les conclusions complètes en JSON.';

    // === 9. Appel Claude ===
    const result = await callClaude(systemPrompt, userPrompt, { maxTokens: 8192 });

    // === Parse JSON avec fallback ===
    let parsed;
    try {
      parsed = parseJsonResponse(result);
    } catch {
      parsed = {
        conclusions: {
          faits: result,
          discussion: [],
          par_ces_motifs: ''
        },
        pieces_citees: [],
        confidence_score: 0,
        parse_error: true
      };
    }

    // === 10. Score juge simplifié ===
    const { score: scoreJuge, details: scoreDetails } = calculerScoreJuge(
      parsed, timeline, contradictions, trame
    );

    // === Améliorations ===
    const ameliorations = genererAmeliorations(scoreDetails);

    // === Pièces manquantes (pièces du dossier non citées) ===
    const piecesCiteesTexte = (parsed.pieces_citees || []).join(' ').toLowerCase();
    const piecesManquantes = (pieces || [])
      .filter(p => !piecesCiteesTexte.includes((p.nom_fichier || '').toLowerCase()))
      .map(p => ({ id: p.id, nom: p.nom_fichier, type: p.type_piece }));

    // === Garde-fou OBLIGATOIRE ===
    parsed.garde_fou = GARDE_FOU;

    // === 11. Convertir en HTML et sauvegarder ===
    const htmlContent = conclusionsToHtml(parsed.conclusions || {}, conclusionType, GARDE_FOU);

    let documentId = null;
    try {
      const { data: doc, error: docErr } = await admin().from('avocat_documents_generes').insert({
        dossier_id,
        societe_id: req.societeId,
        type: 'conclusions_plaidoirie',
        sous_type: conclusionType,
        contenu: htmlContent,
        metadata: {
          score_juge: scoreJuge,
          pieces_citees: parsed.pieces_citees || [],
          confidence_score: parsed.confidence_score || 0,
          type_conclusions: conclusionType,
          generated_at: new Date().toISOString()
        }
      }).select('id').single();

      if (!docErr && doc) {
        documentId = doc.id;
      }
    } catch (saveErr) {
      console.error('[plaidoirie/save]', saveErr.message);
      // On continue même si la sauvegarde échoue
    }

    // === Audit trail ===
    await logAudit(req.userId, 'prepare_plaidoirie', 'dossier', dossier_id, req.societeId, {
      type: conclusionType,
      pieces_count: (pieces || []).length,
      score_juge: scoreJuge,
      document_id: documentId,
      trame_id: trame_id || null
    });

    // === 12. Réponse ===
    return res.json({
      conclusions: parsed.conclusions || {},
      score_juge: scoreJuge,
      ameliorations,
      pieces_citees: parsed.pieces_citees || [],
      pieces_manquantes: piecesManquantes,
      document_id: documentId,
      garde_fou: GARDE_FOU
    });

  } catch (err) {
    console.error('[plaidoirie/prepare]', err.message);
    return res.status(500).json({
      error: 'Erreur lors de la préparation de la plaidoirie',
      garde_fou: GARDE_FOU
    });
  }
});

module.exports = router;
