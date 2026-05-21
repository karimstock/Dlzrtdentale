// =============================================
// JADOMI AVOCAT EXPERT — Legal Engine
// Upload de pièces, extraction de texte, analyse IA Claude
// Gestion des pièces et analyses de dossiers
// =============================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
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

// === AUTH MIDDLEWARE (identique à workflow.js) ===
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

// === UPLOAD CONFIG ===
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain', 'text/csv'
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Type de fichier non autorisé. Acceptés : PDF, images, texte.'));
  }
});

// === EXTRACTION DE TEXTE ===
async function extractText(buffer, mimetype, originalname) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return {
        texte: data.text || null,
        pages: data.numpages || 0,
        qualite_ocr: data.text && data.text.trim().length > 10 ? 'bonne' : 'faible'
      };
    }
    if (mimetype === 'text/plain' || mimetype === 'text/csv') {
      const texte = buffer.toString('utf-8');
      return {
        texte,
        pages: 1,
        qualite_ocr: 'bonne'
      };
    }
    // Images : OCR en phase 2
    if (mimetype.startsWith('image/')) {
      return {
        texte: null,
        pages: 1,
        qualite_ocr: 'faible'
      };
    }
    return { texte: null, pages: 0, qualite_ocr: 'inconnu' };
  } catch (err) {
    console.error('[legal-engine/extractText]', err.message);
    return { texte: null, pages: 0, qualite_ocr: 'erreur' };
  }
}

// === STORAGE BUCKET ===
const BUCKET = 'avocat-pieces';

// ================================================
// POST /pieces/upload — Upload d'une pièce
// ================================================
router.post('/pieces/upload', requireAvocat, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    const { dossier_id, type_piece, importance, date_document, a_verifier } = req.body || {};
    if (!dossier_id) {
      return res.status(400).json({ error: 'dossier_id requis' });
    }

    // Vérifier que le dossier appartient à la société
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (dErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });
    }

    // Upload vers Supabase Storage
    const fileId = crypto.randomUUID();
    const ext = req.file.originalname.split('.').pop() || '';
    const storagePath = req.societeId + '/' + dossier_id + '/' + fileId + '_' + req.file.originalname;

    const { error: uploadErr } = await admin().storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadErr) {
      console.error('[legal-engine/upload] Storage error:', uploadErr.message);
      return res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
    }

    // Extraction de texte
    const extraction = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    // Insert dans avocat_pieces
    const { data: piece, error: insertErr } = await admin().from('avocat_pieces')
      .insert({
        dossier_id,
        societe_id: req.societeId,
        uploaded_by: req.userId,
        nom_fichier: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size_kb: Math.round(req.file.size / 1024),
        storage_path: storagePath,
        type_piece: type_piece || 'autre',
        importance: importance || 'normale',
        date_document: date_document || null,
        a_verifier: a_verifier === 'true' || a_verifier === true,
        texte_extrait: extraction.texte,
        nombre_pages: extraction.pages,
        qualite_ocr: extraction.qualite_ocr
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[legal-engine/upload] Insert error:', insertErr.message);
      // Tenter de supprimer le fichier uploadé en cas d'erreur
      await admin().storage.from(BUCKET).remove([storagePath]);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la pièce' });
    }

    // Audit log
    await logAudit(req.userId, 'piece_upload', 'piece', piece.id, req.societeId, {
      nom_fichier: req.file.originalname,
      size_kb: Math.round(req.file.size / 1024),
      type_piece: type_piece || 'autre',
      qualite_ocr: extraction.qualite_ocr
    });

    return res.status(201).json({
      piece,
      message: 'Pièce uploadée avec succès.'
    });
  } catch (err) {
    console.error('[legal-engine/upload]', err.message);
    return res.status(500).json({ error: 'Erreur interne lors de l\'upload' });
  }
});

// ================================================
// GET /pieces/:dossierId — Lister les pièces d'un dossier
// ================================================
router.get('/pieces/:dossierId', requireAvocat, async (req, res) => {
  try {
    // Vérifier que le dossier appartient à la société
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', req.params.dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const { data: pieces, error } = await admin().from('avocat_pieces')
      .select('*')
      .eq('dossier_id', req.params.dossierId)
      .eq('societe_id', req.societeId)
      .order('date_document', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[legal-engine/pieces]', error.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération des pièces' });
    }

    return res.json(pieces || []);
  } catch (err) {
    console.error('[legal-engine/pieces]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// DELETE /pieces/:pieceId — Supprimer une pièce
// ================================================
router.delete('/pieces/:pieceId', requireAvocat, async (req, res) => {
  try {
    // Récupérer la pièce et vérifier propriété
    const { data: piece, error: pErr } = await admin().from('avocat_pieces')
      .select('*')
      .eq('id', req.params.pieceId)
      .eq('societe_id', req.societeId)
      .single();

    if (pErr || !piece) {
      return res.status(404).json({ error: 'Pièce non trouvée' });
    }

    // Supprimer du storage Supabase
    if (piece.storage_path) {
      const { error: storageErr } = await admin().storage
        .from(BUCKET)
        .remove([piece.storage_path]);

      if (storageErr) {
        console.error('[legal-engine/delete] Storage error:', storageErr.message);
        // On continue quand même pour supprimer l'entrée en base
      }
    }

    // Supprimer de la table
    const { error: deleteErr } = await admin().from('avocat_pieces')
      .delete()
      .eq('id', req.params.pieceId)
      .eq('societe_id', req.societeId);

    if (deleteErr) {
      console.error('[legal-engine/delete] DB error:', deleteErr.message);
      return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    // Audit log
    await logAudit(req.userId, 'piece_delete', 'piece', req.params.pieceId, req.societeId, {
      nom_fichier: piece.nom_fichier
    });

    return res.json({ success: true, message: 'Pièce supprimée.' });
  } catch (err) {
    console.error('[legal-engine/delete]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// PATCH /pieces/:pieceId — Modifier métadonnées
// ================================================
router.patch('/pieces/:pieceId', requireAvocat, async (req, res) => {
  try {
    const { type_piece, importance, a_verifier, date_document, notes } = req.body || {};

    // Vérifier propriété
    const { data: piece } = await admin().from('avocat_pieces')
      .select('id')
      .eq('id', req.params.pieceId)
      .eq('societe_id', req.societeId)
      .single();

    if (!piece) {
      return res.status(404).json({ error: 'Pièce non trouvée' });
    }

    const updates = {};
    if (type_piece !== undefined) updates.type_piece = type_piece;
    if (importance !== undefined) updates.importance = importance;
    if (a_verifier !== undefined) updates.a_verifier = a_verifier === 'true' || a_verifier === true;
    if (date_document !== undefined) updates.date_document = date_document;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    const { data: updated, error } = await admin().from('avocat_pieces')
      .update(updates)
      .eq('id', req.params.pieceId)
      .eq('societe_id', req.societeId)
      .select('*')
      .single();

    if (error) {
      console.error('[legal-engine/patch]', error.message);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }

    await logAudit(req.userId, 'piece_update', 'piece', req.params.pieceId, req.societeId, {
      fields: Object.keys(updates)
    });

    return res.json({
      piece: updated,
      message: 'Pièce mise à jour.'
    });
  } catch (err) {
    console.error('[legal-engine/patch]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /analyze/:dossierId — Lancer une analyse IA
// ================================================

const LEGAL_SYSTEM_PROMPT = `Tu es le moteur d'analyse juridique JADOMI. Tu analyses des pièces de dossiers d'avocats.

RÈGLES ABSOLUES :
- Tu ne donnes JAMAIS d'avis juridique définitif.
- Tu DOIS retourner du JSON structuré uniquement, sans texte avant ni après.
- Tu DOIS inclure un score_confiance de 0 à 100 pour chaque élément.
- Tu indiques TOUJOURS les éléments à vérifier.
- Tu DOIS inclure le garde-fou suivant dans le champ "disclaimer" de ta réponse : "Cette analyse est une aide à l'organisation du dossier. Elle ne remplace pas l'analyse juridique de l'avocat. Toute conclusion doit être vérifiée et validée par un professionnel."

FORMAT DE RÉPONSE OBLIGATOIRE (JSON strict) :
{
  "disclaimer": "Cette analyse est une aide à l'organisation du dossier. Elle ne remplace pas l'analyse juridique de l'avocat. Toute conclusion doit être vérifiée et validée par un professionnel.",
  "summary": {
    "contexte": "",
    "parties": [],
    "faits_essentiels": [],
    "points_forts": [],
    "points_faibles": []
  },
  "confidence_score": 0,
  "uncertainty_level": "low|medium|high",
  "timeline_events": [
    { "date": "", "event": "", "source": "", "confidence": 0, "comment": "" }
  ],
  "contradictions": [
    { "description": "", "documents": [], "severity": "", "confidence": 0, "action": "" }
  ],
  "missing_pieces": [
    { "type": "", "reason": "", "priority": "", "confidence": 0 }
  ],
  "risks": [
    { "description": "", "severity": "", "confidence": 0 }
  ],
  "recommended_actions": []
}`;

const MAX_TEXT_CHARS = 50000;
const CLAUDE_MODEL = 'claude-sonnet-4-6-20250514';

router.post('/analyze/:dossierId', requireAvocat, async (req, res) => {
  try {
    // Vérifier que le dossier appartient à la société
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, titre, type, domaine, etape, reference')
      .eq('id', req.params.dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (dErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    // Récupérer toutes les pièces avec texte extrait
    const { data: pieces, error: pErr } = await admin().from('avocat_pieces')
      .select('id, nom_fichier, type_piece, importance, date_document, texte_extrait, qualite_ocr')
      .eq('dossier_id', req.params.dossierId)
      .eq('societe_id', req.societeId)
      .order('date_document', { ascending: true });

    if (pErr) {
      console.error('[legal-engine/analyze] Pieces error:', pErr.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération des pièces' });
    }

    if (!pieces || pieces.length === 0) {
      return res.status(400).json({ error: 'Aucune pièce dans ce dossier. Uploadez des documents avant de lancer l\'analyse.' });
    }

    // Construire le texte des pièces (max 50000 chars)
    let totalChars = 0;
    const piecesTextes = [];

    for (const p of pieces) {
      if (!p.texte_extrait) {
        piecesTextes.push(
          '--- PIÈCE : ' + p.nom_fichier + ' (type: ' + p.type_piece + ', importance: ' + p.importance + ') ---\n' +
          '[Texte non extrait — qualité OCR : ' + (p.qualite_ocr || 'inconnu') + ']\n'
        );
        continue;
      }

      const header = '--- PIÈCE : ' + p.nom_fichier + ' (type: ' + p.type_piece + ', importance: ' + p.importance + ', date: ' + (p.date_document || 'non renseignée') + ') ---\n';
      const remaining = MAX_TEXT_CHARS - totalChars - header.length;

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

    const userPrompt = 'Dossier : ' + dossier.titre + ' (réf. ' + (dossier.reference || 'N/A') + ')\n' +
      'Type : ' + (dossier.type || 'général') + '\n' +
      'Domaine : ' + (dossier.domaine || 'non spécifié') + '\n' +
      'Étape : ' + (dossier.etape || 'nouveau') + '\n' +
      'Nombre de pièces : ' + pieces.length + '\n\n' +
      'PIÈCES DU DOSSIER :\n\n' +
      piecesTextes.join('\n') + '\n\n' +
      'Analyse ces pièces et retourne le JSON structuré demandé.';

    // Appel Claude via fetch
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Clé API Anthropic non configurée' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: LEGAL_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[legal-engine/analyze] Claude API error:', response.status, errBody);
      return res.status(502).json({ error: 'Erreur lors de l\'appel à l\'IA. Réessayez.' });
    }

    const claudeResponse = await response.json();

    // Extraire le contenu texte de la réponse Claude
    let analysisText = '';
    if (claudeResponse.content && Array.isArray(claudeResponse.content)) {
      for (const block of claudeResponse.content) {
        if (block.type === 'text') {
          analysisText += block.text;
        }
      }
    }

    // Parser le JSON de la réponse
    let analysisResult;
    try {
      // Nettoyer le texte (enlever d'éventuels backticks markdown)
      let cleanText = analysisText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      analysisResult = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error('[legal-engine/analyze] JSON parse error:', parseErr.message);
      // Stocker quand même le texte brut
      analysisResult = {
        disclaimer: 'Cette analyse est une aide à l\'organisation du dossier. Elle ne remplace pas l\'analyse juridique de l\'avocat. Toute conclusion doit être vérifiée et validée par un professionnel.',
        raw_text: analysisText,
        parse_error: true,
        confidence_score: 0,
        uncertainty_level: 'high'
      };
    }

    // S'assurer que le disclaimer est toujours présent
    if (!analysisResult.disclaimer) {
      analysisResult.disclaimer = 'Cette analyse est une aide à l\'organisation du dossier. Elle ne remplace pas l\'analyse juridique de l\'avocat. Toute conclusion doit être vérifiée et validée par un professionnel.';
    }

    // Stocker le résultat dans avocat_analyses
    // Mapper uncertainty_level vers niveau_incertitude FR
    const niveauMap = { low: 'faible', medium: 'moyen', high: 'eleve' };
    const niveau = niveauMap[analysisResult.uncertainty_level] || 'eleve';

    const { data: analysis, error: aErr } = await admin().from('avocat_analyses')
      .insert({
        dossier_id: req.params.dossierId,
        societe_id: req.societeId,
        type_analyse: req.query.type || 'analyse_complete',
        resultat: analysisResult,
        score_confiance: analysisResult.confidence_score || 0,
        niveau_incertitude: niveau,
        tokens_utilises: claudeResponse.usage ? (claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens) : null,
        modele_ia: CLAUDE_MODEL,
        requested_by: req.userId
      })
      .select()
      .single();

    if (aErr) {
      console.error('[legal-engine/analyze] Insert error:', aErr.message);
      // Retourner quand même le résultat même si le stockage échoue
      return res.json({
        result: analysisResult,
        stored: false,
        message: 'Analyse terminée mais non sauvegardée. Erreur de stockage.'
      });
    }

    // Audit log
    await logAudit(req.userId, 'analysis_create', 'analysis', analysis.id, req.societeId, {
      dossier_id: req.params.dossierId,
      pieces_count: pieces.length,
      confidence_score: analysisResult.confidence_score || 0,
      model: CLAUDE_MODEL
    });

    return res.json({
      analysis,
      message: 'Analyse terminée.'
    });
  } catch (err) {
    console.error('[legal-engine/analyze]', err.message);
    return res.status(500).json({ error: 'Erreur interne lors de l\'analyse' });
  }
});

// ================================================
// GET /analyses/:dossierId — Lister les analyses d'un dossier
// GET /analyze/:dossierId — Alias (utilisé par le dashboard avec ?type=)
// ================================================
async function handleGetAnalyses(req, res) {
  try {
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', req.params.dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    let query = admin().from('avocat_analyses')
      .select('*')
      .eq('dossier_id', req.params.dossierId)
      .eq('societe_id', req.societeId);

    // Filtrer par type si ?type= est fourni
    const typeMap = { timeline: 'timeline', audience: 'preparation_audience', contradictions: 'contradictions', resume: 'resume', pieces_manquantes: 'pieces_manquantes' };
    if (req.query.type && typeMap[req.query.type]) {
      query = query.eq('type_analyse', typeMap[req.query.type]);
    }

    const { data: analyses, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[legal-engine/analyses]', error.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération des analyses' });
    }

    // Si un type spécifique est demandé, retourner la plus récente directement
    if (req.query.type && analyses && analyses.length > 0) {
      return res.json({ analysis: analyses[0], result: analyses[0].result || analyses[0].resultat });
    }

    return res.json(analyses || []);
  } catch (err) {
    console.error('[legal-engine/analyses]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
}
router.get('/analyses/:dossierId', requireAvocat, handleGetAnalyses);
router.get('/analyze/:dossierId', requireAvocat, handleGetAnalyses);

// ================================================
// GET /analyses/:dossierId/latest — Dernière analyse
// ================================================
router.get('/analyses/:dossierId/latest', requireAvocat, async (req, res) => {
  try {
    // Vérifier que le dossier appartient à la société
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', req.params.dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const { data: analysis, error } = await admin().from('avocat_analyses')
      .select('*')
      .eq('dossier_id', req.params.dossierId)
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !analysis) {
      return res.status(404).json({ error: 'Aucune analyse trouvée pour ce dossier' });
    }

    return res.json(analysis);
  } catch (err) {
    console.error('[legal-engine/latest]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
