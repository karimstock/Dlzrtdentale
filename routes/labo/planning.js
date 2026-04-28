// =============================================
// JADOMI LABO — Routes planning techniciens
// Gestion des plannings, charge de travail, conges
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// ---- ESTIMATION HEURES PAR TYPE DE TRAVAIL ----
const HEURES_PAR_TYPE = {
  couronne: 2,
  bridge: 4,
  prothese_amovible: 3,
  gouttiere: 1,
  facette: 1.5,
  inlay_onlay: 1.5,
  implant: 3,
  reparation: 1
};

const HEURES_JOUR_STANDARD = 7;
const HEURES_JOUR_SURCHARGE = 8;
const DEFAULT_HEURES = 2; // fallback si type inconnu

// ---- HELPERS ----

function getEstimatedHours(typeTravail) {
  if (!typeTravail) return DEFAULT_HEURES;
  const key = typeTravail.toLowerCase().replace(/[\s-]/g, '_');
  return HEURES_PAR_TYPE[key] || DEFAULT_HEURES;
}

// Retourne lundi de la semaine ISO
function getWeekStart(isoWeek, year) {
  // isoWeek format: "2026-W18" or just week number
  let y, w;
  if (typeof isoWeek === 'string' && isoWeek.includes('W')) {
    const parts = isoWeek.split('-W');
    y = parseInt(parts[0]);
    w = parseInt(parts[1]);
  } else {
    y = year || new Date().getFullYear();
    w = parseInt(isoWeek);
  }
  // ISO week 1 contains Jan 4
  const jan4 = new Date(y, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Monday = 1
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (w - 1) * 7);
  return monday;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// ─────────────────────────────────────────────
// GET /api/labo/planning — Vue semaine/mois
// Query: semaine (ex: "2026-W18"), mois (ex: "2026-04"), technicien_id
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { semaine, mois, technicien_id } = req.query;

    let dateDebut, dateFin;

    if (semaine) {
      const monday = getWeekStart(semaine);
      dateDebut = formatDate(monday);
      dateFin = formatDate(addDays(monday, 6));
    } else if (mois) {
      const [y, m] = mois.split('-').map(Number);
      dateDebut = `${y}-${String(m).padStart(2, '0')}-01`;
      dateFin = `${y}-${String(m).padStart(2, '0')}-${getDaysInMonth(y, m)}`;
    } else {
      // Default: semaine courante
      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      dateDebut = formatDate(monday);
      dateFin = formatDate(addDays(monday, 6));
    }

    // Charger les techniciens actifs
    let techQuery = admin()
      .from('labo_techniciens')
      .select('id, nom, prenom, specialites, statut')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'actif');

    if (technicien_id) techQuery = techQuery.eq('id', technicien_id);

    const { data: techniciens, error: techErr } = await techQuery;
    if (techErr) throw techErr;

    // Charger les cas dans la periode
    let casesQuery = admin()
      .from('labo_production_cases')
      .select('id, reference, patient_nom, type_travail, etape_actuelle, statut, technicien_id, technicien_nom, date_livraison_prevue, urgence')
      .eq('prothesiste_id', req.prothesisteId)
      .gte('date_livraison_prevue', dateDebut)
      .lte('date_livraison_prevue', dateFin)
      .not('statut', 'eq', 'annule');

    if (technicien_id) casesQuery = casesQuery.eq('technicien_id', technicien_id);

    const { data: cases, error: casesErr } = await casesQuery;
    if (casesErr) throw casesErr;

    // Charger les conges dans la periode
    const { data: conges } = await admin()
      .from('labo_planning_conges')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .lte('date_debut', dateFin)
      .gte('date_fin', dateDebut);

    // Construire la grille technicien x jour
    const grille = {};
    for (const tech of (techniciens || [])) {
      grille[tech.id] = {
        technicien: tech,
        jours: {}
      };

      // Initialiser chaque jour
      let d = new Date(dateDebut);
      const fin = new Date(dateFin);
      while (d <= fin) {
        const dateStr = formatDate(d);
        grille[tech.id].jours[dateStr] = {
          date: dateStr,
          cases: [],
          heures_estimees: 0,
          en_conge: false,
          motif_conge: null
        };
        d = addDays(d, 1);
      }

      // Marquer les conges
      for (const conge of (conges || [])) {
        if (conge.technicien_id !== tech.id) continue;
        let cd = new Date(conge.date_debut);
        const cf = new Date(conge.date_fin);
        while (cd <= cf) {
          const ds = formatDate(cd);
          if (grille[tech.id].jours[ds]) {
            grille[tech.id].jours[ds].en_conge = true;
            grille[tech.id].jours[ds].motif_conge = conge.motif;
          }
          cd = addDays(cd, 1);
        }
      }
    }

    // Repartir les cas dans la grille
    for (const c of (cases || [])) {
      if (!c.technicien_id || !grille[c.technicien_id]) continue;
      const dateStr = c.date_livraison_prevue;
      if (grille[c.technicien_id].jours[dateStr]) {
        const heures = getEstimatedHours(c.type_travail);
        grille[c.technicien_id].jours[dateStr].cases.push({
          ...c,
          heures_estimees: heures
        });
        grille[c.technicien_id].jours[dateStr].heures_estimees += heures;
      }
    }

    res.json({
      periode: { debut: dateDebut, fin: dateFin },
      planning: Object.values(grille),
      total_cas: (cases || []).length
    });
  } catch (e) {
    console.error('[LABO planning GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/planning/charge — Charge de travail
// ─────────────────────────────────────────────
router.get('/charge', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    // Techniciens actifs
    const { data: techniciens, error: techErr } = await admin()
      .from('labo_techniciens')
      .select('id, nom, prenom, specialites, statut')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'actif');
    if (techErr) throw techErr;

    // Cas en cours (non termines, non annules)
    const { data: cases, error: casesErr } = await admin()
      .from('labo_production_cases')
      .select('id, type_travail, technicien_id, date_livraison_prevue, statut, urgence')
      .eq('prothesiste_id', req.prothesisteId)
      .in('statut', ['en_cours', 'en_attente']);
    if (casesErr) throw casesErr;

    // Conges en cours ou futurs
    const today = formatDate(new Date());
    const { data: conges } = await admin()
      .from('labo_planning_conges')
      .select('technicien_id, date_debut, date_fin')
      .eq('prothesiste_id', req.prothesisteId)
      .gte('date_fin', today);

    // Calculer la charge par technicien
    const charge = (techniciens || []).map(tech => {
      const mesCas = (cases || []).filter(c => c.technicien_id === tech.id);
      const totalHeures = mesCas.reduce((sum, c) => sum + getEstimatedHours(c.type_travail), 0);

      // Jours ouvrables restants cette semaine (lundi-vendredi)
      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const joursRestantsSemaine = Math.max(0, 5 - dayOfWeek + 1);

      // Verifier conges
      const joursConge = (conges || [])
        .filter(c => c.technicien_id === tech.id)
        .reduce((sum, c) => {
          const debut = new Date(Math.max(new Date(c.date_debut), now));
          const fin = new Date(c.date_fin);
          const diff = Math.ceil((fin - debut) / (1000 * 60 * 60 * 24)) + 1;
          return sum + Math.max(0, diff);
        }, 0);

      const joursDisponibles = Math.max(0, joursRestantsSemaine - joursConge);
      const capaciteTotale = joursDisponibles * HEURES_JOUR_STANDARD;
      const capaciteRestante = Math.max(0, capaciteTotale - totalHeures);

      // Regrouper par jour pour detecter surcharges
      const parJour = {};
      for (const c of mesCas) {
        const d = c.date_livraison_prevue || 'non_planifie';
        if (!parJour[d]) parJour[d] = 0;
        parJour[d] += getEstimatedHours(c.type_travail);
      }
      const joursSurcharges = Object.entries(parJour)
        .filter(([, h]) => h > HEURES_JOUR_SURCHARGE)
        .map(([date, heures]) => ({ date, heures }));

      return {
        technicien: tech,
        cas_assignes: mesCas.length,
        heures_estimees: totalHeures,
        capacite_totale: capaciteTotale,
        capacite_restante: capaciteRestante,
        jours_disponibles: joursDisponibles,
        surcharge: joursSurcharges.length > 0,
        jours_surcharges: joursSurcharges,
        cas_urgents: mesCas.filter(c => c.urgence).length
      };
    });

    res.json({ charge });
  } catch (e) {
    console.error('[LABO planning charge]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// POST /api/labo/planning/affecter — Affecter cas a technicien
// ─────────────────────────────────────────────
router.post('/affecter', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { case_ids, technicien_id, date_prevue } = req.body;

    if (!case_ids || !Array.isArray(case_ids) || case_ids.length === 0) {
      return res.status(400).json({ error: 'case_ids requis (tableau)' });
    }
    if (!technicien_id) {
      return res.status(400).json({ error: 'technicien_id requis' });
    }

    // Verifier que le technicien appartient au labo
    const { data: tech, error: techErr } = await admin()
      .from('labo_techniciens')
      .select('id, nom, prenom')
      .eq('id', technicien_id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();
    if (techErr) throw techErr;
    if (!tech) return res.status(404).json({ error: 'Technicien non trouve' });

    const techNom = `${tech.prenom || ''} ${tech.nom}`.trim();

    // Construire l'update
    const updateData = {
      technicien_id: tech.id,
      technicien_nom: techNom
    };
    if (date_prevue) {
      updateData.date_livraison_prevue = date_prevue;
    }

    // Mettre a jour chaque cas
    const { data, error } = await admin()
      .from('labo_production_cases')
      .update(updateData)
      .eq('prothesiste_id', req.prothesisteId)
      .in('id', case_ids)
      .select('id, reference, technicien_id, technicien_nom, date_livraison_prevue');

    if (error) throw error;

    res.json({
      message: `${(data || []).length} cas affecte(s) a ${techNom}`,
      cas_mis_a_jour: data || []
    });
  } catch (e) {
    console.error('[LABO planning affecter]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// POST /api/labo/planning/reorganiser — Deplacer un cas
// ─────────────────────────────────────────────
router.post('/reorganiser', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { case_id, nouveau_technicien_id, nouvelle_date } = req.body;

    if (!case_id) return res.status(400).json({ error: 'case_id requis' });
    if (!nouveau_technicien_id && !nouvelle_date) {
      return res.status(400).json({ error: 'nouveau_technicien_id ou nouvelle_date requis' });
    }

    const updateData = {};

    if (nouveau_technicien_id) {
      // Verifier technicien
      const { data: tech, error: techErr } = await admin()
        .from('labo_techniciens')
        .select('id, nom, prenom')
        .eq('id', nouveau_technicien_id)
        .eq('prothesiste_id', req.prothesisteId)
        .maybeSingle();
      if (techErr) throw techErr;
      if (!tech) return res.status(404).json({ error: 'Nouveau technicien non trouve' });

      updateData.technicien_id = tech.id;
      updateData.technicien_nom = `${tech.prenom || ''} ${tech.nom}`.trim();
    }

    if (nouvelle_date) {
      updateData.date_livraison_prevue = nouvelle_date;
    }

    const { data, error } = await admin()
      .from('labo_production_cases')
      .update(updateData)
      .eq('id', case_id)
      .eq('prothesiste_id', req.prothesisteId)
      .select('id, reference, technicien_id, technicien_nom, date_livraison_prevue');

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Cas non trouve' });

    res.json({
      message: 'Cas reorganise',
      cas: data[0]
    });
  } catch (e) {
    console.error('[LABO planning reorganiser]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/planning/disponibilites — Creneaux disponibles
// Query: date_debut, date_fin
// ─────────────────────────────────────────────
router.get('/disponibilites', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    let { date_debut, date_fin } = req.query;

    if (!date_debut) {
      date_debut = formatDate(new Date());
    }
    if (!date_fin) {
      date_fin = formatDate(addDays(new Date(date_debut), 6));
    }

    // Techniciens actifs
    const { data: techniciens, error: techErr } = await admin()
      .from('labo_techniciens')
      .select('id, nom, prenom, specialites')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'actif');
    if (techErr) throw techErr;

    // Cas dans la periode
    const { data: cases, error: casesErr } = await admin()
      .from('labo_production_cases')
      .select('id, type_travail, technicien_id, date_livraison_prevue')
      .eq('prothesiste_id', req.prothesisteId)
      .gte('date_livraison_prevue', date_debut)
      .lte('date_livraison_prevue', date_fin)
      .not('statut', 'eq', 'annule');
    if (casesErr) throw casesErr;

    // Conges dans la periode
    const { data: conges } = await admin()
      .from('labo_planning_conges')
      .select('technicien_id, date_debut, date_fin')
      .eq('prothesiste_id', req.prothesisteId)
      .lte('date_debut', date_fin)
      .gte('date_fin', date_debut);

    // Construire map conges: technicien_id -> Set de dates
    const congesMap = {};
    for (const conge of (conges || [])) {
      if (!congesMap[conge.technicien_id]) congesMap[conge.technicien_id] = new Set();
      let d = new Date(conge.date_debut);
      const f = new Date(conge.date_fin);
      while (d <= f) {
        congesMap[conge.technicien_id].add(formatDate(d));
        d = addDays(d, 1);
      }
    }

    // Construire charge par technicien/jour
    const chargeMap = {};
    for (const c of (cases || [])) {
      if (!c.technicien_id || !c.date_livraison_prevue) continue;
      const key = `${c.technicien_id}_${c.date_livraison_prevue}`;
      if (!chargeMap[key]) chargeMap[key] = 0;
      chargeMap[key] += getEstimatedHours(c.type_travail);
    }

    // Pour chaque technicien, chaque jour, calculer disponibilite
    const disponibilites = (techniciens || []).map(tech => {
      const jours = [];
      let d = new Date(date_debut);
      const fin = new Date(date_fin);

      while (d <= fin) {
        const dateStr = formatDate(d);
        const enConge = congesMap[tech.id] && congesMap[tech.id].has(dateStr);
        const key = `${tech.id}_${dateStr}`;
        const heuresOccupees = chargeMap[key] || 0;
        const heuresDisponibles = enConge ? 0 : Math.max(0, HEURES_JOUR_STANDARD - heuresOccupees);

        jours.push({
          date: dateStr,
          en_conge: enConge,
          heures_occupees: heuresOccupees,
          heures_disponibles: heuresDisponibles,
          disponible: heuresDisponibles > 0
        });

        d = addDays(d, 1);
      }

      return {
        technicien: tech,
        jours
      };
    });

    res.json({
      periode: { debut: date_debut, fin: date_fin },
      disponibilites,
      estimation_heures: HEURES_PAR_TYPE
    });
  } catch (e) {
    console.error('[LABO planning disponibilites]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/planning/conges — Lister les conges
// ─────────────────────────────────────────────
router.get('/conges', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { technicien_id, futur_seulement } = req.query;

    let query = admin()
      .from('labo_planning_conges')
      .select('*, labo_techniciens(nom, prenom)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_debut', { ascending: true });

    if (technicien_id) query = query.eq('technicien_id', technicien_id);
    if (futur_seulement === 'true') {
      query = query.gte('date_fin', formatDate(new Date()));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ conges: data || [] });
  } catch (e) {
    console.error('[LABO planning conges GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// POST /api/labo/planning/conges — Enregistrer absence
// ─────────────────────────────────────────────
router.post('/conges', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { technicien_id, date_debut, date_fin, motif, notes } = req.body;

    if (!technicien_id || !date_debut || !date_fin) {
      return res.status(400).json({ error: 'technicien_id, date_debut et date_fin requis' });
    }

    if (new Date(date_fin) < new Date(date_debut)) {
      return res.status(400).json({ error: 'date_fin doit etre apres date_debut' });
    }

    const validMotifs = ['conge', 'maladie', 'formation', 'autre'];
    if (motif && !validMotifs.includes(motif)) {
      return res.status(400).json({ error: `Motif invalide. Valeurs acceptees: ${validMotifs.join(', ')}` });
    }

    // Verifier technicien appartient au labo
    const { data: tech, error: techErr } = await admin()
      .from('labo_techniciens')
      .select('id, nom')
      .eq('id', technicien_id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();
    if (techErr) throw techErr;
    if (!tech) return res.status(404).json({ error: 'Technicien non trouve' });

    const { data, error } = await admin()
      .from('labo_planning_conges')
      .insert({
        prothesiste_id: req.prothesisteId,
        technicien_id,
        date_debut,
        date_fin,
        motif: motif || 'conge',
        notes: notes || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: `Absence enregistree pour ${tech.nom}`,
      conge: data
    });
  } catch (e) {
    console.error('[LABO planning conges POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/labo/planning/conges/:id — Supprimer absence
// ─────────────────────────────────────────────
router.delete('/conges/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { id } = req.params;

    const { data, error } = await admin()
      .from('labo_planning_conges')
      .delete()
      .eq('id', id)
      .eq('prothesiste_id', req.prothesisteId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Absence non trouvee' });

    res.json({ message: 'Absence supprimee', conge: data[0] });
  } catch (e) {
    console.error('[LABO planning conges DELETE]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
