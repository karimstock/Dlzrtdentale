/**
 * JADOMI — API Rappels automatiques + SMS Wallet
 * Routes pour la gestion des rappels patients (email + SMS)
 */
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_TEMPLATES } = require('../lib/rappels-scheduler');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let _admin = null;
function admin() {
  if (!_admin) {
    if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Middleware auth (valide JWT Supabase)
let authSupabase = null;
let requireSociete = null;
try {
  const mw = require('./multiSocietes/middleware');
  authSupabase = mw.authSupabase;
  requireSociete = mw.requireSociete;
} catch (e) {
  console.warn('[Rappels API] Middleware indisponible:', e.message);
}

function requireAuth() {
  if (!authSupabase) return (req, res) => res.status(503).json({ error: 'auth_unavailable' });
  return authSupabase();
}

function requireSoc() {
  if (!requireSociete) return (req, res) => res.status(503).json({ error: 'societe_middleware_unavailable' });
  return requireSociete();
}

// =============================================
// RAPPELS CONFIG
// =============================================

// GET /api/rappels/config — Liste des configs de rappels pour la société
router.get('/config', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    const { data, error } = await admin()
      .from('rappels_config')
      .select('*')
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrichir avec les templates par defaut pour les declencheurs non configures
    const configuredTypes = new Set((data || []).map(c => c.declencheur));
    const availableTypes = Object.keys(DEFAULT_TEMPLATES)
      .filter(t => !configuredTypes.has(t))
      .map(t => ({
        declencheur: t,
        template_sujet: DEFAULT_TEMPLATES[t].sujet,
        template_corps: DEFAULT_TEMPLATES[t].corps,
        actif: false,
        type: 'email',
        configured: false
      }));

    res.json({ configs: data || [], available: availableTypes });
  } catch (e) {
    console.error('[Rappels API] GET /config:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/rappels/config — Creer/mettre a jour une config de rappel
router.post('/config', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    const { id, type, declencheur, template_sujet, template_corps, delai_minutes, actif } = req.body;

    // Validation
    const validTypes = ['email', 'sms', 'both'];
    const validDeclencheurs = ['rdv_j2', 'rdv_j1', 'rdv_h2', 'post_soin_j1', 'recall_6mois', 'recall_1an', 'anniversaire', 'avis_google', 'ordonnance_expiration', 'custom'];

    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Type invalide (email, sms, both)' });
    if (!validDeclencheurs.includes(declencheur)) return res.status(400).json({ error: 'Déclencheur invalide' });

    const record = {
      societe_id: societeId,
      type,
      declencheur,
      template_sujet: template_sujet || (DEFAULT_TEMPLATES[declencheur] || {}).sujet || '',
      template_corps: template_corps || (DEFAULT_TEMPLATES[declencheur] || {}).corps || '',
      delai_minutes: delai_minutes || 0,
      actif: actif !== false
    };

    let result;
    if (id) {
      // Update existant
      const { data, error } = await admin()
        .from('rappels_config')
        .update(record)
        .eq('id', id)
        .eq('societe_id', societeId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      // Creer nouveau
      const { data, error } = await admin()
        .from('rappels_config')
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    res.json({ success: true, config: result });
  } catch (e) {
    console.error('[Rappels API] POST /config:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/rappels/config/:id — Toggle actif/inactif
router.patch('/config/:id', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'];
    const { actif } = req.body;

    const { data, error } = await admin()
      .from('rappels_config')
      .update({ actif: !!actif })
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Configuration introuvable' });

    res.json({ success: true, config: data });
  } catch (e) {
    console.error('[Rappels API] PATCH /config/:id:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/rappels/config/:id — Supprimer une config
router.delete('/config/:id', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'];

    const { error } = await admin()
      .from('rappels_config')
      .delete()
      .eq('id', req.params.id)
      .eq('societe_id', societeId);

    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    console.error('[Rappels API] DELETE /config/:id:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// RAPPELS HISTORIQUE
// =============================================

// GET /api/rappels/historique — Liste des envois (pagine, filtrable)
router.get('/historique', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    let query = admin()
      .from('rappels_envois')
      .select('*', { count: 'exact' })
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtres optionnels
    if (req.query.type) query = query.eq('type', req.query.type);
    if (req.query.statut) query = query.eq('statut', req.query.statut);
    if (req.query.date_debut) query = query.gte('created_at', req.query.date_debut);
    if (req.query.date_fin) query = query.lte('created_at', req.query.date_fin);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      envois: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit)
    });
  } catch (e) {
    console.error('[Rappels API] GET /historique:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/rappels/stats — Statistiques des rappels
router.get('/stats', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    // Total envoyes
    const { count: totalEnvoyes } = await admin()
      .from('rappels_envois')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)
      .eq('statut', 'envoye');

    // Total echoues
    const { count: totalEchoues } = await admin()
      .from('rappels_envois')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)
      .eq('statut', 'echoue');

    // Par type
    const { count: totalEmail } = await admin()
      .from('rappels_envois')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)
      .eq('type', 'email');

    const { count: totalSms } = await admin()
      .from('rappels_envois')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)
      .eq('type', 'sms');

    // Ce mois
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    const { count: ceMois } = await admin()
      .from('rappels_envois')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)
      .eq('statut', 'envoye')
      .gte('created_at', debutMois.toISOString());

    const total = (totalEnvoyes || 0) + (totalEchoues || 0);
    const tauxSucces = total > 0 ? Math.round(((totalEnvoyes || 0) / total) * 100) : 100;

    res.json({
      total_envoyes: totalEnvoyes || 0,
      total_echoues: totalEchoues || 0,
      par_email: totalEmail || 0,
      par_sms: totalSms || 0,
      ce_mois: ceMois || 0,
      taux_succes: tauxSucces
    });
  } catch (e) {
    console.error('[Rappels API] GET /stats:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/rappels/templates — Templates par defaut
router.get('/templates', requireAuth(), async (req, res) => {
  res.json({ templates: DEFAULT_TEMPLATES });
});

// =============================================
// SMS WALLET
// =============================================

// GET /api/sms/wallet — Solde SMS
router.get('/wallet', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'] || req.query.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    let { data, error } = await admin()
      .from('sms_wallet')
      .select('*')
      .eq('societe_id', societeId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Pas de wallet, creer un vide
      const { data: newWallet } = await admin()
        .from('sms_wallet')
        .insert({ societe_id: societeId, credits_sms: 0, total_achete: 0, total_envoye: 0 })
        .select()
        .single();
      data = newWallet;
    } else if (error) {
      throw error;
    }

    res.json({ wallet: data });
  } catch (e) {
    console.error('[SMS API] GET /wallet:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/sms/wallet/acheter — Acheter un pack SMS
router.post('/wallet/acheter', requireAuth(), requireSoc(), async (req, res) => {
  try {
    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

    const { pack_id } = req.body;
    if (!pack_id) return res.status(400).json({ error: 'pack_id requis' });

    // Recuperer le pack
    const { data: pack, error: packErr } = await admin()
      .from('sms_packs')
      .select('*')
      .eq('id', pack_id)
      .single();

    if (packErr || !pack) return res.status(404).json({ error: 'Pack introuvable' });

    // Recuperer ou creer le wallet
    let { data: wallet } = await admin()
      .from('sms_wallet')
      .select('*')
      .eq('societe_id', societeId)
      .single();

    if (!wallet) {
      const { data: newW } = await admin()
        .from('sms_wallet')
        .insert({ societe_id: societeId, credits_sms: 0, total_achete: 0, total_envoye: 0 })
        .select()
        .single();
      wallet = newW;
    }

    // Ajouter les credits
    const { data: updated, error: upErr } = await admin()
      .from('sms_wallet')
      .update({
        credits_sms: (wallet.credits_sms || 0) + pack.credits,
        total_achete: (wallet.total_achete || 0) + pack.credits,
        updated_at: new Date().toISOString()
      })
      .eq('societe_id', societeId)
      .select()
      .single();

    if (upErr) throw upErr;

    // TODO: Integration Stripe pour le paiement reel
    // Pour l'instant, les credits sont ajoutes directement (mode demo)

    res.json({
      success: true,
      pack: pack.nom,
      credits_ajoutes: pack.credits,
      wallet: updated
    });
  } catch (e) {
    console.error('[SMS API] POST /wallet/acheter:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/sms/packs — Lister les packs SMS disponibles
router.get('/packs', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('sms_packs')
      .select('*')
      .order('credits', { ascending: true });

    if (error) throw error;
    res.json({ packs: data || [] });
  } catch (e) {
    console.error('[SMS API] GET /packs:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
