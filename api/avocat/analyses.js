// =============================================
// JADOMI AVOCAT EXPERT — Analyses IA avancées
// Chronologie, contradictions, pièces manquantes,
// résumé dossier, préparation audience
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// === Supabase admin client (service role) ===
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

// === Constantes Claude IA ===
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6-20250514';
const MAX_TOKENS = 4096;

// === Helper : appeler Claude ===
async function callClaude(systemPrompt, userPrompt, maxTokens = MAX_TOKENS) {
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!resp.ok) throw new Error('Claude API error: ' + resp.status);
  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  // Extraire le JSON de la réponse
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Pas de JSON dans la réponse IA');
  return { parsed: JSON.parse(jsonMatch[0]), raw: text, usage: data.usage };
}

// === Helper : récupérer les textes des pièces du dossier ===
async function getDossierTexts(dossierId, societeId, maxChars = 50000) {
  const { data: pieces } = await admin().from('avocat_pieces')
    .select('id, nom_fichier, type_piece, texte_extrait, date_document, importance')
    .eq('dossier_id', dossierId).eq('societe_id', societeId)
    .not('texte_extrait', 'is', null);
  if (!pieces || !pieces.length) return { texts: '', pieces: [], count: 0 };
  let combined = '';
  for (const p of pieces) {
    const header = `\n--- DOCUMENT: ${p.nom_fichier} (${p.type_piece}, ${p.date_document || 'date inconnue'}, importance: ${p.importance}) ---\n`;
    if (combined.length + header.length + (p.texte_extrait || '').length > maxChars) break;
    combined += header + (p.texte_extrait || '');
  }
  return { texts: combined, pieces, count: pieces.length };
}

// === Helper : stocker une analyse ===
async function storeAnalysis(dossierId, societeId, userId, type, result, usage, startTime) {
  await admin().from('avocat_analyses').insert({
    dossier_id: dossierId,
    societe_id: societeId,
    type_analyse: type,
    resultat: result.parsed,
    score_confiance: result.parsed.confidence_score || result.parsed.global_confidence || null,
    niveau_incertitude: result.parsed.uncertainty_level || null,
    tokens_utilises: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    modele_ia: MODEL,
    duree_ms: Date.now() - startTime,
    requested_by: userId
  });
}

// === Helper : vérifier ownership du dossier ===
async function verifyDossierOwnership(dossierId, societeId) {
  const { data: dossier, error } = await admin().from('avocat_dossiers')
    .select('id, titre, domaine')
    .eq('id', dossierId)
    .eq('avocat_societe_id', societeId)
    .single();
  if (error || !dossier) return null;
  return dossier;
}

// ================================================
// POST /timeline/:dossierId — Générer la chronologie automatique
// ================================================
router.post('/timeline/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const startTime = Date.now();

    // Vérifier ownership
    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Récupérer les textes des pièces
    const { texts, count } = await getDossierTexts(dossierId, req.societeId);
    if (!count) return res.status(400).json({ error: 'Aucune pièce avec texte extrait dans ce dossier' });

    const systemPrompt = "Tu es un analyste juridique. Analyse les documents suivants et extrais une chronologie structurée. Pour chaque événement, indique : date (format YYYY-MM-DD), type (contrat/courrier/audience/mise_en_demeure/paiement/incident/rupture/licenciement/relance/jugement/appel/notification/autre), description, personnes impliquées, entreprises, source documentaire, et un score de confiance de 0 à 100. Retourne UNIQUEMENT du JSON.";
    const userPrompt = `Dossier : "${dossier.titre}" (domaine : ${dossier.domaine || 'non précisé'})\n\nDocuments (${count} pièces) :\n${texts}`;

    const result = await callClaude(systemPrompt, userPrompt);
    const events = result.parsed.events || [];

    // Insérer chaque événement dans avocat_timeline_events
    if (events.length > 0) {
      const rows = events.map(e => ({
        dossier_id: dossierId,
        societe_id: req.societeId,
        date_evenement: e.date || null,
        type_evenement: e.type || 'autre',
        description: e.description || '',
        personnes: e.personnes || [],
        entreprises: e.entreprises || [],
        source_document: e.source || null,
        score_confiance: e.confidence || null,
        commentaire: e.comment || null
      }));
      const { error: insErr } = await admin().from('avocat_timeline_events').insert(rows);
      if (insErr) console.error('[analyses/timeline] Erreur insertion events:', insErr.message);
    }

    // Stocker l'analyse
    await storeAnalysis(dossierId, req.societeId, req.userId, 'timeline', result, result.usage, startTime);

    return res.json({
      events,
      global_confidence: result.parsed.global_confidence || null,
      pieces_analysees: count,
      duree_ms: Date.now() - startTime
    });
  } catch (err) {
    console.error('[analyses/timeline]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la génération de la chronologie' });
  }
});

// ================================================
// POST /contradictions/:dossierId — Détecter les contradictions
// ================================================
router.post('/contradictions/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const startTime = Date.now();

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    const { texts, count } = await getDossierTexts(dossierId, req.societeId);
    if (!count) return res.status(400).json({ error: 'Aucune pièce avec texte extrait dans ce dossier' });

    const systemPrompt = "Tu es un analyste juridique spécialisé dans la détection d'incohérences. Compare les documents suivants et identifie TOUTES les contradictions : dates contradictoires, versions différentes des faits, montants incohérents, noms différents, déclarations opposées, éléments absents dans une pièce mais présents ailleurs. Pour chaque contradiction : description, documents concernés, type (date/montant/fait/nom/declaration/absence), gravité (faible/moyenne/elevee/critique), score de confiance 0-100, action recommandée (verifier/demander_piece/questionner_client/controler_jurisprudence). Retourne UNIQUEMENT du JSON.";
    const userPrompt = `Dossier : "${dossier.titre}" (domaine : ${dossier.domaine || 'non précisé'})\n\nDocuments (${count} pièces) :\n${texts}`;

    const result = await callClaude(systemPrompt, userPrompt);
    const contradictions = result.parsed.contradictions || [];

    // Insérer dans avocat_contradictions
    if (contradictions.length > 0) {
      const rows = contradictions.map(c => ({
        dossier_id: dossierId,
        societe_id: req.societeId,
        description: c.description || '',
        documents_concernes: c.documents_concernes || c.documents || [],
        type_contradiction: c.type || 'fait',
        gravite: c.gravite || 'moyenne',
        score_confiance: c.confidence || c.score_confiance || null,
        action_recommandee: c.action_recommandee || c.action || null,
        statut: 'detecte'
      }));
      const { error: insErr } = await admin().from('avocat_contradictions').insert(rows);
      if (insErr) console.error('[analyses/contradictions] Erreur insertion:', insErr.message);
    }

    // Stocker l'analyse
    await storeAnalysis(dossierId, req.societeId, req.userId, 'contradictions', result, result.usage, startTime);

    return res.json({
      contradictions,
      global_confidence: result.parsed.global_confidence || null,
      analysis_notes: result.parsed.analysis_notes || null,
      pieces_analysees: count,
      duree_ms: Date.now() - startTime
    });
  } catch (err) {
    console.error('[analyses/contradictions]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la détection des contradictions' });
  }
});

// ================================================
// POST /missing-pieces/:dossierId — Détecter les pièces manquantes
// ================================================
router.post('/missing-pieces/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const startTime = Date.now();

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Récupérer les pièces existantes (avec ou sans texte)
    const { data: piecesExistantes } = await admin().from('avocat_pieces')
      .select('id, nom_fichier, type_piece, date_document')
      .eq('dossier_id', dossierId).eq('societe_id', req.societeId);

    const listePieces = (piecesExistantes || []).map(p =>
      `- ${p.nom_fichier} (${p.type_piece}, ${p.date_document || 'date inconnue'})`
    ).join('\n');

    const domaine = dossier.domaine || 'non précisé';

    const systemPrompt = `Dossier de type ${domaine}. Pièces déjà présentes :\n${listePieces}\n\nIdentifie les pièces potentiellement manquantes selon le type de dossier. Pour chaque pièce manquante : type, raison, priorité (faible/moyenne/elevee), score de confiance. Précise TOUJOURS : 'Pièce potentiellement manquante, à confirmer par l\'avocat.' Retourne UNIQUEMENT du JSON.`;
    const userPrompt = `Dossier : "${dossier.titre}" — Domaine : ${domaine}\n\nPièces existantes (${(piecesExistantes || []).length}) :\n${listePieces || 'Aucune pièce'}`;

    const result = await callClaude(systemPrompt, userPrompt);
    const missing = result.parsed.missing || [];

    // Insérer dans avocat_pieces_manquantes
    if (missing.length > 0) {
      const rows = missing.map(m => ({
        dossier_id: dossierId,
        societe_id: req.societeId,
        type_piece: m.type || 'document',
        raison: m.reason || m.raison || '',
        priorite: m.priority || m.priorite || 'moyenne',
        score_confiance: m.confidence || m.score_confiance || null,
        statut: 'suggere'
      }));
      const { error: insErr } = await admin().from('avocat_pieces_manquantes').insert(rows);
      if (insErr) console.error('[analyses/missing-pieces] Erreur insertion:', insErr.message);
    }

    // Stocker l'analyse
    await storeAnalysis(dossierId, req.societeId, req.userId, 'pieces_manquantes', result, result.usage, startTime);

    return res.json({
      missing,
      coverage_score: result.parsed.coverage_score || null,
      pieces_existantes: (piecesExistantes || []).length,
      duree_ms: Date.now() - startTime
    });
  } catch (err) {
    console.error('[analyses/missing-pieces]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la détection des pièces manquantes' });
  }
});

// ================================================
// POST /resume/:dossierId — Générer le résumé complet
// ================================================
router.post('/resume/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const startTime = Date.now();

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Récupérer les textes des pièces
    const { texts, count } = await getDossierTexts(dossierId, req.societeId);

    // Récupérer les analyses précédentes
    const { data: prevAnalyses } = await admin().from('avocat_analyses')
      .select('type_analyse, resultat, created_at')
      .eq('dossier_id', dossierId).eq('societe_id', req.societeId)
      .in('type_analyse', ['timeline', 'contradictions', 'pieces_manquantes'])
      .order('created_at', { ascending: false });

    let contextePrecedent = '';
    if (prevAnalyses && prevAnalyses.length > 0) {
      for (const a of prevAnalyses) {
        contextePrecedent += `\n--- ANALYSE PRÉCÉDENTE (${a.type_analyse}) ---\n${JSON.stringify(a.resultat)}\n`;
      }
    }

    const systemPrompt = "Génère un résumé structuré complet de ce dossier juridique. Inclure : contexte, parties, faits essentiels, chronologie courte, pièces importantes, points forts, points faibles, contradictions identifiées, pièces manquantes, actions recommandées, et niveau global d'incertitude. Score de confiance 0-100. Retourne UNIQUEMENT du JSON.";
    const userPrompt = `Dossier : "${dossier.titre}" (domaine : ${dossier.domaine || 'non précisé'})\n\nDocuments (${count} pièces) :\n${texts || 'Aucun texte extrait'}\n\nAnalyses précédentes :\n${contextePrecedent || 'Aucune analyse précédente'}`;

    const result = await callClaude(systemPrompt, userPrompt, 8192);

    // Stocker l'analyse
    await storeAnalysis(dossierId, req.societeId, req.userId, 'resume', result, result.usage, startTime);

    return res.json({
      resume: result.parsed,
      pieces_analysees: count,
      analyses_precedentes: (prevAnalyses || []).length,
      duree_ms: Date.now() - startTime
    });
  } catch (err) {
    console.error('[analyses/resume]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la génération du résumé' });
  }
});

// ================================================
// POST /audience/:dossierId — Préparer l'audience
// ================================================
router.post('/audience/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const startTime = Date.now();

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    // Récupérer le résumé le plus récent
    const { data: lastResume } = await admin().from('avocat_analyses')
      .select('resultat')
      .eq('dossier_id', dossierId).eq('societe_id', req.societeId)
      .eq('type_analyse', 'resume')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Récupérer les pièces
    const { texts, count } = await getDossierTexts(dossierId, req.societeId);

    // Récupérer les contradictions
    const { data: contradictions } = await admin().from('avocat_contradictions')
      .select('description, type_contradiction, gravite, action_recommandee')
      .eq('dossier_id', dossierId).eq('societe_id', req.societeId)
      .neq('statut', 'resolu');

    let contexte = '';
    if (lastResume?.resultat) {
      contexte += `\n--- RÉSUMÉ DU DOSSIER ---\n${JSON.stringify(lastResume.resultat)}\n`;
    }
    if (contradictions && contradictions.length > 0) {
      contexte += `\n--- CONTRADICTIONS DÉTECTÉES (${contradictions.length}) ---\n${JSON.stringify(contradictions)}\n`;
    }

    const systemPrompt = "Prépare un document de préparation d'audience. Format condensé et pratique. Inclure : résumé ultra court (3 lignes max), arguments clés (max 5), pièces indispensables à apporter, points faibles à anticiper, questions à poser au client, contradictions à exploiter, alertes rouges. Score de confiance. Retourne UNIQUEMENT du JSON.";
    const userPrompt = `Dossier : "${dossier.titre}" (domaine : ${dossier.domaine || 'non précisé'})\n\nDocuments (${count} pièces) :\n${texts || 'Aucun texte extrait'}\n\nContexte :\n${contexte || 'Aucune analyse précédente'}`;

    const result = await callClaude(systemPrompt, userPrompt, 8192);

    // Stocker l'analyse
    await storeAnalysis(dossierId, req.societeId, req.userId, 'preparation_audience', result, result.usage, startTime);

    return res.json({
      preparation: result.parsed,
      pieces_analysees: count,
      contradictions_detectees: (contradictions || []).length,
      duree_ms: Date.now() - startTime
    });
  } catch (err) {
    console.error('[analyses/audience]', err.message);
    return res.status(500).json({ error: 'Erreur lors de la préparation d\'audience' });
  }
});

// ================================================
// GET /timeline/:dossierId — Récupérer la timeline existante
// ================================================
router.get('/timeline/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    const { data: events, error } = await admin().from('avocat_timeline_events')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('societe_id', req.societeId)
      .order('date_evenement', { ascending: true });

    if (error) return res.status(500).json({ error: 'Erreur lors de la récupération de la timeline' });

    return res.json({ events: events || [], total: (events || []).length });
  } catch (err) {
    console.error('[analyses/timeline GET]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /contradictions/:dossierId — Récupérer les contradictions
// ================================================
router.get('/contradictions/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    const { data: contradictions, error } = await admin().from('avocat_contradictions')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('societe_id', req.societeId)
      .neq('statut', 'resolu')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Erreur lors de la récupération des contradictions' });

    return res.json({ contradictions: contradictions || [], total: (contradictions || []).length });
  } catch (err) {
    console.error('[analyses/contradictions GET]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /missing-pieces/:dossierId — Récupérer les pièces manquantes
// ================================================
router.get('/missing-pieces/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    const dossier = await verifyDossierOwnership(dossierId, req.societeId);
    if (!dossier) return res.status(404).json({ error: 'Dossier non trouvé' });

    const { data: missing, error } = await admin().from('avocat_pieces_manquantes')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('societe_id', req.societeId)
      .in('statut', ['suggere', 'confirme'])
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Erreur lors de la récupération des pièces manquantes' });

    return res.json({ missing: missing || [], total: (missing || []).length });
  } catch (err) {
    console.error('[analyses/missing-pieces GET]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
