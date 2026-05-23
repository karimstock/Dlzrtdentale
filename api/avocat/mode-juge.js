// =============================================
// JADOMI AVOCAT EXPERT — Mode Juge CPH
// Simulation d'évaluation par un juge prud'homal
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

// === HELPERS ===
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Charge le dossier complet avec toutes ses données associées
async function chargerDossierComplet(dossierId, societeId) {
  const [
    { data: dossier },
    { data: pieces },
    { data: timeline },
    { data: contradictions },
    { data: analyses },
    { data: scoring },
    { data: documents },
    { data: memories }
  ] = await Promise.all([
    admin().from('avocat_dossiers').select('*').eq('id', dossierId).eq('avocat_societe_id', societeId).single(),
    admin().from('avocat_pieces').select('*').eq('dossier_id', dossierId).eq('societe_id', societeId),
    admin().from('avocat_timeline_events').select('*').eq('dossier_id', dossierId).order('date_evenement', { ascending: true }),
    admin().from('avocat_contradictions').select('*').eq('dossier_id', dossierId),
    admin().from('avocat_analyses').select('*').eq('dossier_id', dossierId),
    admin().from('avocat_scoring').select('*').eq('dossier_id', dossierId).order('calculated_at', { ascending: false }).limit(1).single(),
    admin().from('avocat_documents_generes').select('*').eq('dossier_id', dossierId),
    admin().from('legal_dossier_memory').select('*').eq('dossier_id', dossierId)
  ]);

  if (!dossier) return null;

  return {
    dossier,
    pieces: pieces || [],
    timeline: timeline || [],
    contradictions: contradictions || [],
    analyses: analyses || [],
    scoring: scoring || null,
    documents: documents || [],
    memories: memories || []
  };
}

// ================================================
// Critère 1 — Complétude du dispositif (20%)
// ================================================
function evaluerDispositif(data) {
  const details = {};
  let score = 0;

  // Vérifier les documents générés de type conclusions
  const conclusions = data.documents.filter(d =>
    (d.type || '').toLowerCase().includes('conclusion')
  );
  const conclusionTexte = conclusions.map(c => (c.contenu || '')).join(' ').toUpperCase();
  const analysesTexte = data.analyses.map(a => (a.contenu || a.resultat || '')).join(' ').toUpperCase();
  const texteComplet = conclusionTexte + ' ' + analysesTexte;

  // Demandes chiffrées
  const hasChiffrage = /\d+[\s.,]*€|euros?\s/i.test(texteComplet) || /\d+[\s.,]*euros/i.test(texteComplet);
  details.demandes_chiffrees = hasChiffrage;
  if (hasChiffrage) score += 25;

  // Congés payés afférents
  const hasCPAfferents = /cong[ée]s\s+pay[ée]s\s+aff[ée]rents/i.test(texteComplet);
  details.conges_payes_afferents = hasCPAfferents;
  if (hasCPAfferents) score += 25;

  // Article 700 CPC demandé
  const hasArt700 = /article\s*700/i.test(texteComplet) || /art\.\s*700/i.test(texteComplet);
  details.article_700 = hasArt700;
  if (hasArt700) score += 20;

  // PAR CES MOTIFS
  const hasParCesMotifs = /PAR\s+CES\s+MOTIFS/i.test(texteComplet);
  details.par_ces_motifs = hasParCesMotifs;
  if (hasParCesMotifs) score += 15;

  // Exécution provisoire
  const hasExecProv = /ex[ée]cution\s+provisoire/i.test(texteComplet);
  details.execution_provisoire = hasExecProv;
  if (hasExecProv) score += 15;

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 2 — Qualité du bordereau (10%)
// ================================================
function evaluerBordereau(data) {
  const details = {};
  let score = 0;

  const nbPieces = data.pieces.length;
  details.nombre_pieces = nbPieces;

  if (nbPieces === 0) {
    details.aucune_piece = true;
    return { score: 0, details };
  }

  // Pièces numérotées en continu
  const numerotees = data.pieces.filter(p => p.numero != null);
  const tauxNumerotation = numerotees.length / nbPieces;
  details.taux_numerotation = Math.round(tauxNumerotation * 100);
  score += Math.round(tauxNumerotation * 40);

  // Descriptions présentes et suffisamment longues (> 10 caractères)
  const avecDescription = data.pieces.filter(p => p.description && p.description.length > 10);
  const tauxDescription = avecDescription.length / nbPieces;
  details.taux_descriptions = Math.round(tauxDescription * 100);
  score += Math.round(tauxDescription * 30);

  // Nombre suffisant de pièces (10 pièces = référence standard)
  const bonusQuantite = clamp(Math.round((nbPieces / 10) * 30), 0, 30);
  details.bonus_quantite = bonusQuantite;
  score += bonusQuantite;

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 3 — Structure des conclusions (15%)
// ================================================
function evaluerStructureConclusions(data) {
  const details = {};
  let score = 0;

  const conclusions = data.documents.filter(d =>
    (d.type || '').toLowerCase().includes('conclusion')
  );
  const texte = conclusions.map(c => (c.contenu || '')).join(' ');

  if (!texte || texte.length < 50) {
    details.conclusions_absentes = true;
    return { score: 0, details };
  }

  details.conclusions_presentes = true;
  score += 20;

  // Plan structuré (I/, II/, III/ ou 1., 2., 3.)
  const hasStructure = /\bI[\s\/\)]/m.test(texte) && /\bII[\s\/\)]/m.test(texte);
  const hasNumStructure = /\b1[\.\)]/m.test(texte) && /\b2[\.\)]/m.test(texte) && /\b3[\.\)]/m.test(texte);
  details.plan_structure = hasStructure || hasNumStructure;
  if (hasStructure || hasNumStructure) score += 25;

  // SOUS TOUTES RESERVES
  const hasSousReserves = /SOUS\s+TOUTES?\s+R[ÉE]SERVES?/i.test(texte);
  details.sous_toutes_reserves = hasSousReserves;
  if (hasSousReserves) score += 20;

  // Longueur maîtrisée (entre 2000 et 30000 caractères = optimal)
  const longueur = texte.length;
  details.longueur_caracteres = longueur;
  if (longueur >= 2000 && longueur <= 30000) {
    details.longueur_ok = true;
    score += 20;
  } else if (longueur >= 500) {
    details.longueur_ok = false;
    score += 10;
  }

  // Titres explicites (majuscules ou gras)
  const hasTitres = /\n[A-Z][A-Z\s]{5,}/m.test(texte) || /<strong>/i.test(texte) || /\*\*[^*]+\*\*/m.test(texte);
  details.titres_explicites = hasTitres;
  if (hasTitres) score += 15;

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 4 — Qualité juridique (20%) — IA
// ================================================
async function evaluerQualiteJuridique(data) {
  const details = {};
  let score = 0;

  // Contrôle structurel : textes de loi cités
  const texteComplet = [
    ...data.documents.map(d => d.contenu || ''),
    ...data.analyses.map(a => a.contenu || a.resultat || ''),
    ...data.memories.map(m => m.contenu || '')
  ].join(' ');

  // Articles du Code du travail
  const articlesCodeTravail = texteComplet.match(/(?:article\s+)?L\.?\s*\d{4}-\d+/gi) || [];
  details.articles_code_travail = articlesCodeTravail.length;
  score += clamp(articlesCodeTravail.length * 5, 0, 25);

  // Jurisprudence citée (Cass. soc., CA, CPH)
  const jurisprudences = texteComplet.match(/Cass\.\s*soc\.|Cour\s+d['']appel|CA\s+\w+|CPH\s+\w+/gi) || [];
  details.jurisprudences_citees = jurisprudences.length;
  score += clamp(jurisprudences.length * 5, 0, 25);

  // Raisonnement syllogistique (attendu que, en conséquence, il résulte)
  const hasRaisonnement = /attendu\s+que|en\s+cons[ée]quence|il\s+r[ée]sulte|en\s+l['']esp[èe]ce|d[èe]s\s+lors/gi.test(texteComplet);
  details.raisonnement_syllogistique = hasRaisonnement;
  if (hasRaisonnement) score += 20;

  // Mémoires juridiques (legal_dossier_memory)
  const nbMemories = data.memories.length;
  details.nb_sources_juridiques = nbMemories;
  score += clamp(nbMemories * 3, 0, 15);

  // Analyses juridiques complètes
  const analysesJuridiques = data.analyses.filter(a =>
    ['analyse_complete', 'preparation_audience'].includes(a.type_analyse)
  );
  details.nb_analyses_juridiques = analysesJuridiques.length;
  score += clamp(analysesJuridiques.length * 8, 0, 15);

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 5 — Preuve des faits (15%)
// ================================================
function evaluerPreuveFaits(data) {
  const details = {};
  let score = 0;

  // Nombre d'événements de la timeline
  const nbEvents = data.timeline.length;
  details.nb_evenements_timeline = nbEvents;
  score += clamp(Math.round((nbEvents / 10) * 30), 0, 30);

  // Événements reliés à des pièces
  const eventsAvecPiece = data.timeline.filter(e => e.piece_id != null);
  const tauxLiaison = nbEvents > 0 ? eventsAvecPiece.length / nbEvents : 0;
  details.taux_liaison_pieces = Math.round(tauxLiaison * 100);
  score += Math.round(tauxLiaison * 30);

  // Chronologie sourcée (score de confiance moyen)
  const scores = data.timeline.filter(e => e.score_confiance != null).map(e => e.score_confiance);
  const moyenneConfiance = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  details.moyenne_confiance = Math.round(moyenneConfiance);
  score += clamp(Math.round(moyenneConfiance * 0.2), 0, 20);

  // Contradictions non résolues = malus
  const contradictionsNonResolues = data.contradictions.filter(c => c.statut !== 'resolu');
  const malusContradictions = contradictionsNonResolues.length * 10;
  details.contradictions_non_resolues = contradictionsNonResolues.length;
  score -= malusContradictions;

  // Pièces avec texte extrait (qualité probatoire)
  const piecesAvecTexte = data.pieces.filter(p => p.texte_extrait && p.texte_extrait.length > 0);
  const tauxOCR = data.pieces.length > 0 ? piecesAvecTexte.length / data.pieces.length : 0;
  details.taux_ocr = Math.round(tauxOCR * 100);
  score += Math.round(tauxOCR * 20);

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 6 — Chiffrage détaillé (10%)
// ================================================
function evaluerChiffrage(data) {
  const details = {};
  let score = 0;

  const texteComplet = [
    ...data.documents.map(d => d.contenu || ''),
    ...data.analyses.map(a => a.contenu || a.resultat || '')
  ].join(' ');

  // Montants en euros détectés
  const montants = texteComplet.match(/\d[\d\s.,]*\s*(?:€|euros?)/gi) || [];
  details.nb_montants = montants.length;
  score += clamp(montants.length * 5, 0, 25);

  // Calculs explicites (x * y, x × y, x mois, salaire de référence)
  const hasCalculs = /\d+\s*[x×\*]\s*\d+|salaire\s+(?:de\s+)?r[ée]f[ée]rence|base\s+de\s+calcul|soit\s+\d/gi.test(texteComplet);
  details.calculs_explicites = hasCalculs;
  if (hasCalculs) score += 25;

  // Barème Macron mentionné
  const hasBaremeMacron = /bar[èe]me\s+(?:Macron|d['']indemnisation|l[ée]gal)/i.test(texteComplet);
  details.bareme_macron = hasBaremeMacron;
  if (hasBaremeMacron) score += 20;

  // Indemnité de licenciement calculée
  const hasIndemnite = /indemnit[ée]\s+(?:de\s+)?licenciement|indemnit[ée]\s+l[ée]gale|indemnit[ée]\s+conventionnelle/i.test(texteComplet);
  details.indemnite_licenciement = hasIndemnite;
  if (hasIndemnite) score += 15;

  // Dommages et intérêts chiffrés
  const hasDI = /dommages?\s+(?:et\s+)?int[ée]r[êe]ts?/i.test(texteComplet);
  details.dommages_interets = hasDI;
  if (hasDI) score += 15;

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 7 — Présentation formelle (5%)
// ================================================
function evaluerPresentation(data) {
  const details = {};
  let score = 50; // Base : score neutre

  const nbDocuments = data.documents.length;
  details.nb_documents_generes = nbDocuments;

  // Documents générés = effort de formalisation
  if (nbDocuments >= 3) score += 25;
  else if (nbDocuments >= 1) score += 15;

  // Pièces toutes numérotées
  const toutesNumerotees = data.pieces.length > 0 && data.pieces.every(p => p.numero != null);
  details.toutes_pieces_numerotees = toutesNumerotees;
  if (toutesNumerotees) score += 25;

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// Critère 8 — Anticipation contradictoire (5%)
// ================================================
function evaluerAnticipationContradictoire(data) {
  const details = {};
  let score = 0;

  // Contradictions analysées
  const nbContradictions = data.contradictions.length;
  details.nb_contradictions_analysees = nbContradictions;
  score += clamp(nbContradictions * 10, 0, 30);

  // Contradictions résolues
  const resolues = data.contradictions.filter(c => c.statut === 'resolu');
  details.nb_contradictions_resolues = resolues.length;
  score += clamp(resolues.length * 15, 0, 40);

  // Analyse de type préparation audience (anticipe les questions du juge)
  const hasPrepAudience = data.analyses.some(a => a.type_analyse === 'preparation_audience');
  details.preparation_audience = hasPrepAudience;
  if (hasPrepAudience) score += 30;

  return { score: clamp(score, 0, 100), details };
}

// ================================================
// POST /evaluer/:dossierId — Évaluation mode juge
// ================================================
router.post('/evaluer/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const societeId = req.societeId;

    const data = await chargerDossierComplet(dossierId, societeId);
    if (!data) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    // Calculer les 8 critères
    const [
      dispositif,
      bordereau,
      structure,
      qualiteJuridique,
      preuveFaits,
      chiffrage,
      presentation,
      anticipation
    ] = await Promise.all([
      evaluerDispositif(data),
      evaluerBordereau(data),
      evaluerStructureConclusions(data),
      evaluerQualiteJuridique(data),
      evaluerPreuveFaits(data),
      evaluerChiffrage(data),
      evaluerPresentation(data),
      evaluerAnticipationContradictoire(data)
    ]);

    // Score global pondéré /100
    const scoreGlobal = Math.round(
      dispositif.score * 0.20 +
      bordereau.score * 0.10 +
      structure.score * 0.15 +
      qualiteJuridique.score * 0.20 +
      preuveFaits.score * 0.15 +
      chiffrage.score * 0.10 +
      presentation.score * 0.05 +
      anticipation.score * 0.05
    );

    // Classification des erreurs
    const erreurs_fatales = [];
    const erreurs_graves = [];
    const ameliorations = [];

    // Erreurs fatales
    if (dispositif.score < 20) {
      erreurs_fatales.push('Le dispositif est quasi inexistant : aucune demande chiffrée, pas de PAR CES MOTIFS. Le juge ne peut pas statuer.');
    }
    if (data.pieces.length === 0) {
      erreurs_fatales.push('Aucune pièce versée au dossier. Un dossier sans preuve est voué à l\'échec.');
    }
    if (!dispositif.details.article_700) {
      erreurs_graves.push('L\'article 700 du Code de procédure civile n\'est pas demandé. Vous perdez une indemnité de frais de justice.');
    }
    if (data.timeline.length === 0) {
      erreurs_fatales.push('Aucune chronologie des faits. Le juge ne peut pas reconstituer le déroulement du litige.');
    }

    // Erreurs graves
    if (!dispositif.details.conges_payes_afferents) {
      erreurs_graves.push('Les congés payés afférents ne sont pas demandés. Oubli fréquent qui réduit le montant des condamnations.');
    }
    if (structure.score < 30 && data.documents.length > 0) {
      erreurs_graves.push('Les conclusions manquent de structure. Un plan I/II/III avec des titres explicites est attendu par le CPH.');
    }
    if (bordereau.details.taux_numerotation < 80 && data.pieces.length > 0) {
      erreurs_graves.push('Les pièces ne sont pas toutes numérotées. Le bordereau doit être en numérotation continue.');
    }
    if (qualiteJuridique.details.articles_code_travail === 0) {
      erreurs_graves.push('Aucun article du Code du travail cité. Les fondements juridiques doivent être explicites (articles L.1232-1 et suivants, etc.).');
    }
    if (qualiteJuridique.details.jurisprudences_citees === 0) {
      erreurs_graves.push('Aucune jurisprudence citée. La Cour de cassation fixe les interprétations, citez les arrêts pertinents.');
    }
    if (chiffrage.score < 30) {
      erreurs_graves.push('Le chiffrage est insuffisant ou absent. Le juge doit pouvoir vérifier les bases de calcul.');
    }
    if (preuveFaits.details.contradictions_non_resolues > 0) {
      erreurs_graves.push(`${preuveFaits.details.contradictions_non_resolues} contradiction(s) non résolue(s) dans le dossier. L'adversaire les exploitera.`);
    }

    // Améliorations
    if (!dispositif.details.execution_provisoire) {
      ameliorations.push('Demander l\'exécution provisoire (article 515 du Code de procédure civile) pour obtenir le paiement immédiat.');
    }
    if (!structure.details.sous_toutes_reserves) {
      ameliorations.push('Ajouter la mention "SOUS TOUTES RESERVES" en tête des conclusions pour préserver vos droits.');
    }
    if (preuveFaits.details.taux_liaison_pieces < 50 && data.timeline.length > 0) {
      ameliorations.push('Relier chaque événement de la chronologie à une pièce justificative pour renforcer la crédibilité.');
    }
    if (!chiffrage.details.bareme_macron) {
      ameliorations.push('Citer le barème Macron (article L.1235-3 du Code du travail) pour encadrer les dommages et intérêts.');
    }
    if (anticipation.score < 50) {
      ameliorations.push('Anticiper les arguments adverses et y répondre dans les conclusions. Le juge appréciera la rigueur.');
    }
    if (preuveFaits.details.taux_ocr < 50 && data.pieces.length > 0) {
      ameliorations.push('Extraire le texte (OCR) de vos pièces pour faciliter les recherches et les citations précises.');
    }
    if (!chiffrage.details.calculs_explicites) {
      ameliorations.push('Détailler les calculs : base × coefficient × nombre de mois. Le juge doit pouvoir vérifier.');
    }

    // Verdict du juge
    let verdict_juge;
    if (scoreGlobal >= 75) {
      verdict_juge = 'Ce dossier est bien préparé. La structure, les preuves et le chiffrage sont solides. Le conseil de prud\'hommes dispose de tous les éléments pour statuer.';
    } else if (scoreGlobal >= 50) {
      verdict_juge = 'Ce dossier présente des failles. Certains éléments manquent ou sont insuffisants. Il est recommandé de le compléter avant l\'audience.';
    } else {
      verdict_juge = 'Ce dossier n\'est pas prêt pour l\'audience. Des lacunes importantes compromettent les chances de succès. Un travail de fond est nécessaire.';
    }

    return res.json({
      success: true,
      score_global: scoreGlobal,
      seuil_qualite: 75,
      criteres: {
        completude_dispositif: { poids: '20%', score: dispositif.score, details: dispositif.details },
        qualite_bordereau: { poids: '10%', score: bordereau.score, details: bordereau.details },
        structure_conclusions: { poids: '15%', score: structure.score, details: structure.details },
        qualite_juridique: { poids: '20%', score: qualiteJuridique.score, details: qualiteJuridique.details },
        preuve_faits: { poids: '15%', score: preuveFaits.score, details: preuveFaits.details },
        chiffrage_detaille: { poids: '10%', score: chiffrage.score, details: chiffrage.details },
        presentation_formelle: { poids: '5%', score: presentation.score, details: presentation.details },
        anticipation_contradictoire: { poids: '5%', score: anticipation.score, details: anticipation.details }
      },
      erreurs_fatales,
      erreurs_graves,
      ameliorations,
      verdict_juge
    });
  } catch (err) {
    console.error('[mode-juge] Erreur évaluation:', err.message);
    return res.status(500).json({ error: 'Erreur lors de l\'évaluation mode juge', details: err.message });
  }
});

// ================================================
// POST /simuler-adversaire/:dossierId — Vision avocat adverse
// ================================================
router.post('/simuler-adversaire/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const societeId = req.societeId;

    const data = await chargerDossierComplet(dossierId, societeId);
    if (!data) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    // Préparer le résumé du dossier pour l'IA
    const resumeDossier = {
      nature: data.dossier.nature || data.dossier.type_litige || 'Litige prud\'homal',
      client: data.dossier.nom_client || 'Le salarié',
      adversaire: data.dossier.nom_adversaire || 'L\'employeur',
      faits_principaux: data.timeline.slice(0, 20).map(e => ({
        date: e.date_evenement,
        description: e.description,
        confiance: e.score_confiance
      })),
      pieces_versees: data.pieces.map(p => ({
        numero: p.numero,
        description: p.description,
        importance: p.importance
      })),
      contradictions: data.contradictions.map(c => ({
        description: c.description,
        gravite: c.gravite,
        statut: c.statut
      })),
      analyses_existantes: data.analyses.map(a => ({
        type: a.type_analyse,
        resume: (a.contenu || a.resultat || '').substring(0, 500)
      })),
      scoring: data.scoring ? {
        preuves: data.scoring.score_preuves,
        coherence: data.scoring.score_coherence,
        risques: data.scoring.score_risques,
        strategie: data.scoring.score_strategie,
        global: data.scoring.score_global
      } : null
    };

    const systemPrompt = `Vous êtes un avocat expérimenté en droit du travail, spécialisé dans la défense des employeurs devant le conseil de prud'hommes. Vous analysez le dossier de la partie adverse (le salarié) pour identifier toutes les failles exploitables. Vous êtes méthodique, rigoureux et redoutable. Répondez en français avec les accents corrects, en utilisant le vouvoiement. Pas d'emoji.`;

    const userPrompt = `Vous êtes l'avocat de la partie adverse (l'employeur). Analysez ce dossier du salarié et identifiez toutes les failles exploitables.

Dossier :
${JSON.stringify(resumeDossier, null, 2)}

Identifiez :
- Les arguments que vous utiliseriez pour contrer chaque chef de demande
- Les pièces que vous contesteriez (authenticité, pertinence, force probante)
- Les contradictions que vous exploiteriez
- Les points faibles du dossier adverse
- Votre stratégie globale de défense

Répondez en JSON strict :
{
  "arguments_contre": [{"chef_de_demande": "...", "argument": "...", "base_legale": "..."}],
  "pieces_contestables": [{"piece": "...", "motif_contestation": "...", "impact": "..."}],
  "contradictions_exploitables": [{"contradiction": "...", "exploitation": "..."}],
  "points_faibles": [{"point_faible": "...", "risque": "...", "conseil_adversaire": "..."}],
  "strategie_defense": "..."
}`;

    const iaResult = await dispatch('full_analysis', systemPrompt, userPrompt);

    // Tenter de parser le JSON de la réponse IA
    let analyse;
    try {
      const resultText = iaResult.result || iaResult;
      const jsonMatch = (typeof resultText === 'string') ? resultText.match(/\{[\s\S]*\}/) : null;
      analyse = jsonMatch ? JSON.parse(jsonMatch[0]) : resultText;
    } catch {
      analyse = iaResult.result || iaResult;
    }

    return res.json({
      success: true,
      dossier_id: dossierId,
      simulation_adversaire: analyse
    });
  } catch (err) {
    console.error('[mode-juge] Erreur simulation adversaire:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la simulation adversaire', details: err.message });
  }
});

// ================================================
// POST /simuler-negociation/:dossierId — Simulation négociation
// ================================================
router.post('/simuler-negociation/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const societeId = req.societeId;
    const { montant_demande, type_rupture } = req.body || {};

    if (!montant_demande || montant_demande <= 0) {
      return res.status(400).json({ error: 'Le montant demandé est requis et doit être supérieur à 0' });
    }

    const data = await chargerDossierComplet(dossierId, societeId);
    if (!data) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    // Calcul de la fourchette réaliste via barème Macron
    const anciennete = data.dossier.anciennete_annees || 0;
    const salaireBrut = data.dossier.salaire_brut_mensuel || 0;
    const scoreGlobal = data.scoring ? data.scoring.score_global : 50;

    // Barème Macron simplifié (article L.1235-3 du Code du travail)
    // Plancher et plafond en mois de salaire brut selon ancienneté
    const baremeMacron = {
      0: { min: 0, max: 1 },
      1: { min: 1, max: 2 },
      2: { min: 3, max: 3.5 },
      3: { min: 3, max: 4 },
      4: { min: 3, max: 5 },
      5: { min: 3, max: 6 },
      6: { min: 3, max: 7 },
      7: { min: 3, max: 8 },
      8: { min: 3, max: 8 },
      9: { min: 3, max: 9 },
      10: { min: 3, max: 10 },
      11: { min: 3, max: 10.5 },
      12: { min: 3, max: 11 },
      13: { min: 3, max: 11.5 },
      14: { min: 3, max: 12 },
      15: { min: 3, max: 13 },
      16: { min: 3, max: 13.5 },
      17: { min: 3, max: 14 },
      18: { min: 3, max: 14.5 },
      19: { min: 3, max: 15 },
      20: { min: 3, max: 15.5 },
      21: { min: 3, max: 16 },
      22: { min: 3, max: 16.5 },
      23: { min: 3, max: 17 },
      24: { min: 3, max: 17.5 },
      25: { min: 3, max: 18 },
      26: { min: 3, max: 18.5 },
      27: { min: 3, max: 19 },
      28: { min: 3, max: 19.5 },
      29: { min: 3, max: 20 },
      30: { min: 3, max: 20 }
    };

    const ancienneteClamped = Math.min(Math.max(Math.round(anciennete), 0), 30);
    const bareme = baremeMacron[ancienneteClamped] || { min: 3, max: 20 };

    // Fourchette ajustée par le score de solidité
    const coefficientSolidite = scoreGlobal / 100;
    const montantPlancher = Math.round(salaireBrut * bareme.min);
    const montantPlafond = Math.round(salaireBrut * bareme.max);
    const montantRealiste = Math.round(montantPlancher + (montantPlafond - montantPlancher) * coefficientSolidite);

    const fourchette = {
      plancher_bareme: montantPlancher,
      plafond_bareme: montantPlafond,
      estimation_realiste: montantRealiste,
      anciennete_retenue: ancienneteClamped,
      salaire_brut_reference: salaireBrut,
      coefficient_solidite: coefficientSolidite
    };

    // Dispatch IA pour la stratégie de négociation
    const systemPrompt = `Vous êtes un avocat médiateur spécialisé en négociations prud'homales. Vous analysez un dossier pour proposer une stratégie de négociation réaliste et concrète. Répondez en français avec les accents corrects, en utilisant le vouvoiement. Pas d'emoji.`;

    const userPrompt = `Analysez ce dossier pour une simulation de négociation transactionnelle.

Type de rupture : ${type_rupture || 'Non précisé'}
Montant demandé par le salarié : ${montant_demande} euros
Ancienneté : ${ancienneteClamped} ans
Salaire brut mensuel : ${salaireBrut} euros
Barème Macron applicable : plancher ${bareme.min} mois / plafond ${bareme.max} mois
Fourchette en euros : ${montantPlancher} à ${montantPlafond} euros
Estimation réaliste (score solidité ${scoreGlobal}/100) : ${montantRealiste} euros
Score de solidité du dossier : ${scoreGlobal}/100

Scoring détaillé : ${data.scoring ? JSON.stringify({
  preuves: data.scoring.score_preuves,
  coherence: data.scoring.score_coherence,
  risques: data.scoring.score_risques,
  strategie: data.scoring.score_strategie
}) : 'Non disponible'}

Nombre de pièces : ${data.pieces.length}
Contradictions non résolues : ${data.contradictions.filter(c => c.statut !== 'resolu').length}

Répondez en JSON strict :
{
  "arguments_pression_salarie": ["..."],
  "arguments_pression_employeur": ["..."],
  "fourchette_negociation": {"bas": 0, "haut": 0, "optimal": 0, "justification": "..."},
  "points_blocage": [{"point": "...", "solution": "..."}],
  "courrier_proposition": "..."
}`;

    const iaResult = await dispatch('full_analysis', systemPrompt, userPrompt);

    let negociation;
    try {
      const resultText = iaResult.result || iaResult;
      const jsonMatch = (typeof resultText === 'string') ? resultText.match(/\{[\s\S]*\}/) : null;
      negociation = jsonMatch ? JSON.parse(jsonMatch[0]) : resultText;
    } catch {
      negociation = iaResult.result || iaResult;
    }

    return res.json({
      success: true,
      dossier_id: dossierId,
      fourchette_bareme_macron: fourchette,
      negociation
    });
  } catch (err) {
    console.error('[mode-juge] Erreur simulation négociation:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la simulation de négociation', details: err.message });
  }
});

// ================================================
// GET /checklist-qualite/:dossierId — Checklist rapide sans IA
// ================================================
router.get('/checklist-qualite/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const societeId = req.societeId;

    const data = await chargerDossierComplet(dossierId, societeId);
    if (!data) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    const texteConclusions = data.documents
      .filter(d => (d.type || '').toLowerCase().includes('conclusion'))
      .map(d => d.contenu || '').join(' ');

    const texteComplet = [
      texteConclusions,
      ...data.analyses.map(a => a.contenu || a.resultat || '')
    ].join(' ');

    const checklist = [
      {
        item: 'Conclusions déposées',
        statut: data.documents.some(d => (d.type || '').toLowerCase().includes('conclusion')) ? 'ok' : 'manquant',
        base_legale: 'Article R.1453-5 du Code du travail'
      },
      {
        item: 'Mention SOUS TOUTES RESERVES',
        statut: /SOUS\s+TOUTES?\s+R[ÉE]SERVES?/i.test(texteComplet) ? 'ok' : 'manquant',
        base_legale: 'Usage procédural — protection des droits du demandeur'
      },
      {
        item: 'Dispositif avec PAR CES MOTIFS',
        statut: /PAR\s+CES\s+MOTIFS/i.test(texteComplet) ? 'ok' : 'manquant',
        base_legale: 'Article 753 du Code de procédure civile'
      },
      {
        item: 'Demandes chiffrées',
        statut: /\d+[\s.,]*(?:€|euros?)/i.test(texteComplet) ? 'ok' : 'manquant',
        base_legale: 'Article 753 du Code de procédure civile — le dispositif doit récapituler les prétentions'
      },
      {
        item: 'Congés payés afférents',
        statut: /cong[ée]s\s+pay[ée]s\s+aff[ée]rents/i.test(texteComplet) ? 'ok' : 'a_verifier',
        base_legale: 'Article L.3141-22 du Code du travail'
      },
      {
        item: 'Article 700 demandé',
        statut: /article\s*700|art\.\s*700/i.test(texteComplet) ? 'ok' : 'manquant',
        base_legale: 'Article 700 du Code de procédure civile'
      },
      {
        item: 'Bordereau de pièces à jour',
        statut: data.pieces.length > 0 ? (data.pieces.every(p => p.numero != null) ? 'ok' : 'a_verifier') : 'manquant',
        base_legale: 'Article 768 du Code de procédure civile'
      },
      {
        item: 'Pièces numérotées',
        statut: data.pieces.length > 0 && data.pieces.every(p => p.numero != null) ? 'ok' : (data.pieces.length > 0 ? 'a_verifier' : 'manquant'),
        base_legale: 'Article 768 du Code de procédure civile'
      },
      {
        item: 'Exécution provisoire demandée',
        statut: /ex[ée]cution\s+provisoire/i.test(texteComplet) ? 'ok' : 'a_verifier',
        base_legale: 'Article 515 du Code de procédure civile'
      },
      {
        item: 'Intérêts légaux et capitalisation',
        statut: /int[ée]r[êe]ts?\s+(?:au\s+taux\s+)?l[ée]ga(?:l|ux)/i.test(texteComplet) || /capitalisation/i.test(texteComplet) ? 'ok' : 'a_verifier',
        base_legale: 'Articles 1231-7 du Code civil et 1343-2 du Code civil (anatocisme)'
      }
    ];

    const nbOk = checklist.filter(c => c.statut === 'ok').length;
    const nbManquant = checklist.filter(c => c.statut === 'manquant').length;
    const nbAVerifier = checklist.filter(c => c.statut === 'a_verifier').length;

    return res.json({
      success: true,
      dossier_id: dossierId,
      checklist,
      resume: {
        total: checklist.length,
        ok: nbOk,
        manquant: nbManquant,
        a_verifier: nbAVerifier,
        score_completion: Math.round((nbOk / checklist.length) * 100)
      }
    });
  } catch (err) {
    console.error('[mode-juge] Erreur checklist qualité:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la vérification de la checklist', details: err.message });
  }
});

module.exports = router;
