// =============================================
// JADOMI RUSH — Routes devis inverse (appel d'offres)
// =============================================

const express = require('express');
const { genererAlias } = require('../../services/anonymat-filter');
const { estimerTransport } = require('../../services/transport-calculator');

function createDevisRouter(supabase) {
  const router = express.Router();

  // POST /api/rush/devis — Soumettre un devis sur une demande
  router.post('/', async (req, res) => {
    try {
      const { demande_id, prothesiste_id, prix_propose, delai_fabrication_jours, message } = req.body;
      if (!demande_id || !prothesiste_id || !prix_propose || !delai_fabrication_jours) {
        return res.status(400).json({ error: 'demande_id, prothesiste_id, prix_propose, delai_fabrication_jours requis' });
      }

      // Verifier que la demande existe et est ouverte
      const { data: demande } = await supabase
        .from('rush_demandes').select('*').eq('id', demande_id).single();
      if (!demande || demande.statut !== 'ouverte') {
        return res.status(400).json({ error: 'Demande non disponible' });
      }

      // Verifier que le prothesiste ne repond pas a sa propre demande
      if (demande.demandeur_id === parseInt(prothesiste_id)) {
        return res.status(400).json({ error: 'Vous ne pouvez pas repondre a votre propre demande' });
      }

      // Generer alias stable
      const alias = genererAlias(prothesiste_id);

      // Estimer transport
      const { data: proth } = await supabase
        .from('prothesistes').select('cp_depart:code_postal').eq('id', prothesiste_id).single();

      let coutTransport = 0;
      let delaiLivraison = 2;
      if (proth && demande.cp_depart) {
        const transport = estimerTransport({
          cpDepart: proth.cp_depart || proth.code_postal,
          cpArrivee: demande.cp_depart,
          typeTravail: demande.type_travail,
          quantite: demande.quantite || 1
        });
        coutTransport = transport.recommandation.prix;
        delaiLivraison = transport.recommandation.delai_jours;
      }

      const prixTotal = parseFloat(prix_propose) + coutTransport;

      const { data, error } = await supabase.from('rush_devis').insert({
        demande_id,
        prothesiste_id: parseInt(prothesiste_id),
        alias_prothesiste: alias,
        prix_propose: parseFloat(prix_propose),
        delai_fabrication_jours: parseInt(delai_fabrication_jours),
        delai_livraison_jours: delaiLivraison,
        cout_transport_estime: coutTransport,
        prix_total_estime: Math.round(prixTotal * 100) / 100,
        message: message || null,
        statut: 'en_attente'
      }).select().single();

      if (error) throw error;
      res.json({ success: true, devis: data });
    } catch (e) {
      console.error('[RUSH devis POST]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/devis/:demande_id — Liste devis pour une demande
  router.get('/:demande_id', async (req, res) => {
    try {
      const { data: devis, error } = await supabase
        .from('rush_devis')
        .select('*')
        .eq('demande_id', req.params.demande_id)
        .order('prix_total_estime', { ascending: true });

      if (error) throw error;

      // Enrichir avec scores
      const prothIds = [...new Set((devis || []).map(d => d.prothesiste_id))];
      let scores = {};
      if (prothIds.length) {
        const { data: scoresData } = await supabase
          .from('v_scores_prothesistes')
          .select('*')
          .in('id', prothIds);
        for (const s of (scoresData || [])) scores[s.id] = s;
      }

      const enriched = (devis || []).map(d => ({
        ...d,
        score: scores[d.prothesiste_id] ? {
          note_moyenne: scores[d.prothesiste_id].note_moyenne,
          nb_travaux: scores[d.prothesiste_id].nb_travaux,
          taux_respect_delais: scores[d.prothesiste_id].taux_respect_delais,
          badge: scores[d.prothesiste_id].badge
        } : { note_moyenne: 5, nb_travaux: 0, badge: 'nouveau' }
      }));

      res.json({ success: true, devis: enriched });
    } catch (e) {
      console.error('[RUSH devis GET]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/devis/:id/accepter — Accepter un devis
  router.post('/:id/accepter', async (req, res) => {
    try {
      const { data: devis } = await supabase
        .from('rush_devis').select('*').eq('id', req.params.id).single();
      if (!devis || devis.statut !== 'en_attente') {
        return res.status(400).json({ error: 'Devis non disponible' });
      }

      // Marquer ce devis comme accepte
      await supabase.from('rush_devis')
        .update({ statut: 'accepte' })
        .eq('id', devis.id);

      // Refuser les autres devis de cette demande
      await supabase.from('rush_devis')
        .update({ statut: 'refuse' })
        .eq('demande_id', devis.demande_id)
        .neq('id', devis.id);

      // Mettre a jour la demande
      const commissionPct = parseFloat(process.env.JADOMI_RUSH_COMMISSION_PCT) || 10;
      const commission = Math.round(devis.prix_propose * commissionPct / 100 * 100) / 100;

      await supabase.from('rush_demandes').update({
        statut: 'attribuee',
        statut_detail: 'prothesiste_selectionne',
        preneur_id: devis.prothesiste_id,
        devis_accepte_id: devis.id,
        commission_pct: commissionPct,
        cout_transport: devis.cout_transport_estime,
        total_paye: devis.prix_total_estime
      }).eq('id', devis.demande_id);

      res.json({
        success: true,
        message: 'Devis accepte — paiement requis',
        devis,
        paiement_requis: {
          montant_total: devis.prix_total_estime,
          montant_travaux: devis.prix_propose,
          transport: devis.cout_transport_estime,
          commission: commission
        }
      });
    } catch (e) {
      console.error('[RUSH devis accepter]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createDevisRouter };
