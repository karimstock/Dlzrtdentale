// =============================================
// JADOMI — IA Documentaire : transcription, traduction, generation
// Cible : dentistes francophones, patients multilingues
// Auth Supabase + rate limiting + quota
// =============================================
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const router = express.Router();

// ===== Supabase Admin (lazy singleton) =====
let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// ===== OpenAI client =====
let _openai = null;
function openai() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquant');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ===== Multer config (25MB max, audio only) =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg',
      'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/flac', 'video/webm'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|webm|ogg|m4a|flac|mp4)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Format audio non supporté'));
    }
  }
});

// ===== Multer config for media/images (10MB max, images only) =====
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = '/tmp/jadomi-ia-doc';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, id + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype) || !!file.originalname.match(/\.(jpg|jpeg|png|webp|heic)$/i));
  }
});

// ===== Vision system prompt for dental image analysis =====
const VISION_SYSTEM_PROMPT = `Vous êtes un chirurgien-dentiste expert en radiologie dentaire et en traumatologie bucco-dentaire. Analysez cette image et décrivez avec précision :

Si c'est une radio panoramique ou rétro-alvéolaire :
- Structures osseuses (maxillaire, mandibule, ATM)
- État dentaire dent par dent en notation FDI (11, 12, 13...)
- Lésions péri-apicales, kystes, granulomes
- Perte osseuse (horizontale, verticale, en cuvette)
- Dents incluses, surnuméraires
- Obturations, couronnes, implants existants
- Pathologies des sinus maxillaires
- Trajet du canal mandibulaire

Si c'est une photo clinique intra-buccale ou exo-buccale :
- Localisation anatomique précise
- Tuméfactions, hématomes, plaies, oedèmes
- Fractures dentaires (coronaires, radiculaires)
- Luxations (latérale, extrusive, intrusive)
- Avulsions (dents absentes post-trauma)
- État gingival et parodontal
- Mobilités apparentes

Soyez factuel et descriptif. N'inventez pas ce que vous ne voyez pas clairement.
Si l'image est floue ou non interprétable, dites-le.`;

// ===== Claude Vision analysis helper =====
async function analyzeImageWithVision(imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: VISION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: 'Analysez cette image dentaire/radiologique en détail.' }
        ]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude Vision API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ===== Auth middleware (Supabase JWT) =====
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

// ===== Rate limiter (in-memory, 60 req/min/user) =====
const rateBuckets = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

function rateLimit() {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    let bucket = rateBuckets.get(userId);
    if (!bucket || now - bucket.start > RATE_WINDOW) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(userId, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_LIMIT) {
      return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter.' });
    }
    next();
  };
}

// Nettoyage periodique des buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > RATE_WINDOW * 2) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

// ===== Document types & system prompts =====
const DOCUMENT_TYPES = [
  'cr_consultation', 'courrier_confrere', 'bon_labo', 'ordonnance',
  'certificat', 'devis', 'consentement', 'lettre_correspondant',
  'cr_implant', 'cr_cone_beam'
];

const DOCUMENT_LABELS = {
  cr_consultation: 'Compte-rendu de consultation',
  courrier_confrere: 'Courrier au confrère',
  bon_labo: 'Bon de laboratoire',
  ordonnance: 'Ordonnance',
  certificat: 'Certificat médical',
  devis: 'Devis patient',
  consentement: 'Consentement éclairé',
  lettre_correspondant: 'Lettre au correspondant',
  cr_implant: 'Compte-rendu de pose d\'implant',
  cr_cone_beam: 'Compte-rendu Cone Beam / radio panoramique'
};

function getSystemPrompt(type, cabinetInfo) {
  const cabinetStr = cabinetInfo
    ? `\nInformations du cabinet :\n- Nom : ${cabinetInfo.nom || 'Non précisé'}\n- Adresse : ${cabinetInfo.adresse || 'Non précisée'}\n- Téléphone : ${cabinetInfo.telephone || 'Non précisé'}\n- RPPS : ${cabinetInfo.rpps || 'Non précisé'}`
    : '';

  const base = `Vous êtes un assistant médical spécialisé en chirurgie dentaire et odontologie. Vous rédigez des documents professionnels en français, avec un vocabulaire médical précis et rigoureux. Vous utilisez le vouvoiement pour tout document destiné au patient. Vous ne faites jamais de diagnostic — vous retranscrivez les observations et décisions du praticien.${cabinetStr}`;

  const prompts = {
    cr_consultation: `${base}\n\nRédigez un compte-rendu de consultation dentaire structuré avec : Motif de consultation, Anamnèse, Examen clinique (examen exo-buccal, examen endo-buccal, examen dentaire), Examens complémentaires, Diagnostic, Plan de traitement proposé, Conclusion. Utilisez la nomenclature CCAM quand applicable.`,

    courrier_confrere: `${base}\n\nRédigez un courrier professionnel adressé à un confrère ou spécialiste (parodontologue, endodontiste, orthodontiste, ORL, stomatologue, chirurgien maxillo-facial). Le ton est professionnel et confraternellement courtois. Incluez : les antécédents pertinents, le motif d'adressage, les examens réalisés, votre hypothèse diagnostique et ce que vous attendez du correspondant.`,

    bon_labo: `${base}\n\nRédigez un bon de laboratoire prothésiste structuré : Nature du travail (couronne, bridge, inlay/onlay, prothèse amovible, gouttière, etc.), Dent(s) concernée(s) (numérotation FDI), Matériau souhaité (zircone, céramo-métallique, résine, etc.), Teinte (code VITA), Instructions spécifiques, Date de livraison souhaitée.`,

    ordonnance: `${base}\n\nVous proposez un BROUILLON d'ordonnance à titre d'aide à la rédaction. Ce brouillon DOIT être intégralement vérifié, corrigé et validé par le praticien avant toute remise au patient.\n\nRègles ABSOLUES :\n- NE prescrivez QUE les médicaments EXPLICITEMENT mentionnés par le praticien dans la transcription\n- N'inventez JAMAIS un médicament, un dosage ou une posologie non mentionnés\n- Si un dosage n'est pas précisé dans la transcription, écrivez "[DOSAGE À PRÉCISER PAR LE PRATICIEN]"\n- Si une durée n'est pas précisée, écrivez "[DURÉE À PRÉCISER]"\n- Ajoutez en HAUT du document en gras : "⚠ BROUILLON — VÉRIFICATION OBLIGATOIRE PAR LE PRATICIEN AVANT SIGNATURE"\n- Ajoutez en BAS : "Ce document a été pré-rédigé par JADOMI IA à partir de la dictée du praticien. Il ne constitue pas une ordonnance valide tant qu'il n'a pas été vérifié, corrigé et signé par le praticien."\n- Pour chaque médicament, incluez : DCI et nom commercial, dosage, posologie, durée, voie d'administration\n- Mentionnez si des allergies ont été signalées dans la transcription`,

    certificat: `${base}\n\nRédigez un certificat médical. Soyez factuel et objectif. Ne mentionnez que les constatations cliniques observées. Incluez : date de l'examen, identité du patient, constatations cliniques, conclusion. Terminez par "Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit."`,

    devis: `${base}\n\nRédigez un devis patient détaillé conforme à la réglementation. Pour chaque acte : code CCAM, libellé de l'acte, base de remboursement Sécurité Sociale, honoraires pratiqués, reste à charge estimé. Incluez un récapitulatif total. Ajoutez la mention de validité du devis et le délai de rétractation.`,

    consentement: `${base}\n\nRédigez un BROUILLON de formulaire de consentement éclairé pour un acte dentaire. Ce brouillon DOIT être vérifié par le praticien avant remise au patient.\n\nAjoutez en HAUT en gras : "⚠ BROUILLON — À VÉRIFIER PAR LE PRATICIEN AVANT REMISE AU PATIENT"\n\nUtilisez impérativement le vouvoiement. Incluez : description de l'acte en termes compréhensibles, bénéfices attendus, risques possibles (y compris rares), alternatives thérapeutiques, conséquences en l'absence de traitement. Terminez par une formule d'acceptation à signer par le patient avec mention de la date.\n\nAjoutez en BAS : "Document pré-rédigé par JADOMI IA — validation praticien requise."`,

    lettre_correspondant: `${base}\n\nRédigez une lettre au médecin correspondant (médecin traitant, cardiologue, endocrinologue, etc.). Informez-le des actes réalisés ou prévus, des médicaments prescrits, et demandez si nécessaire un avis ou des précautions particulières (anticoagulants, bisphosphonates, endocardite, etc.).`,

    cr_implant: `${base}\n\nRédigez un compte-rendu opératoire de pose d'implant(s) dentaire(s). Incluez : site(s) implantaire(s) (numérotation FDI), marque et référence de l'implant, diamètre et longueur, protocole chirurgical (lambeau/flapless, forage, torque d'insertion), comblement osseux éventuel (matériau, membrane), sutures, prescriptions post-opératoires, consignes post-opératoires.`,

    cr_cone_beam: `${base}\n\nRédigez un compte-rendu radiologique (cone beam CBCT ou radio panoramique). Structurez par secteur (maxillaire/mandibulaire, par sextant). Décrivez : état des structures osseuses, lésions péri-apicales, état des sinus maxillaires, canal mandibulaire, pathologies observées. Concluez avec une synthèse diagnostique.`
  };

  return prompts[type] || base;
}

// ===== Claude API call =====
async function callClaude(systemPrompt, userMessage) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ===== Translation system prompt =====
const TRANSLATION_SYSTEM = `Vous êtes un traducteur médical professionnel spécialisé en odontologie et chirurgie dentaire. Vous traduisez avec précision le vocabulaire médical dentaire :
- Termes anatomiques (pulpe, parodonte, apex, furcation, alvéole, gencive attachée, frein labial...)
- Actes (détartrage, surfaçage, curetage, avulsion, énucléation, ostéotomie, greffe gingivale...)
- Prothèses (couronne céramo-métallique, inlay-core, bridge, prothèse amovible partielle stellite...)
- Pathologies (parodontite, pulpite, cellulite, alvéolite, péri-implantite, lichen plan...)
- Matériaux (composite, zircone, disilicate de lithium, amalgame, CVI, hydroxyde de calcium...)

Règles :
- Conservez les termes techniques sans les simplifier
- Si un terme n'a pas d'équivalent exact dans la langue cible, gardez le terme latin/international entre parenthèses
- Adaptez le registre : langage technique pour les professionnels, langage accessible pour les patients
- Ne rajoutez aucun commentaire, ne résumez pas, traduisez fidèlement`;

// ===================================================================
// 1. POST /transcribe — Transcription audio via Whisper
// ===================================================================
router.post('/transcribe', requireAuth(), rateLimit(), upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier audio requis' });
    }

    const language = req.body.language || undefined;

    const file = new File([req.file.buffer], req.file.originalname, {
      type: req.file.mimetype
    });

    const response = await openai().audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language,
      response_format: 'verbose_json'
    });

    console.log('[ia-doc] transcribe OK —', Math.round(response.duration || 0), 's');

    res.json({
      text: response.text,
      language_detected: response.language || language || 'unknown',
      duration_seconds: Math.round(response.duration || 0)
    });
  } catch (err) {
    console.error('[ia-doc] POST /transcribe', err.message);
    if (err.message?.includes('Format audio')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erreur transcription audio' });
  }
});

// ===================================================================
// 2. POST /translate — Traduction medicale via Claude
// ===================================================================
router.post('/translate', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { text, source_language, target_language } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Texte requis' });
    }
    if (!target_language) {
      return res.status(400).json({ error: 'Langue cible (target_language) requise' });
    }

    const userMsg = `Traduisez le texte suivant de ${source_language || 'la langue détectée'} vers ${target_language}.\n\nTexte à traduire :\n${text}`;
    const translated = await callClaude(TRANSLATION_SYSTEM, userMsg);

    console.log('[ia-doc] translate OK —', source_language || 'auto', '->', target_language);

    res.json({
      translated_text: translated,
      source_language: source_language || 'auto',
      target_language
    });
  } catch (err) {
    console.error('[ia-doc] POST /translate', err.message);
    res.status(500).json({ error: 'Erreur traduction' });
  }
});

// ===================================================================
// 3. POST /generate-document — Generation document IA
// ===================================================================
router.post('/generate-document', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { type, transcription, patient_context, cabinet_info } = req.body;

    if (!type || !DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Type de document invalide. Types acceptés : ${DOCUMENT_TYPES.join(', ')}`
      });
    }
    if (!transcription || typeof transcription !== 'string' || transcription.trim().length === 0) {
      return res.status(400).json({ error: 'Transcription requise' });
    }

    const systemPrompt = getSystemPrompt(type, cabinet_info);
    let userMsg = `À partir de la transcription suivante, rédigez un document de type "${DOCUMENT_LABELS[type]}".`;

    if (patient_context) {
      userMsg += `\n\nContexte patient :\n- Nom : ${patient_context.nom || 'Non précisé'}\n- Prénom : ${patient_context.prenom || 'Non précisé'}\n- Date de naissance : ${patient_context.date_naissance || 'Non précisée'}\n- Antécédents : ${patient_context.antecedents || 'Non précisés'}\n- Allergies : ${patient_context.allergies || 'Aucune connue'}`;
    }

    userMsg += `\n\nTranscription :\n${transcription}`;

    const documentText = await callClaude(systemPrompt, userMsg);

    // Convertir en HTML basique
    const documentHtml = textToHtml(documentText, type);

    console.log('[ia-doc] generate-document OK — type:', type);

    res.json({
      document_html: documentHtml,
      document_text: documentText,
      type,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[ia-doc] POST /generate-document', err.message);
    res.status(500).json({ error: 'Erreur génération document' });
  }
});

// ===================================================================
// 4. POST /session/start — Demarrer session consultation
// ===================================================================
router.post('/session/start', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { patient_id, consultation_type } = req.body;
    const userId = req.user.id;
    const societeId = req.societe?.id;

    const { data, error } = await admin()
      .from('ia_doc_sessions')
      .insert({
        user_id: userId,
        societe_id: societeId || null,
        patient_id: patient_id || null,
        consultation_type: consultation_type || 'general',
        status: 'active',
        started_at: new Date().toISOString()
      })
      .select('id, started_at')
      .single();

    if (error) throw error;

    console.log('[ia-doc] session start —', data.id);

    res.status(201).json({
      session_id: data.id,
      started_at: data.started_at
    });
  } catch (err) {
    console.error('[ia-doc] POST /session/start', err.message);
    res.status(500).json({ error: 'Erreur création session' });
  }
});

// ===================================================================
// 5. POST /session/:id/end — Terminer session
// ===================================================================
router.post('/session/:id/end', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.user.id;

    const { data: session, error: sErr } = await admin()
      .from('ia_doc_sessions')
      .select('id, started_at, user_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const endedAt = new Date();
    const startedAt = new Date(session.started_at);
    const durationMinutes = Math.round((endedAt - startedAt) / 60000);

    const { data: segments } = await admin()
      .from('ia_doc_segments')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    const segmentsCount = segments?.length || 0;

    const { error } = await admin()
      .from('ia_doc_sessions')
      .update({
        status: 'completed',
        ended_at: endedAt.toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;

    console.log('[ia-doc] session end —', sessionId, durationMinutes, 'min');

    res.json({
      duration_minutes: durationMinutes,
      segments_count: segmentsCount
    });
  } catch (err) {
    console.error('[ia-doc] POST /session/:id/end', err.message);
    res.status(500).json({ error: 'Erreur fermeture session' });
  }
});

// ===================================================================
// 6. POST /session/:id/segment — Ajouter segment transcrit
// ===================================================================
router.post('/session/:id/segment', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.user.id;
    const { text, language, speaker, timestamp } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Texte du segment requis' });
    }
    if (speaker && !['dentiste', 'patient'].includes(speaker)) {
      return res.status(400).json({ error: 'Speaker invalide (dentiste ou patient)' });
    }

    // Verifier que la session appartient au user
    const { data: session, error: sErr } = await admin()
      .from('ia_doc_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session terminée, impossible d\'ajouter un segment' });
    }

    const { data, error } = await admin()
      .from('ia_doc_segments')
      .insert({
        session_id: sessionId,
        text: text.trim(),
        language: language || 'fr',
        speaker: speaker || 'dentiste',
        timestamp: timestamp || new Date().toISOString()
      })
      .select('id, timestamp')
      .single();

    if (error) throw error;

    res.status(201).json({ ok: true, segment_id: data.id, timestamp: data.timestamp });
  } catch (err) {
    console.error('[ia-doc] POST /session/:id/segment', err.message);
    res.status(500).json({ error: 'Erreur ajout segment' });
  }
});

// ===================================================================
// 7. GET /session/:id/transcript — Recuperer transcription complete
// ===================================================================
router.get('/session/:id/transcript', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.user.id;

    // Verifier la session
    const { data: session, error: sErr } = await admin()
      .from('ia_doc_sessions')
      .select('id, started_at, ended_at, consultation_type, patient_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const { data: segments, error } = await admin()
      .from('ia_doc_segments')
      .select('id, text, language, speaker, timestamp')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    res.json({
      session_id: sessionId,
      started_at: session.started_at,
      ended_at: session.ended_at,
      consultation_type: session.consultation_type,
      patient_id: session.patient_id,
      segments: segments || []
    });
  } catch (err) {
    console.error('[ia-doc] GET /session/:id/transcript', err.message);
    res.status(500).json({ error: 'Erreur récupération transcription' });
  }
});

// ===================================================================
// 8. POST /session/:id/generate-all — Generer tous les docs pertinents
// ===================================================================
router.post('/session/:id/generate-all', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.user.id;

    // Charger la session
    const { data: session, error: sErr } = await admin()
      .from('ia_doc_sessions')
      .select('id, consultation_type, patient_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    // Charger les segments
    const { data: segments, error: segErr } = await admin()
      .from('ia_doc_segments')
      .select('text, speaker, language, timestamp')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (segErr) throw segErr;
    if (!segments || segments.length === 0) {
      return res.status(400).json({ error: 'Aucun segment dans cette session' });
    }

    // Assembler la transcription
    const fullTranscript = segments
      .map(s => `[${s.speaker === 'dentiste' ? 'Dentiste' : 'Patient'}] ${s.text}`)
      .join('\n');

    // Demander a Claude quels documents generer
    const analysisPrompt = `Vous êtes un assistant de cabinet dentaire. Analysez la transcription suivante d'une consultation et déterminez quels documents doivent être générés.

Répondez UNIQUEMENT avec un tableau JSON des types de documents pertinents parmi : ${DOCUMENT_TYPES.join(', ')}.

Règles :
- "cr_consultation" : TOUJOURS inclus
- "ordonnance" : JAMAIS generee automatiquement (risque medical, le praticien la redige manuellement)
- "bon_labo" : inclus SI une prothèse est mentionnée (couronne, bridge, inlay, gouttière, etc.)
- "courrier_confrere" : inclus SI un adressage à un spécialiste est mentionné
- "certificat" : inclus SI un certificat est demandé
- "consentement" : inclus SI un acte chirurgical est prévu (extraction, implant, greffe, etc.)
- "devis" : inclus SI un devis ou chiffrage est mentionné
- "cr_implant" : inclus SI une pose d'implant est décrite
- "cr_cone_beam" : inclus SI un cone beam ou panoramique est interprété

Répondez UNIQUEMENT avec le JSON, sans explication.`;

    const analysisResponse = await callClaude(analysisPrompt, fullTranscript);
    let docTypes;
    try {
      // Extraire le JSON du bloc markdown si present
      const jsonMatch = analysisResponse.match(/\[[\s\S]*?\]/);
      docTypes = jsonMatch ? JSON.parse(jsonMatch[0]) : ['cr_consultation'];
    } catch {
      docTypes = ['cr_consultation'];
    }

    // Filtrer les types valides
    docTypes = docTypes.filter(t => DOCUMENT_TYPES.includes(t));
    if (docTypes.length === 0) docTypes = ['cr_consultation'];

    // Charger le contexte patient si disponible
    let patientContext = null;
    if (session.patient_id) {
      const { data: patient } = await admin()
        .from('dentiste_pro_patients')
        .select('nom, prenom, date_naissance, antecedents, allergies')
        .eq('id', session.patient_id)
        .maybeSingle();
      if (patient) patientContext = patient;
    }

    // Generer chaque document en parallele
    const results = await Promise.allSettled(
      docTypes.map(async (type) => {
        const systemPrompt = getSystemPrompt(type, null);
        let userMsg = `À partir de la transcription suivante, rédigez un document de type "${DOCUMENT_LABELS[type]}".`;
        if (patientContext) {
          userMsg += `\n\nContexte patient :\n- Nom : ${patientContext.nom || 'Non précisé'}\n- Prénom : ${patientContext.prenom || 'Non précisé'}\n- Date de naissance : ${patientContext.date_naissance || 'Non précisée'}\n- Antécédents : ${patientContext.antecedents || 'Non précisés'}\n- Allergies : ${patientContext.allergies || 'Aucune connue'}`;
        }
        userMsg += `\n\nTranscription :\n${fullTranscript}`;

        const text = await callClaude(systemPrompt, userMsg);
        return {
          type,
          label: DOCUMENT_LABELS[type],
          document_text: text,
          document_html: textToHtml(text, type),
          generated_at: new Date().toISOString()
        };
      })
    );

    const documents = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const errors = results
      .filter(r => r.status === 'rejected')
      .map((r, i) => ({ type: docTypes[i], error: r.reason?.message }));

    if (errors.length > 0) {
      console.warn('[ia-doc] generate-all — erreurs partielles:', errors);
    }

    console.log('[ia-doc] generate-all OK —', documents.length, 'docs pour session', sessionId);

    res.json({ documents, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.error('[ia-doc] POST /session/:id/generate-all', err.message);
    res.status(500).json({ error: 'Erreur génération documents' });
  }
});

// ===================================================================
// 9. GET /quota — Verifier quota utilisateur
// ===================================================================
router.get('/quota', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Sessions aujourd'hui
    const { count: sessionsToday } = await admin()
      .from('ia_doc_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('started_at', todayStart);

    // Sessions ce mois
    const { count: sessionsMonth } = await admin()
      .from('ia_doc_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('started_at', monthStart);

    // Estimation STT minutes ce mois (compteur approximatif via segments)
    const { data: segments } = await admin()
      .from('ia_doc_segments')
      .select('session_id')
      .in('session_id',
        admin()
          .from('ia_doc_sessions')
          .select('id')
          .eq('user_id', userId)
          .gte('started_at', monthStart)
      );

    // Approximation : chaque segment ~15 secondes en moyenne
    const sttMinutesMonth = Math.round((segments?.length || 0) * 15 / 60);

    res.json({
      sessions_today: sessionsToday || 0,
      sessions_month: sessionsMonth || 0,
      stt_minutes_month: sttMinutesMonth
    });
  } catch (err) {
    console.error('[ia-doc] GET /quota', err.message);
    res.status(500).json({ error: 'Erreur vérification quota' });
  }
});

// ===================================================================
// 10. POST /tts — Text-to-Speech via OpenAI TTS
// ===================================================================
router.post('/tts', rateLimit(), async (req, res) => {
  try {
    // Auth optionnelle pour TTS (rate-limited par IP sinon)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const { data } = await admin().auth.getUser(authHeader.slice(7));
        if (data?.user) req.user = data.user;
      } catch {
        // Ignorer — TTS accessible en rate-limited
      }
    }

    const { text, language, voice } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Texte requis' });
    }
    if (text.length > 4096) {
      return res.status(400).json({ error: 'Texte trop long (max 4096 caractères)' });
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const selectedVoice = validVoices.includes(voice) ? voice : 'nova';

    const mp3 = await openai().audio.speech.create({
      model: 'tts-1',
      voice: selectedVoice,
      input: text,
      response_format: 'mp3'
    });

    console.log('[ia-doc] tts OK — voice:', selectedVoice, 'len:', text.length);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline; filename="tts.mp3"',
      'Cache-Control': 'no-cache'
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('[ia-doc] POST /tts', err.message);
    res.status(500).json({ error: 'Erreur synthèse vocale' });
  }
});

// ===================================================================
// 11. POST /upload-media — Upload photos/radios dentaires
// ===================================================================
router.post('/upload-media', requireAuth(), rateLimit(), uploadMedia.array('media', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Au moins une image est requise (JPEG, PNG, WebP, HEIC)' });
    }

    const media = req.files.map(f => ({
      id: path.basename(f.filename, path.extname(f.filename)),
      filename: f.originalname,
      path: f.path,
      mimetype: f.mimetype,
      size: f.size
    }));

    console.log('[ia-doc] upload-media OK —', media.length, 'fichier(s)');

    res.json({ media });
  } catch (err) {
    console.error('[ia-doc] POST /upload-media', err.message);
    if (err.message?.includes('File too large') || err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image trop volumineuse (max 10 Mo)' });
    }
    res.status(500).json({ error: 'Erreur upload image' });
  }
});

// ===================================================================
// 12. POST /analyze-media — Analyse d'image dentaire via Claude Vision
// ===================================================================
router.post('/analyze-media', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { media_id, media_ids } = req.body;

    const ids = media_ids || (media_id ? [media_id] : []);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'media_id ou media_ids requis' });
    }

    const results = [];
    for (const id of ids) {
      // Find the file in /tmp/jadomi-ia-doc
      const dir = '/tmp/jadomi-ia-doc';
      let filePath = null;
      try {
        const files = fs.readdirSync(dir);
        const match = files.find(f => f.startsWith(id));
        if (match) filePath = path.join(dir, match);
      } catch (e) {
        // dir doesn't exist
      }

      if (!filePath || !fs.existsSync(filePath)) {
        results.push({ media_id: id, error: 'Image introuvable. Veuillez la télécharger à nouveau.' });
        continue;
      }

      try {
        const analysis = await analyzeImageWithVision(filePath);
        results.push({
          media_id: id,
          analysis,
          confidence: analysis.toLowerCase().includes('floue') || analysis.toLowerCase().includes('non interprétable') ? 0.3 : 0.85
        });
        console.log('[ia-doc] analyze-media OK —', id);
      } catch (err) {
        console.error('[ia-doc] analyze-media error for', id, err.message);
        results.push({ media_id: id, error: 'Erreur analyse : ' + err.message });
      }
    }

    // If single media_id was sent, return single result for backwards compat
    if (media_id && !media_ids) {
      return res.json(results[0]);
    }
    res.json({ results });
  } catch (err) {
    console.error('[ia-doc] POST /analyze-media', err.message);
    res.status(500).json({ error: 'Erreur analyse image' });
  }
});

// ===================================================================
// 13. POST /generate-certificat — Certificat médical descriptif avec photos PDF
// ===================================================================
router.post('/generate-certificat', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const {
      type, patient, cabinet, circonstances, date_accident,
      examen_clinique, soins_realises, soins_prevus, itt_jours,
      media_ids, media_analyses, transcription
    } = req.body;

    if (!type || !['certificat_initial', 'compte_rendu'].includes(type)) {
      return res.status(400).json({ error: 'Type requis : certificat_initial ou compte_rendu' });
    }
    if (!patient || !patient.nom || !patient.prenom) {
      return res.status(400).json({ error: 'Informations patient (nom, prénom) requises' });
    }

    // Build the document text via Claude
    const docType = type === 'certificat_initial' ? 'CERTIFICAT MÉDICAL INITIAL DESCRIPTIF' : 'COMPTE-RENDU DE CONSULTATION';

    const systemPrompt = `Vous êtes un chirurgien-dentiste rédacteur de documents médico-légaux. Rédigez un ${docType} professionnel, structuré et factuel. Utilisez un vocabulaire médical précis. Ne faites aucune interprétation au-delà des constatations cliniques et radiologiques fournies. Soyez exhaustif dans la description des lésions.`;

    let userMsg = `Rédigez un ${docType} avec les informations suivantes :\n\n`;
    userMsg += `PATIENT :\n- Nom : ${patient.nom}\n- Prénom : ${patient.prenom}`;
    if (patient.date_naissance) userMsg += `\n- Date de naissance : ${patient.date_naissance}`;
    if (patient.sexe) userMsg += `\n- Sexe : ${patient.sexe}`;

    if (cabinet) {
      userMsg += `\n\nCABINET :\n- ${cabinet.nom || 'Non précisé'}`;
      if (cabinet.adresse) userMsg += `\n- Adresse : ${cabinet.adresse}`;
      if (cabinet.rpps) userMsg += `\n- RPPS : ${cabinet.rpps}`;
      if (cabinet.telephone) userMsg += `\n- Tél : ${cabinet.telephone}`;
    }

    if (circonstances) userMsg += `\n\nCIRCONSTANCES DÉCLARÉES PAR LE PATIENT :\n${circonstances}`;
    if (date_accident) userMsg += `\n\nDATE DE L'ACCIDENT/ÉVÉNEMENT : ${date_accident}`;
    if (examen_clinique) userMsg += `\n\nEXAMEN CLINIQUE :\n${examen_clinique}`;

    // Include image analyses
    if (media_analyses && media_analyses.length > 0) {
      userMsg += `\n\nANALYSES RADIOLOGIQUES ET PHOTOGRAPHIQUES :`;
      media_analyses.forEach((ma, i) => {
        userMsg += `\n\n--- Image ${i + 1} ---\n${ma.analysis}`;
      });
    }

    if (soins_realises) userMsg += `\n\nSOINS RÉALISÉS :\n${soins_realises}`;
    if (soins_prevus) userMsg += `\n\nSOINS À PRÉVOIR ET ESTIMATION :\n${soins_prevus}`;
    if (itt_jours !== undefined && itt_jours !== null) userMsg += `\n\nITT PROPOSÉE : ${itt_jours} jours`;
    if (transcription) userMsg += `\n\nTRANSCRIPTION DICTÉE DU PRATICIEN :\n${transcription}`;

    userMsg += `\n\nStructurez le document avec les sections suivantes : Identité du patient, Circonstances, Examen clinique, Constatations radiologiques/photographiques, Diagnostic, Soins réalisés, Soins à prévoir (avec estimation de coût si fournie), ITT, Conclusion.`;
    userMsg += `\nTerminez par : "Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit."`;

    const documentText = await callClaude(systemPrompt, userMsg);

    // Generate PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: docType,
        Author: cabinet?.nom || 'JADOMI PRO',
        Creator: 'JADOMI IA Documentaire'
      }
    });

    // Collect PDF buffer
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    const pdfReady = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // --- PDF Content ---

    // Header: cabinet info
    if (cabinet) {
      doc.fontSize(14).font('Helvetica-Bold').text(cabinet.nom || '', { align: 'center' });
      doc.moveDown(0.3);
      if (cabinet.adresse) doc.fontSize(10).font('Helvetica').text(cabinet.adresse, { align: 'center' });
      if (cabinet.telephone) doc.fontSize(10).text('Tél : ' + cabinet.telephone, { align: 'center' });
      if (cabinet.rpps) doc.fontSize(10).text('RPPS : ' + cabinet.rpps, { align: 'center' });
      doc.moveDown(1);
      doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
      doc.moveDown(1);
    }

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text(docType, { align: 'center' });
    doc.moveDown(0.3);
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.fontSize(10).font('Helvetica').text('Date : ' + dateStr, { align: 'center' });
    doc.moveDown(1.5);

    // Document body
    const lines = documentText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        doc.moveDown(0.5);
        continue;
      }

      // Detect headings (markdown-style or all-caps sections)
      if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        const headText = trimmed.replace(/^#+\s*/, '');
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica-Bold').text(headText);
        doc.moveDown(0.3);
      } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        doc.fontSize(11).font('Helvetica-Bold').text(trimmed.replace(/\*\*/g, ''));
        doc.moveDown(0.3);
      } else if (trimmed.match(/^[A-ZÉÈÊÀÙÛÔÎÏÜ\s]{5,}:?$/)) {
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica-Bold').text(trimmed);
        doc.moveDown(0.3);
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        doc.fontSize(10).font('Helvetica').text('  ' + trimmed, { indent: 10 });
      } else {
        doc.fontSize(10).font('Helvetica').text(trimmed, { align: 'justify' });
      }
    }

    // Integrate photos/radios
    if (media_ids && media_ids.length > 0) {
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('ANNEXE — DOCUMENTS PHOTOGRAPHIQUES ET RADIOLOGIQUES', { align: 'center' });
      doc.moveDown(1);

      for (let i = 0; i < media_ids.length; i++) {
        const mid = media_ids[i];
        const dir = '/tmp/jadomi-ia-doc';
        let filePath = null;
        try {
          const files = fs.readdirSync(dir);
          const match = files.find(f => f.startsWith(mid));
          if (match) filePath = path.join(dir, match);
        } catch (e) { /* */ }

        if (filePath && fs.existsSync(filePath)) {
          // Check if we need a new page (leave room for image + caption)
          if (doc.y > 500) doc.addPage();

          try {
            doc.image(filePath, { width: 400, align: 'center' });
            doc.moveDown(0.5);
          } catch (imgErr) {
            doc.fontSize(10).font('Helvetica-Oblique').text('[Image non intégrable : ' + path.basename(filePath) + ']', { align: 'center' });
            doc.moveDown(0.5);
          }

          // Caption
          const caption = 'Document ' + (i + 1) + ' — ' + dateStr;
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#666666').text(caption, { align: 'center' });
          doc.fillColor('#000000');
          doc.moveDown(1.5);

          // Analysis text under image
          const analysis = media_analyses?.find(a => a.id === mid);
          if (analysis && analysis.analysis) {
            doc.fontSize(9).font('Helvetica').fillColor('#333333')
              .text('Analyse : ' + analysis.analysis.substring(0, 500) + (analysis.analysis.length > 500 ? '...' : ''), { align: 'justify' });
            doc.fillColor('#000000');
            doc.moveDown(1);
          }
        }
      }
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(1);
    doc.fontSize(9).font('Helvetica-Oblique')
      .text('Certificat établi à la demande de l\'intéressé(e) et remis en main propre pour faire valoir ce que de droit.', { align: 'center' });
    doc.moveDown(0.5);
    doc.text('Fait à ' + (cabinet?.adresse?.split(',').pop()?.trim() || '___________') + ', le ' + dateStr, { align: 'center' });

    // Signature space
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica').text('Signature et cachet du praticien :', { align: 'right' });
    doc.moveDown(3);
    doc.moveTo(350, doc.y).lineTo(535, doc.y).stroke('#cccccc');

    doc.end();
    const pdfBuffer = await pdfReady;

    // Save document text to DB (best effort)
    try {
      await admin().from('ia_doc_documents').insert({
        user_id: req.user.id,
        societe_id: req.societe?.id || null,
        type: type,
        patient_name: (patient.prenom + ' ' + patient.nom).trim(),
        content_text: documentText,
        created_at: new Date().toISOString()
      });
    } catch (dbErr) {
      console.warn('[ia-doc] generate-certificat — DB save warning:', dbErr.message);
    }

    console.log('[ia-doc] generate-certificat OK — type:', type, 'images:', (media_ids || []).length);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${type === 'certificat_initial' ? 'certificat-medical' : 'compte-rendu'}-${patient.nom}-${dateStr}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[ia-doc] POST /generate-certificat', err.message);
    res.status(500).json({ error: 'Erreur génération certificat' });
  }
});

// ===== Helpers =====

function textToHtml(text, type) {
  if (!text) return '';

  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Markdown-like : titres
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Gras et italique
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Listes
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Paragraphes (lignes non-vides, non-deja-taguees)
  html = html.replace(/^(?!<[hul]|<li)(.+)$/gm, '<p>$1</p>');

  // Nettoyer les lignes vides multiples
  html = html.replace(/\n{3,}/g, '\n\n');

  const label = DOCUMENT_LABELS[type] || 'Document';
  return `<div class="ia-doc ia-doc-${type}"><div class="ia-doc-header"><h2>${label}</h2><span class="ia-doc-date">${new Date().toLocaleDateString('fr-FR')}</span></div><div class="ia-doc-body">${html}</div></div>`;
}

module.exports = router;
