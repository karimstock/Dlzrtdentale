// =============================================
// JADOMI LABO — Routes production tracking
// Suivi des cas par etapes de fabrication
// =============================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { admin } = require('../../api/multiSocietes/middleware');

// Etapes de production dans l'ordre
const ETAPES_ORDRE = [
  'reception',
  'maquette',
  'scan_cao',
  'fabrication',
  'ceramique',
  'finition',
  'controle',
  'expedition'
];

const ETAPES_LABELS = {
  reception: 'Réception commande',
  maquette: 'Maquette/Wax-up',
  scan_cao: 'Scan/CAO',
  fabrication: 'Fabrication/Usinage',
  ceramique: 'Céramique/Stratification',
  finition: 'Finition/Polissage',
  controle: 'Contrôle qualité',
  expedition: 'Expédition'
};

// Generer QR code unique pour un cas
function genererQrCode(prothesisteId, caseId) {
  const pShort = prothesisteId.substring(0, 6).toUpperCase();
  const cShort = caseId.substring(0, 8).toUpperCase();
  const checksum = crypto
    .createHash('md5')
    .update(`${prothesisteId}-${caseId}`)
    .digest('hex')
    .substring(0, 4)
    .toUpperCase();
  return `JLAB-${pShort}-${cShort}-${checksum}`;
}

// ─────────────────────────────────────────────
// GET /api/labo/production/tableau — Kanban board
// ─────────────────────────────────────────────
router.get('/tableau', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { data, error } = await admin()
      .from('labo_production_cases')
      .select('*, dentistes_clients(nom, prenom, titre)')
      .eq('prothesiste_id', req.prothesisteId)
      .in('statut', ['en_cours', 'en_attente'])
      .order('urgence', { ascending: false })
      .order('date_livraison_prevue', { ascending: true });

    if (error) throw error;

    // Grouper par etape
    const tableau = {};
    for (const etape of ETAPES_ORDRE) {
      tableau[etape] = {
        label: ETAPES_LABELS[etape],
        cases: [],
        count: 0
      };
    }

    for (const c of (data || [])) {
      const etape = c.etape_actuelle;
      if (tableau[etape]) {
        tableau[etape].cases.push(c);
        tableau[etape].count++;
      }
    }

    res.json({ tableau, etapes_ordre: ETAPES_ORDRE });
  } catch (e) {
    console.error('[LABO/Production] tableau:', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement du tableau de production' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/production/stats — Statistiques
// ─────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    // Cas en cours par etape
    const { data: enCours, error: e1 } = await admin()
      .from('labo_production_cases')
      .select('etape_actuelle, urgence')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'en_cours');

    if (e1) throw e1;

    // Cas termines aujourd'hui
    const { data: termAujourdhui, error: e2 } = await admin()
      .from('labo_production_cases')
      .select('id')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'termine')
      .gte('date_livraison_reelle', todayStr);

    if (e2) throw e2;

    // Cas termines cette semaine
    const { data: termSemaine, error: e3 } = await admin()
      .from('labo_production_cases')
      .select('id')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'termine')
      .gte('date_livraison_reelle', weekAgo);

    if (e3) throw e3;

    // Cas termines ce mois
    const { data: termMois, error: e4 } = await admin()
      .from('labo_production_cases')
      .select('id')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'termine')
      .gte('date_livraison_reelle', monthAgo);

    if (e4) throw e4;

    // Temps moyen par etape (sur les etapes terminees)
    const { data: etapesDurees, error: e5 } = await admin()
      .from('labo_production_etapes')
      .select('etape, duree_minutes, case_id')
      .not('duree_minutes', 'is', null);

    if (e5) throw e5;

    // Filtrer par prothesiste — on a besoin de joindre
    // Pour simplifier, calculer les moyennes directement
    const moyennesParEtape = {};
    const comptesParEtape = {};
    for (const e of (etapesDurees || [])) {
      if (!moyennesParEtape[e.etape]) {
        moyennesParEtape[e.etape] = 0;
        comptesParEtape[e.etape] = 0;
      }
      moyennesParEtape[e.etape] += e.duree_minutes;
      comptesParEtape[e.etape]++;
    }
    const tempsMoyenParEtape = {};
    for (const etape of Object.keys(moyennesParEtape)) {
      tempsMoyenParEtape[etape] = Math.round(moyennesParEtape[etape] / comptesParEtape[etape]);
    }

    // Bottlenecks : etapes avec le plus de cas en attente
    const parEtape = {};
    for (const c of (enCours || [])) {
      parEtape[c.etape_actuelle] = (parEtape[c.etape_actuelle] || 0) + 1;
    }
    const bottlenecks = Object.entries(parEtape)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([etape, count]) => ({ etape, label: ETAPES_LABELS[etape], count }));

    res.json({
      en_cours: (enCours || []).length,
      urgences: (enCours || []).filter(c => c.urgence).length,
      termines_aujourdhui: (termAujourdhui || []).length,
      termines_semaine: (termSemaine || []).length,
      termines_mois: (termMois || []).length,
      par_etape: parEtape,
      temps_moyen_par_etape: tempsMoyenParEtape,
      bottlenecks
    });
  } catch (e) {
    console.error('[LABO/Production] stats:', e.message);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/production/qr/:code — Lookup par QR
// ─────────────────────────────────────────────
router.get('/qr/:code', async (req, res) => {
  try {
    const { data: cas, error } = await admin()
      .from('labo_production_cases')
      .select('*, dentistes_clients(nom, prenom, titre)')
      .eq('qr_code', req.params.code)
      .maybeSingle();

    if (error) throw error;
    if (!cas) return res.status(404).json({ error: 'Cas non trouvé pour ce code QR' });

    // Verifier que le cas appartient au labo
    if (req.prothesisteId && cas.prothesiste_id !== req.prothesisteId) {
      return res.status(403).json({ error: 'Ce cas ne vous appartient pas' });
    }

    // Charger etape actuelle
    const { data: etapes } = await admin()
      .from('labo_production_etapes')
      .select('*')
      .eq('case_id', cas.id)
      .order('debut', { ascending: false })
      .limit(1);

    res.json({
      cas,
      etape_actuelle: {
        code: cas.etape_actuelle,
        label: ETAPES_LABELS[cas.etape_actuelle] || cas.etape_actuelle
      },
      derniere_etape: etapes?.[0] || null
    });
  } catch (e) {
    console.error('[LABO/Production] qr lookup:', e.message);
    res.status(500).json({ error: 'Erreur lors de la recherche par QR code' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/production — Liste des cas
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const { statut, dentiste_id, technicien_id, urgence, from, to, etape, page, limit: lim } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageSize = Math.min(parseInt(lim) || 50, 100);
    const offset = (pageNum - 1) * pageSize;

    let query = admin()
      .from('labo_production_cases')
      .select('*, dentistes_clients(nom, prenom, titre)', { count: 'exact' })
      .eq('prothesiste_id', req.prothesisteId)
      .order('urgence', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (statut) query = query.eq('statut', statut);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (technicien_id) query = query.eq('technicien_id', technicien_id);
    if (urgence === 'true') query = query.eq('urgence', true);
    if (etape) query = query.eq('etape_actuelle', etape);
    if (from) query = query.gte('date_reception', from);
    if (to) query = query.lte('date_reception', to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      cases: data || [],
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: count || 0,
        pages: Math.ceil((count || 0) / pageSize)
      }
    });
  } catch (e) {
    console.error('[LABO/Production] list:', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement des cas de production' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/production/:id — Detail d'un cas
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data: cas, error } = await admin()
      .from('labo_production_cases')
      .select('*, dentistes_clients(nom, prenom, titre, email, telephone)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !cas) return res.status(404).json({ error: 'Cas de production non trouvé' });

    // Charger historique des etapes
    const { data: etapes } = await admin()
      .from('labo_production_etapes')
      .select('*')
      .eq('case_id', cas.id)
      .order('debut', { ascending: true });

    // Calculer temps total
    let tempsTotalMinutes = 0;
    for (const et of (etapes || [])) {
      if (et.duree_minutes) tempsTotalMinutes += et.duree_minutes;
    }

    res.json({
      cas,
      etapes: etapes || [],
      etape_actuelle: {
        code: cas.etape_actuelle,
        label: ETAPES_LABELS[cas.etape_actuelle] || cas.etape_actuelle,
        index: ETAPES_ORDRE.indexOf(cas.etape_actuelle),
        total_etapes: ETAPES_ORDRE.length
      },
      temps_total_minutes: tempsTotalMinutes,
      etapes_ordre: ETAPES_ORDRE,
      etapes_labels: ETAPES_LABELS
    });
  } catch (e) {
    console.error('[LABO/Production] detail:', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement du cas' });
  }
});

// ─────────────────────────────────────────────
// POST /api/labo/production — Creer un cas
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil laboratoire requis' });

    const b = req.body;
    if (!b.type_travail) {
      return res.status(400).json({ error: 'Le type de travail est requis' });
    }

    // Inserer le cas
    const { data: cas, error } = await admin()
      .from('labo_production_cases')
      .insert({
        prothesiste_id: req.prothesisteId,
        bon_livraison_id: b.bon_livraison_id || null,
        dentiste_id: b.dentiste_id || null,
        patient_ref: b.patient_ref || null,
        type_travail: b.type_travail,
        materiaux: b.materiaux || null,
        dents: b.dents || null,
        teinte: b.teinte || null,
        teintier: b.teintier || null,
        urgence: b.urgence || false,
        etape_actuelle: 'reception',
        statut: 'en_cours',
        technicien_id: b.technicien_id || null,
        technicien_nom: b.technicien_nom || null,
        date_livraison_prevue: b.date_livraison_prevue || null,
        notes: b.notes || null
      })
      .select()
      .single();

    if (error) throw error;

    // Generer QR code
    const qrCode = genererQrCode(req.prothesisteId, cas.id);
    const { error: qrErr } = await admin()
      .from('labo_production_cases')
      .update({ qr_code: qrCode })
      .eq('id', cas.id);

    if (qrErr) console.error('[LABO/Production] QR update error:', qrErr.message);

    // Creer la premiere etape (reception)
    await admin()
      .from('labo_production_etapes')
      .insert({
        case_id: cas.id,
        etape: 'reception',
        technicien_id: b.technicien_id || null,
        technicien_nom: b.technicien_nom || null,
        notes: b.notes || null
      });

    cas.qr_code = qrCode;
    res.json({ success: true, cas, qr_code: qrCode });
  } catch (e) {
    console.error('[LABO/Production] create:', e.message);
    res.status(500).json({ error: 'Erreur lors de la création du cas de production' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/labo/production/:id — Modifier un cas
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Verifier que le cas existe et appartient au labo
    const { data: existing } = await admin()
      .from('labo_production_cases')
      .select('id, statut')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!existing) return res.status(404).json({ error: 'Cas de production non trouvé' });
    if (existing.statut === 'annule') {
      return res.status(400).json({ error: 'Impossible de modifier un cas annulé' });
    }

    const b = req.body;
    const updates = {};
    const allowed = [
      'dentiste_id', 'patient_ref', 'type_travail', 'materiaux', 'dents',
      'teinte', 'teintier', 'urgence', 'technicien_id', 'technicien_nom',
      'date_livraison_prevue', 'date_livraison_reelle', 'notes', 'statut'
    ];
    for (const k of allowed) {
      if (b[k] !== undefined) updates[k] = b[k];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('labo_production_cases')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, cas: data });
  } catch (e) {
    console.error('[LABO/Production] update:', e.message);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du cas' });
  }
});

// ─────────────────────────────────────────────
// POST /api/labo/production/:id/etape — Avancer etape
// ─────────────────────────────────────────────
router.post('/:id/etape', async (req, res) => {
  try {
    // Charger le cas
    const { data: cas, error: casErr } = await admin()
      .from('labo_production_cases')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (casErr || !cas) return res.status(404).json({ error: 'Cas de production non trouvé' });
    if (cas.statut === 'annule') {
      return res.status(400).json({ error: 'Impossible de modifier un cas annulé' });
    }
    if (cas.statut === 'termine') {
      return res.status(400).json({ error: 'Ce cas est déjà terminé' });
    }

    const b = req.body;
    let nouvelleEtape = b.etape;

    // Si pas d'etape specifiee, avancer a la suivante
    if (!nouvelleEtape) {
      const indexActuel = ETAPES_ORDRE.indexOf(cas.etape_actuelle);
      if (indexActuel === -1 || indexActuel >= ETAPES_ORDRE.length - 1) {
        // Derniere etape → marquer comme termine
        nouvelleEtape = null;
      } else {
        nouvelleEtape = ETAPES_ORDRE[indexActuel + 1];
      }
    }

    // Valider l'etape
    if (nouvelleEtape && !ETAPES_ORDRE.includes(nouvelleEtape)) {
      return res.status(400).json({ error: `Étape invalide : ${nouvelleEtape}` });
    }

    // Fermer l'etape precedente (calculer duree)
    const { data: etapePrecedente } = await admin()
      .from('labo_production_etapes')
      .select('*')
      .eq('case_id', cas.id)
      .is('fin', null)
      .order('debut', { ascending: false })
      .limit(1);

    if (etapePrecedente && etapePrecedente.length > 0) {
      const ep = etapePrecedente[0];
      const debut = new Date(ep.debut);
      const fin = new Date();
      const dureeMinutes = Math.round((fin - debut) / 60000);

      await admin()
        .from('labo_production_etapes')
        .update({
          fin: fin.toISOString(),
          duree_minutes: dureeMinutes
        })
        .eq('id', ep.id);
    }

    // Si derniere etape terminee, marquer le cas comme termine
    if (!nouvelleEtape) {
      await admin()
        .from('labo_production_cases')
        .update({
          statut: 'termine',
          date_livraison_reelle: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        })
        .eq('id', cas.id);

      return res.json({
        success: true,
        message: 'Cas terminé — toutes les étapes sont complètes',
        statut: 'termine'
      });
    }

    // Creer la nouvelle etape
    const { data: newEtape, error: etErr } = await admin()
      .from('labo_production_etapes')
      .insert({
        case_id: cas.id,
        etape: nouvelleEtape,
        technicien_id: b.technicien_id || null,
        technicien_nom: b.technicien_nom || null,
        notes: b.notes || null,
        photos: b.photos || null
      })
      .select()
      .single();

    if (etErr) throw etErr;

    // Mettre a jour le cas
    const caseUpdates = {
      etape_actuelle: nouvelleEtape,
      updated_at: new Date().toISOString()
    };
    if (b.technicien_id) caseUpdates.technicien_id = b.technicien_id;
    if (b.technicien_nom) caseUpdates.technicien_nom = b.technicien_nom;

    await admin()
      .from('labo_production_cases')
      .update(caseUpdates)
      .eq('id', cas.id);

    res.json({
      success: true,
      etape: newEtape,
      etape_label: ETAPES_LABELS[nouvelleEtape],
      index: ETAPES_ORDRE.indexOf(nouvelleEtape),
      total_etapes: ETAPES_ORDRE.length
    });
  } catch (e) {
    console.error('[LABO/Production] etape:', e.message);
    res.status(500).json({ error: 'Erreur lors du changement d\'étape' });
  }
});

// ─────────────────────────────────────────────
// POST /api/labo/production/:id/qr — Generer QR
// ─────────────────────────────────────────────
router.post('/:id/qr', async (req, res) => {
  try {
    const { data: cas, error } = await admin()
      .from('labo_production_cases')
      .select('id, qr_code')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !cas) return res.status(404).json({ error: 'Cas de production non trouvé' });

    // Si QR existe deja, le retourner
    if (cas.qr_code) {
      return res.json({ qr_code: cas.qr_code, case_id: cas.id });
    }

    // Generer un nouveau QR
    const qrCode = genererQrCode(req.prothesisteId, cas.id);
    const { error: updErr } = await admin()
      .from('labo_production_cases')
      .update({ qr_code: qrCode })
      .eq('id', cas.id);

    if (updErr) throw updErr;

    res.json({ qr_code: qrCode, case_id: cas.id });
  } catch (e) {
    console.error('[LABO/Production] qr generate:', e.message);
    res.status(500).json({ error: 'Erreur lors de la génération du QR code' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/labo/production/:id — Annuler un cas
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { data: cas } = await admin()
      .from('labo_production_cases')
      .select('id, statut')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!cas) return res.status(404).json({ error: 'Cas de production non trouvé' });
    if (cas.statut === 'annule') {
      return res.status(400).json({ error: 'Ce cas est déjà annulé' });
    }

    const { error } = await admin()
      .from('labo_production_cases')
      .update({
        statut: 'annule',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (error) throw error;

    // Fermer toute etape ouverte
    await admin()
      .from('labo_production_etapes')
      .update({ fin: new Date().toISOString() })
      .eq('case_id', req.params.id)
      .is('fin', null);

    res.json({ success: true, message: 'Cas annulé avec succès' });
  } catch (e) {
    console.error('[LABO/Production] delete:', e.message);
    res.status(500).json({ error: 'Erreur lors de l\'annulation du cas' });
  }
});

module.exports = router;
