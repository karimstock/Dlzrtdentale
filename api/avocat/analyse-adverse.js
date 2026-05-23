// =============================================
// JADOMI AVOCAT — Analyse des Écritures Adverses
// KILLER FEATURE : Upload conclusions adverses → IA analyse →
// détecte failles → cherche jurisprudence contraire →
// rédige projet de réponse → l'avocat édite en direct
//
// Passe 94-98 — 23 mai 2026
// =============================================
const express = require('express');
const router = express.Router();
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
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// Imports
let dispatch, judilibre;
try { dispatch = require('../../lib/legal-providers/legal-ia-router').dispatch; } catch { dispatch = null; }
try { judilibre = require('../../lib/legal-providers/judilibre'); } catch { judilibre = null; }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/webp'];
    if (ok.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Type non autorisé. Acceptés : PDF, texte, images.'));
  }
});

// Extraction texte (PDF/texte/image)
async function extraireTexte(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    if (mimetype === 'text/plain') return buffer.toString('utf-8');
    if (mimetype.startsWith('image/')) return ''; // OCR phase 2
    return '';
  } catch (err) {
    console.error('[analyse-adverse] Extraction texte échouée:', err.message);
    return '';
  }
}

// ================================================
// POST /analyser — Analyse complète d'un document adverse
// Upload ou texte brut → analyse IA → failles → jurisprudence → réponse
// ================================================
router.post('/analyser', requireAvocat, upload.single('document'), async (req, res) => {
  try {
    let texteAdverse = '';

    // Source 1 : fichier uploadé
    if (req.file) {
      texteAdverse = await extraireTexte(req.file.buffer, req.file.mimetype);
    }
    // Source 2 : texte brut dans le body
    if (!texteAdverse && req.body && req.body.texte) {
      texteAdverse = req.body.texte;
    }
    // Source 3 : pièce existante du dossier
    if (!texteAdverse && req.body && req.body.piece_id) {
      const { data: piece } = await admin().from('avocat_pieces')
        .select('texte_extrait').eq('id', req.body.piece_id).single();
      if (piece) texteAdverse = piece.texte_extrait || '';
    }

    if (!texteAdverse || texteAdverse.trim().length < 50) {
      return res.status(400).json({ error: 'Document trop court ou illisible. Minimum 50 caractères de texte extractible.' });
    }

    const dossierId = req.body.dossier_id || null;
    const typeDocument = req.body.type_document || 'conclusions_adverses';

    // Charger le contexte du dossier si disponible
    let contexteDossier = '';
    if (dossierId) {
      try {
        const { data: dossier } = await admin().from('avocat_dossiers')
          .select('titre, reference, domaine, type').eq('id', dossierId).single();
        if (dossier) contexteDossier = `Dossier : ${dossier.reference || ''} — ${dossier.titre || ''} (${dossier.domaine || ''})`;

        const { data: pieces } = await admin().from('avocat_pieces')
          .select('nom_fichier, type_piece, texte_extrait').eq('dossier_id', dossierId).limit(10);
        if (pieces && pieces.length) {
          contexteDossier += '\n\nPièces du dossier :\n' + pieces.map(p =>
            `- ${p.nom_fichier} (${p.type_piece}) : ${(p.texte_extrait || '').substring(0, 300)}`
          ).join('\n');
        }

        const { data: timeline } = await admin().from('avocat_timeline_events')
          .select('date_evenement, description').eq('dossier_id', dossierId)
          .order('date_evenement', { ascending: true }).limit(20);
        if (timeline && timeline.length) {
          contexteDossier += '\n\nChronologie :\n' + timeline.map(e =>
            `- ${e.date_evenement} : ${e.description}`
          ).join('\n');
        }
      } catch { /* contexte non disponible */ }
    }

    // ============================================
    // ÉTAPE 1 : Analyse des failles (Claude — analyse complexe)
    // ============================================
    const systemAnalyse = `Vous êtes un avocat prud'homal français expérimenté qui analyse les écritures de la partie adverse.
Votre objectif : trouver TOUTES les failles, erreurs, incohérences et arguments faibles pour aider l'avocat à préparer sa réponse.

Analysez le document adverse et retournez un JSON strict :
{
  "type_document": "conclusions|requete|courrier|attestation|autre",
  "partie_adverse": "employeur|salarie",
  "resume_position_adverse": "Résumé en 5 lignes de la position adverse",
  "arguments_adverses": [
    {"argument": "...", "force": 1-5, "article_cite": "...", "notre_reponse_possible": "..."}
  ],
  "failles_detectees": [
    {"faille": "...", "gravite": "critique|importante|mineure", "explication": "...", "comment_exploiter": "..."}
  ],
  "erreurs_juridiques": [
    {"erreur": "...", "article_correct": "...", "explication": "..."}
  ],
  "dates_incoherentes": [
    {"date_citee": "...", "probleme": "..."}
  ],
  "pieces_manquantes_adverse": ["Pièce que l'adversaire aurait dû produire mais n'a pas produite"],
  "points_forts_adversaire": ["Ce qui est solide dans son argumentation — à anticiper"],
  "mots_cles_jurisprudence": ["5-8 mots-clés pour rechercher de la jurisprudence contraire"],
  "score_solidite_adverse": 0-100
}

IMPORTANT :
- Vouvoiement obligatoire
- Ne citez JAMAIS d'articles inventés
- Soyez CRITIQUE et cherchez chaque faille
- Identifiez les articles mal cités ou mal interprétés par l'adversaire`;

    const userAnalyse = `${contexteDossier ? 'CONTEXTE DE NOTRE DOSSIER :\n' + contexteDossier.substring(0, 3000) + '\n\n' : ''}DOCUMENT ADVERSE À ANALYSER :\n${texteAdverse.substring(0, 8000)}`;

    let analyse = {};
    try {
      const { result } = await dispatch('full_analysis', systemAnalyse, userAnalyse, { maxTokens: 4000 });
      const match = result.match(/\{[\s\S]*\}/);
      if (match) analyse = JSON.parse(match[0]);
    } catch (err) {
      console.error('[analyse-adverse] Analyse IA échouée:', err.message);
      return res.status(500).json({ error: 'L\'analyse IA a échoué. Veuillez réessayer.' });
    }

    // ============================================
    // ÉTAPE 2 : Recherche jurisprudence contraire (Judilibre)
    // ============================================
    let jurisprudenceContraire = [];
    const motsCles = analyse.mots_cles_jurisprudence || [];

    if (judilibre && motsCles.length > 0) {
      try {
        const query = motsCles.slice(0, 4).join(' ');
        const searchResult = await judilibre.search(query, {
          chambre: 'soc',
          pageSize: 10,
          sort: 'score',
          order: 'desc'
        });

        const decisions = (searchResult.results || []).slice(0, 5);

        for (const dec of decisions) {
          try {
            const sysJuris = `Vous êtes un avocat prud'homal. Cette décision peut-elle être utilisée CONTRE les arguments de la partie adverse ?
Position adverse : ${analyse.resume_position_adverse || 'Non précisée'}
Arguments adverses principaux : ${(analyse.arguments_adverses || []).map(a => a.argument).join('; ')}

Analysez et retournez un JSON :
{"pertinence": 0-100, "utilisation": "Comment citer cette décision contre l'adversaire en 2-3 phrases", "principe": "Le principe juridique retenu", "contre_argument": "En quoi cela contredit l'adversaire"}
Si la décision n'est PAS utile contre l'adversaire, mettez pertinence à 0.`;
            const texte = (dec.text || dec.summary || '').substring(0, 3000);
            if (texte.length < 50) continue;

            const { result } = await dispatch('summarize_jurisprudence', sysJuris,
              `Décision ${dec.number || ''} du ${dec.decision_date || dec.date || ''}\n${texte}`,
              { maxTokens: 400 });

            let jurisAnalyse = {};
            try { const m = result.match(/\{[\s\S]*\}/); if (m) jurisAnalyse = JSON.parse(m[0]); } catch {}

            if (jurisAnalyse.pertinence > 30) {
              jurisprudenceContraire.push({
                numero: dec.number || null,
                date: dec.decision_date || dec.date || null,
                reference: 'Cass. soc., ' + (dec.decision_date || dec.date || '') + ', n° ' + (dec.number || ''),
                pertinence: jurisAnalyse.pertinence,
                utilisation: jurisAnalyse.utilisation || '',
                principe: jurisAnalyse.principe || '',
                contre_argument: jurisAnalyse.contre_argument || ''
              });
            }
          } catch { /* décision non exploitable */ }
        }

        jurisprudenceContraire.sort((a, b) => b.pertinence - a.pertinence);
      } catch (err) {
        console.error('[analyse-adverse] Recherche jurisprudence échouée:', err.message);
      }
    }

    // ============================================
    // ÉTAPE 3 : Rédaction du projet de réponse (Claude)
    // ============================================
    let projetReponse = '';
    try {
      const sysReponse = `Vous êtes un avocat prud'homal français expérimenté. Rédigez un PROJET de réponse aux écritures adverses.

RÈGLES :
- Structure en I / II / III classique
- Vouvoiement obligatoire
- Citez les VRAIS articles du Code du travail
- Exploitez chaque faille identifiée
- Intégrez la jurisprudence trouvée
- Ton professionnel et ferme
- Format HTML propre avec <h2>, <h3>, <p>, <ul>
- Ajoutez des commentaires [NOTE AVOCAT : ...] là où l'avocat doit compléter/personnaliser
- Ne PAS inventer d'articles ou de jurisprudence`;

      const failles = (analyse.failles_detectees || []).map(f => `- ${f.faille} (${f.gravite}) : ${f.comment_exploiter}`).join('\n');
      const erreurs = (analyse.erreurs_juridiques || []).map(e => `- ${e.erreur} → ${e.article_correct}`).join('\n');
      const jurisCitees = jurisprudenceContraire.map(j => `- ${j.reference} : ${j.utilisation}`).join('\n');

      const userReponse = `POSITION ADVERSE :
${analyse.resume_position_adverse || texteAdverse.substring(0, 2000)}

FAILLES DÉTECTÉES :
${failles || 'Aucune faille majeure identifiée'}

ERREURS JURIDIQUES :
${erreurs || 'Aucune erreur juridique flagrante'}

JURISPRUDENCE EN NOTRE FAVEUR :
${jurisCitees || 'Aucune jurisprudence trouvée — recherche manuelle recommandée'}

${contexteDossier ? 'CONTEXTE DOSSIER :\n' + contexteDossier.substring(0, 2000) : ''}

Rédigez le projet de conclusions en réponse. Format HTML.`;

      const { result } = await dispatch('full_analysis', sysReponse, userReponse, { maxTokens: 6000 });
      projetReponse = result || '';
    } catch (err) {
      console.error('[analyse-adverse] Rédaction réponse échouée:', err.message);
      projetReponse = '<p><em>La rédaction automatique a échoué. Vous pouvez rédiger votre réponse manuellement en vous appuyant sur l\'analyse ci-dessus.</em></p>';
    }

    // ============================================
    // SAUVEGARDER l'analyse
    // ============================================
    let analyseId = null;
    if (dossierId) {
      try {
        const { data: saved } = await admin().from('avocat_analyses').insert({
          dossier_id: dossierId,
          societe_id: req.societeId,
          type_analyse: 'analyse_adverse',
          resultat: {
            analyse,
            jurisprudence_contraire: jurisprudenceContraire,
            projet_reponse: projetReponse,
            type_document: typeDocument,
            texte_adverse_longueur: texteAdverse.length
          },
          score_confiance: analyse.score_solidite_adverse ? 100 - analyse.score_solidite_adverse : 50,
          sources_utilisees: jurisprudenceContraire.map(j => j.reference),
          modele_ia: 'claude',
          created_at: new Date().toISOString()
        }).select('id').single();
        if (saved) analyseId = saved.id;
      } catch (err) {
        console.warn('[analyse-adverse] Sauvegarde échouée:', err.message);
      }
    }

    return res.json({
      success: true,
      analyse_id: analyseId,
      analyse: {
        resume_position_adverse: analyse.resume_position_adverse || '',
        score_solidite_adverse: analyse.score_solidite_adverse || 0,
        arguments_adverses: analyse.arguments_adverses || [],
        failles_detectees: analyse.failles_detectees || [],
        erreurs_juridiques: analyse.erreurs_juridiques || [],
        dates_incoherentes: analyse.dates_incoherentes || [],
        pieces_manquantes_adverse: analyse.pieces_manquantes_adverse || [],
        points_forts_adversaire: analyse.points_forts_adversaire || []
      },
      jurisprudence_contraire: jurisprudenceContraire,
      projet_reponse: projetReponse,
      conseil: 'Ce projet de réponse est un BROUILLON. Vérifiez chaque article cité, personnalisez les arguments, et adaptez au contexte spécifique de votre dossier. Les passages [NOTE AVOCAT] nécessitent votre intervention.',
      statistiques: {
        failles_trouvees: (analyse.failles_detectees || []).length,
        erreurs_trouvees: (analyse.erreurs_juridiques || []).length,
        jurisprudences_trouvees: jurisprudenceContraire.length,
        longueur_reponse: projetReponse.length
      }
    });
  } catch (err) {
    console.error('[analyse-adverse]', err.message);
    return res.status(500).json({ error: 'Erreur lors de l\'analyse' });
  }
});

// ================================================
// POST /analyser-rapide — Analyse sans rédaction (plus rapide)
// Juste les failles + jurisprudence, pas de projet de réponse
// ================================================
router.post('/analyser-rapide', requireAvocat, upload.single('document'), async (req, res) => {
  try {
    let texteAdverse = '';
    if (req.file) texteAdverse = await extraireTexte(req.file.buffer, req.file.mimetype);
    if (!texteAdverse && req.body && req.body.texte) texteAdverse = req.body.texte;

    if (!texteAdverse || texteAdverse.trim().length < 50) {
      return res.status(400).json({ error: 'Document trop court ou illisible.' });
    }

    const sysPrompt = `Vous êtes un avocat prud'homal français. Analysez rapidement ces écritures adverses.
Retournez un JSON strict :
{
  "resume": "Résumé en 3 lignes",
  "failles": ["Faille 1", "Faille 2"],
  "erreurs": ["Erreur juridique 1"],
  "arguments_faibles": ["Argument faible 1"],
  "points_forts": ["Point fort 1"],
  "score_solidite": 0-100,
  "recommandation": "Conseil principal en 2 phrases"
}`;

    const { result } = await dispatch('full_analysis', sysPrompt,
      `Écritures adverses :\n${texteAdverse.substring(0, 6000)}`,
      { maxTokens: 1500 });

    let analyse = {};
    try { const m = result.match(/\{[\s\S]*\}/); if (m) analyse = JSON.parse(m[0]); } catch {}

    return res.json({
      success: true,
      resume: analyse.resume || '',
      failles: analyse.failles || [],
      erreurs: analyse.erreurs || [],
      arguments_faibles: analyse.arguments_faibles || [],
      points_forts: analyse.points_forts || [],
      score_solidite_adverse: analyse.score_solidite || 50,
      recommandation: analyse.recommandation || ''
    });
  } catch (err) {
    console.error('[analyse-adverse/rapide]', err.message);
    return res.status(500).json({ error: 'Erreur lors de l\'analyse rapide' });
  }
});

// ================================================
// POST /contre-argumenter — Prend UN argument adverse et le démonte
// ================================================
router.post('/contre-argumenter', requireAvocat, async (req, res) => {
  try {
    const { argument, contexte_dossier } = req.body || {};
    if (!argument) return res.status(400).json({ error: 'argument requis' });

    // Chercher jurisprudence contraire
    let jurisContraire = [];
    if (judilibre) {
      try {
        const searchResult = await judilibre.search(argument.substring(0, 100), {
          chambre: 'soc', pageSize: 5, sort: 'score', order: 'desc'
        });
        jurisContraire = (searchResult.results || []).slice(0, 3).map(d => ({
          reference: 'Cass. soc., ' + (d.decision_date || d.date || '') + ', n° ' + (d.number || ''),
          extrait: (d.text || d.summary || '').substring(0, 300)
        }));
      } catch {}
    }

    const sysPrompt = `Vous êtes un avocat prud'homal français expérimenté. La partie adverse avance l'argument suivant. Démontez-le.

Retournez un JSON :
{
  "contre_argument": "Votre réponse juridique structurée (3-5 phrases)",
  "articles": ["Art. L.xxxx-x Code du travail"],
  "jurisprudence_a_citer": ["Cass. soc., date, n° xxx"],
  "force_contre_argument": 1-5,
  "strategie": "Comment présenter cet argument en audience"
}
Ne citez que des articles RÉELS.`;

    const userPrompt = `Argument adverse : "${argument}"
${contexte_dossier ? '\nContexte : ' + contexte_dossier : ''}
${jurisContraire.length ? '\nJurisprudence trouvée :\n' + jurisContraire.map(j => j.reference + ' : ' + j.extrait).join('\n') : ''}`;

    const { result } = await dispatch('full_analysis', sysPrompt, userPrompt, { maxTokens: 1000 });
    let contre = {};
    try { const m = result.match(/\{[\s\S]*\}/); if (m) contre = JSON.parse(m[0]); } catch {}

    return res.json({
      success: true,
      argument_adverse: argument,
      contre_argument: contre.contre_argument || '',
      articles: contre.articles || [],
      jurisprudence: contre.jurisprudence_a_citer || [],
      force: contre.force_contre_argument || 3,
      strategie_audience: contre.strategie || '',
      jurisprudence_judilibre: jurisContraire
    });
  } catch (err) {
    console.error('[analyse-adverse/contre-argumenter]', err.message);
    return res.status(500).json({ error: 'Erreur' });
  }
});

// ================================================
// PATCH /reponse/:analyseId — Sauvegarder les modifications de l'avocat
// ================================================
router.patch('/reponse/:analyseId', requireAvocat, async (req, res) => {
  try {
    const { analyseId } = req.params;
    const { projet_reponse_modifie } = req.body || {};

    if (!projet_reponse_modifie) return res.status(400).json({ error: 'projet_reponse_modifie requis' });

    // Récupérer l'analyse existante
    const { data: existing } = await admin().from('avocat_analyses')
      .select('id, resultat')
      .eq('id', analyseId)
      .eq('societe_id', req.societeId)
      .single();

    if (!existing) return res.status(404).json({ error: 'Analyse non trouvée' });

    // Mettre à jour le résultat avec la version modifiée par l'avocat
    const resultat = existing.resultat || {};
    resultat.projet_reponse_modifie = projet_reponse_modifie;
    resultat.modifie_par = req.userId;
    resultat.modifie_at = new Date().toISOString();
    resultat.versions = resultat.versions || [];
    resultat.versions.push({
      date: new Date().toISOString(),
      longueur: projet_reponse_modifie.length
    });

    const { error } = await admin().from('avocat_analyses')
      .update({ resultat, updated_at: new Date().toISOString() })
      .eq('id', analyseId);

    if (error) throw error;

    return res.json({ success: true, message: 'Réponse sauvegardée.' });
  } catch (err) {
    console.error('[analyse-adverse/reponse]', err.message);
    return res.status(500).json({ error: 'Erreur de sauvegarde' });
  }
});

// ================================================
// GET /historique/:dossierId — Historique des analyses adverses
// ================================================
router.get('/historique/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { data: analyses } = await admin().from('avocat_analyses')
      .select('id, resultat, score_confiance, sources_utilisees, created_at')
      .eq('dossier_id', req.params.dossierId)
      .eq('societe_id', req.societeId)
      .eq('type_analyse', 'analyse_adverse')
      .order('created_at', { ascending: false });

    const historique = (analyses || []).map(a => ({
      id: a.id,
      date: a.created_at,
      score_solidite_adverse: a.resultat?.analyse?.score_solidite_adverse || 0,
      failles_trouvees: (a.resultat?.analyse?.failles_detectees || []).length,
      jurisprudences_trouvees: (a.resultat?.jurisprudence_contraire || []).length,
      a_reponse_modifiee: !!a.resultat?.projet_reponse_modifie,
      sources: a.sources_utilisees || []
    }));

    return res.json({ success: true, historique });
  } catch (err) {
    console.error('[analyse-adverse/historique]', err.message);
    return res.status(500).json({ error: 'Erreur' });
  }
});

module.exports = router;
