// =============================================
// JADOMI AVOCAT EXPERT — Mode Audience Mobile
// Fiche synthetique optimisee mobile/tablette pour audiences prud'homales
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { dispatch } = require('../../lib/legal-providers/legal-ia-router');

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
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification echouee' }); }
}

// ================================================
// POST /preparer/:dossierId — Generer la fiche d'audience
// ================================================
router.post('/preparer/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const sid = req.societeId;

    // 1. Charger le dossier complet
    const { data: dossier, error: errDossier } = await admin()
      .from('avocat_dossiers')
      .select('*')
      .eq('id', dossierId)
      .eq('avocat_societe_id', sid)
      .single();

    if (errDossier || !dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    // Charger toutes les donnees en parallele
    const [
      { data: pieces },
      { data: timeline },
      { data: contradictions },
      { data: analyses },
      { data: scoring },
      { data: jurisprudences }
    ] = await Promise.all([
      admin().from('avocat_pieces').select('*').eq('dossier_id', dossierId).order('numero', { ascending: true }),
      admin().from('avocat_timeline_events').select('*').eq('dossier_id', dossierId).order('date_evenement', { ascending: true }),
      admin().from('avocat_contradictions').select('*').eq('dossier_id', dossierId),
      admin().from('avocat_analyses').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: false }).limit(5),
      admin().from('avocat_dossier_scores').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: false }).limit(1),
      admin().from('legal_dossier_memory').select('*').eq('dossier_id', dossierId)
    ]);

    // 2. Construire le prompt IA
    const systemPrompt = `Vous etes un avocat prud'homal experimenté qui prépare une audience. Générez une fiche synthétique structurée pour consultation rapide sur mobile. Tous les textes doivent etre courts, clairs, sans paragraphes longs. Répondez UNIQUEMENT en JSON valide, sans markdown.`;

    const userPrompt = `Dossier : ${JSON.stringify({
      domaine: dossier.domaine,
      etape: dossier.etape,
      date_audience: dossier.date_audience,
      resume: dossier.resume,
      client_nom: dossier.client_nom || dossier.client_id
    })}

Pièces (${(pieces || []).length}) : ${JSON.stringify((pieces || []).map(p => ({
      numero: p.numero,
      nom: p.nom || p.titre,
      type: p.type_piece,
      importance: p.importance,
      extrait: (p.texte_extrait || '').substring(0, 200)
    })))}

Chronologie (${(timeline || []).length}) : ${JSON.stringify((timeline || []).map(t => ({
      date: t.date_evenement,
      evenement: t.titre || t.description
    })))}

Contradictions (${(contradictions || []).length}) : ${JSON.stringify((contradictions || []).map(c => ({
      type: c.type,
      description: c.description,
      gravite: c.gravite
    })))}

Scoring : ${JSON.stringify(scoring && scoring[0] ? {
      global: scoring[0].score_global,
      preuves: scoring[0].score_preuves,
      coherence: scoring[0].score_coherence,
      risques: scoring[0].score_risques
    } : null)}

Jurisprudences pertinentes : ${JSON.stringify((jurisprudences || []).map(j => ({
      reference: j.reference,
      principe: j.principe,
      pertinence: j.pertinence_score
    })))}

Générez la fiche d'audience au format JSON :
{
  "resume_ultra_court": "5 lignes max",
  "points_forts": ["..."],
  "points_faibles": ["..."],
  "arguments_cles": [{"argument": "...", "article_code": "...", "force": 1}],
  "jurisprudences_a_citer": [{"reference": "...", "principe": "...", "pertinence": 1}],
  "pieces_essentielles": [{"numero": 1, "nom": "...", "pourquoi_essentielle": "..."}],
  "questions_adverses_probables": [{"question": "...", "reponse_preparee": "..."}],
  "risques_audience": ["..."],
  "chronologie_synthetique": [{"date": "...", "evenement": "..."}],
  "demandes_chiffrees": [{"intitule": "...", "montant": "...", "fondement": "..."}],
  "strategie_plaidoirie": "conseil en 3 lignes"
}`;

    // 3. Dispatch IA (Claude via prepare_audience)
    const { result: iaResult } = await dispatch('prepare_audience', systemPrompt, userPrompt, { maxTokens: 4000 });

    // Parser le resultat JSON
    let ficheData;
    try {
      const jsonStr = typeof iaResult === 'string' ? iaResult : JSON.stringify(iaResult);
      // Extraire le JSON meme s'il est entoure de texte
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      ficheData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(jsonStr);
    } catch (parseErr) {
      ficheData = { resume_ultra_court: iaResult, erreur_parsing: true };
    }

    // 4. Stocker dans avocat_analyses
    const { error: errInsert } = await admin().from('avocat_analyses').insert({
      dossier_id: dossierId,
      societe_id: sid,
      type: 'preparation_audience',
      contenu: ficheData,
      created_at: new Date().toISOString()
    });

    if (errInsert) {
      console.error('[audience-mobile] Erreur stockage:', errInsert.message);
    }

    return res.json({
      success: true,
      fiche: ficheData,
      dossier_id: dossierId,
      date_generation: new Date().toISOString(),
      scoring: scoring && scoring[0] ? {
        global: scoring[0].score_global,
        preuves: scoring[0].score_preuves,
        coherence: scoring[0].score_coherence,
        risques: scoring[0].score_risques
      } : null
    });

  } catch (err) {
    console.error('[audience-mobile] preparer:', err);
    return res.status(500).json({ error: 'Erreur lors de la préparation de la fiche d\'audience' });
  }
});

// ================================================
// GET /fiche/:dossierId — Derniere fiche d'audience
// ================================================
router.get('/fiche/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const sid = req.societeId;

    // Verifier que le dossier appartient a la societe
    const { data: dossier } = await admin()
      .from('avocat_dossiers')
      .select('id, client_nom, client_id, domaine, etape, date_audience')
      .eq('id', dossierId)
      .eq('avocat_societe_id', sid)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    // Derniere fiche d'audience
    const { data: fiche } = await admin()
      .from('avocat_analyses')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('type', 'preparation_audience')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!fiche) {
      return res.status(404).json({ error: 'Aucune fiche d\'audience disponible. Utilisez POST /preparer pour en générer une.' });
    }

    // Scoring du dossier si disponible
    const { data: scoring } = await admin()
      .from('avocat_dossier_scores')
      .select('score_global, score_preuves, score_coherence, score_risques, score_strategie')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return res.json({
      success: true,
      fiche: fiche.contenu,
      dossier: {
        id: dossier.id,
        client: dossier.client_nom || dossier.client_id,
        domaine: dossier.domaine,
        etape: dossier.etape,
        date_audience: dossier.date_audience
      },
      scoring: scoring || null,
      date_generation: fiche.created_at
    });

  } catch (err) {
    console.error('[audience-mobile] fiche:', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération de la fiche' });
  }
});

// ================================================
// GET /checklist/:dossierId — Checklist pre-audience
// ================================================
router.get('/checklist/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const sid = req.societeId;

    // Verifier le dossier
    const { data: dossier } = await admin()
      .from('avocat_dossiers')
      .select('id, etape, date_audience')
      .eq('id', dossierId)
      .eq('avocat_societe_id', sid)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    // Charger pieces et analyses en parallele
    const [
      { data: pieces },
      { data: analyses },
      { data: timeline }
    ] = await Promise.all([
      admin().from('avocat_pieces').select('type_piece, nom, numero, importance').eq('dossier_id', dossierId),
      admin().from('avocat_analyses').select('type, created_at').eq('dossier_id', dossierId),
      admin().from('avocat_timeline_events').select('type, titre').eq('dossier_id', dossierId)
    ]);

    const piecesList = pieces || [];
    const analysesList = analyses || [];
    const timelineList = timeline || [];

    // Construire la checklist
    const checklist = [];

    // 1. Conclusions deposees ?
    const hasConclusions = piecesList.some(p =>
      (p.type_piece || '').toLowerCase().includes('conclusion') ||
      (p.nom || '').toLowerCase().includes('conclusion')
    );
    checklist.push({
      item: 'Conclusions déposées',
      statut: hasConclusions ? 'ok' : 'manquant',
      detail: hasConclusions ? 'Conclusions présentes dans les pièces' : 'Aucune conclusion trouvée dans les pièces du dossier'
    });

    // 2. Bordereau a jour ?
    const hasBordereau = piecesList.some(p =>
      (p.type_piece || '').toLowerCase().includes('bordereau') ||
      (p.nom || '').toLowerCase().includes('bordereau')
    );
    checklist.push({
      item: 'Bordereau à jour',
      statut: hasBordereau ? 'ok' : 'a_verifier',
      detail: hasBordereau ? 'Bordereau présent' : 'Aucun bordereau détecté. Vérifiez manuellement.'
    });

    // 3. Pieces numerotees ?
    const piecesNumerotees = piecesList.filter(p => p.numero != null && p.numero > 0);
    const allNumerotees = piecesList.length > 0 && piecesNumerotees.length === piecesList.length;
    checklist.push({
      item: 'Pièces numérotées',
      statut: piecesList.length === 0 ? 'manquant' : (allNumerotees ? 'ok' : 'a_verifier'),
      detail: piecesList.length === 0
        ? 'Aucune pièce dans le dossier'
        : `${piecesNumerotees.length}/${piecesList.length} pièces numérotées`
    });

    // 4. Adversaire notifie ?
    const hasNotification = timelineList.some(t =>
      (t.type || '').toLowerCase().includes('notification') ||
      (t.titre || '').toLowerCase().includes('notification') ||
      (t.titre || '').toLowerCase().includes('adversaire') ||
      (t.titre || '').toLowerCase().includes('signifi')
    );
    checklist.push({
      item: 'Adversaire notifié',
      statut: hasNotification ? 'ok' : 'a_verifier',
      detail: hasNotification ? 'Notification trouvée dans la chronologie' : 'Aucune notification adversaire détectée. Vérifiez manuellement.'
    });

    // 5. Substitution prevue ?
    const hasSubstitution = timelineList.some(t =>
      (t.titre || '').toLowerCase().includes('substitut') ||
      (t.type || '').toLowerCase().includes('substitut')
    );
    checklist.push({
      item: 'Substitution prévue',
      statut: hasSubstitution ? 'ok' : 'a_verifier',
      detail: hasSubstitution ? 'Substitution prévue' : 'Pas de substitution détectée. Si nécessaire, organisez-la.'
    });

    // 6. Notes d'audience pretes ?
    const hasNotes = analysesList.some(a => a.type === 'notes_audience');
    const hasFiche = analysesList.some(a => a.type === 'preparation_audience');
    checklist.push({
      item: 'Notes d\'audience prêtes',
      statut: hasNotes ? 'ok' : (hasFiche ? 'a_verifier' : 'manquant'),
      detail: hasNotes
        ? 'Notes d\'audience enregistrées'
        : (hasFiche ? 'Fiche d\'audience générée, mais pas de notes personnelles' : 'Ni fiche ni notes d\'audience. Générez la fiche d\'abord.')
    });

    // 7. Fiche d'audience generee ?
    checklist.push({
      item: 'Fiche d\'audience générée',
      statut: hasFiche ? 'ok' : 'manquant',
      detail: hasFiche ? 'Fiche d\'audience disponible' : 'Fiche non générée. Utilisez POST /preparer pour la créer.'
    });

    // 8. Date d'audience renseignee ?
    checklist.push({
      item: 'Date d\'audience renseignée',
      statut: dossier.date_audience ? 'ok' : 'manquant',
      detail: dossier.date_audience
        ? `Audience prévue le ${new Date(dossier.date_audience).toLocaleDateString('fr-FR')}`
        : 'Aucune date d\'audience renseignée dans le dossier'
    });

    return res.json({
      success: true,
      dossier_id: dossierId,
      checklist,
      resume: {
        total: checklist.length,
        ok: checklist.filter(c => c.statut === 'ok').length,
        manquant: checklist.filter(c => c.statut === 'manquant').length,
        a_verifier: checklist.filter(c => c.statut === 'a_verifier').length
      }
    });

  } catch (err) {
    console.error('[audience-mobile] checklist:', err);
    return res.status(500).json({ error: 'Erreur lors de la génération de la checklist' });
  }
});

// ================================================
// POST /notes/:dossierId — Sauvegarder notes d'audience
// ================================================
router.post('/notes/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const sid = req.societeId;
    const { notes_texte } = req.body;

    if (!notes_texte || !notes_texte.trim()) {
      return res.status(400).json({ error: 'Le champ notes_texte est requis' });
    }

    // Verifier le dossier
    const { data: dossier } = await admin()
      .from('avocat_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('avocat_societe_id', sid)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    // Stocker les notes
    const { data: note, error: errInsert } = await admin()
      .from('avocat_analyses')
      .insert({
        dossier_id: dossierId,
        societe_id: sid,
        type: 'notes_audience',
        contenu: {
          notes_texte: notes_texte.trim(),
          date_saisie: new Date().toISOString(),
          auteur_id: req.userId
        },
        created_at: new Date().toISOString()
      })
      .select('id, created_at')
      .single();

    if (errInsert) {
      console.error('[audience-mobile] notes insert:', errInsert.message);
      return res.status(500).json({ error: 'Erreur lors de la sauvegarde des notes' });
    }

    return res.json({
      success: true,
      message: 'Notes d\'audience sauvegardées',
      note_id: note.id,
      date_saisie: note.created_at
    });

  } catch (err) {
    console.error('[audience-mobile] notes:', err);
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde des notes' });
  }
});

// ================================================
// GET /historique/:dossierId — Historique fiches et notes
// ================================================
router.get('/historique/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const sid = req.societeId;

    // Verifier le dossier
    const { data: dossier } = await admin()
      .from('avocat_dossiers')
      .select('id, client_nom, client_id, domaine')
      .eq('id', dossierId)
      .eq('avocat_societe_id', sid)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    // Recuperer toutes les fiches et notes d'audience
    const { data: historique, error: errHist } = await admin()
      .from('avocat_analyses')
      .select('id, type, contenu, created_at')
      .eq('dossier_id', dossierId)
      .in('type', ['preparation_audience', 'notes_audience'])
      .order('created_at', { ascending: false });

    if (errHist) {
      console.error('[audience-mobile] historique:', errHist.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
    }

    const items = (historique || []).map(h => ({
      id: h.id,
      type: h.type,
      label: h.type === 'preparation_audience' ? 'Fiche d\'audience' : 'Notes d\'audience',
      date: h.created_at,
      apercu: h.type === 'notes_audience'
        ? (h.contenu?.notes_texte || '').substring(0, 100)
        : (h.contenu?.resume_ultra_court || '').substring(0, 100)
    }));

    return res.json({
      success: true,
      dossier_id: dossierId,
      dossier: {
        client: dossier.client_nom || dossier.client_id,
        domaine: dossier.domaine
      },
      total: items.length,
      historique: items
    });

  } catch (err) {
    console.error('[audience-mobile] historique:', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
});

module.exports = router;
