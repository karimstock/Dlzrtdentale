// =============================================
// JADOMI — Alertes péremption
// CRON quotidien + routes /api/peremption/*
// =============================================
const express = require('express');
const cron = require('node-cron');
const { admin, authSupabase, requireSociete } = require('./middleware');
let pushNotif = () => null;
try { pushNotif = require('./notifications').pushNotification; } catch {}

const mailer = (() => { try { return require('./mailer'); } catch { return null; } })();

// Niveau d'alerte selon jours restants
function niveauDepuisJours(j) {
  if (j < 0) return 'depassee';
  if (j <= 30) return '30j';
  if (j <= 60) return '60j';
  if (j <= 90) return '90j';
  return null;
}
function urgenceDepuisNiveau(n) {
  if (n === 'depassee') return 'urgente';
  if (n === '30j') return 'urgente';
  if (n === '60j') return 'haute';
  return 'normale';
}

// Scan : tous les produits (cabinet + societes) avec date_peremption ≤ 90j
async function scanPeremptions() {
  const today = new Date();
  const limite90 = new Date(today); limite90.setDate(today.getDate() + 90);
  const limiteStr = limite90.toISOString().slice(0, 10);

  let created = 0;

  // ---- Produits société ----
  try {
    const { data: prods } = await admin().from('produits_societe')
      .select('id, societe_id, designation, reference, date_peremption')
      .not('date_peremption', 'is', null)
      .lte('date_peremption', limiteStr)
      .eq('actif', true);

    for (const p of prods || []) {
      const d = new Date(p.date_peremption);
      const joursRestants = Math.ceil((d - today) / (86400000));
      const niveau = niveauDepuisJours(joursRestants);
      if (!niveau) continue;

      // Idempotent via UNIQUE(produit_id, niveau)
      const { data: existing } = await admin().from('alertes_peremption')
        .select('id').eq('produit_id', p.id).eq('niveau', niveau).maybeSingle();
      if (existing) continue;

      const { error } = await admin().from('alertes_peremption').insert({
        societe_id: p.societe_id,
        produit_id: p.id,
        produit_kind: 'societe',
        designation: p.designation,
        reference: p.reference,
        date_peremption: p.date_peremption,
        niveau, jours_restants: joursRestants
      });
      if (!error) {
        created++;
        // Notifier propriétaires/associés
        try {
          const { data: members } = await admin().from('user_societe_roles')
            .select('user_id').eq('societe_id', p.societe_id)
            .in('role', ['proprietaire', 'associe']);
          for (const m of members || []) {
            await pushNotif({
              user_id: m.user_id,
              societe_id: p.societe_id,
              type: 'stock_critique',
              urgence: urgenceDepuisNiveau(niveau),
              titre: `⏰ Péremption ${niveau === 'depassee' ? 'dépassée' : 'dans ' + joursRestants + 'j'} : ${p.designation}`,
              message: `Expiration le ${p.date_peremption}${p.reference ? ' · ref ' + p.reference : ''}`,
              entity_type: 'produit', entity_id: p.id,
              cta_label: 'Voir', cta_url: '/commerce.html?tab=stock'
            });
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[peremption/scan societe]', e.message);
  }

  // ---- Produits cabinet legacy (table 'produits' si existe) ----
  try {
    const { data: prods, error } = await admin().from('produits')
      .select('id, user_id, nom, marque, date_peremption')
      .not('date_peremption', 'is', null)
      .lte('date_peremption', limiteStr);
    if (!error) {
      for (const p of prods || []) {
        const d = new Date(p.date_peremption);
        const joursRestants = Math.ceil((d - today) / (86400000));
        const niveau = niveauDepuisJours(joursRestants);
        if (!niveau) continue;

        const { data: existing } = await admin().from('alertes_peremption')
          .select('id').eq('produit_id', p.id).eq('niveau', niveau).maybeSingle();
        if (existing) continue;

        const { error: e2 } = await admin().from('alertes_peremption').insert({
          user_id: p.user_id,
          produit_id: p.id,
          produit_kind: 'cabinet',
          designation: p.nom,
          reference: p.marque || null,
          date_peremption: p.date_peremption,
          niveau, jours_restants: joursRestants
        });
        if (!e2) {
          created++;
          await pushNotif({
            user_id: p.user_id,
            type: 'stock_critique',
            urgence: urgenceDepuisNiveau(niveau),
            titre: `⏰ Péremption ${niveau === 'depassee' ? 'dépassée' : 'dans ' + joursRestants + 'j'} : ${p.nom}`,
            message: `Expiration le ${p.date_peremption}`,
            entity_type: 'produit', entity_id: p.id,
            cta_label: 'Voir', cta_url: '/index.html'
          });
        }
      }
    }
  } catch (e) {
    // Table 'produits' peut ne pas exister — silencieux
  }

  return { created };
}

function mountPeremption(app) {
  const router = express.Router();
  router.use(authSupabase());

  // Résumé pour dashboard : nb alertes par niveau
  router.get('/summary', requireSociete(), async (req, res) => {
    try {
      const { data } = await admin().from('alertes_peremption')
        .select('niveau, jours_restants, produit_id, designation, reference, date_peremption')
        .eq('societe_id', req.societe.id)
        .eq('traite', false)
        .order('date_peremption');
      const rows = data || [];
      const counts = {
        '30j': rows.filter(r => r.niveau === '30j' || r.niveau === 'depassee').length,
        '60j': rows.filter(r => r.niveau === '60j').length,
        '90j': rows.filter(r => r.niveau === '90j').length,
        total: rows.length
      };
      res.json({ success: true, counts, alertes: rows.slice(0, 20) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Résumé par user (cabinet legacy)
  router.get('/summary-user', async (req, res) => {
    try {
      const { data } = await admin().from('alertes_peremption')
        .select('niveau, jours_restants, produit_id, designation, reference, date_peremption')
        .eq('user_id', req.user.id)
        .eq('traite', false)
        .order('date_peremption');
      const rows = data || [];
      const counts = {
        '30j': rows.filter(r => r.niveau === '30j' || r.niveau === 'depassee').length,
        '60j': rows.filter(r => r.niveau === '60j').length,
        '90j': rows.filter(r => r.niveau === '90j').length,
        total: rows.length
      };
      res.json({ success: true, counts, alertes: rows.slice(0, 20) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Marquer une alerte comme traitée (écoulée, détruite, etc.)
  router.post('/:id/traite', async (req, res) => {
    try {
      await admin().from('alertes_peremption').update({
        traite: true, traite_at: new Date().toISOString()
      }).eq('id', req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Lancer un scan manuel (admin/debug)
  router.post('/scan-now', async (req, res) => {
    try {
      const r = await scanPeremptions();
      res.json({ success: true, ...r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/peremption', router);
  console.log('[JADOMI] Routes /api/peremption montées');

  // CRON quotidien 8h Europe/Paris
  cron.schedule('0 8 * * *', async () => {
    try {
      const r = await scanPeremptions();
      console.log('[peremption/cron]', r);
    } catch (e) { console.error('[peremption/cron]', e.message); }
  }, { timezone: 'Europe/Paris' });
}

module.exports = mountPeremption;
module.exports.scanPeremptions = scanPeremptions;
