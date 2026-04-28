// =============================================
// JADOMI LABO — Réseau solidaire inter-labos
// Annuaire, sous-traitance, achats groupés, entraide
// Charte "100% Fabrication France"
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// ─── Helper : vérifier charte France ───
async function hasCharteFrance(prothesisteId) {
  const { data } = await admin()
    .from('labo_reseau_profils')
    .select('charte_france')
    .eq('prothesiste_id', prothesisteId)
    .eq('statut', 'actif')
    .maybeSingle();
  return data?.charte_france === true;
}

// Middleware : prothesisteId requis
function requireProthesiste(req, res, next) {
  if (!req.prothesisteId) return res.status(404).json({ error: 'Profil prothésiste requis' });
  next();
}

router.use(requireProthesiste);

// ═══════════════════════════════════════════
// A. ANNUAIRE RÉSEAU
// ═══════════════════════════════════════════

// GET /annuaire — Parcourir les labos du réseau
router.get('/annuaire', async (req, res) => {
  try {
    const { ville, departement, specialites, disponible_soustraitance } = req.query;

    let query = admin()
      .from('labo_reseau_profils')
      .select('id, prothesiste_id, specialites, capacite_production, accepte_soustraitance, zone_geographique, departement, ville, equipements, certifications, description_courte, charte_france, note_moyenne, nombre_avis, statut, created_at')
      .eq('statut', 'actif')
      .order('charte_france', { ascending: false })
      .order('note_moyenne', { ascending: false });

    if (ville) {
      const safeVille = ville.replace(/[%_\\]/g, '');
      query = query.ilike('ville', `%${safeVille}%`);
    }
    if (departement) query = query.eq('departement', departement);
    if (specialites) query = query.contains('specialites', [specialites]);
    if (disponible_soustraitance === 'true') query = query.eq('accepte_soustraitance', true);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ labos: data || [] });
  } catch (e) {
    console.error('[RESEAU annuaire]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /annuaire/:id — Profil public d'un labo
router.get('/annuaire/:id', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('labo_reseau_profils')
      .select('id, prothesiste_id, specialites, capacite_production, accepte_soustraitance, zone_geographique, departement, ville, equipements, certifications, description_courte, charte_france, note_moyenne, nombre_avis, statut, created_at')
      .eq('id', req.params.id)
      .eq('statut', 'actif')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Labo non trouvé' });

    res.json({ labo: data });
  } catch (e) {
    console.error('[RESEAU annuaire/:id]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /profil-reseau — Créer/mettre à jour son profil réseau
router.post('/profil-reseau', async (req, res) => {
  try {
    const b = req.body;

    if (b.charte_france !== true) {
      return res.status(400).json({ error: 'La charte 100% Fabrication France doit être acceptée pour rejoindre le réseau' });
    }

    const payload = {
      prothesiste_id: req.prothesisteId,
      specialites: b.specialites || [],
      capacite_production: b.capacite_production || 'moyenne',
      accepte_soustraitance: b.accepte_soustraitance !== false,
      zone_geographique: b.zone_geographique || null,
      departement: b.departement || null,
      ville: b.ville || null,
      equipements: b.equipements || [],
      certifications: b.certifications || [],
      description_courte: b.description_courte || null,
      charte_france: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await admin()
      .from('labo_reseau_profils')
      .upsert(payload, { onConflict: 'prothesiste_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({ profil: data });
  } catch (e) {
    console.error('[RESEAU profil-reseau POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /profil-reseau — Mon profil réseau
router.get('/profil-reseau', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('labo_reseau_profils')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (error) throw error;

    res.json({ profil: data || null });
  } catch (e) {
    console.error('[RESEAU profil-reseau GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ═══════════════════════════════════════════
// B. SOUS-TRAITANCE ENTRE LABOS
// ═══════════════════════════════════════════

// GET /annonces — Liste des annonces
router.get('/annonces', async (req, res) => {
  try {
    const { type, specialite, urgence, departement } = req.query;

    let query = admin()
      .from('labo_reseau_annonces')
      .select('*')
      .eq('statut', 'active')
      .order('urgence', { ascending: false })
      .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (specialite) {
      const safeSpec = specialite.replace(/[%_\\]/g, '');
      query = query.ilike('specialite_requise', `%${safeSpec}%`);
    }
    if (urgence === 'true') query = query.eq('urgence', true);
    if (departement) {
      // Filter by department via profil
      const { data: profils } = await admin()
        .from('labo_reseau_profils')
        .select('prothesiste_id')
        .eq('departement', departement);
      const ids = (profils || []).map(p => p.prothesiste_id);
      if (ids.length > 0) {
        query = query.in('prothesiste_id', ids);
      } else {
        return res.json({ annonces: [] });
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ annonces: data || [] });
  } catch (e) {
    console.error('[RESEAU annonces GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /annonces — Créer une annonce (charte requise)
router.post('/annonces', async (req, res) => {
  try {
    if (!(await hasCharteFrance(req.prothesisteId))) {
      return res.status(403).json({ error: 'Charte 100% France requise pour publier une annonce' });
    }

    const b = req.body;
    if (!b.type || !['offre', 'demande'].includes(b.type)) {
      return res.status(400).json({ error: 'Type requis: offre ou demande' });
    }
    if (!b.titre) return res.status(400).json({ error: 'Titre requis' });

    const { data, error } = await admin()
      .from('labo_reseau_annonces')
      .insert({
        prothesiste_id: req.prothesisteId,
        type: b.type,
        titre: b.titre,
        description: b.description || null,
        specialite_requise: b.specialite_requise || null,
        type_travail: b.type_travail || null,
        quantite: b.quantite || null,
        urgence: b.urgence || false,
        date_limite: b.date_limite || null,
        tarif_propose: b.tarif_propose || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ annonce: data });
  } catch (e) {
    console.error('[RESEAU annonces POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// PUT /annonces/:id — Modifier sa propre annonce
router.put('/annonces/:id', async (req, res) => {
  try {
    const b = req.body;
    const updates = {};
    if (b.titre !== undefined) updates.titre = b.titre;
    if (b.description !== undefined) updates.description = b.description;
    if (b.specialite_requise !== undefined) updates.specialite_requise = b.specialite_requise;
    if (b.type_travail !== undefined) updates.type_travail = b.type_travail;
    if (b.quantite !== undefined) updates.quantite = b.quantite;
    if (b.urgence !== undefined) updates.urgence = b.urgence;
    if (b.date_limite !== undefined) updates.date_limite = b.date_limite;
    if (b.tarif_propose !== undefined) updates.tarif_propose = b.tarif_propose;
    if (b.statut !== undefined) updates.statut = b.statut;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('labo_reseau_annonces')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Annonce non trouvée ou non autorisée' });

    res.json({ annonce: data });
  } catch (e) {
    console.error('[RESEAU annonces PUT]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// DELETE /annonces/:id — Supprimer sa propre annonce
router.delete('/annonces/:id', async (req, res) => {
  try {
    const { error } = await admin()
      .from('labo_reseau_annonces')
      .delete()
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId);

    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    console.error('[RESEAU annonces DELETE]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /annonces/:id/repondre — Répondre à une annonce (charte requise)
router.post('/annonces/:id/repondre', async (req, res) => {
  try {
    if (!(await hasCharteFrance(req.prothesisteId))) {
      return res.status(403).json({ error: 'Charte 100% France requise pour répondre' });
    }

    // Vérifier que l'annonce existe et est active
    const { data: annonce } = await admin()
      .from('labo_reseau_annonces')
      .select('id, prothesiste_id')
      .eq('id', req.params.id)
      .eq('statut', 'active')
      .maybeSingle();

    if (!annonce) return res.status(404).json({ error: 'Annonce non trouvée ou plus active' });
    if (annonce.prothesiste_id === req.prothesisteId) {
      return res.status(400).json({ error: 'Impossible de répondre à sa propre annonce' });
    }

    const b = req.body;
    const { data, error } = await admin()
      .from('labo_reseau_reponses')
      .insert({
        annonce_id: req.params.id,
        prothesiste_id: req.prothesisteId,
        message: b.message || null,
        tarif_propose: b.tarif_propose || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ reponse: data });
  } catch (e) {
    console.error('[RESEAU repondre POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /annonces/:id/reponses — Voir les réponses à sa propre annonce
router.get('/annonces/:id/reponses', async (req, res) => {
  try {
    // Vérifier propriété de l'annonce
    const { data: annonce } = await admin()
      .from('labo_reseau_annonces')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (!annonce) return res.status(404).json({ error: 'Annonce non trouvée ou non autorisée' });

    const { data, error } = await admin()
      .from('labo_reseau_reponses')
      .select('*')
      .eq('annonce_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ reponses: data || [] });
  } catch (e) {
    console.error('[RESEAU reponses GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ═══════════════════════════════════════════
// C. ACHATS GROUPÉS
// ═══════════════════════════════════════════

// GET /achats-groupes — Campagnes actives
router.get('/achats-groupes', async (req, res) => {
  try {
    const { data: campagnes, error } = await admin()
      .from('labo_achats_groupes')
      .select('*')
      .in('statut', ['ouvert', 'atteint'])
      .order('date_cloture', { ascending: true });

    if (error) throw error;

    // Enrichir avec nombre de participants et palier actuel
    const enriched = await Promise.all((campagnes || []).map(async (c) => {
      const { count } = await admin()
        .from('labo_achats_groupes_participants')
        .select('*', { count: 'exact', head: true })
        .eq('achat_groupe_id', c.id);

      const paliers = c.paliers || [];
      let prix_actuel = c.prix_catalogue;
      let prochain_palier = null;
      for (const p of paliers) {
        if (count >= p.min_participants) {
          prix_actuel = p.prix_unitaire;
        } else if (!prochain_palier) {
          prochain_palier = p;
        }
      }

      return {
        ...c,
        participants_count: count || 0,
        prix_actuel,
        prochain_palier
      };
    }));

    res.json({ achats_groupes: enriched });
  } catch (e) {
    console.error('[RESEAU achats-groupes GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /achats-groupes — Créer une campagne (charte requise)
router.post('/achats-groupes', async (req, res) => {
  try {
    if (!(await hasCharteFrance(req.prothesisteId))) {
      return res.status(403).json({ error: 'Charte 100% France requise pour créer un achat groupé' });
    }

    const b = req.body;
    if (!b.produit) return res.status(400).json({ error: 'Produit requis' });

    const { data, error } = await admin()
      .from('labo_achats_groupes')
      .insert({
        createur_id: req.prothesisteId,
        produit: b.produit,
        marque: b.marque || null,
        fournisseur: b.fournisseur || null,
        description: b.description || null,
        quantite_unitaire: b.quantite_unitaire || null,
        prix_catalogue: b.prix_unitaire_catalogue || null,
        paliers: b.paliers || [],
        date_cloture: b.date_cloture || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ achat_groupe: data });
  } catch (e) {
    console.error('[RESEAU achats-groupes POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /achats-groupes/:id/rejoindre — Rejoindre une campagne (charte requise)
router.post('/achats-groupes/:id/rejoindre', async (req, res) => {
  try {
    if (!(await hasCharteFrance(req.prothesisteId))) {
      return res.status(403).json({ error: 'Charte 100% France requise pour rejoindre un achat groupé' });
    }

    // Vérifier campagne ouverte
    const { data: campagne } = await admin()
      .from('labo_achats_groupes')
      .select('id, statut')
      .eq('id', req.params.id)
      .in('statut', ['ouvert', 'atteint'])
      .maybeSingle();

    if (!campagne) return res.status(404).json({ error: 'Campagne non trouvée ou clôturée' });

    const b = req.body;
    const { data, error } = await admin()
      .from('labo_achats_groupes_participants')
      .upsert({
        achat_groupe_id: req.params.id,
        prothesiste_id: req.prothesisteId,
        quantite: b.quantite || 1
      }, { onConflict: 'achat_groupe_id,prothesiste_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({ participation: data });
  } catch (e) {
    console.error('[RESEAU rejoindre POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /achats-groupes/:id — Détail d'une campagne
router.get('/achats-groupes/:id', async (req, res) => {
  try {
    const { data: campagne, error } = await admin()
      .from('labo_achats_groupes')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!campagne) return res.status(404).json({ error: 'Campagne non trouvée' });

    const { count } = await admin()
      .from('labo_achats_groupes_participants')
      .select('*', { count: 'exact', head: true })
      .eq('achat_groupe_id', campagne.id);

    const paliers = campagne.paliers || [];
    let prix_actuel = campagne.prix_catalogue;
    let prochain_palier = null;
    for (const p of paliers) {
      if (count >= p.min_participants) {
        prix_actuel = p.prix_unitaire;
      } else if (!prochain_palier) {
        prochain_palier = p;
      }
    }

    res.json({
      achat_groupe: {
        ...campagne,
        participants_count: count || 0,
        prix_actuel,
        prochain_palier
      }
    });
  } catch (e) {
    console.error('[RESEAU achats-groupes/:id GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// DELETE /achats-groupes/:id/quitter — Quitter une campagne
router.delete('/achats-groupes/:id/quitter', async (req, res) => {
  try {
    const { error } = await admin()
      .from('labo_achats_groupes_participants')
      .delete()
      .eq('achat_groupe_id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId);

    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    console.error('[RESEAU quitter DELETE]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ═══════════════════════════════════════════
// D. ENTRAIDE / FORUM
// ═══════════════════════════════════════════

// GET /entraide — Liste des sujets
router.get('/entraide', async (req, res) => {
  try {
    const { categorie } = req.query;

    let query = admin()
      .from('labo_reseau_entraide')
      .select('*')
      .order('created_at', { ascending: false });

    if (categorie) query = query.eq('categorie', categorie);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ sujets: data || [] });
  } catch (e) {
    console.error('[RESEAU entraide GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /entraide — Poster un sujet (charte requise)
router.post('/entraide', async (req, res) => {
  try {
    if (!(await hasCharteFrance(req.prothesisteId))) {
      return res.status(403).json({ error: 'Charte 100% France requise pour participer au forum' });
    }

    const b = req.body;
    if (!b.titre || !b.contenu) return res.status(400).json({ error: 'Titre et contenu requis' });

    const { data, error } = await admin()
      .from('labo_reseau_entraide')
      .insert({
        prothesiste_id: req.prothesisteId,
        categorie: b.categorie || 'technique',
        titre: b.titre,
        contenu: b.contenu
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ sujet: data });
  } catch (e) {
    console.error('[RESEAU entraide POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /entraide/:id/reponse — Répondre à un sujet (charte requise)
router.post('/entraide/:id/reponse', async (req, res) => {
  try {
    if (!(await hasCharteFrance(req.prothesisteId))) {
      return res.status(403).json({ error: 'Charte 100% France requise pour répondre' });
    }

    const b = req.body;
    if (!b.contenu) return res.status(400).json({ error: 'Contenu requis' });

    // Vérifier que le sujet existe
    const { data: sujet } = await admin()
      .from('labo_reseau_entraide')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!sujet) return res.status(404).json({ error: 'Sujet non trouvé' });

    const { data, error } = await admin()
      .from('labo_reseau_entraide_reponses')
      .insert({
        sujet_id: req.params.id,
        prothesiste_id: req.prothesisteId,
        contenu: b.contenu
      })
      .select()
      .single();

    if (error) throw error;

    // Incrémenter le compteur de réponses
    // Note: sujet ne contient que 'id', on utilise un RPC ou refetch
    const { data: sujetFull } = await admin()
      .from('labo_reseau_entraide')
      .select('reponses_count')
      .eq('id', req.params.id)
      .single();

    await admin()
      .from('labo_reseau_entraide')
      .update({
        reponses_count: ((sujetFull?.reponses_count) || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    res.status(201).json({ reponse: data });
  } catch (e) {
    console.error('[RESEAU entraide reponse POST]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /entraide/:id — Sujet avec réponses
router.get('/entraide/:id', async (req, res) => {
  try {
    const { data: sujet, error: sErr } = await admin()
      .from('labo_reseau_entraide')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!sujet) return res.status(404).json({ error: 'Sujet non trouvé' });

    const { data: reponses, error: rErr } = await admin()
      .from('labo_reseau_entraide_reponses')
      .select('*')
      .eq('sujet_id', req.params.id)
      .order('created_at', { ascending: true });

    if (rErr) throw rErr;

    res.json({ sujet, reponses: reponses || [] });
  } catch (e) {
    console.error('[RESEAU entraide/:id GET]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ═══════════════════════════════════════════
// E. STATS RÉSEAU
// ═══════════════════════════════════════════

router.get('/stats', async (req, res) => {
  try {
    // Total labos dans le réseau
    const { count: totalLabos } = await admin()
      .from('labo_reseau_profils')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'actif')
      .eq('charte_france', true);

    // Par département
    const { data: deptData } = await admin()
      .from('labo_reseau_profils')
      .select('departement')
      .eq('statut', 'actif')
      .eq('charte_france', true);

    const parDepartement = {};
    for (const row of (deptData || [])) {
      if (row.departement) {
        parDepartement[row.departement] = (parDepartement[row.departement] || 0) + 1;
      }
    }

    // Annonces actives
    const { count: annoncesActives } = await admin()
      .from('labo_reseau_annonces')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'active');

    // Achats groupés ouverts
    const { count: achatsActifs } = await admin()
      .from('labo_achats_groupes')
      .select('*', { count: 'exact', head: true })
      .in('statut', ['ouvert', 'atteint']);

    // Estimation économies (somme des différences prix_catalogue - palier atteint)
    const { data: achatsData } = await admin()
      .from('labo_achats_groupes')
      .select('id, prix_catalogue, paliers')
      .in('statut', ['ouvert', 'atteint', 'cloture']);

    let economiesEstimees = 0;
    for (const a of (achatsData || [])) {
      if (!a.prix_catalogue || !a.paliers?.length) continue;
      const { count: nbPart } = await admin()
        .from('labo_achats_groupes_participants')
        .select('*', { count: 'exact', head: true })
        .eq('achat_groupe_id', a.id);

      let meilleurPrix = a.prix_catalogue;
      for (const p of a.paliers) {
        if (nbPart >= p.min_participants) meilleurPrix = p.prix_unitaire;
      }
      economiesEstimees += (a.prix_catalogue - meilleurPrix) * (nbPart || 0);
    }

    res.json({
      stats: {
        total_labos: totalLabos || 0,
        par_departement: parDepartement,
        annonces_actives: annoncesActives || 0,
        achats_groupes_actifs: achatsActifs || 0,
        economies_estimees: Math.round(economiesEstimees * 100) / 100
      }
    });
  } catch (e) {
    console.error('[RESEAU stats]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
