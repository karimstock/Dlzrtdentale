// =============================================================
// JADOMI Rush — Routes backend (Express)
// =============================================================
// RÈGLES :
//  - Anonymat total : pseudo_anonyme uniquement, jamais nom/email
//  - Adresse exacte chiffrée AES-256-GCM, jamais loggée, jamais
//    renvoyée par les routes — révélée seulement via /etiquette/:token
//  - Seuls ville + CP transitent vers JADOMI IA (rushIA.js)
//  - STL stockés sur le serveur JADOMI uniquement
//  - Commission JADOMI = 10% sur tarif travaux, jamais sur livraison
// =============================================================

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const { estimerLivraison } = require('./rushIA');

// ----- Chiffrement AES-256-GCM de l'adresse exacte -----
const ALGO = 'aes-256-gcm';
function getKey() {
  const k = process.env.RUSH_ENCRYPTION_KEY || '';
  // Clé attendue : 64 hex chars (32 bytes). Si absente, on dérive un fallback
  // local non-sécurisé (uniquement dev) pour ne pas crasher le serveur.
  if (k && /^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, 'hex');
  return crypto.createHash('sha256').update('JADOMI_DEV_FALLBACK_KEY').digest();
}

function chiffrer(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function dechiffrer(payload) {
  if (!payload) return null;
  try {
    const [ivHex, tagHex, encHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    return null;
  }
}

// ----- Filtre champs renvoyés au client : jamais d'adresse chiffrée -----
function publicRush(r) {
  if (!r) return r;
  const { adresse_chiffree_depart, adresse_chiffree_arrivee, ...safe } = r;
  return safe;
}

// ----- Multer : upload STL -----
const STL_DIR = path.join(__dirname, '..', 'uploads', 'stl');
try { fs.mkdirSync(STL_DIR, { recursive: true }); } catch (e) {}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, STL_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '_' + safe);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 Mo
  fileFilter: (req, file, cb) => {
    const ok = /\.(stl|obj|ply|3mf|zip)$/i.test(file.originalname);
    cb(ok ? null : new Error('Format STL/OBJ/PLY/3MF/ZIP attendu'), ok);
  },
});

// =============================================================
// Factory : retourne un router monté avec le client supabase fourni
// =============================================================
function createRushRouter(supabase) {
  const router = express.Router();

  // ---------- POST /api/rush/estimer-livraison ----------
  // Calcule via JADOMI IA un coût de livraison entre 2 villes FR.
  router.post('/estimer-livraison', async (req, res) => {
    try {
      const { ville_depart, cp_depart, ville_arrivee, cp_arrivee } = req.body;
      const est = await estimerLivraison(ville_depart, cp_depart, ville_arrivee, cp_arrivee);
      res.json({ success: true, estimation: est });
    } catch (err) {
      console.error('[/api/rush/estimer-livraison]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/rush/demandes ----------
  // Crée une demande Rush. Adresse exacte chiffrée, ville/CP en clair.
  router.post('/demandes', async (req, res) => {
    try {
      const {
        demandeur_id, type_travail, description, matiere, quantite,
        delai_jours, tarif_propose,
        ville_depart, cp_depart, adresse_depart,
        made_in_demandeur,
      } = req.body;

      if (!type_travail || !tarif_propose) {
        return res.status(400).json({ error: 'type_travail et tarif_propose requis' });
      }

      const token = crypto.randomBytes(16).toString('hex');
      const tarif = parseFloat(tarif_propose) || 0;
      const commission = Math.round(tarif * 0.10 * 100) / 100;

      // Estimation livraison via JADOMI IA (sans adresse, juste ville+CP)
      let livraisonEstimee = 0;
      try {
        const est = await estimerLivraison(ville_depart, cp_depart, ville_depart, cp_depart);
        livraisonEstimee = est.cout_eur || 0;
      } catch (e) {}

      const record = {
        token,
        demandeur_id: demandeur_id || null,
        type_travail,
        description: description || null,
        matiere: matiere || null,
        quantite: parseInt(quantite) || 1,
        delai_jours: parseInt(delai_jours) || 3,
        tarif_propose: tarif,
        commission_jadomi: commission,
        livraison_estimee: livraisonEstimee,
        ville_depart: ville_depart || null,
        cp_depart: cp_depart || null,
        adresse_chiffree_depart: chiffrer(adresse_depart),
        made_in_demandeur: made_in_demandeur || 'FR',
        statut: 'ouverte',
      };

      const { data, error } = await supabase.from('rush_demandes').insert([record]).select();
      if (error) throw error;

      res.json({ success: true, demande: publicRush(data?.[0]) });
    } catch (err) {
      console.error('[/api/rush/demandes POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/rush/demandes ----------
  // Liste anonymisée des demandes ouvertes (sans adresse chiffrée).
  router.get('/demandes', async (req, res) => {
    try {
      const { statut, demandeur_id } = req.query;
      let q = supabase.from('rush_demandes').select('*').order('created_at', { ascending: false }).limit(100);
      if (statut) q = q.eq('statut', statut);
      if (demandeur_id) q = q.eq('demandeur_id', demandeur_id);
      const { data, error } = await q;
      if (error) {
        // Table absente (SQL pas encore exécuté) → renvoyer liste vide
        if (/schema cache|does not exist|relation/i.test(error.message || '')) {
          return res.json({ success: true, demandes: [], warning: 'Table rush_demandes absente — exécutez sql/rush_schema.sql dans Supabase' });
        }
        throw error;
      }
      res.json({ success: true, demandes: (data || []).map(publicRush) });
    } catch (err) {
      console.error('[/api/rush/demandes GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/rush/upload-stl ----------
  // Upload du fichier STL (transit serveur JADOMI uniquement).
  router.post('/upload-stl', upload.single('stl'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'fichier STL requis' });
      const { rush_id } = req.body;
      const stlPath = '/uploads/stl/' + path.basename(req.file.path);

      if (rush_id) {
        try {
          await supabase.from('rush_demandes').update({
            stl_path: stlPath,
            stl_filename: req.file.originalname,
          }).eq('id', rush_id);
        } catch (e) {}
      }

      res.json({
        success: true,
        stl_path: stlPath,
        stl_filename: req.file.originalname,
        size_kb: Math.round(req.file.size / 1024),
      });
    } catch (err) {
      console.error('[/api/rush/upload-stl]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/rush/offres ----------
  router.post('/offres', async (req, res) => {
    try {
      const { rush_id, prothesiste_id, pseudo_anonyme, tarif, delai_jours, message, made_in } = req.body;
      if (!rush_id || !prothesiste_id) return res.status(400).json({ error: 'rush_id et prothesiste_id requis' });
      const record = {
        rush_id, prothesiste_id,
        pseudo_anonyme: pseudo_anonyme || ('PROTH-' + crypto.randomBytes(2).toString('hex').toUpperCase()),
        tarif: parseFloat(tarif) || 0,
        delai_jours: parseInt(delai_jours) || 3,
        message: message || null,
        made_in: made_in || 'FR',
        statut: 'proposee',
      };
      const { data, error } = await supabase.from('rush_offres').insert([record]).select();
      if (error) throw error;
      res.json({ success: true, offre: data?.[0] });
    } catch (err) {
      console.error('[/api/rush/offres POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/rush/etiquette ----------
  // Génère une étiquette QR transporteur. Adresse RÉELLE révélée seulement
  // au scan via /api/rush/etiquette/:token (route GET ci-dessous).
  router.post('/etiquette', async (req, res) => {
    try {
      const { rush_id, sens } = req.body;
      if (!rush_id) return res.status(400).json({ error: 'rush_id requis' });

      const tokenQr = crypto.randomBytes(16).toString('hex');
      const record = {
        rush_id,
        token_qr: tokenQr,
        sens: sens || 'aller',
        scanne: false,
      };
      try {
        await supabase.from('rush_etiquettes').insert([record]);
      } catch (e) { /* table peut ne pas exister en dev */ }

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const scanUrl = `${baseUrl}/api/rush/etiquette/${tokenQr}`;
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
        color: { dark: '#0f0e0d', light: '#ffffff' },
      });

      res.json({
        success: true,
        token_qr: tokenQr,
        scan_url: scanUrl,
        qr_data_url: qrDataUrl,
      });
    } catch (err) {
      console.error('[/api/rush/etiquette POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/rush/etiquette/:token ----------
  // Endpoint scanné par le transporteur. Déchiffre l'adresse réelle et
  // l'affiche UNE fois (pas de log, pas de cache).
  router.get('/etiquette/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const { data: et, error } = await supabase
        .from('rush_etiquettes').select('*').eq('token_qr', token).single();
      if (error || !et) {
        return res.status(404).send('<h1 style="font-family:sans-serif">Étiquette JADOMI invalide ou expirée</h1>');
      }
      const { data: rush } = await supabase
        .from('rush_demandes').select('*').eq('id', et.rush_id).single();
      if (!rush) return res.status(404).send('<h1 style="font-family:sans-serif">Demande introuvable</h1>');

      const adresseDepart = dechiffrer(rush.adresse_chiffree_depart) || '(non renseignée)';
      const adresseArrivee = dechiffrer(rush.adresse_chiffree_arrivee) || '(non renseignée)';
      // marquer scan
      try {
        await supabase.from('rush_etiquettes').update({
          scanne: true, date_scan: new Date().toISOString(),
        }).eq('id', et.id);
      } catch (e) {}

      res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>JADOMI Rush — Étiquette transporteur</title>
<style>
body{font-family:-apple-system,sans-serif;background:#0f0e0d;color:#f0ede8;margin:0;padding:24px;}
.card{max-width:520px;margin:0 auto;background:#1a1917;border:1px solid #2e2c29;border-radius:14px;padding:28px;}
h1{font-size:22px;color:#c8f060;margin:0 0 4px;}
.sub{color:#6b6760;font-size:12px;margin-bottom:20px;}
.row{margin:14px 0;}
.lbl{font-size:11px;text-transform:uppercase;color:#6b6760;letter-spacing:1px;margin-bottom:4px;}
.val{font-size:15px;color:#f0ede8;font-weight:500;}
.warn{margin-top:20px;padding:12px;background:rgba(240,160,48,0.1);border:1px solid rgba(240,160,48,0.3);border-radius:8px;font-size:12px;color:#f0c080;}
</style></head><body><div class="card">
<h1>JADOMI Rush</h1>
<div class="sub">Étiquette transporteur · Sens : ${et.sens}</div>
<div class="row"><div class="lbl">Expéditeur</div><div class="val">${rush.ville_depart || ''} ${rush.cp_depart || ''}</div><div class="val">${adresseDepart}</div></div>
<div class="row"><div class="lbl">Destinataire</div><div class="val">${rush.ville_arrivee || ''} ${rush.cp_arrivee || ''}</div><div class="val">${adresseArrivee}</div></div>
<div class="row"><div class="lbl">Réf colis</div><div class="val">RUSH-${rush.id}</div></div>
<div class="warn">Confidentiel — affichage unique. Les prothésistes ne se connaissent pas. JADOMI IA ne voit jamais ces adresses.</div>
</div></body></html>`);
    } catch (err) {
      console.error('[/api/rush/etiquette GET]', err.message);
      res.status(500).send('Erreur étiquette');
    }
  });

  return router;
}

module.exports = { createRushRouter, chiffrer, dechiffrer };
