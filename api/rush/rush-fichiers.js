// =============================================
// JADOMI RUSH — Upload fichiers lourds (STL/photos)
// Stockage Cloudflare R2 (Europe)
// Nettoyage metadonnees + compression + chiffrement AES-256
// =============================================

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { nettoyerMetadonnees, calculerChecksum, detecterFormat, detecterMime } = require('../../services/file-cleaner');
const { uploadToR2, getPresignedUrl, downloadFromR2, deleteFromR2, isR2Available } = require('../../services/r2-storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500Mo max
  fileFilter: (req, file, cb) => {
    const ok = /\.(stl|obj|ply|3mf|dcm|jpg|jpeg|png|webp|zip)$/i.test(file.originalname);
    cb(ok ? null : new Error('Format non accepte (STL, OBJ, PLY, 3MF, DCM, JPG, PNG, WEBP, ZIP)'), ok);
  }
});

function createFichiersRouter(supabase) {
  const router = express.Router();

  // POST /api/rush/fichiers/upload — Upload fichier avec nettoyage + R2
  router.post('/upload', upload.single('fichier'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

      const { demande_id, uploaded_by } = req.body;
      if (!demande_id) return res.status(400).json({ error: 'demande_id requis' });

      const file = req.file;
      const ext = file.originalname.split('.').pop().toLowerCase();
      const typeFichier = detecterFormat(file.originalname);
      const contentType = detecterMime(file.originalname);

      // 1. Nettoyage metadonnees (EXIF, STL header, etc.)
      const bufferNettoye = nettoyerMetadonnees(file.buffer, ext);
      const checksum = calculerChecksum(bufferNettoye);
      const tailleOriginale = bufferNettoye.length;

      // 2. Upload vers Cloudflare R2 (compression + chiffrement auto)
      let nomStockage;
      let tailleStockee;

      if (isR2Available()) {
        const r2Result = await uploadToR2(bufferNettoye, {
          format: ext,
          contentType,
          demandeId: demande_id,
          compress: ['stl', 'obj', 'ply', '3mf'].includes(ext),
          encrypt: true
        });
        nomStockage = r2Result.key;
        tailleStockee = r2Result.taille_stockee;
        console.log(`[RUSH R2] Upload OK: ${nomStockage} (${Math.round(tailleOriginale/1024)}Ko → ${Math.round(tailleStockee/1024)}Ko)`);
      } else {
        // Fallback local si R2 non configure
        const fs = require('fs');
        const path = require('path');
        nomStockage = `${demande_id}/${crypto.randomUUID()}.${ext}`;
        const localDir = path.join(__dirname, '../../uploads/rush', String(demande_id));
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(localDir, nomStockage.split('/').pop()), bufferNettoye);
        tailleStockee = tailleOriginale;
        console.warn('[RUSH] R2 non configure — fallback stockage local');
      }

      // 3. Enregistrer en DB
      const { data, error } = await supabase.from('rush_fichiers').insert({
        demande_id: parseInt(demande_id),
        nom_original: file.originalname,
        nom_stockage: nomStockage,
        taille_bytes: tailleOriginale,
        format: ext,
        checksum,
        uploaded_by: uploaded_by || 'prothesiste_principal',
        type_fichier: typeFichier,
        metadata_nettoyee: true,
        chiffre: isR2Available(),
        url_expire_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      }).select().single();

      if (error) throw error;

      res.json({
        success: true,
        fichier: {
          id: data.id,
          nom_original: file.originalname,
          taille_ko: Math.round(tailleOriginale / 1024),
          taille_stockee_ko: Math.round(tailleStockee / 1024),
          format: ext,
          type: typeFichier,
          checksum,
          metadata_nettoyee: true,
          chiffre: isR2Available(),
          stockage: isR2Available() ? 'cloudflare_r2' : 'local'
        }
      });
    } catch (e) {
      console.error('[RUSH fichiers upload]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/fichiers/:demande_id — Liste fichiers d'une demande
  router.get('/:demande_id', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('rush_fichiers')
        .select('id, nom_original, taille_bytes, format, type_fichier, uploaded_by, chiffre, created_at')
        .eq('demande_id', req.params.demande_id)
        .is('supprime_at', null)
        .order('created_at');

      if (error) throw error;
      res.json({ success: true, fichiers: data || [] });
    } catch (e) {
      console.error('[RUSH fichiers GET]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/fichiers/download/:id — Lien temporaire presigne R2 (48h)
  router.get('/download/:id', async (req, res) => {
    try {
      const { data: fichier } = await supabase
        .from('rush_fichiers')
        .select('*')
        .eq('id', req.params.id)
        .is('supprime_at', null)
        .single();

      if (!fichier) return res.status(404).json({ error: 'Fichier non trouve ou expire' });

      if (isR2Available()) {
        // Lien presigne R2 (48h)
        const url = await getPresignedUrl(fichier.nom_stockage, 48 * 60 * 60);
        if (url) {
          return res.json({
            success: true,
            url,
            expire_in: 48 * 60 * 60,
            nom_original: fichier.nom_original,
            chiffre: fichier.chiffre,
            note: fichier.chiffre
              ? 'Fichier chiffre AES-256 — le dechiffrement est automatique via JADOMI'
              : null
          });
        }
      }

      // Fallback local
      const path = require('path');
      const fs = require('fs');
      const localPath = path.join(__dirname, '../../uploads/rush', fichier.nom_stockage);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, fichier.nom_original);
      }

      res.status(404).json({ error: 'Fichier non disponible' });
    } catch (e) {
      console.error('[RUSH fichier download]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/fichiers/stream/:id — Telecharger dechiffre (pour fichiers chiffres R2)
  router.get('/stream/:id', async (req, res) => {
    try {
      const { data: fichier } = await supabase
        .from('rush_fichiers')
        .select('*')
        .eq('id', req.params.id)
        .is('supprime_at', null)
        .single();

      if (!fichier) return res.status(404).json({ error: 'Fichier non trouve' });

      if (isR2Available() && fichier.chiffre) {
        // Telecharger depuis R2, dechiffrer, decompresser, streamer
        const buffer = await downloadFromR2(fichier.nom_stockage, fichier.format);
        res.setHeader('Content-Type', detecterMime(fichier.nom_original));
        res.setHeader('Content-Disposition', `attachment; filename="${fichier.nom_original}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }

      // Fallback local
      const path = require('path');
      const localPath = path.join(__dirname, '../../uploads/rush', fichier.nom_stockage);
      res.download(localPath, fichier.nom_original);
    } catch (e) {
      console.error('[RUSH fichier stream]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/rush/fichiers/:id — Marquer comme supprime + supprimer de R2
  router.delete('/:id', async (req, res) => {
    try {
      const { data: fichier } = await supabase
        .from('rush_fichiers')
        .select('nom_stockage')
        .eq('id', req.params.id)
        .single();

      if (!fichier) return res.status(404).json({ error: 'Fichier non trouve' });

      // Supprimer de R2
      if (isR2Available()) {
        try { await deleteFromR2(fichier.nom_stockage); } catch (e) {
          console.warn('[RUSH] R2 delete warn:', e.message);
        }
      }

      // Marquer supprime en DB
      await supabase.from('rush_fichiers')
        .update({ supprime_at: new Date().toISOString() })
        .eq('id', req.params.id);

      res.json({ success: true });
    } catch (e) {
      console.error('[RUSH fichier delete]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/fichiers/status/r2 — Verifier config R2
  router.get('/status/r2', (req, res) => {
    res.json({
      success: true,
      r2_available: isR2Available(),
      bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'jadomi-rush-fichiers',
      fallback: isR2Available() ? null : 'local_disk'
    });
  });

  return router;
}

module.exports = { createFichiersRouter };
