// JADOMI — Juridique : Comptabilité & honoraires
const { admin, requireSociete } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('juridique_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // Stats dashboard
  router.get('/comptabilite/stats', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, stats: { today: 0, week: 0, month: 0, year: 0, commission_month: 0, net_month: 0 } });

      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const startOfYear = `${now.getFullYear()}-01-01`;

      const { data: all } = await admin().from('juridique_honoraires')
        .select('montant_brut, commission_jadomi, montant_net, date_acte')
        .eq('profil_id', profilId)
        .gte('date_acte', startOfYear);

      const entries = all || [];
      const sum = (arr, field) => arr.reduce((s, e) => s + Number(e[field] || 0), 0);

      const todayEntries = entries.filter(e => e.date_acte === today);
      const weekEntries = entries.filter(e => e.date_acte >= startOfWeek.toISOString().split('T')[0]);
      const monthEntries = entries.filter(e => e.date_acte >= startOfMonth);

      // Compte des RDV du jour
      const { data: rdvsToday } = await admin().from('juridique_reservations')
        .select('id').eq('profil_id', profilId).eq('date_rdv', today)
        .in('statut', ['confirme', 'en_cours']);

      // RDV en attente
      const { data: enAttente } = await admin().from('juridique_reservations')
        .select('id').eq('profil_id', profilId).eq('statut', 'en_attente');

      // Note moyenne
      const { data: profil } = await admin().from('juridique_profil')
        .select('note_moyenne, nb_avis').eq('id', profilId).single();

      res.json({
        success: true,
        stats: {
          rdv_today: (rdvsToday || []).length,
          en_attente: (enAttente || []).length,
          note_moyenne: profil?.note_moyenne || 0,
          nb_avis: profil?.nb_avis || 0,
          brut_today: sum(todayEntries, 'montant_brut'),
          brut_week: sum(weekEntries, 'montant_brut'),
          brut_month: sum(monthEntries, 'montant_brut'),
          brut_year: sum(entries, 'montant_brut'),
          commission_month: sum(monthEntries, 'commission_jadomi'),
          net_month: sum(monthEntries, 'montant_net'),
          net_year: sum(entries, 'montant_net')
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Liste honoraires
  router.get('/comptabilite/honoraires', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, honoraires: [] });

      let query = admin().from('juridique_honoraires')
        .select('*').eq('profil_id', profilId).order('date_acte', { ascending: false });

      if (req.query.from) query = query.gte('date_acte', req.query.from);
      if (req.query.to) query = query.lte('date_acte', req.query.to);
      if (req.query.mode) query = query.eq('mode_paiement', req.query.mode);

      const { data } = await query;
      res.json({ success: true, honoraires: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Saisie manuelle
  router.post('/comptabilite/honoraires', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Profil requis' });

      const commissionPct = parseFloat(process.env.JADOMI_JURIDIQUE_COMMISSION_PCT || '5');
      const montantBrut = Number(req.body.montant_brut || 0);
      const commission = montantBrut * commissionPct / 100;
      const net = montantBrut - commission;

      const { data, error } = await admin().from('juridique_honoraires')
        .insert({
          profil_id: profilId,
          designation: req.body.designation,
          date_acte: req.body.date_acte || new Date().toISOString().split('T')[0],
          montant_brut: montantBrut,
          commission_jadomi: commission,
          montant_net: net,
          mode_paiement: req.body.mode_paiement || 'cb',
          notes: req.body.notes
        }).select('*').single();
      if (error) throw error;
      res.json({ success: true, honoraire: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Export CSV
  router.get('/comptabilite/export/:annee', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const annee = parseInt(req.params.annee);
      const { data } = await admin().from('juridique_honoraires')
        .select('*').eq('profil_id', profilId)
        .gte('date_acte', `${annee}-01-01`).lte('date_acte', `${annee}-12-31`)
        .order('date_acte');

      const rows = [['Date', 'Désignation', 'Montant brut (€)', 'Commission JADOMI (€)', 'Montant net (€)', 'Mode paiement']];
      for (const h of (data || [])) {
        rows.push([h.date_acte, h.designation, h.montant_brut, h.commission_jadomi, h.montant_net, h.mode_paiement]);
      }
      const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="honoraires-${annee}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (e) { res.status(500).send(e.message); }
  });
};
