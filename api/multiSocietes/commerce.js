// =============================================
// JADOMI — Multi-sociétés : Module Société Commerciale
// Routes /api/commerce/* : catalogue, clients, devis, factures, Stripe
// =============================================
const express = require('express');
const multer = require('multer');
const { parse: csvParse } = require('csv-parse/sync');
const cron = require('node-cron');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
const { buildDevisPDF, buildFacturePDF, buildAvoirPDF } = require('./pdfService');
const mailer = require('./mailer');
let pushNotif = () => null;
try { pushNotif = require('./notifications').pushNotification; } catch {}

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch {}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// =====================================================================
// Jobs d'import persistants (table Supabase import_jobs, voir sql/17)
// Fallback vers Map mémoire si la table n'est pas encore déployée.
// =====================================================================
const IMPORT_JOBS_MEM = new Map();

async function newJob(societe_id, source, total = 0, user_id = null, cible = 'produits') {
  // Essai insert en DB
  try {
    const { data, error } = await admin().from('import_jobs').insert({
      societe_id, user_id, source, cible, total, done: 0, inserted: 0, failed: 0,
      statut: 'running'
    }).select('*').single();
    if (!error && data) {
      // Expose les même champs que la version mémoire pour compatibilité
      return wrapDbJob(data);
    }
  } catch (_) {}
  // Fallback mémoire
  const id = 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const job = {
    id, societe_id, user_id, source, cible, total,
    done: 0, inserted: 0, failed: 0,
    status: 'running', _memory: true,
    started_at: Date.now(), finished_at: null,
    message: null, error: null
  };
  IMPORT_JOBS_MEM.set(id, job);
  setTimeout(() => IMPORT_JOBS_MEM.delete(id), 2 * 3600 * 1000).unref?.();
  return job;
}

function wrapDbJob(row) {
  // Proxy : les mutations sur les propriétés sont persistées en DB (debounced)
  const state = { ...row, status: row.statut };
  let pending = null;
  const flush = async () => {
    pending = null;
    try {
      await admin().from('import_jobs').update({
        done: state.done, inserted: state.inserted, failed: state.failed,
        total: state.total, statut: state.status,
        message: state.message || null, error: state.error || null,
        finished_at: state.finished_at ? new Date(state.finished_at).toISOString() : null
      }).eq('id', state.id);
    } catch (_) {}
  };
  return new Proxy(state, {
    set(t, k, v) {
      t[k] = v;
      if (!pending) pending = setTimeout(flush, 600);
      return true;
    }
  });
}

async function getJob(id, societe_id) {
  // Mémoire d'abord
  if (IMPORT_JOBS_MEM.has(id)) {
    const j = IMPORT_JOBS_MEM.get(id);
    if (j.societe_id !== societe_id) return null;
    return j;
  }
  try {
    const { data } = await admin().from('import_jobs').select('*')
      .eq('id', id).eq('societe_id', societe_id).maybeSingle();
    if (!data) return null;
    return { ...data, status: data.statut };
  } catch (_) { return null; }
}

async function enrichirDescriptionIA(designation) {
  try {
    const base = process.env.JADOMI_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const r = await fetch(base + '/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 140,
        messages: [{
          role: 'user',
          content: `Donne-moi une description commerciale courte (2 phrases max) de ce produit dentaire/médical : ${designation}. Réponds uniquement la description, sans intro.`
        }]
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    const txt = d?.content?.[0]?.text?.trim();
    return txt || null;
  } catch { return null; }
}

function calcTotaux(lignes = []) {
  let sous_total_ht = 0, total_tva = 0, total_ttc = 0;
  for (const l of lignes) {
    const qte = Number(l.quantite || 0);
    const pu = Number(l.prix_unitaire_ht || 0);
    const tva = Number(l.taux_tva || 0);
    const ht = qte * pu;
    const mTva = ht * tva / 100;
    sous_total_ht += ht;
    total_tva += mTva;
    total_ttc += ht + mTva;
  }
  return {
    sous_total_ht: +sous_total_ht.toFixed(2),
    total_tva: +total_tva.toFixed(2),
    total_ttc: +total_ttc.toFixed(2)
  };
}

async function genNumero(societe_id, type, annee) {
  const { data, error } = await admin().rpc('next_numero', {
    p_societe: societe_id, p_type: type, p_annee: annee
  });
  if (error) throw error;
  const prefix = { devis: 'DEVIS', facture: 'FAC', facture_fournisseur: 'FF' }[type] || type.toUpperCase();
  return `${prefix}-${annee}-${String(data).padStart(3, '0')}`;
}

module.exports = function mountCommerce(app) {
  const router = express.Router();
  router.use(authSupabase());

  // =====================================================================
  // CATALOGUE PRODUITS
  // =====================================================================
  router.get('/produits', requireSociete(), async (req, res) => {
    const q = req.query.q ? String(req.query.q).trim() : null;
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const rawLimit = parseInt(req.query.limit || '50', 10) || 50;
    const limit = Math.min(200, Math.max(1, rawLimit));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let qb = admin().from('produits_societe')
      .select('*', { count: 'exact' })
      .eq('societe_id', req.societe.id).eq('actif', true);
    if (q) qb = qb.or(`designation.ilike.%${q}%,reference.ilike.%${q}%,code_barre.eq.${q}`);
    const { data, count, error } = await qb.order('designation').range(from, to);
    if (error) return res.status(500).json({ success: false, error: error.message });

    const total = count || 0;
    res.json({
      success: true,
      produits: data || [],
      pagination: {
        page, limit, total,
        pages: Math.ceil(total / limit),
        has_more: from + (data?.length || 0) < total
      }
    });
  });
  router.post('/produits', requireSociete(), async (req, res) => {
    try {
      const p = { ...req.body, societe_id: req.societe.id, source: req.body.source || 'manuel' };
      const { data, error } = await admin().from('produits_societe').insert(p).select('*').single();
      if (error) throw error;
      res.json({ success: true, produit: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/produits/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('produits_societe')
        .update(req.body).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, produit: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.delete('/produits/:id', requireSociete(), async (req, res) => {
    await admin().from('produits_societe').update({ actif: false })
      .eq('id', req.params.id).eq('societe_id', req.societe.id);
    res.json({ success: true });
  });

  // Import CSV : colonnes reference,designation,prix_ht,taux_tva,unite,stock_actuel,stock_alerte,code_barre
  // Si > 500 lignes → import en background avec job progress
  router.post('/produits/import-csv', requireSociete(), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file requis' });
      const rows = csvParse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
      if (!rows.length) return res.json({ success: true, inserted: 0, failed: 0 });

      const toRow = r => ({
        societe_id: req.societe.id,
        reference: r.reference || r.ref || null,
        designation: r.designation || r.nom || r.name || '',
        description: r.description || null,
        prix_ht: parseFloat((r.prix_ht || r.prix || '0').toString().replace(',', '.')) || 0,
        taux_tva: parseFloat((r.taux_tva || r.tva || '20').toString().replace(',', '.')) || 20,
        unite: r.unite || 'unité',
        stock_actuel: parseInt(r.stock_actuel || r.stock || '0', 10) || 0,
        stock_alerte: parseInt(r.stock_alerte || r.alerte || '0', 10) || 0,
        code_barre: r.code_barre || r.ean || r.barcode || null,
        source: 'csv'
      });

      const CHUNK = 500;

      // Petits imports → synchrone
      if (rows.length <= CHUNK) {
        let inserted = 0, failed = 0;
        try {
          const { data, error } = await admin().from('produits_societe')
            .upsert(rows.map(toRow), { onConflict: 'societe_id,reference' })
            .select('id');
          if (error) throw error;
          inserted = data?.length || rows.length;
        } catch { failed = rows.length; }
        await auditLog({ userId: req.user.id, societeId: req.societe.id,
          action: 'import_csv', entity: 'produits', meta: { inserted, failed }, req });
        return res.json({ success: true, inserted, failed });
      }

      // Gros imports → background job
      const job = await newJob(req.societe.id, 'csv', rows.length, req.user.id, 'produits');
      const userId = req.user.id;
      const societeId = req.societe.id;
      res.json({ success: true, job_id: job.id, total: rows.length, background: true });

      (async () => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK).map(toRow);
          try {
            const { data, error } = await admin().from('produits_societe')
              .upsert(slice, { onConflict: 'societe_id,reference' })
              .select('id');
            if (error) { job.failed += slice.length; }
            else { job.inserted += data?.length || slice.length; }
          } catch { job.failed += slice.length; }
          job.done += slice.length;
        }
        job.status = job.failed === rows.length ? 'error' : 'done';
        job.finished_at = Date.now();
        await auditLog({ userId, societeId,
          action: 'import_csv', entity: 'produits',
          meta: { inserted: job.inserted, failed: job.failed, total: rows.length }, req });
      })().catch(e => { job.status = 'error'; job.error = e.message; job.finished_at = Date.now(); });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Progression d'un job d'import
  router.get('/produits/import-jobs/:id', requireSociete(), async (req, res) => {
    const j = await getJob(req.params.id, req.societe.id);
    if (!j) return res.status(404).json({ success: false, error: 'job_not_found' });
    res.json({ success: true, job: j });
  });

  // Import WordPress (WP REST public + enrichissement IA JADOMI)
  // Utilise GET /wp-json/wp/v2/products — pas besoin d'API key
  // body : { site_url, enrichir_ia?:boolean }
  router.post('/produits/import-wp-public', requireSociete(), async (req, res) => {
    try {
      const { site_url, enrichir_ia } = req.body || {};
      if (!site_url) return res.status(400).json({ error: 'site_url requis' });
      const base = String(site_url).replace(/\/$/, '').replace(/\/wp-json.*$/, '');

      // Répondre tout de suite avec un job id
      const job = await newJob(req.societe.id, 'wp-rest', 0, req.user.id, 'produits');
      const userId = req.user.id;
      const societeId = req.societe.id;
      res.json({ success: true, job_id: job.id, background: true });

      (async () => {
        let page = 1, all = [];
        const perPage = 100;
        while (page <= 50) {
          try {
            const r = await fetch(`${base}/wp-json/wp/v2/products?per_page=${perPage}&page=${page}`);
            if (!r.ok) {
              if (r.status === 404 && page === 1) {
                // Pas de CPT "products" → tente fallback WooCommerce products stored as posts via /wc/store/v1
                const r2 = await fetch(`${base}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}`);
                if (!r2.ok) { job.status = 'error'; job.error = 'Aucun endpoint WP products trouvé'; job.finished_at = Date.now(); return; }
                const batch2 = await r2.json();
                if (!Array.isArray(batch2) || !batch2.length) break;
                all = all.concat(batch2);
                if (batch2.length < perPage) break;
                page++; continue;
              }
              break;
            }
            const batch = await r.json();
            if (!Array.isArray(batch) || batch.length === 0) break;
            all = all.concat(batch);
            job.total = all.length + (batch.length === perPage ? perPage : 0);
            if (batch.length < perPage) break;
            page++;
          } catch (e) { break; }
        }
        job.total = all.length;

        for (const p of all) {
          try {
            // WP REST v2 → title.rendered, content.rendered, meta champs perso
            // WC Store → name, description, prices.price
            const designation = p.title?.rendered || p.name || 'Sans nom';
            const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 800);
            let description = strip(p.excerpt?.rendered || p.short_description || p.content?.rendered || p.description);

            const metaPrice = p.meta?._price ?? p.meta?._regular_price;
            const prix_ht = parseFloat(
              p.prices?.price ? (p.prices.price / 100)
              : (metaPrice ?? p.regular_price ?? p.price ?? 0)
            ) || 0;

            const image_url = p.featured_image || p.images?.[0]?.src || p._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;
            const sku = p.sku || p.meta?._sku || p.slug || String(p.id);

            if (enrichir_ia && !description && designation) {
              const ia = await enrichirDescriptionIA(designation);
              if (ia) description = ia;
            }

            await admin().from('produits_societe').upsert({
              societe_id: societeId,
              reference: sku,
              designation,
              description: description || null,
              prix_ht,
              taux_tva: 20,
              image_url,
              source: 'wordpress',
              external_id: String(p.id)
            }, { onConflict: 'societe_id,reference' });
            job.inserted++;
          } catch { job.failed++; }
          job.done++;
        }

        job.status = 'done';
        job.finished_at = Date.now();
        await auditLog({ userId, societeId,
          action: 'import_wp_public', entity: 'produits',
          meta: { inserted: job.inserted, failed: job.failed, total: all.length }, req });
      })().catch(e => { job.status = 'error'; job.error = e.message; job.finished_at = Date.now(); });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Import WordPress / WooCommerce
  router.post('/produits/import-wordpress', requireSociete(), async (req, res) => {
    try {
      const { site_url, consumer_key, consumer_secret } = req.body || {};
      if (!site_url || !consumer_key || !consumer_secret)
        return res.status(400).json({ error: 'site_url + consumer_key + consumer_secret requis' });

      const base = site_url.replace(/\/$/, '');
      const auth = 'Basic ' + Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64');
      let page = 1, all = [];
      while (true) {
        const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}`, {
          headers: { Authorization: auth }
        });
        if (!r.ok) throw new Error(`WP API ${r.status}`);
        const batch = await r.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        all = all.concat(batch);
        if (batch.length < 100) break;
        page++;
        if (page > 50) break; // garde-fou
      }
      let inserted = 0;
      for (const p of all) {
        await admin().from('produits_societe').upsert({
          societe_id: req.societe.id,
          reference: p.sku || null,
          designation: p.name || 'Sans nom',
          description: p.short_description || null,
          prix_ht: parseFloat(p.regular_price || p.price || '0') || 0,
          taux_tva: 20,
          stock_actuel: p.stock_quantity || 0,
          image_url: p.images?.[0]?.src || null,
          source: 'wordpress',
          external_id: String(p.id)
        }, { onConflict: 'societe_id,reference' });
        inserted++;
      }
      await admin().from('integrations_wordpress').upsert({
        societe_id: req.societe.id, site_url: base, consumer_key, consumer_secret,
        dernier_sync: new Date().toISOString(), actif: true
      }, { onConflict: 'societe_id' });
      res.json({ success: true, inserted });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // CLIENTS
  // =====================================================================
  router.get('/clients', requireSociete(), async (req, res) => {
    const q = req.query.q ? String(req.query.q).trim() : null;
    let qb = admin().from('clients_societe').select('*').eq('societe_id', req.societe.id);
    if (q) qb = qb.or(`raison_sociale.ilike.%${q}%,nom.ilike.%${q}%,email.ilike.%${q}%`);
    const { data } = await qb.order('raison_sociale').limit(200);
    res.json({ success: true, clients: data || [] });
  });
  router.post('/clients', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('clients_societe')
        .insert({ ...req.body, societe_id: req.societe.id }).select('*').single();
      if (error) throw error;
      res.json({ success: true, client: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/clients/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('clients_societe')
        .update(req.body).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, client: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.delete('/clients/:id', requireSociete(), async (req, res) => {
    await admin().from('clients_societe').delete()
      .eq('id', req.params.id).eq('societe_id', req.societe.id);
    res.json({ success: true });
  });
  router.post('/clients/import-csv', requireSociete(), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file requis' });
      const rows = csvParse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
      let inserted = 0;
      for (const r of rows) {
        try {
          await admin().from('clients_societe').insert({
            societe_id: req.societe.id,
            type: r.type || 'professionnel',
            raison_sociale: r.raison_sociale || r.societe || null,
            nom: r.nom || null, prenom: r.prenom || null,
            email: r.email || null, telephone: r.telephone || r.tel || null,
            adresse: r.adresse || null, code_postal: r.cp || r.code_postal || null,
            ville: r.ville || null, siren: r.siren || null,
            tva_intracom: r.tva || r.tva_intracom || null
          });
          inserted++;
        } catch {}
      }
      res.json({ success: true, inserted });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // DEVIS
  // =====================================================================
  router.get('/devis', requireSociete(), async (req, res) => {
    const { data } = await admin().from('devis')
      .select('*, client:client_id(id, raison_sociale, nom, prenom, email)')
      .eq('societe_id', req.societe.id).order('created_at', { ascending: false });
    res.json({ success: true, devis: data || [] });
  });
  router.post('/devis', requireSociete(), async (req, res) => {
    try {
      const annee = new Date().getFullYear();
      const numero = await genNumero(req.societe.id, 'devis', annee);
      const totaux = calcTotaux(req.body.lignes || []);
      const payload = {
        societe_id: req.societe.id,
        client_id: req.body.client_id || null,
        numero,
        lignes: req.body.lignes || [],
        notes: req.body.notes || null,
        conditions: req.body.conditions || null,
        ...totaux
      };
      const { data, error } = await admin().from('devis').insert(payload).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'devis', entityId: data.id, req });
      res.json({ success: true, devis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/devis/:id', requireSociete(), async (req, res) => {
    try {
      const { data: current } = await admin().from('devis')
        .select('statut').eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!current) return res.status(404).json({ error: 'not_found' });
      if (current.statut === 'accepte') {
        return res.status(403).json({
          error: 'devis_accepte_immuable',
          message: 'Devis accepté non modifiable — il a été converti en facture.'
        });
      }
      const patch = { ...req.body };
      delete patch.statut; // le statut ne se change pas via cette route
      if (patch.lignes) Object.assign(patch, calcTotaux(patch.lignes));
      delete patch.numero; // numérotation immuable
      const { data, error } = await admin().from('devis')
        .update(patch).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, devis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.get('/devis/:id/pdf', requireSociete(), async (req, res) => {
    try {
      const { data: d } = await admin().from('devis').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!d) return res.status(404).send('Not found');
      const { data: soc } = await admin().from('societes').select('*').eq('id', d.societe_id).single();
      const { data: client } = d.client_id
        ? await admin().from('clients_societe').select('*').eq('id', d.client_id).single()
        : { data: null };
      const pdf = await buildDevisPDF({ societe: soc, client, devis: d });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${d.numero}.pdf"`);
      res.end(pdf);
    } catch (e) { res.status(500).send(e.message); }
  });
  router.post('/devis/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: d } = await admin().from('devis').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!d) return res.status(404).json({ error: 'not_found' });
      const { data: soc } = await admin().from('societes').select('*').eq('id', d.societe_id).single();
      const { data: client } = d.client_id
        ? await admin().from('clients_societe').select('*').eq('id', d.client_id).single()
        : { data: null };
      if (!client?.email) return res.status(400).json({ error: 'client sans email' });
      const pdf = await buildDevisPDF({ societe: soc, client, devis: d });
      await mailer.sendMail({
        to: client.email,
        subject: `Devis ${d.numero} — ${soc.nom}`,
        html: `<p>Bonjour,</p><p>Veuillez trouver en pièce jointe notre devis ${d.numero}.</p><p>Cordialement,<br>${soc.nom}</p>`,
        from: soc.email ? `"${soc.nom}" <${soc.email}>` : undefined,
        attachments: [{ filename: `${d.numero}.pdf`, content: pdf, contentType: 'application/pdf' }]
      });
      await admin().from('devis').update({ statut: 'envoye', envoye_at: new Date().toISOString() })
        .eq('id', d.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Devis → Facture (en 1 clic)
  router.post('/devis/:id/vers-facture', requireSociete(), async (req, res) => {
    try {
      const { data: d } = await admin().from('devis').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!d) return res.status(404).json({ error: 'not_found' });
      const annee = new Date().getFullYear();
      const numero = await genNumero(req.societe.id, 'facture', annee);
      const { data: f, error } = await admin().from('factures_societe').insert({
        societe_id: req.societe.id,
        client_id: d.client_id,
        devis_id: d.id,
        numero,
        lignes: d.lignes,
        sous_total_ht: d.sous_total_ht,
        total_tva: d.total_tva,
        total_ttc: d.total_ttc,
        notes: d.notes
      }).select('*').single();
      if (error) throw error;
      await admin().from('devis').update({ statut: 'accepte', accepte_at: new Date().toISOString() })
        .eq('id', d.id);
      res.json({ success: true, facture: f });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // FACTURES
  // =====================================================================
  router.get('/factures', requireSociete(), async (req, res) => {
    const { data } = await admin().from('factures_societe')
      .select('*, client:client_id(id, raison_sociale, nom, prenom, email)')
      .eq('societe_id', req.societe.id).order('created_at', { ascending: false });
    res.json({ success: true, factures: data || [] });
  });
  router.post('/factures', requireSociete(), async (req, res) => {
    try {
      const annee = new Date().getFullYear();
      const numero = await genNumero(req.societe.id, 'facture', annee);
      const totaux = calcTotaux(req.body.lignes || []);
      const payload = {
        societe_id: req.societe.id,
        client_id: req.body.client_id || null,
        numero,
        lignes: req.body.lignes || [],
        nb_echeances: req.body.nb_echeances || 1,
        notes: req.body.notes || null,
        ...totaux
      };
      const { data: f, error } = await admin().from('factures_societe').insert(payload).select('*').single();
      if (error) throw error;

      if (payload.nb_echeances > 1) {
        const part = +(totaux.total_ttc / payload.nb_echeances).toFixed(2);
        const reste = +(totaux.total_ttc - part * (payload.nb_echeances - 1)).toFixed(2);
        const rows = [];
        for (let i = 0; i < payload.nb_echeances; i++) {
          const d = new Date();
          d.setMonth(d.getMonth() + i);
          rows.push({
            facture_id: f.id, societe_id: req.societe.id,
            rang: i + 1,
            montant: (i === payload.nb_echeances - 1) ? reste : part,
            date_prevue: d.toISOString().slice(0, 10)
          });
        }
        await admin().from('factures_echeances').insert(rows);
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'facture', entityId: f.id, req });
      res.json({ success: true, facture: f });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.patch('/factures/:id', requireSociete(), async (req, res) => {
    try {
      // Comptabilité française : seule une facture brouillon est modifiable
      const { data: current } = await admin().from('factures_societe')
        .select('statut').eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!current) return res.status(404).json({ error: 'not_found' });
      if (current.statut !== 'brouillon') {
        return res.status(403).json({
          error: 'facture_immuable',
          message: 'Facture envoyée : modification interdite. Émettez un avoir.'
        });
      }
      const patch = { ...req.body };
      delete patch.numero;
      delete patch.statut; // jamais changer le statut ici
      if (patch.lignes) Object.assign(patch, calcTotaux(patch.lignes));
      const { data, error } = await admin().from('factures_societe')
        .update(patch).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, facture: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Suppression : uniquement brouillon
  router.delete('/factures/:id', requireSociete(), async (req, res) => {
    try {
      const { data: current } = await admin().from('factures_societe')
        .select('statut, numero').eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!current) return res.status(404).json({ error: 'not_found' });
      if (current.statut !== 'brouillon') {
        return res.status(403).json({
          error: 'facture_immuable',
          message: 'Seules les factures en brouillon peuvent être supprimées.'
        });
      }
      await admin().from('factures_societe').delete()
        .eq('id', req.params.id).eq('societe_id', req.societe.id);
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'delete_brouillon', entity: 'facture', entityId: req.params.id,
        meta: { numero: current.numero }, req });
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
  router.get('/factures/:id/pdf', requireSociete(), async (req, res) => {
    try {
      const { data: f } = await admin().from('factures_societe').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!f) return res.status(404).send('Not found');
      const { data: soc } = await admin().from('societes').select('*').eq('id', f.societe_id).single();
      const { data: client } = f.client_id
        ? await admin().from('clients_societe').select('*').eq('id', f.client_id).single()
        : { data: null };
      const pdf = await buildFacturePDF({ societe: soc, client, facture: f });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${f.numero}.pdf"`);
      res.end(pdf);
    } catch (e) { res.status(500).send(e.message); }
  });
  router.post('/factures/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: f } = await admin().from('factures_societe').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!f) return res.status(404).json({ error: 'not_found' });
      const { data: soc } = await admin().from('societes').select('*').eq('id', f.societe_id).single();
      const { data: client } = f.client_id
        ? await admin().from('clients_societe').select('*').eq('id', f.client_id).single()
        : { data: null };
      if (!client?.email) return res.status(400).json({ error: 'client sans email' });
      const pdf = await buildFacturePDF({ societe: soc, client, facture: f });

      let paymentLinkHtml = '';
      if (stripe && f.stripe_payment_link) {
        paymentLinkHtml = `<p><a href="${f.stripe_payment_link}" style="background:#c8f060;color:#111;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Régler en ligne</a></p>`;
      }
      await mailer.sendMail({
        to: client.email,
        subject: `Facture ${f.numero} — ${soc.nom}`,
        html: `<p>Bonjour,</p><p>Veuillez trouver en pièce jointe votre facture ${f.numero}.</p>${paymentLinkHtml}<p>Cordialement,<br>${soc.nom}</p>`,
        from: soc.email ? `"${soc.nom}" <${soc.email}>` : undefined,
        attachments: [{ filename: `${f.numero}.pdf`, content: pdf, contentType: 'application/pdf' }]
      });
      await admin().from('factures_societe').update({
        statut: 'envoyee', envoyee_at: new Date().toISOString()
      }).eq('id', f.id);

      // Décrément stock automatique pour chaque ligne avec référence catalogue
      for (const l of (f.lignes || [])) {
        if (!l.reference) continue;
        const qte = Math.abs(Number(l.quantite || 0));
        if (!qte) continue;
        const { data: prod } = await admin().from('produits_societe').select('id')
          .eq('societe_id', req.societe.id).eq('reference', l.reference).maybeSingle();
        if (!prod) continue;
        await admin().rpc('enregistrer_mouvement_stock', {
          p_societe_id: req.societe.id, p_produit_id: prod.id,
          p_type: 'vente', p_quantite: -qte,
          p_reference_doc: f.numero, p_reference_doc_id: f.id,
          p_note: null, p_user_id: req.user.id
        }).catch(() => {});
      }

      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Création lien de paiement Stripe
  router.post('/factures/:id/stripe-link', requireSociete(), async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'stripe non configuré' });
      const { data: f } = await admin().from('factures_societe').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!f) return res.status(404).json({ error: 'not_found' });
      const { data: soc } = await admin().from('societes').select('*').eq('id', f.societe_id).single();

      // Création Product + Price + PaymentLink via Stripe
      const product = await stripe.products.create({
        name: `Facture ${f.numero} — ${soc.nom}`,
        metadata: { facture_id: f.id, societe_id: soc.id }
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(f.total_ttc * 100),
        currency: 'eur'
      });
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { facture_id: f.id, societe_id: soc.id },
        // Les metadata sur le PaymentIntent permettent au webhook de retrouver la facture
        // même si l'event reçu est payment_intent.succeeded (pas juste checkout.session).
        payment_intent_data: {
          metadata: { facture_id: f.id, societe_id: soc.id }
        }
      });
      await admin().from('factures_societe').update({ stripe_payment_link: link.url })
        .eq('id', f.id);
      res.json({ success: true, url: link.url });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Paiement encaissé manuellement
  router.patch('/factures/:id/paiement', requireSociete(), async (req, res) => {
    try {
      const { montant, date_paiement } = req.body || {};
      const { data: f } = await admin().from('factures_societe').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!f) return res.status(404).json({ error: 'not_found' });
      const nouveau = Number(f.montant_paye || 0) + Number(montant || f.total_ttc);
      const statut = nouveau >= Number(f.total_ttc) - 0.01 ? 'payee'
                    : nouveau > 0 ? 'partielle' : f.statut;
      const { data } = await admin().from('factures_societe').update({
        montant_paye: nouveau, statut,
        payee_at: statut === 'payee' ? (date_paiement || new Date().toISOString()) : f.payee_at
      }).eq('id', f.id).select('*').single();

      if (statut === 'payee') {
        try {
          pushNotif({
            user_id: req.user.id, societe_id: req.societe.id,
            type: 'facture_payee', urgence: 'normale',
            titre: `Facture ${f.numero} payée`,
            message: `Encaissement de ${Number(f.total_ttc).toFixed(2)} €`,
            entity_type: 'facture', entity_id: f.id,
            cta_label: 'Voir', cta_url: '/commerce.html?tab=factures'
          });
        } catch (_) {}
      }

      res.json({ success: true, facture: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // Webhook WordPress — maj stock à chaque commande
  // =====================================================================
  app.post('/api/webhook/wordpress/:societe_id', express.json({ verify: (req,_,buf)=>{req.rawBody=buf;} }), async (req, res) => {
    try {
      const { societe_id } = req.params;
      // vérification secret optionnel
      const { data: integ } = await admin().from('integrations_wordpress').select('*')
        .eq('societe_id', societe_id).maybeSingle();
      if (!integ?.actif) return res.status(404).json({ error: 'no_integration' });
      const secret = req.headers['x-wc-webhook-secret'] || req.headers['x-webhook-secret'];
      if (integ.webhook_secret && integ.webhook_secret !== secret)
        return res.status(401).json({ error: 'invalid_secret' });

      const order = req.body;
      const lines = order?.line_items || [];
      for (const li of lines) {
        const sku = li.sku || null;
        const qty = Number(li.quantity || 0);
        if (!sku || qty <= 0) continue;
        const { data: prod } = await admin().from('produits_societe').select('*')
          .eq('societe_id', societe_id).eq('reference', sku).maybeSingle();
        if (!prod) continue;
        const nouveau = Math.max(0, Number(prod.stock_actuel || 0) - qty);
        await admin().from('produits_societe').update({ stock_actuel: nouveau })
          .eq('id', prod.id);
      }
      await auditLog({ userId: null, societeId: societe_id,
        action: 'webhook_wordpress', entity: 'commande', entityId: String(order?.id || ''),
        meta: { nb_lines: lines.length }, req });
      res.json({ success: true });
    } catch (e) {
      console.error('[webhook wordpress]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // =====================================================================
  // AVOIRS (notes de crédit) — comptabilité française
  // Une facture envoyée/payée ne se modifie pas : on émet un avoir.
  // =====================================================================
  router.get('/avoirs', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('avoirs')
        .select('*, client:client_id(*), facture:facture_id(numero, total_ttc, date_emission)')
        .eq('societe_id', req.societe.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, avoirs: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/factures/:id/avoirs', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('avoirs')
        .select('*')
        .eq('societe_id', req.societe.id)
        .eq('facture_id', req.params.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, avoirs: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Création d'un avoir sur une facture
  // body: { lignes?, motif?, type_avoir? 'total'|'partiel' }
  // si lignes absent → avoir total = recopie lignes facture
  router.post('/factures/:id/avoir', requireSociete(), async (req, res) => {
    try {
      const { data: f, error: eF } = await admin().from('factures_societe').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (eF || !f) return res.status(404).json({ error: 'facture_not_found' });
      if (!['envoyee','partielle','retard','payee'].includes(f.statut)) {
        return res.status(400).json({ error: 'Avoir uniquement sur facture émise (statut != brouillon)' });
      }

      const body = req.body || {};
      const typeAv = body.type_avoir === 'partiel' ? 'partiel' : 'total';
      const lignes = Array.isArray(body.lignes) && body.lignes.length
        ? body.lignes
        : (f.lignes || []);
      if (!lignes.length) return res.status(400).json({ error: 'lignes_requises' });

      const totaux = calcTotaux(lignes);

      const annee = new Date().getFullYear();
      const { data: numRpc, error: eNum } = await admin()
        .rpc('prochain_numero_avoir', { p_societe_id: req.societe.id, p_annee: annee });
      if (eNum) throw eNum;

      const payload = {
        societe_id: req.societe.id,
        facture_id: f.id,
        client_id: f.client_id,
        numero: numRpc,
        date_emission: body.date_emission || new Date().toISOString().slice(0, 10),
        motif: body.motif || null,
        type_avoir: typeAv,
        lignes,
        sous_total_ht: totaux.sous_total_ht,
        total_tva: totaux.total_tva,
        total_ttc: totaux.total_ttc
      };
      const { data: avoir, error: eIns } = await admin().from('avoirs')
        .insert(payload).select('*').single();
      if (eIns) throw eIns;

      // Mise à jour statut facture :
      // - avoir total (>= total_ttc facture) → 'annulee'
      // - avoir partiel → statut conservé, solde recalculé côté display
      const avoirHorsFacture = Number(avoir.total_ttc || 0);
      const resteDu = Number(f.total_ttc || 0) - Number(f.montant_paye || 0);
      if (typeAv === 'total' || avoirHorsFacture >= resteDu - 0.01) {
        await admin().from('factures_societe').update({ statut: 'annulee' })
          .eq('id', f.id);
      }

      // Réintégration stock : l'avoir annule des ventes → entrée stock
      for (const l of lignes) {
        if (!l.reference) continue;
        const qte = Math.abs(Number(l.quantite || 0));
        if (!qte) continue;
        const { data: prod } = await admin().from('produits_societe').select('id')
          .eq('societe_id', req.societe.id).eq('reference', l.reference).maybeSingle();
        if (!prod) continue;
        await admin().rpc('enregistrer_mouvement_stock', {
          p_societe_id: req.societe.id, p_produit_id: prod.id,
          p_type: 'retour', p_quantite: qte,
          p_reference_doc: avoir.numero, p_reference_doc_id: avoir.id,
          p_note: 'Avoir', p_user_id: req.user.id
        }).catch(() => {});
      }

      await auditLog({
        userId: req.user.id, societeId: req.societe.id,
        action: 'create_avoir', entity: 'avoir', entityId: avoir.id,
        meta: { facture_id: f.id, numero: avoir.numero, type_avoir: typeAv }, req
      });
      res.json({ success: true, avoir });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PDF avoir
  router.get('/avoirs/:id/pdf', requireSociete(), async (req, res) => {
    try {
      const { data: a } = await admin().from('avoirs').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!a) return res.status(404).send('Not found');
      const { data: soc } = await admin().from('societes').select('*').eq('id', a.societe_id).single();
      const { data: client } = a.client_id
        ? await admin().from('clients_societe').select('*').eq('id', a.client_id).single()
        : { data: null };
      const { data: facture } = await admin().from('factures_societe').select('*')
        .eq('id', a.facture_id).single();
      const pdf = await buildAvoirPDF({ societe: soc, client, avoir: a, facture });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${a.numero}.pdf"`);
      res.end(pdf);
    } catch (e) { res.status(500).send(e.message); }
  });

  // Envoi avoir par email
  router.post('/avoirs/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const { data: a } = await admin().from('avoirs').select('*')
        .eq('id', req.params.id).eq('societe_id', req.societe.id).single();
      if (!a) return res.status(404).json({ error: 'not_found' });
      const { data: soc } = await admin().from('societes').select('*').eq('id', a.societe_id).single();
      const { data: client } = a.client_id
        ? await admin().from('clients_societe').select('*').eq('id', a.client_id).single()
        : { data: null };
      if (!client?.email) return res.status(400).json({ error: 'client sans email' });
      const { data: facture } = await admin().from('factures_societe').select('*')
        .eq('id', a.facture_id).single();
      const pdf = await buildAvoirPDF({ societe: soc, client, avoir: a, facture });
      await mailer.sendMail({
        to: client.email,
        subject: `Avoir ${a.numero} — ${soc.nom}`,
        html: `<p>Bonjour,</p><p>Veuillez trouver en pièce jointe l'avoir ${a.numero}${facture?.numero ? ` référence à la facture ${facture.numero}` : ''}.</p><p>Cordialement,<br>${soc.nom}</p>`,
        from: soc.email ? `"${soc.nom}" <${soc.email}>` : undefined,
        attachments: [{ filename: `${a.numero}.pdf`, content: pdf, contentType: 'application/pdf' }]
      });
      await admin().from('avoirs').update({ envoye_at: new Date().toISOString() }).eq('id', a.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // STOCK & MOUVEMENTS
  // ─────────────────────────────────────────────────────────────────────
  // Les prix d'achat et marges sont CONFIDENTIELS :
  // retournés uniquement si req.role ∈ {proprietaire, associe}.
  // =====================================================================
  const ROLES_FINANCE = new Set(['proprietaire', 'associe']);
  const canSeeMargins = (role) => ROLES_FINANCE.has(role);

  function redactFinance(row, role) {
    if (canSeeMargins(role)) return row;
    const clean = { ...row };
    delete clean.prix_achat_ht;
    delete clean.marge_unitaire_ht;
    delete clean.marge_pourcent;
    return clean;
  }

  // GET stock — liste produits avec infos stock (et marges si autorisé)
  router.get('/stock', requireSociete(), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10) || 100));
      const from = (page - 1) * limit, to = from + limit - 1;
      const q = req.query.q ? String(req.query.q).trim() : null;
      const statut = req.query.statut ? String(req.query.statut) : null; // ok|faible|rupture

      let qb = admin().from('v_stock_analytics')
        .select('*', { count: 'exact' })
        .eq('societe_id', req.societe.id);
      if (q) qb = qb.or(`designation.ilike.%${q}%,reference.ilike.%${q}%`);
      if (statut) qb = qb.eq('statut_stock', statut);
      const { data, count, error } = await qb.order('statut_stock').order('designation').range(from, to);
      if (error) throw error;

      const rows = (data || []).map(r => redactFinance(r, req.role));
      res.json({
        success: true,
        stock: rows,
        role: req.role,
        can_see_margins: canSeeMargins(req.role),
        pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET alertes stock (faible + rupture)
  router.get('/stock/alertes', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('v_stock_analytics')
        .select('*')
        .eq('societe_id', req.societe.id)
        .in('statut_stock', ['faible', 'rupture'])
        .order('statut_stock', { ascending: false })  // rupture d'abord
        .order('stock_reel');
      if (error) throw error;
      const rows = (data || []).map(r => redactFinance(r, req.role));
      const rupture = rows.filter(r => r.statut_stock === 'rupture').length;
      const faible = rows.filter(r => r.statut_stock === 'faible').length;
      res.json({ success: true, alertes: rows, rupture, faible, total: rows.length });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH prix_achat d'un produit (owner/associe uniquement)
  router.patch('/stock/:produit_id/prix-achat', requireSociete(), async (req, res) => {
    if (!canSeeMargins(req.role)) return res.status(403).json({ error: 'forbidden' });
    try {
      const prix = Number(req.body?.prix_achat_ht);
      if (isNaN(prix) || prix < 0) return res.status(400).json({ error: 'prix_invalide' });
      const { data, error } = await admin().from('produits_societe')
        .update({ prix_achat_ht: prix })
        .eq('id', req.params.produit_id).eq('societe_id', req.societe.id)
        .select('id, prix_achat_ht').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'update_prix_achat', entity: 'produit', entityId: data.id, req });
      res.json({ success: true, produit: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST mouvement stock manuel (ajustement / inventaire / entrée / sortie)
  router.post('/stock/mouvements', requireSociete(), async (req, res) => {
    try {
      const { produit_id, type, quantite, note, reference_doc } = req.body || {};
      if (!produit_id || !type || isNaN(Number(quantite))) {
        return res.status(400).json({ error: 'produit_id, type, quantite requis' });
      }
      const allowed = ['entree','sortie','vente','retour','ajustement','inventaire'];
      if (!allowed.includes(type)) return res.status(400).json({ error: 'type_invalide' });

      // pour 'sortie' et 'vente' on prend la valeur négative ; le front envoie positif
      let qte = Number(quantite);
      if (type === 'sortie' || type === 'vente') qte = -Math.abs(qte);
      else if (type === 'entree' || type === 'retour' || type === 'import_initial') qte = Math.abs(qte);
      // ajustement et inventaire = delta signé tel quel

      const { data, error } = await admin()
        .rpc('enregistrer_mouvement_stock', {
          p_societe_id: req.societe.id,
          p_produit_id: produit_id,
          p_type: type,
          p_quantite: qte,
          p_reference_doc: reference_doc || null,
          p_reference_doc_id: null,
          p_note: note || null,
          p_user_id: req.user.id
        });
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'mouvement_stock', entity: 'produit', entityId: produit_id,
        meta: { type, quantite: qte }, req });

      // Notification si stock critique / rupture après mouvement
      try {
        const { data: prod } = await admin().from('v_stock_analytics')
          .select('id, designation, stock_reel, stock_alerte, statut_stock')
          .eq('id', produit_id).single();
        if (prod && prod.statut_stock !== 'ok') {
          const urg = prod.statut_stock === 'rupture' ? 'urgente' : 'haute';
          pushNotif({
            user_id: req.user.id, societe_id: req.societe.id,
            type: 'stock_critique', urgence: urg,
            titre: prod.statut_stock === 'rupture' ? `🔴 Rupture : ${prod.designation}` : `⚠️ Stock faible : ${prod.designation}`,
            message: `Stock actuel : ${prod.stock_reel} · seuil ${prod.stock_alerte}`,
            entity_type: 'produit', entity_id: prod.id,
            cta_label: 'Réapprovisionner', cta_url: '/commerce.html?tab=stock'
          });
        }
      } catch (_) {}

      res.json({ success: true, mouvement: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET historique mouvements d'un produit
  router.get('/stock/:produit_id/mouvements', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin().from('mouvements_stock').select('*')
        .eq('societe_id', req.societe.id).eq('produit_id', req.params.produit_id)
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      res.json({ success: true, mouvements: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // ANALYTICS COMMERCIAL
  // =====================================================================

  // Dashboard financier — CA, marge, conversion devis
  router.get('/analytics/dashboard', requireSociete(), async (req, res) => {
    try {
      const now = new Date();
      const moisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [fAll, fMois, dAll] = await Promise.all([
        admin().from('factures_societe').select('total_ttc, total_tva, sous_total_ht, montant_paye, statut, created_at, lignes')
          .eq('societe_id', req.societe.id),
        admin().from('factures_societe').select('total_ttc, sous_total_ht, montant_paye, statut, lignes')
          .eq('societe_id', req.societe.id)
          .gte('created_at', moisStart),
        admin().from('devis').select('statut').eq('societe_id', req.societe.id)
      ]);

      const facturesMois = fMois.data || [];
      const factures = fAll.data || [];
      const devis = dAll.data || [];

      const nonAnnulee = x => x.statut !== 'annulee';
      const ca_mois = facturesMois.filter(nonAnnulee).reduce((s,f)=>s+Number(f.total_ttc||0),0);
      const encaisse_mois = facturesMois.reduce((s,f)=>s+Number(f.montant_paye||0),0);
      const en_attente = factures.filter(f=>['envoyee','partielle','retard'].includes(f.statut))
        .reduce((s,f)=>s+(Number(f.total_ttc||0)-Number(f.montant_paye||0)),0);

      // Marge brute du mois = Σ (ligne qte × (prix_vente - prix_achat))
      // Prix achat repêché côté produits via référence
      let marge_mois = null;
      if (canSeeMargins(req.role)) {
        const { data: prods } = await admin().from('produits_societe')
          .select('reference, prix_achat_ht').eq('societe_id', req.societe.id);
        const priceMap = new Map();
        for (const p of prods || []) if (p.reference) priceMap.set(p.reference, Number(p.prix_achat_ht || 0));
        let m = 0, hasAny = false;
        for (const f of facturesMois.filter(nonAnnulee)) {
          for (const l of (f.lignes || [])) {
            const pa = priceMap.get(l.reference);
            if (pa == null) continue;
            const qte = Number(l.quantite || 0);
            const pv = Number(l.prix_unitaire_ht || 0);
            m += qte * (pv - pa);
            hasAny = true;
          }
        }
        marge_mois = hasAny ? +m.toFixed(2) : null;
      }

      const nb_devis = devis.length;
      const nb_devis_envoyes = devis.filter(d => ['envoye','accepte','refuse'].includes(d.statut)).length;
      const nb_devis_acceptes = devis.filter(d => d.statut === 'accepte').length;
      const taux_conversion = nb_devis_envoyes > 0 ? +(nb_devis_acceptes * 100 / nb_devis_envoyes).toFixed(1) : null;

      const ca_ht_mois = facturesMois.filter(nonAnnulee).reduce((s,f)=>s+Number(f.sous_total_ht||0),0);
      const marge_pct = (marge_mois != null && ca_ht_mois > 0)
        ? +((marge_mois / ca_ht_mois) * 100).toFixed(1)
        : null;

      res.json({
        success: true,
        can_see_margins: canSeeMargins(req.role),
        stats: {
          ca_mois, encaisse_mois, en_attente,
          marge_mois, marge_pct,
          nb_devis, nb_devis_envoyes, nb_devis_acceptes, taux_conversion
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Top produits par volume / CA / marge (période au choix)
  router.get('/analytics/top-produits', requireSociete(), async (req, res) => {
    try {
      const range = String(req.query.range || '3m');                // 1m|3m|6m|12m
      const tri = String(req.query.tri || 'ca');                    // ca|volume|marge
      const limit = Math.min(50, parseInt(req.query.limit || '10', 10) || 10);

      const mois = { '1m':1, '3m':3, '6m':6, '12m':12 }[range] || 3;
      const since = new Date(); since.setMonth(since.getMonth() - mois);

      const { data: factures } = await admin().from('factures_societe')
        .select('lignes, statut, created_at')
        .eq('societe_id', req.societe.id)
        .gte('created_at', since.toISOString())
        .neq('statut', 'annulee');

      let priceMap = null;
      if (canSeeMargins(req.role)) {
        const { data: prods } = await admin().from('produits_societe')
          .select('reference, designation, prix_achat_ht').eq('societe_id', req.societe.id);
        priceMap = new Map();
        for (const p of prods || []) if (p.reference) priceMap.set(p.reference, Number(p.prix_achat_ht || 0));
      }

      // Agrégation par référence (fallback designation si pas de ref)
      const agg = new Map();
      for (const f of factures || []) {
        for (const l of (f.lignes || [])) {
          const key = l.reference || l.designation || 'sans_ref';
          const row = agg.get(key) || { reference: l.reference, designation: l.designation, volume: 0, ca: 0, marge: 0 };
          const qte = Number(l.quantite || 0);
          const pv = Number(l.prix_unitaire_ht || 0);
          row.volume += qte;
          row.ca += qte * pv;
          if (priceMap && l.reference) {
            const pa = priceMap.get(l.reference) || 0;
            row.marge += qte * (pv - pa);
          }
          agg.set(key, row);
        }
      }
      let rows = Array.from(agg.values()).map(r => ({
        ...r,
        ca: +r.ca.toFixed(2),
        marge: canSeeMargins(req.role) ? +r.marge.toFixed(2) : null
      }));
      const sortKey = tri === 'volume' ? 'volume' : (tri === 'marge' && canSeeMargins(req.role) ? 'marge' : 'ca');
      rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
      rows = rows.slice(0, limit);

      res.json({ success: true, range, tri: sortKey, produits: rows, can_see_margins: canSeeMargins(req.role) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Simulation promo — marge après remise
  router.post('/analytics/promo', requireSociete(), async (req, res) => {
    if (!canSeeMargins(req.role)) return res.status(403).json({ error: 'forbidden' });
    try {
      const { produit_id, remise_pct } = req.body || {};
      if (!produit_id) return res.status(400).json({ error: 'produit_id requis' });
      const remise = Math.max(0, Math.min(100, Number(remise_pct || 0)));

      const { data: p } = await admin().from('produits_societe')
        .select('id, designation, reference, prix_ht, prix_achat_ht, stock_reel')
        .eq('id', produit_id).eq('societe_id', req.societe.id).single();
      if (!p) return res.status(404).json({ error: 'produit_not_found' });

      const prix_achat = Number(p.prix_achat_ht || 0);
      const prix_vente = Number(p.prix_ht || 0);
      const prix_remise = +(prix_vente * (1 - remise / 100)).toFixed(2);
      const marge_avant = +(prix_vente - prix_achat).toFixed(2);
      const marge_apres = +(prix_remise - prix_achat).toFixed(2);
      const marge_pct_avant = prix_vente > 0 ? +(((prix_vente - prix_achat) / prix_vente) * 100).toFixed(2) : null;
      const marge_pct_apres = prix_remise > 0 ? +(((prix_remise - prix_achat) / prix_remise) * 100).toFixed(2) : null;
      // Seuil rentabilité = remise max où marge_apres = 0 → prix_vente * (1 - r/100) = prix_achat
      //                                                  r = (1 - prix_achat/prix_vente) * 100
      const seuil_remise_max = prix_vente > 0 ? +(Math.max(0, (1 - prix_achat / prix_vente) * 100)).toFixed(2) : 0;

      let recommandation = 'viable';
      if (marge_apres < 0) recommandation = 'perte';
      else if (marge_pct_apres != null && marge_pct_apres < 10) recommandation = 'risque';

      res.json({
        success: true,
        simulation: {
          produit: { id: p.id, designation: p.designation, reference: p.reference, stock: p.stock_reel },
          prix_achat, prix_vente, remise_pct: remise, prix_remise,
          marge_avant, marge_apres, marge_pct_avant, marge_pct_apres,
          seuil_remise_max, recommandation
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Prévision rupture : vélocité (sorties/vente des 30 derniers jours) → jours restants
  router.get('/analytics/previsions-stock', requireSociete(), async (req, res) => {
    try {
      const days = Math.min(180, parseInt(req.query.days || '30', 10) || 30);
      const since = new Date(); since.setDate(since.getDate() - days);

      const [{ data: mouvements }, { data: produits }] = await Promise.all([
        admin().from('mouvements_stock')
          .select('produit_id, quantite, created_at')
          .eq('societe_id', req.societe.id)
          .in('type', ['sortie', 'vente'])
          .gte('created_at', since.toISOString()),
        admin().from('v_stock_analytics')
          .select('id, designation, reference, stock_reel, stock_alerte, statut_stock, prix_achat_ht')
          .eq('societe_id', req.societe.id)
      ]);

      const velocites = new Map();
      for (const m of mouvements || []) {
        const q = Math.abs(Number(m.quantite || 0));
        velocites.set(m.produit_id, (velocites.get(m.produit_id) || 0) + q);
      }

      const rows = (produits || []).map(p => {
        const vendu = velocites.get(p.id) || 0;
        const vitesse_jour = vendu / days;                      // unités/jour
        const stock = Number(p.stock_reel || 0);
        const jours_restants = vitesse_jour > 0 ? +(stock / vitesse_jour).toFixed(1) : null;
        const quantite_recommandee = vitesse_jour > 0
          ? Math.max(Number(p.stock_alerte || 0) * 2, Math.ceil(vitesse_jour * 30))
          : null;
        return {
          ...redactFinance(p, req.role),
          vendu_periode: vendu,
          vitesse_jour: +vitesse_jour.toFixed(2),
          jours_restants,
          quantite_recommandee,
          statut_prevision: stock <= 0 ? 'rupture'
            : jours_restants != null && jours_restants < 7 ? 'critique'
            : jours_restants != null && jours_restants < 30 ? 'vigilance'
            : 'ok'
        };
      }).filter(r => r.vendu_periode > 0 || r.statut_stock !== 'ok');

      rows.sort((a,b) => {
        const prio = { rupture:0, critique:1, vigilance:2, ok:3 };
        return (prio[a.statut_prevision] - prio[b.statut_prevision])
          || (a.jours_restants ?? 9e9) - (b.jours_restants ?? 9e9);
      });

      res.json({ success: true, produits: rows, periode_jours: days });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // =====================================================================
  // Factures fournisseurs (liste / validation)
  // =====================================================================
  router.get('/factures-fournisseurs', requireSociete(), async (req, res) => {
    const { data } = await admin().from('factures_fournisseurs_societe').select('*')
      .eq('societe_id', req.societe.id).order('date_emission', { ascending: false });
    res.json({ success: true, factures: data || [] });
  });

  // =====================================================================
  // Dashboard
  // =====================================================================
  router.get('/dashboard', requireSociete(), async (req, res) => {
    try {
      const [p, c, d, f] = await Promise.all([
        admin().from('produits_societe').select('id', { count: 'exact', head: true }).eq('societe_id', req.societe.id).eq('actif', true),
        admin().from('clients_societe').select('id', { count: 'exact', head: true }).eq('societe_id', req.societe.id),
        admin().from('devis').select('id, total_ttc, statut').eq('societe_id', req.societe.id),
        admin().from('factures_societe').select('id, total_ttc, montant_paye, statut').eq('societe_id', req.societe.id)
      ]);
      const factures = f.data || [];
      const ca_ttc = factures.reduce((s, x) => s + Number(x.total_ttc || 0), 0);
      const encaisse = factures.reduce((s, x) => s + Number(x.montant_paye || 0), 0);
      const impayes = factures.filter(x => ['envoyee','partielle','retard'].includes(x.statut))
        .reduce((s, x) => s + (Number(x.total_ttc || 0) - Number(x.montant_paye || 0)), 0);
      res.json({
        success: true,
        stats: {
          nb_produits: p.count || 0,
          nb_clients: c.count || 0,
          nb_devis: (d.data || []).length,
          nb_factures: factures.length,
          ca_ttc, encaisse, impayes
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/commerce', router);
  console.log('[JADOMI] Routes /api/commerce montées');

  // =====================================================================
  // CRON : relances factures impayées (J+5, J+10, J+20)
  // =====================================================================
  cron.schedule('30 9 * * *', async () => {
    try {
      const { data: factures } = await admin().from('factures_societe')
        .select('*, client:client_id(email)')
        .in('statut', ['envoyee', 'partielle', 'retard']);
      const now = new Date();
      for (const f of (factures || [])) {
        if (!f.date_echeance) continue;
        const dEch = new Date(f.date_echeance);
        const jours = Math.floor((now - dEch) / (24*3600*1000));
        let type = null;
        if (jours === 5) type = 'rappel';
        else if (jours === 10) type = 'formelle';
        else if (jours === 20) type = 'mise_en_demeure';
        if (!type) continue;
        const { data: deja } = await admin().from('relances_factures')
          .select('id').eq('facture_id', f.id).eq('type', type).maybeSingle();
        if (deja) continue;
        const textes = {
          rappel: `Votre facture ${f.numero} est échue. Merci de procéder au règlement.`,
          formelle: `La facture ${f.numero} reste impayée. Merci de régulariser sous 7 jours.`,
          mise_en_demeure: `Mise en demeure : la facture ${f.numero} doit être réglée sous 8 jours sous peine de procédure.`
        };
        if (f.client?.email) {
          await mailer.sendMail({
            to: f.client.email,
            subject: `Relance facture ${f.numero}`,
            html: `<p>Bonjour,</p><p>${textes[type]}</p>`
          }).catch(()=>{});
        }
        await admin().from('relances_factures').insert({
          facture_id: f.id, societe_id: f.societe_id, type, contenu: textes[type]
        });
        if (type === 'mise_en_demeure')
          await admin().from('factures_societe').update({ statut: 'retard' }).eq('id', f.id);
      }
    } catch (e) { console.error('[commerce/CRON relances]', e.message); }
  }, { timezone: 'Europe/Paris' });
};
