// =============================================
// JADOMI — Services : Comptabilité
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // ── Stats CA ──
  router.get('/comptabilite/stats', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_comptabilite')
        .select('montant_brut, montant_net, commission_montant, date')
        .eq('societe_id', req.societe.id);
      if (error) throw error;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const yearStart = `${now.getFullYear()}-01-01`;

      const calc = (entries) => entries.reduce((s, e) => ({
        brut: s.brut + (e.montant_brut || 0),
        net: s.net + (e.montant_net || 0),
        commission: s.commission + (e.commission_montant || 0),
        count: s.count + 1
      }), { brut: 0, net: 0, commission: 0, count: 0 });

      const all = data || [];
      res.json({
        today: calc(all.filter(e => e.date === todayStr)),
        week: calc(all.filter(e => e.date >= weekAgo)),
        month: calc(all.filter(e => e.date >= monthStart)),
        year: calc(all.filter(e => e.date >= yearStart)),
        total: calc(all)
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Stats par praticien ──
  router.get('/comptabilite/stats-praticiens', requireSociete(), async (req, res) => {
    try {
      const { periode } = req.query; // 'today', 'week', 'month', 'year'
      const now = new Date();
      let dateMin = null;
      if (periode === 'today') dateMin = now.toISOString().split('T')[0];
      else if (periode === 'week') dateMin = new Date(now - 7 * 86400000).toISOString().split('T')[0];
      else if (periode === 'month') dateMin = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      else if (periode === 'year') dateMin = `${now.getFullYear()}-01-01`;

      // Get praticiens
      const { data: prats } = await admin()
        .from('services_praticiens')
        .select('id, nom, prenom, couleur, photo_url')
        .eq('profil_id', req.societe.id)
        .eq('actif', true);

      // Get comptabilite entries
      let query = admin()
        .from('services_comptabilite')
        .select('praticien_id, montant_brut, montant_net, commission_montant, prestation_nom, date')
        .eq('societe_id', req.societe.id);
      if (dateMin) query = query.gte('date', dateMin);
      const { data: entries } = await query;

      // Get reservations for client count
      let rQuery = admin()
        .from('services_reservations')
        .select('praticien_id, client_email, prestation_id')
        .eq('profil_id', req.societe.id)
        .eq('statut', 'termine');
      if (dateMin) rQuery = rQuery.gte('date_rdv', dateMin);
      const { data: reservations } = await rQuery;

      const statsByPrat = (prats || []).map(p => {
        const pratEntries = (entries || []).filter(e => e.praticien_id === p.id);
        const pratReservs = (reservations || []).filter(r => r.praticien_id === p.id);
        const uniqueClients = new Set(pratReservs.map(r => r.client_email).filter(Boolean));

        // Top prestations
        const prestaCounts = {};
        pratReservs.forEach(r => {
          const name = pratEntries.find(e => e.prestation_nom)?.prestation_nom || 'Autre';
          prestaCounts[name] = (prestaCounts[name] || 0) + 1;
        });
        const topPrestations = Object.entries(prestaCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([nom, count]) => ({ nom, count }));

        return {
          praticien: { id: p.id, nom: p.nom, prenom: p.prenom, couleur: p.couleur, photo_url: p.photo_url },
          ca_brut: pratEntries.reduce((s, e) => s + (e.montant_brut || 0), 0),
          ca_net: pratEntries.reduce((s, e) => s + (e.montant_net || 0), 0),
          commission: pratEntries.reduce((s, e) => s + (e.commission_montant || 0), 0),
          nb_rdv: pratReservs.length,
          nb_clients: uniqueClients.size,
          top_prestations: topPrestations
        };
      });

      res.json({ stats: statsByPrat });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // LIST entries
  router.get('/comptabilite', requireSociete(), async (req, res) => {
    try {
      const { date_debut, date_fin, type, page = 1, limit = 50 } = req.query;
      let query = admin()
        .from('services_comptabilite')
        .select('*', { count: 'exact' })
        .eq('societe_id', req.societe.id)
        .order('date', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (date_debut) query = query.gte('date', date_debut);
      if (date_fin) query = query.lte('date', date_fin);
      if (type) query = query.eq('type', type);
      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ entries: data || [], total: count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST manual entry
  router.post('/comptabilite', requireSociete(), async (req, res) => {
    try {
      const { type, libelle, montant_brut, commission_pct, date, notes } = req.body;
      const commPct = commission_pct || 0;
      const commMontant = Math.round(montant_brut * commPct) / 100;
      const { data, error } = await admin()
        .from('services_comptabilite')
        .insert({
          societe_id: req.societe.id,
          type: type || 'autre',
          libelle,
          montant_brut: montant_brut || 0,
          commission_pct: commPct,
          commission_montant: commMontant,
          montant_net: (montant_brut || 0) - commMontant,
          date: date || new Date().toISOString().split('T')[0],
          notes: notes || null
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'compta_entry_create', entity: 'services_comptabilite', entityId: data.id, req });
      res.json({ entry: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET CSV export
  router.get('/comptabilite/export', requireSociete(), async (req, res) => {
    try {
      const { date_debut, date_fin } = req.query;
      let query = admin()
        .from('services_comptabilite')
        .select('*')
        .eq('societe_id', req.societe.id)
        .order('date', { ascending: true });
      if (date_debut) query = query.gte('date', date_debut);
      if (date_fin) query = query.lte('date', date_fin);
      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      const header = 'Date;Type;Libelle;Montant Brut;Commission %;Commission Montant;Montant Net;Notes\n';
      const csv = header + rows.map(r =>
        `${r.date};${r.type};${(r.libelle || '').replace(/;/g, ',')};${r.montant_brut};${r.commission_pct};${r.commission_montant};${r.montant_net};${(r.notes || '').replace(/;/g, ',')}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=comptabilite_${new Date().toISOString().split('T')[0]}.csv`);
      res.send('\uFEFF' + csv);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
