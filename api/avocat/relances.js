// =============================================
// JADOMI AVOCAT EXPERT — Relances automatiques
// Gestion des rappels de paiement
// 3 niveaux : courtois, ferme, mise en demeure
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
  } catch { return res.status(401).json({ error: 'Authentification echouee' }); }
}

// === HELPERS ===

/**
 * Calcule le nombre de jours de retard
 */
function joursRetard(dateEcheance) {
  const echeance = new Date(dateEcheance);
  const now = new Date();
  const diff = Math.floor((now - echeance) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/**
 * Determine le niveau de relance en fonction du retard
 */
function niveauRelance(jours) {
  if (jours >= 90) return 3;
  if (jours >= 60) return 2;
  if (jours >= 30) return 1;
  return 0;
}

/**
 * Genere le contenu de la relance selon le niveau
 */
function genererContenu(niveau, honoraire, jours) {
  const numero = honoraire.numero || 'N/A';
  const totalTtc = (honoraire.total_ttc || 0).toFixed(2);
  const resteAPayer = (honoraire.reste_a_payer || 0).toFixed(2);
  const dateEmission = honoraire.date_emission || '';

  if (niveau === 1) {
    return (
      'Cher Maitre / Madame, Monsieur,\n\n' +
      'Nous nous permettons de vous rappeler que la note d\'honoraires n\u00b0' + numero +
      ' d\'un montant de ' + totalTtc + ' EUR TTC, emise le ' + dateEmission +
      ', reste impayee a ce jour.\n\n' +
      'Nous vous serions reconnaissants de bien vouloir proceder au reglement dans les meilleurs delais.\n\n' +
      'Nous restons a votre disposition.'
    );
  }

  if (niveau === 2) {
    return (
      'Madame, Monsieur,\n\n' +
      'Malgre notre precedent rappel, la note d\'honoraires n\u00b0' + numero +
      ' d\'un montant de ' + totalTtc + ' EUR TTC demeure impayee. ' +
      'Le reglement etant desormais en retard de ' + jours + ' jours, ' +
      'nous vous demandons de proceder au paiement sous 15 jours.\n\n' +
      'A defaut, nous serons contraints d\'engager une procedure de recouvrement.'
    );
  }

  if (niveau === 3) {
    return (
      'MISE EN DEMEURE\n\n' +
      'Madame, Monsieur,\n\n' +
      'Par la presente, nous vous mettons en demeure de regler la somme de ' +
      resteAPayer + ' EUR au titre de la note d\'honoraires n\u00b0' + numero +
      ' du ' + dateEmission + '.\n\n' +
      'A defaut de reglement sous 8 jours, nous nous reserverons le droit de saisir ' +
      'le Batonnier de l\'Ordre aux fins de taxation et de recouvrement conformement ' +
      'a l\'article 174 du decret n\u00b091-1197.'
    );
  }

  return '';
}

/**
 * Libelle du type de relance
 */
function typeRelance(niveau) {
  if (niveau === 1) return 'rappel_courtois';
  if (niveau === 2) return 'rappel_ferme';
  if (niveau === 3) return 'mise_en_demeure';
  return 'rappel';
}

// ================================================
// POST /check — Verifier et creer les relances
// ================================================
router.post('/check', requireAvocat, async (req, res) => {
  try {
    const now = new Date().toISOString().split('T')[0];

    // Trouver toutes les notes impayees en retard
    const { data: honoraires, error: hErr } = await admin().from('avocat_honoraires')
      .select('id, societe_id, client_id, numero, date_emission, date_echeance, total_ttc, reste_a_payer, nb_relances, statut')
      .eq('societe_id', req.societeId)
      .in('statut', ['envoyee', 'payee_partiel'])
      .lt('date_echeance', now);

    if (hErr) return res.status(500).json({ error: 'Erreur lors de la recherche des notes en retard' });
    if (!honoraires || honoraires.length === 0) {
      return res.json({ relances_creees: [], message: 'Aucune note en retard de paiement.' });
    }

    const relancesCreees = [];

    for (const h of honoraires) {
      const jours = joursRetard(h.date_echeance);
      const niveau = niveauRelance(jours);

      // Ne pas creer de relance si niveau insuffisant ou deja fait
      if (niveau === 0 || niveau <= (h.nb_relances || 0)) continue;

      const contenu = genererContenu(niveau, h, jours);

      // Inserer la relance
      const { data: relance, error: rErr } = await admin().from('avocat_relances').insert({
        societe_id: req.societeId,
        honoraire_id: h.id,
        client_id: h.client_id,
        niveau,
        type_relance: typeRelance(niveau),
        contenu,
        envoye_at: new Date().toISOString()
      }).select().single();

      if (rErr) {
        console.error('[relances/check] Erreur creation relance pour ' + h.numero + ':', rErr.message);
        continue;
      }

      // Mettre a jour la note d'honoraires
      const updates = {
        nb_relances: niveau,
        derniere_relance_at: new Date().toISOString()
      };

      // Passage en contentieux si mise en demeure
      if (niveau === 3) {
        updates.statut = 'contentieux';
      }

      await admin().from('avocat_honoraires')
        .update(updates)
        .eq('id', h.id);

      relancesCreees.push({
        relance_id: relance.id,
        honoraire_numero: h.numero,
        niveau,
        type: typeRelance(niveau),
        jours_retard: jours,
        montant_du: h.reste_a_payer
      });
    }

    return res.json({
      relances_creees: relancesCreees,
      nb_relances: relancesCreees.length,
      message: relancesCreees.length > 0
        ? relancesCreees.length + ' relance(s) generee(s).'
        : 'Toutes les relances sont a jour.'
    });
  } catch (err) {
    console.error('[relances/check]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /honoraire/:honoraireId — Relances d'une note
// ================================================
router.get('/honoraire/:honoraireId', requireAvocat, async (req, res) => {
  try {
    // Verifier que la note appartient a cette societe
    const { data: honoraire } = await admin().from('avocat_honoraires')
      .select('id')
      .eq('id', req.params.honoraireId)
      .eq('societe_id', req.societeId)
      .single();

    if (!honoraire) return res.status(404).json({ error: 'Note d\'honoraires non trouvee' });

    const { data: relances, error } = await admin().from('avocat_relances')
      .select('*')
      .eq('honoraire_id', req.params.honoraireId)
      .eq('societe_id', req.societeId)
      .order('niveau', { ascending: true });

    if (error) return res.status(500).json({ error: 'Erreur interne' });

    return res.json(relances || []);
  } catch (err) {
    console.error('[relances/honoraire]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /pending — Notes en retard a relancer
// ================================================
router.get('/pending', requireAvocat, async (req, res) => {
  try {
    const now = new Date().toISOString().split('T')[0];

    const { data: honoraires, error: hErr } = await admin().from('avocat_honoraires')
      .select('id, numero, date_emission, date_echeance, total_ttc, reste_a_payer, nb_relances, statut, client_id, dossier_id')
      .eq('societe_id', req.societeId)
      .in('statut', ['envoyee', 'payee_partiel'])
      .lt('date_echeance', now)
      .order('date_echeance', { ascending: true });

    if (hErr) return res.status(500).json({ error: 'Erreur interne' });
    if (!honoraires || honoraires.length === 0) {
      return res.json({ pending: [], message: 'Aucune note en retard.' });
    }

    // Enrichir avec client et dossier
    const clientIds = [...new Set(honoraires.map(h => h.client_id).filter(Boolean))];
    const dossierIds = [...new Set(honoraires.map(h => h.dossier_id).filter(Boolean))];

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

    const pending = honoraires.map(h => {
      const jours = joursRetard(h.date_echeance);
      const niveauSuggere = niveauRelance(jours);
      const actionRequise = niveauSuggere > (h.nb_relances || 0);

      return {
        ...h,
        client: clientsMap[h.client_id] || null,
        dossier: dossiersMap[h.dossier_id] || null,
        jours_retard: jours,
        niveau_actuel: h.nb_relances || 0,
        niveau_suggere: niveauSuggere,
        action_requise: actionRequise,
        action_suggeree: actionRequise ? typeRelance(niveauSuggere) : 'aucune'
      };
    });

    return res.json({
      pending,
      nb_total: pending.length,
      nb_action_requise: pending.filter(p => p.action_requise).length
    });
  } catch (err) {
    console.error('[relances/pending]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
