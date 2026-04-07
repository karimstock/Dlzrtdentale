// =============================================================
// JADOMI — Routes commandes (dentiste → prothésiste)
// =============================================================
//  - Calcul devis via JADOMI IA (tarif tout inclus)
//  - Confirmation : adresse chiffrée AES-256-GCM, QR token 48h
//  - QR scanné une seule fois (étiquette transporteur anonyme)
//  - Notation déclenche verifierUpgrade
// =============================================================

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { calculerTarifTravail, verifierUpgrade } = require('../jadomiIA');
const { chiffrer, dechiffrer } = require('../rush');

// ----- Multer STL -----
const STL_DIR = path.join(__dirname, '..', '..', 'uploads', 'stl');
try { fs.mkdirSync(STL_DIR, { recursive: true }); } catch (e) {}
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, STL_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      cb(null, 'cmd_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '_' + safe);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(stl|obj|ply|3mf|zip)$/i.test(file.originalname);
    cb(ok ? null : new Error('Format STL/OBJ/PLY/3MF/ZIP attendu'), ok);
  },
});

function generateRef() {
  return 'CMD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function createCommandesRouter(supabase) {
  const router = express.Router();

  // ---------- POST /api/commandes/calculer ----------
  // Devis JADOMI IA : tarif tout inclus
  router.post('/calculer', async (req, res) => {
    try {
      const { travaux, prothesiste_id, ville_arrivee, cp_arrivee } = req.body;
      if (!Array.isArray(travaux) || !travaux.length) {
        return res.status(400).json({ error: 'travaux[] requis' });
      }
      if (!prothesiste_id) return res.status(400).json({ error: 'prothesiste_id requis' });

      // Charge prothésiste
      const { data: proth, error: errProth } = await supabase.from('prothesistes').select('*').eq('id', prothesiste_id).maybeSingle();
      if (errProth || !proth) return res.status(404).json({ error: 'Prothésiste introuvable' });

      // Charge le détail des travaux depuis le catalogue
      const ids = travaux.map(t => parseInt(t.travail_id)).filter(Boolean);
      const { data: refs, error: errRefs } = await supabase.from('travaux_catalogue').select('*').in('id', ids);
      if (errRefs) throw errRefs;
      const refMap = {};
      (refs || []).forEach(r => { refMap[r.id] = r; });
      const details = travaux.map(t => {
        const r = refMap[parseInt(t.travail_id)];
        if (!r) return null;
        return {
          travail_id: r.id,
          nom: r.nom,
          quantite: parseInt(t.quantite) || 1,
          tarif_min: parseFloat(r.tarif_min),
          tarif_max: parseFloat(r.tarif_max),
          tarif_reference: parseFloat(r.tarif_reference),
          delai_jours_standard: r.delai_jours_standard,
          delai_jours_expert: r.delai_jours_expert,
        };
      }).filter(Boolean);

      const niveau = proth.niveau || 'standard';
      const devis = await calculerTarifTravail(
        details, niveau,
        proth.ville, proth.code_postal,
        ville_arrivee, cp_arrivee
      );

      res.json({
        success: true,
        devis: { ...devis, travaux_details: details, prothesiste_jadomi_id: proth.jadomi_id, niveau },
      });
    } catch (err) {
      console.error('[/api/commandes/calculer]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/commandes/confirmer ----------
  router.post('/confirmer', async (req, res) => {
    try {
      const {
        dentiste_id, prothesiste_id,
        travaux, devis,
        adresse_livraison, ville_livraison, cp_livraison,
      } = req.body;

      if (!prothesiste_id || !devis) return res.status(400).json({ error: 'prothesiste_id et devis requis' });

      const reference = generateRef();
      const expireAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

      const record = {
        reference,
        dentiste_id: dentiste_id || null,
        prothesiste_id,
        travaux: travaux || devis.travaux_details || [],
        tarif_travaux: devis.tarif_travaux,
        tarif_livraison: devis.tarif_livraison,
        tarif_total: devis.tarif_total_dentiste,
        commission_jadomi: devis.commission_jadomi,
        tarif_net_prothesiste: devis.tarif_net_prothesiste,
        transporteur: devis.transporteur,
        delai_jours: devis.delai_jours,
        qr_expire_at: expireAt,
        adresse_livraison_chiffree: chiffrer(adresse_livraison),
        ville_livraison: ville_livraison || null,
        cp_livraison: cp_livraison || null,
        statut: 'en_attente',
        notif_lue: false,
      };

      const { data, error } = await supabase.from('commandes').insert([record]).select();
      if (error) throw error;
      const cmd = data?.[0];
      // Ne jamais renvoyer adresse_livraison_chiffree
      if (cmd) delete cmd.adresse_livraison_chiffree;
      res.json({ success: true, commande: cmd });
    } catch (err) {
      console.error('[/api/commandes/confirmer]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/commandes/:id/upload-stl ----------
  router.post('/:id/upload-stl', upload.single('stl'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'fichier STL requis' });
      const stlUrl = '/uploads/stl/' + path.basename(req.file.path);
      const { data, error } = await supabase.from('commandes').update({
        stl_url: stlUrl, updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).select();
      if (error) throw error;
      res.json({ success: true, stl_url: stlUrl, commande: data?.[0] });
    } catch (err) {
      console.error('[/api/commandes/upload-stl]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/commandes/etiquette/:qr_token ----------
  // Révèle l'adresse UNE SEULE FOIS (puis invalide le QR)
  router.get('/etiquette/:qr_token', async (req, res) => {
    try {
      const { qr_token } = req.params;
      const { data, error } = await supabase.from('commandes').select('*').eq('qr_token', qr_token).maybeSingle();
      if (error || !data) return res.status(404).json({ error: 'QR invalide' });

      // Vérifier expiration
      if (data.qr_expire_at && new Date(data.qr_expire_at) < new Date()) {
        return res.status(410).json({ error: 'QR expiré' });
      }
      if (data.qr_scanne) {
        return res.status(410).json({ error: 'QR déjà scanné — usage unique' });
      }

      const adresse = dechiffrer(data.adresse_livraison_chiffree);

      // Marquer comme scanné
      try {
        await supabase.from('commandes').update({ qr_scanne: true, updated_at: new Date().toISOString() }).eq('id', data.id);
      } catch (e) {}

      res.json({
        success: true,
        reference: data.reference,
        adresse_livraison: adresse,
        ville_livraison: data.ville_livraison,
        cp_livraison: data.cp_livraison,
        transporteur: data.transporteur,
      });
    } catch (err) {
      console.error('[/api/commandes/etiquette]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/commandes/info-etiquette/:qr_token ----------
  // Pour l'affichage de la page étiquette HTML : ne révèle PAS l'adresse,
  // juste les méta non sensibles (référence, expiration). N'invalide pas le QR.
  router.get('/info-etiquette/:qr_token', async (req, res) => {
    try {
      const { qr_token } = req.params;
      const { data, error } = await supabase.from('commandes').select('id,reference,qr_expire_at,qr_scanne,transporteur,prothesiste_id,ville_livraison,cp_livraison').eq('qr_token', qr_token).maybeSingle();
      if (error || !data) return res.status(404).json({ error: 'QR invalide' });
      res.json({ success: true, info: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/commandes/:id/noter ----------
  router.post('/:id/noter', async (req, res) => {
    try {
      const { note, commentaire } = req.body;
      const noteInt = parseInt(note);
      if (!noteInt || noteInt < 1 || noteInt > 5) return res.status(400).json({ error: 'note 1-5 requise' });

      // 1. Mettre à jour la commande
      const { data: cmd, error: errCmd } = await supabase.from('commandes').update({
        note_dentiste: noteInt,
        commentaire_dentiste: commentaire || null,
        statut: 'note',
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).select().single();
      if (errCmd) throw errCmd;
      if (!cmd) return res.status(404).json({ error: 'commande introuvable' });

      // 2. Recalculer les stats du prothésiste
      const { data: proth } = await supabase.from('prothesistes').select('*').eq('id', cmd.prothesiste_id).maybeSingle();
      if (!proth) return res.json({ success: true, commande: cmd });

      // Charger toutes les notes existantes
      const { data: toutesNotes } = await supabase.from('commandes').select('note_dentiste').eq('prothesiste_id', cmd.prothesiste_id).not('note_dentiste', 'is', null);
      const notes = (toutesNotes || []).map(n => n.note_dentiste).filter(Boolean);
      const noteMoyenne = notes.length ? Math.round((notes.reduce((a,b)=>a+b,0) / notes.length) * 100) / 100 : 0;
      const nbAvis = notes.length;
      const nbTravaux = (proth.nombre_travaux || 0) + 1;

      // 3. Vérifier upgrade
      const niveauActuel = proth.niveau || 'standard';
      const upgrade = await verifierUpgrade(proth.jadomi_id, noteMoyenne, nbTravaux, niveauActuel);

      const update = {
        note_moyenne: noteMoyenne,
        nombre_avis: nbAvis,
        nombre_travaux: nbTravaux,
      };
      if (upgrade.upgrade) update.niveau = upgrade.nouveauNiveau;

      await supabase.from('prothesistes').update(update).eq('id', cmd.prothesiste_id);

      // 4. Si upgrade → notif + email admin
      if (upgrade.upgrade) {
        try {
          await supabase.from('notifications_upgrade').insert([{
            prothesiste_id: cmd.prothesiste_id,
            ancien_niveau: niveauActuel,
            nouveau_niveau: upgrade.nouveauNiveau,
            message: upgrade.message,
          }]);
        } catch (e) {}
        // Notifier l'admin (log seulement — SMTP optionnel)
        console.log(`[JADOMI UPGRADE] ${proth.jadomi_id || proth.pseudo_anonyme} : ${niveauActuel} → ${upgrade.nouveauNiveau} | note ${noteMoyenne} | ${nbTravaux} travaux | mail admin: karim_bahmed@yahoo.fr`);
      }

      delete cmd.adresse_livraison_chiffree;
      res.json({ success: true, commande: cmd, upgrade });
    } catch (err) {
      console.error('[/api/commandes/noter]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/commandes/dentiste ----------
  router.get('/dentiste', async (req, res) => {
    try {
      const { dentiste_id } = req.query;
      if (!dentiste_id) return res.status(400).json({ error: 'dentiste_id requis' });
      const { data, error } = await supabase.from('commandes').select('*').eq('dentiste_id', dentiste_id).order('created_at', { ascending: false });
      if (error) {
        if (/does not exist|relation/i.test(error.message || '')) return res.json({ success: true, commandes: [] });
        throw error;
      }
      const safe = (data || []).map(c => { const { adresse_livraison_chiffree, ...rest } = c; return rest; });
      res.json({ success: true, commandes: safe });
    } catch (err) {
      console.error('[/api/commandes/dentiste]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createCommandesRouter };
