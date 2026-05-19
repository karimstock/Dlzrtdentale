// =============================================
// JADOMI AVOCAT EXPERT — Workflow dossier (pipeline)
// Gestion des etapes, transitions, deadlines
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

// === Pipeline stages (ordre strict) ===
const ETAPES = [
  'nouveau', 'en_cours', 'mise_en_etat', 'audience',
  'delibere', 'jugement', 'appel', 'execution', 'clos', 'archive'
];

// === Domaines de droit ===
const DOMAINES = [
  'droit_affaires', 'droit_famille', 'droit_immobilier', 'droit_penal',
  'droit_travail', 'droit_fiscal', 'droit_societes', 'contentieux',
  'propriete_intellectuelle', 'droit_public', 'droit_international',
  'droit_etrangers', 'droit_numerique', 'autre'
];

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

// ================================================
// PATCH /dossiers/:id/etape — Changer l'etape d'un dossier
// ================================================
router.patch('/dossiers/:id/etape', requireAvocat, async (req, res) => {
  try {
    const { etape, notes, date_audience, date_delibere, date_jugement } = req.body || {};

    if (!etape || !ETAPES.includes(etape)) {
      return res.status(400).json({
        error: 'Étape invalide. Valeurs autorisées : ' + ETAPES.join(', ')
      });
    }

    // Verifier que le dossier appartient a la societe
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('*')
      .eq('id', req.params.id)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (dErr || !dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const fromEtape = dossier.etape || 'nouveau';

    // Construire les champs a mettre a jour
    const updates = { etape };

    // Auto-set dates selon l'etape
    if (etape === 'audience' && date_audience) {
      updates.date_audience = date_audience;
    }
    if (etape === 'delibere' && date_delibere) {
      updates.date_delibere = date_delibere;
    }
    if (etape === 'jugement') {
      if (date_jugement) {
        updates.date_jugement = date_jugement;
      }
      // Auto-calcul delai d'appel : date_jugement + 30 jours
      const jugementDate = new Date(date_jugement || dossier.date_jugement || new Date());
      const appelLimite = new Date(jugementDate);
      appelLimite.setDate(appelLimite.getDate() + 30);
      updates.date_appel_limite = appelLimite.toISOString().split('T')[0];
    }
    if (etape === 'clos' || etape === 'archive') {
      updates.closed_at = new Date().toISOString();
    }

    // Mettre a jour le dossier
    const { data: updated, error: uErr } = await admin().from('avocat_dossiers')
      .update(updates)
      .eq('id', req.params.id)
      .eq('avocat_societe_id', req.societeId)
      .select('*')
      .single();

    if (uErr) {
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du dossier' });
    }

    // Enregistrer la transition
    const { data: transition, error: tErr } = await admin().from('avocat_dossier_transitions')
      .insert({
        dossier_id: req.params.id,
        societe_id: req.societeId,
        from_etape: fromEtape,
        to_etape: etape,
        changed_by: req.userId,
        notes: notes || null
      })
      .select()
      .single();

    if (tErr) {
      console.error('[workflow/etape] Erreur transition:', tErr.message);
    }

    return res.json({
      dossier: updated,
      transition: transition || null,
      message: 'Dossier passé de "' + fromEtape + '" à "' + etape + '".'
    });
  } catch (err) {
    console.error('[workflow/etape]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /dossiers/:id/transitions — Historique des transitions
// ================================================
router.get('/dossiers/:id/transitions', requireAvocat, async (req, res) => {
  try {
    // Verifier que le dossier appartient a la societe
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', req.params.id)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const { data: transitions, error } = await admin().from('avocat_dossier_transitions')
      .select('*')
      .eq('dossier_id', req.params.id)
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des transitions' });
    }

    return res.json(transitions || []);
  } catch (err) {
    console.error('[workflow/transitions]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /deadlines — Toutes les deadlines a venir
// ================================================
router.get('/deadlines', requireAvocat, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + days);
    const limitStr = limit.toISOString().split('T')[0];
    const nowStr = now.toISOString().split('T')[0];

    // Recuperer tous les dossiers actifs (pas clos/archive) de cette societe
    const { data: dossiers, error } = await admin().from('avocat_dossiers')
      .select('id, titre, etape, domaine, date_audience, date_delibere, date_jugement, date_appel_limite, avocat_clients(nom, prenom)')
      .eq('avocat_societe_id', req.societeId)
      .not('etape', 'in', '("clos","archive")');

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des dossiers' });
    }

    // Extraire et trier les deadlines
    const deadlines = [];

    for (const d of (dossiers || [])) {
      const clientNom = d.avocat_clients
        ? ((d.avocat_clients.prenom || '') + ' ' + (d.avocat_clients.nom || '')).trim()
        : null;

      const dateFields = [
        { type: 'audience', date: d.date_audience },
        { type: 'delibere', date: d.date_delibere },
        { type: 'jugement', date: d.date_jugement },
        { type: 'appel_limite', date: d.date_appel_limite }
      ];

      for (const field of dateFields) {
        if (field.date && field.date >= nowStr && field.date <= limitStr) {
          deadlines.push({
            dossier_id: d.id,
            titre: d.titre,
            client: clientNom,
            domaine: d.domaine,
            etape: d.etape,
            type_deadline: field.type,
            date: field.date,
            jours_restants: Math.ceil((new Date(field.date) - now) / (1000 * 60 * 60 * 24))
          });
        }
      }
    }

    // Trier par date la plus proche en premier
    deadlines.sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      periode_jours: days,
      total: deadlines.length,
      deadlines
    });
  } catch (err) {
    console.error('[workflow/deadlines]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /pipeline — Dossiers groupes par etape
// ================================================
router.get('/pipeline', requireAvocat, async (req, res) => {
  try {
    const { data: dossiers, error } = await admin().from('avocat_dossiers')
      .select('id, titre, etape, domaine, created_at, updated_at, avocat_clients(nom, prenom)')
      .eq('avocat_societe_id', req.societeId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la récupération du pipeline' });
    }

    const now = new Date();
    const pipeline = {};

    // Initialiser toutes les etapes (meme vides)
    for (const etape of ETAPES) {
      pipeline[etape] = [];
    }

    for (const d of (dossiers || [])) {
      const etape = ETAPES.includes(d.etape) ? d.etape : 'nouveau';
      const clientNom = d.avocat_clients
        ? ((d.avocat_clients.prenom || '') + ' ' + (d.avocat_clients.nom || '')).trim()
        : null;

      // Calcul du nombre de jours dans l'etape courante
      const lastUpdate = new Date(d.updated_at || d.created_at);
      const joursEtape = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));

      pipeline[etape].push({
        id: d.id,
        titre: d.titre,
        client: clientNom,
        domaine: d.domaine,
        jours_dans_etape: joursEtape
      });
    }

    // Compter par etape
    const counts = {};
    for (const etape of ETAPES) {
      counts[etape] = pipeline[etape].length;
    }

    return res.json({ pipeline, counts, total: (dossiers || []).length });
  } catch (err) {
    console.error('[workflow/pipeline]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// PATCH /dossiers/:id — Mise a jour des metadonnees
// ================================================
router.patch('/dossiers/:id', requireAvocat, async (req, res) => {
  try {
    const {
      domaine, juridiction, numero_rg, taux_horaire_defaut,
      date_audience, date_delibere, date_jugement
    } = req.body || {};

    // Verifier que le dossier appartient a la societe
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', req.params.id)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier non trouvé' });
    }

    const updates = {};

    if (domaine !== undefined) {
      if (domaine && !DOMAINES.includes(domaine)) {
        return res.status(400).json({
          error: 'Domaine invalide. Valeurs autorisées : ' + DOMAINES.join(', ')
        });
      }
      updates.domaine = domaine;
    }
    if (juridiction !== undefined) updates.juridiction = juridiction;
    if (numero_rg !== undefined) updates.numero_rg = numero_rg;
    if (taux_horaire_defaut !== undefined) updates.taux_horaire_defaut = taux_horaire_defaut;
    if (date_audience !== undefined) updates.date_audience = date_audience;
    if (date_delibere !== undefined) updates.date_delibere = date_delibere;
    if (date_jugement !== undefined) {
      updates.date_jugement = date_jugement;
      // Auto-calcul delai d'appel : date_jugement + 30 jours
      if (date_jugement) {
        const jugementDate = new Date(date_jugement);
        const appelLimite = new Date(jugementDate);
        appelLimite.setDate(appelLimite.getDate() + 30);
        updates.date_appel_limite = appelLimite.toISOString().split('T')[0];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    const { data: updated, error } = await admin().from('avocat_dossiers')
      .update(updates)
      .eq('id', req.params.id)
      .eq('avocat_societe_id', req.societeId)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }

    return res.json({
      dossier: updated,
      message: 'Dossier mis à jour.'
    });
  } catch (err) {
    console.error('[workflow/update]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
