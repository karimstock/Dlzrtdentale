// =============================================
// JADOMI COMPTA — API comptabilite universelle
// Organise factures auto-scannees + ecritures
// manuelles par jour/mois/annee
// =============================================
const express = require('express');
const router = express.Router();

// --- Auth (meme pattern que copilot) ---
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

// --- Supabase client (service role) ---
let _supabase = null;
function db() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    );
  }
  return _supabase;
}

// --- Categories comptables cabinet dentaire/medical ---
const COMPTA_CATEGORIES = [
  { id: 'fournisseur_dentaire', label: 'Fournisseurs dentaires', keywords: ['gacd', 'henry schein', 'mega dental', 'zendo', 'dental'] },
  { id: 'charge_cabinet', label: 'Charges du cabinet', keywords: ['edf', 'engie', 'loyer', 'assurance', 'eau', 'electricite'] },
  { id: 'telecom', label: 'Telecommunications', keywords: ['ovh', 'free', 'orange', 'sfr', 'bouygues', 'internet'] },
  { id: 'formation', label: 'Formation continue', keywords: ['formation', 'congres', 'dfcg', 'dpc', 'cesu'] },
  { id: 'materiel', label: 'Materiel / Equipement', keywords: ['fauteuil', 'autoclave', 'radiographie', 'scanner', 'turbine'] },
  { id: 'assurance', label: 'Assurances', keywords: ['macsf', 'axa', 'allianz', 'mma', 'rcp', 'prevoyance'] },
  { id: 'vehicule', label: 'Vehicule', keywords: ['total', 'essence', 'parking', 'autoroute', 'peage', 'carburant'] },
  { id: 'honoraires', label: 'Honoraires recus', keywords: [] },
  { id: 'salaire', label: 'Salaires / Charges sociales', keywords: ['urssaf', 'carcdsf', 'prevoyance', 'cnsd', 'retraite'] },
  { id: 'autre', label: 'Autre', keywords: [] },
];

const COMPTA_DOC_TYPES = [
  'facture', 'devis', 'avoir', 'charge_cabinet',
  'note_frais', 'salaire', 'honoraires'
];

// --- Auto-categorisation par mots-cles fournisseur ---
function autoDetectCategory(fournisseur) {
  if (!fournisseur) return null;
  const lower = fournisseur.toLowerCase();
  for (const cat of COMPTA_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw)) return cat.id;
    }
  }
  return null;
}

// --- Formater une ligne document en entree compta ---
function formatEntry(doc) {
  const meta = doc.metadata || {};
  const category = meta.compta_category || autoDetectCategory(meta.fournisseur) || null;
  return {
    id: doc.id,
    date: meta.date || doc.created_at?.slice(0, 10) || null,
    fournisseur: meta.fournisseur || null,
    type: doc.doc_type || meta.type_document || null,
    montant_ht: meta.montant_ht != null ? parseFloat(meta.montant_ht) : null,
    montant_ttc: meta.total_ttc != null ? parseFloat(meta.total_ttc) : (meta.montant_ttc != null ? parseFloat(meta.montant_ttc) : null),
    tva: meta.tva != null ? parseFloat(meta.tva) : null,
    filename: meta.filename || doc.title || null,
    source: doc.source || 'unknown',
    validated: meta.compta_validated === true,
    rejected: meta.compta_rejected === true,
    category,
    description: meta.description || doc.content_text?.slice(0, 200) || null,
    title: doc.title || null,
  };
}

// --- Middleware global ---
router.use(requireAuth());

// =============================================
// 1. GET /entries — Liste des ecritures compta
// =============================================
router.get('/entries', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { period, year, month, date } = req.query;
    const now = new Date();
    const y = parseInt(year) || now.getFullYear();
    const m = parseInt(month) || (now.getMonth() + 1);

    // Build date range
    let dateFrom, dateTo;
    if (period === 'day' && date) {
      dateFrom = date;
      dateTo = date;
    } else if (period === 'year') {
      dateFrom = `${y}-01-01`;
      dateTo = `${y}-12-31`;
    } else {
      // Default: month
      const mStr = String(m).padStart(2, '0');
      dateFrom = `${y}-${mStr}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    }

    let query = db()
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .eq('societe_id', sid)
      .in('doc_type', COMPTA_DOC_TYPES)
      .order('created_at', { ascending: false });

    // Also include auto_scan / manual_compta entries regardless of doc_type
    // We do two queries and merge
    let queryAutoScan = db()
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .eq('societe_id', sid)
      .in('source', ['auto_scan', 'manual_compta'])
      .order('created_at', { ascending: false });

    const [res1, res2] = await Promise.all([query, queryAutoScan]);

    // Merge and deduplicate by id
    const seen = new Set();
    const allDocs = [];
    for (const doc of [...(res1.data || []), ...(res2.data || [])]) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        allDocs.push(doc);
      }
    }

    // Format and filter by date range
    let entries = allDocs
      .map(formatEntry)
      .filter(e => !e.rejected)
      .filter(e => {
        if (!e.date) return true; // include undated entries
        return e.date >= dateFrom && e.date <= dateTo;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Group by day with totals
    const byDay = {};
    for (const e of entries) {
      const day = e.date || 'non_date';
      if (!byDay[day]) byDay[day] = { date: day, entries: [], total_ttc: 0 };
      byDay[day].entries.push(e);
      byDay[day].total_ttc += e.montant_ttc || 0;
    }

    const grouped = Object.values(byDay).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    res.json({
      period: period || 'month',
      date_from: dateFrom,
      date_to: dateTo,
      total_entries: entries.length,
      total_ttc: entries.reduce((s, e) => s + (e.montant_ttc || 0), 0),
      by_day: grouped,
    });
  } catch (err) {
    console.error('[COMPTA] GET /entries error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recuperation des ecritures.' });
  }
});

// =============================================
// 2. GET /summary — Synthese comptable
// =============================================
router.get('/summary', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const now = new Date();
    const y = parseInt(req.query.year) || now.getFullYear();
    const m = req.query.month ? parseInt(req.query.month) : null;

    // Fetch all entries for the year
    const dateFrom = `${y}-01-01`;
    const dateTo = `${y}-12-31`;

    const { data: docs, error } = await db()
      .from('cabinet_brain_documents')
      .select('id, doc_type, source, metadata, created_at')
      .eq('societe_id', sid)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter to compta-relevant entries
    let entries = (docs || [])
      .filter(d =>
        COMPTA_DOC_TYPES.includes(d.doc_type) ||
        ['auto_scan', 'manual_compta'].includes(d.source)
      )
      .map(formatEntry)
      .filter(e => !e.rejected)
      .filter(e => {
        if (!e.date) return false;
        if (m) {
          const mStr = String(m).padStart(2, '0');
          const lastDay = new Date(y, m, 0).getDate();
          return e.date >= `${y}-${mStr}-01` && e.date <= `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`;
        }
        return e.date >= dateFrom && e.date <= dateTo;
      });

    const total_charges_ttc = entries.reduce((s, e) => s + (e.montant_ttc || 0), 0);
    const total_charges_ht = entries.reduce((s, e) => s + (e.montant_ht || 0), 0);
    const total_tva = entries.reduce((s, e) => s + (e.tva || 0), 0);
    const nb_factures = entries.length;
    const nb_validated = entries.filter(e => e.validated).length;
    const nb_pending = nb_factures - nb_validated;

    // By category
    const catMap = {};
    for (const e of entries) {
      const cat = e.category || 'autre';
      if (!catMap[cat]) catMap[cat] = { category: cat, total: 0, count: 0 };
      catMap[cat].total += e.montant_ttc || 0;
      catMap[cat].count++;
    }
    const by_category = Object.values(catMap).sort((a, b) => b.total - a.total);

    // By month (for year view)
    const monthMap = {};
    for (const e of entries) {
      if (!e.date) continue;
      const mo = e.date.slice(0, 7); // YYYY-MM
      if (!monthMap[mo]) monthMap[mo] = { month: mo, total: 0, count: 0 };
      monthMap[mo].total += e.montant_ttc || 0;
      monthMap[mo].count++;
    }
    const by_month = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      year: y,
      month: m || null,
      total_charges_ttc: Math.round(total_charges_ttc * 100) / 100,
      total_charges_ht: Math.round(total_charges_ht * 100) / 100,
      total_tva: Math.round(total_tva * 100) / 100,
      nb_factures,
      nb_validated,
      nb_pending,
      by_category,
      by_month,
    });
  } catch (err) {
    console.error('[COMPTA] GET /summary error:', err.message);
    res.status(500).json({ error: 'Erreur lors du calcul de la synthese comptable.' });
  }
});

// =============================================
// 3. PATCH /entries/:id/validate — Valider/classer
// =============================================
router.patch('/entries/:id/validate', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { id } = req.params;
    const { validated, category } = req.body;

    // Verify doc belongs to societe
    const { data: doc, error: fetchErr } = await db()
      .from('cabinet_brain_documents')
      .select('id, metadata')
      .eq('id', id)
      .eq('societe_id', sid)
      .single();

    if (fetchErr || !doc) {
      return res.status(404).json({ error: 'Ecriture introuvable.' });
    }

    // Validate category
    const validCats = COMPTA_CATEGORIES.map(c => c.id);
    if (category && !validCats.includes(category)) {
      return res.status(400).json({ error: 'Categorie invalide.', valid_categories: validCats });
    }

    const updatedMeta = { ...(doc.metadata || {}) };
    if (validated !== undefined) updatedMeta.compta_validated = !!validated;
    if (category) updatedMeta.compta_category = category;

    const { data: updated, error: updateErr } = await db()
      .from('cabinet_brain_documents')
      .update({ metadata: updatedMeta })
      .eq('id', id)
      .eq('societe_id', sid)
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .single();

    if (updateErr) throw updateErr;

    res.json({ message: 'Ecriture validee.', entry: formatEntry(updated) });
  } catch (err) {
    console.error('[COMPTA] PATCH /entries/:id/validate error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la validation.' });
  }
});

// =============================================
// 4. PATCH /entries/:id/reject — Rejeter
// =============================================
router.patch('/entries/:id/reject', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { id } = req.params;

    const { data: doc, error: fetchErr } = await db()
      .from('cabinet_brain_documents')
      .select('id, metadata')
      .eq('id', id)
      .eq('societe_id', sid)
      .single();

    if (fetchErr || !doc) {
      return res.status(404).json({ error: 'Ecriture introuvable.' });
    }

    const updatedMeta = { ...(doc.metadata || {}), compta_rejected: true };

    const { data: updated, error: updateErr } = await db()
      .from('cabinet_brain_documents')
      .update({ metadata: updatedMeta })
      .eq('id', id)
      .eq('societe_id', sid)
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .single();

    if (updateErr) throw updateErr;

    res.json({ message: 'Ecriture rejetee.', entry: formatEntry(updated) });
  } catch (err) {
    console.error('[COMPTA] PATCH /entries/:id/reject error:', err.message);
    res.status(500).json({ error: 'Erreur lors du rejet.' });
  }
});

// =============================================
// 5. POST /entries/manual — Ecriture manuelle
// =============================================
router.post('/entries/manual', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { type_document, fournisseur, date, montant_ht, montant_ttc, tva, description, category } = req.body;

    if (!type_document || !fournisseur || !date) {
      return res.status(400).json({ error: 'Champs obligatoires : type_document, fournisseur, date.' });
    }

    // Validate category if provided
    const validCats = COMPTA_CATEGORIES.map(c => c.id);
    if (category && !validCats.includes(category)) {
      return res.status(400).json({ error: 'Categorie invalide.', valid_categories: validCats });
    }

    const metadata = {
      fournisseur,
      date,
      type_document,
      description: description || null,
      montant_ht: montant_ht != null ? parseFloat(montant_ht) : null,
      total_ttc: montant_ttc != null ? parseFloat(montant_ttc) : null,
      montant_ttc: montant_ttc != null ? parseFloat(montant_ttc) : null,
      tva: tva != null ? parseFloat(tva) : null,
      compta_category: category || autoDetectCategory(fournisseur) || 'autre',
      compta_validated: false,
      compta_rejected: false,
    };

    const { data: created, error } = await db()
      .from('cabinet_brain_documents')
      .insert({
        societe_id: sid,
        user_id: req.user?.id || null,
        title: `${type_document} - ${fournisseur} - ${date}`,
        doc_type: type_document,
        source: 'manual_compta',
        content_text: description || `Ecriture manuelle : ${type_document} ${fournisseur}`,
        metadata,
      })
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .single();

    if (error) throw error;

    res.json({ message: 'Ecriture ajoutee.', entry: formatEntry(created) });
  } catch (err) {
    console.error('[COMPTA] POST /entries/manual error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la creation de l\'ecriture.' });
  }
});

// =============================================
// 6. GET /export — Export CSV
// =============================================
router.get('/export', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const now = new Date();
    const y = parseInt(req.query.year) || now.getFullYear();
    const m = parseInt(req.query.month) || (now.getMonth() + 1);
    const mStr = String(m).padStart(2, '0');
    const dateFrom = `${y}-${mStr}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const dateTo = `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`;

    const { data: docs, error } = await db()
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .eq('societe_id', sid)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let entries = (docs || [])
      .filter(d =>
        COMPTA_DOC_TYPES.includes(d.doc_type) ||
        ['auto_scan', 'manual_compta'].includes(d.source)
      )
      .map(formatEntry)
      .filter(e => !e.rejected)
      .filter(e => {
        if (!e.date) return false;
        return e.date >= dateFrom && e.date <= dateTo;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Build CSV
    const csvSep = ';';
    const header = ['Date', 'Fournisseur', 'Type', 'Categorie', 'Montant HT', 'TVA', 'Montant TTC', 'Valide'].join(csvSep);
    const rows = entries.map(e => [
      e.date || '',
      (e.fournisseur || '').replace(/;/g, ','),
      e.type || '',
      e.category || '',
      e.montant_ht != null ? String(e.montant_ht).replace('.', ',') : '',
      e.tva != null ? String(e.tva).replace('.', ',') : '',
      e.montant_ttc != null ? String(e.montant_ttc).replace('.', ',') : '',
      e.validated ? 'Oui' : 'Non',
    ].join(csvSep));

    const csv = '\uFEFF' + [header, ...rows].join('\r\n'); // BOM for Excel UTF-8

    const filename = `compta-jadomi-${y}-${mStr}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[COMPTA] GET /export error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'export CSV.' });
  }
});

// =============================================
// 7. POST /send-comptable — Envoyer au comptable
// =============================================
router.post('/send-comptable', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { entry_ids, message } = req.body;
    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0) {
      return res.status(400).json({ error: 'Veuillez selectionner au moins une ecriture.' });
    }

    // Get comptable email from preferences or cabinet_brain contacts
    let comptableEmail = null;

    // Try preferences first
    const { data: prefDoc } = await db()
      .from('cabinet_brain_documents')
      .select('metadata')
      .eq('societe_id', sid)
      .eq('doc_type', 'preferences')
      .single();

    if (prefDoc?.metadata?.compta?.comptable_email) {
      comptableEmail = prefDoc.metadata.compta.comptable_email;
    }

    // Fallback: look in contacts
    if (!comptableEmail) {
      const { data: contacts } = await db()
        .from('cabinet_brain_documents')
        .select('metadata')
        .eq('societe_id', sid)
        .eq('doc_type', 'contact')
        .ilike('metadata->>role', '%comptable%')
        .limit(1);

      if (contacts?.length && contacts[0].metadata?.email) {
        comptableEmail = contacts[0].metadata.email;
      }
    }

    if (!comptableEmail) {
      return res.status(400).json({ error: 'Aucun email de comptable configure. Veuillez renseigner l\'email dans les preferences comptabilite.' });
    }

    // Load selected entries
    const { data: docs, error: fetchErr } = await db()
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, source, content_text, metadata, created_at')
      .eq('societe_id', sid)
      .in('id', entry_ids);

    if (fetchErr) throw fetchErr;

    const entries = (docs || []).map(formatEntry);
    const totalTTC = entries.reduce((s, e) => s + (e.montant_ttc || 0), 0);

    // Build HTML table for email
    const tableRows = entries.map(e =>
      `<tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${e.date || '-'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${e.fournisseur || '-'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${e.type || '-'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${e.category || '-'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">${e.montant_ht != null ? e.montant_ht.toFixed(2) + ' EUR' : '-'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">${e.tva != null ? e.tva.toFixed(2) + ' EUR' : '-'}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">${e.montant_ttc != null ? e.montant_ttc.toFixed(2) + ' EUR' : '-'}</td>
      </tr>`
    ).join('');

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
        <h2 style="color:#1a1a2e">JADOMI - Documents comptables</h2>
        ${message ? `<p>${message}</p>` : '<p>Veuillez trouver ci-dessous les documents comptables selectionnes.</p>'}
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">Date</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">Fournisseur</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">Type</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">Categorie</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">HT</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">TVA</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">TTC</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
          <tfoot>
            <tr style="background:#f8fafc;font-weight:bold">
              <td colspan="6" style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">Total TTC</td>
              <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right">${totalTTC.toFixed(2)} EUR</td>
            </tr>
          </tfoot>
        </table>
        <p style="color:#64748b;font-size:12px">Envoi automatique depuis JADOMI - plateforme de gestion pour professionnels de sante.</p>
      </div>
    `;

    // Send email via emailService or nodemailer
    let sent = false;
    try {
      const emailService = require('../emailService');
      if (emailService && typeof emailService.sendEmail === 'function') {
        await emailService.sendEmail({
          to: comptableEmail,
          from: 'noreply@jadomi.fr',
          subject: `JADOMI Comptabilite - ${entries.length} document(s)`,
          html: emailHtml,
        });
        sent = true;
      }
    } catch (_ignored) {
      // emailService not available, try nodemailer
    }

    if (!sent) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.jadomi.fr',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER || 'noreply@jadomi.fr',
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: '"JADOMI Comptabilite" <noreply@jadomi.fr>',
          to: comptableEmail,
          subject: `JADOMI Comptabilite - ${entries.length} document(s)`,
          html: emailHtml,
        });
        sent = true;
      } catch (mailErr) {
        console.error('[COMPTA] Email send failed:', mailErr.message);
        return res.status(500).json({ error: 'Echec de l\'envoi de l\'email. Verifiez la configuration SMTP.' });
      }
    }

    res.json({
      message: `Email envoye a ${comptableEmail} avec ${entries.length} document(s).`,
      comptable_email: comptableEmail,
      nb_entries: entries.length,
      total_ttc: totalTTC,
    });
  } catch (err) {
    console.error('[COMPTA] POST /send-comptable error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi au comptable.' });
  }
});

// =============================================
// 8. GET /preferences — Preferences compta
// =============================================
router.get('/preferences', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { data: prefDoc } = await db()
      .from('cabinet_brain_documents')
      .select('id, metadata')
      .eq('societe_id', sid)
      .eq('doc_type', 'preferences')
      .single();

    const compta = prefDoc?.metadata?.compta || {
      auto_scan_enabled: true,
      auto_validate_known_fournisseurs: false,
      comptable_email: null,
    };

    res.json({
      preferences: compta,
      categories: COMPTA_CATEGORIES.map(c => ({ id: c.id, label: c.label })),
    });
  } catch (err) {
    console.error('[COMPTA] GET /preferences error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la lecture des preferences.' });
  }
});

// =============================================
// 9. PUT /preferences — Maj preferences compta
// =============================================
router.put('/preferences', async (req, res) => {
  try {
    const sid = req.societe?.id || req.societeId;
    if (!sid) return res.status(400).json({ error: 'Societe manquante.' });

    const { auto_scan_enabled, auto_validate_known_fournisseurs, comptable_email } = req.body;

    // Load existing preferences doc
    const { data: prefDoc } = await db()
      .from('cabinet_brain_documents')
      .select('id, metadata')
      .eq('societe_id', sid)
      .eq('doc_type', 'preferences')
      .single();

    const existingMeta = prefDoc?.metadata || {};
    const existingCompta = existingMeta.compta || {};

    const updatedCompta = {
      ...existingCompta,
      ...(auto_scan_enabled !== undefined && { auto_scan_enabled: !!auto_scan_enabled }),
      ...(auto_validate_known_fournisseurs !== undefined && { auto_validate_known_fournisseurs: !!auto_validate_known_fournisseurs }),
      ...(comptable_email !== undefined && { comptable_email }),
    };

    const updatedMeta = { ...existingMeta, compta: updatedCompta };

    if (prefDoc) {
      // Update existing
      const { error } = await db()
        .from('cabinet_brain_documents')
        .update({ metadata: updatedMeta })
        .eq('id', prefDoc.id)
        .eq('societe_id', sid);

      if (error) throw error;
    } else {
      // Create preferences doc
      const { error } = await db()
        .from('cabinet_brain_documents')
        .insert({
          societe_id: sid,
          user_id: req.user?.id || null,
          title: 'Preferences cabinet',
          doc_type: 'preferences',
          source: 'system',
          content_text: 'Preferences de configuration du cabinet',
          metadata: updatedMeta,
        });

      if (error) throw error;
    }

    res.json({ message: 'Preferences mises a jour.', preferences: updatedCompta });
  } catch (err) {
    console.error('[COMPTA] PUT /preferences error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour des preferences.' });
  }
});

module.exports = router;
