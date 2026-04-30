// =============================================
// JADOMI LABO — Routes tournées livreur
// Gestion intelligente des tournées de livraison
// prothésiste ↔ cabinets dentaires
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');
const { pushNotification } = require('../../api/multiSocietes/notifications');

// ─────────────────────────────────────────────
// LIVREURS — CRUD
// ─────────────────────────────────────────────

// GET /api/labo/tournees/livreurs — Liste des livreurs
router.get('/livreurs', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    const { actif } = req.query;
    let query = admin()
      .from('labo_livreurs')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .order('nom');

    if (actif !== undefined) query = query.eq('actif', actif === '1' || actif === 'true');

    const { data, error } = await query;
    if (error) throw error;

    res.json({ livreurs: data || [] });
  } catch (e) {
    console.error('[LABO TOURNEES livreurs GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/livreurs — Créer un livreur
router.post('/livreurs', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });

    const b = req.body;
    if (!b.nom || !b.prenom) return res.status(400).json({ error: 'Nom et prénom requis' });

    const { data, error } = await admin()
      .from('labo_livreurs')
      .insert({
        prothesiste_id: req.prothesisteId,
        nom: b.nom,
        prenom: b.prenom,
        telephone: b.telephone || null,
        email: b.email || null,
        vehicule: b.vehicule || 'voiture',
        zone_rayon_km: b.zone_rayon_km || 50,
        couleur: b.couleur || '#6366f1'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ livreur: data });
  } catch (e) {
    console.error('[LABO TOURNEES livreurs POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// PUT /api/labo/tournees/livreurs/:id — Modifier un livreur
router.put('/livreurs/:id', async (req, res) => {
  try {
    const b = req.body;
    const updates = {};
    const allowed = ['nom', 'prenom', 'telephone', 'email', 'vehicule', 'zone_rayon_km', 'couleur', 'actif'];
    allowed.forEach(key => { if (b[key] !== undefined) updates[key] = b[key]; });

    const { data, error } = await admin()
      .from('labo_livreurs')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ livreur: data });
  } catch (e) {
    console.error('[LABO TOURNEES livreurs PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// DEMANDES DE PASSAGE
// ─────────────────────────────────────────────

// GET /api/labo/tournees/demandes — Liste des demandes
router.get('/demandes', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { statut, priorite, dentiste_id, from, to, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = admin()
      .from('labo_demandes_passage')
      .select('*, dentistes_clients(nom, prenom, titre, adresse, ville, code_postal, telephone)', { count: 'exact' })
      .eq('prothesiste_id', req.prothesisteId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (statut) query = query.eq('statut', statut);
    if (priorite) query = query.eq('priorite', priorite);
    if (dentiste_id) query = query.eq('dentiste_client_id', dentiste_id);
    if (from) query = query.gte('date_souhaitee', from);
    if (to) query = query.lte('date_souhaitee', to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ demandes: data || [], total: count || 0, page: parseInt(page) });
  } catch (e) {
    console.error('[LABO TOURNEES demandes GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/tournees/demandes/en-attente — Compteur demandes en attente
router.get('/demandes/en-attente', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { count: total } = await admin()
      .from('labo_demandes_passage')
      .select('id', { count: 'exact', head: true })
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'en_attente');

    const { count: urgentes } = await admin()
      .from('labo_demandes_passage')
      .select('id', { count: 'exact', head: true })
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'en_attente')
      .eq('priorite', 'urgent');

    res.json({ en_attente: total || 0, urgentes: urgentes || 0 });
  } catch (e) {
    console.error('[LABO TOURNEES demandes en-attente]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/demandes — Créer une demande de passage
router.post('/demandes', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.dentiste_client_id) return res.status(400).json({ error: 'dentiste_client_id requis' });
    if (!b.type_passage) return res.status(400).json({ error: 'type_passage requis' });

    // Vérifier que le dentiste n'est pas absent ce jour-là
    if (b.date_souhaitee) {
      const { data: absence } = await admin()
        .from('labo_absences_dentiste')
        .select('id, adresse_alternative, ville_alternative, cp_alternative, latitude_alt, longitude_alt')
        .eq('prothesiste_id', req.prothesisteId)
        .eq('dentiste_client_id', b.dentiste_client_id)
        .lte('date_debut', b.date_souhaitee)
        .gte('date_fin', b.date_souhaitee)
        .maybeSingle();

      if (absence) {
        // Si adresse alternative disponible, l'utiliser automatiquement
        if (absence.adresse_alternative) {
          b.adresse_livraison = absence.adresse_alternative;
          b.ville_livraison = absence.ville_alternative;
          b.cp_livraison = absence.cp_alternative;
          b.latitude = absence.latitude_alt;
          b.longitude = absence.longitude_alt;
        } else {
          return res.status(409).json({
            error: 'dentiste_absent',
            message: 'Ce dentiste est absent à la date souhaitée et n\'a pas fourni d\'adresse alternative.'
          });
        }
      }
    }

    // Charger adresse dentiste si pas fournie
    if (!b.adresse_livraison) {
      const { data: dentiste } = await admin()
        .from('dentistes_clients')
        .select('adresse, ville, code_postal, latitude, longitude')
        .eq('id', b.dentiste_client_id)
        .eq('prothesiste_id', req.prothesisteId)
        .single();

      if (dentiste) {
        b.adresse_livraison = b.adresse_livraison || dentiste.adresse;
        b.ville_livraison = b.ville_livraison || dentiste.ville;
        b.cp_livraison = b.cp_livraison || dentiste.code_postal;
        b.latitude = b.latitude || dentiste.latitude;
        b.longitude = b.longitude || dentiste.longitude;
      }
    }

    // Déterminer la date : si pas fournie ou trop tard pour aujourd'hui
    let dateSouhaitee = b.date_souhaitee;
    if (!dateSouhaitee) {
      const now = new Date();
      const heure = now.getHours();
      // Si après 11h, la prochaine tournée est l'après-midi d'aujourd'hui
      // Si après 16h, c'est le lendemain matin
      if (heure >= 16) {
        const demain = new Date(now);
        demain.setDate(demain.getDate() + 1);
        dateSouhaitee = demain.toISOString().split('T')[0];
      } else {
        dateSouhaitee = now.toISOString().split('T')[0];
      }
    }

    const { data: demande, error } = await admin()
      .from('labo_demandes_passage')
      .insert({
        prothesiste_id: req.prothesisteId,
        dentiste_client_id: b.dentiste_client_id,
        origine: b.origine || 'prothesiste',
        type_passage: b.type_passage,
        priorite: b.priorite || 'normal',
        references_travaux: b.references_travaux || [],
        description: b.description || null,
        nb_colis: b.nb_colis || 1,
        bon_livraison_id: b.bon_livraison_id || null,
        adresse_livraison: b.adresse_livraison || null,
        ville_livraison: b.ville_livraison || null,
        cp_livraison: b.cp_livraison || null,
        latitude: b.latitude || null,
        longitude: b.longitude || null,
        date_souhaitee: dateSouhaitee,
        creneau: b.creneau || 'indifferent',
        notes: b.notes || null
      })
      .select('*, dentistes_clients(nom, prenom, titre)')
      .single();

    if (error) throw error;

    res.status(201).json({ demande });
  } catch (e) {
    console.error('[LABO TOURNEES demandes POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// PUT /api/labo/tournees/demandes/:id — Modifier une demande
router.put('/demandes/:id', async (req, res) => {
  try {
    const b = req.body;
    const updates = {};
    const allowed = [
      'type_passage', 'priorite', 'references_travaux', 'description',
      'nb_colis', 'adresse_livraison', 'ville_livraison', 'cp_livraison',
      'latitude', 'longitude', 'date_souhaitee', 'creneau', 'statut', 'notes'
    ];
    allowed.forEach(key => { if (b[key] !== undefined) updates[key] = b[key]; });

    const { data, error } = await admin()
      .from('labo_demandes_passage')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select('*, dentistes_clients(nom, prenom, titre)')
      .single();

    if (error) throw error;
    res.json({ demande: data });
  } catch (e) {
    console.error('[LABO TOURNEES demandes PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// NOTIFICATION ENVOI — 1 clic "En cours d'envoi"
// ─────────────────────────────────────────────

// POST /api/labo/tournees/demandes/:id/notifier-envoi
router.post('/demandes/:id/notifier-envoi', async (req, res) => {
  try {
    // Mettre à jour le statut de la demande
    const { data: demande, error } = await admin()
      .from('labo_demandes_passage')
      .update({
        statut: 'en_cours_envoi',
        dentiste_notifie: true
      })
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select('*, dentistes_clients(nom, prenom, titre, user_id)')
      .single();

    if (error) throw error;
    if (!demande) return res.status(404).json({ error: 'Demande non trouvée' });

    // Notifier le dentiste s'il est sur JADOMI
    const dentiste = demande.dentistes_clients;
    if (dentiste && dentiste.user_id) {
      const refs = (demande.references_travaux || []).join(', ');
      await pushNotification({
        user_id: dentiste.user_id,
        type: 'autre',
        urgence: 'normale',
        titre: 'Prothèse(s) en cours d\'envoi',
        message: `Vos travaux${refs ? ` (réf. ${refs})` : ''} sont en cours d'acheminement par votre prothésiste.`,
        cta_label: 'Voir le suivi',
        cta_url: '/labo-pro/suivi-livraisons'
      });
    }

    res.json({ success: true, demande });
  } catch (e) {
    console.error('[LABO TOURNEES notifier-envoi]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// TOURNÉES — Génération et gestion
// ─────────────────────────────────────────────

// GET /api/labo/tournees — Liste des tournées
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { date, livreur_id, statut, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = admin()
      .from('labo_tournees_livreur')
      .select('*, labo_livreurs(nom, prenom, telephone, couleur)', { count: 'exact' })
      .eq('prothesiste_id', req.prothesisteId)
      .order('date', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (date) query = query.eq('date', date);
    if (livreur_id) query = query.eq('livreur_id', livreur_id);
    if (statut) query = query.eq('statut', statut);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ tournees: data || [], total: count || 0, page: parseInt(page) });
  } catch (e) {
    console.error('[LABO TOURNEES GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/generer — Générer une tournée automatique
router.post('/generer', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { livreur_id, date, creneau = 'matin', navigation_app = 'waze' } = req.body;
    if (!livreur_id || !date) return res.status(400).json({ error: 'livreur_id et date requis' });

    // Vérifier qu'il n'y a pas déjà une tournée pour ce créneau
    const { data: existante } = await admin()
      .from('labo_tournees_livreur')
      .select('id')
      .eq('livreur_id', livreur_id)
      .eq('date', date)
      .eq('creneau', creneau)
      .maybeSingle();

    if (existante) {
      return res.status(409).json({
        error: 'tournee_existe',
        message: 'Une tournée existe déjà pour ce livreur/date/créneau.',
        tournee_id: existante.id
      });
    }

    // Récupérer les demandes en attente pour cette date et ce créneau
    let demandesQuery = admin()
      .from('labo_demandes_passage')
      .select('*, dentistes_clients(nom, prenom, titre, adresse, ville, code_postal, latitude, longitude)')
      .eq('prothesiste_id', req.prothesisteId)
      .in('statut', ['en_attente', 'en_cours_envoi'])
      .lte('date_souhaitee', date)
      .order('priorite'); // urgent en premier

    if (creneau !== 'indifferent') {
      demandesQuery = demandesQuery.in('creneau', [creneau, 'indifferent']);
    }

    const { data: demandes, error: demErr } = await demandesQuery;
    if (demErr) throw demErr;

    if (!demandes || demandes.length === 0) {
      return res.status(200).json({
        message: 'Aucune demande de passage en attente pour ce créneau.',
        tournee: null
      });
    }

    // Filtrer les dentistes absents
    const { data: absences } = await admin()
      .from('labo_absences_dentiste')
      .select('dentiste_client_id')
      .eq('prothesiste_id', req.prothesisteId)
      .lte('date_debut', date)
      .gte('date_fin', date);

    const absentIds = new Set((absences || []).map(a => a.dentiste_client_id));

    const demandesFiltrees = demandes.filter(d => {
      if (absentIds.has(d.dentiste_client_id) && !d.adresse_livraison) return false;
      return true;
    });

    // Construire l'ordre des arrêts (tri par priorité puis proximité basique)
    const prioriteOrdre = { urgent: 0, normal: 1, light: 2 };
    demandesFiltrees.sort((a, b) => {
      const pa = prioriteOrdre[a.priorite] || 1;
      const pb = prioriteOrdre[b.priorite] || 1;
      return pa - pb;
    });

    const ordreArrets = demandesFiltrees.map((d, i) => ({
      demande_id: d.id,
      dentiste_nom: d.dentistes_clients
        ? `${d.dentistes_clients.titre || ''} ${d.dentistes_clients.prenom || ''} ${d.dentistes_clients.nom || ''}`.trim()
        : 'Inconnu',
      adresse: d.adresse_livraison || d.dentistes_clients?.adresse || '',
      ville: d.ville_livraison || d.dentistes_clients?.ville || '',
      type: d.type_passage,
      priorite: d.priorite,
      nb_colis: d.nb_colis,
      lat: d.latitude || d.dentistes_clients?.latitude || null,
      lng: d.longitude || d.dentistes_clients?.longitude || null
    }));

    // Créer la tournée
    const { data: tournee, error: tourErr } = await admin()
      .from('labo_tournees_livreur')
      .insert({
        prothesiste_id: req.prothesisteId,
        livreur_id,
        date,
        creneau,
        ordre_arrets: ordreArrets,
        nb_arrets: ordreArrets.length,
        navigation_app,
        statut: 'planifiee'
      })
      .select('*, labo_livreurs(nom, prenom)')
      .single();

    if (tourErr) throw tourErr;

    // Créer les arrêts individuels
    const arrets = demandesFiltrees.map((d, i) => ({
      tournee_id: tournee.id,
      demande_id: d.id,
      dentiste_client_id: d.dentiste_client_id,
      ordre: i + 1,
      type_passage: d.type_passage
    }));

    if (arrets.length > 0) {
      await admin().from('labo_arrets_tournee').insert(arrets);
    }

    // Mettre à jour le statut des demandes
    const demandeIds = demandesFiltrees.map(d => d.id);
    if (demandeIds.length > 0) {
      await admin()
        .from('labo_demandes_passage')
        .update({
          statut: 'planifiee',
          tournee_id: tournee.id,
          livreur_id
        })
        .in('id', demandeIds)
        .eq('prothesiste_id', req.prothesisteId);
    }

    res.status(201).json({
      tournee,
      nb_arrets: ordreArrets.length,
      arrets: ordreArrets
    });
  } catch (e) {
    console.error('[LABO TOURNEES generer]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/labo/tournees/:id — Détail d'une tournée avec arrêts
router.get('/:id', async (req, res) => {
  try {
    const { data: tournee, error } = await admin()
      .from('labo_tournees_livreur')
      .select('*, labo_livreurs(nom, prenom, telephone, couleur, vehicule)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !tournee) return res.status(404).json({ error: 'Tournée non trouvée' });

    // Charger les arrêts avec détails
    const { data: arrets } = await admin()
      .from('labo_arrets_tournee')
      .select('*, dentistes_clients(nom, prenom, titre, adresse, ville, code_postal, telephone), labo_demandes_passage(references_travaux, description, nb_colis, priorite, type_passage)')
      .eq('tournee_id', tournee.id)
      .order('ordre');

    res.json({ tournee, arrets: arrets || [] });
  } catch (e) {
    console.error('[LABO TOURNEES detail]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// FEUILLE DE ROUTE — Actions du livreur
// ─────────────────────────────────────────────

// POST /api/labo/tournees/:id/demarrer — Démarrer la tournée
router.post('/:id/demarrer', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('labo_tournees_livreur')
      .update({
        statut: 'en_cours',
        heure_depart: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, tournee: data });
  } catch (e) {
    console.error('[LABO TOURNEES demarrer]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/:id/terminer — Terminer la tournée
router.post('/:id/terminer', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('labo_tournees_livreur')
      .update({
        statut: 'terminee',
        heure_fin: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, tournee: data });
  } catch (e) {
    console.error('[LABO TOURNEES terminer]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/arrets/:id/valider — Valider un arrêt (bon de passage)
router.post('/arrets/:id/valider', async (req, res) => {
  try {
    const b = req.body;

    // Charger l'arrêt avec sa tournée pour vérifier ownership
    const { data: arret, error: arErr } = await admin()
      .from('labo_arrets_tournee')
      .select('*, labo_tournees_livreur!inner(prothesiste_id), labo_demandes_passage(id, dentiste_client_id, references_travaux, type_passage)')
      .eq('id', req.params.id)
      .single();

    if (arErr || !arret) return res.status(404).json({ error: 'Arrêt non trouvé' });
    if (arret.labo_tournees_livreur.prothesiste_id !== req.prothesisteId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    // Mettre à jour l'arrêt
    const { data: updated, error } = await admin()
      .from('labo_arrets_tournee')
      .update({
        statut: b.statut || 'termine',
        heure_arrivee: b.heure_arrivee || new Date().toISOString(),
        heure_depart: b.heure_depart || null,
        bon_passage_valide: true,
        notes: b.notes || null
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Mettre à jour la demande associée
    const statutDemande = arret.labo_demandes_passage?.type_passage === 'livraison' ? 'livree' : 'recuperee';
    await admin()
      .from('labo_demandes_passage')
      .update({
        statut: statutDemande,
        heure_passage: new Date().toISOString(),
        bon_passage_valide: true
      })
      .eq('id', arret.demande_id);

    // Notifier le dentiste : passage effectué
    const demande = arret.labo_demandes_passage;
    if (demande) {
      const { data: dentiste } = await admin()
        .from('dentistes_clients')
        .select('user_id, nom, prenom')
        .eq('id', demande.dentiste_client_id)
        .maybeSingle();

      if (dentiste && dentiste.user_id) {
        const action = demande.type_passage === 'livraison' ? 'livrée' : 'récupérée';
        const refs = (demande.references_travaux || []).join(', ');
        await pushNotification({
          user_id: dentiste.user_id,
          type: 'autre',
          urgence: 'normale',
          titre: `Prothèse ${action}`,
          message: `Votre prothèse${refs ? ` (réf. ${refs})` : ''} a été ${action} avec succès.`,
          cta_label: 'Voir le détail',
          cta_url: '/labo-pro/suivi-livraisons'
        });
      }
    }

    res.json({ success: true, arret: updated });
  } catch (e) {
    console.error('[LABO TOURNEES arret valider]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/arrets/:id/absent — Dentiste absent
router.post('/arrets/:id/absent', async (req, res) => {
  try {
    const { data: arret } = await admin()
      .from('labo_arrets_tournee')
      .select('*, labo_tournees_livreur!inner(prothesiste_id)')
      .eq('id', req.params.id)
      .single();

    if (!arret || arret.labo_tournees_livreur.prothesiste_id !== req.prothesisteId) {
      return res.status(404).json({ error: 'Arrêt non trouvé' });
    }

    await admin()
      .from('labo_arrets_tournee')
      .update({ statut: 'absent', heure_arrivee: new Date().toISOString(), notes: req.body.notes || 'Dentiste absent' })
      .eq('id', req.params.id);

    // Remettre la demande en attente pour la prochaine tournée
    await admin()
      .from('labo_demandes_passage')
      .update({ statut: 'en_attente', tournee_id: null, livreur_id: null })
      .eq('id', arret.demande_id);

    res.json({ success: true });
  } catch (e) {
    console.error('[LABO TOURNEES arret absent]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// ABSENCES DENTISTE
// ─────────────────────────────────────────────

// GET /api/labo/tournees/absences — Liste des absences
router.get('/absences/liste', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { dentiste_id, actives_only } = req.query;
    let query = admin()
      .from('labo_absences_dentiste')
      .select('*, dentistes_clients(nom, prenom, titre)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_debut', { ascending: false });

    if (dentiste_id) query = query.eq('dentiste_client_id', dentiste_id);
    if (actives_only === '1') query = query.gte('date_fin', new Date().toISOString().split('T')[0]);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ absences: data || [] });
  } catch (e) {
    console.error('[LABO TOURNEES absences GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/labo/tournees/absences — Créer une absence
router.post('/absences', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.dentiste_client_id || !b.date_debut || !b.date_fin) {
      return res.status(400).json({ error: 'dentiste_client_id, date_debut et date_fin requis' });
    }

    const { data, error } = await admin()
      .from('labo_absences_dentiste')
      .insert({
        prothesiste_id: req.prothesisteId,
        dentiste_client_id: b.dentiste_client_id,
        date_debut: b.date_debut,
        date_fin: b.date_fin,
        motif: b.motif || null,
        adresse_alternative: b.adresse_alternative || null,
        ville_alternative: b.ville_alternative || null,
        cp_alternative: b.cp_alternative || null,
        latitude_alt: b.latitude_alt || null,
        longitude_alt: b.longitude_alt || null,
        notes: b.notes || null
      })
      .select('*, dentistes_clients(nom, prenom, titre)')
      .single();

    if (error) throw error;
    res.status(201).json({ absence: data });
  } catch (e) {
    console.error('[LABO TOURNEES absences POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// DELETE /api/labo/tournees/absences/:id — Supprimer une absence
router.delete('/absences/:id', async (req, res) => {
  try {
    await admin()
      .from('labo_absences_dentiste')
      .delete()
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId);

    res.json({ success: true });
  } catch (e) {
    console.error('[LABO TOURNEES absences DELETE]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────

// GET /api/labo/tournees/stats
router.get('/stats/global', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const aujourdhui = now.toISOString().split('T')[0];

    const [
      { count: totalDemandes },
      { count: enAttente },
      { count: tourneesAujourdhui },
      { count: totalTourneeMois },
      { count: livreesMois }
    ] = await Promise.all([
      admin().from('labo_demandes_passage').select('id', { count: 'exact', head: true }).eq('prothesiste_id', req.prothesisteId),
      admin().from('labo_demandes_passage').select('id', { count: 'exact', head: true }).eq('prothesiste_id', req.prothesisteId).eq('statut', 'en_attente'),
      admin().from('labo_tournees_livreur').select('id', { count: 'exact', head: true }).eq('prothesiste_id', req.prothesisteId).eq('date', aujourdhui),
      admin().from('labo_tournees_livreur').select('id', { count: 'exact', head: true }).eq('prothesiste_id', req.prothesisteId).gte('date', debutMois),
      admin().from('labo_demandes_passage').select('id', { count: 'exact', head: true }).eq('prothesiste_id', req.prothesisteId).in('statut', ['livree', 'recuperee']).gte('updated_at', debutMois)
    ]);

    res.json({
      total_demandes: totalDemandes || 0,
      en_attente: enAttente || 0,
      tournees_aujourdhui: tourneesAujourdhui || 0,
      tournees_ce_mois: totalTourneeMois || 0,
      livrees_ce_mois: livreesMois || 0
    });
  } catch (e) {
    console.error('[LABO TOURNEES stats]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
