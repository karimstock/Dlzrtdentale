// =============================================
// JADOMI — Multi-sociétés : Module SCI
// Routes /api/sci/* + CRON mensuel quittances + CRON relances
// =============================================
const express = require('express');
const cron = require('node-cron');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
const { buildQuittancePDF, buildFactureSciPDF } = require('./pdfService');

const mailer = require('./mailer');

const ANNEE = () => new Date().getFullYear();
const MOIS_FR = ['janvier','février','mars','avril','mai','juin',
                 'juillet','août','septembre','octobre','novembre','décembre'];

async function genererQuittancePour(societe_id, locataire_id, mois, annee) {
  // Idempotent : si déjà existante, retourne
  const { data: existe } = await admin().from('quittances')
    .select('*').eq('locataire_id', locataire_id)
    .eq('mois', mois).eq('annee', annee).maybeSingle();
  if (existe) return existe;

  const { data: loc } = await admin().from('locataires')
    .select('*').eq('id', locataire_id).single();
  if (!loc) throw new Error('locataire introuvable');

  const loyer = Number(loc.loyer_ht || 0);
  const charges = loc.charges_incluses ? 0 : Number(loc.montant_charges || 0);
  const total = loyer + charges;

  // numérotation atomique via RPC
  const { data: num, error: numErr } = await admin().rpc('next_numero', {
    p_societe: societe_id, p_type: 'quittance', p_annee: annee
  });
  if (numErr) throw numErr;
  const numero = `QUITT-${annee}-${String(num).padStart(3, '0')}`;

  const { data: q, error } = await admin().from('quittances').insert({
    societe_id, locataire_id, numero, mois, annee,
    loyer_ht: loyer, charges, total, statut: 'generee'
  }).select('*').single();
  if (error) throw error;
  return q;
}

async function envoyerQuittanceEmail(quittance) {
  const { data: soc } = await admin().from('societes').select('*').eq('id', quittance.societe_id).single();
  const { data: loc } = await admin().from('locataires').select('*').eq('id', quittance.locataire_id).single();
  const { data: bien } = loc?.bien_id
    ? await admin().from('biens_immobiliers').select('*').eq('id', loc.bien_id).single()
    : { data: null };
  if (!loc?.email) return { skipped: 'no_locataire_email' };

  const pdf = await buildQuittancePDF({ societe: soc, locataire: loc, bien, quittance });
  const subject = `Quittance de loyer — ${MOIS_FR[quittance.mois-1]} ${quittance.annee}`;
  const html = `
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint votre quittance de loyer pour ${MOIS_FR[quittance.mois-1]} ${quittance.annee}.</p>
    <p>Cordialement,<br>${soc.nom}</p>`;

  await mailer.sendMail({
    to: loc.email, subject, html,
    from: soc.email ? `"${soc.nom}" <${soc.email}>` : undefined,
    attachments: [{ filename: `${quittance.numero}.pdf`, content: pdf, contentType: 'application/pdf' }]
  });
  await admin().from('quittances').update({
    statut: 'envoyee', date_envoi: new Date().toISOString()
  }).eq('id', quittance.id);
  return { sent: true };
}

module.exports = function mountSci(app) {
  const router = express.Router();
  router.use(authSupabase());

  // ---------- Biens ----------
  router.get('/biens', requireSociete(), async (req, res) => {
    const { data } = await admin().from('biens_immobiliers').select('*')
      .eq('societe_id', req.societe.id).order('created_at', { ascending: false });
    res.json({ success: true, biens: data || [] });
  });
  router.post('/biens', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('biens_immobiliers')
        .insert({ ...req.body, societe_id: req.societe.id }).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'bien', entityId: data.id, req });
      res.json({ success: true, bien: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/biens/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('biens_immobiliers')
        .update(req.body).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, bien: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.delete('/biens/:id', requireSociete(), async (req, res) => {
    await admin().from('biens_immobiliers').delete()
      .eq('id', req.params.id).eq('societe_id', req.societe.id);
    res.json({ success: true });
  });

  // ---------- Locataires ----------
  router.get('/locataires', requireSociete(), async (req, res) => {
    const { data } = await admin().from('locataires').select('*')
      .eq('societe_id', req.societe.id).order('nom');
    res.json({ success: true, locataires: data || [] });
  });
  router.post('/locataires', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('locataires')
        .insert({ ...req.body, societe_id: req.societe.id }).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'locataire', entityId: data.id, req });
      res.json({ success: true, locataire: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/locataires/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('locataires')
        .update(req.body).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, locataire: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.delete('/locataires/:id', requireSociete(), async (req, res) => {
    await admin().from('locataires').delete()
      .eq('id', req.params.id).eq('societe_id', req.societe.id);
    res.json({ success: true });
  });

  // ---------- Quittances ----------
  router.get('/quittances', requireSociete(), async (req, res) => {
    const { data } = await admin().from('quittances')
      .select('*, locataire:locataire_id(id, nom, prenom, raison_sociale, email)')
      .eq('societe_id', req.societe.id)
      .order('annee', { ascending: false })
      .order('mois', { ascending: false });
    res.json({ success: true, quittances: data || [] });
  });

  router.post('/quittances/generer', requireSociete(), async (req, res) => {
    try {
      const { locataire_id, mois, annee } = req.body || {};
      if (!locataire_id || !mois || !annee)
        return res.status(400).json({ error: 'locataire_id, mois, annee requis' });
      const q = await genererQuittancePour(req.societe.id, locataire_id, mois, annee);
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'generate', entity: 'quittance', entityId: q.id, req });
      res.json({ success: true, quittance: q });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.post('/quittances/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: q } = await admin().from('quittances').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!q) return res.status(404).json({ error: 'not_found' });
      const r = await envoyerQuittanceEmail(q);
      res.json({ success: true, ...r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/quittances/:id/pdf', requireSociete(), async (req, res) => {
    try {
      const { data: q } = await admin().from('quittances').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!q) return res.status(404).send('Not found');
      const { data: soc } = await admin().from('societes').select('*').eq('id', q.societe_id).single();
      const { data: loc } = await admin().from('locataires').select('*').eq('id', q.locataire_id).single();
      const { data: bien } = loc?.bien_id
        ? await admin().from('biens_immobiliers').select('*').eq('id', loc.bien_id).single()
        : { data: null };
      const pdf = await buildQuittancePDF({ societe: soc, locataire: loc, bien, quittance: q });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${q.numero}.pdf"`);
      res.end(pdf);
    } catch (e) { res.status(500).send(e.message); }
  });

  router.patch('/quittances/:id/paiement', requireSociete(), async (req, res) => {
    try {
      const { date_paiement } = req.body || {};
      const { data, error } = await admin().from('quittances')
        .update({ statut: 'payee', date_paiement: date_paiement || new Date().toISOString() })
        .eq('id', req.params.id).eq('societe_id', req.societe.id).select('*').single();
      if (error) throw error;
      res.json({ success: true, quittance: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // ---------- Factures SCI ----------
  router.post('/factures/generer', requireSociete(), async (req, res) => {
    try {
      const { locataire_id, mois, annee } = req.body || {};
      if (!locataire_id || !mois || !annee)
        return res.status(400).json({ error: 'locataire_id, mois, annee requis' });

      // Idempotent check
      const { data: existe } = await admin().from('factures_sci')
        .select('*').eq('locataire_id', locataire_id)
        .eq('mois', mois).eq('annee', annee).maybeSingle();
      if (existe) return res.json({ success: true, facture: existe, already_exists: true });

      const { data: loc } = await admin().from('locataires')
        .select('*').eq('id', locataire_id).eq('societe_id', req.societe.id).single();
      if (!loc) return res.status(404).json({ error: 'locataire introuvable' });

      const montant_ht = Number(loc.loyer_ht || 0);
      const charges = loc.charges_incluses ? 0 : Number(loc.montant_charges || 0);
      const total = montant_ht + charges;

      const { data: num, error: numErr } = await admin().rpc('next_numero', {
        p_societe: req.societe.id, p_type: 'facture_sci', p_annee: annee
      });
      if (numErr) throw numErr;
      const numero = `FACT-SCI-${annee}-${String(num).padStart(3, '0')}`;

      const { data: facture, error } = await admin().from('factures_sci').insert({
        societe_id: req.societe.id, locataire_id, numero, mois, annee,
        montant_ht, charges, total, statut: 'en_attente',
        date_emission: new Date().toISOString()
      }).select('*').single();
      if (error) throw error;

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'generate', entity: 'facture_sci', entityId: facture.id, req });
      res.json({ success: true, facture });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.get('/factures', requireSociete(), async (req, res) => {
    const { data } = await admin().from('factures_sci')
      .select('*, locataire:locataire_id(id, nom, prenom, raison_sociale, email)')
      .eq('societe_id', req.societe.id)
      .order('annee', { ascending: false })
      .order('mois', { ascending: false });
    res.json({ success: true, factures: data || [] });
  });

  router.get('/factures/:id/pdf', requireSociete(), async (req, res) => {
    try {
      const { data: facture } = await admin().from('factures_sci').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!facture) return res.status(404).send('Not found');
      const { data: soc } = await admin().from('societes').select('*').eq('id', facture.societe_id).single();
      const { data: loc } = await admin().from('locataires').select('*').eq('id', facture.locataire_id).single();
      const { data: bien } = loc?.bien_id
        ? await admin().from('biens_immobiliers').select('*').eq('id', loc.bien_id).single()
        : { data: null };

      // Build lignes from facture data
      const lignes = [
        { designation: `Loyer — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`, quantite: 1, prix_unitaire_ht: facture.montant_ht, taux_tva: 0 }
      ];
      if (Number(facture.charges) > 0) {
        lignes.push({ designation: `Charges locatives — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`, quantite: 1, prix_unitaire_ht: facture.charges, taux_tva: 0 });
      }

      const pdfData = {
        societe: soc, locataire: loc, bien,
        facture: {
          ...facture,
          lignes,
          sous_total_ht: facture.total,
          total_tva: 0,
          total_ttc: facture.total
        }
      };
      const pdf = await buildFactureSciPDF(pdfData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${facture.numero}.pdf"`);
      res.end(pdf);
    } catch (e) { res.status(500).send(e.message); }
  });

  router.post('/factures/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: facture } = await admin().from('factures_sci').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!facture) return res.status(404).json({ error: 'not_found' });

      const { data: soc } = await admin().from('societes').select('*').eq('id', facture.societe_id).single();
      const { data: loc } = await admin().from('locataires').select('*').eq('id', facture.locataire_id).single();
      const { data: bien } = loc?.bien_id
        ? await admin().from('biens_immobiliers').select('*').eq('id', loc.bien_id).single()
        : { data: null };
      if (!loc?.email) return res.json({ success: false, skipped: 'no_locataire_email' });

      const lignes = [
        { designation: `Loyer — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`, quantite: 1, prix_unitaire_ht: facture.montant_ht, taux_tva: 0 }
      ];
      if (Number(facture.charges) > 0) {
        lignes.push({ designation: `Charges locatives — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`, quantite: 1, prix_unitaire_ht: facture.charges, taux_tva: 0 });
      }

      const pdf = await buildFactureSciPDF({
        societe: soc, locataire: loc, bien,
        facture: { ...facture, lignes, sous_total_ht: facture.total, total_tva: 0, total_ttc: facture.total }
      });

      const subject = `Facture de loyer — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`;
      const html = `
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint votre facture de loyer pour ${MOIS_FR[facture.mois - 1]} ${facture.annee}.</p>
        <p>Cordialement,<br>${soc.nom}</p>`;

      await mailer.sendMail({
        to: loc.email, subject, html,
        from: soc.email ? `"${soc.nom}" <${soc.email}>` : undefined,
        attachments: [{ filename: `${facture.numero}.pdf`, content: pdf, contentType: 'application/pdf' }]
      });
      await admin().from('factures_sci').update({
        statut: 'envoyee', date_envoi: new Date().toISOString()
      }).eq('id', facture.id);
      res.json({ success: true, sent: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST /factures/envoyer-lot — envoi groupé de factures (rate limit 50/min OVH)
  router.post('/factures/envoyer-lot', requireSociete(), async (req, res) => {
    try {
      const { ids } = req.body || {};
      if (!ids || !Array.isArray(ids) || !ids.length)
        return res.status(400).json({ error: 'ids[] requis' });

      const { data: soc } = await admin().from('societes').select('*').eq('id', req.societe.id).single();
      let sent = 0, skipped = 0, errors = 0;

      for (let i = 0; i < ids.length; i++) {
        // Rate limit: pause every 50 emails
        if (i > 0 && i % 50 === 0) await new Promise(r => setTimeout(r, 61000));

        try {
          const { data: facture } = await admin().from('factures_sci').select('*')
            .eq('id', ids[i]).eq('societe_id', req.societe.id).single();
          if (!facture) { skipped++; continue; }
          if (facture.statut === 'annulee') { skipped++; continue; }

          const { data: loc } = await admin().from('locataires').select('*').eq('id', facture.locataire_id).single();
          if (!loc?.email) { skipped++; continue; }

          const { data: bien } = loc?.bien_id
            ? await admin().from('biens_immobiliers').select('*').eq('id', loc.bien_id).single()
            : { data: null };

          const lignes = [
            { designation: `Loyer — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`, quantite: 1, prix_unitaire_ht: facture.montant_ht, taux_tva: 0 }
          ];
          if (Number(facture.charges) > 0) {
            lignes.push({ designation: `Charges locatives — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`, quantite: 1, prix_unitaire_ht: facture.charges, taux_tva: 0 });
          }

          const pdf = await buildFactureSciPDF({
            societe: soc, locataire: loc, bien,
            facture: { ...facture, lignes, sous_total_ht: facture.total, total_tva: 0, total_ttc: facture.total }
          });

          await mailer.sendMail({
            to: loc.email,
            subject: `Facture de loyer — ${MOIS_FR[facture.mois - 1]} ${facture.annee}`,
            html: `<p>Bonjour,</p><p>Veuillez trouver ci-joint votre facture de loyer pour ${MOIS_FR[facture.mois - 1]} ${facture.annee}.</p><p>Cordialement,<br>${soc.nom}</p>`,
            from: soc.email ? `"${soc.nom}" <${soc.email}>` : undefined,
            attachments: [{ filename: `${facture.numero}.pdf`, content: pdf, contentType: 'application/pdf' }]
          });

          await admin().from('factures_sci').update({
            statut: facture.statut === 'payee' ? 'payee' : 'envoyee',
            date_envoi: new Date().toISOString()
          }).eq('id', facture.id);
          sent++;
        } catch (err) {
          console.error(`[SCI] batch send facture ${ids[i]}:`, err.message);
          errors++;
        }
      }
      res.json({ success: true, sent, skipped, errors, total: ids.length });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.patch('/factures/:id/paiement', requireSociete(), async (req, res) => {
    try {
      const { date_paiement } = req.body || {};
      const datePaie = date_paiement || new Date().toISOString();

      const { data: facture, error } = await admin().from('factures_sci')
        .update({ statut: 'payee', date_paiement: datePaie })
        .eq('id', req.params.id).eq('societe_id', req.societe.id).select('*').single();
      if (error) throw error;
      if (!facture) return res.status(404).json({ error: 'not_found' });

      // Auto-create comptabilité entry in compta_sci
      await admin().from('compta_sci').insert({
        societe_id: req.societe.id,
        categorie: 'Loyer',
        montant: facture.total,
        date: datePaie,
        reference: facture.numero,
        locataire_id: facture.locataire_id
      });
      await admin().from('factures_sci').update({ entre_en_compta: true }).eq('id', facture.id);

      // If locataire has user_id, also insert into their compta + notify
      const { data: loc } = await admin().from('locataires')
        .select('user_id').eq('id', facture.locataire_id).single();
      if (loc?.user_id) {
        try {
          await admin().from('compta_entries').insert({
            user_id: loc.user_id,
            categorie: 'Charges locatives',
            type: 'depense',
            montant: facture.total,
            date: datePaie,
            reference: facture.numero
          });
        } catch (e) { console.warn('[SCI] compta_entries insert failed:', e.message); }

        try {
          const notifMod = (() => { try { return require('./notifications'); } catch { return null; } })();
          if (notifMod?.pushNotification) {
            await notifMod.pushNotification({
              user_id: loc.user_id, societe_id: req.societe.id,
              type: 'autre', urgence: 'normale',
              titre: `Facture ${facture.numero} enregistrée`,
              message: `Votre paiement de ${facture.total} € a été enregistré.`,
              entity_type: 'facture_sci', entity_id: facture.id
            });
          }
        } catch (_) { /* notification optional */ }
      }

      res.json({ success: true, facture: { ...facture, entre_en_compta: true } });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // ---------- Batch generation: factures ----------
  router.post('/factures/generer-lot', requireSociete(), async (req, res) => {
    try {
      const { locataire_id, mois_debut, annee_debut, mois_fin, annee_fin } = req.body || {};
      if (!mois_debut || !annee_debut || !mois_fin || !annee_fin)
        return res.status(400).json({ error: 'mois_debut, annee_debut, mois_fin, annee_fin requis' });

      // Get locataires
      let locataires;
      if (locataire_id) {
        const { data } = await admin().from('locataires').select('id')
          .eq('id', locataire_id).eq('societe_id', req.societe.id);
        locataires = data || [];
      } else {
        const { data } = await admin().from('locataires').select('id')
          .eq('societe_id', req.societe.id).eq('actif', true);
        locataires = data || [];
      }

      let created = 0;
      // Iterate months
      let y = annee_debut, m = mois_debut;
      while (y < annee_fin || (y === annee_fin && m <= mois_fin)) {
        for (const loc of locataires) {
          // Idempotent check
          const { data: existe } = await admin().from('factures_sci')
            .select('id').eq('locataire_id', loc.id)
            .eq('mois', m).eq('annee', y).maybeSingle();
          if (!existe) {
            const { data: locFull } = await admin().from('locataires')
              .select('*').eq('id', loc.id).single();
            if (!locFull) continue;

            const montant_ht = Number(locFull.loyer_ht || 0);
            const charges = locFull.charges_incluses ? 0 : Number(locFull.montant_charges || 0);
            const total = montant_ht + charges;

            const { data: num, error: numErr } = await admin().rpc('next_numero', {
              p_societe: req.societe.id, p_type: 'facture_sci', p_annee: y
            });
            if (numErr) throw numErr;
            const numero = `FACT-SCI-${y}-${String(num).padStart(3, '0')}`;

            const { error } = await admin().from('factures_sci').insert({
              societe_id: req.societe.id, locataire_id: loc.id, numero, mois: m, annee: y,
              montant_ht, charges, total, statut: 'en_attente',
              date_emission: new Date().toISOString()
            });
            if (!error) created++;
          }
        }
        m++;
        if (m > 12) { m = 1; y++; }
      }

      res.json({ success: true, created });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // ---------- Factures toutes sociétés (vue consolidée) ----------
  router.get('/factures/toutes-societes', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
      if (!token) return res.status(401).json({ error: 'missing_token' });
      const { data: authData, error: authErr } = await admin().auth.getUser(token);
      if (authErr || !authData?.user) return res.status(401).json({ error: 'invalid_token' });
      const userId = authData.user.id;

      // Get all user's SCI societes
      const { data: roles } = await admin().from('user_societe_roles')
        .select('societe_id, societes:societe_id(id, nom, type)')
        .eq('user_id', userId);
      const sciIds = (roles || [])
        .filter(r => r.societes?.type === 'sci')
        .map(r => r.societe_id);

      if (!sciIds.length) return res.json({ success: true, factures: [], societes: [] });

      const { data: factures } = await admin().from('factures_sci')
        .select('*, locataire:locataire_id(id, nom, prenom, raison_sociale, email)')
        .in('societe_id', sciIds)
        .order('annee', { ascending: false })
        .order('mois', { ascending: false });

      const societes = (roles || [])
        .filter(r => r.societes?.type === 'sci')
        .map(r => ({ id: r.societe_id, nom: r.societes.nom }));

      res.json({ success: true, factures: factures || [], societes });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ---------- Batch generation: quittances ----------
  router.post('/quittances/generer-lot', requireSociete(), async (req, res) => {
    try {
      const { locataire_id, mois_debut, annee_debut, mois_fin, annee_fin } = req.body || {};
      if (!mois_debut || !annee_debut || !mois_fin || !annee_fin)
        return res.status(400).json({ error: 'mois_debut, annee_debut, mois_fin, annee_fin requis' });

      let locataires;
      if (locataire_id) {
        const { data } = await admin().from('locataires').select('id')
          .eq('id', locataire_id).eq('societe_id', req.societe.id);
        locataires = data || [];
      } else {
        const { data } = await admin().from('locataires').select('id')
          .eq('societe_id', req.societe.id).eq('actif', true);
        locataires = data || [];
      }

      let created = 0, skipped = 0, errors = [];
      let y = annee_debut, m = mois_debut;
      while (y < annee_fin || (y === annee_fin && m <= mois_fin)) {
        for (const loc of locataires) {
          try {
            const q = await genererQuittancePour(req.societe.id, loc.id, m, y);
            // genererQuittancePour returns existing if already present
            const { data: check } = await admin().from('quittances')
              .select('created_at').eq('id', q.id).single();
            const isNew = check && (Date.now() - new Date(check.created_at).getTime()) < 5000;
            if (isNew) created++; else skipped++;
          } catch (e) {
            skipped++;
            errors.push({ locataire_id: loc.id, mois: m, annee: y, error: e.message });
          }
        }
        m++;
        if (m > 12) { m = 1; y++; }
      }

      res.json({ success: true, created, skipped, errors });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // ---------- Dashboard ----------
  router.get('/dashboard', requireSociete(), async (req, res) => {
    try {
      const now = new Date();
      const mois = now.getMonth() + 1;
      const annee = now.getFullYear();
      const { data: quits } = await admin().from('quittances')
        .select('*').eq('societe_id', req.societe.id)
        .eq('annee', annee).eq('mois', mois);
      const sum = (arr) => arr.reduce((s, q) => s + Number(q.total || 0), 0);
      const encaisse = (quits || []).filter(q => q.statut === 'payee');
      const enAttente = (quits || []).filter(q => ['generee','envoyee'].includes(q.statut));
      const impayes = (quits || []).filter(q => q.statut === 'impayee');
      res.json({
        success: true,
        mois, annee,
        stats: {
          encaisse_total: sum(encaisse), encaisse_count: encaisse.length,
          attente_total: sum(enAttente), attente_count: enAttente.length,
          impayes_total: sum(impayes), impayes_count: impayes.length
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ---------- Export comptable CSV ----------
  router.get('/export/:annee', requireSociete(), async (req, res) => {
    try {
      const annee = parseInt(req.params.annee, 10);
      const { data } = await admin().from('quittances')
        .select('*, locataire:locataire_id(nom, prenom, raison_sociale)')
        .eq('societe_id', req.societe.id).eq('annee', annee)
        .order('mois').order('numero');
      const rows = [['Numero','Mois','Annee','Locataire','Loyer HT','Charges','Total','Statut','Date paiement']];
      for (const q of (data || [])) {
        const loc = q.locataire || {};
        const nom = loc.raison_sociale || `${loc.prenom || ''} ${loc.nom || ''}`.trim();
        rows.push([q.numero, q.mois, q.annee, nom, q.loyer_ht, q.charges, q.total, q.statut, q.date_paiement || '']);
      }
      const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="quittances-${annee}.csv"`);
      res.send(csv);
    } catch (e) { res.status(500).send(e.message); }
  });

  app.use('/api/sci', router);
  console.log('[JADOMI] Routes /api/sci montées');

  // =====================================================================
  // CRON : génération automatique quittances le 1er du mois à 03:00 Europe/Paris
  // =====================================================================
  cron.schedule('0 3 1 * *', async () => {
    console.log('[SCI/CRON] Génération quittances mensuelles');
    try {
      const now = new Date();
      const mois = now.getMonth() + 1;
      const annee = now.getFullYear();
      const { data: societes } = await admin().from('societes')
        .select('id').eq('type', 'sci').eq('actif', true);
      for (const s of (societes || [])) {
        const { data: locs } = await admin().from('locataires')
          .select('*').eq('societe_id', s.id).eq('actif', true);
        for (const loc of (locs || [])) {
          try {
            const q = await genererQuittancePour(s.id, loc.id, mois, annee);
            await envoyerQuittanceEmail(q).catch(e =>
              console.warn('[SCI/CRON] envoi échec:', e.message));
          } catch (e) {
            console.warn(`[SCI/CRON] locataire ${loc.id}:`, e.message);
          }
        }
      }
    } catch (e) { console.error('[SCI/CRON]', e.message); }
  }, { timezone: 'Europe/Paris' });

  // CRON relances impayés : quotidien à 09:00
  cron.schedule('0 9 * * *', async () => {
    try {
      const { data: impayes } = await admin().from('quittances')
        .select('*, locataire:locataire_id(email, nom, prenom, raison_sociale)')
        .in('statut', ['envoyee','generee','impayee']);
      const now = new Date();
      for (const q of (impayes || [])) {
        const dEnvoi = q.date_envoi ? new Date(q.date_envoi) : new Date(q.created_at);
        const jours = Math.floor((now - dEnvoi) / (24*3600*1000));
        let type = null;
        if (jours === 3) type = 'rappel';
        else if (jours === 8) type = 'formelle';
        else if (jours === 15) type = 'mise_en_demeure';
        if (!type) continue;
        // déduplique par type+quittance
        const { data: deja } = await admin().from('relances_sci')
          .select('id').eq('quittance_id', q.id).eq('type', type).maybeSingle();
        if (deja) continue;
        const textes = {
          rappel: `Nous vous rappelons que votre loyer est arrivé à échéance. Merci de procéder au règlement dès que possible.`,
          formelle: `Votre loyer reste impayé. Nous vous demandons de régulariser sous 7 jours.`,
          mise_en_demeure: `Faute de régularisation, nous vous mettons en demeure de payer sous 8 jours. À défaut, nous serons contraints d'engager toute procédure utile.`
        };
        if (q.locataire?.email) {
          try {
            await mailer.sendMail({
              to: q.locataire.email,
              subject: `Relance — ${q.numero}`,
              html: `<p>Bonjour,</p><p>${textes[type]}</p>`
            });
          } catch (err) {
            console.error(`[SCI] Relance email échec quittance=${q.id} type=${type}:`, err.message);
            // Tracer une notification pour le proprio/associé de la SCI
            try {
              const { data: members } = await admin().from('user_societe_roles')
                .select('user_id').eq('societe_id', q.societe_id)
                .in('role', ['proprietaire','associe']);
              const notifMod = (()=>{ try { return require('./notifications'); } catch { return null; } })();
              if (notifMod?.pushNotification) {
                for (const m of members || []) {
                  await notifMod.pushNotification({
                    user_id: m.user_id, societe_id: q.societe_id,
                    type: 'autre', urgence: 'haute',
                    titre: `⚠ Envoi relance échoué — ${q.numero}`,
                    message: `Impossible de joindre ${q.locataire.email} (${err.message}).`,
                    entity_type: 'quittance', entity_id: q.id
                  });
                }
              }
            } catch (_) {}
          }
        }
        await admin().from('relances_sci').insert({
          quittance_id: q.id, societe_id: q.societe_id, type, contenu: textes[type]
        });
        if (type === 'mise_en_demeure') {
          await admin().from('quittances').update({ statut: 'impayee' }).eq('id', q.id);
        }
      }
    } catch (e) { console.error('[SCI/CRON relances]', e.message); }
  }, { timezone: 'Europe/Paris' });
};
