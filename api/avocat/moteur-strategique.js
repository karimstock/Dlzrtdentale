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

// === MISTRAL IA (RGPD — données restent en UE) ===
let _mistral = null;
function getMistral() {
  if (!_mistral && process.env.MISTRAL_API_KEY) {
    const { Mistral } = require('@mistralai/mistralai');
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}

/**
 * Appel Mistral avec system + user prompt, retourne texte ou JSON
 * Toutes les données sensibles restent en UE (serveurs Mistral Paris)
 */
async function callMistralStrategique(systemPrompt, userPrompt, options = {}) {
  const client = getMistral();
  if (!client) return null; // Fallback si pas de clé

  try {
    const resp = await client.chat.complete({
      model: options.model || 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxTokens: options.maxTokens || 1500,
      temperature: options.temperature ?? 0.3,
      responseFormat: options.json ? { type: 'json_object' } : undefined
    });
    const content = resp.choices?.[0]?.message?.content || '';
    if (options.json) {
      try { return JSON.parse(content); } catch { return null; }
    }
    return content;
  } catch (err) {
    console.warn('[mistral-strategique] Erreur:', err.message);
    return null;
  }
}

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

    // Extraire les montants — d'abord Mistral (intelligent), fallback regex
    let montantsExtraits = null;
    let resultat_global = 'inconnu';
    let analyse_ia = null;

    // Tentative Mistral (RGPD — données restent en UE)
    const mistralResult = await callMistralStrategique(
      `Tu es un assistant juridique français spécialisé en droit du travail prud'homal.
Tu analyses des décisions de justice (jugements CPH, arrêts CA) ou des protocoles transactionnels.
Tu dois extraire TOUS les montants alloués/convenus, chef par chef.
Tu dois déterminer si le salarié a gagné, perdu, ou obtenu un accord partiel.
Réponds UNIQUEMENT en JSON valide, sans commentaire.`,
      `Analyse cette décision (${decision_type}) et extrais les montants :

${decision_texte.substring(0, 6000)}

Réponds en JSON :
{
  "resultat_global": "gagne|perdu|transaction|accord_partiel|rejet",
  "montant_total": 0,
  "article_700": 0,
  "rappels_salaire": 0,
  "dommages_interets": 0,
  "indemnite_licenciement": 0,
  "indemnite_preavis": 0,
  "conges_payes": 0,
  "heures_supplementaires": 0,
  "details": [{"chef": "...", "montant": 0, "accordé": true}],
  "motivation_cle": "résumé de la motivation principale du juge",
  "articles_vises": ["L.1235-3", "..."]
}`,
      { json: true, maxTokens: 2000 }
    );

    if (mistralResult && mistralResult.resultat_global) {
      // Mistral a réussi — utiliser ses résultats
      montantsExtraits = {
        montant_obtenu_total: mistralResult.montant_total || 0,
        article_700: mistralResult.article_700 || 0,
        rappels_salaire: mistralResult.rappels_salaire || 0,
        dommages_interets: mistralResult.dommages_interets || 0,
        indemnite_licenciement: mistralResult.indemnite_licenciement || 0,
        indemnite_preavis: mistralResult.indemnite_preavis || 0,
        conges_payes: mistralResult.conges_payes || 0,
        heures_supplementaires: mistralResult.heures_supplementaires || 0,
        details: mistralResult.details || [],
        source: 'mistral_ia'
      };
      resultat_global = mistralResult.resultat_global;
      analyse_ia = {
        motivation_cle: mistralResult.motivation_cle || null,
        articles_vises: mistralResult.articles_vises || []
      };
    } else {
      // Fallback regex
      montantsExtraits = parseMontantsDecision(decision_texte);
      montantsExtraits.source = 'regex_fallback';

      const textLower = decision_texte.toLowerCase();
      if (textLower.includes('déboute') || textLower.includes('rejette')) {
        resultat_global = 'perdu';
      } else if (textLower.includes('condamne') || textLower.includes('alloue')) {
        resultat_global = 'gagne';
      } else if (decision_type === 'protocole_transactionnel') {
        resultat_global = 'transaction';
      }
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
      analyse_ia: analyse_ia || null,
      source: montantsExtraits.source || 'regex_fallback',
      message: `Décision importée (${montantsExtraits.source === 'mistral_ia' ? 'analyse IA Mistral' : 'extraction regex'}). ${(montantsExtraits.details || []).length} chef(s) de demande détecté(s).`
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

    // Générer résumé + pattern — Mistral si disponible, sinon local
    let resume, pattern;
    const mistralPostMortem = await callMistralStrategique(
      `Tu es un assistant juridique français. Tu analyses le retour d'expérience d'un dossier prud'homal clôturé.
Tu dois produire :
1. Un résumé stratégique concis (5 lignes max)
2. Un pattern abstrait anonymisé (aucune donnée personnelle)
Réponds en JSON.`,
      `Dossier clôturé — retour d'expérience :
- Type contentieux : ${type_contentieux || 'non précisé'}
- Ce qui a fonctionné : ${JSON.stringify(ce_qui_a_fonctionne || 'non précisé')}
- Ce qui a échoué : ${JSON.stringify(ce_qui_a_echoue || 'non précisé')}
- Preuve décisive : ${preuve_decisive || 'non précisée'}
- Preuve manquante : ${preuve_manquante || 'non précisée'}
- Stratégie efficace : ${strategie_efficace || 'non précisée'}
- Stratégie inutile : ${strategie_inutile || 'non précisée'}
- Erreurs à éviter : ${erreurs_a_eviter || 'non précisées'}
- Négociation préférable : ${negociation_preferable}
- Enseignement principal : ${enseignement_principal || 'non précisé'}
- Rentabilité : ${rentabilite || 'non précisée'}

Réponds en JSON :
{
  "resume_strategique": "...",
  "pattern": {
    "type_contentieux": "...",
    "strategie_efficace": "...",
    "strategie_fragile": "...",
    "preuves_decisives": ["..."],
    "preuves_manquantes": ["..."],
    "issue_frequente": "...",
    "enseignement_cle": "...",
    "fiabilite": "fiable"
  }
}`,
      { json: true, maxTokens: 1000 }
    );

    if (mistralPostMortem && mistralPostMortem.resume_strategique) {
      resume = mistralPostMortem.resume_strategique;
      pattern = {
        id: genId(),
        source: 'cabinet',
        type_contentieux: mistralPostMortem.pattern?.type_contentieux || type_contentieux || 'autre',
        strategie_efficace: mistralPostMortem.pattern?.strategie_efficace || strategie_efficace,
        strategie_fragile: mistralPostMortem.pattern?.strategie_fragile || strategie_inutile,
        preuves_decisives: mistralPostMortem.pattern?.preuves_decisives || [],
        preuves_manquantes: mistralPostMortem.pattern?.preuves_manquantes || [],
        issue_frequente: mistralPostMortem.pattern?.issue_frequente || null,
        enseignement_cle: mistralPostMortem.pattern?.enseignement_cle || enseignement_principal,
        fiabilite: mistralPostMortem.pattern?.fiabilite || 'fiable',
        nb_dossiers_source: 1,
        created_at: now(),
        generated_by: 'mistral_ia'
      };
    } else {
      // Fallback local
      const localResult = genererResumeEtPattern(
        { ...req.body, type_contentieux, taille_entreprise, secteur_activite },
        dossierId
      );
      resume = localResult.resume;
      pattern = localResult.pattern;
    }

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

// ================================================
// POST /dossier/:dossierId/gps — GPS stratégique multi-chemins (Mistral IA)
// ================================================
router.post('/dossier/:dossierId/gps', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // 1. Charger le contexte complet du dossier
    let contexte = null;
    try {
      const { data } = await admin().from('avocat_dossiers')
        .select('*').eq('id', dossierId).single();
      contexte = data;
    } catch {}
    if (!contexte) contexte = readLocal('contexte', req.societeId, dossierId);
    if (!contexte) return res.status(404).json({ error: 'Dossier non trouvé' });

    // 2. Charger les preuves
    let preuves = [];
    try {
      const { data } = await admin().from('avocat_preuves')
        .select('*').eq('dossier_id', dossierId).eq('societe_id', req.societeId);
      preuves = data || [];
    } catch {}
    if (!preuves.length) preuves = readLocal('preuves', req.societeId, dossierId) || [];

    // 3. Charger les patterns cabinet pour enrichir
    let patterns = [];
    try {
      const { data } = await admin().from('avocat_patterns')
        .select('*').eq('societe_id', req.societeId).order('nb_dossiers_source', { ascending: false }).limit(20);
      patterns = data || [];
    } catch {}
    if (!patterns.length) patterns = readLocal('patterns', req.societeId, null) || [];

    // 4. Construire le prompt pour Mistral
    const preuvesResume = preuves.map(p => `- ${p.type_preuve} (force: ${p.force_probatoire}/5, axe: ${p.axe_strategique || 'non défini'}, statut: ${p.statut})`).join('\n');
    const patternsResume = patterns.slice(0, 5).map(p => `- Pattern "${p.type_contentieux}": stratégie efficace=${p.strategie_efficace}, fragile=${p.strategie_fragile}, issue=${p.issue_frequente}`).join('\n');

    const gpsResult = await callMistralStrategique(
      `Tu es un GPS stratégique prud'homal français expert. Tu analyses un dossier et proposes plusieurs chemins stratégiques avec leur solidité.
RÈGLES ABSOLUES :
- Tu ne dois JAMAIS inventer de jurisprudence
- Chaque recommandation doit indiquer son niveau de confiance
- Tu dois toujours dire "validation avocat obligatoire"
- Si les données sont insuffisantes, le dire clairement
Réponds en JSON.`,

      `DOSSIER À ANALYSER :
Type contentieux : ${contexte.type_contentieux || contexte.type || 'non précisé'}
Ancienneté : ${contexte.anciennete_mois || '?'} mois
Salaire brut : ${contexte.salaire_brut || '?'} €
Statut : ${contexte.statut_salarie || '?'}
Type employeur : ${contexte.type_employeur || '?'} (${contexte.taille_entreprise || '?'} salariés)
Secteur : ${contexte.secteur_activite || '?'}
Convention collective : ${contexte.convention_collective || '?'}
Juridiction : ${contexte.juridiction || '?'} — Section : ${contexte.section_cph || '?'}
Stade procédural : ${contexte.stade_procedural || '?'}
Stratégie principale envisagée : ${contexte.strategie_principale || '?'}

PREUVES DISPONIBLES (${preuves.length}) :
${preuvesResume || 'Aucune preuve structurée'}

PATTERNS CABINET (expérience passée) :
${patternsResume || 'Aucun pattern — premier dossier du cabinet'}

Propose 4 chemins stratégiques en JSON :
{
  "chemins": [
    {
      "nom": "Chemin A : ...",
      "axe_juridique": "harcelement|obligation_securite|heures_sup|discrimination|procedure|negociation|...",
      "solidite": 75,
      "preuves_presentes": ["mail tardif", "..."],
      "preuves_manquantes": ["attestation", "..."],
      "risques": "...",
      "chances_succes": "moyenne",
      "montant_indicatif_min": 0,
      "montant_indicatif_max": 0,
      "strategie_recommandee": "...",
      "issue_probable": "transaction|jugement|...",
      "confiance": "fiable|a_verifier|fragile"
    }
  ],
  "chemin_recommande": 0,
  "synthese": "En 3 lignes, la recommandation globale",
  "donnees_insuffisantes": false,
  "source": "analyse IA + patterns cabinet"
}`,
      { json: true, maxTokens: 3000, temperature: 0.4 }
    );

    if (gpsResult && gpsResult.chemins) {
      return res.json({
        gps: gpsResult,
        nb_preuves: preuves.length,
        nb_patterns_cabinet: patterns.length,
        source: 'mistral_ia_rgpd',
        avertissement: 'Estimation indicative — validation avocat obligatoire. Les données restent hébergées en Union Européenne (Mistral AI, Paris).'
      });
    }

    // Fallback sans IA — chemins basiques basés sur les preuves
    const cheminsBasiques = [
      { nom: 'Chemin A : Licenciement sans cause', axe_juridique: contexte.type_contentieux || 'licenciement', solidite: 50, preuves_presentes: preuves.filter(p => p.force_probatoire >= 3).map(p => p.type_preuve), preuves_manquantes: [], risques: 'À évaluer par l\'avocat', confiance: 'insuffisant' },
      { nom: 'Chemin B : Négociation', axe_juridique: 'negociation', solidite: 60, preuves_presentes: [], preuves_manquantes: [], risques: 'Dépend du rapport de force', confiance: 'a_verifier' }
    ];

    return res.json({
      gps: { chemins: cheminsBasiques, synthese: 'Données insuffisantes pour une analyse IA complète. Veuillez enrichir le contexte et les preuves.', donnees_insuffisantes: true, source: 'fallback_local' },
      nb_preuves: preuves.length,
      source: 'fallback_local',
      avertissement: 'Estimation très approximative — enrichissez les preuves et le contexte pour une analyse IA complète.'
    });
  } catch (err) {
    console.error('[moteur-strategique/gps]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /dossier/:dossierId/alertes — Alertes intelligentes contextuelles
// ================================================
router.get('/dossier/:dossierId/alertes', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const alertes = [];

    // Charger contexte
    let contexte = null;
    try {
      const { data } = await admin().from('avocat_dossiers').select('*').eq('id', dossierId).single();
      contexte = data;
    } catch {}
    if (!contexte) contexte = readLocal('contexte', req.societeId, dossierId);

    if (contexte) {
      // Alerte audience proche
      if (contexte.date_audience) {
        const jours = Math.ceil((new Date(contexte.date_audience) - new Date()) / 86400000);
        if (jours >= 0 && jours <= 30) {
          alertes.push({ type: 'audience_proche', urgence: jours <= 7 ? 'critique' : 'important', message: `Audience dans ${jours} jour(s)`, date: contexte.date_audience });
        }
      }
      // Alerte prescription
      if (contexte.anciennete_mois && contexte.created_at) {
        const moisDepuisCreation = Math.ceil((new Date() - new Date(contexte.created_at)) / (30 * 86400000));
        if (moisDepuisCreation > 20) {
          alertes.push({ type: 'prescription_proche', urgence: 'critique', message: 'Attention — vérifier les délais de prescription (24 mois en prud\'homal)' });
        }
      }
      // Alerte contexte incomplet
      const champsManquants = [];
      if (!contexte.type_contentieux) champsManquants.push('type de contentieux');
      if (!contexte.salaire_brut) champsManquants.push('salaire brut');
      if (!contexte.anciennete_mois) champsManquants.push('ancienneté');
      if (!contexte.convention_collective) champsManquants.push('convention collective');
      if (champsManquants.length > 0) {
        alertes.push({ type: 'contexte_incomplet', urgence: 'info', message: `Champs manquants : ${champsManquants.join(', ')}` });
      }
    }

    // Preuves manquantes
    let preuves = [];
    try {
      const { data } = await admin().from('avocat_preuves').select('type_preuve, statut').eq('dossier_id', dossierId).eq('societe_id', req.societeId);
      preuves = data || [];
    } catch {}
    if (!preuves.length) preuves = readLocal('preuves', req.societeId, dossierId) || [];

    const preuvesDecisives = preuves.filter(p => p.statut === 'decisive');
    const preuvesAVerifier = preuves.filter(p => p.statut === 'a_verifier');
    if (preuvesAVerifier.length > 0) {
      alertes.push({ type: 'preuves_a_verifier', urgence: 'important', message: `${preuvesAVerifier.length} preuve(s) à vérifier` });
    }
    if (preuves.length === 0) {
      alertes.push({ type: 'aucune_preuve', urgence: 'critique', message: 'Aucune preuve structurée — enrichissez le dossier' });
    }

    // Issue manquante
    let issue = null;
    try {
      const { data } = await admin().from('avocat_issues').select('id').eq('dossier_id', dossierId).eq('societe_id', req.societeId).single();
      issue = data;
    } catch {}

    if (contexte && contexte.etape === 'clos' && !issue) {
      alertes.push({ type: 'issue_manquante', urgence: 'important', message: 'Dossier clos sans issue finale — complétez pour enrichir la mémoire cabinet' });
    }

    return res.json({ alertes, nb_alertes: alertes.length });
  } catch (err) {
    console.error('[moteur-strategique/alertes]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 11 — MOTEUR DE SIMILARITÉ
// =========================================================

/**
 * GET /dossier/:dossierId/similaires
 * Calcule un score de similarité 0-100 entre le dossier cible et tous les
 * dossiers du cabinet. Retourne les 15 dossiers les plus proches (score >= 40)
 * avec leur issue finale et des insights agrégés.
 */
router.get('/dossier/:dossierId/similaires', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // --- 1. Charger le dossier cible ---
    let cible = null;
    try {
      const { data, error } = await admin()
        .from('avocat_dossiers')
        .select('id, titre, reference, type_contentieux, anciennete_mois, salaire_brut, type_employeur, section_cph, juridiction, strategie_principale, etape')
        .eq('id', dossierId)
        .eq('societe_id', req.societeId)
        .single();
      if (!error) cible = data;
    } catch {}

    if (!cible) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    // --- 2. Charger tous les autres dossiers du cabinet ---
    let tousLesDossiers = [];
    try {
      const { data } = await admin()
        .from('avocat_dossiers')
        .select('id, titre, reference, type_contentieux, anciennete_mois, salaire_brut, type_employeur, section_cph, juridiction, strategie_principale, etape')
        .eq('societe_id', req.societeId)
        .neq('id', dossierId);
      tousLesDossiers = data || [];
    } catch {}

    // --- 3. Charger toutes les issues du cabinet ---
    let issuesMap = {};
    try {
      const { data } = await admin()
        .from('avocat_issues')
        .select('dossier_id, resultat_global, montant_obtenu')
        .eq('societe_id', req.societeId);
      if (data) {
        data.forEach(i => { issuesMap[i.dossier_id] = i; });
      }
    } catch {}

    // --- 4. Calculer les scores ---
    const scored = tousLesDossiers.map(d => {
      let score = 0;

      // type_contentieux identique = +30
      if (cible.type_contentieux && d.type_contentieux === cible.type_contentieux) score += 30;

      // même tranche ancienneté (±24 mois) = +15
      if (cible.anciennete_mois != null && d.anciennete_mois != null) {
        if (Math.abs(d.anciennete_mois - cible.anciennete_mois) <= 24) score += 15;
      }

      // même tranche salaire (±30%) = +15
      if (cible.salaire_brut != null && d.salaire_brut != null && cible.salaire_brut > 0) {
        const ratio = Math.abs(d.salaire_brut - cible.salaire_brut) / cible.salaire_brut;
        if (ratio <= 0.30) score += 15;
      }

      // même type_employeur = +10
      if (cible.type_employeur && d.type_employeur === cible.type_employeur) score += 10;

      // même section_cph = +10
      if (cible.section_cph && d.section_cph === cible.section_cph) score += 10;

      // même juridiction = +10
      if (cible.juridiction && d.juridiction === cible.juridiction) score += 10;

      // même stratégie principale = +10
      if (cible.strategie_principale && d.strategie_principale === cible.strategie_principale) score += 10;

      const issue = issuesMap[d.id] || null;
      return {
        id: d.id,
        titre: d.titre,
        reference: d.reference,
        type_contentieux: d.type_contentieux,
        score_similarite: score,
        etape: d.etape,
        strategie_principale: d.strategie_principale,
        issue: issue
          ? { resultat_global: issue.resultat_global, montant_obtenu: issue.montant_obtenu || null }
          : null
      };
    });

    // --- 5. Filtrer >= 40, trier, limiter à 15 ---
    const similaires = scored
      .filter(d => d.score_similarite >= 40)
      .sort((a, b) => b.score_similarite - a.score_similarite)
      .slice(0, 15);

    // --- 6. Insights agrégés ---
    const clos = similaires.filter(d => d.issue);
    const transactions = clos.filter(d => d.issue.resultat_global === 'transaction').length;
    const taux_transaction = clos.length > 0 ? Math.round((transactions / clos.length) * 100) : 0;

    const montantsObtenus = clos.filter(d => d.issue.montant_obtenu > 0).map(d => d.issue.montant_obtenu);
    const montant_moyen_obtenu = montantsObtenus.length > 0
      ? Math.round(montantsObtenus.reduce((a, b) => a + b, 0) / montantsObtenus.length)
      : 0;

    // Stratégie la plus efficace parmi les dossiers gagnés ou transactés
    const dossiersSucces = clos.filter(d => ['gagne', 'transaction'].includes(d.issue.resultat_global));
    const compteStrategies = {};
    dossiersSucces.forEach(d => {
      if (d.strategie_principale) {
        compteStrategies[d.strategie_principale] = (compteStrategies[d.strategie_principale] || 0) + 1;
      }
    });
    const strategie_plus_efficace = Object.entries(compteStrategies).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Preuves décisives fréquentes : chercher dans les dossiers similaires clos avec succès
    let preuves_decisives_frequentes = [];
    if (dossiersSucces.length > 0) {
      try {
        const idsDossiers = dossiersSucces.map(d => d.id);
        const { data: preuvesData } = await admin()
          .from('avocat_preuves')
          .select('type_preuve')
          .eq('societe_id', req.societeId)
          .eq('statut', 'decisive')
          .in('dossier_id', idsDossiers);
        if (preuvesData && preuvesData.length > 0) {
          const comptePreuves = {};
          preuvesData.forEach(p => {
            comptePreuves[p.type_preuve] = (comptePreuves[p.type_preuve] || 0) + 1;
          });
          preuves_decisives_frequentes = Object.entries(comptePreuves)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type]) => type);
        }
      } catch {}
    }

    return res.json({
      dossier_cible: { id: cible.id, titre: cible.titre },
      similaires,
      nb_similaires: similaires.length,
      insights: {
        taux_transaction,
        montant_moyen_obtenu,
        strategie_plus_efficace,
        preuves_decisives_frequentes
      }
    });
  } catch (err) {
    console.error('[moteur-strategique/similaires]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 12 — DASHBOARD STATISTIQUES ENRICHI
// =========================================================

/**
 * GET /stats/dashboard
 * Dashboard complet : cabinet, résultats, finances, stratégies, preuves,
 * contentieux, tendances trimestrielles.
 * Complète le GET /stats existant avec beaucoup plus de données.
 */
router.get('/stats/dashboard', requireAvocat, async (req, res) => {
  try {
    // Valeurs par défaut (fallback si tables vides)
    const dashboard = {
      cabinet: {
        nb_dossiers_total: 0,
        nb_dossiers_actifs: 0,
        nb_dossiers_clos: 0,
        nb_avec_issue: 0,
        nb_avec_post_mortem: 0
      },
      resultats: {
        nb_gagnes: 0,
        nb_perdus: 0,
        nb_transactions: 0,
        nb_accords_partiels: 0,
        taux_succes: 0,
        taux_transaction: 0
      },
      finances: {
        montant_total_demande: 0,
        montant_total_obtenu: 0,
        montant_moyen_obtenu: 0,
        article_700_moyen: 0,
        ratio_obtenu_demande: 0
      },
      strategies: {
        top_5_efficaces: [],
        top_5_fragiles: []
      },
      preuves: {
        top_5_decisives: [],
        types_les_plus_frequents: []
      },
      contentieux: {
        repartition: []
      },
      tendances: {
        montant_moyen_par_trimestre: []
      }
    };

    try {
      // === CABINET ===
      const { data: dossiers } = await admin()
        .from('avocat_dossiers')
        .select('id, etape')
        .eq('societe_id', req.societeId);

      if (dossiers && dossiers.length > 0) {
        dashboard.cabinet.nb_dossiers_total = dossiers.length;
        dashboard.cabinet.nb_dossiers_actifs = dossiers.filter(d => d.etape !== 'clos').length;
        dashboard.cabinet.nb_dossiers_clos = dossiers.filter(d => d.etape === 'clos').length;
      }

      // === ISSUES ===
      const { data: issues } = await admin()
        .from('avocat_issues')
        .select('dossier_id, resultat_global, montant_obtenu, montant_demande, article_700, cree_le')
        .eq('societe_id', req.societeId);

      if (issues && issues.length > 0) {
        dashboard.cabinet.nb_avec_issue = issues.length;

        const gagnes = issues.filter(i => i.resultat_global === 'gagne');
        const perdus = issues.filter(i => i.resultat_global === 'perdu');
        const transactions = issues.filter(i => i.resultat_global === 'transaction');
        const accords = issues.filter(i => i.resultat_global === 'accord_partiel');
        const totalClos = issues.length;

        dashboard.resultats.nb_gagnes = gagnes.length;
        dashboard.resultats.nb_perdus = perdus.length;
        dashboard.resultats.nb_transactions = transactions.length;
        dashboard.resultats.nb_accords_partiels = accords.length;
        dashboard.resultats.taux_succes = totalClos > 0
          ? Math.round(((gagnes.length + transactions.length) / totalClos) * 100)
          : 0;
        dashboard.resultats.taux_transaction = totalClos > 0
          ? Math.round((transactions.length / totalClos) * 100)
          : 0;

        // Finances
        const totalObtenu = issues.reduce((s, i) => s + (i.montant_obtenu || 0), 0);
        const totalDemande = issues.reduce((s, i) => s + (i.montant_demande || 0), 0);
        const montantsObtenus = issues.filter(i => (i.montant_obtenu || 0) > 0).map(i => i.montant_obtenu);
        const articles700 = issues.filter(i => (i.article_700 || 0) > 0).map(i => i.article_700);

        dashboard.finances.montant_total_demande = Math.round(totalDemande);
        dashboard.finances.montant_total_obtenu = Math.round(totalObtenu);
        dashboard.finances.montant_moyen_obtenu = montantsObtenus.length > 0
          ? Math.round(montantsObtenus.reduce((a, b) => a + b, 0) / montantsObtenus.length)
          : 0;
        dashboard.finances.article_700_moyen = articles700.length > 0
          ? Math.round(articles700.reduce((a, b) => a + b, 0) / articles700.length)
          : 0;
        dashboard.finances.ratio_obtenu_demande = totalDemande > 0
          ? Math.round((totalObtenu / totalDemande) * 100)
          : 0;

        // Tendances trimestrielles
        const trimestresMap = {};
        issues.forEach(i => {
          if (!i.cree_le || !i.montant_obtenu) return;
          const d = new Date(i.cree_le);
          const q = Math.ceil((d.getMonth() + 1) / 3);
          const clef = `${d.getFullYear()}-Q${q}`;
          if (!trimestresMap[clef]) trimestresMap[clef] = { total: 0, count: 0 };
          trimestresMap[clef].total += i.montant_obtenu;
          trimestresMap[clef].count += 1;
        });
        dashboard.tendances.montant_moyen_par_trimestre = Object.entries(trimestresMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([trimestre, v]) => ({
            trimestre,
            montant_moyen: Math.round(v.total / v.count)
          }));
      }

      // === POST-MORTEM ===
      try {
        const { data: pm } = await admin()
          .from('avocat_post_mortem')
          .select('id')
          .eq('societe_id', req.societeId);
        dashboard.cabinet.nb_avec_post_mortem = pm ? pm.length : 0;
      } catch {}

      // === STRATÉGIES ===
      const { data: strategies } = await admin()
        .from('avocat_strategies')
        .select('type_strategie, dossier_id')
        .eq('societe_id', req.societeId);

      if (strategies && strategies.length > 0) {
        // Construire un set des dossier_id des issues gagnées / transactées
        const issuesClotures = {};
        (issues || []).forEach(i => {
          issuesClotures[i.dossier_id] = i.resultat_global;
        });

        const strategieStats = {};
        strategies.forEach(s => {
          const t = s.type_strategie;
          if (!t) return;
          if (!strategieStats[t]) strategieStats[t] = { nb: 0, succes: 0, echecs: 0 };
          strategieStats[t].nb += 1;
          const res = issuesClotures[s.dossier_id];
          if (res === 'gagne' || res === 'transaction') strategieStats[t].succes += 1;
          if (res === 'perdu') strategieStats[t].echecs += 1;
        });

        const lignesStrategies = Object.entries(strategieStats).map(([type, v]) => ({
          type,
          nb_utilisations: v.nb,
          taux_succes: v.nb > 0 ? Math.round((v.succes / v.nb) * 100) : 0,
          taux_echec: v.nb > 0 ? Math.round((v.echecs / v.nb) * 100) : 0
        }));

        dashboard.strategies.top_5_efficaces = lignesStrategies
          .filter(l => l.nb_utilisations > 0)
          .sort((a, b) => b.taux_succes - a.taux_succes)
          .slice(0, 5)
          .map(({ type, nb_utilisations, taux_succes }) => ({ type, nb_utilisations, taux_succes }));

        dashboard.strategies.top_5_fragiles = lignesStrategies
          .filter(l => l.nb_utilisations > 0)
          .sort((a, b) => b.taux_echec - a.taux_echec)
          .slice(0, 5)
          .map(({ type, nb_utilisations, taux_echec }) => ({ type, nb_utilisations, taux_echec }));
      }

      // === PREUVES ===
      const { data: preuves } = await admin()
        .from('avocat_preuves')
        .select('type_preuve, statut')
        .eq('societe_id', req.societeId);

      if (preuves && preuves.length > 0) {
        const decisives = {};
        const frequences = {};

        preuves.forEach(p => {
          const t = p.type_preuve;
          if (!t) return;
          frequences[t] = (frequences[t] || 0) + 1;
          if (p.statut === 'decisive') {
            decisives[t] = (decisives[t] || 0) + 1;
          }
        });

        dashboard.preuves.top_5_decisives = Object.entries(decisives)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, nb_fois_decisive]) => ({ type, nb_fois_decisive }));

        dashboard.preuves.types_les_plus_frequents = Object.entries(frequences)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, nb]) => ({ type, nb }));
      }

      // === CONTENTIEUX — répartition depuis dossiers ===
      const { data: dossiersCx } = await admin()
        .from('avocat_dossiers')
        .select('id, type_contentieux')
        .eq('societe_id', req.societeId);

      if (dossiersCx && dossiersCx.length > 0) {
        const issuesMap2 = {};
        (issues || []).forEach(i => { issuesMap2[i.dossier_id] = i.resultat_global; });

        const cxStats = {};
        dossiersCx.forEach(d => {
          const cx = d.type_contentieux || 'non_renseigne';
          if (!cxStats[cx]) cxStats[cx] = { nb: 0, succes: 0 };
          cxStats[cx].nb += 1;
          const res = issuesMap2[d.id];
          if (res === 'gagne' || res === 'transaction') cxStats[cx].succes += 1;
        });

        dashboard.contentieux.repartition = Object.entries(cxStats)
          .sort((a, b) => b[1].nb - a[1].nb)
          .map(([type, v]) => ({
            type,
            nb: v.nb,
            taux_succes: v.nb > 0 ? Math.round((v.succes / v.nb) * 100) : 0
          }));
      }

    } catch (dbErr) {
      console.warn('[moteur-strategique/stats/dashboard] DB indisponible, dashboard partiel:', dbErr.message);
    }

    return res.json({ dashboard, calcule_le: now() });
  } catch (err) {
    console.error('[moteur-strategique/stats/dashboard]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
