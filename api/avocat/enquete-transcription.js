// =============================================
// JADOMI AVOCAT — Transcription & Croisement d'Enquêtes
// Enregistrement audio → Transcription verbatim mot pour mot
// Croisement automatique des auditions → Détection contradictions
//
// Whisper (OpenAI) : 0.006$/min = 0.36$/heure
// Coût moyen enquête 8 entretiens × 1h30 = ~4$
// =============================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// === AUTH ===
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

// === UPLOAD CONFIG ===
const UPLOAD_DIR = path.join(__dirname, '../../uploads/enquetes-audio');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname))
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 Mo max (2h d'audio)
  fileFilter: (req, file, cb) => {
    const exts = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.mp4', '.flac', '.aac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (exts.includes(ext)) return cb(null, true);
    cb(new Error('Format audio non supporté. Acceptés : ' + exts.join(', ')));
  }
});

// ================================================
// POST /transcrire — Upload audio → Transcription verbatim
// ================================================
router.post('/transcrire', requireAvocat, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier audio requis' });

    const { entretien_id, enquete_id, personne_auditionnee, qualite_personne, langue } = req.body || {};

    const startTime = Date.now();

    // 1. Transcription via Whisper (OpenAI)
    const FormData = (await import('formdata-node')).FormData;
    const { fileFromPath } = await import('formdata-node/file-from-path');

    const form = new FormData();
    form.set('file', await fileFromPath(req.file.path));
    form.set('model', 'whisper-1');
    form.set('language', langue || 'fr');
    form.set('response_format', 'verbose_json'); // timestamps + segments
    form.set('timestamp_granularities[]', 'segment');

    const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
      body: form
    });

    if (!whisperResp.ok) {
      const errText = await whisperResp.text();
      console.error('[transcription] Whisper error:', whisperResp.status, errText.substring(0, 200));
      return res.status(502).json({ error: 'Erreur de transcription. Réessayez.' });
    }

    const transcription = await whisperResp.json();
    const durationMs = Date.now() - startTime;

    // 2. Extraire le texte et les segments avec timestamps
    const texteComplet = transcription.text || '';
    const segments = (transcription.segments || []).map(s => ({
      debut: s.start,
      fin: s.end,
      texte: s.text?.trim() || '',
      confiance: s.avg_logprob ? Math.round(Math.exp(s.avg_logprob) * 100) : null
    }));

    // 3. Durée de l'audio
    const dureeMinutes = transcription.duration ? Math.round(transcription.duration / 60 * 10) / 10 : null;
    const coutEstime = dureeMinutes ? Math.round(dureeMinutes * 0.006 * 100) / 100 : null;

    // 4. Stocker en base
    const { data: record, error: dbErr } = await admin().from('enquete_transcriptions').insert({
      societe_id: req.societeId,
      enquete_id: enquete_id || null,
      entretien_id: entretien_id || null,
      personne_auditionnee: personne_auditionnee || null,
      qualite_personne: qualite_personne || null, // victime, temoin, mis_en_cause
      fichier_audio: req.file.filename,
      duree_minutes: dureeMinutes,
      texte_complet: texteComplet,
      segments: segments,
      langue: langue || 'fr',
      cout_transcription: coutEstime,
      transcribed_by: req.userId
    }).select().single();

    if (dbErr) {
      console.error('[transcription] DB error:', dbErr.message);
      // On retourne quand même la transcription
    }

    // 5. Supprimer le fichier audio local (on garde que la transcription)
    // Sauf si on veut garder l'audio pour vérification
    // fs.unlinkSync(req.file.path);

    return res.json({
      id: record?.id || null,
      texte_complet: texteComplet,
      segments,
      duree_minutes: dureeMinutes,
      nombre_mots: texteComplet.split(/\s+/).length,
      cout_usd: coutEstime,
      duree_transcription_ms: durationMs,
      message: 'Transcription verbatim terminée. ' + texteComplet.split(/\s+/).length + ' mots transcrits.'
    });
  } catch (err) {
    console.error('[transcription]', err.message);
    return res.status(500).json({ error: 'Erreur interne : ' + err.message });
  }
});

// ================================================
// POST /transcrire-texte — Transcription manuelle (copier-coller)
// Pour les avocats qui prennent des notes à la main
// ================================================
router.post('/transcrire-texte', requireAvocat, async (req, res) => {
  try {
    const { enquete_id, entretien_id, personne_auditionnee, qualite_personne, texte } = req.body || {};
    if (!texte) return res.status(400).json({ error: 'texte requis' });

    const { data, error } = await admin().from('enquete_transcriptions').insert({
      societe_id: req.societeId,
      enquete_id: enquete_id || null,
      entretien_id: entretien_id || null,
      personne_auditionnee: personne_auditionnee || null,
      qualite_personne: qualite_personne || null,
      texte_complet: texte,
      segments: [],
      langue: 'fr',
      cout_transcription: 0,
      transcribed_by: req.userId
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ id: data.id, nombre_mots: texte.split(/\s+/).length });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /transcriptions/:enqueteId — Toutes les transcriptions d'une enquête
// ================================================
router.get('/transcriptions/:enqueteId', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin().from('enquete_transcriptions')
      .select('id, personne_auditionnee, qualite_personne, duree_minutes, texte_complet, segments, created_at')
      .eq('enquete_id', req.params.enqueteId)
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /croiser — LE CROISEMENT AUTOMATIQUE
// Compare toutes les auditions et détecte :
// - Contradictions entre témoignages
// - Concordances (faits confirmés par plusieurs personnes)
// - Faits isolés (mentionnés par une seule personne)
// - Chronologie reconstituée
// ================================================
router.post('/croiser', requireAvocat, async (req, res) => {
  try {
    const { enquete_id } = req.body || {};
    if (!enquete_id) return res.status(400).json({ error: 'enquete_id requis' });

    // 1. Récupérer toutes les transcriptions de l'enquête
    const { data: transcriptions, error } = await admin().from('enquete_transcriptions')
      .select('id, personne_auditionnee, qualite_personne, texte_complet')
      .eq('enquete_id', enquete_id)
      .eq('societe_id', req.societeId);

    if (error) return res.status(500).json({ error: error.message });
    if (!transcriptions || transcriptions.length < 2) {
      return res.status(400).json({ error: 'Il faut au moins 2 auditions pour effectuer un croisement.' });
    }

    // 2. Préparer le contexte pour Claude (analyse complexe = Claude obligatoire)
    const { callClaude } = require('../../lib/legal-providers/legal-ia-router');

    const systemPrompt = `Tu es un expert en analyse d'enquêtes internes. Tu reçois les transcriptions verbatim de plusieurs auditions.

TON TRAVAIL : croiser les déclarations et produire une analyse structurée.

RÈGLES :
1. Tu compares CHAQUE fait mentionné par CHAQUE personne.
2. Tu identifies les CONTRADICTIONS (versions différentes du même fait).
3. Tu identifies les CONCORDANCES (même fait confirmé par plusieurs personnes).
4. Tu identifies les FAITS ISOLÉS (mentionnés par une seule personne).
5. Tu reconstitues une CHRONOLOGIE des faits à partir de l'ensemble des auditions.
6. Tu NE QUALIFIES PAS juridiquement — tu constates les faits.
7. Tu cites EXACTEMENT les mots des audités entre guillemets.

FORMAT JSON OBLIGATOIRE :
{
  "contradictions": [
    {
      "fait": "Description du fait sur lequel il y a contradiction",
      "versions": [
        {"personne": "Nom", "qualite": "victime/temoin/mis_en_cause", "declaration": "Citation exacte"},
        {"personne": "Nom", "qualite": "...", "declaration": "Citation exacte différente"}
      ],
      "gravite": "critique|importante|mineure",
      "observation": "Analyse factuelle de la contradiction"
    }
  ],
  "concordances": [
    {
      "fait": "Description du fait confirmé par plusieurs personnes",
      "confirmations": [
        {"personne": "Nom", "qualite": "...", "declaration": "Citation"}
      ],
      "fiabilite": "forte|moyenne|faible",
      "nombre_sources": 3
    }
  ],
  "faits_isoles": [
    {
      "fait": "Description",
      "source": {"personne": "Nom", "qualite": "...", "declaration": "Citation"},
      "observation": "Pourquoi ce fait est isolé (pas de témoin, huis clos, etc.)"
    }
  ],
  "chronologie": [
    {
      "date": "2025-03-15",
      "date_approximative": false,
      "fait": "Description",
      "sources": ["Nom1", "Nom2"],
      "concordance": true
    }
  ],
  "personnes_cles": [
    {
      "nom": "Nom",
      "qualite": "victime/temoin/mis_en_cause",
      "credibilite_apparente": "forte|moyenne|faible",
      "coherence_interne": "Le récit est cohérent/contradictoire avec lui-même",
      "nombre_faits_rapportes": 5
    }
  ],
  "synthese": "Résumé global du croisement en 5-10 lignes",
  "alertes": ["Points nécessitant une vérification complémentaire"],
  "score_concordance_global": 75
}`;

    // Construire le texte des auditions
    let auditionsText = '';
    for (const t of transcriptions) {
      auditionsText += `\n\n=== AUDITION DE ${(t.personne_auditionnee || 'Inconnu').toUpperCase()} (${t.qualite_personne || 'non précisé'}) ===\n`;
      auditionsText += t.texte_complet.substring(0, 8000); // Max 8000 chars par audition
    }

    // Limiter à 30 000 chars pour Claude
    if (auditionsText.length > 30000) {
      auditionsText = auditionsText.substring(0, 30000) + '\n[... transcriptions tronquées pour l\'analyse]';
    }

    const userPrompt = `ENQUÊTE : ${enquete_id}\nNombre d'auditions : ${transcriptions.length}\n\n${auditionsText}\n\nAnalyse croisée de ces ${transcriptions.length} auditions. Identifie toutes les contradictions, concordances, faits isolés et reconstitue la chronologie.`;

    const startTime = Date.now();
    const result = await callClaude(systemPrompt, userPrompt, { maxTokens: 8192 });
    const durationMs = Date.now() - startTime;

    // Parser le JSON
    let analysis;
    try {
      const match = result.match(/\{[\s\S]*\}/);
      analysis = match ? JSON.parse(match[0]) : null;
    } catch {
      analysis = { raw_text: result, parse_error: true };
    }

    // Stocker l'analyse en base
    await admin().from('enquete_croisements').insert({
      societe_id: req.societeId,
      enquete_id,
      nombre_auditions: transcriptions.length,
      resultat: analysis,
      score_concordance: analysis?.score_concordance_global || null,
      analysed_by: req.userId,
      duree_analyse_ms: durationMs
    }).catch(err => console.error('[croisement] DB error:', err.message));

    return res.json({
      enquete_id,
      nombre_auditions: transcriptions.length,
      analyse: analysis,
      duree_analyse_ms: durationMs,
      garde_fou: 'Ce croisement est une aide à l\'analyse. L\'enquêteur doit vérifier chaque élément et exercer son jugement professionnel.'
    });
  } catch (err) {
    console.error('[croisement]', err.message);
    return res.status(500).json({ error: 'Erreur lors du croisement : ' + err.message });
  }
});

// ================================================
// GET /croisement/:enqueteId — Dernier croisement d'une enquête
// ================================================
router.get('/croisement/:enqueteId', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin().from('enquete_croisements')
      .select('*')
      .eq('enquete_id', req.params.enqueteId)
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) return res.status(404).json({ error: 'Aucun croisement trouvé' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /extraire-faits — Extraire les faits structurés d'UNE audition
// ================================================
router.post('/extraire-faits', requireAvocat, async (req, res) => {
  try {
    const { transcription_id } = req.body || {};
    if (!transcription_id) return res.status(400).json({ error: 'transcription_id requis' });

    const { data: trans } = await admin().from('enquete_transcriptions')
      .select('texte_complet, personne_auditionnee, qualite_personne')
      .eq('id', transcription_id)
      .eq('societe_id', req.societeId)
      .single();

    if (!trans) return res.status(404).json({ error: 'Transcription non trouvée' });

    // Utiliser Mistral (RGPD, données client) pour extraire les faits
    const { callMistral } = require('../../lib/legal-providers/legal-ia-router');

    const system = `Tu extrais les FAITS structurés d'une audition d'enquête interne.

Pour chaque fait mentionné, extrais :
- date (exacte ou approximative)
- description (ce qui s'est passé)
- lieu
- personnes impliquées
- témoins mentionnés
- citation verbatim (les mots exacts de l'audité entre guillemets)
- type : agissement, propos, décision, omission, violence

Retourne du JSON : {"faits": [{"date":"...","description":"...","lieu":"...","personnes":[],"temoins":[],"citation":"...","type":"..."}]}`;

    const result = await callMistral(system, trans.texte_complet.substring(0, 6000), { maxTokens: 2000, json: true });

    let faits;
    try {
      const match = result.match(/\{[\s\S]*\}/);
      faits = match ? JSON.parse(match[0]) : { faits: [] };
    } catch {
      faits = { faits: [], raw: result };
    }

    return res.json({
      transcription_id,
      personne: trans.personne_auditionnee,
      qualite: trans.qualite_personne,
      faits: faits.faits || [],
      nombre_faits: (faits.faits || []).length
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur extraction : ' + err.message });
  }
});

module.exports = router;
