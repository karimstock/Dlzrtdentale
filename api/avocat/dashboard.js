// =============================================
// JADOMI AVOCAT EXPERT — Dashboard KPIs & Analytics
// Cabinet d'avocat : chiffre d'affaires, dossiers, time-tracking
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
  } catch { return res.status(401).json({ error: 'Auth echouee' }); }
}

// === HELPERS ===
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1).toISOString();
}

function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999).toISOString();
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ================================================
// GET /stats — KPIs principaux du cabinet
// ================================================
router.get('/stats', requireAvocat, async (req, res) => {
  try {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const curMonthStart = startOfMonth(now);
    const curMonthEnd = endOfMonth(now);
    const prevMonthStart = startOfMonth(prevMonth);
    const prevMonthEnd = endOfMonth(prevMonth);
    const yearStart = startOfYear(now);
    const yearEnd = endOfYear(now);
    const sid = req.societeId;

    // Honoraires du mois courant
    const { data: honCur } = await admin().from('avocat_honoraires')
      .select('total_ttc, montant_paye, statut, date_echeance')
      .eq('societe_id', sid)
      .gte('date_emission', curMonthStart)
      .lte('date_emission', curMonthEnd);

    // Honoraires du mois precedent
    const { data: honPrev } = await admin().from('avocat_honoraires')
      .select('total_ttc')
      .eq('societe_id', sid)
      .gte('date_emission', prevMonthStart)
      .lte('date_emission', prevMonthEnd);

    // Honoraires de l'annee
    const { data: honYear } = await admin().from('avocat_honoraires')
      .select('total_ttc, montant_paye, statut, date_echeance')
      .eq('societe_id', sid)
      .gte('date_emission', yearStart)
      .lte('date_emission', yearEnd);

    // Dossiers
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('etape, created_at, closed_at')
      .eq('avocat_societe_id', sid);

    // Time entries du mois courant
    const { data: timeEntries } = await admin().from('avocat_time_entries')
      .select('duration_minutes, facturable')
      .eq('societe_id', sid)
      .gte('created_at', curMonthStart)
      .lte('created_at', curMonthEnd);

    // Impayes (toutes les factures impayees, pas seulement le mois courant)
    const { data: impayes } = await admin().from('avocat_honoraires')
      .select('total_ttc, montant_paye')
      .eq('societe_id', sid)
      .in('statut', ['envoyee', 'payee_partiel'])
      .lt('date_echeance', new Date().toISOString());

    // --- Calculs ---
    const caMoisCourant = (honCur || []).reduce((s, h) => s + (parseFloat(h.total_ttc) || 0), 0);
    const caMoisPrecedent = (honPrev || []).reduce((s, h) => s + (parseFloat(h.total_ttc) || 0), 0);
    const caEvolution = caMoisPrecedent > 0
      ? Math.round(((caMoisCourant - caMoisPrecedent) / caMoisPrecedent) * 10000) / 100
      : (caMoisCourant > 0 ? 100 : 0);

    const yearRows = honYear || [];
    const honorairesFactures = yearRows
      .filter(h => h.statut !== 'annulee')
      .reduce((s, h) => s + (parseFloat(h.total_ttc) || 0), 0);
    const honorairesEncaisses = yearRows
      .reduce((s, h) => s + (parseFloat(h.montant_paye) || 0), 0);
    const honorairesEnAttente = Math.max(0, honorairesFactures - honorairesEncaisses);
    const tauxRecouvrement = honorairesFactures > 0
      ? Math.round((honorairesEncaisses / honorairesFactures) * 10000) / 100
      : 0;

    const allDossiers = dossiers || [];
    const dossiersActifs = allDossiers.filter(d => !['clos', 'archive'].includes(d.etape)).length;
    const dossiersNouveauxMois = allDossiers.filter(d => d.created_at >= curMonthStart && d.created_at <= curMonthEnd).length;
    const dossiersClosMois = allDossiers.filter(d => d.closed_at && d.closed_at >= curMonthStart && d.closed_at <= curMonthEnd).length;

    const entries = timeEntries || [];
    const heuresFacturables = Math.round(entries.filter(e => e.facturable).reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60 * 100) / 100;
    const heuresNonFacturables = Math.round(entries.filter(e => !e.facturable).reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60 * 100) / 100;
    const totalHeures = heuresFacturables + heuresNonFacturables;
    const tauxOccupation = totalHeures > 0
      ? Math.round((heuresFacturables / totalHeures) * 10000) / 100
      : 0;

    const impayesList = impayes || [];
    const impayesCount = impayesList.length;
    const impayesMontant = impayesList.reduce((s, h) => {
      const reste = (parseFloat(h.total_ttc) || 0) - (parseFloat(h.montant_paye) || 0);
      return s + Math.max(0, reste);
    }, 0);

    return res.json({
      ca_mois_courant: Math.round(caMoisCourant * 100) / 100,
      ca_mois_precedent: Math.round(caMoisPrecedent * 100) / 100,
      ca_evolution_percent: caEvolution,
      honoraires_factures: Math.round(honorairesFactures * 100) / 100,
      honoraires_encaisses: Math.round(honorairesEncaisses * 100) / 100,
      honoraires_en_attente: Math.round(honorairesEnAttente * 100) / 100,
      taux_recouvrement: tauxRecouvrement,
      dossiers_actifs: dossiersActifs,
      dossiers_nouveaux_mois: dossiersNouveauxMois,
      dossiers_clos_mois: dossiersClosMois,
      heures_facturables_mois: heuresFacturables,
      heures_non_facturables_mois: heuresNonFacturables,
      taux_occupation: tauxOccupation,
      impayes_count: impayesCount,
      impayes_montant: Math.round(impayesMontant * 100) / 100
    });
  } catch (err) {
    console.error('[avocat/dashboard/stats]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /dossiers-par-domaine — Dossiers par domaine juridique
// ================================================
router.get('/dossiers-par-domaine', requireAvocat, async (req, res) => {
  try {
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('domaine, etape')
      .eq('avocat_societe_id', req.societeId);

    const map = {};
    for (const d of (dossiers || [])) {
      const dom = d.domaine || 'non_defini';
      if (!map[dom]) map[dom] = { domaine: dom, total: 0, actifs: 0, clos: 0 };
      map[dom].total++;
      if (['clos', 'archive'].includes(d.etape)) {
        map[dom].clos++;
      } else {
        map[dom].actifs++;
      }
    }

    return res.json(Object.values(map).sort((a, b) => b.total - a.total));
  } catch (err) {
    console.error('[avocat/dashboard/dossiers-par-domaine]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /ca-mensuel?annee= — CA mensuel (12 mois)
// ================================================
router.get('/ca-mensuel', requireAvocat, async (req, res) => {
  try {
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    const yearStart = new Date(annee, 0, 1).toISOString();
    const yearEnd = new Date(annee, 11, 31, 23, 59, 59, 999).toISOString();

    const { data: honoraires } = await admin().from('avocat_honoraires')
      .select('total_ttc, montant_paye, date_emission, statut')
      .eq('societe_id', req.societeId)
      .gte('date_emission', yearStart)
      .lte('date_emission', yearEnd)
      .neq('statut', 'annulee');

    const months = {};
    for (let m = 0; m < 12; m++) {
      const key = annee + '-' + String(m + 1).padStart(2, '0');
      months[key] = { mois: key, facture: 0, encaisse: 0 };
    }

    for (const h of (honoraires || [])) {
      if (!h.date_emission) continue;
      const d = new Date(h.date_emission);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (months[key]) {
        months[key].facture += parseFloat(h.total_ttc) || 0;
        months[key].encaisse += parseFloat(h.montant_paye) || 0;
      }
    }

    const result = Object.values(months).map(m => ({
      mois: m.mois,
      facture: Math.round(m.facture * 100) / 100,
      encaisse: Math.round(m.encaisse * 100) / 100
    }));

    return res.json(result);
  } catch (err) {
    console.error('[avocat/dashboard/ca-mensuel]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /top-clients?limit=10 — Top clients par CA
// ================================================
router.get('/top-clients', requireAvocat, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const sid = req.societeId;

    // Honoraires avec client_id
    const { data: honoraires } = await admin().from('avocat_honoraires')
      .select('client_id, total_ttc, date_emission')
      .eq('societe_id', sid)
      .neq('statut', 'annulee');

    // Dossiers par client
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('client_id')
      .eq('avocat_societe_id', sid);

    // Tous les clients de la societe
    const { data: clients } = await admin().from('avocat_clients')
      .select('id, nom, prenom, email')
      .eq('avocat_societe_id', sid);

    const clientMap = {};
    for (const c of (clients || [])) {
      clientMap[c.id] = { nom: c.nom, prenom: c.prenom, email: c.email };
    }

    // Agreger par client_id
    const stats = {};
    for (const h of (honoraires || [])) {
      if (!h.client_id) continue;
      if (!stats[h.client_id]) stats[h.client_id] = { total_facture: 0, derniere_facture: null };
      stats[h.client_id].total_facture += parseFloat(h.total_ttc) || 0;
      if (!stats[h.client_id].derniere_facture || h.date_emission > stats[h.client_id].derniere_facture) {
        stats[h.client_id].derniere_facture = h.date_emission;
      }
    }

    // Compter dossiers par client
    const dossierCount = {};
    for (const d of (dossiers || [])) {
      if (!d.client_id) continue;
      dossierCount[d.client_id] = (dossierCount[d.client_id] || 0) + 1;
    }

    // Construire le resultat
    const result = Object.entries(stats)
      .map(([clientId, s]) => {
        const c = clientMap[clientId] || {};
        const clientName = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client inconnu';
        return {
          client_name: clientName,
          total_facture: Math.round(s.total_facture * 100) / 100,
          nb_dossiers: dossierCount[clientId] || 0,
          derniere_facture: s.derniere_facture
        };
      })
      .sort((a, b) => b.total_facture - a.total_facture)
      .slice(0, limit);

    return res.json(result);
  } catch (err) {
    console.error('[avocat/dashboard/top-clients]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /anciennete-dossiers — Age moyen des dossiers actifs
// ================================================
router.get('/anciennete-dossiers', requireAvocat, async (req, res) => {
  try {
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('id, titre, domaine, created_at, etape')
      .eq('avocat_societe_id', req.societeId)
      .not('etape', 'in', '("clos","archive")');

    const actifs = dossiers || [];
    if (!actifs.length) {
      return res.json({
        moyenne_jours: 0,
        median_jours: 0,
        plus_ancien: null,
        distribution: []
      });
    }

    const ages = actifs.map(d => daysSince(d.created_at));
    const moyenneJours = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length);
    const medianJours = median(ages);

    // Plus ancien
    let plusAncien = null;
    let maxAge = 0;
    for (const d of actifs) {
      const age = daysSince(d.created_at);
      if (age > maxAge) {
        maxAge = age;
        plusAncien = { title: d.titre, jours: age, domaine: d.domaine || 'non_defini' };
      }
    }

    // Distribution par tranche
    const tranches = [
      { label: '0-30j', min: 0, max: 30 },
      { label: '31-90j', min: 31, max: 90 },
      { label: '91-180j', min: 91, max: 180 },
      { label: '181-365j', min: 181, max: 365 },
      { label: '365j+', min: 366, max: Infinity }
    ];
    const distribution = tranches.map(t => ({
      tranche: t.label,
      count: ages.filter(a => a >= t.min && a <= t.max).length
    }));

    return res.json({
      moyenne_jours: moyenneJours,
      median_jours: medianJours,
      plus_ancien: plusAncien,
      distribution
    });
  } catch (err) {
    console.error('[avocat/dashboard/anciennete-dossiers]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
