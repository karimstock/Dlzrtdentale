// =============================================
// JADOMI — Import factures fournisseurs scannées vers societé
// - Route POST /api/commerce/factures-fournisseurs/import
// - Module réutilisable pour CRON scan email
// =============================================
const express = require('express');
const crypto = require('crypto');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
let pushNotif = () => null;
try { pushNotif = require('./notifications').pushNotification; } catch {}

function hashFacture(f) {
  const key = [
    (f.fournisseur || '').toLowerCase().trim(),
    f.numero || f.numero_fournisseur || '',
    f.date_emission || '',
    Number(f.total_ttc || 0).toFixed(2)
  ].join('|');
  return crypto.createHash('md5').update(key).digest('hex');
}

// Insère un document extrait (par scan email ou upload manuel) dans
// factures_fournisseurs_societe + rapproche les produits + met à jour le stock.
// doc = { fournisseur, numero, date_emission, montant_ht, total_tva, montant_ttc, produits: [{nom, reference, quantite, prix_unitaire}], pdf_url, source_email, source_mail_uid, compte_email_id }
async function importerFactureFournisseur({ societe_id, user_id = null, doc }) {
  if (!societe_id || !doc) throw new Error('societe_id et doc requis');

  const hash = hashFacture(doc);
  // Check dédup
  const { data: existing } = await admin().from('factures_fournisseurs_societe')
    .select('id').eq('societe_id', societe_id).eq('hash_dedup', hash).maybeSingle();
  if (existing) return { inserted: false, facture_id: existing.id, reason: 'duplicate' };

  const payload = {
    societe_id,
    fournisseur: doc.fournisseur || null,
    numero_fournisseur: doc.numero || doc.numero_fournisseur || null,
    date_emission: doc.date_emission || null,
    montant_ht: Number(doc.montant_ht || 0),
    total_tva: Number(doc.total_tva || 0),
    montant_ttc: Number(doc.montant_ttc || doc.total_ttc || 0),
    produits: Array.isArray(doc.produits) ? doc.produits : [],
    pdf_url: doc.pdf_url || null,
    source_email: doc.source_email || null,
    source_mail_uid: doc.source_mail_uid || null,
    compte_email_id: doc.compte_email_id || null,
    hash_dedup: hash,
    statut: 'nouvelle'
  };

  const { data: facture, error } = await admin()
    .from('factures_fournisseurs_societe').insert(payload)
    .select('*').single();
  if (error) throw error;

  // Rapprochement produits
  let matched = 0, created = 0;
  for (const p of (doc.produits || [])) {
    const qte = Math.abs(Number(p.quantite || 0));
    if (!qte) continue;
    let prodId = null;

    // 1. Par EAN/référence exacte
    if (p.reference || p.ean) {
      const ref = String(p.reference || p.ean).trim();
      const { data: match } = await admin().from('produits_societe').select('id')
        .eq('societe_id', societe_id)
        .or(`reference.eq.${ref},code_barre.eq.${ref}`)
        .maybeSingle();
      if (match) prodId = match.id;
    }
    // 2. Par nom (ilike) si pas trouvé
    if (!prodId && p.nom) {
      const { data: match } = await admin().from('produits_societe').select('id')
        .eq('societe_id', societe_id)
        .ilike('designation', `%${String(p.nom).slice(0, 40)}%`)
        .limit(1).maybeSingle();
      if (match) prodId = match.id;
    }
    // 3. Création auto si inconnu
    if (!prodId && p.nom) {
      const { data: newProd } = await admin().from('produits_societe').insert({
        societe_id,
        reference: p.reference || p.ean || null,
        designation: p.nom,
        prix_ht: Number(p.prix_unitaire || p.prix_achat || 0),
        taux_tva: Number(p.taux_tva || 20),
        source: 'scan_facture_fournisseur',
        actif: true,
        stock_reel: qte
      }).select('id').single();
      if (newProd) { prodId = newProd.id; created++; }
    }
    if (prodId) {
      matched++;
      // Enregistre mouvement stock (entrée)
      try {
        await admin().rpc('enregistrer_mouvement_stock', {
          p_societe_id: societe_id,
          p_produit_id: prodId,
          p_type: 'entree',
          p_quantite: qte,
          p_reference_doc: doc.numero || null,
          p_reference_doc_id: facture.id,
          p_note: `Import facture fournisseur ${doc.fournisseur || ''}`,
          p_user_id: user_id
        });
      } catch (e) {
        console.warn('[importer/mouvement]', e.message);
      }
    }
  }

  // Passe en 'integree' si tout a été rapproché ET créé ; sinon 'nouvelle' (reste à valider par user)
  if (matched > 0) {
    await admin().from('factures_fournisseurs_societe')
      .update({ statut: 'integree' }).eq('id', facture.id);
  }

  await auditLog({
    userId: user_id, societeId: societe_id,
    action: 'import_facture_fournisseur', entity: 'facture_fournisseur', entityId: facture.id,
    meta: { matched, created, total_ttc: payload.montant_ttc, hash }
  });

  // Notif
  try {
    const { data: members } = await admin().from('user_societe_roles')
      .select('user_id').eq('societe_id', societe_id)
      .in('role', ['proprietaire', 'associe', 'comptable']);
    for (const m of members || []) {
      await pushNotif({
        user_id: m.user_id, societe_id,
        type: 'autre', urgence: 'normale',
        titre: `Nouvelle facture fournisseur importée`,
        message: `${doc.fournisseur || 'Fournisseur inconnu'} · ${Number(payload.montant_ttc).toFixed(2)} €`,
        entity_type: 'facture_fournisseur', entity_id: facture.id,
        cta_label: 'Voir', cta_url: '/commerce.html?tab=fournisseurs'
      });
    }
  } catch (_) {}

  return { inserted: true, facture_id: facture.id, matched, created };
}

function mountFactureFournImport(app) {
  const router = express.Router();
  router.use(authSupabase());

  // Import manuel (UI post-scan ou upload)
  // body: { docs: [{fournisseur, numero, date_emission, montant_ht, total_tva, montant_ttc, produits:[], pdf_url?, source_email?}] }
  router.post('/import', requireSociete(), async (req, res) => {
    try {
      const docs = req.body?.docs || (req.body?.doc ? [req.body.doc] : []);
      if (!docs.length) return res.status(400).json({ error: 'docs_requis' });
      const results = [];
      for (const d of docs) {
        try {
          const r = await importerFactureFournisseur({
            societe_id: req.societe.id,
            user_id: req.user.id,
            doc: d
          });
          results.push({ ok: true, ...r });
        } catch (e) {
          results.push({ ok: false, error: e.message, doc_ref: d?.numero || d?.fournisseur });
        }
      }
      res.json({ success: true, results, nb: results.length });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/commerce/factures-fournisseurs', router);
  console.log('[JADOMI] Routes /api/commerce/factures-fournisseurs/import montées');
}

module.exports = mountFactureFournImport;
module.exports.importerFactureFournisseur = importerFactureFournisseur;
