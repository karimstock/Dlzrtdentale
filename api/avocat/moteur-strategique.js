// =============================================
// JADOMI AVOCAT EXPERT — Moteur d'intelligence stratégique prud'homale
// Contexte enrichi, preuves structurées, stratégies, issues, post-mortem,
// patterns cabinet, statistiques globales, vue complète dossier vivant
// =============================================
'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// === SINGLETON SUPABASE ADMIN ===
let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
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
      const { data: role } = await admin()
        .from('user_societe_roles')
        .select('societe_id')
        .eq('user_id', user.id)
        .eq('societe_id', societeId)
        .single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin()
        .from('user_societe_roles')
        .select('societe_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

// === HELPERS FICHIERS LOCAUX (fallback si tables SQL absentes) ===
const STRAT_DIR = path.join(__dirname, '../../data/strategique');
try { fs.mkdirSync(STRAT_DIR, { recursive: true }); } catch {}

/**
 * Retourne le chemin du fichier JSON local pour un type / dossier
 * Types : contexte | preuves | strategies | issue | post_mortem | patterns
 */
function localPath(type, societeId, dossierId) {
  const dir = dossierId
    ? path.join(STRAT_DIR, societeId, dossierId)
    : path.join(STRAT_DIR, societeId);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, `${type}.json`);
}

function readLocal(type, societeId, dossierId) {
  try {
    return JSON.parse(fs.readFileSync(localPath(type, societeId, dossierId), 'utf8'));
  } catch {
    return null;
  }
}

function writeLocal(type, societeId, dossierId, data) {
  fs.writeFileSync(localPath(type, societeId, dossierId), JSON.stringify(data, null, 2));
}

function genId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

// =========================================================
// SECTION 1 — CONTEXTE ENRICHI DU DOSSIER
// =========================================================

/**
 * PATCH /dossier/:dossierId/contexte
 * Met à jour les champs stratégiques du dossier
 */
router.patch('/dossier/:dossierId/contexte', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      type_contentieux, statut_salarie, type_employeur, taille_entreprise,
      secteur_activite, poste_occupe, historique_relationnel,
      convention_collective, section_cph, stade_procedural,
      salaire_brut, anciennete_mois, grade, avocat_adverse, strategie_principale
    } = req.body || {};

    const champs = {
      type_contentieux: type_contentieux || null,
      statut_salarie: statut_salarie || null,
      type_employeur: type_employeur || null,
      taille_entreprise: taille_entreprise || null,
      secteur_activite: secteur_activite || null,
      poste_occupe: poste_occupe || null,
      historique_relationnel: historique_relationnel || null,
      convention_collective: convention_collective || null,
      section_cph: section_cph || null,
      stade_procedural: stade_procedural || null,
      salaire_brut: salaire_brut != null ? parseFloat(salaire_brut) : null,
      anciennete_mois: anciennete_mois != null ? parseInt(anciennete_mois, 10) : null,
      grade: grade || null,
      avocat_adverse: avocat_adverse || null,
      strategie_principale: strategie_principale || null,
      contexte_updated_at: now()
    };

    let result = null;
    try {
      const { data, error } = await admin()
        .from('avocat_dossiers')
        .update(champs)
        .eq('id', dossierId)
        .eq('avocat_societe_id', req.societeId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } catch (dbErr) {
      console.warn('[moteur-strategique/contexte/patch] DB fallback local:', dbErr.message);
      const existing = readLocal('contexte', req.societeId, dossierId) || {};
      result = { ...existing, ...champs, id: dossierId, avocat_societe_id: req.societeId };
      writeLocal('contexte', req.societeId, dossierId, result);
    }

    return res.json({ contexte: result, message: 'Contexte stratégique mis à jour.' });
  } catch (err) {
    console.error('[moteur-strategique/contexte/patch]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /dossier/:dossierId/contexte
 * Retourne le contexte complet du dossier
 */
router.get('/dossier/:dossierId/contexte', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    let contexte = null;

    try {
      const { data, error } = await admin()
        .from('avocat_dossiers')
        .select(`
          id, titre, reference, numero_rg, statut,
          type_contentieux, statut_salarie, type_employeur, taille_entreprise,
          secteur_activite, poste_occupe, historique_relationnel,
          convention_collective, section_cph, stade_procedural,
          salaire_brut, anciennete_mois, grade, avocat_adverse,
          strategie_principale, contexte_updated_at,
          nom_employeur, date_entree, date_sortie, motif_rupture
        `)
        .eq('id', dossierId)
        .eq('avocat_societe_id', req.societeId)
        .single();
      if (!error) contexte = data;
    } catch {}

    if (!contexte) contexte = readLocal('contexte', req.societeId, dossierId);
    if (!contexte) return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });

    return res.json({ contexte });
  } catch (err) {
    console.error('[moteur-strategique/contexte/get]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 2 — PREUVES STRUCTURÉES
// =========================================================

/**
 * POST /dossier/:dossierId/preuves
 * Ajouter une preuve structurée
 */
router.post('/dossier/:dossierId/preuves', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      type_preuve, date_preuve, auteur, resume,
      force_probatoire, axe_strategique, statut, notes
    } = req.body || {};

    if (!type_preuve) return res.status(400).json({ error: 'type_preuve est requis' });

    const payload = {
      id: genId(),
      societe_id: req.societeId,
      dossier_id: dossierId,
      type_preuve,
      date_preuve: date_preuve || null,
      auteur: auteur || null,
      resume: resume || null,
      force_probatoire: force_probatoire || 'moyenne',
      axe_strategique: axe_strategique || null,
      statut: statut || 'a_verifier',
      notes: notes || null,
      created_at: now(),
      updated_at: now()
    };

    let result = payload;
    try {
      const { data, error } = await admin()
        .from('avocat_preuves')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } catch (dbErr) {
      console.warn('[moteur-strategique/preuves/post] DB fallback local:', dbErr.message);
      const liste = readLocal('preuves', req.societeId, dossierId) || [];
      liste.push(payload);
      writeLocal('preuves', req.societeId, dossierId, liste);
    }

    return res.status(201).json({ preuve: result, message: 'Preuve ajoutée avec succès.' });
  } catch (err) {
    console.error('[moteur-strategique/preuves/post]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /dossier/:dossierId/preuves
 * Liste des preuves d'un dossier
 */
router.get('/dossier/:dossierId/preuves', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    let preuves = null;

    try {
      const { data, error } = await admin()
        .from('avocat_preuves')
        .select('*')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .order('created_at', { ascending: false });
      if (!error) preuves = data;
    } catch {}

    if (!preuves) preuves = readLocal('preuves', req.societeId, dossierId) || [];

    return res.json({ preuves, nb: preuves.length });
  } catch (err) {
    console.error('[moteur-strategique/preuves/list]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * PATCH /preuves/:preuveId
 * Modifier une preuve (force_probatoire, statut, axe)
 */
router.patch('/preuves/:preuveId', requireAvocat, async (req, res) => {
  try {
    const { preuveId } = req.params;
    const champs = { updated_at: now() };
    const modifiables = [
      'type_preuve', 'date_preuve', 'auteur', 'resume',
      'force_probatoire', 'axe_strategique', 'statut', 'notes'
    ];
    modifiables.forEach(k => {
      if (req.body[k] !== undefined) champs[k] = req.body[k];
    });

    let result = null;
    try {
      const { data, error } = await admin()
        .from('avocat_preuves')
        .update(champs)
        .eq('id', preuveId)
        .eq('societe_id', req.societeId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } catch (dbErr) {
      console.warn('[moteur-strategique/preuves/patch] DB fallback local:', dbErr.message);
      // Chercher dans tous les dossiers locaux
      const dossierId = req.query.dossier_id || req.body.dossier_id;
      if (dossierId) {
        const liste = readLocal('preuves', req.societeId, dossierId) || [];
        const idx = liste.findIndex(p => p.id === preuveId);
        if (idx !== -1) {
          liste[idx] = { ...liste[idx], ...champs };
          writeLocal('preuves', req.societeId, dossierId, liste);
          result = liste[idx];
        }
      }
    }

    if (!result) return res.status(404).json({ error: 'Preuve introuvable' });
    return res.json({ preuve: result, message: 'Preuve mise à jour.' });
  } catch (err) {
    console.error('[moteur-strategique/preuves/patch]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * DELETE /preuves/:preuveId
 * Supprimer une preuve
 */
router.delete('/preuves/:preuveId', requireAvocat, async (req, res) => {
  try {
    const { preuveId } = req.params;

    try {
      const { error } = await admin()
        .from('avocat_preuves')
        .delete()
        .eq('id', preuveId)
        .eq('societe_id', req.societeId);
      if (error) throw error;
    } catch (dbErr) {
      console.warn('[moteur-strategique/preuves/delete] DB fallback local:', dbErr.message);
      const dossierId = req.query.dossier_id || req.body.dossier_id;
      if (dossierId) {
        const liste = (readLocal('preuves', req.societeId, dossierId) || []).filter(p => p.id !== preuveId);
        writeLocal('preuves', req.societeId, dossierId, liste);
      }
    }

    return res.json({ message: 'Preuve supprimée.' });
  } catch (err) {
    console.error('[moteur-strategique/preuves/delete]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 3 — STRATÉGIES PAR DOSSIER
// =========================================================

/**
 * POST /dossier/:dossierId/strategies
 * Ajouter une stratégie
 */
router.post('/dossier/:dossierId/strategies', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      rang, type_strategie, objectif, arguments: args,
      risques, solidite, issue_attendue
    } = req.body || {};

    if (!type_strategie) return res.status(400).json({ error: 'type_strategie est requis' });

    const rangsValides = ['principale', 'secondaire', 'abandonnee', 'adverse'];
    if (rang && !rangsValides.includes(rang)) {
      return res.status(400).json({ error: 'rang invalide. Valeurs : principale, secondaire, abandonnee, adverse' });
    }

    const payload = {
      id: genId(),
      societe_id: req.societeId,
      dossier_id: dossierId,
      rang: rang || 'secondaire',
      type_strategie,
      objectif: objectif || null,
      arguments: args || null,
      risques: risques || null,
      solidite: solidite != null ? parseInt(solidite, 10) : null,
      issue_attendue: issue_attendue || null,
      created_at: now(),
      updated_at: now()
    };

    let result = payload;
    try {
      const { data, error } = await admin()
        .from('avocat_strategies')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } catch (dbErr) {
      console.warn('[moteur-strategique/strategies/post] DB fallback local:', dbErr.message);
      const liste = readLocal('strategies', req.societeId, dossierId) || [];
      liste.push(payload);
      writeLocal('strategies', req.societeId, dossierId, liste);
    }

    return res.status(201).json({ strategie: result, message: 'Stratégie ajoutée avec succès.' });
  } catch (err) {
    console.error('[moteur-strategique/strategies/post]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /dossier/:dossierId/strategies
 * Liste des stratégies d'un dossier
 */
router.get('/dossier/:dossierId/strategies', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    let strategies = null;

    try {
      const { data, error } = await admin()
        .from('avocat_strategies')
        .select('*')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .order('rang')
        .order('created_at', { ascending: true });
      if (!error) strategies = data;
    } catch {}

    if (!strategies) strategies = readLocal('strategies', req.societeId, dossierId) || [];

    return res.json({ strategies, nb: strategies.length });
  } catch (err) {
    console.error('[moteur-strategique/strategies/list]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * PATCH /strategies/:strategieId
 * Modifier une stratégie
 */
router.patch('/strategies/:strategieId', requireAvocat, async (req, res) => {
  try {
    const { strategieId } = req.params;
    const champs = { updated_at: now() };
    const modifiables = [
      'rang', 'type_strategie', 'objectif', 'arguments',
      'risques', 'solidite', 'issue_attendue'
    ];
    modifiables.forEach(k => {
      if (req.body[k] !== undefined) champs[k] = req.body[k];
    });

    let result = null;
    try {
      const { data, error } = await admin()
        .from('avocat_strategies')
        .update(champs)
        .eq('id', strategieId)
        .eq('societe_id', req.societeId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } catch (dbErr) {
      console.warn('[moteur-strategique/strategies/patch] DB fallback local:', dbErr.message);
      const dossierId = req.query.dossier_id || req.body.dossier_id;
      if (dossierId) {
        const liste = readLocal('strategies', req.societeId, dossierId) || [];
        const idx = liste.findIndex(s => s.id === strategieId);
        if (idx !== -1) {
          liste[idx] = { ...liste[idx], ...champs };
          writeLocal('strategies', req.societeId, dossierId, liste);
          result = liste[idx];
        }
      }
    }

    if (!result) return res.status(404).json({ error: 'Stratégie introuvable' });
    return res.json({ strategie: result, message: 'Stratégie mise à jour.' });
  } catch (err) {
    console.error('[moteur-strategique/strategies/patch]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * DELETE /strategies/:strategieId
 * Supprimer une stratégie
 */
router.delete('/strategies/:strategieId', requireAvocat, async (req, res) => {
  try {
    const { strategieId } = req.params;

    try {
      const { error } = await admin()
        .from('avocat_strategies')
        .delete()
        .eq('id', strategieId)
        .eq('societe_id', req.societeId);
      if (error) throw error;
    } catch (dbErr) {
      console.warn('[moteur-strategique/strategies/delete] DB fallback local:', dbErr.message);
      const dossierId = req.query.dossier_id || req.body.dossier_id;
      if (dossierId) {
        const liste = (readLocal('strategies', req.societeId, dossierId) || []).filter(s => s.id !== strategieId);
        writeLocal('strategies', req.societeId, dossierId, liste);
      }
    }

    return res.json({ message: 'Stratégie supprimée.' });
  } catch (err) {
    console.error('[moteur-strategique/strategies/delete]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 4 — ISSUE FINALE
// =========================================================

/**
 * POST /dossier/:dossierId/issue
 * Créer ou mettre à jour l'issue (upsert)
 */
router.post('/dossier/:dossierId/issue', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      resultat_global, montant_demande, montant_negocie,
      montant_obtenu, montant_transactionnel, montant_condamne,
      article_700, rappels_salaire, dommages_interets,
      resultat_par_axe, date_issue, notes
    } = req.body || {};

    const payload = {
      societe_id: req.societeId,
      dossier_id: dossierId,
      resultat_global: resultat_global || null,
      montant_demande: montant_demande != null ? parseFloat(montant_demande) : null,
      montant_negocie: montant_negocie != null ? parseFloat(montant_negocie) : null,
      montant_obtenu: montant_obtenu != null ? parseFloat(montant_obtenu) : null,
      montant_transactionnel: montant_transactionnel != null ? parseFloat(montant_transactionnel) : null,
      montant_condamne: montant_condamne != null ? parseFloat(montant_condamne) : null,
      article_700: article_700 != null ? parseFloat(article_700) : null,
      rappels_salaire: rappels_salaire != null ? parseFloat(rappels_salaire) : null,
      dommages_interets: dommages_interets != null ? parseFloat(dommages_interets) : null,
      resultat_par_axe: resultat_par_axe || null,
      date_issue: date_issue || null,
      notes: notes || null,
      updated_at: now()
    };

    let result = null;
    try {
      // Upsert : chercher d'abord
      const { data: existing } = await admin()
        .from('avocat_issues')
        .select('id')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .single();

      if (existing) {
        const { data, error } = await admin()
          .from('avocat_issues')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await admin()
          .from('avocat_issues')
          .insert({ ...payload, id: genId(), created_at: now() })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
    } catch (dbErr) {
      console.warn('[moteur-strategique/issue/post] DB fallback local:', dbErr.message);
      const existing = readLocal('issue', req.societeId, dossierId);
      result = {
        ...(existing || {}),
        ...payload,
        id: (existing && existing.id) || genId(),
        created_at: (existing && existing.created_at) || now()
      };
      writeLocal('issue', req.societeId, dossierId, result);
    }

    return res.status(200).json({ issue: result, message: 'Issue finale enregistrée.' });
  } catch (err) {
    console.error('[moteur-strategique/issue/post]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /dossier/:dossierId/issue
 * Retourner l'issue finale
 */
router.get('/dossier/:dossierId/issue', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    let issue = null;

    try {
      const { data, error } = await admin()
        .from('avocat_issues')
        .select('*')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .single();
      if (!error) issue = data;
    } catch {}

    if (!issue) issue = readLocal('issue', req.societeId, dossierId);

    return res.json({ issue: issue || null });
  } catch (err) {
    console.error('[moteur-strategique/issue/get]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 5 — IMPORT DÉCISION
// =========================================================

/**
 * Extrait les montants d'un texte de décision judiciaire
 */
function parseMontantsDecision(texte) {
  const montants = {};
  if (!texte) return montants;

  // Regex principales
  const patterns = [
    // "condamne à payer X euros à titre de Y"
    { re: /condamne?\s+(?:\w+\s+)?à\s+payer\s+([\d\s,.]+)\s*(?:euros?|€)\s*(?:bruts?|nets?|ttc)?\s*(?:à\s+titre\s+de\s+)?([^,;\n]+)/gi, key: null },
    // "à titre de licenciement sans cause réelle X €"
    { re: /à\s+titre\s+de\s+([^:,;\n]+)\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: null },
    // "article 700 : X €"
    { re: /article\s+700\s*(?:du\s+code\s+de\s+procédure\s+civile)?\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: 'article_700' },
    // "dommages et intérêts X €"
    { re: /dommages[- ]et[- ]intérêts?\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: 'dommages_interets' },
    // "rappel de salaire X €"
    { re: /rappels?\s+de\s+salaire\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: 'rappels_salaire' },
    // "indemnité de licenciement X €"
    { re: /indemnité\s+(?:légale\s+)?de\s+licenciement\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: 'indemnite_licenciement' },
    // "indemnité compensatrice de préavis X €"
    { re: /indemnité\s+compensatrice\s+de\s+préavis\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: 'indemnite_preavis' },
    // "indemnités compensatrice de congés payés X €"
    { re: /indemnité\s+(?:compensatrice\s+)?de\s+congés\s+payés?\s*[,:]\s*([\d\s,.]+)\s*(?:euros?|€)/gi, key: 'indemnite_conges' }
  ];

  let totalObtenu = 0;

  for (const { re, key } of patterns) {
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(texte)) !== null) {
      const montantStr = key
        ? match[1].replace(/\s/g, '').replace(',', '.')
        : match[1].replace(/\s/g, '').replace(',', '.');
      const montant = parseFloat(montantStr);
      if (!isNaN(montant) && montant > 0) {
        if (key) {
          montants[key] = (montants[key] || 0) + montant;
        } else {
          const chef = (match[2] || '').trim().substring(0, 80);
          if (!montants.details) montants.details = [];
          montants.details.push({ chef, montant });
          totalObtenu += montant;
        }
      }
    }
  }

  if (totalObtenu > 0) montants.montant_obtenu_total = totalObtenu;

  return montants;
}

/**
 * POST /dossier/:dossierId/import-decision
 * Importer un jugement/arrêt/protocole et extraire les montants
 */
router.post('/dossier/:dossierId/import-decision', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      decision_type, decision_texte, decision_juridiction,
      decision_date, decision_numero
    } = req.body || {};

    if (!decision_type) return res.status(400).json({ error: 'decision_type est requis' });
    if (!decision_texte) return res.status(400).json({ error: 'decision_texte est requis' });

    const typesValides = ['jugement_cph', 'arret_ca', 'protocole_transactionnel'];
    if (!typesValides.includes(decision_type)) {
      return res.status(400).json({ error: 'decision_type invalide. Valeurs : jugement_cph, arret_ca, protocole_transactionnel' });
    }

    // Extraire les montants du texte
    const montantsExtraits = parseMontantsDecision(decision_texte);

    // Déterminer le résultat global basé sur le texte
    const textLower = decision_texte.toLowerCase();
    let resultat_global = 'inconnu';
    if (textLower.includes('déboute') || textLower.includes('rejette')) {
      resultat_global = 'perdu';
    } else if (textLower.includes('condamne') || textLower.includes('alloue')) {
      resultat_global = 'gagne';
    } else if (decision_type === 'protocole_transactionnel') {
      resultat_global = 'transaction';
    }

    // Construire le payload d'issue à partir des montants extraits
    const issuePayload = {
      societe_id: req.societeId,
      dossier_id: dossierId,
      resultat_global,
      montant_obtenu: montantsExtraits.montant_obtenu_total || null,
      article_700: montantsExtraits.article_700 || null,
      rappels_salaire: montantsExtraits.rappels_salaire || null,
      dommages_interets: montantsExtraits.dommages_interets || null,
      resultat_par_axe: montantsExtraits.details
        ? montantsExtraits.details.reduce((acc, d) => { acc[d.chef] = d.montant; return acc; }, {})
        : null,
      date_issue: decision_date || null,
      notes: `Importé depuis ${decision_type}${decision_numero ? ' n° ' + decision_numero : ''}${decision_juridiction ? ' — ' + decision_juridiction : ''}`,
      updated_at: now()
    };

    // Upsert l'issue
    let issue = null;
    try {
      const { data: existing } = await admin()
        .from('avocat_issues')
        .select('id')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .single();

      if (existing) {
        const { data, error } = await admin()
          .from('avocat_issues')
          .update(issuePayload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        issue = data;
      } else {
        const { data, error } = await admin()
          .from('avocat_issues')
          .insert({ ...issuePayload, id: genId(), created_at: now() })
          .select()
          .single();
        if (error) throw error;
        issue = data;
      }
    } catch (dbErr) {
      console.warn('[moteur-strategique/import-decision] DB fallback local:', dbErr.message);
      const existing = readLocal('issue', req.societeId, dossierId);
      issue = {
        ...(existing || {}),
        ...issuePayload,
        id: (existing && existing.id) || genId(),
        created_at: (existing && existing.created_at) || now()
      };
      writeLocal('issue', req.societeId, dossierId, issue);
    }

    return res.status(200).json({
      issue,
      montants_extraits: montantsExtraits,
      message: `Décision importée. ${Object.keys(montantsExtraits).length} élément(s) financier(s) détecté(s).`
    });
  } catch (err) {
    console.error('[moteur-strategique/import-decision]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 6 — POST-MORTEM
// =========================================================

/**
 * Génère un résumé automatique et un pattern abstrait anonymisé
 */
function genererResumeEtPattern(body, dossierId) {
  const {
    type_contentieux, taille_entreprise, secteur_activite,
    strategie_efficace, preuve_decisive, enseignement_principal,
    negociation_preferable, juridiction_favorable
  } = body;

  const resume = [
    type_contentieux ? `Contentieux : ${type_contentieux}.` : null,
    strategie_efficace ? `Stratégie efficace : ${strategie_efficace}.` : null,
    preuve_decisive ? `Preuve décisive : ${preuve_decisive}.` : null,
    enseignement_principal ? `Enseignement : ${enseignement_principal}.` : null
  ].filter(Boolean).join(' ');

  // Pattern abstrait — sans données personnelles
  const pattern = {
    id: genId(),
    type_contentieux: type_contentieux || null,
    taille_entreprise: taille_entreprise || null,
    secteur_activite: secteur_activite || null,
    strategie_recommandee: strategie_efficace || null,
    preuve_cle: preuve_decisive || null,
    negociation_preferable: !!negociation_preferable,
    juridiction_favorable: juridiction_favorable || null,
    enseignement: enseignement_principal || null,
    nb_dossiers_source: 1,
    // Pas de nom, email, identifiant client dans le pattern
    created_at: now()
  };

  return { resume, pattern };
}

/**
 * POST /dossier/:dossierId/post-mortem
 * Créer ou mettre à jour l'analyse post-dossier (upsert)
 */
router.post('/dossier/:dossierId/post-mortem', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const {
      ce_qui_a_fonctionne, ce_qui_a_echoue, preuve_decisive,
      preuve_manquante, strategie_efficace, strategie_inutile,
      erreurs_a_eviter, negociation_preferable, enseignement_principal,
      satisfaction, rentabilite, juridiction_favorable,
      // Pour les champs contextuels utilisés pour le pattern
      type_contentieux, taille_entreprise, secteur_activite
    } = req.body || {};

    const { resume, pattern } = genererResumeEtPattern(
      { ...req.body, type_contentieux, taille_entreprise, secteur_activite },
      dossierId
    );

    const payload = {
      societe_id: req.societeId,
      dossier_id: dossierId,
      ce_qui_a_fonctionne: ce_qui_a_fonctionne || null,
      ce_qui_a_echoue: ce_qui_a_echoue || null,
      preuve_decisive: preuve_decisive || null,
      preuve_manquante: preuve_manquante || null,
      strategie_efficace: strategie_efficace || null,
      strategie_inutile: strategie_inutile || null,
      erreurs_a_eviter: erreurs_a_eviter || null,
      negociation_preferable: negociation_preferable != null ? !!negociation_preferable : null,
      enseignement_principal: enseignement_principal || null,
      satisfaction: satisfaction != null ? parseInt(satisfaction, 10) : null,
      rentabilite: rentabilite != null ? parseInt(rentabilite, 10) : null,
      juridiction_favorable: juridiction_favorable || null,
      resume_auto: resume,
      updated_at: now()
    };

    let postMortem = null;

    try {
      // Upsert post-mortem
      const { data: existing } = await admin()
        .from('avocat_post_mortems')
        .select('id')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .single();

      if (existing) {
        const { data, error } = await admin()
          .from('avocat_post_mortems')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        postMortem = data;
      } else {
        const { data, error } = await admin()
          .from('avocat_post_mortems')
          .insert({ ...payload, id: genId(), created_at: now() })
          .select()
          .single();
        if (error) throw error;
        postMortem = data;
      }

      // Insérer le pattern anonymisé dans avocat_patterns
      try {
        const { data: patternExistant } = await admin()
          .from('avocat_patterns')
          .select('id, nb_dossiers_source')
          .eq('type_contentieux', pattern.type_contentieux)
          .eq('secteur_activite', pattern.secteur_activite)
          .eq('societe_id', req.societeId)
          .single();

        if (patternExistant) {
          // Incrémenter le compteur
          await admin()
            .from('avocat_patterns')
            .update({ nb_dossiers_source: (patternExistant.nb_dossiers_source || 1) + 1, updated_at: now() })
            .eq('id', patternExistant.id);
        } else {
          await admin()
            .from('avocat_patterns')
            .insert({ ...pattern, societe_id: req.societeId });
        }
      } catch (patErr) {
        console.warn('[moteur-strategique/post-mortem] Pattern DB:', patErr.message);
      }

    } catch (dbErr) {
      console.warn('[moteur-strategique/post-mortem] DB fallback local:', dbErr.message);
      const existing = readLocal('post_mortem', req.societeId, dossierId);
      postMortem = {
        ...(existing || {}),
        ...payload,
        id: (existing && existing.id) || genId(),
        created_at: (existing && existing.created_at) || now()
      };
      writeLocal('post_mortem', req.societeId, dossierId, postMortem);
      // Sauvegarder le pattern localement
      const patternsLocaux = readLocal('patterns', req.societeId, null) || [];
      patternsLocaux.push(pattern);
      writeLocal('patterns', req.societeId, null, patternsLocaux);
    }

    return res.status(200).json({
      post_mortem: postMortem,
      pattern_genere: pattern,
      message: 'Post-mortem enregistré. Pattern cabinet mis à jour.'
    });
  } catch (err) {
    console.error('[moteur-strategique/post-mortem/post]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /dossier/:dossierId/post-mortem
 * Retourner le post-mortem
 */
router.get('/dossier/:dossierId/post-mortem', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    let postMortem = null;

    try {
      const { data, error } = await admin()
        .from('avocat_post_mortems')
        .select('*')
        .eq('dossier_id', dossierId)
        .eq('societe_id', req.societeId)
        .single();
      if (!error) postMortem = data;
    } catch {}

    if (!postMortem) postMortem = readLocal('post_mortem', req.societeId, dossierId);

    return res.json({ post_mortem: postMortem || null });
  } catch (err) {
    console.error('[moteur-strategique/post-mortem/get]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 7 — PATTERNS DU CABINET
// =========================================================

/**
 * GET /patterns
 * Liste des patterns du cabinet triés par nombre de dossiers source
 */
router.get('/patterns', requireAvocat, async (req, res) => {
  try {
    let patterns = null;

    try {
      const { data, error } = await admin()
        .from('avocat_patterns')
        .select('*')
        .eq('societe_id', req.societeId)
        .order('nb_dossiers_source', { ascending: false })
        .limit(50);
      if (!error) patterns = data;
    } catch {}

    if (!patterns) patterns = readLocal('patterns', req.societeId, null) || [];

    return res.json({ patterns, nb: patterns.length });
  } catch (err) {
    console.error('[moteur-strategique/patterns/list]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /patterns/:patternId
 * Détail d'un pattern
 */
router.get('/patterns/:patternId', requireAvocat, async (req, res) => {
  try {
    const { patternId } = req.params;
    let pattern = null;

    try {
      const { data, error } = await admin()
        .from('avocat_patterns')
        .select('*')
        .eq('id', patternId)
        .eq('societe_id', req.societeId)
        .single();
      if (!error) pattern = data;
    } catch {}

    if (!pattern) {
      const patterns = readLocal('patterns', req.societeId, null) || [];
      pattern = patterns.find(p => p.id === patternId) || null;
    }

    if (!pattern) return res.status(404).json({ error: 'Pattern introuvable' });
    return res.json({ pattern });
  } catch (err) {
    console.error('[moteur-strategique/patterns/detail]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 8 — STATISTIQUES CABINET
// =========================================================

/**
 * GET /stats
 * Statistiques globales du cabinet calculées depuis les issues + stratégies
 */
router.get('/stats', requireAvocat, async (req, res) => {
  try {
    let stats = {
      nb_dossiers_clos: 0,
      nb_dossiers_gagnes: 0,
      nb_dossiers_perdus: 0,
      nb_transactions: 0,
      taux_succes_global: 0,
      taux_transaction: 0,
      montant_moyen_obtenu: 0,
      montant_moyen_demande: 0,
      strategies_plus_efficaces: [],
      preuves_plus_efficaces: [],
      types_contentieux_frequents: []
    };

    try {
      // Issues
      const { data: issues } = await admin()
        .from('avocat_issues')
        .select('resultat_global, montant_obtenu, montant_demande')
        .eq('societe_id', req.societeId);

      if (issues && issues.length > 0) {
        stats.nb_dossiers_clos = issues.length;
        stats.nb_dossiers_gagnes = issues.filter(i => i.resultat_global === 'gagne').length;
        stats.nb_dossiers_perdus = issues.filter(i => i.resultat_global === 'perdu').length;
        stats.nb_transactions = issues.filter(i => i.resultat_global === 'transaction').length;
        stats.taux_succes_global = stats.nb_dossiers_clos > 0
          ? Math.round(((stats.nb_dossiers_gagnes + stats.nb_transactions) / stats.nb_dossiers_clos) * 100)
          : 0;
        stats.taux_transaction = stats.nb_dossiers_clos > 0
          ? Math.round((stats.nb_transactions / stats.nb_dossiers_clos) * 100)
          : 0;

        const montantsObtenus = issues.filter(i => i.montant_obtenu > 0).map(i => i.montant_obtenu);
        const montantsDemandes = issues.filter(i => i.montant_demande > 0).map(i => i.montant_demande);
        stats.montant_moyen_obtenu = montantsObtenus.length > 0
          ? Math.round(montantsObtenus.reduce((a, b) => a + b, 0) / montantsObtenus.length)
          : 0;
        stats.montant_moyen_demande = montantsDemandes.length > 0
          ? Math.round(montantsDemandes.reduce((a, b) => a + b, 0) / montantsDemandes.length)
          : 0;
      }

      // Stratégies les plus efficaces (top 5 par type dans dossiers gagnés)
      const { data: strategiesGagnees } = await admin()
        .from('avocat_strategies')
        .select('type_strategie, rang')
        .eq('societe_id', req.societeId)
        .eq('rang', 'principale');

      if (strategiesGagnees && strategiesGagnees.length > 0) {
        const compteStrategies = {};
        strategiesGagnees.forEach(s => {
          compteStrategies[s.type_strategie] = (compteStrategies[s.type_strategie] || 0) + 1;
        });
        stats.strategies_plus_efficaces = Object.entries(compteStrategies)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, nb]) => ({ type_strategie: type, nb_utilisations: nb }));
      }

      // Preuves les plus efficaces (top 5 types dans dossiers du cabinet)
      const { data: preuves } = await admin()
        .from('avocat_preuves')
        .select('type_preuve, force_probatoire')
        .eq('societe_id', req.societeId)
        .eq('statut', 'validee');

      if (preuves && preuves.length > 0) {
        const comptePreuves = {};
        preuves.forEach(p => {
          comptePreuves[p.type_preuve] = (comptePreuves[p.type_preuve] || 0) + 1;
        });
        stats.preuves_plus_efficaces = Object.entries(comptePreuves)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, nb]) => ({ type_preuve: type, nb_utilisations: nb }));
      }

      // Types de contentieux fréquents (depuis patterns)
      const { data: patterns } = await admin()
        .from('avocat_patterns')
        .select('type_contentieux, nb_dossiers_source')
        .eq('societe_id', req.societeId);

      if (patterns && patterns.length > 0) {
        const compteContentieux = {};
        patterns.forEach(p => {
          if (p.type_contentieux) {
            compteContentieux[p.type_contentieux] = (compteContentieux[p.type_contentieux] || 0) + (p.nb_dossiers_source || 1);
          }
        });
        stats.types_contentieux_frequents = Object.entries(compteContentieux)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([type, nb]) => ({ type_contentieux: type, nb_dossiers: nb }));
      }

    } catch (dbErr) {
      console.warn('[moteur-strategique/stats] DB indisponible, stats partielles:', dbErr.message);
    }

    return res.json({ stats, calcule_le: now() });
  } catch (err) {
    console.error('[moteur-strategique/stats]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 9 — VUE COMPLÈTE DOSSIER (DOSSIER VIVANT)
// =========================================================

/**
 * GET /dossier/:dossierId/complet
 * Retourne tout d'un coup : contexte, preuves, stratégies, issue, post-mortem, patterns similaires
 */
router.get('/dossier/:dossierId/complet', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Charger tout en parallèle
    const [
      contexteResult,
      preuvesResult,
      strategiesResult,
      issueResult,
      postMortemResult
    ] = await Promise.allSettled([
      // Contexte
      (async () => {
        try {
          const { data, error } = await admin()
            .from('avocat_dossiers')
            .select('*')
            .eq('id', dossierId)
            .eq('avocat_societe_id', req.societeId)
            .single();
          if (!error) return data;
        } catch {}
        return readLocal('contexte', req.societeId, dossierId);
      })(),

      // Preuves
      (async () => {
        try {
          const { data, error } = await admin()
            .from('avocat_preuves')
            .select('*')
            .eq('dossier_id', dossierId)
            .eq('societe_id', req.societeId)
            .order('created_at', { ascending: false });
          if (!error) return data;
        } catch {}
        return readLocal('preuves', req.societeId, dossierId) || [];
      })(),

      // Stratégies
      (async () => {
        try {
          const { data, error } = await admin()
            .from('avocat_strategies')
            .select('*')
            .eq('dossier_id', dossierId)
            .eq('societe_id', req.societeId)
            .order('rang');
          if (!error) return data;
        } catch {}
        return readLocal('strategies', req.societeId, dossierId) || [];
      })(),

      // Issue
      (async () => {
        try {
          const { data, error } = await admin()
            .from('avocat_issues')
            .select('*')
            .eq('dossier_id', dossierId)
            .eq('societe_id', req.societeId)
            .single();
          if (!error) return data;
        } catch {}
        return readLocal('issue', req.societeId, dossierId);
      })(),

      // Post-mortem
      (async () => {
        try {
          const { data, error } = await admin()
            .from('avocat_post_mortems')
            .select('*')
            .eq('dossier_id', dossierId)
            .eq('societe_id', req.societeId)
            .single();
          if (!error) return data;
        } catch {}
        return readLocal('post_mortem', req.societeId, dossierId);
      })()
    ]);

    const contexte = contexteResult.status === 'fulfilled' ? contexteResult.value : null;
    const preuves = preuvesResult.status === 'fulfilled' ? (preuvesResult.value || []) : [];
    const strategies = strategiesResult.status === 'fulfilled' ? (strategiesResult.value || []) : [];
    const issue = issueResult.status === 'fulfilled' ? issueResult.value : null;
    const postMortem = postMortemResult.status === 'fulfilled' ? postMortemResult.value : null;

    if (!contexte) return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });

    // Chercher des patterns similaires (même type de contentieux)
    let patternsSimilaires = [];
    try {
      if (contexte.type_contentieux) {
        const { data: pats } = await admin()
          .from('avocat_patterns')
          .select('*')
          .eq('societe_id', req.societeId)
          .eq('type_contentieux', contexte.type_contentieux)
          .order('nb_dossiers_source', { ascending: false })
          .limit(3);
        patternsSimilaires = pats || [];
      }
    } catch {}

    if (patternsSimilaires.length === 0 && contexte.type_contentieux) {
      const pats = readLocal('patterns', req.societeId, null) || [];
      patternsSimilaires = pats
        .filter(p => p.type_contentieux === contexte.type_contentieux)
        .slice(0, 3);
    }

    return res.json({
      dossier_id: dossierId,
      contexte,
      preuves,
      strategies,
      issue,
      post_mortem: postMortem,
      patterns_similaires: patternsSimilaires,
      meta: {
        nb_preuves: preuves.length,
        nb_strategies: strategies.length,
        a_issue: !!issue,
        a_post_mortem: !!postMortem,
        charge_le: now()
      }
    });
  } catch (err) {
    console.error('[moteur-strategique/complet]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
