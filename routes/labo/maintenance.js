// =============================================
// JADOMI LABO — Routes maintenance machines
// Suivi equipements, interventions, alertes
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

const TYPES_MACHINE = [
  'four_ceramique','four_frittage','fraiseuse_cao','imprimante_3d',
  'scanner_3d','polisseuse','compresseur','autoclave','aspirateur','autre'
];

// GET /api/labo/maintenance/machines — Liste machines avec statut maintenance
router.get('/machines', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { type_machine, statut, search } = req.query;
    let query = admin().from('labo_machines').select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .neq('statut', 'inactif')
      .order('nom');
    if (type_machine) query = query.eq('type_machine', type_machine);
    if (statut) query = query.eq('statut', statut);
    if (search) {
      const s = search.replace(/[%_,().]/g, '');
      query = query.or(`nom.ilike.%${s}%,marque.ilike.%${s}%,modele.ilike.%${s}%,numero_serie.ilike.%${s}%`);
    }
    query = query.limit(200);
    const { data, error } = await query;
    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    const j7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const machines = (data || []).map(m => {
      let alerte = null;
      if (m.prochaine_maintenance) {
        if (m.prochaine_maintenance <= today) alerte = 'en_retard';
        else if (m.prochaine_maintenance <= j7) alerte = 'proche';
      }
      return { ...m, alerte };
    });

    res.json({ machines });
  } catch (e) {
    console.error('[LABO maintenance] GET machines', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/maintenance/machines/:id — Detail machine + historique
router.get('/machines/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { data: machine, error } = await admin().from('labo_machines').select('*')
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId).single();
    if (error || !machine) return res.status(404).json({ error: 'Machine introuvable' });

    const { data: interventions } = await admin().from('labo_interventions').select('*')
      .eq('machine_id', machine.id).order('date_intervention', { ascending: false });

    const today = new Date().toISOString().split('T')[0];
    let alerte = null;
    if (machine.prochaine_maintenance) {
      if (machine.prochaine_maintenance <= today) alerte = 'en_retard';
      else if (machine.prochaine_maintenance <= new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]) alerte = 'proche';
    }

    res.json({ machine: { ...machine, alerte }, interventions: interventions || [] });
  } catch (e) {
    console.error('[LABO maintenance] GET machine detail', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/maintenance/machines — Ajouter une machine
router.post('/machines', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { nom, type_machine, marque, modele, numero_serie, date_achat,
      fournisseur, cout_achat, frequence_maintenance_jours, compteur_heures,
      notes, photo_url } = req.body;

    if (!nom || !type_machine) return res.status(400).json({ error: 'nom et type_machine requis' });
    if (!TYPES_MACHINE.includes(type_machine)) return res.status(400).json({ error: 'type_machine invalide' });

    const freq = frequence_maintenance_jours || 90;
    const prochaine = new Date(Date.now() + freq * 86400000).toISOString().split('T')[0];

    const { data, error } = await admin().from('labo_machines').insert({
      prothesiste_id: req.prothesisteId,
      nom, type_machine, marque, modele, numero_serie,
      date_achat: date_achat || null,
      fournisseur, cout_achat: cout_achat || null,
      frequence_maintenance_jours: freq,
      compteur_heures: compteur_heures || 0,
      prochaine_maintenance: prochaine,
      photo_url, notes
    }).select().single();
    if (error) throw error;

    res.status(201).json({ machine: data });
  } catch (e) {
    console.error('[LABO maintenance] POST machine', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// PUT /api/labo/maintenance/machines/:id — Modifier machine
router.put('/machines/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { nom, type_machine, marque, modele, numero_serie, date_achat,
      fournisseur, cout_achat, frequence_maintenance_jours, compteur_heures,
      notes, photo_url, statut } = req.body;

    if (type_machine && !TYPES_MACHINE.includes(type_machine))
      return res.status(400).json({ error: 'type_machine invalide' });
    if (statut && !['actif','en_panne','en_maintenance','inactif'].includes(statut))
      return res.status(400).json({ error: 'statut invalide' });

    const updates = { updated_at: new Date().toISOString() };
    if (nom !== undefined) updates.nom = nom;
    if (type_machine !== undefined) updates.type_machine = type_machine;
    if (marque !== undefined) updates.marque = marque;
    if (modele !== undefined) updates.modele = modele;
    if (numero_serie !== undefined) updates.numero_serie = numero_serie;
    if (date_achat !== undefined) updates.date_achat = date_achat || null;
    if (fournisseur !== undefined) updates.fournisseur = fournisseur;
    if (cout_achat !== undefined) updates.cout_achat = cout_achat;
    if (frequence_maintenance_jours !== undefined) updates.frequence_maintenance_jours = frequence_maintenance_jours;
    if (compteur_heures !== undefined) updates.compteur_heures = compteur_heures;
    if (notes !== undefined) updates.notes = notes;
    if (photo_url !== undefined) updates.photo_url = photo_url;
    if (statut !== undefined) updates.statut = statut;

    const { data, error } = await admin().from('labo_machines').update(updates)
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Machine introuvable' });

    res.json({ machine: data });
  } catch (e) {
    console.error('[LABO maintenance] PUT machine', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// DELETE /api/labo/maintenance/machines/:id — Desactiver (soft delete)
router.delete('/machines/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const { data, error } = await admin().from('labo_machines')
      .update({ statut: 'inactif', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Machine introuvable' });

    res.json({ ok: true, message: 'Machine desactivee' });
  } catch (e) {
    console.error('[LABO maintenance] DELETE machine', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/maintenance/machines/:id/intervention — Enregistrer intervention
router.post('/machines/:id/intervention', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    // Verifier que la machine appartient au prothesiste
    const { data: machine, error: mErr } = await admin().from('labo_machines').select('id, frequence_maintenance_jours')
      .eq('id', req.params.id).eq('prothesiste_id', req.prothesisteId).single();
    if (mErr || !machine) return res.status(404).json({ error: 'Machine introuvable' });

    const { type_intervention, description, technicien, cout,
      pieces_remplacees, duree_minutes, prochaine_maintenance_prevue } = req.body;

    if (type_intervention && !['preventive','corrective','calibration','nettoyage'].includes(type_intervention))
      return res.status(400).json({ error: 'type_intervention invalide' });

    const today = new Date().toISOString().split('T')[0];
    const prochaine = prochaine_maintenance_prevue ||
      new Date(Date.now() + (machine.frequence_maintenance_jours || 90) * 86400000).toISOString().split('T')[0];

    // Inserer intervention
    const { data: intervention, error: iErr } = await admin().from('labo_interventions').insert({
      machine_id: machine.id,
      type_intervention: type_intervention || 'preventive',
      description, technicien, cout: cout || null,
      pieces_remplacees, duree_minutes: duree_minutes || null,
      prochaine_prevue: prochaine
    }).select().single();
    if (iErr) throw iErr;

    // Mettre a jour la machine
    const { error: uErr } = await admin().from('labo_machines').update({
      derniere_maintenance: today,
      prochaine_maintenance: prochaine,
      statut: 'actif',
      updated_at: new Date().toISOString()
    }).eq('id', machine.id);
    if (uErr) throw uErr;

    res.status(201).json({ intervention });
  } catch (e) {
    console.error('[LABO maintenance] POST intervention', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/maintenance/alertes — Machines en retard ou proches
router.get('/alertes', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const today = new Date().toISOString().split('T')[0];
    const j7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const { data: enRetard } = await admin().from('labo_machines').select('id,nom,type_machine,marque,modele,prochaine_maintenance,statut')
      .eq('prothesiste_id', req.prothesisteId).neq('statut', 'inactif')
      .lte('prochaine_maintenance', today).not('prochaine_maintenance', 'is', null);

    const { data: proches } = await admin().from('labo_machines').select('id,nom,type_machine,marque,modele,prochaine_maintenance,statut')
      .eq('prothesiste_id', req.prothesisteId).neq('statut', 'inactif')
      .gt('prochaine_maintenance', today).lte('prochaine_maintenance', j7);

    res.json({
      en_retard: enRetard || [],
      proches: proches || [],
      total_alertes: (enRetard || []).length + (proches || []).length
    });
  } catch (e) {
    console.error('[LABO maintenance] GET alertes', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/maintenance/stats — Statistiques maintenance
router.get('/stats', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const debutAnnee = new Date(now.getFullYear(), 0, 1).toISOString();
    const today = now.toISOString().split('T')[0];

    // Total machines actives
    const { data: machines } = await admin().from('labo_machines').select('id,statut,prochaine_maintenance')
      .eq('prothesiste_id', req.prothesisteId).neq('statut', 'inactif');

    const totalMachines = (machines || []).length;
    const enRetard = (machines || []).filter(m => m.prochaine_maintenance && m.prochaine_maintenance <= today).length;
    const enPanne = (machines || []).filter(m => m.statut === 'en_panne').length;

    // Interventions ce mois
    const machineIds = (machines || []).map(m => m.id);
    let interventionsMois = 0, interventionsAnnee = 0, coutTotal = 0, correctives = 0, totalInterventions = 0;

    if (machineIds.length > 0) {
      const { data: intMois } = await admin().from('labo_interventions').select('id')
        .in('machine_id', machineIds).gte('date_intervention', debutMois);
      interventionsMois = (intMois || []).length;

      const { data: intAnnee } = await admin().from('labo_interventions').select('id,cout,type_intervention')
        .in('machine_id', machineIds).gte('date_intervention', debutAnnee);
      interventionsAnnee = (intAnnee || []).length;
      totalInterventions = interventionsAnnee;
      coutTotal = (intAnnee || []).reduce((s, i) => s + (parseFloat(i.cout) || 0), 0);
      correctives = (intAnnee || []).filter(i => i.type_intervention === 'corrective').length;
    }

    const tauxPanne = totalInterventions > 0
      ? Math.round((correctives / totalInterventions) * 100)
      : 0;

    res.json({
      total_machines: totalMachines,
      machines_en_retard: enRetard,
      machines_en_panne: enPanne,
      interventions_mois: interventionsMois,
      interventions_annee: interventionsAnnee,
      cout_total_annee: Math.round(coutTotal * 100) / 100,
      taux_panne: tauxPanne
    });
  } catch (e) {
    console.error('[LABO maintenance] GET stats', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/maintenance/calendrier — Maintenances prevues 3 prochains mois
router.get('/calendrier', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    const today = new Date().toISOString().split('T')[0];
    const j90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];

    const { data, error } = await admin().from('labo_machines')
      .select('id,nom,type_machine,marque,modele,prochaine_maintenance,statut,frequence_maintenance_jours')
      .eq('prothesiste_id', req.prothesisteId).neq('statut', 'inactif')
      .not('prochaine_maintenance', 'is', null)
      .lte('prochaine_maintenance', j90)
      .order('prochaine_maintenance');
    if (error) throw error;

    const evenements = (data || []).map(m => ({
      machine_id: m.id,
      nom: m.nom,
      type_machine: m.type_machine,
      marque: m.marque,
      modele: m.modele,
      date_prevue: m.prochaine_maintenance,
      en_retard: m.prochaine_maintenance <= today,
      statut: m.statut,
      frequence_jours: m.frequence_maintenance_jours
    }));

    res.json({ calendrier: evenements });
  } catch (e) {
    console.error('[LABO maintenance] GET calendrier', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
