// =============================================
// JADOMI LABO — Routes techniciens + KPI dashboard
// Gestion des techniciens et analytics labo
// =============================================

const express = require('express');
const router = express.Router();
const kpiRouter = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// ---- VALID SPECIALITES ----
const VALID_SPECIALITES = ['ceramique', 'cao', 'usinage', 'finition', 'controle', 'reparation'];

// ---- HELPERS ----
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
}
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
}
function startOfPrevMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1).toISOString().split('T')[0];
}
function endOfPrevMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 0).toISOString().split('T')[0];
}

// =============================================
// GET /api/labo/techniciens — Liste des techniciens
// =============================================
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { statut } = req.query;
    let query = admin()
      .from('labo_techniciens')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .order('nom');

    if (statut) query = query.eq('statut', statut);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ techniciens: data || [] });
  } catch (e) {
    console.error('[LABO techniciens GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// POST /api/labo/techniciens — Ajouter un technicien
// =============================================
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { nom, prenom, email, telephone, specialites, date_embauche, statut, taux_horaire } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Nom requis' });

    // Validate specialites
    const specs = Array.isArray(specialites) ? specialites.filter(s => VALID_SPECIALITES.includes(s)) : [];

    // Validate statut
    const validStatut = ['actif', 'inactif'].includes(statut) ? statut : 'actif';

    const { data, error } = await admin()
      .from('labo_techniciens')
      .insert({
        prothesiste_id: req.prothesisteId,
        nom: nom.trim(),
        prenom: prenom ? prenom.trim() : null,
        email: email ? email.trim().toLowerCase() : null,
        telephone: telephone ? telephone.trim() : null,
        specialites: specs,
        date_embauche: date_embauche || null,
        statut: validStatut,
        taux_horaire: taux_horaire ? Number(taux_horaire) : null
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ technicien: data });
  } catch (e) {
    console.error('[LABO techniciens POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// PUT /api/labo/techniciens/:id — Modifier un technicien
// =============================================
router.put('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { id } = req.params;
    const { nom, prenom, email, telephone, specialites, date_embauche, statut, taux_horaire } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (nom !== undefined) updates.nom = nom.trim();
    if (prenom !== undefined) updates.prenom = prenom ? prenom.trim() : null;
    if (email !== undefined) updates.email = email ? email.trim().toLowerCase() : null;
    if (telephone !== undefined) updates.telephone = telephone ? telephone.trim() : null;
    if (specialites !== undefined) {
      updates.specialites = Array.isArray(specialites) ? specialites.filter(s => VALID_SPECIALITES.includes(s)) : [];
    }
    if (date_embauche !== undefined) updates.date_embauche = date_embauche || null;
    if (statut !== undefined && ['actif', 'inactif'].includes(statut)) updates.statut = statut;
    if (taux_horaire !== undefined) updates.taux_horaire = taux_horaire ? Number(taux_horaire) : null;

    const { data, error } = await admin()
      .from('labo_techniciens')
      .update(updates)
      .eq('id', id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Technicien non trouve' });
    res.json({ technicien: data });
  } catch (e) {
    console.error('[LABO techniciens PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// DELETE /api/labo/techniciens/:id — Desactiver (soft delete)
// =============================================
router.delete('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { id } = req.params;
    const { data, error } = await admin()
      .from('labo_techniciens')
      .update({ statut: 'inactif', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Technicien non trouve' });
    res.json({ message: 'Technicien desactive', technicien: data });
  } catch (e) {
    console.error('[LABO techniciens DELETE]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/labo/techniciens/:id/stats — Stats individuelles
// =============================================
router.get('/:id/stats', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { id } = req.params;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Verify technicien belongs to this prothesiste
    const { data: tech, error: techErr } = await admin()
      .from('labo_techniciens')
      .select('id, nom, prenom')
      .eq('id', id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (techErr || !tech) return res.status(404).json({ error: 'Technicien non trouve' });

    // Parallel queries
    const [
      casesMonthRes,
      casesTotalRes,
      etapesRes,
      remakesRes,
      totalCasesRes,
      revenueRes
    ] = await Promise.all([
      // Cases completed this month
      admin()
        .from('labo_production_cases')
        .select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', req.prothesisteId)
        .eq('technicien_id', id)
        .eq('statut', 'termine')
        .gte('date_livraison_reelle', monthStart)
        .lte('date_livraison_reelle', monthEnd),

      // Cases total completed
      admin()
        .from('labo_production_cases')
        .select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', req.prothesisteId)
        .eq('technicien_id', id)
        .eq('statut', 'termine'),

      // Etapes for average time
      admin()
        .from('labo_production_etapes')
        .select('etape, duree_minutes')
        .eq('technicien_id', id)
        .not('duree_minutes', 'is', null),

      // Remakes (cases of type reparation for this tech)
      admin()
        .from('labo_production_cases')
        .select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', req.prothesisteId)
        .eq('technicien_id', id)
        .eq('type_travail', 'reparation'),

      // Total cases by this prothesiste (for remake rate denominator)
      admin()
        .from('labo_production_cases')
        .select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', req.prothesisteId)
        .eq('technicien_id', id),

      // Revenue: BL totals for cases assigned to this tech
      admin()
        .from('labo_production_cases')
        .select('bon_livraison_id')
        .eq('prothesiste_id', req.prothesisteId)
        .eq('technicien_id', id)
        .not('bon_livraison_id', 'is', null)
    ]);

    // Average time per stage
    const etapes = etapesRes.data || [];
    const stageMap = {};
    for (const e of etapes) {
      if (!stageMap[e.etape]) stageMap[e.etape] = { total: 0, count: 0 };
      stageMap[e.etape].total += Number(e.duree_minutes);
      stageMap[e.etape].count += 1;
    }
    const tempsParEtape = {};
    for (const [stage, v] of Object.entries(stageMap)) {
      tempsParEtape[stage] = Math.round(v.total / v.count);
    }

    // Specialization breakdown from cases
    const { data: specCases } = await admin()
      .from('labo_production_cases')
      .select('type_travail')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('technicien_id', id);

    const specBreakdown = {};
    for (const c of (specCases || [])) {
      specBreakdown[c.type_travail] = (specBreakdown[c.type_travail] || 0) + 1;
    }

    // Revenue from BL
    let revenueTotal = 0;
    const blIds = (revenueRes.data || []).map(c => c.bon_livraison_id).filter(Boolean);
    if (blIds.length > 0) {
      const { data: bls } = await admin()
        .from('bons_livraison')
        .select('total_ttc')
        .in('id', blIds);
      revenueTotal = (bls || []).reduce((s, b) => s + (Number(b.total_ttc) || 0), 0);
    }

    const totalForRate = totalCasesRes.count || 0;
    const remakeCount = remakesRes.count || 0;

    res.json({
      technicien: tech,
      stats: {
        cases_mois: casesMonthRes.count || 0,
        cases_total: casesTotalRes.count || 0,
        temps_moyen_par_etape: tempsParEtape,
        taux_remake: totalForRate > 0 ? Math.round((remakeCount / totalForRate) * 10000) / 100 : 0,
        specialisation: specBreakdown,
        revenu_attribue: Math.round(revenueTotal * 100) / 100
      }
    });
  } catch (e) {
    console.error('[LABO technicien stats]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/labo/kpi — Dashboard KPI global
// =============================================
kpiRouter.get('/kpi', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const prevMonthStart = startOfPrevMonth(now);
    const prevMonthEnd = endOfPrevMonth(now);
    const daysInMonth = now.getDate();

    // 12 months ago for chart
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split('T')[0];

    const pid = req.prothesisteId;

    const [
      // CA this month
      caMonthRes,
      // CA previous month
      caPrevRes,
      // CA by month (12 months)
      caByMonthRes,
      // BL this month
      blMonthRes,
      // Factures emises vs payees this month
      factEmisesRes,
      factPayeesRes,
      // Top 5 dentistes by CA (all time for meaningful data, could scope to period)
      topDentistesRes,
      // Top 5 produits by volume
      topProduitsRes,
      // Remake rate
      remakeCountRes,
      totalCasesRes,
      // Delai moyen livraison
      delaiRes,
      // Cases en cours by stage
      pipelineRes,
      // Stock mouvements (sorties) this month for margin
      stockCoutRes,
      // Techniciens actifs (for occupation)
      techActifsRes,
      // Heures travaillees this month (etapes)
      heuresTravailRes
    ] = await Promise.all([
      // CA this month
      admin().from('factures_labo').select('total_ttc')
        .eq('prothesiste_id', pid)
        .gte('date_facture', monthStart).lte('date_facture', monthEnd)
        .in('statut', ['emise', 'payee']),

      // CA previous month
      admin().from('factures_labo').select('total_ttc')
        .eq('prothesiste_id', pid)
        .gte('date_facture', prevMonthStart).lte('date_facture', prevMonthEnd)
        .in('statut', ['emise', 'payee']),

      // CA by month (12 months) — get all factures in range, group client-side
      admin().from('factures_labo').select('date_facture, total_ttc')
        .eq('prothesiste_id', pid)
        .gte('date_facture', twelveMonthsAgo)
        .in('statut', ['emise', 'payee'])
        .order('date_facture'),

      // BL this month
      admin().from('bons_livraison').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid)
        .gte('date_bl', monthStart).lte('date_bl', monthEnd),

      // Factures emises this month
      admin().from('factures_labo').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid)
        .gte('date_facture', monthStart).lte('date_facture', monthEnd)
        .in('statut', ['emise', 'payee']),

      // Factures payees this month
      admin().from('factures_labo').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid)
        .gte('date_facture', monthStart).lte('date_facture', monthEnd)
        .eq('statut', 'payee'),

      // Top 5 dentistes by CA
      admin().from('factures_labo').select('dentiste_id, total_ttc, dentistes_clients(nom, prenom, titre)')
        .eq('prothesiste_id', pid)
        .in('statut', ['emise', 'payee']),

      // Top 5 produits by volume — from lignes_bl via BL
      admin().from('bons_livraison').select('lignes_bl(designation, quantite)')
        .eq('prothesiste_id', pid),

      // Remake count (reparation cases)
      admin().from('labo_production_cases').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid)
        .eq('type_travail', 'reparation'),

      // Total cases
      admin().from('labo_production_cases').select('id', { count: 'exact', head: true })
        .eq('prothesiste_id', pid),

      // Delai moyen: cases with both dates
      admin().from('labo_production_cases')
        .select('date_reception, date_livraison_reelle')
        .eq('prothesiste_id', pid)
        .eq('statut', 'termine')
        .not('date_livraison_reelle', 'is', null),

      // Cases en cours by stage
      admin().from('labo_production_cases').select('etape_actuelle')
        .eq('prothesiste_id', pid)
        .eq('statut', 'en_cours'),

      // Stock sorties this month (cout materiaux)
      admin().from('labo_stock_mouvements')
        .select('quantite, labo_stock(prix_unitaire)')
        .eq('type_mouvement', 'sortie')
        .gte('created_at', monthStart),

      // Techniciens actifs
      admin().from('labo_techniciens').select('id, taux_horaire', { count: 'exact' })
        .eq('prothesiste_id', pid)
        .eq('statut', 'actif'),

      // Heures travaillees this month
      admin().from('labo_production_etapes')
        .select('technicien_id, duree_minutes')
        .gte('debut', monthStart)
        .lte('debut', monthEnd)
        .not('duree_minutes', 'is', null)
    ]);

    // --- CA ---
    const caMois = (caMonthRes.data || []).reduce((s, f) => s + (Number(f.total_ttc) || 0), 0);
    const caPrev = (caPrevRes.data || []).reduce((s, f) => s + (Number(f.total_ttc) || 0), 0);
    const caTrend = caPrev > 0 ? Math.round(((caMois - caPrev) / caPrev) * 10000) / 100 : null;

    // --- CA by month ---
    const caParMois = {};
    for (const f of (caByMonthRes.data || [])) {
      const month = f.date_facture ? f.date_facture.substring(0, 7) : null;
      if (month) caParMois[month] = (caParMois[month] || 0) + (Number(f.total_ttc) || 0);
    }
    const caChart = Object.entries(caParMois).map(([mois, ca]) => ({
      mois,
      ca: Math.round(ca * 100) / 100
    }));

    // --- BL ---
    const blMois = blMonthRes.count || 0;
    const blMoyenJour = daysInMonth > 0 ? Math.round((blMois / daysInMonth) * 100) / 100 : 0;

    // --- Recouvrement ---
    const factEmises = factEmisesRes.count || 0;
    const factPayees = factPayeesRes.count || 0;
    const tauxRecouvrement = factEmises > 0 ? Math.round((factPayees / factEmises) * 10000) / 100 : 100;

    // --- Top 5 dentistes ---
    const dentisteCa = {};
    for (const f of (topDentistesRes.data || [])) {
      const did = f.dentiste_id;
      if (!dentisteCa[did]) {
        const d = f.dentistes_clients || {};
        dentisteCa[did] = {
          dentiste_id: did,
          nom: [d.titre, d.prenom, d.nom].filter(Boolean).join(' '),
          ca: 0
        };
      }
      dentisteCa[did].ca += Number(f.total_ttc) || 0;
    }
    const top5Dentistes = Object.values(dentisteCa)
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5)
      .map(d => ({ ...d, ca: Math.round(d.ca * 100) / 100 }));

    // --- Top 5 produits ---
    const produitVol = {};
    for (const bl of (topProduitsRes.data || [])) {
      for (const l of (bl.lignes_bl || [])) {
        const key = l.designation || 'Inconnu';
        produitVol[key] = (produitVol[key] || 0) + (Number(l.quantite) || 0);
      }
    }
    const top5Produits = Object.entries(produitVol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([designation, volume]) => ({ designation, volume }));

    // --- Taux remake ---
    const remakes = remakeCountRes.count || 0;
    const totalCases = totalCasesRes.count || 0;
    const tauxRemake = totalCases > 0 ? Math.round((remakes / totalCases) * 10000) / 100 : 0;

    // --- Delai moyen ---
    const delais = (delaiRes.data || []).map(c => {
      const rec = new Date(c.date_reception);
      const liv = new Date(c.date_livraison_reelle);
      return Math.round((liv - rec) / (1000 * 60 * 60 * 24));
    }).filter(d => d >= 0);
    const delaiMoyen = delais.length > 0 ? Math.round((delais.reduce((s, d) => s + d, 0) / delais.length) * 10) / 10 : null;

    // --- Pipeline ---
    const pipeline = {};
    for (const c of (pipelineRes.data || [])) {
      pipeline[c.etape_actuelle] = (pipeline[c.etape_actuelle] || 0) + 1;
    }

    // --- Marge estimee ---
    let coutMateriaux = 0;
    // Filter stock mouvements by prothesiste (via stock join)
    for (const m of (stockCoutRes.data || [])) {
      const prixUnit = m.labo_stock?.prix_unitaire || 0;
      coutMateriaux += Math.abs(Number(m.quantite)) * Number(prixUnit);
    }
    const margeEstimee = Math.round((caMois - coutMateriaux) * 100) / 100;

    // --- Taux occupation techniciens ---
    const techActifs = techActifsRes.data || [];
    const nbTech = techActifs.length;
    // Assume 7h/day, ~22 working days/month = 154h = 9240min
    const heuresDispoParTech = 154 * 60; // in minutes
    const heuresByTech = {};
    for (const e of (heuresTravailRes.data || [])) {
      if (e.technicien_id) {
        heuresByTech[e.technicien_id] = (heuresByTech[e.technicien_id] || 0) + Number(e.duree_minutes);
      }
    }
    const totalMinTravail = Object.values(heuresByTech).reduce((s, v) => s + v, 0);
    const totalMinDispo = nbTech * heuresDispoParTech;
    const tauxOccupation = totalMinDispo > 0 ? Math.round((totalMinTravail / totalMinDispo) * 10000) / 100 : 0;

    res.json({
      kpi: {
        ca: {
          mois_courant: Math.round(caMois * 100) / 100,
          mois_precedent: Math.round(caPrev * 100) / 100,
          trend_pct: caTrend
        },
        ca_par_mois: caChart,
        bons_livraison: {
          mois_courant: blMois,
          moyenne_par_jour: blMoyenJour
        },
        recouvrement: {
          factures_emises: factEmises,
          factures_payees: factPayees,
          taux_pct: tauxRecouvrement
        },
        top5_dentistes: top5Dentistes,
        top5_produits: top5Produits,
        taux_remake_pct: tauxRemake,
        delai_moyen_jours: delaiMoyen,
        pipeline_production: pipeline,
        marge_estimee: {
          ca_mois: Math.round(caMois * 100) / 100,
          cout_materiaux: Math.round(coutMateriaux * 100) / 100,
          marge: margeEstimee
        },
        taux_occupation_techniciens_pct: tauxOccupation,
        nb_techniciens_actifs: nbTech
      }
    });
  } catch (e) {
    console.error('[LABO KPI]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// GET /api/labo/kpi/export — Export KPI en CSV
// =============================================
kpiRouter.get('/kpi/export', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const pid = req.prothesisteId;

    // Factures of the month for export
    const { data: factures } = await admin()
      .from('factures_labo')
      .select('numero_facture, date_facture, total_ht_exonere, total_ht_taxable, total_tva, total_ttc, statut, dentistes_clients(nom, prenom, titre)')
      .eq('prothesiste_id', pid)
      .gte('date_facture', monthStart)
      .lte('date_facture', monthEnd)
      .order('date_facture');

    // BL count
    const { count: blCount } = await admin()
      .from('bons_livraison')
      .select('id', { count: 'exact', head: true })
      .eq('prothesiste_id', pid)
      .gte('date_bl', monthStart)
      .lte('date_bl', monthEnd);

    // Build CSV
    const lines = [];
    const moisLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Summary section
    lines.push('RAPPORT KPI LABORATOIRE');
    lines.push(`Periode;${moisLabel}`);
    lines.push(`Date export;${now.toISOString().split('T')[0]}`);
    lines.push('');

    // Factures detail
    lines.push('DETAIL FACTURES DU MOIS');
    lines.push('Numero;Date;Dentiste;HT Exonere;HT Taxable;TVA;TTC;Statut');
    let totalTTC = 0;
    for (const f of (factures || [])) {
      const d = f.dentistes_clients || {};
      const dentiste = [d.titre, d.prenom, d.nom].filter(Boolean).join(' ');
      lines.push([
        f.numero_facture,
        f.date_facture,
        dentiste.replace(/;/g, ','),
        Number(f.total_ht_exonere || 0).toFixed(2),
        Number(f.total_ht_taxable || 0).toFixed(2),
        Number(f.total_tva || 0).toFixed(2),
        Number(f.total_ttc || 0).toFixed(2),
        f.statut
      ].join(';'));
      totalTTC += Number(f.total_ttc) || 0;
    }
    lines.push('');
    lines.push(`TOTAL TTC;${totalTTC.toFixed(2)}`);
    lines.push(`Nombre de factures;${(factures || []).length}`);
    lines.push(`Nombre de BL;${blCount || 0}`);

    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kpi-labo-${moisLabel}.csv"`);
    // BOM for Excel UTF-8
    res.send('\uFEFF' + csv);
  } catch (e) {
    console.error('[LABO KPI export]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = { router, kpiRouter };
