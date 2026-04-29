// =============================================
// JADOMI LABO — Routes remakes / refabrications
// Suivi qualite et analytics des refabrications
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// -----------------------------------------------
// GET /api/labo/remakes/stats — Analytics qualité
// (doit être AVANT /:id pour éviter conflit route)
// -----------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const pid = req.prothesisteId;
    const db = admin();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();

    // Parallel queries for all stats
    const [
      totalMonth,
      totalQuarter,
      totalYear,
      byCause,
      byDentiste,
      byTechnicien,
      byTypeTravail,
      coutTotal,
      tendance,
      resolutionTime,
      totalBLValides
    ] = await Promise.all([
      // Total remakes this month
      db.from('labo_remakes').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid).gte('date_probleme', startOfMonth),
      // Total remakes this quarter
      db.from('labo_remakes').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid).gte('date_probleme', startOfQuarter),
      // Total remakes this year
      db.from('labo_remakes').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid).gte('date_probleme', startOfYear),
      // By cause
      db.from('labo_remakes').select('cause')
        .eq('prothesiste_id', pid).gte('date_probleme', startOfYear),
      // By dentiste (with name)
      db.from('labo_remakes').select('dentiste_id, dentistes_clients(nom, prenom, titre)')
        .eq('prothesiste_id', pid).gte('date_probleme', startOfYear).not('dentiste_id', 'is', null),
      // By technicien
      db.from('labo_remakes').select('technicien_responsable')
        .eq('prothesiste_id', pid).gte('date_probleme', startOfYear).not('technicien_responsable', 'is', null),
      // By type_travail
      db.from('labo_remakes').select('type_travail')
        .eq('prothesiste_id', pid).gte('date_probleme', startOfYear).not('type_travail', 'is', null),
      // Cout total
      db.from('labo_remakes').select('cout_remake')
        .eq('prothesiste_id', pid).gte('date_probleme', startOfYear),
      // Tendance 12 mois
      db.from('labo_remakes').select('date_probleme')
        .eq('prothesiste_id', pid).gte('date_probleme', twelveMonthsAgo),
      // Temps moyen resolution (resolved only)
      db.from('labo_remakes').select('date_probleme, date_resolution')
        .eq('prothesiste_id', pid).in('statut', ['resolu', 'ferme']).not('date_resolution', 'is', null),
      // Total BL valides this year (for taux calculation)
      db.from('bons_livraison').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid).eq('statut', 'livre').gte('date_bl', startOfYear)
    ]);

    // Aggregate by cause
    const causeMap = {};
    (byCause.data || []).forEach(r => {
      causeMap[r.cause] = (causeMap[r.cause] || 0) + 1;
    });
    const remakes_par_cause = Object.entries(causeMap)
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count);

    // Aggregate by dentiste (top 5)
    const dentisteMap = {};
    (byDentiste.data || []).forEach(r => {
      const key = r.dentiste_id;
      if (!dentisteMap[key]) {
        const d = r.dentistes_clients;
        dentisteMap[key] = {
          dentiste_id: key,
          nom: d ? `${d.titre || 'Dr'} ${d.prenom || ''} ${d.nom}`.trim() : key,
          count: 0
        };
      }
      dentisteMap[key].count++;
    });
    const remakes_par_dentiste = Object.values(dentisteMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Aggregate by technicien
    const techMap = {};
    (byTechnicien.data || []).forEach(r => {
      techMap[r.technicien_responsable] = (techMap[r.technicien_responsable] || 0) + 1;
    });
    const remakes_par_technicien = Object.entries(techMap)
      .map(([technicien, count]) => ({ technicien, count }))
      .sort((a, b) => b.count - a.count);

    // Aggregate by type_travail
    const typeMap = {};
    (byTypeTravail.data || []).forEach(r => {
      typeMap[r.type_travail] = (typeMap[r.type_travail] || 0) + 1;
    });
    const remakes_par_type_travail = Object.entries(typeMap)
      .map(([type_travail, count]) => ({ type_travail, count }))
      .sort((a, b) => b.count - a.count);

    // Cout total
    const cout_total = (coutTotal.data || []).reduce((sum, r) => sum + (parseFloat(r.cout_remake) || 0), 0);

    // Tendance mensuelle (12 derniers mois)
    const tendanceMap = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      tendanceMap[key] = 0;
    }
    (tendance.data || []).forEach(r => {
      const d = new Date(r.date_probleme);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (tendanceMap[key] !== undefined) tendanceMap[key]++;
    });
    const tendance_mensuelle = Object.entries(tendanceMap)
      .map(([mois, count]) => ({ mois, count }))
      .sort((a, b) => a.mois.localeCompare(b.mois));

    // Temps moyen resolution (jours)
    let temps_moyen_resolution_jours = null;
    const resolved = resolutionTime.data || [];
    if (resolved.length > 0) {
      const totalDays = resolved.reduce((sum, r) => {
        const diff = new Date(r.date_resolution) - new Date(r.date_probleme);
        return sum + diff / (1000 * 60 * 60 * 24);
      }, 0);
      temps_moyen_resolution_jours = Math.round((totalDays / resolved.length) * 10) / 10;
    }

    // Taux de remake
    const totalBL = totalBLValides.count || 0;
    const totalRemakesYear = totalYear.count || 0;
    const taux_remake = totalBL > 0 ? Math.round((totalRemakesYear / totalBL) * 10000) / 100 : 0;

    res.json({
      stats: {
        total_mois: totalMonth.count || 0,
        total_trimestre: totalQuarter.count || 0,
        total_annee: totalRemakesYear,
        taux_remake,
        total_bl_valides: totalBL,
        remakes_par_cause,
        remakes_par_dentiste,
        remakes_par_technicien,
        remakes_par_type_travail,
        cout_total: Math.round(cout_total * 100) / 100,
        tendance_mensuelle,
        temps_moyen_resolution_jours
      }
    });
  } catch (e) {
    console.error('[LABO REMAKES stats]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// -----------------------------------------------
// GET /api/labo/remakes — Liste remakes avec filtres
// -----------------------------------------------
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { cause, dentiste_id, technicien_id, type_travail, from, to, statut, page, limit: lim } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageSize = Math.min(parseInt(lim) || 20, 100);
    const offset = (pageNum - 1) * pageSize;

    let query = admin()
      .from('labo_remakes')
      .select('*, dentistes_clients(nom, prenom, titre)', { count: 'exact' })
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_probleme', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (cause) query = query.eq('cause', cause);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (technicien_id) query = query.eq('technicien_responsable', technicien_id);
    if (type_travail) query = query.eq('type_travail', type_travail);
    if (statut) query = query.eq('statut', statut);
    if (from) query = query.gte('date_probleme', from);
    if (to) query = query.lte('date_probleme', to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      remakes: data || [],
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: count || 0,
        pages: Math.ceil((count || 0) / pageSize)
      }
    });
  } catch (e) {
    console.error('[LABO REMAKES GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// -----------------------------------------------
// GET /api/labo/remakes/:id — Detail remake
// -----------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { data: remake, error } = await admin()
      .from('labo_remakes')
      .select('*, dentistes_clients(nom, prenom, titre, email, telephone)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !remake) return res.status(404).json({ error: 'Remake non trouvé' });

    // Charger info case production si lie
    let caseProduction = null;
    if (remake.case_production_id) {
      const { data } = await admin()
        .from('labo_production_cases')
        .select('*')
        .eq('id', remake.case_production_id)
        .single();
      caseProduction = data;
    }

    // Charger BL original si lie
    let blOriginal = null;
    if (remake.bon_livraison_id) {
      const { data } = await admin()
        .from('bons_livraison')
        .select('id, numero_bl, date_bl, total_ttc, statut')
        .eq('id', remake.bon_livraison_id)
        .single();
      blOriginal = data;
    }

    // Charger nouveau BL si existe
    let nouveauBl = null;
    if (remake.nouveau_bl_id) {
      const { data } = await admin()
        .from('bons_livraison')
        .select('id, numero_bl, date_bl, total_ttc, statut')
        .eq('id', remake.nouveau_bl_id)
        .single();
      nouveauBl = data;
    }

    res.json({ remake, case_production: caseProduction, bl_original: blOriginal, nouveau_bl: nouveauBl });
  } catch (e) {
    console.error('[LABO REMAKES detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// -----------------------------------------------
// POST /api/labo/remakes — Creer un remake
// -----------------------------------------------
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.cause) {
      return res.status(400).json({ error: 'cause est requis' });
    }

    const validCauses = ['adaptation', 'fracture', 'esthetique', 'teinte', 'occlusion', 'matiere_defectueuse', 'erreur_conception', 'erreur_fabrication', 'autre'];
    if (!validCauses.includes(b.cause)) {
      return res.status(400).json({ error: `cause invalide. Valeurs: ${validCauses.join(', ')}` });
    }

    const validResponsabilites = ['labo', 'dentiste', 'fournisseur', 'patient'];
    if (b.responsabilite && !validResponsabilites.includes(b.responsabilite)) {
      return res.status(400).json({ error: `responsabilite invalide. Valeurs: ${validResponsabilites.join(', ')}` });
    }

    const insert = {
      prothesiste_id: req.prothesisteId,
      case_production_id: b.case_production_id || null,
      bon_livraison_id: b.bon_livraison_id || null,
      dentiste_id: b.dentiste_id || null,
      type_travail: b.type_travail || null,
      cause: b.cause,
      description_probleme: b.description_probleme || null,
      responsabilite: b.responsabilite || 'labo',
      cout_remake: b.cout_remake || 0,
      photos_probleme: b.photos_probleme || null,
      technicien_responsable: b.technicien_responsable || null,
      action_corrective: b.action_corrective || null,
      date_probleme: b.date_probleme || new Date().toISOString()
    };

    const { data, error } = await admin()
      .from('labo_remakes')
      .insert(insert)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, remake: data });
  } catch (e) {
    console.error('[LABO REMAKES POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// -----------------------------------------------
// PUT /api/labo/remakes/:id — Modifier un remake
// -----------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const { data: existing } = await admin()
      .from('labo_remakes')
      .select('id, statut')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!existing) return res.status(404).json({ error: 'Remake non trouvé' });
    if (existing.statut === 'ferme') {
      return res.status(400).json({ error: 'Remake fermé, modification impossible' });
    }

    const b = req.body;
    const updates = { updated_at: new Date().toISOString() };
    const allowed = [
      'case_production_id', 'bon_livraison_id', 'dentiste_id', 'type_travail',
      'cause', 'description_probleme', 'responsabilite', 'cout_remake',
      'photos_probleme', 'technicien_responsable', 'action_corrective',
      'resolution', 'statut', 'date_resolution', 'nouveau_bl_id'
    ];

    for (const k of allowed) {
      if (b[k] !== undefined) updates[k] = b[k];
    }

    const { data, error } = await admin()
      .from('labo_remakes')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, remake: data });
  } catch (e) {
    console.error('[LABO REMAKES PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// -----------------------------------------------
// POST /api/labo/remakes/:id/resoudre — Clore un remake
// -----------------------------------------------
router.post('/:id/resoudre', async (req, res) => {
  try {
    const { data: existing } = await admin()
      .from('labo_remakes')
      .select('id, statut')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!existing) return res.status(404).json({ error: 'Remake non trouvé' });
    if (existing.statut === 'ferme') {
      return res.status(400).json({ error: 'Remake déjà fermé' });
    }

    const b = req.body;
    if (!b.resolution) {
      return res.status(400).json({ error: 'resolution est requis' });
    }

    const updates = {
      resolution: b.resolution,
      statut: 'resolu',
      date_resolution: b.date_resolution || new Date().toISOString(),
      nouveau_bl_id: b.nouveau_bl_id || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await admin()
      .from('labo_remakes')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, remake: data });
  } catch (e) {
    console.error('[LABO REMAKES resoudre]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
