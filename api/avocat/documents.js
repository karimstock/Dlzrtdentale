// =============================================
// JADOMI AVOCAT EXPERT — Moteur documentaire
// Génération intelligente de documents prud'homaux
// Entêtes cabinet, templates premium A4, vérification
// =============================================
'use strict';

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// === HELPERS ===
const fs = require('fs');
const path = require('path');
const ENTETES_DIR = path.join(__dirname, '../../data/avocat-entetes');
try { fs.mkdirSync(ENTETES_DIR, { recursive: true }); } catch {}

/** Fallback fichier JSON si table avocat_entetes n'existe pas */
function getEnteteFile(societeId) { return path.join(ENTETES_DIR, societeId + '.json'); }
function readEnteteLocal(societeId) {
  try { return JSON.parse(fs.readFileSync(getEnteteFile(societeId), 'utf8')); } catch { return null; }
}
function writeEnteteLocal(societeId, data) {
  fs.writeFileSync(getEnteteFile(societeId), JSON.stringify(data, null, 2));
}

function genId() {
  return crypto.randomUUID();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateCourt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function todayFormate() {
  return formatDate(today());
}

/**
 * Retourne le libellé complet de la section prud'homale
 */
function libelleSection(code) {
  const sections = {
    'industrie': 'Section Industrie',
    'commerce': 'Section Commerce',
    'agriculture': 'Section Agriculture',
    'activites_diverses': 'Section Activités diverses',
    'encadrement': 'Section Encadrement',
    'encadrement_cadres': 'Section Encadrement et Cadres'
  };
  return sections[code] || (code ? code.charAt(0).toUpperCase() + code.slice(1) : '');
}

/**
 * Génère le prochain numéro de document : DOC-{TYPE}-{YYYY}-{seq}
 */
async function genererNumeroDocument(societeId, typeDocument) {
  const year = new Date().getFullYear();
  const abrev = {
    conclusions: 'CONC',
    requete_cph: 'REQ',
    courrier_client: 'CC',
    courrier_confrere: 'CCF',
    bordereau_pieces: 'BP',
    convention_honoraires: 'CH',
    demande_renvoi: 'DR',
    note_audience: 'NA',
    mise_en_demeure: 'MED',
    attestation: 'ATT'
  }[typeDocument] || 'DOC';
  const prefix = `${abrev}-${year}-`;
  const { data } = await admin().from('avocat_documents_generes')
    .select('numero')
    .eq('societe_id', societeId)
    .like('numero', `${prefix}%`)
    .order('numero', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const last = data[0].numero;
    const lastSeq = parseInt(last.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(4, '0');
}

// =========================================================
// SECTION 1 — ENTÊTE CABINET
// =========================================================

/**
 * POST /entete — Sauvegarder ou mettre à jour l'entête du cabinet
 */
router.post('/entete', requireAvocat, async (req, res) => {
  try {
    const {
      nom_cabinet, nom_avocat, titre, toque, barreau,
      adresse, cp, ville, telephone, fax, email,
      siret, rcs, carpa, tva_intracom,
      logo_url, mentions_specifiques
    } = req.body || {};

    if (!nom_avocat) return res.status(400).json({ error: 'nom_avocat est requis' });

    const payload = {
      societe_id: req.societeId,
      nom_cabinet: nom_cabinet || null,
      nom_avocat,
      titre: titre || 'Maître',
      toque: toque || null,
      barreau: barreau || null,
      adresse: adresse || null,
      cp: cp || null,
      ville: ville || null,
      telephone: telephone || null,
      fax: fax || null,
      email: email || null,
      siret: siret || null,
      rcs: rcs || null,
      carpa: carpa || null,
      tva_intracom: tva_intracom || null,
      logo_url: logo_url || null,
      mentions_specifiques: mentions_specifiques || null,
      updated_at: new Date().toISOString()
    };

    // Essayer Supabase, fallback fichier local
    let result = payload;
    try {
      const { data: existing } = await admin().from('avocat_entetes')
        .select('id').eq('societe_id', req.societeId).single();
      if (existing) {
        const { data, error } = await admin().from('avocat_entetes')
          .update(payload).eq('id', existing.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await admin().from('avocat_entetes')
          .insert({ ...payload, created_at: new Date().toISOString() }).select().single();
        if (error) throw error;
        result = data;
      }
    } catch (dbErr) {
      // Table n'existe pas encore — fallback fichier local
      console.warn('[documents/entete] DB fallback local:', dbErr.message);
      payload.id = genId();
      payload.created_at = new Date().toISOString();
      writeEnteteLocal(req.societeId, payload);
      result = payload;
    }

    return res.status(200).json({
      entete: result,
      message: 'Entête du cabinet enregistrée avec succès.'
    });
  } catch (err) {
    console.error('[documents/entete/post]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /entete — Récupérer l'entête du cabinet
 */
router.get('/entete', requireAvocat, async (req, res) => {
  try {
    let entete = null;
    try {
      const { data, error } = await admin().from('avocat_entetes')
        .select('*').eq('societe_id', req.societeId).single();
      if (!error) entete = data;
    } catch {}
    // Fallback fichier local
    if (!entete) entete = readEnteteLocal(req.societeId);

    return res.json({ entete: entete || null });
  } catch (err) {
    console.error('[documents/entete/get]', err.message)
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 2 — GÉNÉRATION DE DOCUMENTS
// =========================================================

/**
 * Charge les données contextuelles d'un dossier
 */
async function chargerContexteDossier(dossierId, societeId) {
  const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
    .select('*')
    .eq('id', dossierId)
    .eq('avocat_societe_id', societeId)
    .single();
  if (dErr || !dossier) return null;

  // Client
  let client = null;
  if (dossier.client_id) {
    const { data: c } = await admin().from('avocat_clients')
      .select('*')
      .eq('id', dossier.client_id)
      .single();
    client = c;
  }

  // Pièces
  const { data: pieces } = await admin().from('avocat_pieces')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('numero_piece', { ascending: true });

  return { dossier, client, pieces: pieces || [] };
}

/**
 * Construit le bloc HTML d'entête de document (style A4 premium)
 */
function buildEnteteHtml(entete, dossier, client, options) {
  const nomCabinet = entete ? (entete.nom_cabinet || '') : '';
  const nomAvocat = entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : '';
  const barreau = entete ? (entete.barreau ? `Barreau de ${entete.barreau}` : '') : '';
  const adresseLigne = entete
    ? [entete.adresse, [entete.cp, entete.ville].filter(Boolean).join(' ')].filter(Boolean).join('<br>')
    : '';
  const tel = entete && entete.telephone ? `Tél. : ${entete.telephone}` : '';
  const faxLigne = entete && entete.fax ? `Fax : ${entete.fax}` : '';
  const emailLigne = entete && entete.email ? `Courriel : ${entete.email}` : '';
  const rg = dossier && dossier.numero_rg ? `R.G. n° ${dossier.numero_rg}` : '';
  const juridiction = dossier && dossier.juridiction ? dossier.juridiction : '';
  const section = dossier && dossier.section ? libelleSection(dossier.section) : '';

  const logoHtml = entete && entete.logo_url
    ? `<img src="${entete.logo_url}" alt="Logo cabinet" style="max-height:60px;max-width:180px;object-fit:contain;">`
    : '';

  return `
    <div class="entete-cabinet">
      <div class="entete-gauche">
        ${logoHtml}
        <div class="nom-cabinet">${nomCabinet}</div>
        <div class="nom-avocat">${nomAvocat}</div>
        ${barreau ? `<div class="barreau">${barreau}</div>` : ''}
        ${adresseLigne ? `<div class="adresse">${adresseLigne}</div>` : ''}
        <div class="contacts">
          ${[tel, faxLigne, emailLigne].filter(Boolean).join('<br>')}
        </div>
        ${entete && entete.carpa ? `<div class="carpa">CARPA : ${entete.carpa}</div>` : ''}
        ${entete && entete.siret ? `<div class="siret">SIRET : ${entete.siret}</div>` : ''}
      </div>
      <div class="entete-droite">
        ${juridiction ? `<div class="juridiction">${juridiction}</div>` : ''}
        ${section ? `<div class="section">${section}</div>` : ''}
        ${rg ? `<div class="rg">${rg}</div>` : ''}
        <div class="date-doc">Le ${todayFormate()}</div>
      </div>
    </div>
    <hr class="separateur-entete">
  `;
}

/**
 * Construit le pied de page HTML (mentions légales)
 */
function buildPiedDePageHtml(entete) {
  const pieces = [];
  if (entete) {
    if (entete.nom_cabinet) pieces.push(entete.nom_cabinet);
    if (entete.siret) pieces.push(`SIRET ${entete.siret}`);
    if (entete.rcs) pieces.push(`RCS ${entete.rcs}`);
    if (entete.tva_intracom) pieces.push(`TVA intracommunautaire : ${entete.tva_intracom}`);
    if (entete.carpa) pieces.push(`Tiers-payant CARPA : ${entete.carpa}`);
    if (entete.mentions_specifiques) pieces.push(entete.mentions_specifiques);
  }
  return `
    <div class="pied-de-page">
      ${pieces.length > 0 ? `<p>${pieces.join(' — ')}</p>` : ''}
      <p>Soumis aux règles déontologiques du Barreau et à la loi n° 71-1130 du 31 décembre 1971 portant réforme de certaines professions judiciaires et juridiques.</p>
    </div>
  `;
}

/**
 * Styles CSS communs pour tous les documents A4
 */
const CSS_A4 = `
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm 20mm 25mm 25mm;
      position: relative;
      page-break-after: always;
    }
    .entete-cabinet {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8mm;
      gap: 10mm;
    }
    .entete-gauche { flex: 1; }
    .entete-droite {
      flex: 0 0 60mm;
      text-align: right;
      font-size: 10pt;
    }
    .nom-cabinet {
      font-size: 14pt;
      font-weight: bold;
      letter-spacing: 0.5px;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }
    .nom-avocat {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 1mm;
    }
    .barreau { font-size: 10pt; color: #555; margin-bottom: 2mm; }
    .adresse { font-size: 10pt; margin-bottom: 2mm; }
    .contacts { font-size: 10pt; color: #333; margin-bottom: 1mm; }
    .siret, .carpa { font-size: 9pt; color: #666; }
    .juridiction { font-weight: bold; font-size: 11pt; margin-bottom: 1mm; }
    .section { font-size: 10pt; margin-bottom: 1mm; }
    .rg { font-size: 10pt; font-weight: bold; color: #333; margin-bottom: 2mm; }
    .date-doc { font-size: 10pt; color: #555; }
    .separateur-entete {
      border: none;
      border-top: 2px solid #1a1a1a;
      margin-bottom: 8mm;
    }
    h1.titre-document {
      font-size: 16pt;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 6mm;
      font-weight: bold;
    }
    h2.sous-titre {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 6mm;
      margin-bottom: 3mm;
      border-bottom: 1px solid #333;
      padding-bottom: 1mm;
    }
    h3.inter-titre {
      font-size: 11pt;
      font-weight: bold;
      margin-top: 4mm;
      margin-bottom: 2mm;
    }
    p { margin-bottom: 3mm; text-align: justify; }
    .parties-bloc {
      background: #f8f8f8;
      border: 1px solid #ddd;
      padding: 5mm 8mm;
      margin-bottom: 6mm;
      font-size: 10.5pt;
    }
    .partie-label {
      font-weight: bold;
      font-size: 10pt;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 1mm;
    }
    .par-ces-motifs {
      margin-top: 8mm;
      border-top: 2px solid #1a1a1a;
      padding-top: 4mm;
    }
    .plaise-formule {
      font-style: italic;
      font-size: 11pt;
      text-align: center;
      margin-bottom: 4mm;
    }
    .demandes-liste { list-style: none; padding-left: 0; }
    .demandes-liste li {
      padding: 1.5mm 0 1.5mm 6mm;
      border-left: 3px solid #1a1a1a;
      margin-bottom: 2mm;
      font-size: 11pt;
    }
    .bordereau-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4mm;
      font-size: 10pt;
    }
    .bordereau-table th {
      background: #1a1a1a;
      color: #fff;
      padding: 2mm 3mm;
      text-align: left;
      font-size: 10pt;
    }
    .bordereau-table td {
      padding: 2mm 3mm;
      border-bottom: 1px solid #ddd;
      vertical-align: top;
    }
    .bordereau-table tr:nth-child(even) td { background: #f9f9f9; }
    .pied-de-page {
      position: absolute;
      bottom: 10mm;
      left: 25mm;
      right: 20mm;
      border-top: 1px solid #ccc;
      padding-top: 2mm;
      font-size: 8pt;
      color: #777;
      text-align: center;
    }
    .signature-bloc {
      margin-top: 12mm;
      text-align: right;
    }
    .alerte { color: #c0392b; font-weight: bold; }
    .note-bas { font-size: 9pt; color: #555; font-style: italic; margin-top: 6mm; }
    .article-numero { font-weight: bold; margin-top: 4mm; }
    .convocation-ref {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 3mm 5mm;
      margin-bottom: 5mm;
      font-size: 10.5pt;
    }
  </style>
`;

// =====================================================
// TEMPLATES DE DOCUMENTS
// =====================================================

function templateConclusions(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || 'M./Mme [NOM DU SALARIÉ]');
  const nomEmployeur = dossier.nom_employeur || '[NOM DE L\'EMPLOYEUR]';
  const juridiction = dossier.juridiction || 'Conseil de prud\'hommes';
  const section = dossier.section ? libelleSection(dossier.section) : '[SECTION]';
  const rg = dossier.numero_rg || '[N° RG À COMPLÉTER]';
  const qualite = dossier.qualite_client || 'demandeur';
  const demandeurLabel = qualite === 'demandeur' ? nomClient : nomEmployeur;
  const defendeurLabel = qualite === 'demandeur' ? nomEmployeur : nomClient;

  const listePieces = pieces.length > 0
    ? pieces.map(p => `<li>${p.numero_piece ? `Pièce n° ${p.numero_piece} :` : '—'} ${p.titre || p.description || 'Pièce sans titre'}</li>`).join('\n')
    : '<li>[Aucune pièce communiquée à ce stade]</li>';

  const opts = options || {};
  const rappelFaits = opts.rappel_faits || '[Insérer ici le rappel détaillé des faits et de la procédure]';
  const discussion = opts.discussion || '[Insérer ici la discussion juridique : fondements, jurisprudences, calculs]';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Conclusions — ${nomClient} c/ ${nomEmployeur}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Conclusions en défense</h1>
    ${rg.includes('À COMPLÉTER') ? '<p class="alerte">⚠ Numéro RG non renseigné — veuillez compléter avant dépôt.</p>' : ''}

    <div class="parties-bloc">
      <div class="partie-label">Pour :</div>
      <div><strong>${demandeurLabel}</strong>${client && client.adresse ? `<br>${client.adresse}` : ''}</div>
      <div style="margin-top:3mm;"><span class="partie-label">Contre :</span></div>
      <div><strong>${defendeurLabel}</strong>${dossier.adresse_employeur ? `<br>${dossier.adresse_employeur}` : ''}</div>
    </div>

    <p><em>Devant le ${juridiction}, ${section}</em></p>
    <p><em>Audience du ${opts.date_audience ? formatDate(opts.date_audience) : '[DATE AUDIENCE]'}</em></p>

    <h2 class="sous-titre">I. Rappel des faits et de la procédure</h2>
    <p>${rappelFaits}</p>

    <h2 class="sous-titre">II. Discussion</h2>
    <p>${discussion}</p>

    <h2 class="sous-titre">III. Sur les pièces communiquées</h2>
    <p>Sont versées aux débats les pièces suivantes :</p>
    <ul>${listePieces}</ul>

    <div class="par-ces-motifs">
      <h2 class="sous-titre" style="border:none;margin-bottom:4mm;">Par ces motifs</h2>
      <p class="plaise-formule">Plaise au ${juridiction} de :</p>
      <ul class="demandes-liste">
        ${(opts.demandes || []).map(d => `<li>${d}</li>`).join('\n') || '<li>[Insérer les demandes]</li>'}
        <li>Condamner la partie adverse aux entiers dépens.</li>
      </ul>
    </div>

    <div class="signature-bloc">
      <p>Fait à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}</p>
      <br>
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'L\'Avocat soussigné'}</p>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateRequeteCph(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || 'M./Mme [NOM DU SALARIÉ]');
  const nomEmployeur = dossier.nom_employeur || '[NOM DE L\'EMPLOYEUR]';
  const juridiction = dossier.juridiction || 'Conseil de prud\'hommes de [VILLE]';
  const section = dossier.section ? libelleSection(dossier.section) : '[SECTION]';
  const opts = options || {};

  const listePieces = pieces.length > 0
    ? pieces.map(p => `<tr><td>${p.numero_piece || '—'}</td><td>${p.titre || p.description || 'Sans titre'}</td><td>${formatDateCourt(p.created_at)}</td></tr>`).join('\n')
    : '<tr><td colspan="3">[Aucune pièce jointe]</td></tr>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Requête introductive — ${nomClient}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Requête introductive d'instance</h1>
    <p style="text-align:center;"><em>Devant le ${juridiction}<br>${section}</em></p>

    <h2 class="sous-titre">Identification des parties</h2>
    <div class="parties-bloc">
      <div class="partie-label">Requérant(e) :</div>
      <p>
        <strong>${nomClient}</strong><br>
        ${client ? [client.adresse, [client.cp, client.ville].filter(Boolean).join(' ')].filter(Boolean).join('<br>') : '[Adresse du salarié]'}<br>
        ${client && client.telephone ? `Tél. : ${client.telephone}<br>` : ''}
        ${client && client.email ? `Courriel : ${client.email}` : ''}
      </p>
      <div class="partie-label" style="margin-top:3mm;">Défendeur(esse) :</div>
      <p>
        <strong>${nomEmployeur}</strong><br>
        ${dossier.adresse_employeur || '[Adresse de l\'employeur]'}<br>
        ${dossier.siret_employeur ? `SIRET : ${dossier.siret_employeur}` : ''}
      </p>
    </div>

    <h2 class="sous-titre">Exposé des faits et moyens</h2>
    <p>${opts.expose_faits || '[Insérer l\'exposé détaillé des faits, de la relation de travail et des griefs]'}</p>

    ${dossier.ccn ? `<h3 class="inter-titre">Convention collective applicable</h3><p>${dossier.ccn}</p>` : ''}
    ${dossier.date_entree ? `<p><strong>Date d'entrée dans l'entreprise :</strong> ${formatDate(dossier.date_entree)}</p>` : ''}
    ${dossier.date_sortie ? `<p><strong>Date de sortie :</strong> ${formatDate(dossier.date_sortie)}</p>` : ''}

    <h2 class="sous-titre">Demandes</h2>
    <p>Le(la) requérant(e) sollicite qu'il plaise au ${juridiction} de :</p>
    <ul class="demandes-liste">
      ${(opts.demandes || []).map(d => `<li>${d}</li>`).join('\n') || '<li>[Insérer les demandes chiffrées]</li>'}
    </ul>

    <h2 class="sous-titre">Bordereau de pièces jointes</h2>
    <table class="bordereau-table">
      <thead>
        <tr><th>N°</th><th>Désignation</th><th>Date</th></tr>
      </thead>
      <tbody>
        ${listePieces}
      </tbody>
    </table>

    <div class="signature-bloc">
      <p>Fait à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}</p>
      <br>
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'Le conseil du requérant'}</p>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateCourrierClient(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.civilite ? client.civilite + ' ' : ''}${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || 'Madame, Monsieur');
  const adresseClient = client
    ? [client.adresse, [client.cp, client.ville].filter(Boolean).join(' ')].filter(Boolean).join('\n')
    : '';
  const opts = options || {};

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Courrier client — ${nomClient}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <div style="margin-bottom:8mm;">
      <p>${nomClient}</p>
      ${adresseClient ? adresseClient.split('\n').map(l => `<p>${l}</p>`).join('') : ''}
    </div>

    <p style="margin-bottom:6mm;"><strong>Objet :</strong> ${opts.objet || `Votre dossier — ${dossier.titre || dossier.reference || '[Référence dossier]'}`}</p>
    ${dossier.numero_rg ? `<p style="margin-bottom:6mm;"><strong>Réf. :</strong> ${dossier.numero_rg}</p>` : ''}

    <p>${opts.formule_appel || `Madame, Monsieur,`}</p>
    <br>
    <p>${opts.corps || '[Insérer le corps du courrier]'}</p>
    <br>
    <p>${opts.formule_politesse || 'Je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées.'}</p>

    <div class="signature-bloc">
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'L\'Avocat soussigné'}</p>
      ${entete && entete.barreau ? `<p>Barreau de ${entete.barreau}</p>` : ''}
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateCourrierConfrere(entete, dossier, client, pieces, options) {
  const nomEmployeur = dossier.nom_employeur || '[EMPLOYEUR]';
  const opts = options || {};
  const destinataire = opts.destinataire || 'Maître [NOM DU CONFRÈRE]';
  const adresseConfrere = opts.adresse_confrere || '[Adresse du cabinet adverse]';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Courrier confrère — ${opts.objet || dossier.titre || ''}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <div style="margin-bottom:8mm;">
      <p>${destinataire}</p>
      ${adresseConfrere.split('\n').map(l => `<p>${l}</p>`).join('')}
    </div>

    <p style="margin-bottom:3mm;"><strong>Objet :</strong> ${opts.objet || `[Objet du courrier] — Dossier ${dossier.titre || dossier.reference || ''}`}</p>
    ${dossier.numero_rg ? `<p style="margin-bottom:3mm;"><strong>Réf. adverse :</strong> ${opts.ref_adverse || '[Réf. de votre dossier]'}</p>` : ''}
    ${dossier.numero_rg ? `<p style="margin-bottom:6mm;"><strong>R.G. :</strong> ${dossier.numero_rg}</p>` : ''}

    <p>Cher Confrère,</p>
    <br>
    <p>${opts.corps || '[Insérer le corps du courrier contradictoire]'}</p>
    <br>
    <p>En vous souhaitant bonne réception, je vous adresse, Cher Confrère, mes cordiales salutations.</p>

    <div class="signature-bloc">
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'L\'Avocat soussigné'}</p>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateBordereauPieces(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || '[SALARIÉ]');
  const nomEmployeur = dossier.nom_employeur || '[EMPLOYEUR]';
  const opts = options || {};

  const lignesPieces = pieces.length > 0
    ? pieces.map((p, i) => `
      <tr>
        <td style="text-align:center;">${p.numero_piece || (i + 1)}</td>
        <td>${p.titre || p.description || 'Pièce sans titre'}</td>
        <td>${formatDateCourt(p.date_piece || p.created_at)}</td>
        <td>${p.nature || '—'}</td>
      </tr>`)
      .join('\n')
    : '<tr><td colspan="4" style="text-align:center;color:#999;">[Aucune pièce enregistrée]</td></tr>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bordereau de pièces — ${nomClient} c/ ${nomEmployeur}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Bordereau de communication de pièces</h1>
    <p style="text-align:center;"><em>${nomClient} contre ${nomEmployeur}</em></p>
    ${dossier.numero_rg ? `<p style="text-align:center;"><strong>R.G. n° ${dossier.numero_rg}</strong></p>` : ''}
    <br>
    <p>Au soutien de ses prétentions, la partie concluante communique les pièces suivantes :</p>

    <table class="bordereau-table" style="margin-top:5mm;">
      <thead>
        <tr>
          <th style="width:12%;">N° Pièce</th>
          <th style="width:50%;">Désignation</th>
          <th style="width:18%;">Date</th>
          <th style="width:20%;">Nature</th>
        </tr>
      </thead>
      <tbody>
        ${lignesPieces}
      </tbody>
    </table>

    <p class="note-bas">
      Total : ${pieces.length} pièce${pieces.length !== 1 ? 's' : ''} communiquée${pieces.length !== 1 ? 's' : ''}
    </p>

    <div class="signature-bloc">
      <p>Fait à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}</p>
      <br>
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'L\'Avocat soussigné'}</p>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateConventionHonoraires(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.civilite ? client.civilite + ' ' : ''}${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || '[NOM DU CLIENT]');
  const nomAvocat = entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'Maître [NOM]';
  const barreau = entete && entete.barreau ? `du Barreau de ${entete.barreau}` : '';
  const opts = options || {};
  const tauxHoraire = opts.taux_horaire || dossier.taux_horaire_defaut || '[TAUX HORAIRE]';
  const provision = opts.provision || '[PROVISION]';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Convention d'honoraires — ${nomClient}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Convention d'honoraires</h1>
    <p style="text-align:center;font-size:10pt;color:#555;margin-bottom:6mm;">
      Conformément aux articles L. 444-1 et suivants du Code de commerce et au décret tarifaire
    </p>

    <p>Entre les soussignés :</p>
    <div class="parties-bloc">
      <p><strong>${nomAvocat}</strong>, avocat inscrit au barreau ${barreau}${entete && entete.adresse ? `, demeurant ${entete.adresse}, ${entete.cp || ''} ${entete.ville || ''}` : ''}, ci-après dénommé « l'Avocat ».</p>
      <div style="margin-top:3mm;"></div>
      <p><strong>${nomClient}</strong>${client && client.adresse ? `, demeurant ${client.adresse}, ${client.cp || ''} ${client.ville || ''}` : ''}, ci-après dénommé « le Client ».</p>
    </div>

    <p>Il a été convenu et arrêté ce qui suit :</p>

    <h2 class="sous-titre">Article 1 — Objet de la mission</h2>
    <p>L'Avocat est chargé de représenter et d'assister le Client dans le cadre du litige l'opposant à <strong>${dossier.nom_employeur || '[EMPLOYEUR]'}</strong> devant ${dossier.juridiction || 'le Conseil de prud\'hommes'}, portant sur : ${dossier.titre || opts.objet_mission || '[Objet du litige]'}.</p>

    <h2 class="sous-titre">Article 2 — Honoraires</h2>
    <p>Les honoraires de l'Avocat sont fixés selon un taux horaire de <strong>${tauxHoraire} € HT</strong> de l'heure.</p>
    <p>Une provision sur honoraires d'un montant de <strong>${provision} € TTC</strong> est versée à la signature des présentes, imputable sur les honoraires définitifs.</p>
    <p>Les honoraires pourront être complétés par un honoraire de résultat fixé d'un commun accord, le cas échéant.</p>
    <p>${opts.tva_applicable === false
      ? 'TVA non applicable — article 261-4-1° du Code général des impôts.'
      : 'Les honoraires sont soumis à la TVA au taux en vigueur (20 %).'}</p>

    <h2 class="sous-titre">Article 3 — Débours et frais</h2>
    <p>Les frais et débours engagés pour la réalisation de la mission (frais de greffe, frais de déplacement, frais d'expertise, etc.) seront facturés en sus des honoraires, sur présentation des justificatifs.</p>

    <h2 class="sous-titre">Article 4 — Règlement des honoraires</h2>
    <p>Les honoraires sont réglables à réception de chaque note d'honoraires, par virement bancaire ou chèque à l'ordre du cabinet. En cas de litige relatif aux honoraires, le Client peut saisir le Bâtonnier de l'Ordre des avocats.</p>

    <h2 class="sous-titre">Article 5 — Durée et résiliation</h2>
    <p>La présente convention prend effet à compter de sa signature et s'achève à la conclusion définitive de l'affaire. Chacune des parties peut y mettre fin à tout moment, par lettre recommandée avec accusé de réception, moyennant un préavis raisonnable, sans préjudice du règlement des honoraires et débours déjà engagés.</p>

    <h2 class="sous-titre">Article 6 — Confidentialité et déontologie</h2>
    <p>L'Avocat est soumis au secret professionnel et aux règles déontologiques de la profession d'avocat. La présente convention est soumise au droit français et aux règles du Barreau ${barreau}.</p>

    <p style="margin-top:10mm;">Fait en deux exemplaires originaux, à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}.</p>

    <div style="display:flex;justify-content:space-between;margin-top:12mm;">
      <div>
        <p><strong>Le Client</strong></p>
        <p style="font-size:9pt;color:#555;">(Signature précédée de la mention<br>« Lu et approuvé »)</p>
        <div style="height:20mm;border-bottom:1px solid #333;width:60mm;margin-top:3mm;"></div>
        <p style="margin-top:2mm;font-size:10pt;">${nomClient}</p>
      </div>
      <div>
        <p><strong>L'Avocat</strong></p>
        <p style="font-size:9pt;color:#555;">(Signature)</p>
        <div style="height:20mm;border-bottom:1px solid #333;width:60mm;margin-top:3mm;"></div>
        <p style="margin-top:2mm;font-size:10pt;">${nomAvocat}</p>
      </div>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateDemandeRenvoi(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || '[SALARIÉ]');
  const nomEmployeur = dossier.nom_employeur || '[EMPLOYEUR]';
  const juridiction = dossier.juridiction || 'le Conseil de prud\'hommes';
  const opts = options || {};

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Demande de renvoi — ${nomClient}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Demande de renvoi</h1>

    <p>À l'attention de Monsieur le Président</p>
    <p><strong>${juridiction}</strong>${dossier.section ? `<br>${libelleSection(dossier.section)}` : ''}</p>
    <br>

    <p>Monsieur le Président,</p>
    <br>
    <p>Nous avons l'honneur de vous soumettre la présente demande de renvoi dans l'affaire opposant <strong>${nomClient}</strong> à <strong>${nomEmployeur}</strong>, inscrite sous le numéro R.G. <strong>${dossier.numero_rg || '[N° RG]'}</strong>.</p>
    <br>
    <p>L'audience est actuellement fixée au <strong>${opts.date_audience_actuelle ? formatDate(opts.date_audience_actuelle) : '[DATE D\'AUDIENCE ACTUELLE]'}</strong>.</p>
    <br>
    <h2 class="sous-titre">Motif du renvoi</h2>
    <p>${opts.motif || '[Insérer le motif de la demande de renvoi : empêchement de l\'avocat, production de pièces complémentaires, accord des parties, etc.]'}</p>
    <br>
    ${opts.date_souhaitee ? `<p>Nous sollicitons un renvoi à une audience postérieure au <strong>${formatDate(opts.date_souhaitee)}</strong>.</p>` : '<p>Nous sollicitons un renvoi à la date qu\'il vous plaira de fixer.</p>'}
    <br>
    <p>Dans l'attente de votre décision, nous vous prions d'agréer, Monsieur le Président, l'assurance de notre considération respectueuse.</p>

    <div class="signature-bloc">
      <p>Fait à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}</p>
      <br>
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'L\'Avocat soussigné'}</p>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateNoteAudience(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || '[SALARIÉ]');
  const nomEmployeur = dossier.nom_employeur || '[EMPLOYEUR]';
  const opts = options || {};
  const pointsPlaider = opts.points_a_plaider || [];
  const piecesAViser = opts.pieces_a_viser || pieces.slice(0, 10);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Note d'audience — ${nomClient}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Note pour l'audience</h1>
    <p style="text-align:center;"><em>${nomClient} c/ ${nomEmployeur}</em></p>
    ${dossier.numero_rg ? `<p style="text-align:center;"><strong>R.G. n° ${dossier.numero_rg}</strong></p>` : ''}
    ${opts.date_audience ? `<p style="text-align:center;"><strong>Audience du ${formatDate(opts.date_audience)}</strong></p>` : ''}
    <br>

    <h2 class="sous-titre">Points à plaider</h2>
    ${pointsPlaider.length > 0
      ? `<ol style="padding-left:6mm;">${pointsPlaider.map(p => `<li style="margin-bottom:2mm;">${p}</li>`).join('\n')}</ol>`
      : '<p>[Lister les points essentiels à développer à l\'audience]</p>'}

    <h2 class="sous-titre">Pièces à viser</h2>
    ${piecesAViser.length > 0
      ? `<ul style="padding-left:6mm;">${piecesAViser.map(p => `<li>Pièce n° ${p.numero_piece || '?'} — ${p.titre || p.description || 'Sans titre'}</li>`).join('\n')}</ul>`
      : '<p>[Indiquer les pièces à présenter au conseil]</p>'}

    <h2 class="sous-titre">Demandes chiffrées</h2>
    <table class="bordereau-table">
      <thead>
        <tr><th>Chef de demande</th><th>Montant demandé</th><th>Base légale</th></tr>
      </thead>
      <tbody>
        ${(opts.demandes_chiffrees || []).map(d => `<tr><td>${d.chef}</td><td>${d.montant}</td><td>${d.base || '—'}</td></tr>`).join('\n') || '<tr><td colspan="3">[Renseigner les demandes chiffrées]</td></tr>'}
      </tbody>
    </table>

    <h2 class="sous-titre">Notes libres</h2>
    <p>${opts.notes_libres || '[Espace libre pour notes et rappels]'}</p>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateMiseEnDemeure(entete, dossier, client, pieces, options) {
  const nomClient = client
    ? `${client.civilite ? client.civilite + ' ' : ''}${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || '[SALARIÉ]');
  const nomEmployeur = dossier.nom_employeur || '[EMPLOYEUR]';
  const opts = options || {};
  const delai = opts.delai_jours || 15;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Mise en demeure — ${nomEmployeur}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <div style="margin-bottom:8mm;">
      <p><strong>${nomEmployeur}</strong></p>
      ${dossier.adresse_employeur ? dossier.adresse_employeur.split('\n').map(l => `<p>${l}</p>`).join('') : '<p>[Adresse de l\'employeur]</p>'}
    </div>

    <p style="margin-bottom:6mm;">
      <strong>LETTRE RECOMMANDÉE AVEC ACCUSÉ DE RÉCEPTION</strong>
    </p>

    <p><strong>Objet :</strong> Mise en demeure — ${opts.objet || dossier.titre || '[Objet]'}</p>
    <br>
    <p>Madame, Monsieur,</p>
    <br>
    <p>Je soussigné(e), ${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'avocat soussigné'}, agissant pour le compte de ${nomClient}, ai l'honneur de vous adresser la présente mise en demeure.</p>
    <br>
    <h2 class="sous-titre">Faits</h2>
    <p>${opts.faits || '[Exposer succinctement les faits et manquements reprochés]'}</p>
    <br>
    <h2 class="sous-titre">Mise en demeure</h2>
    <p>En conséquence, je vous mets en demeure de :</p>
    <ul class="demandes-liste">
      ${(opts.injonctions || []).map(i => `<li>${i}</li>`).join('\n') || '<li>[Insérer les injonctions]</li>'}
    </ul>
    <br>
    <p>Et ce, dans un délai de <strong>${delai} jours</strong> à compter de la réception de la présente.</p>
    <br>
    <p>À défaut, mon client se réserve le droit d'engager toutes procédures judiciaires utiles à la sauvegarde de ses droits, sans que la présente ne puisse être interprétée comme une renonciation.</p>
    <br>
    <p>Dans l'attente d'une régularisation de votre part, je vous adresse, Madame, Monsieur, mes salutations.</p>

    <div class="signature-bloc">
      <p>Fait à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}</p>
      <br>
      <p>${entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'L\'Avocat soussigné'}</p>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

function templateAttestation(entete, dossier, client, pieces, options) {
  const nomAvocat = entete ? `${entete.titre || 'Maître'} ${entete.nom_avocat || ''}` : 'Maître [NOM]';
  const barreau = entete && entete.barreau ? `du Barreau de ${entete.barreau}` : '';
  const opts = options || {};
  const nomClient = client
    ? `${client.prenom || ''} ${client.nom || ''}`.trim()
    : (dossier.nom_salarie || '[SALARIÉ]');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Attestation — ${nomAvocat}</title>
  ${CSS_A4}
</head>
<body>
  <div class="page">
    ${buildEnteteHtml(entete, dossier, client, options)}

    <h1 class="titre-document">Attestation de l'Avocat</h1>
    <p style="text-align:center;font-size:9pt;color:#555;margin-bottom:6mm;">
      (Article 202 du Code de procédure civile)
    </p>

    <p>Je soussigné(e), <strong>${nomAvocat}</strong>, avocat inscrit au Barreau ${barreau}${entete && entete.adresse ? `, demeurant ${entete.adresse}, ${entete.cp || ''} ${entete.ville || ''}` : ''}, certifie :</p>
    <br>
    <p>${opts.contenu || '[Insérer le contenu de l\'attestation : faits attestés, qualité en laquelle l\'attestation est délivrée, etc.]'}</p>
    <br>
    <p>La présente attestation est délivrée pour valoir ce que de droit et notamment dans le cadre de l'affaire ${dossier.titre || nomClient + ' c/ ' + (dossier.nom_employeur || '[EMPLOYEUR]')}${dossier.numero_rg ? ` (R.G. n° ${dossier.numero_rg})` : ''}.</p>
    <br>
    <p style="font-size:9pt;color:#555;font-style:italic;">Conformément à l'article 202 du Code de procédure civile, l'auteur de l'attestation a connaissance qu'une fausse attestation de sa part l'expose à des sanctions pénales.</p>

    <div class="signature-bloc">
      <p>Fait à ${entete && entete.ville ? entete.ville : '[VILLE]'}, le ${todayFormate()}</p>
      <br>
      <p><strong>${nomAvocat}</strong></p>
      ${barreau ? `<p>Avocat ${barreau}</p>` : ''}
      <div style="height:20mm;border-bottom:1px solid #333;width:60mm;margin-top:4mm;"></div>
    </div>

    ${buildPiedDePageHtml(entete)}
  </div>
</body>
</html>`;
}

/**
 * Dispatch vers le bon template selon le type de document
 */
function genererHtml(typeDocument, entete, dossier, client, pieces, options) {
  switch (typeDocument) {
    case 'conclusions':        return templateConclusions(entete, dossier, client, pieces, options);
    case 'requete_cph':        return templateRequeteCph(entete, dossier, client, pieces, options);
    case 'courrier_client':    return templateCourrierClient(entete, dossier, client, pieces, options);
    case 'courrier_confrere':  return templateCourrierConfrere(entete, dossier, client, pieces, options);
    case 'bordereau_pieces':   return templateBordereauPieces(entete, dossier, client, pieces, options);
    case 'convention_honoraires': return templateConventionHonoraires(entete, dossier, client, pieces, options);
    case 'demande_renvoi':     return templateDemandeRenvoi(entete, dossier, client, pieces, options);
    case 'note_audience':      return templateNoteAudience(entete, dossier, client, pieces, options);
    case 'mise_en_demeure':    return templateMiseEnDemeure(entete, dossier, client, pieces, options);
    case 'attestation':        return templateAttestation(entete, dossier, client, pieces, options);
    default:
      return `<html><body><p>Type de document inconnu : ${typeDocument}</p></body></html>`;
  }
}

// =========================================================
// POST /generer — Générer un document
// =========================================================
router.post('/generer', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, type_document, options } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id est requis' });
    if (!type_document) return res.status(400).json({ error: 'type_document est requis' });

    const typesValides = [
      'conclusions', 'requete_cph', 'courrier_client', 'courrier_confrere',
      'bordereau_pieces', 'convention_honoraires', 'demande_renvoi',
      'note_audience', 'mise_en_demeure', 'attestation'
    ];
    if (!typesValides.includes(type_document)) {
      return res.status(400).json({
        error: 'Type de document invalide.',
        types_valides: typesValides
      });
    }

    // 1. Charger le contexte du dossier
    const contexte = await chargerContexteDossier(dossier_id, req.societeId);
    if (!contexte) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });
    const { dossier, client, pieces } = contexte;

    // 2. Charger l'entête (DB ou fallback local)
    let entete = null;
    try {
      const { data } = await admin().from('avocat_entetes').select('*').eq('societe_id', req.societeId).single();
      entete = data;
    } catch {}
    if (!entete) entete = readEnteteLocal(req.societeId);

    // 3. Générer le HTML
    const html = genererHtml(type_document, entete || null, dossier, client, pieces, options || {});

    // 4. Numéro de document
    const numero = await genererNumeroDocument(req.societeId, type_document);

    // 5. Sauvegarder dans avocat_documents_generes
    const { data: docGenere, error: saveErr } = await admin().from('avocat_documents_generes').insert({
      id: genId(),
      societe_id: req.societeId,
      dossier_id,
      client_id: dossier.client_id || null,
      numero,
      type_document,
      options: options || {},
      html_contenu: html,
      statut: 'brouillon',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();

    if (saveErr) {
      console.error('[documents/generer] Erreur sauvegarde:', saveErr.message);
      // Retourner quand même le HTML même si la sauvegarde échoue
      return res.status(207).json({
        warning: 'Document généré mais non sauvegardé : ' + saveErr.message,
        type_document,
        html
      });
    }

    return res.status(201).json({
      document: { ...docGenere, html_contenu: undefined },
      type_document,
      numero,
      html,
      message: `Document ${numero} généré avec succès.`
    });
  } catch (err) {
    console.error('[documents/generer]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 3 — VARIABLES CONTEXTUELLES
// =========================================================

/**
 * GET /variables/:dossierId — Variables disponibles pour un dossier
 */
router.get('/variables/:dossierId', requireAvocat, async (req, res) => {
  try {
    const contexte = await chargerContexteDossier(req.params.dossierId, req.societeId);
    if (!contexte) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });
    const { dossier, client, pieces } = contexte;

    let entete = null;
    try { const { data } = await admin().from('avocat_entetes').select('*').eq('societe_id', req.societeId).single(); entete = data; } catch {}
    if (!entete) entete = readEnteteLocal(req.societeId);

    const variables = {
      cabinet: entete ? {
        nom_cabinet: entete.nom_cabinet,
        nom_avocat: `${entete.titre || 'Maître'} ${entete.nom_avocat}`,
        barreau: entete.barreau,
        adresse: entete.adresse,
        cp: entete.cp,
        ville: entete.ville,
        telephone: entete.telephone,
        fax: entete.fax,
        email: entete.email,
        siret: entete.siret,
        carpa: entete.carpa
      } : null,
      dossier: {
        id: dossier.id,
        titre: dossier.titre,
        reference: dossier.reference,
        numero_rg: dossier.numero_rg,
        juridiction: dossier.juridiction,
        section: dossier.section,
        section_libelle: libelleSection(dossier.section),
        ccn: dossier.ccn,
        nom_employeur: dossier.nom_employeur,
        adresse_employeur: dossier.adresse_employeur,
        siret_employeur: dossier.siret_employeur,
        date_entree: dossier.date_entree,
        date_sortie: dossier.date_sortie,
        motif_rupture: dossier.motif_rupture,
        statut: dossier.statut,
        taux_horaire_defaut: dossier.taux_horaire_defaut
      },
      client: client ? {
        id: client.id,
        nom: client.nom,
        prenom: client.prenom,
        nom_complet: `${client.prenom || ''} ${client.nom || ''}`.trim(),
        civilite: client.civilite,
        email: client.email,
        telephone: client.telephone,
        adresse: client.adresse,
        cp: client.cp,
        ville: client.ville
      } : null,
      pieces: pieces.map(p => ({
        id: p.id,
        numero: p.numero_piece,
        titre: p.titre,
        description: p.description,
        nature: p.nature,
        date: p.date_piece || p.created_at
      })),
      meta: {
        nb_pieces: pieces.length,
        date_aujourd_hui: today(),
        date_aujourd_hui_formate: todayFormate(),
        annee: new Date().getFullYear()
      }
    };

    return res.json(variables);
  } catch (err) {
    console.error('[documents/variables]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 4 — VÉRIFICATION ANTI-ERREUR
// =========================================================

/**
 * POST /verifier — Vérifie un document avant export
 */
router.post('/verifier', requireAvocat, async (req, res) => {
  try {
    const { document_id, dossier_id, html_contenu } = req.body || {};

    let html = html_contenu;
    let dossierId = dossier_id;

    // Charger le document si un id est fourni
    if (document_id && !html) {
      const { data: doc, error: dErr } = await admin().from('avocat_documents_generes')
        .select('html_contenu, dossier_id')
        .eq('id', document_id)
        .eq('societe_id', req.societeId)
        .single();
      if (dErr || !doc) return res.status(404).json({ error: 'Document non trouvé' });
      html = doc.html_contenu;
      dossierId = dossierId || doc.dossier_id;
    }

    if (!html && !dossierId) {
      return res.status(400).json({ error: 'document_id ou (dossier_id + html_contenu) requis' });
    }

    const alertes = [];
    const infos = [];

    // Charger le contexte du dossier si disponible
    let dossier = null;
    let pieces = [];
    if (dossierId) {
      const contexte = await chargerContexteDossier(dossierId, req.societeId);
      if (contexte) {
        dossier = contexte.dossier;
        pieces = contexte.pieces;
      }
    }

    // 1. Vérification RG absent
    if (dossier) {
      if (!dossier.numero_rg) {
        alertes.push({
          type: 'rg_absent',
          niveau: 'warning',
          message: 'Le numéro de R.G. n\'est pas renseigné sur ce dossier. Pensez à le compléter avant le dépôt.'
        });
      }
    }
    if (html && html.includes('[N° RG À COMPLÉTER]')) {
      alertes.push({
        type: 'rg_placeholder',
        niveau: 'erreur',
        message: 'Le document contient un espace réservé pour le numéro R.G. qui n\'a pas été remplacé.'
      });
    }

    // 2. Vérification juridiction incohérente
    if (dossier && html) {
      if (dossier.juridiction && !html.includes(dossier.juridiction)) {
        infos.push({
          type: 'juridiction_absente',
          niveau: 'info',
          message: `La juridiction « ${dossier.juridiction} » du dossier n'apparaît pas dans le document.`
        });
      }
    }

    // 3. Vérification pièces citées absentes
    if (html && pieces.length > 0) {
      const numerosPresents = pieces.map(p => p.numero_piece).filter(Boolean);
      // Chercher les références à des pièces dans le HTML (ex : "pièce n° 5")
      const regex = /pi[eè]ce[s]?\s+n[°o]\s*(\d+)/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const numCite = parseInt(match[1], 10);
        if (!numerosPresents.includes(numCite) && !numerosPresents.includes(String(numCite))) {
          alertes.push({
            type: 'piece_absente',
            niveau: 'warning',
            message: `La pièce n° ${numCite} est citée dans le document mais n'est pas enregistrée dans le dossier.`
          });
        }
      }
    }

    // 4. Vérification placeholders non remplacés
    const placeholders = [
      '[NOM DU SALARIÉ]', '[NOM DE L\'EMPLOYEUR]', '[SECTION]',
      '[N° RG]', '[DATE AUDIENCE]', '[VILLE]', '[Adresse', '[Insérer'
    ];
    if (html) {
      placeholders.forEach(ph => {
        if (html.includes(ph)) {
          infos.push({
            type: 'placeholder',
            niveau: 'info',
            message: `Le document contient un espace réservé non rempli : « ${ph.replace('[', '').replace(']', '')} ».`
          });
        }
      });
    }

    // 5. Vérification date incohérente (date_sortie avant date_entree)
    if (dossier && dossier.date_entree && dossier.date_sortie) {
      const entree = new Date(dossier.date_entree);
      const sortie = new Date(dossier.date_sortie);
      if (sortie < entree) {
        alertes.push({
          type: 'date_incoherente',
          niveau: 'erreur',
          message: `La date de sortie (${formatDateCourt(dossier.date_sortie)}) est antérieure à la date d'entrée (${formatDateCourt(dossier.date_entree)}).`
        });
      }
    }

    const statut = alertes.some(a => a.niveau === 'erreur') ? 'invalide'
      : alertes.length > 0 ? 'avertissements'
      : 'valide';

    return res.json({
      statut,
      alertes,
      infos,
      nb_alertes: alertes.length,
      nb_infos: infos.length,
      message: statut === 'valide'
        ? 'Aucune anomalie détectée. Le document est prêt.'
        : `${alertes.length} alerte(s) détectée(s) — veuillez les corriger avant export.`
    });
  } catch (err) {
    console.error('[documents/verifier]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 5 — LISTE DES DOCUMENTS GÉNÉRÉS
// =========================================================

/**
 * GET /generes — Liste tous les documents générés
 */
router.get('/generes', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, type_document, statut, from, to } = req.query;

    let query = admin().from('avocat_documents_generes')
      .select('id, numero, type_document, statut, dossier_id, client_id, options, created_at, updated_at')
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: false });

    if (dossier_id) query = query.eq('dossier_id', dossier_id);
    if (type_document) query = query.eq('type_document', type_document);
    if (statut) query = query.eq('statut', statut);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: documents, error } = await query;
    if (error) return res.status(500).json({ error: 'Erreur interne' });

    // Enrichir avec noms de dossiers et clients
    const dossierIds = [...new Set((documents || []).map(d => d.dossier_id).filter(Boolean))];
    const clientIds = [...new Set((documents || []).map(d => d.client_id).filter(Boolean))];

    let dossiersMap = {};
    let clientsMap = {};

    if (dossierIds.length > 0) {
      const { data: dossiers } = await admin().from('avocat_dossiers')
        .select('id, titre, reference, numero_rg')
        .in('id', dossierIds);
      (dossiers || []).forEach(d => { dossiersMap[d.id] = d; });
    }

    if (clientIds.length > 0) {
      const { data: clients } = await admin().from('avocat_clients')
        .select('id, nom, prenom')
        .in('id', clientIds);
      (clients || []).forEach(c => { clientsMap[c.id] = c; });
    }

    const result = (documents || []).map(d => ({
      ...d,
      dossier: dossiersMap[d.dossier_id] || null,
      client: clientsMap[d.client_id] || null
    }));

    return res.json(result);
  } catch (err) {
    console.error('[documents/generes/list]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * GET /generes/:id — Détail d'un document généré
 */
router.get('/generes/:id', requireAvocat, async (req, res) => {
  try {
    const { data: doc, error } = await admin().from('avocat_documents_generes')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();

    if (error || !doc) return res.status(404).json({ error: 'Document non trouvé' });

    let dossier = null;
    let client = null;

    if (doc.dossier_id) {
      const { data: d } = await admin().from('avocat_dossiers')
        .select('id, titre, reference, numero_rg, juridiction, section')
        .eq('id', doc.dossier_id)
        .single();
      dossier = d;
    }

    if (doc.client_id) {
      const { data: c } = await admin().from('avocat_clients')
        .select('id, nom, prenom, email, telephone')
        .eq('id', doc.client_id)
        .single();
      client = c;
    }

    return res.json({ ...doc, dossier, client });
  } catch (err) {
    console.error('[documents/generes/detail]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// =========================================================
// SECTION 6 — NOTES D'HONORAIRES MANUELLES
// =========================================================

/**
 * POST /honoraires/manuel — Créer une note d'honoraires manuellement
 */
router.post('/honoraires/manuel', requireAvocat, async (req, res) => {
  try {
    const {
      dossier_id, client_id, lignes,
      tva_applicable, provision_versee,
      date_echeance, notes
    } = req.body || {};

    if (!dossier_id) return res.status(400).json({ error: 'dossier_id est requis' });
    if (!lignes || !Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'lignes est requis (tableau non vide)' });
    }

    // Vérifier le dossier
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, titre, client_id, avocat_societe_id, taux_horaire_defaut')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();
    if (dErr || !dossier) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });

    // Construire les lignes avec montants calculés
    const lignesCalculees = lignes.map((l, i) => {
      const qte = parseFloat(l.quantite) || 0;
      const pu = parseFloat(l.prix_unitaire) || 0;
      return {
        type: l.type || 'honoraire',
        description: l.description || `Prestation ${i + 1}`,
        quantite: qte,
        unite: l.unite || 'forfait',
        prix_unitaire: pu,
        montant: parseFloat((qte * pu).toFixed(2))
      };
    });

    // Calculs financiers
    const lignesHonoraires = lignesCalculees.filter(l => l.type !== 'debours');
    const lignesDebours = lignesCalculees.filter(l => l.type === 'debours');

    const totalHonorairesHt = parseFloat(lignesHonoraires.reduce((s, l) => s + l.montant, 0).toFixed(2));
    const totalDebours = parseFloat(lignesDebours.reduce((s, l) => s + l.montant, 0).toFixed(2));
    const sousTotalHt = parseFloat((totalHonorairesHt + totalDebours).toFixed(2));

    const tvaTaux = tva_applicable === false ? 0 : 20;
    const tvaMontant = parseFloat((sousTotalHt * tvaTaux / 100).toFixed(2));
    const totalTtc = parseFloat((sousTotalHt + tvaMontant).toFixed(2));
    const provisionVersee = parseFloat((provision_versee || 0).toFixed(2));
    const resteAPayer = parseFloat((totalTtc - provisionVersee).toFixed(2));

    const dateEmission = today();
    const year = new Date().getFullYear();
    const prefix = `NH-${year}-`;
    const { data: lastNH } = await admin().from('avocat_honoraires')
      .select('numero')
      .eq('societe_id', req.societeId)
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(1);
    let seq = 1;
    if (lastNH && lastNH.length > 0) {
      const lastSeq = parseInt(lastNH[0].numero.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const numero = prefix + String(seq).padStart(4, '0');

    const mentionsLegales = tvaTaux === 0
      ? 'TVA non applicable, article 261-4-1° du Code général des impôts.'
      : 'TVA au taux de 20 % applicable conformément à la réglementation en vigueur.';

    // Calculer la date d'échéance par défaut (30 jours)
    let echeance = date_echeance;
    if (!echeance) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      echeance = d.toISOString().split('T')[0];
    }

    const { data: honoraire, error: hErr } = await admin().from('avocat_honoraires').insert({
      societe_id: req.societeId,
      dossier_id,
      client_id: client_id || dossier.client_id || null,
      numero,
      date_emission: dateEmission,
      date_echeance: echeance,
      lignes: lignesCalculees,
      total_honoraires_ht: totalHonorairesHt,
      total_debours: totalDebours,
      sous_total_ht: sousTotalHt,
      tva_taux: tvaTaux,
      tva_montant: tvaMontant,
      total_ttc: totalTtc,
      provision_versee: provisionVersee,
      reste_a_payer: resteAPayer,
      statut: 'brouillon',
      mentions_legales: mentionsLegales,
      notes: notes || null,
      nb_relances: 0,
      source: 'manuel'
    }).select().single();

    if (hErr) return res.status(500).json({ error: 'Erreur lors de la création : ' + hErr.message });

    return res.status(201).json({
      honoraire,
      nb_lignes: lignesCalculees.length,
      message: `Note d'honoraires ${numero} créée manuellement avec succès.`
    });
  } catch (err) {
    console.error('[documents/honoraires/manuel]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
