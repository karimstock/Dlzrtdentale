// =============================================
// JADOMI LABO — Routes garanties protheses
// Gestion des garanties, reclamations, config
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// Durees par defaut (en mois)
const DUREES_DEFAUT = {
  couronne: 60,
  ccm: 36,
  bridge: 60,
  prothese_amovible: 24,
  gouttiere: 12,
  facette: 36,
  inlay_onlay: 60,
  implant: 60,
  reparation: 6
};

// Helper : calcule date_fin a partir de date_debut + duree_mois
function calculerDateFin(dateDebut, dureeMois) {
  const d = new Date(dateDebut);
  d.setMonth(d.getMonth() + dureeMois);
  return d.toISOString().split('T')[0];
}

// Helper : cherche la duree configuree pour un type de travail
async function getDureeForType(prothesisteId, typeTravail) {
  try {
    const { data } = await admin()
      .from('labo_garanties_config')
      .select('durees')
      .eq('prothesiste_id', prothesisteId)
      .maybeSingle();

    const durees = data?.durees || DUREES_DEFAUT;
    const key = typeTravail.toLowerCase()
      .replace(/[éèê]/g, 'e')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    return durees[key] || DUREES_DEFAUT[key] || 24;
  } catch {
    return DUREES_DEFAUT[typeTravail] || 24;
  }
}

// ---- STATS (avant /:id pour eviter conflit) ----

// GET /api/labo/garanties/stats
router.get('/stats', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const now = new Date().toISOString().split('T')[0];
    const debutAnnee = new Date().getFullYear() + '-01-01';
    const dans90j = new Date();
    dans90j.setDate(dans90j.getDate() + 90);
    const date90 = dans90j.toISOString().split('T')[0];

    // Toutes les garanties
    const { data: all, error: e1 } = await admin()
      .from('labo_garanties')
      .select('id, statut, type_travail, date_fin')
      .eq('prothesiste_id', req.prothesisteId);
    if (e1) throw e1;

    const garanties = all || [];

    // Reclamations cette annee
    const { data: reclamations, error: e2 } = await admin()
      .from('labo_garantie_reclamations')
      .select('id, garantie_id')
      .in('garantie_id', garanties.map(g => g.id).length ? garanties.map(g => g.id) : ['00000000-0000-0000-0000-000000000000'])
      .gte('date_reclamation', debutAnnee);
    if (e2) throw e2;

    const actives = garanties.filter(g => g.statut === 'active');
    const expirantBientot = garanties.filter(g =>
      g.statut === 'active' && g.date_fin >= now && g.date_fin <= date90
    );

    // Taux reclamation par type
    const typeCounts = {};
    const typeReclamations = {};
    garanties.forEach(g => {
      typeCounts[g.type_travail] = (typeCounts[g.type_travail] || 0) + 1;
    });
    garanties.filter(g => g.statut === 'reclamation').forEach(g => {
      typeReclamations[g.type_travail] = (typeReclamations[g.type_travail] || 0) + 1;
    });

    const tauxParType = {};
    Object.keys(typeCounts).forEach(type => {
      tauxParType[type] = {
        total: typeCounts[type],
        reclamations: typeReclamations[type] || 0,
        taux: typeCounts[type] > 0
          ? Math.round(((typeReclamations[type] || 0) / typeCounts[type]) * 100 * 10) / 10
          : 0
      };
    });

    // Top types par volume
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    res.json({
      actives: actives.length,
      expirant_bientot: expirantBientot.length,
      reclamations_annee: (reclamations || []).length,
      taux_reclamation_par_type: tauxParType,
      top_types: topTypes,
      total: garanties.length
    });
  } catch (e) {
    console.error('[LABO GARANTIES stats]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ---- CONFIG ----

// GET /api/labo/garanties/config
router.get('/config', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { data, error } = await admin()
      .from('labo_garanties_config')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (error) throw error;

    res.json({
      config: data || { prothesiste_id: req.prothesisteId, durees: DUREES_DEFAUT }
    });
  } catch (e) {
    console.error('[LABO GARANTIES config GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// PUT /api/labo/garanties/config
router.put('/config', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { durees } = req.body;
    if (!durees || typeof durees !== 'object') {
      return res.status(400).json({ error: 'durees (objet) requis' });
    }

    // Valider que les valeurs sont des entiers positifs
    for (const [key, val] of Object.entries(durees)) {
      if (typeof val !== 'number' || val < 1 || !Number.isInteger(val)) {
        return res.status(400).json({ error: `Duree invalide pour "${key}": doit etre un entier positif` });
      }
    }

    const { data, error } = await admin()
      .from('labo_garanties_config')
      .upsert({
        prothesiste_id: req.prothesisteId,
        durees,
        updated_at: new Date().toISOString()
      }, { onConflict: 'prothesiste_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ config: data });
  } catch (e) {
    console.error('[LABO GARANTIES config PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ---- CRUD GARANTIES ----

// GET /api/labo/garanties — Liste avec filtres
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { statut, dentiste_id, type_travail, expiring_soon } = req.query;

    let query = admin()
      .from('labo_garanties')
      .select('*, dentistes_clients(nom, prenom, titre)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_debut', { ascending: false });

    if (statut) query = query.eq('statut', statut);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (type_travail) query = query.eq('type_travail', type_travail);

    if (expiring_soon === 'true') {
      const now = new Date().toISOString().split('T')[0];
      const dans90j = new Date();
      dans90j.setDate(dans90j.getDate() + 90);
      const date90 = dans90j.toISOString().split('T')[0];
      query = query.eq('statut', 'active').gte('date_fin', now).lte('date_fin', date90);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ garanties: data || [] });
  } catch (e) {
    console.error('[LABO GARANTIES GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/garanties/:id — Detail avec BL, case, reclamations
router.get('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { data: garantie, error } = await admin()
      .from('labo_garanties')
      .select('*, dentistes_clients(nom, prenom, titre, email, telephone)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !garantie) return res.status(404).json({ error: 'Garantie non trouvee' });

    // Charger BL lie
    let bl = null;
    if (garantie.bon_livraison_id) {
      const { data } = await admin()
        .from('bons_livraison')
        .select('id, numero_bl, date_bl, statut')
        .eq('id', garantie.bon_livraison_id)
        .maybeSingle();
      bl = data;
    }

    // Charger case production lie
    let caseProduction = null;
    if (garantie.case_production_id) {
      const { data } = await admin()
        .from('labo_production_cases')
        .select('id, numero_case, type_travail, statut')
        .eq('id', garantie.case_production_id)
        .maybeSingle();
      caseProduction = data;
    }

    // Charger reclamations
    const { data: reclamations } = await admin()
      .from('labo_garantie_reclamations')
      .select('*')
      .eq('garantie_id', garantie.id)
      .order('date_reclamation', { ascending: false });

    res.json({
      garantie,
      bon_livraison: bl,
      case_production: caseProduction,
      reclamations: reclamations || []
    });
  } catch (e) {
    console.error('[LABO GARANTIES detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/garanties — Creer une garantie
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.type_travail) {
      return res.status(400).json({ error: 'type_travail requis' });
    }

    // Determiner la duree
    const dureeMois = b.duree_mois || await getDureeForType(req.prothesisteId, b.type_travail);
    const dateDebut = b.date_debut || new Date().toISOString().split('T')[0];
    const dateFin = calculerDateFin(dateDebut, dureeMois);

    const { data, error } = await admin()
      .from('labo_garanties')
      .insert({
        prothesiste_id: req.prothesisteId,
        bon_livraison_id: b.bon_livraison_id || null,
        case_production_id: b.case_production_id || null,
        dentiste_id: b.dentiste_id || null,
        patient_ref: b.patient_ref || null,
        type_travail: b.type_travail,
        dents: b.dents || null,
        materiaux: b.materiaux || null,
        duree_mois: dureeMois,
        date_debut: dateDebut,
        date_fin: dateFin,
        statut: 'active',
        notes: b.notes || null
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ garantie: data });
  } catch (e) {
    console.error('[LABO GARANTIES POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// PUT /api/labo/garanties/:id — Modifier une garantie
router.put('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (b.notes !== undefined) updates.notes = b.notes;
    if (b.statut) updates.statut = b.statut;
    if (b.materiaux !== undefined) updates.materiaux = b.materiaux;
    if (b.patient_ref !== undefined) updates.patient_ref = b.patient_ref;

    // Extension de garantie
    if (b.duree_mois) {
      updates.duree_mois = b.duree_mois;
      // Recalculer date_fin si on change la duree
      const { data: existing } = await admin()
        .from('labo_garanties')
        .select('date_debut')
        .eq('id', req.params.id)
        .eq('prothesiste_id', req.prothesisteId)
        .single();
      if (existing) {
        updates.date_fin = calculerDateFin(existing.date_debut, b.duree_mois);
      }
    }

    const { data, error } = await admin()
      .from('labo_garanties')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Garantie non trouvee' });
    res.json({ garantie: data });
  } catch (e) {
    console.error('[LABO GARANTIES PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/garanties/:id/reclamation — Deposer une reclamation
router.post('/:id/reclamation', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    // Verifier que la garantie existe et appartient au prothesiste
    const { data: garantie, error: gErr } = await admin()
      .from('labo_garanties')
      .select('id, statut, date_fin')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (gErr || !garantie) return res.status(404).json({ error: 'Garantie non trouvee' });

    const b = req.body;
    if (!b.description) {
      return res.status(400).json({ error: 'description requise' });
    }

    // Creer la reclamation
    const { data: reclamation, error: rErr } = await admin()
      .from('labo_garantie_reclamations')
      .insert({
        garantie_id: garantie.id,
        description: b.description,
        cause: b.cause || null,
        photos: b.photos || null,
        date_reclamation: b.date_reclamation || new Date().toISOString().split('T')[0],
        remake_id: b.remake_id || null
      })
      .select()
      .single();

    if (rErr) throw rErr;

    // Mettre la garantie en statut reclamation
    await admin()
      .from('labo_garanties')
      .update({ statut: 'reclamation', updated_at: new Date().toISOString() })
      .eq('id', garantie.id);

    res.status(201).json({ reclamation });
  } catch (e) {
    console.error('[LABO GARANTIES reclamation]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
