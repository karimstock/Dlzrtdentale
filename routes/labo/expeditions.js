// =============================================
// JADOMI LABO — Routes expeditions / shipments
// Gestion des envois labo → cabinet dentaire
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// ─── Helper: générer numéro de suivi interne ───
function genererNumeroSuivi() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `JLAB-${ts}-${rand}`;
}

// ─── GET /api/labo/expeditions/stats ───
// Stats expéditions (doit être AVANT /:id)
router.get('/stats', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Toutes les expeditions du prothesiste
    const { data: all, error } = await admin()
      .from('labo_expeditions')
      .select('id, statut, transporteur, date_expedition, date_livraison_reelle, created_at')
      .eq('prothesiste_id', req.prothesisteId);

    if (error) throw error;

    const expeditions = all || [];
    const ceMois = expeditions.filter(e => e.created_at >= debutMois);
    const enAttente = expeditions.filter(e => e.statut === 'prepare');
    const retours = expeditions.filter(e => e.statut === 'retour');
    const livrees = expeditions.filter(e => e.statut === 'livre' && e.date_expedition && e.date_livraison_reelle);

    // Temps moyen de livraison (en heures)
    let tempsLivraisonMoyenHeures = null;
    if (livrees.length > 0) {
      const totalHeures = livrees.reduce((sum, e) => {
        const diff = new Date(e.date_livraison_reelle) - new Date(e.date_expedition);
        return sum + diff / (1000 * 60 * 60);
      }, 0);
      tempsLivraisonMoyenHeures = Math.round(totalHeures / livrees.length);
    }

    // Par transporteur
    const parTransporteur = {};
    expeditions.forEach(e => {
      parTransporteur[e.transporteur] = (parTransporteur[e.transporteur] || 0) + 1;
    });

    res.json({
      total: expeditions.length,
      ce_mois: ceMois.length,
      en_attente: enAttente.length,
      retours: retours.length,
      livrees: livrees.length,
      temps_livraison_moyen_heures: tempsLivraisonMoyenHeures,
      par_transporteur: parTransporteur
    });
  } catch (e) {
    console.error('[LABO EXPEDITIONS stats]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── GET /api/labo/expeditions/a-expedier ───
// BL valides mais pas encore expedies
router.get('/a-expedier', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    // BL valides (statut = 'valide') du prothesiste
    const { data: bls, error } = await admin()
      .from('bons_livraison')
      .select('id, numero_bl, date_bl, dentiste_id, dentistes_clients!inner(nom, prenom, titre), statut')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'valide')
      .order('date_bl', { ascending: false });

    if (error) throw error;

    // Recuperer tous les bons_livraison_ids deja dans des expeditions non annulees
    const { data: exps } = await admin()
      .from('labo_expeditions')
      .select('bons_livraison_ids')
      .eq('prothesiste_id', req.prothesisteId)
      .neq('statut', 'annule');

    const blDejaExpedies = new Set();
    (exps || []).forEach(exp => {
      (exp.bons_livraison_ids || []).forEach(id => blDejaExpedies.add(id));
    });

    const aExpedier = (bls || []).filter(bl => !blDejaExpedies.has(bl.id));

    res.json({ bons_livraison: aExpedier });
  } catch (e) {
    console.error('[LABO EXPEDITIONS a-expedier]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── GET /api/labo/expeditions ───
// Liste avec filtres et pagination
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { statut, dentiste_id, transporteur, from, to, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = admin()
      .from('labo_expeditions')
      .select('*, dentistes_clients(nom, prenom, titre)', { count: 'exact' })
      .eq('prothesiste_id', req.prothesisteId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (statut) query = query.eq('statut', statut);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (transporteur) query = query.eq('transporteur', transporteur);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      expeditions: data || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (e) {
    console.error('[LABO EXPEDITIONS GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── GET /api/labo/expeditions/:id ───
// Detail avec events et BL lies
router.get('/:id', async (req, res) => {
  try {
    const { data: expedition, error } = await admin()
      .from('labo_expeditions')
      .select('*, dentistes_clients(*)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !expedition) return res.status(404).json({ error: 'Expédition non trouvée' });

    // Tracking events
    const { data: events } = await admin()
      .from('labo_expedition_events')
      .select('*')
      .eq('expedition_id', expedition.id)
      .order('date_evenement', { ascending: true });

    // BL lies
    let blLies = [];
    if (expedition.bons_livraison_ids && expedition.bons_livraison_ids.length > 0) {
      const { data: bls } = await admin()
        .from('bons_livraison')
        .select('id, numero_bl, date_bl, statut, montant_ttc')
        .in('id', expedition.bons_livraison_ids);
      blLies = bls || [];
    }

    // Cases production liees
    let casesLies = [];
    if (expedition.cases_production_ids && expedition.cases_production_ids.length > 0) {
      const { data: cases } = await admin()
        .from('labo_cases_production')
        .select('id, numero_case, patient_nom, statut')
        .in('id', expedition.cases_production_ids);
      casesLies = cases || [];
    }

    res.json({
      expedition,
      events: events || [],
      bons_livraison: blLies,
      cases_production: casesLies
    });
  } catch (e) {
    console.error('[LABO EXPEDITIONS detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── POST /api/labo/expeditions ───
// Creer une expedition
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.dentiste_id) {
      return res.status(400).json({ error: 'dentiste_id requis' });
    }

    // Charger adresse dentiste si non fournie
    let adresseDestination = b.adresse_destination || null;
    if (!adresseDestination) {
      const { data: dentiste } = await admin()
        .from('dentistes_clients')
        .select('nom, prenom, titre, adresse, code_postal, ville, telephone, email')
        .eq('id', b.dentiste_id)
        .eq('prothesiste_id', req.prothesisteId)
        .single();

      if (dentiste) {
        adresseDestination = {
          nom: `${dentiste.titre || ''} ${dentiste.prenom || ''} ${dentiste.nom || ''}`.trim(),
          adresse: dentiste.adresse || '',
          cp: dentiste.code_postal || '',
          ville: dentiste.ville || '',
          tel: dentiste.telephone || '',
          email: dentiste.email || ''
        };
      }
    }

    // Charger adresse expediteur depuis profil prothesiste
    let adresseExpediteur = null;
    if (req.prothesiste) {
      adresseExpediteur = {
        nom: req.prothesiste.nom_labo || req.prothesiste.nom || '',
        adresse: req.prothesiste.adresse || '',
        cp: req.prothesiste.code_postal || '',
        ville: req.prothesiste.ville || '',
        tel: req.prothesiste.telephone || '',
        email: req.prothesiste.email || ''
      };
    }

    const numeroSuivi = b.numero_suivi || genererNumeroSuivi();

    const { data: expedition, error } = await admin()
      .from('labo_expeditions')
      .insert({
        prothesiste_id: req.prothesisteId,
        dentiste_id: b.dentiste_id,
        bons_livraison_ids: b.bons_livraison_ids || [],
        cases_production_ids: b.cases_production_ids || [],
        transporteur: b.transporteur || 'colissimo',
        numero_suivi: numeroSuivi,
        poids_grammes: b.poids_grammes || null,
        valeur_declaree: b.valeur_declaree || null,
        assurance: b.assurance || false,
        statut: 'prepare',
        adresse_expediteur: adresseExpediteur,
        adresse_destination: adresseDestination,
        notes_expedition: b.notes_expedition || null,
        date_expedition: b.date_expedition || null,
        date_livraison_estimee: b.date_livraison_estimee || null
      })
      .select()
      .single();

    if (error) throw error;

    // Creer le premier event
    await admin()
      .from('labo_expedition_events')
      .insert({
        expedition_id: expedition.id,
        statut: 'prepare',
        commentaire: 'Expédition créée',
        date_evenement: new Date().toISOString()
      });

    res.status(201).json({ expedition });
  } catch (e) {
    console.error('[LABO EXPEDITIONS POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── PUT /api/labo/expeditions/:id ───
// Mettre a jour une expedition
router.put('/:id', async (req, res) => {
  try {
    const b = req.body;

    // Verifier que l'expedition appartient au prothesiste
    const { data: existing } = await admin()
      .from('labo_expeditions')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!existing) return res.status(404).json({ error: 'Expédition non trouvée' });

    const updates = {};
    const allowed = [
      'transporteur', 'numero_suivi', 'poids_grammes', 'valeur_declaree',
      'assurance', 'statut', 'adresse_destination', 'notes_expedition',
      'date_expedition', 'date_livraison_estimee', 'bons_livraison_ids',
      'cases_production_ids'
    ];
    allowed.forEach(key => {
      if (b[key] !== undefined) updates[key] = b[key];
    });
    updates.updated_at = new Date().toISOString();

    const { data: expedition, error } = await admin()
      .from('labo_expeditions')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;

    res.json({ expedition });
  } catch (e) {
    console.error('[LABO EXPEDITIONS PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── POST /api/labo/expeditions/:id/tracking ───
// Ajouter un evenement de suivi
router.post('/:id/tracking', async (req, res) => {
  try {
    const b = req.body;
    if (!b.statut) return res.status(400).json({ error: 'statut requis' });

    const validStatuts = ['prepare', 'enleve', 'en_transit', 'livre', 'retour'];
    if (!validStatuts.includes(b.statut)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    // Verifier ownership
    const { data: expedition } = await admin()
      .from('labo_expeditions')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!expedition) return res.status(404).json({ error: 'Expédition non trouvée' });

    // Creer l'event
    const { data: event, error } = await admin()
      .from('labo_expedition_events')
      .insert({
        expedition_id: req.params.id,
        statut: b.statut,
        localisation: b.localisation || null,
        commentaire: b.commentaire || null,
        date_evenement: b.date_evenement || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Mettre a jour le statut de l'expedition
    const expUpdates = { statut: b.statut, updated_at: new Date().toISOString() };
    if (b.statut === 'enleve') {
      expUpdates.date_expedition = b.date_evenement || new Date().toISOString();
    }

    await admin()
      .from('labo_expeditions')
      .update(expUpdates)
      .eq('id', req.params.id);

    res.status(201).json({ event });
  } catch (e) {
    console.error('[LABO EXPEDITIONS tracking]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── POST /api/labo/expeditions/:id/confirmer-livraison ───
// Confirmer la livraison
router.post('/:id/confirmer-livraison', async (req, res) => {
  try {
    const b = req.body;

    // Verifier ownership
    const { data: expedition } = await admin()
      .from('labo_expeditions')
      .select('id, bons_livraison_ids')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!expedition) return res.status(404).json({ error: 'Expédition non trouvée' });

    const dateLivraison = b.date_livraison || new Date().toISOString();

    // Marquer l'expedition comme livree
    const { error: upErr } = await admin()
      .from('labo_expeditions')
      .update({
        statut: 'livre',
        date_livraison_reelle: dateLivraison,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (upErr) throw upErr;

    // Ajouter un event livraison
    await admin()
      .from('labo_expedition_events')
      .insert({
        expedition_id: req.params.id,
        statut: 'livre',
        commentaire: b.commentaire || 'Livraison confirmée',
        date_evenement: dateLivraison
      });

    // Optionnel : marquer les BL lies comme "livre"
    if (b.marquer_bl_livres !== false && expedition.bons_livraison_ids && expedition.bons_livraison_ids.length > 0) {
      await admin()
        .from('bons_livraison')
        .update({ statut: 'livre', updated_at: new Date().toISOString() })
        .in('id', expedition.bons_livraison_ids)
        .eq('prothesiste_id', req.prothesisteId);
    }

    res.json({ success: true, date_livraison: dateLivraison });
  } catch (e) {
    console.error('[LABO EXPEDITIONS confirmer-livraison]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─── POST /api/labo/expeditions/:id/etiquette ───
// Générer les données d'étiquette d'expédition
router.post('/:id/etiquette', async (req, res) => {
  try {
    const { data: expedition, error } = await admin()
      .from('labo_expeditions')
      .select('*, dentistes_clients(nom, prenom, titre, adresse, code_postal, ville, telephone)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !expedition) return res.status(404).json({ error: 'Expédition non trouvée' });

    const expediteur = expedition.adresse_expediteur || {};
    const destinataire = expedition.adresse_destination || {};

    // Fallback sur dentiste si adresse_destination vide
    const dentiste = expedition.dentistes_clients;
    const destNom = destinataire.nom || (dentiste ? `${dentiste.titre || ''} ${dentiste.prenom || ''} ${dentiste.nom || ''}`.trim() : '');
    const destAdresse = destinataire.adresse || (dentiste ? dentiste.adresse : '') || '';
    const destCp = destinataire.cp || (dentiste ? dentiste.code_postal : '') || '';
    const destVille = destinataire.ville || (dentiste ? dentiste.ville : '') || '';
    const destTel = destinataire.tel || (dentiste ? dentiste.telephone : '') || '';

    const etiquette = {
      expediteur: {
        nom: expediteur.nom || '',
        adresse: expediteur.adresse || '',
        cp: expediteur.cp || '',
        ville: expediteur.ville || '',
        tel: expediteur.tel || ''
      },
      destinataire: {
        nom: destNom,
        adresse: destAdresse,
        cp: destCp,
        ville: destVille,
        tel: destTel
      },
      colis: {
        poids: expedition.poids_grammes || 0,
        numero_suivi: expedition.numero_suivi || '',
        date: expedition.date_expedition || new Date().toISOString(),
        transporteur: expedition.transporteur,
        valeur_declaree: expedition.valeur_declaree || null,
        assurance: expedition.assurance || false
      },
      code_barres: expedition.numero_suivi || ''
    };

    res.json({ etiquette });
  } catch (e) {
    console.error('[LABO EXPEDITIONS etiquette]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
