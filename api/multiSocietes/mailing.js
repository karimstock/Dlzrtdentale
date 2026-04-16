// =============================================
// JADOMI — Multi-sociétés : Module Mailing & Campagnes
// Routes /api/mailing/* + tracking (pixel + redirect) + désabo RGPD
// =============================================
const express = require('express');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
const mailer = require('./mailer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const PUBLIC_HOST = process.env.PUBLIC_HOST || 'https://jadomi.fr';

function renderHtmlForEnvoi(campagne, envoi) {
  const pixel = `<img src="${PUBLIC_HOST}/api/mailing/t/o/${envoi.token}.gif" width="1" height="1" style="display:none">`;
  const desaboUrl = `${PUBLIC_HOST}/api/mailing/desabo/${envoi.token}`;
  let html = campagne.contenu_html || '';
  // remplace {{desabo_url}} / sinon ajoute footer
  if (html.includes('{{desabo_url}}')) {
    html = html.replaceAll('{{desabo_url}}', desaboUrl);
  } else {
    html += `<hr><p style="font-size:11px;color:#888;text-align:center;">Vous recevez cet email car vous êtes dans notre base.
      <a href="${desaboUrl}">Se désabonner</a>.</p>`;
  }
  // wrap links via tracking redirect (simple: remplace href="http..." par tracked)
  html = html.replace(/href="(https?:[^"]+)"/g, (_, u) =>
    `href="${PUBLIC_HOST}/api/mailing/t/c/${envoi.token}?u=${encodeURIComponent(u)}"`);
  html += pixel;
  return html;
}

module.exports = function mountMailing(app) {
  const router = express.Router();
  router.use(authSupabase());

  // ---------- Bases importées ----------
  router.get('/bases', requireSociete(), async (req, res) => {
    const { data } = await admin().from('bases_emails_importees').select('*')
      .eq('societe_id', req.societe.id).order('created_at', { ascending: false });
    res.json({ success: true, bases: data || [] });
  });
  router.post('/bases/import-csv', requireSociete(), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file requis' });
      const nom = req.body.nom || req.file.originalname || 'Base sans nom';
      const rows = csvParse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
      const { data: base, error } = await admin().from('bases_emails_importees')
        .insert({ societe_id: req.societe.id, nom, nb_contacts: 0 })
        .select('*').single();
      if (error) throw error;
      let inserted = 0;
      for (const r of rows) {
        const email = (r.email || r.Email || '').toLowerCase().trim();
        if (!email || !email.includes('@')) continue;
        try {
          await admin().from('contacts_importes').insert({
            base_id: base.id, societe_id: req.societe.id, email,
            nom: r.nom || null, prenom: r.prenom || null,
            societe: r.societe || r.entreprise || null
          });
          inserted++;
        } catch {}
      }
      await admin().from('bases_emails_importees').update({ nb_contacts: inserted }).eq('id', base.id);
      res.json({ success: true, base: { ...base, nb_contacts: inserted } });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.delete('/bases/:id', requireSociete(), async (req, res) => {
    await admin().from('bases_emails_importees').delete()
      .eq('id', req.params.id).eq('societe_id', req.societe.id);
    res.json({ success: true });
  });

  // ---------- Campagnes ----------
  router.get('/campagnes', requireSociete(), async (req, res) => {
    const { data } = await admin().from('campagnes_mailing').select('*')
      .eq('societe_id', req.societe.id).order('created_at', { ascending: false });
    res.json({ success: true, campagnes: data || [] });
  });
  router.post('/campagnes', requireSociete(), async (req, res) => {
    try {
      const { titre, objet_email, contenu_html, cible, base_id } = req.body || {};
      if (!titre || !objet_email) return res.status(400).json({ error: 'titre et objet_email requis' });
      if (!['base_jadomi','base_importee','les_deux'].includes(cible))
        return res.status(400).json({ error: 'cible invalide' });
      const { data, error } = await admin().from('campagnes_mailing').insert({
        societe_id: req.societe.id, titre, objet_email, contenu_html, cible,
        base_id: base_id || null
      }).select('*').single();
      if (error) throw error;
      res.json({ success: true, campagne: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/campagnes/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('campagnes_mailing')
        .update(req.body).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, campagne: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Récupère les destinataires selon la cible, filtrés par matching sectoriel.
  // RÈGLE ABSOLUE : base_jadomi → uniquement les users dont le secteur_metier
  // appartient à societes.secteurs_cibles. Jamais de pub hors secteur.
  // Retourne { emails: string[], exclus: { email, raison }[] }
  async function getDestinataires(societe_id, cible, base_id) {
    const emails = new Set();
    const exclus = [];
    const seenExcl = new Set();
    function addExcl(email, raison) {
      const k = `${email}|${raison}`;
      if (!email || seenExcl.has(k)) return;
      seenExcl.add(k);
      exclus.push({ email, raison });
    }

    // Charge la société pour récupérer ses secteurs cibles
    const { data: soc } = await admin().from('societes')
      .select('secteurs_cibles,type').eq('id', societe_id).maybeSingle();
    let secteursCibles = Array.isArray(soc?.secteurs_cibles) ? soc.secteurs_cibles : [];
    // Rétrocompat : cabinet_dentaire cible historiquement le secteur santé
    if (secteursCibles.length === 0 && soc?.type === 'cabinet_dentaire') {
      secteursCibles = ['sante'];
    }

    if (cible === 'base_importee' || cible === 'les_deux') {
      let q = admin().from('contacts_importes').select('email').eq('societe_id', societe_id).eq('actif', true);
      if (base_id) q = q.eq('base_id', base_id);
      const { data } = await q;
      for (const c of (data || [])) emails.add(c.email);
    }

    if (cible === 'base_jadomi' || cible === 'les_deux') {
      // Base JADOMI = users JADOMI dont secteur_metier ∈ secteurs_cibles.
      if (secteursCibles.length === 0) {
        console.warn('[mailing] société', societe_id, 'sans secteurs_cibles → base_jadomi vide');
      } else {
        // 1) Matching : users dont le secteur colle
        const { data: profilsOk } = await admin().from('user_profils')
          .select('user_id,secteur_metier')
          .in('secteur_metier', secteursCibles);
        const okIds = new Set((profilsOk || []).map(p => p.user_id).filter(Boolean));

        // 2) Hors cible : tous les autres profils qui ont un secteur déclaré
        const { data: profilsKo } = await admin().from('user_profils')
          .select('user_id,secteur_metier')
          .not('secteur_metier', 'is', null)
          .not('secteur_metier', 'in', `(${secteursCibles.map(s => `"${s}"`).join(',')})`);
        const koIds = (profilsKo || []).map(p => p.user_id).filter(Boolean);

        // Résolution email via auth.users (batch best-effort)
        for (const uid of okIds) {
          try {
            const { data: u } = await admin().auth.admin.getUserById(uid);
            if (u?.user?.email) emails.add(u.user.email);
          } catch { /* ignore */ }
        }
        for (const uid of koIds) {
          try {
            const { data: u } = await admin().auth.admin.getUserById(uid);
            if (u?.user?.email) addExcl(u.user.email, 'hors_secteur');
          } catch { /* ignore */ }
        }

        // Legacy : table dentistes — uniquement si secteur santé ciblé
        if (secteursCibles.includes('sante')) {
          const { data: d } = await admin().from('dentistes').select('email').eq('actif', true);
          for (const dd of (d || [])) if (dd.email) emails.add(dd.email);
        }
      }
    }

    return { emails: Array.from(emails), exclus };
  }

  // Test envoi à soi-même
  router.post('/campagnes/:id/test', requireSociete(), async (req, res) => {
    try {
      const { email } = req.body || {};
      const to = email || req.user.email;
      if (!to) return res.status(400).json({ error: 'email requis' });
      const { data: c } = await admin().from('campagnes_mailing').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!c) return res.status(404).json({ error: 'not_found' });
      const fakeToken = { token: '00000000-0000-0000-0000-000000000000' };
      const html = renderHtmlForEnvoi(c, fakeToken);
      await mailer.sendMail({ to, subject: '[TEST] ' + c.objet_email, html });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Envoi réel de la campagne
  router.post('/campagnes/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: c } = await admin().from('campagnes_mailing').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!c) return res.status(404).json({ error: 'not_found' });
      if (c.statut === 'envoyee' || c.statut === 'terminee')
        return res.status(400).json({ error: 'deja_envoyee' });

      const { emails, exclus } = await getDestinataires(c.societe_id, c.cible, c.base_id);
      let envoyes = 0;
      for (const em of emails) {
        const { data: env } = await admin().from('campagne_envois').insert({
          campagne_id: c.id, societe_id: c.societe_id, email: em,
          envoye_at: new Date().toISOString()
        }).select('*').single();
        if (!env) continue;
        const html = renderHtmlForEnvoi(c, env);
        const r = await mailer.sendMail({ to: em, subject: c.objet_email, html });
        if (r.ok || r.simulated) envoyes++;
      }
      // Trace les exclusions (hors_secteur) — best-effort, non bloquant
      if (exclus.length) {
        try {
          const rows = exclus.map(x => ({
            campagne_id: c.id, societe_id: c.societe_id,
            email: x.email, raison: x.raison, envoye_at: null
          }));
          await admin().from('campagne_envois').insert(rows);
        } catch (e) {
          console.warn('[mailing exclus]', e.message);
        }
      }
      await admin().from('campagnes_mailing').update({
        statut: 'envoyee', date_envoi: new Date().toISOString(),
        nb_envoyes: envoyes, nb_exclus: exclus.length
      }).eq('id', c.id);
      await auditLog({ userId: req.user.id, societeId: c.societe_id,
        action: 'send_campaign', entity: 'campagne', entityId: c.id,
        meta: { nb: envoyes, exclus: exclus.length }, req });
      res.json({ success: true, envoyes, exclus: exclus.length });
    } catch (e) {
      console.error('[mailing envoyer]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.use('/api/mailing', router);

  // =====================================================================
  // Tracking (public, pas d'auth) — pixel ouverture, clic, désabo
  // =====================================================================
  // Pixel ouverture : GET /api/mailing/t/o/:token.gif → 1x1 transparent
  app.get('/api/mailing/t/o/:token.gif', async (req, res) => {
    try {
      await admin().from('campagne_envois').update({
        ouvert_at: new Date().toISOString()
      }).eq('token', req.params.token).is('ouvert_at', null);
      await admin().rpc('exec_sql', {}).catch(()=>{}); // no-op
      // incrément nb_ouverts sur la campagne
      const { data: env } = await admin().from('campagne_envois')
        .select('campagne_id').eq('token', req.params.token).maybeSingle();
      if (env?.campagne_id) {
        const { data: c } = await admin().from('campagnes_mailing')
          .select('nb_ouverts').eq('id', env.campagne_id).maybeSingle();
        if (c) await admin().from('campagnes_mailing')
          .update({ nb_ouverts: (c.nb_ouverts || 0) + 1 }).eq('id', env.campagne_id);
      }
    } catch {}
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store');
    res.end(gif);
  });

  // Redirect clic : GET /api/mailing/t/c/:token?u=...
  app.get('/api/mailing/t/c/:token', async (req, res) => {
    const u = req.query.u ? String(req.query.u) : PUBLIC_HOST;
    try {
      await admin().from('campagne_envois').update({
        clic_at: new Date().toISOString()
      }).eq('token', req.params.token).is('clic_at', null);
      const { data: env } = await admin().from('campagne_envois')
        .select('campagne_id').eq('token', req.params.token).maybeSingle();
      if (env?.campagne_id) {
        const { data: c } = await admin().from('campagnes_mailing')
          .select('nb_clics').eq('id', env.campagne_id).maybeSingle();
        if (c) await admin().from('campagnes_mailing')
          .update({ nb_clics: (c.nb_clics || 0) + 1 }).eq('id', env.campagne_id);
      }
    } catch {}
    res.redirect(302, u);
  });

  // Désabo
  app.get('/api/mailing/desabo/:token', async (req, res) => {
    try {
      const { data: env } = await admin().from('campagne_envois')
        .select('*').eq('token', req.params.token).maybeSingle();
      if (env) {
        await admin().from('campagne_envois').update({ desabo_at: new Date().toISOString() })
          .eq('token', req.params.token);
        await admin().from('contacts_importes').update({ actif: false, desabo_at: new Date().toISOString() })
          .eq('societe_id', env.societe_id).eq('email', env.email);
      }
    } catch {}
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h2>Désabonnement confirmé</h2>
      <p>Vous ne recevrez plus d'emails de notre part.</p></body></html>`);
  });

  console.log('[JADOMI] Routes /api/mailing montées');
};
