// =============================================
// JADOMI AVOCAT EXPERT — Notes d'honoraires
// Facturation des prestations juridiques
// Calcul automatique depuis time entries
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
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// === HELPERS ===

/**
 * Genere le prochain numero de note d'honoraires : NH-{YYYY}-{seq}
 */
async function generateNumero(societeId) {
  const year = new Date().getFullYear();
  const prefix = `NH-${year}-`;
  const { data } = await admin().from('avocat_honoraires')
    .select('numero')
    .eq('societe_id', societeId)
    .like('numero', `${prefix}%`)
    .order('numero', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const last = data[0].numero;
    const lastSeq = parseInt(last.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(4, '0');
}

/**
 * Calcule la date d'echeance par defaut : emission + 30 jours
 */
function defaultEcheance(dateEmission) {
  const d = new Date(dateEmission);
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

// ================================================
// POST /generate — Generer une note d'honoraires
// ================================================
router.post('/generate', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, include_debours, provision_versee, date_echeance, tva_applicable } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    // Verifier que le dossier appartient a cette societe
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, titre, taux_horaire_defaut, client_id, avocat_societe_id')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();
    if (dErr || !dossier) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });

    const tauxHoraire = dossier.taux_horaire_defaut || 250;

    // Recuperer les time entries facturables non encore facturees
    const { data: entries, error: eErr } = await admin().from('avocat_time_entries')
      .select('id, description, duree_heures, taux_horaire, created_at')
      .eq('dossier_id', dossier_id)
      .eq('facturable', true)
      .is('facture_id', null)
      .order('created_at', { ascending: true });

    if (eErr) return res.status(500).json({ error: 'Erreur lors de la récupération des prestations' });
    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: 'Aucune prestation facturable non facturée pour ce dossier' });
    }

    // Construire les lignes d'honoraires
    const lignesHonoraires = entries.map(e => ({
      type: 'honoraire',
      description: e.description || 'Prestation juridique',
      quantite: e.duree_heures || 0,
      unite: 'heure',
      prix_unitaire: e.taux_horaire || tauxHoraire,
      montant: parseFloat(((e.duree_heures || 0) * (e.taux_horaire || tauxHoraire)).toFixed(2)),
      time_entry_id: e.id
    }));

    // Ajouter les debours si fournis
    const lignesDebours = (include_debours || []).map(d => ({
      type: 'debours',
      description: d.description || 'Debours',
      quantite: 1,
      unite: 'forfait',
      prix_unitaire: d.montant || 0,
      montant: parseFloat((d.montant || 0).toFixed(2))
    }));

    const lignes = [...lignesHonoraires, ...lignesDebours];

    // Calculs financiers
    const totalHonorairesHt = parseFloat(lignesHonoraires.reduce((s, l) => s + l.montant, 0).toFixed(2));
    const totalDebours = parseFloat(lignesDebours.reduce((s, l) => s + l.montant, 0).toFixed(2));
    const sousTotalHt = parseFloat((totalHonorairesHt + totalDebours).toFixed(2));

    // TVA : 20% par defaut, 0% si exoneration art. 261-4-1° CGI
    const tvaTaux = tva_applicable === false ? 0 : 20;
    const tvaMontant = parseFloat((sousTotalHt * tvaTaux / 100).toFixed(2));
    const totalTtc = parseFloat((sousTotalHt + tvaMontant).toFixed(2));

    const provisionVersee = parseFloat((provision_versee || 0).toFixed(2));
    const resteAPayer = parseFloat((totalTtc - provisionVersee).toFixed(2));

    const dateEmission = new Date().toISOString().split('T')[0];
    const echeance = date_echeance || defaultEcheance(dateEmission);
    const numero = await generateNumero(req.societeId);

    // Mentions legales
    const mentionsLegales = tvaTaux === 0
      ? 'TVA non applicable, article 261-4-1° du Code général des impôts.'
      : 'TVA au taux de 20 % applicable conformément à la réglementation en vigueur.';

    // Inserer la note d'honoraires
    const { data: honoraire, error: hErr } = await admin().from('avocat_honoraires').insert({
      societe_id: req.societeId,
      dossier_id,
      client_id: dossier.client_id,
      numero,
      date_emission: dateEmission,
      date_echeance: echeance,
      lignes,
      total_honoraires_ht: totalHonorairesHt,
      total_debours: totalDebours,
      sous_total_ht: sousTotalHt,
      tva_taux: tvaTaux,
      tva_montant: tvaMontant,
      total_ttc: totalTtc,
      provision_versee: provisionVersee,
      reste_a_payer: resteAPayer,
      statut: 'brouillon',
      mentions_legales: mentionsLegales,
      nb_relances: 0
    }).select().single();

    if (hErr) return res.status(500).json({ error: 'Erreur lors de la création de la note : ' + hErr.message });

    // Marquer les time entries comme facturees
    const entryIds = entries.map(e => e.id);
    const { error: uErr } = await admin().from('avocat_time_entries')
      .update({ facture_id: honoraire.id })
      .in('id', entryIds);

    if (uErr) {
      console.error('[honoraires/generate] Erreur liaison time_entries:', uErr.message);
    }

    return res.status(201).json({
      honoraire,
      nb_prestations: lignesHonoraires.length,
      nb_debours: lignesDebours.length,
      message: 'Note d\'honoraires ' + numero + ' générée avec succès.'
    });
  } catch (err) {
    console.error('[honoraires/generate]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET / — Liste des notes d'honoraires
// ================================================
router.get('/', requireAvocat, async (req, res) => {
  try {
    const { statut, dossier_id, client_id, from, to } = req.query;

    let query = admin().from('avocat_honoraires')
      .select('id, numero, date_emission, date_echeance, total_ttc, reste_a_payer, statut, nb_relances, dossier_id, client_id, created_at')
      .eq('societe_id', req.societeId)
      .order('date_emission', { ascending: false });

    if (statut) query = query.eq('statut', statut);
    if (dossier_id) query = query.eq('dossier_id', dossier_id);
    if (client_id) query = query.eq('client_id', client_id);
    if (from) query = query.gte('date_emission', from);
    if (to) query = query.lte('date_emission', to);

    const { data: honoraires, error } = await query;
    if (error) return res.status(500).json({ error: 'Erreur interne' });

    // Enrichir avec noms client et dossier
    const clientIds = [...new Set((honoraires || []).map(h => h.client_id).filter(Boolean))];
    const dossierIds = [...new Set((honoraires || []).map(h => h.dossier_id).filter(Boolean))];

    let clientsMap = {};
    let dossiersMap = {};

    if (clientIds.length > 0) {
      const { data: clients } = await admin().from('avocat_clients')
        .select('id, nom, prenom, email')
        .in('id', clientIds);
      (clients || []).forEach(c => { clientsMap[c.id] = c; });
    }

    if (dossierIds.length > 0) {
      const { data: dossiers } = await admin().from('avocat_dossiers')
        .select('id, titre, reference')
        .in('id', dossierIds);
      (dossiers || []).forEach(d => { dossiersMap[d.id] = d; });
    }

    const result = (honoraires || []).map(h => ({
      ...h,
      client: clientsMap[h.client_id] || null,
      dossier: dossiersMap[h.dossier_id] || null
    }));

    return res.json(result);
  } catch (err) {
    console.error('[honoraires/list]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /:id — Detail d'une note d'honoraires
// ================================================
router.get('/:id', requireAvocat, async (req, res) => {
  try {
    const { data: honoraire, error } = await admin().from('avocat_honoraires')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();

    if (error || !honoraire) return res.status(404).json({ error: 'Note d\'honoraires non trouvée' });

    // Recuperer client et dossier
    let client = null;
    let dossier = null;

    if (honoraire.client_id) {
      const { data: c } = await admin().from('avocat_clients')
        .select('id, nom, prenom, email, telephone')
        .eq('id', honoraire.client_id)
        .single();
      client = c;
    }

    if (honoraire.dossier_id) {
      const { data: d } = await admin().from('avocat_dossiers')
        .select('id, titre, reference, type')
        .eq('id', honoraire.dossier_id)
        .single();
      dossier = d;
    }

    return res.json({ ...honoraire, client, dossier });
  } catch (err) {
    console.error('[honoraires/detail]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// PATCH /:id/statut — Changer le statut
// ================================================
router.patch('/:id/statut', requireAvocat, async (req, res) => {
  try {
    const { statut, montant_paye, mode_paiement, date_paiement } = req.body || {};
    const statutsValides = ['brouillon', 'envoyee', 'payee_partiel', 'payee', 'annulee', 'contentieux'];
    if (!statut || !statutsValides.includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide. Valeurs acceptées : ' + statutsValides.join(', ') });
    }

    // Verifier existence et appartenance
    const { data: honoraire, error: hErr } = await admin().from('avocat_honoraires')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();

    if (hErr || !honoraire) return res.status(404).json({ error: 'Note d\'honoraires non trouvee' });

    const updates = { statut };

    if (statut === 'payee') {
      updates.montant_paye = honoraire.total_ttc;
      updates.date_paiement = date_paiement || new Date().toISOString().split('T')[0];
      updates.mode_paiement = mode_paiement || honoraire.mode_paiement || 'virement';
      updates.reste_a_payer = 0;
    } else if (statut === 'payee_partiel') {
      if (!montant_paye || montant_paye <= 0) {
        return res.status(400).json({ error: 'montant_paye requis pour un paiement partiel' });
      }
      const totalPaye = parseFloat(((honoraire.montant_paye || 0) + montant_paye).toFixed(2));
      updates.montant_paye = totalPaye;
      updates.date_paiement = date_paiement || new Date().toISOString().split('T')[0];
      updates.mode_paiement = mode_paiement || honoraire.mode_paiement;
      updates.reste_a_payer = parseFloat((honoraire.total_ttc - (honoraire.provision_versee || 0) - totalPaye).toFixed(2));
    }

    const { error: uErr } = await admin().from('avocat_honoraires')
      .update(updates)
      .eq('id', req.params.id);

    if (uErr) return res.status(500).json({ error: 'Erreur lors de la mise à jour : ' + uErr.message });

    // Mettre a jour le montant encaisse sur le dossier
    if ((statut === 'payee' || statut === 'payee_partiel') && honoraire.dossier_id) {
      try {
        const { data: allHono } = await admin().from('avocat_honoraires')
          .select('montant_paye')
          .eq('dossier_id', honoraire.dossier_id)
          .in('statut', ['payee', 'payee_partiel']);

        const totalEncaisse = (allHono || []).reduce((s, h) => s + (h.montant_paye || 0), 0);
        // Ajouter le montant du paiement courant si pas encore pris en compte
        const encaisseActuel = statut === 'payee'
          ? totalEncaisse - (honoraire.montant_paye || 0) + honoraire.total_ttc
          : totalEncaisse - (honoraire.montant_paye || 0) + updates.montant_paye;

        await admin().from('avocat_dossiers')
          .update({ montant_encaisse_total: parseFloat(encaisseActuel.toFixed(2)) })
          .eq('id', honoraire.dossier_id);
      } catch (dossierErr) {
        console.error('[honoraires/statut] Erreur maj dossier encaisse:', dossierErr.message);
      }
    }

    return res.json({ success: true, statut, message: 'Statut mis à jour.' });
  } catch (err) {
    console.error('[honoraires/statut]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// DELETE /:id — Supprimer (brouillon uniquement)
// ================================================
router.delete('/:id', requireAvocat, async (req, res) => {
  try {
    // Verifier existence, appartenance et statut
    const { data: honoraire, error: hErr } = await admin().from('avocat_honoraires')
      .select('id, statut, lignes')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();

    if (hErr || !honoraire) return res.status(404).json({ error: 'Note d\'honoraires non trouvee' });
    if (honoraire.statut !== 'brouillon') {
      return res.status(400).json({ error: 'Seules les notes au statut brouillon peuvent être supprimées' });
    }

    // Delier les time entries
    const timeEntryIds = (honoraire.lignes || [])
      .filter(l => l.time_entry_id)
      .map(l => l.time_entry_id);

    if (timeEntryIds.length > 0) {
      const { error: unlinkErr } = await admin().from('avocat_time_entries')
        .update({ facture_id: null })
        .in('id', timeEntryIds);

      if (unlinkErr) {
        console.error('[honoraires/delete] Erreur deliaison time_entries:', unlinkErr.message);
      }
    }

    // Supprimer la note
    const { error: dErr } = await admin().from('avocat_honoraires')
      .delete()
      .eq('id', req.params.id);

    if (dErr) return res.status(500).json({ error: 'Erreur lors de la suppression : ' + dErr.message });

    return res.json({ success: true, message: 'Note d\'honoraires supprimée.' });
  } catch (err) {
    console.error('[honoraires/delete]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
