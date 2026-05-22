// =============================================
// JADOMI AVOCAT — Copilot Live Consultation
// Écoute en temps réel une consultation client
// Transcrit, prend des notes, donne des pistes juridiques
// et suggère des réponses à l'avocat EN DIRECT
//
// Web Speech API (navigateur) → SSE → Agents IA
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

// ================================================
// POST /session/start — Démarrer une session live
// ================================================
router.post('/session/start', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, client_nom, type_consultation } = req.body || {};
    // type : premiere_consultation, suivi, preparation_audience, negociation, autre

    const { data: session, error } = await admin().from('copilot_live_sessions').insert({
      societe_id: req.societeId,
      user_id: req.userId,
      dossier_id: dossier_id || null,
      client_nom: client_nom || null,
      type_consultation: type_consultation || 'premiere_consultation',
      status: 'active',
      transcription_live: '',
      notes_auto: [],
      pistes_juridiques: [],
      suggestions: [],
      started_at: new Date().toISOString()
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    // Si un dossier est lié, charger le contexte
    let contexte_dossier = null;
    if (dossier_id) {
      const { data: dossier } = await admin().from('avocat_dossiers')
        .select('id, titre, domaine, etape, veille_keywords')
        .eq('id', dossier_id)
        .eq('avocat_societe_id', req.societeId)
        .single();

      // Charger les pièces du dossier
      const { data: pieces } = await admin().from('avocat_pieces')
        .select('nom_fichier, type_piece, texte_extrait')
        .eq('dossier_id', dossier_id)
        .limit(5);

      // Charger la mémoire juridique
      const { data: memoire } = await admin().from('legal_dossier_memory')
        .select('titre, contenu, score_pertinence')
        .eq('dossier_id', dossier_id)
        .order('score_pertinence', { ascending: false })
        .limit(5);

      contexte_dossier = { dossier, pieces: pieces || [], memoire: memoire || [] };
    }

    return res.json({
      session_id: session.id,
      status: 'active',
      contexte_dossier,
      message: 'Session live démarrée. L\'IA écoute et analyse en temps réel.'
    });
  } catch (err) {
    console.error('[copilot-live/start]', err.message);
    return res.status(500).json({ error: 'Erreur démarrage session' });
  }
});

// ================================================
// POST /session/chunk — Recevoir un morceau de transcription live
// Le frontend envoie le texte toutes les 5-10 secondes
// ================================================
router.post('/session/chunk', requireAvocat, async (req, res) => {
  try {
    const { session_id, texte, timestamp } = req.body || {};
    if (!session_id || !texte) return res.status(400).json({ error: 'session_id et texte requis' });

    // 1. Récupérer la session
    const { data: session } = await admin().from('copilot_live_sessions')
      .select('id, transcription_live, dossier_id, notes_auto, pistes_juridiques, type_consultation')
      .eq('id', session_id)
      .eq('societe_id', req.societeId)
      .single();

    if (!session) return res.status(404).json({ error: 'Session non trouvée' });

    // 2. Ajouter le chunk à la transcription
    const transcriptionUpdated = (session.transcription_live || '') + '\n[' + (timestamp || new Date().toISOString()) + '] ' + texte;

    await admin().from('copilot_live_sessions')
      .update({ transcription_live: transcriptionUpdated })
      .eq('id', session_id);

    // 3. Analyser le chunk en temps réel (Ollama = 0€, instantané)
    const analyse = await analyserChunkLive(texte, session);

    // 4. Sauvegarder les notes et pistes si trouvées
    if (analyse.notes.length || analyse.pistes.length || analyse.suggestion) {
      const notesUpdated = [...(session.notes_auto || []), ...analyse.notes];
      const pistesUpdated = [...(session.pistes_juridiques || []), ...analyse.pistes];

      await admin().from('copilot_live_sessions')
        .update({
          notes_auto: notesUpdated,
          pistes_juridiques: pistesUpdated
        })
        .eq('id', session_id);
    }

    return res.json({
      notes: analyse.notes,
      pistes: analyse.pistes,
      suggestion: analyse.suggestion,
      alerte: analyse.alerte
    });
  } catch (err) {
    console.error('[copilot-live/chunk]', err.message);
    return res.status(500).json({ error: 'Erreur traitement chunk' });
  }
});

// ================================================
// ANALYSE LIVE — Détecte les éléments importants en temps réel
// ================================================
async function analyserChunkLive(texte, session) {
  const result = { notes: [], pistes: [], suggestion: null, alerte: null };
  const lower = texte.toLowerCase();

  // === DÉTECTION PAR RÈGLES (instantané, 0€) ===

  // Dates mentionnées
  const dates = texte.match(/\b(\d{1,2}[\s/-]\w+[\s/-]\d{2,4}|\d{1,2}\s+\w+\s+\d{4}|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi);
  if (dates) {
    dates.forEach(d => result.notes.push({ type: 'date', texte: d, importance: 'haute' }));
  }

  // Montants
  const montants = texte.match(/\b(\d[\d\s,.]+)\s*(?:euros?|€|EUR)\b/gi);
  if (montants) {
    montants.forEach(m => result.notes.push({ type: 'montant', texte: m.trim(), importance: 'haute' }));
  }

  // Noms propres (mots avec majuscule en milieu de phrase)
  const noms = texte.match(/(?:Monsieur|Madame|Maître|M\.|Mme|Me)\s+[A-ZÀ-Ü][a-zà-ü]+/g);
  if (noms) {
    noms.forEach(n => result.notes.push({ type: 'personne', texte: n.trim(), importance: 'moyenne' }));
  }

  // Durées d'emploi / ancienneté
  const durees = texte.match(/\b(\d+)\s*(?:ans?|mois|années?|semaines?)\b/gi);
  if (durees) {
    durees.forEach(d => result.notes.push({ type: 'duree', texte: d.trim(), importance: 'moyenne' }));
  }

  // === DÉTECTION DE MOTS-CLÉS JURIDIQUES → PISTES ===

  const pistesPatterns = [
    { pattern: /licenci[ée]/i, piste: 'Vérifier le motif du licenciement (art. L.1232-1). Demander la lettre de licenciement.' },
    { pattern: /faute grave/i, piste: 'Faute grave = pas d\'indemnité ni préavis (art. L.1234-1). Vérifier si les faits la justifient.' },
    { pattern: /harc[eè]l/i, piste: 'Harcèlement → obligation d\'enquête employeur (Cass. soc. 27/11/2019). Demander les preuves (mails, SMS, témoins).' },
    { pattern: /discrimin/i, piste: 'Discrimination → 25 critères (art. L.1132-1). Charge de la preuve aménagée (art. L.1134-1). Licenciement nul = pas de barème Macron.' },
    { pattern: /rupture convention/i, piste: 'Rupture conv. → indemnité min = légale (art. L.1237-13). Délai rétractation 15j + homologation 15j. Vérifier l\'absence de vice du consentement.' },
    { pattern: /inapt/i, piste: 'Inaptitude → origine pro ou non-pro ? Si AT/MP : indemnité doublée (art. L.1226-14). Vérifier le reclassement.' },
    { pattern: /burn[\s-]?out|épuis/i, piste: 'Burn-out → reconnaissance possible via CRRMP (art. L.461-1 al.4 CSS, si IPP ≥ 25%). Lien avec obligation de sécurité.' },
    { pattern: /heures?\s*sup/i, piste: 'Heures sup → prescription 3 ans (art. L.3245-1). Preuve partagée (Cass. soc. 18/03/2020). Majoration 25%/50%.' },
    { pattern: /forfait\s*jour/i, piste: 'Forfait jours → vérifier la convention individuelle ET l\'accord collectif. Si contrôle charge travail insuffisant → nullité.' },
    { pattern: /bar[eè]me\s*macron/i, piste: 'Barème Macron (art. L.1235-3) : plancher 1-3 mois, plafond 1-20 mois. Non applicable si nullité (harcèlement, discrimination).' },
    { pattern: /prud[\s']?hom/i, piste: 'CPH : saisine par requête (R.1452-1). Bureau de conciliation puis bureau de jugement. Délai moyen 12-18 mois.' },
    { pattern: /transaction/i, piste: 'Transaction (art. 2044 Code civil) → concessions réciproques. Calculer le net après CSG/IR. Comparer avec le barème Macron.' },
    { pattern: /cse|comit[ée]\s*social/i, piste: 'CSE → droit d\'alerte atteinte aux droits (art. L.2312-59). Enquête conjointe obligatoire.' },
    { pattern: /m[ée]decin\s*du\s*travail/i, piste: 'Médecin du travail → secret médical. Peut alerter sans diagnostic. Visite de pré-reprise possible.' },
    { pattern: /arr[eê]t\s*(?:de\s*)?travail|arr[eê]t\s*maladie/i, piste: 'Arrêt maladie → vérifier l\'obligation de visite de reprise. Si > 30 jours : visite obligatoire (art. R.4624-31).' },
    { pattern: /convention\s*collective/i, piste: 'Convention collective → vérifier l\'IDCC sur le bulletin de paie. Comparer indemnité légale vs conventionnelle.' },
    { pattern: /salaire\s*impay[ée]|pas\s*pay[ée]/i, piste: 'Salaire impayé → mise en demeure puis résiliation judiciaire ou prise d\'acte. Prescription 3 ans (art. L.3245-1).' },
    { pattern: /travail\s*dissimul[ée]/i, piste: 'Travail dissimulé → indemnité forfaitaire 6 mois (art. L.8223-1). Se cumule avec toutes les autres indemnités.' },
    { pattern: /clause\s*(?:de\s*)?non[\s-]concurr/i, piste: 'Clause de non-concurrence → vérifier la contrepartie financière (obligatoire depuis Cass. soc. 10/07/2002). Si pas de contrepartie = nulle.' },
    { pattern: /mise\s*[àa]\s*pied/i, piste: 'Mise à pied conservatoire (pas disciplinaire) → doit être suivie rapidement d\'une procédure. Si injustifiée, salaire dû rétroactivement.' },
  ];

  for (const pp of pistesPatterns) {
    if (pp.pattern.test(lower)) {
      result.pistes.push({ piste: pp.piste, declencheur: texte.match(pp.pattern)?.[0] || '' });
    }
  }

  // === ALERTES URGENTES ===
  if (/suicide|mettre\s*fin|en\s*finir|plus\s*envie\s*de\s*vivre/i.test(lower)) {
    result.alerte = {
      type: 'DANGER',
      message: 'ALERTE : Le client mentionne des idées suicidaires. Orienter immédiatement vers le 3114 (numéro national de prévention du suicide) et le médecin du travail.',
      urgence: 'critique'
    };
  }

  if (/violence|frapp[ée]|agress|menac[ée]\s*de\s*mort/i.test(lower)) {
    result.alerte = {
      type: 'VIOLENCE',
      message: 'ALERTE : Le client rapporte des violences. Vérifier s\'il y a danger immédiat. Envisager une main courante ou un dépôt de plainte.',
      urgence: 'haute'
    };
  }

  // === SUGGESTION DE RÉPONSE (si pistes détectées) ===
  if (result.pistes.length > 0 && !result.suggestion) {
    // Générer une suggestion rapide avec DeepSeek (cheap, pas de données sensibles dans la suggestion)
    try {
      const { callDeepSeek } = require('../../lib/legal-providers/legal-ia-router');
      const pisteTexte = result.pistes.map(p => p.piste).join('\n');
      const system = 'Tu es un assistant juridique. En une phrase concise, donne la question clé que l\'avocat devrait poser MAINTENANT au client, basée sur ces pistes juridiques. Pas de préambule, juste la question.';
      const question = await callDeepSeek(system, 'Pistes : ' + pisteTexte + '\nDernier propos du client : ' + texte.substring(0, 200), { maxTokens: 100, temperature: 0.3 });
      result.suggestion = question.trim();
    } catch {
      // Pas de suggestion si DeepSeek fail — pas bloquant
    }
  }

  return result;
}

// ================================================
// POST /session/stop — Arrêter la session et générer le résumé
// ================================================
router.post('/session/stop', requireAvocat, async (req, res) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id requis' });

    const { data: session } = await admin().from('copilot_live_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('societe_id', req.societeId)
      .single();

    if (!session) return res.status(404).json({ error: 'Session non trouvée' });

    // Générer le compte-rendu avec Mistral (RGPD, données client)
    const { callMistral } = require('../../lib/legal-providers/legal-ia-router');

    const system = `Tu es un assistant juridique. Génère un compte-rendu structuré de cette consultation avocat-client.

FORMAT :
1. OBJET DE LA CONSULTATION (1-2 lignes)
2. SITUATION DU CLIENT (résumé factuel)
3. FAITS IMPORTANTS (liste chronologique)
4. MONTANTS ET DÉLAIS MENTIONNÉS
5. PISTES JURIDIQUES IDENTIFIÉES
6. ACTIONS À MENER (checklist pour l'avocat)
7. PROCHAINES ÉTAPES

Style : professionnel, factuel, vouvoiement.`;

    let compteRendu = '';
    try {
      const pistes = (session.pistes_juridiques || []).map(p => p.piste).join('\n');
      const notes = (session.notes_auto || []).map(n => n.type + ' : ' + n.texte).join('\n');

      compteRendu = await callMistral(system,
        'TRANSCRIPTION :\n' + (session.transcription_live || '').substring(0, 8000) +
        '\n\nNOTES AUTO :\n' + notes +
        '\n\nPISTES JURIDIQUES :\n' + pistes,
        { maxTokens: 2000 }
      );
    } catch {
      compteRendu = 'Compte-rendu non généré (erreur IA). Transcription disponible ci-dessous.';
    }

    // Mettre à jour la session
    await admin().from('copilot_live_sessions')
      .update({
        status: 'terminee',
        compte_rendu: compteRendu,
        ended_at: new Date().toISOString(),
        duree_minutes: Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000)
      })
      .eq('id', session_id);

    return res.json({
      session_id,
      compte_rendu: compteRendu,
      transcription_complete: session.transcription_live,
      notes: session.notes_auto,
      pistes: session.pistes_juridiques,
      duree_minutes: Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000),
      nombre_mots: (session.transcription_live || '').split(/\s+/).length,
      message: 'Session terminée. Compte-rendu généré.'
    });
  } catch (err) {
    console.error('[copilot-live/stop]', err.message);
    return res.status(500).json({ error: 'Erreur arrêt session' });
  }
});

// ================================================
// GET /session/:id — Récupérer une session
// ================================================
router.get('/session/:id', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin().from('copilot_live_sessions')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Session non trouvée' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /sessions — Liste des sessions
// ================================================
router.get('/sessions', requireAvocat, async (req, res) => {
  try {
    const { data } = await admin().from('copilot_live_sessions')
      .select('id, client_nom, type_consultation, status, duree_minutes, started_at, dossier_id')
      .eq('societe_id', req.societeId)
      .order('started_at', { ascending: false })
      .limit(50);

    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /question-rapide — L'avocat pose une question à l'IA pendant la consultation
// ================================================
router.post('/question-rapide', requireAvocat, async (req, res) => {
  try {
    const { question, session_id } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question requis' });

    // Charger le contexte de la session si fourni
    let contexte = '';
    if (session_id) {
      const { data: session } = await admin().from('copilot_live_sessions')
        .select('transcription_live, pistes_juridiques, dossier_id')
        .eq('id', session_id)
        .eq('societe_id', req.societeId)
        .single();

      if (session) {
        contexte = 'CONTEXTE DE LA CONSULTATION EN COURS :\n' +
          (session.transcription_live || '').substring(Math.max(0, (session.transcription_live || '').length - 3000)) +
          '\n\nPISTES DÉJÀ IDENTIFIÉES :\n' +
          (session.pistes_juridiques || []).map(p => '- ' + p.piste).join('\n');
      }
    }

    // Répondre rapidement avec Mistral (RGPD + rapide)
    const { callMistral } = require('../../lib/legal-providers/legal-ia-router');

    const system = `Tu es l'assistant juridique de l'avocat pendant une consultation client. L'avocat te pose une question rapide.
Réponds en 3-5 lignes MAX. Cite l'article de loi si pertinent. Sois DIRECT et PRÉCIS — l'avocat est en consultation, pas le temps pour un cours magistral.
${contexte ? '\n' + contexte : ''}`;

    const reponse = await callMistral(system, question, { maxTokens: 300, temperature: 0.2 });

    return res.json({ reponse: reponse.trim() });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur : ' + err.message });
  }
});

module.exports = router;
